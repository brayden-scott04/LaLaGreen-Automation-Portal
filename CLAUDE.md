@AGENTS.md

# LaLaGreen Automation Portal — Developer Guide

## Project Overview

Internal automation portal for LaLaGreen. Staff log in and access automation tools — each tool has its own dedicated page with custom controls. The only shared UI is the header/sidebar.

---

## Architecture

```
automation-portal/
├── app/
│   ├── layout.tsx                          # Root layout (fonts, metadata)
│   ├── page.tsx                            # Redirects to /dashboard
│   ├── login/page.tsx                      # Login page (username + password)
│   ├── api/auth/
│   │   ├── login/route.ts                  # POST /api/auth/login
│   │   └── logout/route.ts                 # POST /api/auth/logout
│   └── (portal)/                           # All protected pages live here
│       ├── layout.tsx                      # Sidebar + topbar shell
│       ├── dashboard/page.tsx              # Project grid (auto-populated)
│       ├── team/page.tsx                   # Read-only staff directory (username + role), visible to all staff
│       ├── admin/users/page.tsx            # Create staff accounts + manage roles (admin only)
│       └── automations/
│           └── ppc-top-up/page.tsx
├── components/
│   ├── ui/                                 # Base UI (Button, Input, Card, Skeleton, etc.)
│   ├── page-header.tsx                     # Shared page header for every automation
│   ├── sidebar.tsx / sidebar-content.tsx
│   ├── topbar.tsx                          # Mobile nav
│   ├── login-form.tsx
│   └── user-menu.tsx
├── lib/
│   ├── projects.ts                         # Single source of truth for all projects
│   ├── session.ts                          # JWT sign/verify/cookie helpers
│   ├── supabase/
│   │   ├── client.ts                       # Browser Supabase client
│   │   └── server.ts                       # Server Supabase client (Next.js cookies)
│   └── actions/
│       ├── index.ts                        # Re-exports all actions
│       └── staff.ts                        # listStaff, createStaffMember, getStaffDirectory, updateStaffMember, resetPassword, deleteStaffMember, getCurrentUser
├── middleware.ts                           # Route protection
└── .env.local                              # Secrets (see Environment Variables below)
```

---

## Auth System

### How it works

- **JWT** tokens signed with `JWT_SECRET` (via `jose`), stored as an HTTP-only cookie named `portal_session`
- Cookie is valid for **7 days**, secure in production, `sameSite=lax`
- `middleware.ts` runs on every request, redirects to `/login` if no valid session
- Staff accounts are stored in the Supabase `staff` table, identified by **username** (no email); passwords are bcrypt-hashed (cost 10)
- Roles: `"admin"` or `"user"` — only admins can access `/admin/*`. There are exactly two admins today (Travis, Dobie); every other account is `"user"`
- There is no self-service signup or email/invite flow — admins create every account directly from `/admin/users`
- **Admins can only create `"user"` accounts.** Granting `"admin"` (whether creating a new account or promoting an existing one) is blocked in `createStaffMember`/`updateStaffMember` and must be done directly in the Supabase `staff` table — this is intentional, not a bug. The UI only ever offers demoting an admin to user, never the reverse

### Public routes (no auth required)

`/login`, `/api/auth/login`

### Login flow

1. User submits username + password → `POST /api/auth/login`
2. Server queries `staff` table by `username` (lowercased), verifies password with `bcryptjs`
3. On success: signs JWT with `{ username, role }`, sets `portal_session` cookie
4. Client redirects to `/dashboard`

### Adding a new staff member

Go to `/admin/users` → click **Create User** → enter a username and password. The account is created immediately as a `"user"` role — no email or confirmation step, and no way to make it an admin from the UI. Every staff member (any role) can see the full account list, read-only, at `/team`.

### Reading the session server-side

```typescript
import { getSession } from "@/lib/session";

const session = await getSession(); // { username, role } | null
```

### Environment variables

```bash
# .env.local
JWT_SECRET=<64-character hex string>
NEXT_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

#### Amazon Advertising API (Sponsored Brands Upload → "Upload to Amazon")

Direct campaign upload uses the Amazon **Advertising** API, which is separate from
the SP-API credentials (`CLIENT_ID` / `CLIENT_SECRET` / `REFRESH_TOKEN`) used for
pricing/listings. The refresh token must be granted the `advertising::campaign_management`
scope; the LWA client id/secret may be the same app as SP-API or a different one.

```bash
# .env.local — Amazon Ads API (advertising scope). Only these three are required.
ADS_CLIENT_ID=<LWA client id>
ADS_CLIENT_SECRET=<LWA client secret>
ADS_REFRESH_TOKEN=<refresh token with advertising::campaign_management scope>

