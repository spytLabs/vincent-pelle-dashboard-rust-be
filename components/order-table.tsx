"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Order } from "@/lib/google-sheets";
import { Button } from "./ui/button";
import {
  Check,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Filter,
  X,
} from "lucide-react";
import { Checkbox } from "radix-ui";

type SortKey = "id" | "dateCreated" | "status" | "district";
type SortDirection = "asc" | "desc";

const SRI_LANKA_DISTRICTS = [
  "Ampara",
  "Anuradhapura",
  "Badulla",
  "Batticaloa",
  "Colombo",
  "Galle",
  "Gampaha",
  "Hambantota",
  "Jaffna",
  "Kalutara",
  "Kandy",
  "Kegalle",
  "Kilinochchi",
  "Kurunegala",
  "Mannar",
  "Matale",
  "Matara",
  "Monaragala",
  "Mullaitivu",
  "Nuwara Eliya",
  "Polonnaruwa",
  "Puttalam",
  "Ratnapura",
  "Trincomalee",
  "Vavuniya",
];

function SortIcon({
  columnKey,
  sortKey,
  sortDirection,
}: {
  columnKey: SortKey;
  sortKey: SortKey;
  sortDirection: SortDirection;
}) {
  if (columnKey !== sortKey)
    return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-40" />;
  return sortDirection === "asc" ? (
    <ArrowUp className="h-3.5 w-3.5 ml-1" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5 ml-1" />
  );
}

