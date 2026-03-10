import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("koombiyo_session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ valid: false }, { status: 401 });
    }

    // Validate by hitting koombiyo /myaccount
    const validateRes = await fetch("https://koombiyodelivery.lk/myaccount", {
      method: "GET",
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "cookie": `cisessionlk=${sessionCookie}`,
      },
      redirect: "manual",
    });

    // 307 or any redirect means invalid session
    if (validateRes.status >= 300 && validateRes.status < 400) {
      // Clear the invalid cookie
      const response = NextResponse.json({ valid: false }, { status: 401 });
      response.cookies.delete("koombiyo_session");
      return response;
    }

    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error("Validation error:", error);
    return NextResponse.json({ valid: false }, { status: 500 });
  }
}
