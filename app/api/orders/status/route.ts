import { NextResponse } from "next/server";
import { updateOrderStatusByIdInSheet } from "@/lib/orders-sheet";

type AllowedStatus = "rejected" | "on-hold";

function isAllowedStatus(value: string): value is AllowedStatus {
  return value === "rejected" || value === "on-hold";
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const orderId = String(body?.orderId ?? "").trim();
    const status = String(body?.status ?? "").trim().toLowerCase();

    if (!orderId) {
      return NextResponse.json({ error: "orderId is required." }, { status: 400 });
    }

    if (!isAllowedStatus(status)) {
      return NextResponse.json(
        { error: "status must be either rejected or on-hold." },
        { status: 400 }
      );
    }

    const result = await updateOrderStatusByIdInSheet(orderId, status);

    return NextResponse.json({
      success: true,
      orderId: result.orderId,
      status: result.status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