# Optional — pin a specific advertising profile. Omit to auto-resolve by marketplace.
# ADS_PROFILE_ID_US=3041144588979787
# ADS_PROFILE_ID_CA=<CA advertising profile id>
```

Profile ids are resolved automatically at upload time from
`GET https://advertising-api.amazon.com/v2/profiles` (matching the campaign's
marketplace by `countryCode`, preferring a seller account) — so only the three
OAuth values above are needed. Set `ADS_PROFILE_ID_US` / `ADS_PROFILE_ID_CA` only
to override that lookup. Without the OAuth creds, "Download bulk file" still works;
"Upload to Amazon" surfaces a clear error. Client logic lives in
`lib/amazon/ads-api.ts`; the route is `app/api/tools/sponsored-brands-upload/upload/route.ts`.

---

## Database (Supabase)

Project ID: `fuynizhfhfnvbdzwihgp`

### `staff` table

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, auto-generated |
| `username` | `text` | Unique, lowercase, `^[a-z0-9_-]{3,32}$` |
| `password_hash` | `text` | bcrypt, cost 10 |
| `role` | `text` | `"admin"` or `"user"` |
| `created_at` | `timestamptz` | Auto |

### PPC ACOS Top-Up tables

Extends the PPC Top Up automation with **per-campaign** budget top-ups, separate from the
country-level daily cap schedule (`ppc_topup_countries` / `ppc_topup_schedule` above).

> **This only ever applies to campaigns that are out of budget (OOB) at that moment.** Every 10
> minutes the external n8n/Python process lists the campaigns currently OOB, and only those are
> evaluated. A campaign comfortably within budget is never touched, whatever its ACOS. These are
> not general budget schedules.

For each OOB campaign the process computes **both** ACOS figures — today's and 14-day — matches
each to a band in `ppc_acos_topup_schedule` **at the current 10-minute slot**, and, if neither cap
in `ppc_acos_topup_band_settings` **for that matched (metric, band)** would be breached (checked
against `ppc_acos_topup_log`), raises that campaign's budget by the matched `topup_amount` via the
Ads API, then writes a row to `ppc_acos_topup_log`. The two metrics are independent: one campaign
can receive a today-ACOS top-up and a 14-day-ACOS top-up in the same tick, each gated by its own
caps. This portal only owns the configuration and the audit log view; it does not call Amazon
directly for this feature.

> Caps have moved twice: flat-per-country → per-band → now **per (metric, band)**. Today's `0-10`
> band and 14-Day's `0-10` band have fully independent "max budget" and "max individual campaign
> budget" values, edited via a small settings icon in each band's column header on the Today-ACOS
> / 14-Day-ACOS schedule cards. There is no longer a standalone "ACOS Top-Up" settings card in the
> portal — the old marketplace-wide Enabled/Disabled toggle and the audit-log view were removed
> from the UI along with it (deliberate simplification, confirmed with the user; both were still
> at their defaults — `enabled=false` for every country — when removed). `ppc_acos_topup_settings`
> and `ppc_acos_topup_log` **tables still exist in the DB**, they just have no portal UI anymore.

> **Backend status (2026-07-31): wired, running in testing mode.** The external process
> (`LaLaGreen-PPC-Task`, sibling repo) now reads these tables live on every `/budget` run —
> `classify_acos_bands()` in `sp_account_budget.py` looks up `ppc_acos_topup_schedule` at the
> current 10-minute slot and caps by `(country_code, acos_metric, band_key)` in
> `ppc_acos_topup_band_settings`, so portal edits take effect on the next tick. Two caveats:
>
> - **`TESTING_MODE = True`** in `indiv_campaign_settings.py` — it computes, logs and reports the
>   full result but makes **no Amazon call**, and the Telegram report is suffixed `(Testing)`.
>   Rows written in this mode carry `is_test = true`. Going live is `TESTING_MODE = False` plus
>   `DELETE FROM ppc_acos_topup_log WHERE is_test;` so the daily caps restart from zero.
> - **`ppc_acos_topup_settings.enabled` is not consulted.** It lost its portal toggle and the
>   backend deliberately ignores it; on/off lives in `TOP_UP_INDIV_CAMPAIGN` in
>   `indiv_campaign_settings.py`. Don't reintroduce a dependency on that column without also
>   restoring a UI for it.
>
> Requires `acos_topup_migration.sql` (in the PPC-Task repo) to have been applied.

