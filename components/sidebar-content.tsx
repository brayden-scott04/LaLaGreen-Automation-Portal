"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsLeft,
  ChevronsRight,
  LayoutGrid,
  Sparkles,
  Users,
  Users2,
} from "lucide-react";
import { projects } from "@/lib/projects";
import { tools } from "@/lib/tools";
import { configurationItems } from "@/lib/configuration";
import { communicationItems } from "@/lib/communications";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/user-menu";
import { Separator } from "@/components/ui/separator";
import {
  type Role,
  type PermissionSet,
  canManageUsers,
  filterItems,
} from "@/lib/roles";

export function SidebarContent({
  username,
  role,
  permissions,
  collapsed = false,
  onToggleCollapse,
}: {
  username: string;
  role: Role;
  permissions: PermissionSet;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();

  const allowedProjects = filterItems("automations", projects, role, permissions);
  const allowedTools = filterItems("tools", tools, role, permissions);
  const allowedConfiguration = filterItems(
    "configuration",
    configurationItems,
    role,
    permissions
  );
  const allowedCommunications = filterItems(
    "communications",
    communicationItems,
    role,
    permissions
  );

  return (
    <div className="flex h-full w-full flex-col">
      <div
        className={cn(
          "flex items-center gap-2 p-6",
          collapsed && "justify-center p-3"
        )}
      >
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              ShopLaLa
              <sup className="ml-0.5 text-[10px] font-normal">&reg;</sup>
            </h1>
            <p className="text-xs text-muted-foreground">Automation Portal</p>
          </div>
        )}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {collapsed ? (
              <ChevronsRight className="size-4" />
            ) : (
              <ChevronsLeft className="size-4" />
            )}
          </button>
        )}
      </div>

      <nav
        className={cn(
          "min-h-0 flex-1 space-y-1 overflow-y-auto px-3",
          collapsed && "px-2"
        )}
      >
        <Link
          href="/dashboard"
          title={collapsed ? "Dashboard" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent",
            collapsed && "justify-center px-2",
            pathname === "/dashboard" && "bg-accent text-primary"
          )}
        >
          <LayoutGrid className="size-4 shrink-0" />
          {!collapsed && "Dashboard"}
        </Link>

        <Link
          href="/chat"
          title={collapsed ? "Chat" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent",
            collapsed && "justify-center px-2",
            pathname === "/chat" && "bg-accent text-primary"
          )}
        >
          <Sparkles className="size-4 shrink-0" />
          {!collapsed && "Chat"}
        </Link>

        <Link
          href="/team"
          title={collapsed ? "Team" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent",
            collapsed && "justify-center px-2",
            pathname === "/team" && "bg-accent text-primary"
          )}
        >
          <Users2 className="size-4 shrink-0" />
          {!collapsed && "Team"}
        </Link>

        {allowedProjects.length > 0 &&
          (collapsed ? (
            <Separator className="my-2" />
          ) : (
            <p className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground">
              Automations
            </p>
          ))}

        {allowedProjects.map((project) => {
          const Icon = project.icon;
          return (
            <Link
              key={project.id}
              href={project.href}
              title={collapsed ? project.name : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent",
                collapsed && "justify-center px-2"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && (
                <span className="flex-1 truncate">{project.name}</span>
              )}
            </Link>
          );
        })}

        {allowedTools.length > 0 &&
          (collapsed ? (
            <Separator className="my-2" />
          ) : (
            <p className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground">
              Tools
            </p>
          ))}

        {allowedTools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.id}
              href={tool.href}
              title={collapsed ? tool.name : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent",
                collapsed && "justify-center px-2"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && (
                <span className="flex-1 truncate">{tool.name}</span>
              )}
            </Link>
          );
        })}

        {allowedConfiguration.length > 0 &&
          (collapsed ? (
            <Separator className="my-2" />
          ) : (
            <p className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground">
              Configuration
            </p>
          ))}

        {allowedConfiguration.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              title={collapsed ? item.name : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent",
                collapsed && "justify-center px-2"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && (
                <span className="flex-1 truncate">{item.name}</span>
              )}
            </Link>
          );
        })}

        {allowedCommunications.length > 0 &&
          (collapsed ? (
            <Separator className="my-2" />
          ) : (
            <p className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground">
              Communications
            </p>
          ))}

        {allowedCommunications.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              title={collapsed ? item.name : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent",
                collapsed && "justify-center px-2"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && (
                <span className="flex-1 truncate">{item.name}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {canManageUsers(role) && (
        <div className={cn("px-3 pb-2", collapsed && "px-2")}>
          {collapsed ? (
            <Separator className="my-2" />
          ) : (
            <p className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground">
              {role === "admin" ? "Admin" : "Moderator"}
            </p>
          )}
          <Link
            href="/admin/users"
            title={collapsed ? "Manage Users" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent",
              collapsed && "justify-center px-2",
              pathname === "/admin/users" && "bg-accent text-primary"
            )}
          >
            <Users className="size-4 shrink-0" />
            {!collapsed && <span className="flex-1 truncate">Manage Users</span>}
          </Link>
        </div>
      )}

      <div
        className={cn(
          "mt-auto shrink-0 border-t border-border p-3 pb-4",
          collapsed && "px-2"
        )}
      >
        <UserMenu username={username} collapsed={collapsed} />
      </div>
    </div>
  );
}
