import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const waybillid = searchParams.get("waybillid") || searchParams.get("waybill");

    if (!waybillid) {
      return NextResponse.json(
        { error: "Waybill ID is required parameter (waybillid or waybill)." },
        { status: 400 }
      );
    }

    const sessionCookie = request.cookies.get("koombiyo_session")?.value;

    if (!sessionCookie) {
      return NextResponse.json(
        { error: "Unauthorized - Missing session cookie" },
        { status: 401 }
      );
    }

    const clientIp = request.headers.get("x-forwarded-for") || "";
    const userAgent = request.headers.get("user-agent") || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

    const koombiyoUrl = `https://koombiyodelivery.lk/myaccount/pod_single?waybill=${encodeURIComponent(waybillid)}`;

    // Forward the request to Koombiyo
    const podRes = await fetch(koombiyoUrl, {
      method: "GET",
      headers: {
        "cookie": `cisessionlk=${sessionCookie}`,
        "user-agent": userAgent,
        "x-forwarded-for": clientIp,
      },
      redirect: "manual", // Handle redirects programmatically
    });

    // Handle session expiry or unauthorized (Temporary Redirect to login)
    if (podRes.status === 307 || podRes.status === 302 || podRes.status === 301) {
      return NextResponse.json(
        { error: "Unauthorized - Session expired or invalid" },
        { status: 401 }
      );
    }

    if (!podRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch POD from Koombiyo (Status: ${podRes.status})` },
        { status: podRes.status }
      );
    }

    // Check if the response might be an error page unexpectedly instead of a PDF
    const contentType = podRes.headers.get("content-type");
    if (contentType && contentType.includes("text/html")) {
      const text = await podRes.text();
      // If Koombiyo returned HTML but not a redirect, it might be an error page
      console.warn("Expected PDF but received HTML from Koombiyo:", text.substring(0, 500));
      return NextResponse.json(
        { error: "Failed to fetch POD - received HTML instead of PDF. Waybill might be invalid." },
        { status: 404 }
      );
    }

    const arrayBuffer = await podRes.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        // Tells the browser to display inline (default behavior usually) or download
        "Content-Disposition": `inline; filename="pod_${waybillid}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error fetching POD:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching the POD" },
      { status: 500 }
    );
  }
}
