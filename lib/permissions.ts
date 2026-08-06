import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import {
  type Role,
  type Section,
  type PermissionSet,
  EMPTY_PERMISSIONS,
  toPermissionSet,
  isAllowed,
} from "@/lib/roles";
import { projects } from "@/lib/projects";
import { tools } from "@/lib/tools";
import { configurationItems } from "@/lib/configuration";
import { communicationItems } from "@/lib/communications";

/** Every known item id per section — the universe an admin can grant from. */
export const ALL_ITEM_IDS: Record<Section, string[]> = {
  automations: projects.map((p) => p.id),
  tools: tools.map((t) => t.id),
  configuration: configurationItems.map((c) => c.id),
  communications: communicationItems.map((c) => c.id),
};

/**
 * Strips any ids that don't correspond to a real item, so a stale or forged
 * grant can never widen access. Used when saving and when reading permissions.
 */
export function sanitizePermissions(input: unknown): PermissionSet {
  const parsed = toPermissionSet(input);
  return {
    automations: parsed.automations.filter((id) => ALL_ITEM_IDS.automations.includes(id)),
    tools: parsed.tools.filter((id) => ALL_ITEM_IDS.tools.includes(id)),
    configuration: parsed.configuration.filter((id) =>
      ALL_ITEM_IDS.configuration.includes(id)
    ),
    communications: parsed.communications.filter((id) =>
      ALL_ITEM_IDS.communications.includes(id)
    ),
  };
}

/**
 * Reads the current session's role and access grants fresh from the DB (never
 * from the JWT), so an admin's grant/revoke takes effect immediately. Admins
 * report every known item id (implicit full access). Returns empty permissions
 * for a missing session so callers can gate safely.
 */
export async function getMyPermissions(): Promise<{
  role: Role;
  permissions: PermissionSet;
}> {
  const session = await getSession();
  if (!session) return { role: "user", permissions: EMPTY_PERMISSIONS };

  if (session.role === "admin") {
    return { role: "admin", permissions: { ...ALL_ITEM_IDS } };
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("staff")
    .select("permissions")
    .eq("username", session.username)
    .single();

  return { role: session.role, permissions: sanitizePermissions(data?.permissions) };
}

/**
 * Server guard for an item page/route. Redirects to /dashboard when the current
 * user lacks access — this is the real gate against direct URLs, independent of
 * whether the sidebar link is hidden.
 */
export async function assertItemAccess(section: Section, id: string): Promise<void> {
  const { role, permissions } = await getMyPermissions();
  if (!isAllowed(role, permissions, section, id)) {
    redirect("/dashboard");
  }
}
