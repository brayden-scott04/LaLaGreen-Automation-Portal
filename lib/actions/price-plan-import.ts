"use server";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import * as XLSX from "xlsx";
import { getSession } from "@/lib/session";

async function requireStaff() {
  const session = await getSession();
  if (!session) return { error: "Unauthorized" as const };
  return { error: null };
}

// Deliberately does not include "asin" — a sheet with both ASIN and SKU columns should always
// lock onto the real SKU column. ASIN-only sheets (no match here at all) fall through to the
// AI detector below, which is trusted to use ASIN as the identifier only when no SKU column exists.
const SKU_HINTS = ["sku", "item number", "item #", "item no", "product code", "product id"];
const TARGET_PRICE_HINTS = ["target price", "target", "new price", "desired price", "goal price"];
const PRICE_FALLBACK_HINTS = ["price"];
const STEP_HINTS = ["step", "increment", "step size", "step amount", "increase amount", "decrease amount"];

function normalizeHeader(cell: unknown): string {
  return String(cell ?? "").trim().toLowerCase();
}

function findColumn(row: unknown[], hints: string[], exclude: number[] = []): number {
  let col = -1;
  row.forEach((cell, i) => {
    if (exclude.includes(i)) return;
    const h = normalizeHeader(cell);
    if (col === -1 && hints.some((hint) => h.includes(hint))) col = i;
  });
  return col;
}

function parseAmount(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const cleaned = raw.replace(/[^0-9.-]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

interface ColumnMapping {
  headerRowIndex: number;
  skuCol: number;
  targetCol: number | null;
  stepCol: number | null;
}

function detectColumnHeuristically(matrix: unknown[][]): ColumnMapping | null {
  const maxScan = Math.min(matrix.length, 15);
  for (let r = 0; r < maxScan; r++) {
    const row = matrix[r] ?? [];
    const skuCol = findColumn(row, SKU_HINTS);
    if (skuCol !== -1) {
      const targetCol = detectTargetColumnHeuristically(row, skuCol);
      const stepCol = findColumn(row, STEP_HINTS, [skuCol, targetCol].filter((c): c is number => c !== null));
      return { headerRowIndex: r, skuCol, targetCol, stepCol: stepCol === -1 ? null : stepCol };
    }
  }
  return null;
}

/** Scans the same header row already found for the SKU column for a target-price header, skipping the SKU column itself. */
function detectTargetColumnHeuristically(headerRow: unknown[], skuCol: number): number | null {
  let targetCol = -1;
  headerRow.forEach((cell, i) => {
    if (i === skuCol) return;
    const h = normalizeHeader(cell);
    if (targetCol === -1 && TARGET_PRICE_HINTS.some((hint) => h.includes(hint))) targetCol = i;
  });
  if (targetCol !== -1) return targetCol;

  headerRow.forEach((cell, i) => {
    if (i === skuCol) return;
    const h = normalizeHeader(cell);
    if (targetCol === -1 && PRICE_FALLBACK_HINTS.some((hint) => h.includes(hint))) targetCol = i;
  });
  return targetCol === -1 ? null : targetCol;
}

const ColumnDetectSchema = z.object({
  sheets: z.array(
    z.object({
      sheetName: z.string(),
      headerRowIndex: z.number().nullable(),
      skuColumnIndex: z.number().nullable(),
      targetPriceColumnIndex: z.number().nullable(),
      stepColumnIndex: z.number().nullable(),
    })
  ),
});

/** Structure-only detection — Claude never sees or reproduces the actual SKU/price values, just which columns hold them. */
async function detectColumnWithAi(
  sheets: { sheetName: string; matrix: unknown[][] }[]
): Promise<Record<string, ColumnMapping> | null> {
  const anthropic = new Anthropic();
  const preview = sheets
    .map(({ sheetName, matrix }) => {
      const rows = matrix
        .slice(0, 20)
        .map((row, i) => `[row ${i}] ${(row ?? []).map((c) => String(c ?? "")).join(" | ")}`);
      return `--- Sheet: ${sheetName} ---\n${rows.join("\n")}`;
    })
    .join("\n\n");

  let response;
  try {
    response = await anthropic.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: zodOutputFormat(ColumnDetectSchema) },
      messages: [
        {
          role: "user",
          content: `Identify the table structure in each sheet below (0-based row/column indices). Do NOT extract or reproduce any data values — only identify structure.

A SKU is a short product/item identifier code (letters, numbers, dashes/underscores) — not a description, note, or free-text field. If a sheet has both an ASIN column and a separate SKU column, skuColumnIndex must be the SKU column — ASIN is only a valid identifier when no dedicated SKU column exists. A target price column holds the price each SKU should be moved toward (may be labeled "Target Price", "New Price", "Goal Price", or similar — plain "Price" only if nothing more specific exists). A step/increment column holds the $ amount the price should move by each day (may be labeled "Step", "Increment", "Step Size", or similar) — null if no such column exists.

For each sheet return:
- headerRowIndex: the row index containing column headers (null if none)
- skuColumnIndex: the column index holding product/item SKUs (null if no such column exists in this sheet)
- targetPriceColumnIndex: the column index holding the target/new price for each SKU (null if no such column exists)
- stepColumnIndex: the column index holding the per-day step/increment amount for each SKU (null if no such column exists)

${preview}`,
        },
      ],
    });
  } catch {
    return null;
  }

  const parsed = response.parsed_output;
  if (!parsed) return null;

  const result: Record<string, ColumnMapping> = {};
  for (const s of parsed.sheets) {
    if (s.headerRowIndex === null || s.skuColumnIndex === null) continue;
    result[s.sheetName] = {
      headerRowIndex: s.headerRowIndex,
      skuCol: s.skuColumnIndex,
      targetCol: s.targetPriceColumnIndex,
      stepCol: s.stepColumnIndex,
    };
  }
  return Object.keys(result).length > 0 ? result : null;
}

