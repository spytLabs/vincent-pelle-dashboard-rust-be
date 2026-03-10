import { getOrders } from "@/lib/google-sheets";
import { OrderTable } from "@/components/order-table";
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Home() {
  const orders = await getOrders();

  return (
    <div className="flex flex-col h-full min-h-screen bg-muted/20">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4 shadow-sm sticky top-0 z-10 w-full transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="#">
                  Dashboard
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Orders</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl w-full flex flex-col gap-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Recent Orders</h1>
            <p className="text-muted-foreground mt-1 text-sm">Review and manage your store's latest transactions.</p>
          </div>

          <OrderTable orders={orders} />
        </div>
      </main>
    </div>
  );
}
