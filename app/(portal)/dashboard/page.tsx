import Link from "next/link";
import { ppcTopUp, projects } from "@/lib/projects";
import { tools } from "@/lib/tools";
import { configurationItems } from "@/lib/configuration";
import { communicationItems } from "@/lib/communications";
import { getSession } from "@/lib/session";
import { getMyPermissions } from "@/lib/permissions";
import { filterItems, isAllowed } from "@/lib/roles";
import PpcTopUpCharts from "@/components/ppc-top-up-chart";

export default async function DashboardPage() {
  const session = await getSession();
  const firstName = session?.username ?? "there";

  const { role, permissions } = await getMyPermissions();

  const accessGroups = [
    { label: "Automations", items: filterItems("automations", projects, role, permissions) },
    { label: "Tools", items: filterItems("tools", tools, role, permissions) },
    { label: "Configuration", items: filterItems("configuration", configurationItems, role, permissions) },
    { label: "Communications", items: filterItems("communications", communicationItems, role, permissions) },
  ].filter((group) => group.items.length > 0);

  const hasAnyAccess = accessGroups.length > 0;
  const canSeePpc = isAllowed(role, permissions, "automations", ppcTopUp.id);

  return (
    <div className="p-6 md:p-8">
      <h2 className="text-2xl font-semibold text-foreground">
        Welcome back, {firstName}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Here&apos;s what you have access to.
      </p>

      {/* Your access — shows every item across all sections the signed-in user
          may open. Admins see everything. */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Your access</h3>
          {role === "admin" && (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              Full access
            </span>
          )}
        </div>

        {hasAnyAccess ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {accessGroups
              .flatMap((g) => g.items.map((item) => ({ ...item, group: g.label.replace(/s$/, "") })))
              .map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-accent"
                  >
                    <Icon className="size-5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{item.name}</span>
                      <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                        {item.group}
                      </span>
                    </span>
                  </Link>
                );
              })}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            You don&apos;t have access to any tools yet. Ask an admin to grant you access.
          </p>
        )}
      </div>

      {canSeePpc && (
        <>
          <div className="mt-8 flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">PPC Top-Up</h3>
            <Link href={ppcTopUp.href} className="text-xs font-medium text-primary hover:underline">
              View all →
            </Link>
          </div>
          <div className="mt-3">
            <PpcTopUpCharts />
          </div>
        </>
      )}
    </div>
  );
}