export interface DetectedPriceImportSheet {
  sheetName: string;
  skuColumnLabel: string;
  targetColumnLabel: string | null;
  stepColumnLabel: string | null;
  source: "heuristic" | "ai";
  rowsFound: number;
}

interface ImportedRow {
  targetPrice: number | null;
  step: number | null;
}

function extractRowsFromSheet(opts: {
  sheetName: string;
  matrix: unknown[][];
  mapping: ColumnMapping;
  source: "heuristic" | "ai";
  rowsBySku: Map<string, ImportedRow>;
  detected: DetectedPriceImportSheet[];
  warnings: string[];
}) {
  const { sheetName, matrix, mapping, source, rowsBySku, detected, warnings } = opts;
  const { headerRowIndex, skuCol, targetCol, stepCol } = mapping;
  const headerRow = matrix[headerRowIndex] ?? [];

  let rowsFound = 0;
  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row) continue;
    const raw = row[skuCol];
    if (raw === null || raw === undefined) continue;
    const sku = String(raw).trim();
    if (!sku) continue;

    const targetPrice = targetCol !== null ? parseAmount(row[targetCol]) : null;
    const step = stepCol !== null ? parseAmount(row[stepCol]) : null;
    if (rowsBySku.has(sku)) {
      warnings.push(`Duplicate SKU "${sku}" found — using the last occurrence in the file.`);
    }
    rowsBySku.set(sku, { targetPrice, step });
    rowsFound++;
  }

  detected.push({
    sheetName,
    skuColumnLabel: String(headerRow[skuCol] ?? `column ${skuCol}`),
    targetColumnLabel: targetCol !== null ? String(headerRow[targetCol] ?? `column ${targetCol}`) : null,
    stepColumnLabel: stepCol !== null ? String(headerRow[stepCol] ?? `column ${stepCol}`) : null,
    source,
    rowsFound,
  });
}