function parseDate(dateStr: string): number {
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

export function OrderTable({ orders }: { orders: Order[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("dateCreated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Filter state
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterDistrict, setFilterDistrict] = useState<string>("");
  const [filterSearch, setFilterSearch] = useState<string>("");
  const [showFiltered, setShowFiltered] = useState(false);

  // Selection state
  const [selectedMain, setSelectedMain] = useState<Set<string>>(new Set());
  const [selectedFiltered, setSelectedFiltered] = useState<Set<string>>(new Set());

  const toggleMainRow = (id: string) => {
    setSelectedMain(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleFilteredRow = (id: string) => {
    setSelectedFiltered(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Derive unique statuses from data
  const uniqueStatuses = useMemo(() => {
    const statuses = new Set(orders.map((o) => o.status).filter(Boolean));
    return Array.from(statuses).sort();
  }, [orders]);

  const hasActiveFilters =
    filterStatus !== "" || filterDistrict !== "" || filterSearch !== "";

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection(key === "dateCreated" ? "desc" : "asc");
    }
  };

  const clearFilters = () => {
    setFilterStatus("");
    setFilterDistrict("");
    setFilterSearch("");
    setShowFiltered(false);
  };

  // Apply sorting
  const sortOrders = (list: Order[]) => {
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "id":
          cmp = Number(a.id || 0) - Number(b.id || 0);
          break;
        case "dateCreated":
          cmp = parseDate(a.dateCreated) - parseDate(b.dateCreated);
          break;
        case "status":
          cmp = (a.status || "").localeCompare(b.status || "");
          break;
        case "district":
          cmp = (a.district || "").localeCompare(b.district || "");
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
  };

  const sortedOrders = useMemo(
    () => sortOrders(orders),
    [orders, sortKey, sortDirection],
  );

  const filteredOrders = useMemo(() => {
    let result = orders;
    if (filterStatus) {
      result = result.filter(
        (o) => o.status?.toLowerCase() === filterStatus.toLowerCase(),
      );
    }
    if (filterDistrict) {
      result = result.filter(
        (o) => o.district?.toLowerCase() === filterDistrict.toLowerCase(),
      );
    }
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      result = result.filter(
        (o) =>
          o.id?.toLowerCase().includes(q) ||
          o.customerName?.toLowerCase().includes(q) ||
          o.email?.toLowerCase().includes(q),
      );
    }
    return sortOrders(result);
  }, [
    orders,
    filterStatus,
    filterDistrict,
    filterSearch,
    sortKey,
    sortDirection,
  ]);

  if (!orders || orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground bg-card border rounded-xl shadow-sm">
        <p className="text-lg font-medium">No orders found</p>
        <p className="text-sm">
          There are no orders to display or fetching has failed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Menu */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by ID, name, or email..."
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring w-56"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">All Statuses</option>
          {uniqueStatuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filterDistrict}
          onChange={(e) => setFilterDistrict(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">All Districts</option>
          {SRI_LANKA_DISTRICTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        {hasActiveFilters && (
          <>
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowFiltered(true)}
              className="cursor-pointer"
            >
              Show Filtered ({filteredOrders.length})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="cursor-pointer text-muted-foreground"
            >
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          </>
        )}
      </div>

      {/* Filtered Results Temp Table */}
      {showFiltered && hasActiveFilters && (
        <div className="rounded-xl border-2 border-primary/30 bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between bg-primary/5 px-4 py-2 border-b">
            <span className="text-sm font-semibold">
              Filtered Results — {filteredOrders.length} order
              {filteredOrders.length !== 1 ? "s" : ""}
              {filterStatus && (
                <Badge variant="secondary" className="ml-2 capitalize">
                  {filterStatus}
                </Badge>
              )}
              {filterDistrict && (
                <Badge variant="secondary" className="ml-2">
                  {filterDistrict}
                </Badge>
              )}
              {filterSearch && (
                <Badge variant="outline" className="ml-2">
                  &quot;{filterSearch}&quot;
                </Badge>
              )}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFiltered(false)}
              className="cursor-pointer h-7"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          {filteredOrders.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No orders match the current filters.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-center font-semibold  pl-4">
                    <Checkbox.Root
                      checked={filteredOrders.length > 0 && filteredOrders.every(o => selectedFiltered.has(o.id))}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedFiltered(new Set(filteredOrders.map(o => o.id)));
                        } else {
                          setSelectedFiltered(new Set());
                        }
                      }}
                      className="flex h-4 w-4 items-center justify-center rounded border border-primary shadow-sm cursor-pointer data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                    >
                      <Checkbox.Indicator>
                        <Check className="h-3 w-3" />
                      </Checkbox.Indicator>
                    </Checkbox.Root>
                  </TableHead>
                  <TableHead className="w-[100px] font-semibold text-center">
                    Order ID
                  </TableHead>
                  <TableHead className="w-50 font-semibold">Date</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Customer</TableHead>
                  <TableHead className="font-semibold">District</TableHead>
                  <TableHead className="font-semibold">Items</TableHead>
                  <TableHead className="text-center font-semibold">
                    Total
                  </TableHead>
                  <TableHead className="text-center font-semibold"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order, i) => (
                  <TableRow
                    key={order.id || i}
                    className="hover:bg-primary/5 transition-colors"
                  >
                    <TableCell className="w-4 pl-4">
                      <Checkbox.Root
                        checked={selectedFiltered.has(order.id)}
                        onCheckedChange={() => toggleFilteredRow(order.id)}
                        className="flex h-4 w-4 items-center justify-center rounded border border-primary shadow-sm cursor-pointer data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                      >
                        <Checkbox.Indicator>
                          <Check className="h-3 w-3" />
                        </Checkbox.Indicator>
                      </Checkbox.Root>
                    </TableCell>
                    <TableCell className="font-medium text-foreground text-center">
                      #{order.id}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {order.dateCreated}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          order.status?.toLowerCase() === "completed"
                            ? "default"
                            : order.status?.toLowerCase() === "processing"
                              ? "secondary"
                              : "outline"
                        }
                        className="capitalize font-medium"
                      >
                        {order.status || "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {order.customerName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {order.email}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{order.district}</TableCell>
                    <TableCell
                      className="max-w-[250px] truncate text-muted-foreground"
                      title={order.itemsSummary}
                    >
                      {order.itemsSummary.split("|").map((item, idx) => (
                        <div key={idx}>{item}</div>
                      ))}
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      {order.total}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="max-w-35 cursor-pointer"
                      >
                        Send to Koombiyo
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* Main Orders Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="text-center font-semibold  pl-4">
                <Checkbox.Root
                  checked={sortedOrders.length > 0 && sortedOrders.every(o => selectedMain.has(o.id))}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedMain(new Set(sortedOrders.map(o => o.id)));
                    } else {
                      setSelectedMain(new Set());
                    }
                  }}
                  className="flex h-4 w-4 items-center justify-center rounded border border-primary shadow-sm cursor-pointer data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                >
                  <Checkbox.Indicator>
                    <Check className="h-3 w-3" />
                  </Checkbox.Indicator>
                </Checkbox.Root>
              </TableHead>
              <TableHead className="w-[100px] font-semibold text-center">
                <button
                  onClick={() => handleSort("id")}
                  className="inline-flex items-center cursor-pointer hover:text-foreground transition-colors"
                >
                  Order ID{" "}
                  <SortIcon
                    columnKey="id"
                    sortKey={sortKey}
                    sortDirection={sortDirection}
                  />
                </button>
              </TableHead>
              <TableHead className="w-50 font-semibold">
                <button
                  onClick={() => handleSort("dateCreated")}
                  className="inline-flex items-center cursor-pointer hover:text-foreground transition-colors"
                >
                  Date{" "}
                  <SortIcon
                    columnKey="dateCreated"
                    sortKey={sortKey}
                    sortDirection={sortDirection}
                  />
                </button>
              </TableHead>
              <TableHead className="font-semibold">
                <button
                  onClick={() => handleSort("status")}
                  className="inline-flex items-center cursor-pointer hover:text-foreground transition-colors"
                >
                  Status{" "}
                  <SortIcon
                    columnKey="status"
                    sortKey={sortKey}
                    sortDirection={sortDirection}
                  />
                </button>
              </TableHead>
              <TableHead className="font-semibold">Customer</TableHead>
              <TableHead className="font-semibold">
                <button
                  onClick={() => handleSort("district")}
                  className="inline-flex items-center cursor-pointer hover:text-foreground transition-colors"
                >
                  District{" "}
                  <SortIcon
                    columnKey="district"
                    sortKey={sortKey}
                    sortDirection={sortDirection}
                  />
                </button>
              </TableHead>
              <TableHead className="font-semibold">Items</TableHead>
              <TableHead className="text-center font-semibold">Total</TableHead>
              <TableHead className="text-center font-semibold"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedOrders.map((order, i) => (
              <TableRow
                key={order.id || i}
                className="hover:bg-muted/30 transition-colors"
              >
                <TableCell className="w-4 pl-4">
                  <Checkbox.Root
                    checked={selectedMain.has(order.id)}
                    onCheckedChange={() => toggleMainRow(order.id)}
                    className="flex h-4 w-4 items-center justify-center rounded border border-primary shadow-sm cursor-pointer data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                  >
                    <Checkbox.Indicator>
                      <Check className="h-3 w-3" />
                    </Checkbox.Indicator>
                  </Checkbox.Root>
                </TableCell>
                <TableCell className="font-medium text-foreground text-center">
                  #{order.id}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {order.dateCreated}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      order.status?.toLowerCase() === "completed"
                        ? "default"
                        : order.status?.toLowerCase() === "processing"
                          ? "secondary"
                          : "outline"
                    }
                    className="capitalize font-medium"
                  >
                    {order.status || "Pending"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{order.customerName}</span>
                    <span className="text-xs text-muted-foreground">
                      {order.email}
                    </span>
                  </div>
                </TableCell>
                <TableCell>{order.district}</TableCell>
                <TableCell
                  className="max-w-[250px] truncate text-muted-foreground"
                  title={order.itemsSummary}
                >
                  {order.itemsSummary.split("|").map((item, idx) => (
                    <div key={idx}>{item}</div>
                  ))}
                </TableCell>
                <TableCell className="text-center font-medium">
                  {order.total}
                </TableCell>
                <TableCell>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="max-w-35 cursor-pointer"
                  >
                    Send to Koombiyo
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