**`ppc_acos_topup_band_settings`** — one row per `(country_code, acos_metric, band_key)`, 4 rows
per (country, metric), 8 per country:

| Column | Type | Notes |
|---|---|---|
| `country_code` | `text` | Composite PK with `acos_metric`, `band_key`; matches `ppc_topup_countries.country_code` |
| `acos_metric` | `text` | `"today"` \| `"14d"` — independent caps per metric |
| `band_key` | `text` | `"0-10"` \| `"10-20"` \| `"20-30"` \| `"30-plus"` |
| `max_daily_topup_total` | `numeric` | "Max budget" — total $ across **all** campaigns in this (metric, band), this marketplace, per day |
| `max_campaign_budget` | `numeric` | "Max individual campaign budget" — highest daily budget one campaign in this (metric, band) may be raised to |
| `updated_at` | `timestamptz` | Auto |

**`ppc_acos_topup_schedule`** — the two staff-editable grids. 144 slots × 4 bands × 2 metrics =
**1152 pre-seeded rows per `country_code`**, all seeded to `0`; only `topup_amount` is editable.
Slots are the same 144 ten-minute labels as `ppc_topup_schedule` (`CANONICAL_SLOTS` in
`lib/ppc-daily-cap-constants.ts`).

| Column | Type | Notes |
|---|---|---|
| `country_code` | `text` | Composite PK with `acos_metric`, `slot_time`, `band_key` |
| `acos_metric` | `text` | `"today"` \| `"14d"` — one grid each, both active |
| `slot_time` | `text` | `"HH:MM"`, one of the 144 canonical slots |
| `band_key` | `text` | `"0-10"` \| `"10-20"` \| `"20-30"` \| `"30-plus"` |
| `topup_amount` | `numeric` | $ top-up when an OOB campaign's ACOS falls in this band at this slot |
| `updated_at` | `timestamptz` | Auto |

> 1152 rows/country exceeds PostgREST's default 1000-row cap, so `getAcosTopupConfig(countryCode)`
> fetches **per (country, metric)** — 576 rows each — and errors if a query returns anything other
> than `EXPECTED_SCHEDULE_ROWS`. A truncated grid must never render as complete: staff saving one
> would wipe the missing slots.

**`ppc_acos_topup_log`** — audit trail, written by the external process after each applied top-up,
read-only from the portal. Also the **source of truth for the `max_daily_topup_total` cap**: each
run sums today's rows per `(metric, band)` via the `acos_topup_totals_today` RPC, so a row here is
not just a record — it consumes that band's remaining daily budget. One row per
`(campaign, metric)`: a campaign topped up on both grids in the same tick writes two.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `country_code` | `text` | |
| `campaign_id` | `text` | Amazon campaign id |
| `campaign_name` | `text` | Denormalized for display |
| `acos_metric` | `text` | `"today"` or `"14d"` — which of the two grids fired |
| `acos_value` | `numeric` | ACOS at the time of the check |
| `band_key` | `text` | Which band matched |
| `slot_time` | `text` | `"HH:MM"` slot the top-up fired in; `null` for pre-schedule rows |
| `topup_amount` | `numeric` | $ applied |
| `previous_budget` | `numeric` | |
| `new_budget` | `numeric` | |
| `applied_at` | `timestamptz` | |
| `marketplace_date` | `date` | Which marketplace day the cap counts this against. Written explicitly, **not** derived from `applied_at` — the US/CA day rolls over at 15:00 SGT, so grouping on `applied_at`'s calendar date would split one day in two and reset the cap early |
| `is_test` | `bool` | `true` = simulated (`TESTING_MODE`), never sent to Amazon. Still counts toward the daily cap so the limit is exercised; purge before going live |
| `created_at` | `timestamptz` | Auto |

### Supabase clients

```typescript
// Server components / actions / API routes
import { createClient } from "@/lib/supabase/server";
const supabase = await createClient();

// Client components (browser)
import { createClient } from "@/lib/supabase/client";
const supabase = createClient();
```

---

## Server Actions

All server actions live in `lib/actions/` and follow the `{ data, error }` return shape.

```typescript
import { listStaff, createStaffMember, getCurrentUser } from "@/lib/actions/staff";

const { data, error } = await listStaff();
```

Admin-only actions (`listStaff`, `createStaffMember`, `updateStaffMember`, `resetPassword`, `deleteStaffMember`) call `requireAdmin()` internally and return `{ data: null, error: "Unauthorized" }` if the session role isn't `"admin"`. `getStaffDirectory` (backs `/team`) and `getCurrentUser` only require a valid session — any authenticated staff member, not just admins.

---

