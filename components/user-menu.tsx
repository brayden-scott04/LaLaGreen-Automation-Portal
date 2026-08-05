"use client";

import { useRouter } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function UserMenu({
  username,
  collapsed = false,
}: {
  username: string;
  collapsed?: boolean;
}) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title={collapsed ? username : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md p-2 text-left hover:bg-accent",
          collapsed && "justify-center"
        )}
      >
        <Avatar size="sm">
          <AvatarFallback>{username.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        {!collapsed && (
          <span className="truncate text-sm text-foreground">{username}</span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top">
        <DropdownMenuItem onClick={() => router.push("/settings")}>
          <Settings />
          Profile settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleLogout}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
