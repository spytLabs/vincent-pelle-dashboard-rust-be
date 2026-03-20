import { NextResponse } from "next/server";
import { getOrderDetailsById, updateOrderDetailsById } from "@/lib/orders-sheet";

type Params = {
  params: Promise<{
    orderId: string;
  }>;
};

export async function GET(_: Request, { params }: Params) {
  try {
    const { orderId } = await params;

    if (!orderId?.trim()) {
      return NextResponse.json({ error: "Order ID is required." }, { status: 400 });
    }

    const order = await getOrderDetailsById(orderId);
    return NextResponse.json({ order });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { orderId } = await params;

    if (!orderId?.trim()) {
      return NextResponse.json({ error: "Order ID is required." }, { status: 400 });
    }

    const body = await req.json();
    const updates = body?.updates;

    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      return NextResponse.json(
        { error: "A valid updates object is required." },
        { status: 400 }
      );
    }

    const ALLOWED_EDITABLE_FIELDS = [
      "Customer Name",
      "Email",
      "Phone",
      "WhatsApp",
      "Address Line 1",
      "Address Line 2",
      "City",
      "State",
      "Postcode",
      "District",
      "Items Summary",
      "Shipping",
      "Total",
      "Customer Note"
    ];

    const allowedSet = new Set(ALLOWED_EDITABLE_FIELDS.map(f => f.toLowerCase()));

    // Check if any keys in the updates object are not in the allowed list
    const incomingKeys = Object.keys(updates);
    const hasDisallowedFields = incomingKeys.some(
      key => !allowedSet.has(key.toLowerCase())
    );

    if (hasDisallowedFields) {
      return NextResponse.json(
        { error: "Attempted to update one or more disallowed fields." },
        { status: 400 }
      );
    }

    const order = await updateOrderDetailsById(orderId, updates as Record<string, string>);
    return NextResponse.json({ success: true, order });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
