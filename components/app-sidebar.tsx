import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Package, LayoutDashboard, ShoppingCart, Users, Settings } from "lucide-react"
import Link from "next/link"
import { LogoutButton } from "@/components/logout-button"

export function AppSidebar() {
    return (
        <Sidebar>
            <SidebarHeader className="h-16 border-b flex items-center px-4">
                <div className="flex items-center gap-2 font-semibold">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <Package className="size-4" />
                    </div>
                    <span className="truncate">Vincent Pelle</span>
                </div>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Application</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem>
                                <SidebarMenuButton asChild isActive>
                                    <Link href="/">
                                        <ShoppingCart />
                                        <span>Orders</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>

                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
                <SidebarMenu>
                    <LogoutButton />
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    )
}