## Adding a New Project

Every project needs two things: a definition in `lib/projects.ts` and a page file.

### Step 1 — Define the project (`lib/projects.ts`)

```typescript
import { BarChart3 } from "lucide-react"; // pick any lucide icon

export const salesMetrics = defineProject({
  name: "Sales Metrics",
  description: "Real-time sales performance dashboard",
  icon: BarChart3,
});

// Add it to the projects array — this auto-updates sidebar + dashboard
export const projects: AutomationProject[] = [
  ppcAdUpdates,
  inventoryReports,
  salesMetrics, // <-- add here
];
```

The `id` and `href` are auto-derived from the name (e.g. `"Sales Metrics"` → `id: "sales-metrics"`, `href: "/automations/sales-metrics"`).

### Step 2 — Create the page

Create `app/(portal)/automations/sales-metrics/page.tsx`:

```typescript
"use client"; // only needed if the page has interactivity

import { PageHeader } from "@/components/page-header";
import { salesMetrics } from "@/lib/projects";

export default function SalesMetricsPage() {
  return (
    <>
      <PageHeader
        icon={salesMetrics.icon}
        title={salesMetrics.name}
        description={salesMetrics.description}
      />
      {/* Everything below here is completely custom — no shared layout constraints */}
      <div className="p-6 md:p-8">
        {/* your controls, tables, forms, etc. */}
      </div>
    </>
  );
}
```

That's it. The project now appears in the sidebar and dashboard automatically.

### Step 3 — Add an API route (if needed)

Create `app/api/your-route/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // your logic here
  return NextResponse.json({ data: [] });
}
```

---

## Adding a New Tool

The sidebar and dashboard also have a separate "Tools" section, below Automations, sourced from `lib/tools.ts`. It follows the exact same pattern as `lib/projects.ts`, just under a different heading and route prefix. The "Tools" heading always renders (like "Automations"), even when the `tools` array is empty.

### Step 1 — Define the tool (`lib/tools.ts`)

```typescript
import { Wrench } from "lucide-react"; // pick any lucide icon

export const labelPrinter = defineTool({
  name: "Label Printer",
  description: "Print shipping labels in bulk",
  icon: Wrench,
});

// Add it to the tools array — this auto-updates sidebar + dashboard
export const tools: AutomationTool[] = [
  labelPrinter, // <-- add here
];
```

The `id` and `href` are auto-derived from the name (e.g. `"Label Printer"` → `id: "label-printer"`, `href: "/tools/label-printer"`).

### Step 2 — Create the page

Create `app/(portal)/tools/label-printer/page.tsx` following the same `<PageHeader>` pattern as an automation page (see "Adding a New Project" above) — just import from `@/lib/tools` instead of `@/lib/projects`.

---

## Page Header Component

Every automation page uses `<PageHeader>` at the top:

```typescript
import { PageHeader } from "@/components/page-header";

<PageHeader
  icon={project.icon}               // LucideIcon component
  title={project.name}              // string
  description={project.description} // string
/>
```

Below `<PageHeader>`, each page is entirely custom — there are no shared layout constraints.

---

## Key Conventions

| Pattern | Detail |
|---|---|
| Server components | Default for pages and layouts |
| Client components | Add `"use client"` at top when using hooks/state/events |
| Server actions | `"use server"` in `lib/actions/`; return `{ data, error }` |
| Icons | Always from `lucide-react` |
| Styling | Tailwind CSS utilities; `cn()` from `@/lib/utils` to merge classes |
| Path aliases | `@/` maps to project root |
| UI primitives | `components/ui/` (Button, Input, Card, Skeleton, Badge, etc.) |

---

## Key File Reference

| File | Purpose |
|---|---|
| `lib/projects.ts` | Add/edit automation projects |
| `lib/tools.ts` | Add/edit tools (separate "Tools" nav section) |
| `lib/session.ts` | JWT sign/verify/cookie helpers |
| `lib/supabase/server.ts` | Supabase client for server-side code |
| `lib/supabase/client.ts` | Supabase client for browser code |
| `lib/actions/staff.ts` | Staff CRUD, `createStaffMember`, `getStaffDirectory`, `getCurrentUser` |
| `middleware.ts` | Route protection + role-based redirects |
| `app/(portal)/layout.tsx` | Sidebar + topbar shell |
| `app/(portal)/admin/users/page.tsx` | Create staff accounts and manage roles |
| `app/(portal)/team/page.tsx` | Read-only staff directory (visible to all staff) |
| `components/page-header.tsx` | Shared header for automation pages |
| `.env.local` | All secrets and env config |

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
