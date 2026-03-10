"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton onClick={handleLogout}>
        <LogOut />
        <span>Sign Out</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