export async function analyzeBulkPriceImport(formData: FormData): Promise<{
  data: {
    rows: { sku: string; targetPrice: number | null; step: number | null }[];
    detected: DetectedPriceImportSheet[];
    warnings: string[];
  } | null;
  error: string | null;
}> {
  const { error } = await requireStaff();
  if (error) return { data: null, error };

  const file = formData.get("file");
  if (!(file instanceof File)) return { data: null, error: "No file provided" };
  if (file.size > 2_000_000) return { data: null, error: "File too large (max 2MB)" };

  let workbook: XLSX.WorkBook;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return { data: null, error: "Couldn't read this file — make sure it's a valid Excel spreadsheet" };
  }

  const warnings: string[] = [];
  const rowsBySku = new Map<string, ImportedRow>();
  const detected: DetectedPriceImportSheet[] = [];
  const sheetsNeedingFullAi: { sheetName: string; matrix: unknown[][] }[] = [];
  const sheetsNeedingGapFill: { sheetName: string; matrix: unknown[][]; heuristicMapping: ColumnMapping }[] = [];

  for (const sheetName of workbook.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: true,
      defval: null,
    }) as unknown[][];
    if (matrix.length === 0) continue;

    const mapping = detectColumnHeuristically(matrix);
    if (!mapping) {
      sheetsNeedingFullAi.push({ sheetName, matrix });
      continue;
    }
    // SKU is trustworthy, but the target price and/or step columns weren't recognized by the hint
    // lists — give AI a shot at those specific columns instead of leaving them blank/defaulted.
    if (mapping.targetCol === null || mapping.stepCol === null) {
      sheetsNeedingGapFill.push({ sheetName, matrix, heuristicMapping: mapping });
      continue;
    }
    extractRowsFromSheet({ sheetName, matrix, mapping, source: "heuristic", rowsBySku, detected, warnings });
  }

  const sheetsNeedingAi = [
    ...sheetsNeedingFullAi,
    ...sheetsNeedingGapFill.map(({ sheetName, matrix }) => ({ sheetName, matrix })),
  ];

  if (sheetsNeedingAi.length > 0) {
    const columnMap = await detectColumnWithAi(sheetsNeedingAi);

    for (const { sheetName, matrix } of sheetsNeedingFullAi) {
      const mapping = columnMap?.[sheetName];
      if (!mapping) {
        warnings.push(`${sheetName}: couldn't identify a SKU column — sheet skipped.`);
        continue;
      }
      extractRowsFromSheet({ sheetName, matrix, mapping, source: "ai", rowsBySku, detected, warnings });
    }

    for (const { sheetName, matrix, heuristicMapping } of sheetsNeedingGapFill) {
      const aiMapping = columnMap?.[sheetName];
      let targetCol = heuristicMapping.targetCol;
      let stepCol = heuristicMapping.stepCol;
      let filledByAi = false;

      // Only trust AI's column indices if it identified the same header row the heuristic did —
      // otherwise the column indices aren't aligned to the rows we're about to extract.
      if (aiMapping && aiMapping.headerRowIndex === heuristicMapping.headerRowIndex) {
        if (targetCol === null && aiMapping.targetCol !== null) {
          targetCol = aiMapping.targetCol;
          filledByAi = true;
        }
        if (stepCol === null && aiMapping.stepCol !== null) {
          stepCol = aiMapping.stepCol;
          filledByAi = true;
        }
      }

      const mapping: ColumnMapping = { ...heuristicMapping, targetCol, stepCol };
      extractRowsFromSheet({
        sheetName,
        matrix,
        mapping,
        source: filledByAi ? "ai" : "heuristic",
        rowsBySku,
        detected,
        warnings,
      });
    }
  }

  if (detected.length === 0) {
    return { data: null, error: "Couldn't find any recognizable SKU column in this file" };
  }

  const rows = [...rowsBySku].map(([sku, { targetPrice, step }]) => ({ sku, targetPrice, step }));
  return { data: { rows, detected, warnings }, error: null };
}
