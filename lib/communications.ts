import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

export interface CommunicationItem {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  href: string;
}

interface CommunicationItemInput {
  name: string;
  description: string;
  icon: LucideIcon;
  href?: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function defineCommunicationItem(input: CommunicationItemInput): CommunicationItem {
  const id = slugify(input.name);
  return { ...input, id, href: input.href ?? `/communications/${id}` };
}

/**
 * Add a new communications item as a named `defineCommunicationItem(...)` export below,
 * then include it in the `communicationItems` array (sidebar reads from that list, so it
 * stays in sync automatically). Finally, create app/(portal)/communications/<id>/page.tsx
 * yourself, plus a layout.tsx calling assertItemAccess("communications", "<id>") — that
 * guard is what stops a direct URL visit, not the hidden sidebar link.
 */
export const companyInbox = defineCommunicationItem({
  name: "Company Inbox",
  description: "View email sent to the company address",
  icon: Inbox,
});

export const communicationItems: CommunicationItem[] = [companyInbox];
