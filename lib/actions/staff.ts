"use server";

import bcrypt from "bcryptjs";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { type Role, type PermissionSet, canManageUsers } from "@/lib/roles";
import { sanitizePermissions } from "@/lib/permissions";

const USERNAME_PATTERN = /^[a-z0-9_-]{3,32}$/;

/** Applies to self-service changes only; createStaffMember still accepts any non-empty password. */
const MIN_PASSWORD_LENGTH = 8;

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { client: null, session: null, error: "Unauthorized" as const };
  }
  const client = await createClient();
  return { client, session, error: null };
}

/** Admins and moderators may create users and reset user passwords. */
async function requireAdminOrModerator() {
  const session = await getSession();
  if (!session || !canManageUsers(session.role)) {
    return { client: null, session: null, error: "Unauthorized" as const };
  }
  const client = await createClient();
  return { client, session, error: null };
}

export async function listStaff() {
  const { client, error } = await requireAdminOrModerator();
  if (error) return { data: null, error };

  const { data, error: dbError } = await client!
    .from("staff")
    .select("id, username, role, created_at, permissions")
    .order("created_at", { ascending: true });

  return { data, error: dbError?.message ?? null };
}

export async function getStaffDirectory() {
  const session = await getSession();
  if (!session) return { data: null, error: "Unauthorized" };

  const client = await createClient();
  const { data, error: dbError } = await client
    .from("staff")
    .select("id, username, role")
    .order("role", { ascending: true })
    .order("username", { ascending: true });

  return { data, error: dbError?.message ?? null };
}

export async function getCurrentUser() {
  const session = await getSession();
  return session ? { username: session.username, role: session.role } : null;
}

export async function createStaffMember(username: string, password: string) {
  const { client, error } = await requireAdminOrModerator();
  if (error) return { data: null, error };

  const normalized = username.toLowerCase();
  if (!USERNAME_PATTERN.test(normalized)) {
    return {
      data: null,
      error: "Username must be 3-32 characters: lowercase letters, numbers, - or _",
    };
  }
  if (!password) {
    return { data: null, error: "Password is required" };
  }

  const password_hash = bcrypt.hashSync(password, 10);

  const { data, error: dbError } = await client!
    .from("staff")
    .insert({ username: normalized, password_hash, role: "user" })
    .select("id, username, role, created_at")
    .single();

  if (dbError) {
    const message = dbError.code === "23505" ? "Username already taken" : dbError.message;
    return { data: null, error: message };
  }

  return { data, error: null };
}

export async function updateStaffMember(
  id: string,
  updates: { role?: Role }
) {
  const { client, session, error } = await requireAdmin();
  if (error) return { data: null, error };

  // Admin tier is out-of-band only: admins can promote user <-> moderator, never to admin.
  if (updates.role === "admin") {
    return { data: null, error: "Admins can only be added directly in the database" };
  }

  if (updates.role !== undefined) {
    const { data: target } = await client!
      .from("staff")
      .select("username")
      .eq("id", id)
      .single();
    if (target?.username === session!.username) {
      return { data: null, error: "You cannot change your own role" };
    }
  }

  const { data, error: dbError } = await client!
    .from("staff")
    .update(updates)
    .eq("id", id)
    .select("id, username, role, created_at, permissions")
    .single();

  return { data, error: dbError?.message ?? null };
}

/** Admin-only: assign which automations/tools/configuration a user or moderator may access. */
export async function updatePermissions(id: string, permissions: PermissionSet) {
  const { client, error } = await requireAdmin();
  if (error) return { data: null, error };

  const clean = sanitizePermissions(permissions);

  const { data, error: dbError } = await client!
    .from("staff")
    .update({ permissions: clean })
    .eq("id", id)
    .select("id, username, role, created_at, permissions")
    .single();

  return { data, error: dbError?.message ?? null };
}

export async function resetPassword(id: string, newPassword: string) {
  const { client, error } = await requireAdminOrModerator();
  if (error) return { data: null, error };

  // Neither admins nor moderators may change another admin's or moderator's password
  // (those credentials are managed directly in the database). Only "user" accounts.
  const { data: target } = await client!
    .from("staff")
    .select("role")
    .eq("id", id)
    .single();
  if (!target) {
    return { data: null, error: "Staff member not found" };
  }
  if (target.role !== "user") {
    return { data: null, error: "You can only reset passwords for staff users" };
  }

  const password_hash = bcrypt.hashSync(newPassword, 10);

  const { error: dbError } = await client!
    .from("staff")
    .update({ password_hash })
    .eq("id", id);

  return { data: { ok: true }, error: dbError?.message ?? null };
}

/**
 * Self-service password change for whoever is signed in.
 *
 * Deliberately takes no id or username: the row is resolved from the session,
 * so this can never be pointed at another account however it's called. That
 * also makes it the only path by which an admin or moderator can change their
 * own password -- resetPassword() above refuses any non-"user" account.
 *
 * Overwriting password_hash is what retires the old password: a row holds one
 * hash, so once it's replaced there is nothing left for the old password to
 * compare against.
 */
export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string
) {
  const session = await getSession();
  if (!session) return { data: null, error: "Unauthorized" };

  if (!currentPassword) {
    return { data: null, error: "Current password is required" };
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      data: null,
      error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    };
  }
  if (newPassword === currentPassword) {
    return { data: null, error: "New password must be different from your current one" };
  }

  const client = await createClient();
  const { data: me } = await client
    .from("staff")
    .select("id, password_hash")
    .eq("username", session.username)
    .single();

  // Same generic message whether the account vanished or the password is
  // wrong -- neither case should tell the caller which.
  if (!me || !bcrypt.compareSync(currentPassword, me.password_hash)) {
    return { data: null, error: "Current password is incorrect" };
  }

  const { error: dbError } = await client
    .from("staff")
    .update({ password_hash: bcrypt.hashSync(newPassword, 10) })
    .eq("id", me.id);

  return { data: dbError ? null : { ok: true }, error: dbError?.message ?? null };
}

export async function deleteStaffMember(id: string) {
  const { client, session, error } = await requireAdmin();
  if (error) return { data: null, error };

  const { data: target } = await client!
    .from("staff")
    .select("username")
    .eq("id", id)
    .single();

  if (target?.username === session!.username) {
    return { data: null, error: "You cannot delete your own account" };
  }

  const { error: dbError } = await client!.from("staff").delete().eq("id", id);

  return { data: { ok: true }, error: dbError?.message ?? null };
}
