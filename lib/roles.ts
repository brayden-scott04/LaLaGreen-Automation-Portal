/**
 * Single source of truth for staff roles and the per-account access model.
 *
 * There are three roles:
 *  - "admin"     — full access to everything; the only role that can promote/
 *                  demote, delete accounts, and assign per-user access. Admin
 *                  accounts can only be created/edited directly in the database.
 *  - "moderator" — can create regular users and reset their passwords, and has
 *                  whatever section access an admin granted.
 *  - "user"      — has only the section access an admin granted.
 *
 * Non-admin access is stored per-account in the `staff.permissions` jsonb column,
 * shaped as {@link PermissionSet}. Admins bypass it entirely (implicit full access).
 */

export type Role = "admin" | "moderator" | "user";

export const ROLES: Role[] = ["admin", "moderator", "user"];

/** Display labels. "Staff" is kept for the `user` role (matches the Team page). */
export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  moderator: "Moderator",
  user: "Staff",
};

/** The gated navigation sections. Keys match route prefixes and permission keys. */
export type Section = "automations" | "tools" | "configuration" | "communications";

export const SECTIONS: Section[] = [
  "automations",
  "tools",
  "configuration",
  "communications",
];

/** Per-account access grants: arrays of item slug ids per section. */
export interface PermissionSet {
  automations: string[];
  tools: string[];
  configuration: string[];
  communications: string[];
}

export const EMPTY_PERMISSIONS: PermissionSet = {
  automations: [],
  tools: [],
  configuration: [],
  communications: [],
};

/** Admins + moderators can create users and reset user passwords. */
export function canManageUsers(role: Role): boolean {
  return role !== "user";
}

/** Only admins can promote/demote, delete accounts, and assign per-user access. */
export function canAdminister(role: Role): boolean {
  return role === "admin";
}

/** Normalizes an unknown value (e.g. from a JWT claim or DB row) to a valid Role. */
export function toRole(value: unknown): Role {
  return value === "admin" || value === "moderator" ? value : "user";
}

/** Admins are always allowed; otherwise the id must be in the granted set. */
export function isAllowed(
  role: Role,
  permissions: PermissionSet,
  section: Section,
  id: string
): boolean {
  return role === "admin" || permissions[section].includes(id);
}

/** Returns the subset of `items` the given user may access (admins: all). */
export function filterItems<T extends { id: string }>(
  section: Section,
  items: T[],
  role: Role,
  permissions: PermissionSet
): T[] {
  if (role === "admin") return items;
  return items.filter((item) => permissions[section].includes(item.id));
}

/** Coerces an arbitrary value (jsonb column, form payload) into a valid PermissionSet. */
export function toPermissionSet(value: unknown): PermissionSet {
  const source = (value ?? {}) as Partial<Record<Section, unknown>>;
  const pick = (key: Section): string[] =>
    Array.isArray(source[key])
      ? (source[key] as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
  return {
    automations: pick("automations"),
    tools: pick("tools"),
    configuration: pick("configuration"),
    communications: pick("communications"),
  };
}
