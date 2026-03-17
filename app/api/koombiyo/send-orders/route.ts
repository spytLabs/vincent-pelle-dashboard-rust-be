import { NextResponse } from "next/server";
import { allocateWaybill } from "@/lib/allocate-waybill";
import { retrieveDistrict } from "@/lib/retrieve-district";
import { retrieveCity } from "@/lib/retrieve-city";
import { addOrder } from "@/lib/add-order";
import { updateOrderStatusById } from "@/lib/update-order-status";

type IncomingOrder = {
  id?: string;
  status?: string;
  customerName?: string;
  district?: string;
  city?: string;
  address?: string;
  receiverStreet?: string;
  phone?: string;
  mobile?: string;
  itemsSummary?: string;
  total?: string | number;
};

function isLockedStatus(status?: string) {
  const s = (status ?? "").toLowerCase().trim();
  return s === "sent-to-koombiyo" || s === "rejected";
}

function parseCod(total: string | number | undefined) {
  const n = Number(String(total ?? "0").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const orders: IncomingOrder[] = Array.isArray(body?.orders) ? body.orders : [];

    if (!orders.length) {
      return NextResponse.json({ error: "No orders provided." }, { status: 400 });
    }

    const logs: string[] = [];
    const updatedOrderIds: string[] = [];
    const skippedOrderIds: string[] = [];
    const failedOrderIds: string[] = [];
    const generatedWaybills: Array<{ orderId: string; waybill: string }> = [];

    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      const orderId = String(o.id ?? "").trim();

      if (!orderId) {
        logs.push(`❌ Row ${i + 1}: Missing order id.`);
        failedOrderIds.push(`row-${i + 1}`);
        continue;
      }

      if (isLockedStatus(o.status)) {
        logs.push(`⏭️ #${orderId}: Skipped (${o.status}).`);
        skippedOrderIds.push(orderId);
        continue;
      }

      const waybill = await allocateWaybill();
      if (!waybill) {
        logs.push(`⚠️ #${orderId}: Insufficient waybills. Request more waybills.`);
        failedOrderIds.push(orderId);

        for (let j = i + 1; j < orders.length; j++) {
          const pendingId = String(orders[j]?.id ?? "").trim();
          if (pendingId) {
            logs.push(`⚠️ #${pendingId}: Not processed due to insufficient waybills.`);
            failedOrderIds.push(pendingId);
          }
        }
        break;
      }

      try {
        const districtName = String(o.district ?? "").trim();
        const districtId = await retrieveDistrict(districtName);
        if (!districtId) {
          throw new Error(`District not found: "${districtName}"`);
        }

        const cityName = String(o.city ?? "").trim();
        const cityId = await retrieveCity(cityName, districtId);
        if (!cityId) {
          throw new Error(`City not found: "${cityName}" in district "${districtName}"`);
        }

        const receiverStreet = String(o.address ?? o.receiverStreet ?? "").trim();
        const receiverPhone = String(o.phone ?? o.mobile ?? "").trim();

        if (!receiverStreet) throw new Error("Missing receiver street/address.");
        if (!receiverPhone) throw new Error("Missing receiver phone.");

        await addOrder({
          orderWaybillid: waybill,
          orderNo: orderId,
          receiverName: String(o.customerName ?? "Customer"),
          receiverStreet,
          receiverDistrict: districtId,
          receiverCity: cityId,
          receiverPhone,
          description: String(o.itemsSummary ?? "Order items"),
          spclNote: "",
          getCod: parseCod(o.total),
        });

        await updateOrderStatusById(orderId, "sent-to-koombiyo");
        updatedOrderIds.push(orderId);
        generatedWaybills.push({ orderId, waybill: String(waybill) });
        logs.push(`✅ #${orderId}: Sent to Koombiyo. Waybill: ${waybill}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        failedOrderIds.push(orderId);
        logs.push(`❌ #${orderId}: ${msg}`);
      }
    }

    return NextResponse.json({
      success: true,
      updatedOrderIds,
      skippedOrderIds,
      failedOrderIds,
      generatedWaybills,
      logs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}