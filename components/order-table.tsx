"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

type DetailField = {
  header: string;
  value: string;
  editable: boolean;
};

type OrderDetails = {
  id: string;
  status: string;
  fields: DetailField[];
};

type ToastItem = {
  id: number;
  message: string;
  variant: "success" | "error" | "info";
};

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

function isLockedStatus(status?: string) {
  const s = (status ?? "").toLowerCase().trim();
  return s === "sent-to-koombiyo" || s === "rejected";
}

export function OrderTable({ orders }: { orders: Order[] }) {
  const [tableOrders, setTableOrders] = useState<Order[]>(orders);
  useEffect(() => {
    setTableOrders(orders);
  }, [orders]);

  const [sortKey, setSortKey] = useState<SortKey>("dateCreated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Filter state
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterDistrict, setFilterDistrict] = useState<string>("");
  const [filterSearch, setFilterSearch] = useState<string>("");
  const [showFiltered, setShowFiltered] = useState(false);

  // Selection state
  const [selectedMain, setSelectedMain] = useState<Set<string>>(new Set());
  const [selectedFiltered, setSelectedFiltered] = useState<Set<string>>(
    new Set(),
  );

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [selectedOrderDetails, setSelectedOrderDetails] =
    useState<OrderDetails | null>(null);
  const [editableFields, setEditableFields] = useState<Record<string, string>>(
    {},
  );
  const [isEditMode, setIsEditMode] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toggleMainRow = (id: string) => {
    setSelectedMain((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFilteredRow = (id: string) => {
    setSelectedFiltered((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const uniqueStatuses = useMemo(() => {
    const statuses = new Set(tableOrders.map((o) => o.status).filter(Boolean));
    return Array.from(statuses).sort();
  }, [tableOrders]);

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
  const sortOrders = useCallback(
    (list: Order[]) => {
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
    },
    [sortKey, sortDirection],
  );

  const sortedOrders = useMemo(
    () => sortOrders(tableOrders),
    [tableOrders, sortOrders],
  );

  const filteredOrders = useMemo(() => {
    let result = tableOrders;
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
      result = result.filter((o) => {
        const id = String(o.id ?? "").toLowerCase();
        const name = String(o.customerName ?? "").toLowerCase();
        const email = String(o.email ?? "").toLowerCase();
        return id.includes(q) || name.includes(q) || email.includes(q);
      });
    }
    return sortOrders(result);
  }, [tableOrders, filterStatus, filterDistrict, filterSearch, sortOrders]);

  const [isProcessing, setIsProcessing] = useState(false);

  const getOrderId = useCallback((o: Order) => String(o.id ?? "").trim(), []);
  const getDisplayStatus = useCallback((o: Order) => o.status ?? "", []);
  const isSendable = useCallback(
    (o: Order) => {
      const id = getOrderId(o);
      if (!id) return false;
      return !isLockedStatus(getDisplayStatus(o));
    },
    [getDisplayStatus, getOrderId],
  );

  const mapDetailToOrder = (baseOrder: Order, detail: OrderDetails): Order => {
    const next = { ...baseOrder };

    for (const field of detail.fields) {
      const key = field.header.toLowerCase().trim();
      const value = field.value;

      switch (key) {
        case "order id":
        case "id":
          next.id = value;
          break;
        case "order number":
          next.orderNumber = value;
          break;
        case "status":
          next.status = value;
          break;
        case "date created":
          next.dateCreated = value;
          break;
        case "customer name":
          next.customerName = value;
          break;
        case "email":
          next.email = value;
          break;
        case "phone":
          next.phone = value;
          break;
        case "whatsapp":
          next.whatsapp = value;
          break;
        case "address line 1":
          next.addressLine1 = value;
          break;
        case "address line 2":
          next.addressLine2 = value;
          break;
        case "city":
          next.city = value;
          break;
        case "state":
          next.state = value;
          break;
        case "postcode":
          next.postcode = value;
          break;
        case "district":
          next.district = value;
          break;
        case "items summary":
          next.itemsSummary = value;
          break;
        case "shipping":
          next.shipping = value;
          break;
        case "total":
          next.total = value;
          break;
        case "customer note":
          next.customerNote = value;
          break;
        case "payment method":
          next.paymentMethod = value;
          break;
        default:
          break;
      }
    }

    return next;
  };

  const showToast = useCallback(
    (message: string, variant: ToastItem["variant"]) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((prev) => [...prev, { id, message, variant }]);

      window.setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
      }, 3500);
    },
    [],
  );

  const getWaybillFromFields = useCallback((fields: DetailField[]) => {
    const candidates = ["waybill", "waybilll_id", "waybillid"];
    for (const field of fields) {
      const key = field.header.toLowerCase().trim();
      if (candidates.includes(key)) {
        const value = String(field.value ?? "").trim();
        if (value) return value;
      }
    }
    return "";
  }, []);

  const openWaybillPdf = useCallback((waybill: string) => {
    const url = `/api/pod?waybillid=${encodeURIComponent(waybill)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const ensureWaybillForOrder = useCallback(
    async (orderId: string) => {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Failed to fetch details for order #${orderId}.`);
      }

      const detail: OrderDetails | undefined = data?.order;
      const waybill = detail?.fields ? getWaybillFromFields(detail.fields) : "";
      if (!waybill) {
        throw new Error(`Order #${orderId} does not have a waybill yet.`);
      }
      return waybill;
    },
    [getWaybillFromFields],
  );

  const generateSingleWaybillPdf = useCallback(
    async (orderId: string) => {
      try {
        const waybill = await ensureWaybillForOrder(orderId);
        openWaybillPdf(waybill);
        showToast(`Opened waybill PDF for order #${orderId}.`, "success");
      } catch (e) {
        showToast(
          e instanceof Error ? e.message : "Failed to generate waybill PDF.",
          "error",
        );
      }
    },
    [ensureWaybillForOrder, openWaybillPdf, showToast],
  );

  const generateBulkWaybillPdfs = useCallback(
    async (orderIds: string[]) => {
      if (!orderIds.length) {
        showToast("No orders selected.", "info");
        return;
      }

      const opened: string[] = [];
      const failed: string[] = [];

      for (const id of orderIds) {
        try {
          const waybill = await ensureWaybillForOrder(id);
          openWaybillPdf(waybill);
          opened.push(id);
        } catch {
          failed.push(id);
        }
      }

      if (opened.length) {
        showToast(`Opened ${opened.length} waybill PDF(s).`, "success");
      }
      if (failed.length) {
        showToast(
          `${failed.length} selected order(s) do not have waybills yet or could not be opened.`,
          "error",
        );
      }
    },
    [ensureWaybillForOrder, openWaybillPdf, showToast],
  );

  const toastFromLogLine = useCallback(
    (line: string) => {
      const normalized = line.toLowerCase();

      if (
        normalized.includes("error") ||
        line.includes("❌") ||
        line.includes("⚠️")
      ) {
        showToast(line, "error");
        return;
      }

      if (line.includes("✅") || normalized.includes("sent to koombiyo")) {
        showToast(line, "success");
        return;
      }

      showToast(line, "info");
    },
    [showToast],
  );

  const syncOrderStatus = (orderId: string, status: string) => {
    setTableOrders((prev) =>
      prev.map((order) =>
        getOrderId(order) === orderId
          ? {
              ...order,
              status,
            }
          : order,
      ),
    );

    setSelectedMain((prev) => {
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });

    setSelectedFiltered((prev) => {
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });

    setSelectedOrderDetails((prev) => {
      if (!prev || prev.id !== orderId) return prev;

      const nextFields = prev.fields.map((field) =>
        field.header.toLowerCase().trim() === "status"
          ? { ...field, value: status }
          : field,
      );

      return {
        ...prev,
        status,
        fields: nextFields,
      };
    });
  };

  const openOrderDetails = async (orderId: string) => {
    if (!orderId) return;

    setSelectedOrderId(orderId);
    setDetailsOpen(true);
    setDetailsLoading(true);
    setDetailsError("");
    setIsEditMode(false);

    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Failed to fetch order details.");
      }

      const orderDetails: OrderDetails = data?.order;
      setSelectedOrderDetails(orderDetails);

      const values: Record<string, string> = {};
      for (const field of orderDetails.fields) {
        values[field.header] = field.value;
      }
      setEditableFields(values);
    } catch (e) {
      setDetailsError(
        e instanceof Error ? e.message : "Failed to fetch order details.",
      );
      setSelectedOrderDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  };

  const saveOrderDetails = async () => {
    if (!selectedOrderDetails || !selectedOrderId) return;

    const updates: Record<string, string> = {};

    for (const field of selectedOrderDetails.fields) {
      if (!field.editable) continue;

      const nextValue = editableFields[field.header] ?? "";
      if (nextValue !== field.value) {
        updates[field.header] = nextValue;
      }
    }

    if (Object.keys(updates).length === 0) {
      setIsEditMode(false);
      return;
    }

    setDetailsSaving(true);
    setDetailsError("");

    try {
      const res = await fetch(
        `/api/orders/${encodeURIComponent(selectedOrderId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates }),
        },
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Failed to update order details.");
      }

      const updatedDetail: OrderDetails = data?.order;
      setSelectedOrderDetails(updatedDetail);

      const values: Record<string, string> = {};
      for (const field of updatedDetail.fields) {
        values[field.header] = field.value;
      }
      setEditableFields(values);
      setIsEditMode(false);

      setTableOrders((prev) =>
        prev.map((order) =>
          getOrderId(order) === selectedOrderId
            ? mapDetailToOrder(order, updatedDetail)
            : order,
        ),
      );
      showToast(`Order #${selectedOrderId} updated successfully.`, "success");
    } catch (e) {
      setDetailsError(
        e instanceof Error ? e.message : "Failed to update order details.",
      );
      showToast(
        e instanceof Error ? e.message : "Failed to update order details.",
        "error",
      );
    } finally {
      setDetailsSaving(false);
    }
  };

  const updateOrderStatus = async (
    orderId: string,
    status: "rejected" | "on-hold",
  ) => {
    setIsProcessing(true);
    try {
      const res = await fetch("/api/orders/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, status }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to update order status.");
      }

      syncOrderStatus(orderId, status);
      showToast(`Order #${orderId} status changed to ${status}.`, "success");
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Failed to update order status.",
        "error",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const processOrders = async (inputOrders: Order[]) => {
    const toSend = inputOrders.filter(isSendable);
    if (!toSend.length) {
      showToast("No eligible orders selected.", "info");
      return;
    }

    setIsProcessing(true);
    showToast(`Processing ${toSend.length} order(s)...`, "info");

    try {
      const res = await fetch("/api/koombiyo/send-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: toSend }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to send orders.");

      if (Array.isArray(data?.logs)) {
        for (const line of data.logs) {
          toastFromLogLine(String(line));
        }
      }

      if (Array.isArray(data?.updatedOrderIds)) {
        setTableOrders((prev) =>
          prev.map((order) =>
            data.updatedOrderIds.includes(getOrderId(order))
              ? {
                  ...order,
                  status: "sent-to-koombiyo",
                }
              : order,
          ),
        );

        setSelectedMain((prev) => {
          const next = new Set(prev);
          for (const id of data.updatedOrderIds) next.delete(String(id));
          return next;
        });

        setSelectedFiltered((prev) => {
          const next = new Set(prev);
          for (const id of data.updatedOrderIds) next.delete(String(id));
          return next;
        });

        if (data.updatedOrderIds.length > 0) {
          showToast(
            `Sent ${data.updatedOrderIds.length} order${
              data.updatedOrderIds.length > 1 ? "s" : ""
            } to Koombiyo.`,
            "success",
          );
        }
      }

      if (toSend.length > 1 && Array.isArray(data?.updatedOrderIds)) {
        await generateBulkWaybillPdfs(
          data.updatedOrderIds.map((id: string) => String(id)),
        );
      }
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Failed to send orders.",
        "error",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const selectableSortedOrders = useMemo(
    () => sortedOrders.filter((o) => Boolean(getOrderId(o))),
    [sortedOrders, getOrderId],
  );

  const selectableFilteredOrders = useMemo(
    () => filteredOrders.filter((o) => Boolean(getOrderId(o))),
    [filteredOrders, getOrderId],
  );

  const renderRow = (
    order: Order,
    selected: Set<string>,
    toggle: (id: string) => void,
  ) => {
    const orderId = getOrderId(order);
    const locked = !isSendable(order);
    const isRejected = getDisplayStatus(order).toLowerCase() === "rejected";
    const isSent = getDisplayStatus(order).toLowerCase() === "sent-to-koombiyo";
    const displayStatus = getDisplayStatus(order);

    return (
      <TableRow
        key={order.id || orderId}
        className="hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={() => openOrderDetails(orderId)}
      >
        <TableCell className="w-4 pl-4" onClick={(e) => e.stopPropagation()}>
          <Checkbox.Root
            checked={selected.has(orderId)}
            onCheckedChange={() => toggle(orderId)}
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
              displayStatus?.toLowerCase() === "completed"
                ? "default"
                : displayStatus?.toLowerCase() === "on-hold"
                  ? "secondary"
                  : "outline"
            }
            className="capitalize font-medium"
          >
            {displayStatus || "Pending"}
          </Badge>
        </TableCell>

        <TableCell>
          <div className="flex flex-col">
            <span className="font-medium">{order.customerName}</span>
            <span className="text-xs text-muted-foreground">{order.email}</span>
          </div>
        </TableCell>

        <TableCell>{order.district}</TableCell>

        <TableCell
          className="max-w-[250px] truncate text-muted-foreground"
          title={order.itemsSummary}
        >
          {(order.itemsSummary ?? "")
            .split("|")
            .filter(Boolean)
            .map((item, idx) => (
              <div key={idx}>{item}</div>
            ))}
        </TableCell>

        <TableCell className="text-center font-medium">{order.total}</TableCell>

        <TableCell onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-2">
            {!locked && (
              <Button
                variant="secondary"
                size="sm"
                className="cursor-pointer"
                disabled={isProcessing}
                onClick={() => processOrders([order])}
              >
                Send to Koombiyo
              </Button>
            )}

            {!isSent && !isRejected && (
              <Button
                variant="destructive"
                size="sm"
                className="cursor-pointer"
                disabled={isProcessing}
                onClick={() => updateOrderStatus(orderId, "rejected")}
              >
                Reject this order
              </Button>
            )}

            {isSent && (
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer"
                disabled={isProcessing}
                onClick={() => generateSingleWaybillPdf(orderId)}
              >
                PDF Waybill
              </Button>
            )}

            {isRejected && (
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer"
                disabled={isProcessing}
                onClick={() => updateOrderStatus(orderId, "on-hold")}
              >
                Reaccept this order
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  if (!tableOrders || tableOrders.length === 0) {
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
      <div className="fixed right-4 top-4 z-[100] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-md border px-3 py-2 text-sm shadow-lg ${
              toast.variant === "success"
                ? "border-emerald-600/30 bg-emerald-50 text-emerald-900"
                : toast.variant === "error"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-sky-600/30 bg-sky-50 text-sky-900"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

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
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isProcessing || selectedFiltered.size === 0}
                onClick={() => generateBulkWaybillPdfs(Array.from(selectedFiltered))}
              >
                PDF Selected ({selectedFiltered.size})
              </Button>
              <Button
                size="sm"
                disabled={isProcessing || selectedFiltered.size === 0}
                onClick={() =>
                  processOrders(
                    filteredOrders.filter((o) =>
                      selectedFiltered.has(getOrderId(o)),
                    ),
                  )
                }
              >
                Send Selected ({selectedFiltered.size})
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFiltered(false)}
                className="cursor-pointer h-7"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
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
                      checked={
                        selectableFilteredOrders.length > 0 &&
                        selectableFilteredOrders.every((o) =>
                          selectedFiltered.has(getOrderId(o)),
                        )
                      }
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedFiltered(
                            new Set(
                              selectableFilteredOrders.map((o) =>
                                getOrderId(o),
                              ),
                            ),
                          );
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
                  <TableHead className="text-center font-semibold">
                    Total
                  </TableHead>
                  <TableHead className="text-center font-semibold"></TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredOrders.map((order) =>
                  renderRow(order, selectedFiltered, toggleFilteredRow),
                )}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* Main Orders Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex justify-end gap-2 p-3 border-b">
          <Button
            variant="outline"
            size="sm"
            disabled={isProcessing || selectedMain.size === 0}
            onClick={() => generateBulkWaybillPdfs(Array.from(selectedMain))}
          >
            PDF Selected ({selectedMain.size})
          </Button>
          <Button
            size="sm"
            disabled={isProcessing || selectedMain.size === 0}
            onClick={() =>
              processOrders(
                sortedOrders.filter((o) => selectedMain.has(getOrderId(o))),
              )
            }
          >
            Send Selected ({selectedMain.size})
          </Button>
        </div>

        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="text-center font-semibold  pl-4">
                <Checkbox.Root
                  checked={
                    selectableSortedOrders.length > 0 &&
                    selectableSortedOrders.every((o) =>
                      selectedMain.has(getOrderId(o)),
                    )
                  }
                  onCheckedChange={(checked) => {
                    if (checked === true) {
                      setSelectedMain(
                        new Set(
                          selectableSortedOrders.map((o) => getOrderId(o)),
                        ),
                      );
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
            {sortedOrders.map((order) =>
              renderRow(order, selectedMain, toggleMainRow),
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) {
            setIsEditMode(false);
            setDetailsError("");
          }
        }}
      >
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Order #{selectedOrderId}</SheetTitle>
            <SheetDescription>
              Full details fetched from Google Sheets. Status cannot be edited
              directly.
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-4 space-y-4">
            {detailsLoading && (
              <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                Loading order details...
              </div>
            )}

            {detailsError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {detailsError}
              </div>
            )}

            {!detailsLoading && selectedOrderDetails && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 align-middle">
                  <Badge className="capitalize" variant="outline">
                    Status: {selectedOrderDetails.status || "Pending"}
                  </Badge>

                  <div className="flex flex-wrap items-center gap-2">
                    {!isLockedStatus(selectedOrderDetails.status) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={isProcessing || detailsSaving}
                        onClick={() => {
                          const current = tableOrders.find(
                            (order) => getOrderId(order) === selectedOrderId,
                          );
                          if (current) {
                            processOrders([current]);
                          }
                        }}
                      >
                        Send to Koombiyo
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isProcessing || detailsSaving || selectedOrderDetails.status.toLowerCase() !== "sent-to-koombiyo"}
                      onClick={() => generateSingleWaybillPdf(selectedOrderId)}
                    >
                      PDF Waybill
                    </Button>

                    {selectedOrderDetails.status.toLowerCase() !==
                      "sent-to-koombiyo" &&
                      selectedOrderDetails.status.toLowerCase() !==
                        "rejected" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={isProcessing || detailsSaving}
                          onClick={() =>
                            updateOrderStatus(selectedOrderId, "rejected")
                          }
                        >
                          Reject this order
                        </Button>
                      )}

                    {selectedOrderDetails.status.toLowerCase() ===
                      "rejected" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isProcessing || detailsSaving}
                        onClick={() =>
                          updateOrderStatus(selectedOrderId, "on-hold")
                        }
                      >
                        Reaccept this order
                      </Button>
                    )}

                    <div className="flex justify-end gap-2 px-5">
                      {isEditMode ? (
                        <>
                          <Button
                            variant="ghost"
                            disabled={detailsSaving}
                            onClick={() => {
                              if (!selectedOrderDetails) return;
                              const reset: Record<string, string> = {};
                              for (const field of selectedOrderDetails.fields) {
                                reset[field.header] = field.value;
                              }
                              setEditableFields(reset);
                              setIsEditMode(false);
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            disabled={detailsSaving}
                            onClick={saveOrderDetails}
                          >
                            {detailsSaving ? "Saving..." : "Save changes"}
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => setIsEditMode(true)}
                        >
                          Edit this Order
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {selectedOrderDetails.fields.map((field) => {
                    const lower = field.header.toLowerCase();
                    const isLongField =
                      lower.includes("address") ||
                      lower.includes("summary") ||
                      lower.includes("note");

                    return (
                      <div
                        key={field.header}
                        className="grid gap-2 md:grid-cols-[220px_1fr]"
                      >
                        <label className="text-sm font-medium text-muted-foreground">
                          {field.header}
                        </label>

                        {isEditMode && field.editable ? (
                          isLongField ? (
                            <textarea
                              value={editableFields[field.header] ?? ""}
                              onChange={(e) =>
                                setEditableFields((prev) => ({
                                  ...prev,
                                  [field.header]: e.target.value,
                                }))
                              }
                              rows={3}
                              className="min-h-[82px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            />
                          ) : (
                            <Input
                              value={editableFields[field.header] ?? ""}
                              onChange={(e) =>
                                setEditableFields((prev) => ({
                                  ...prev,
                                  [field.header]: e.target.value,
                                }))
                              }
                            />
                          )
                        ) : (
                          <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm whitespace-pre-wrap break-words">
                            {field.value || "-"}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
