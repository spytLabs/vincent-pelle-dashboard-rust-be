import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    // Step 1: POST to koombiyo login
    const loginRes = await fetch("https://koombiyodelivery.lk/custSignin", {
      method: "POST",
      headers: {
        "accept": "*/*",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
      },
      body: `logUsername=${encodeURIComponent(username)}&logPass=${encodeURIComponent(password)}`,
      redirect: "manual",
    });

    // Check the login response body for success/failure
    const loginBody = await loginRes.text();

    // Extract cisessionlk cookie from the response
    const setCookieHeader = loginRes.headers.get("set-cookie");
    let sessionCookie: string | null = null;

    if (setCookieHeader) {
      const match = setCookieHeader.match(/cisessionlk=([^;]+)/);
      if (match) {
        sessionCookie = match[1];
      }
    }

    if (!sessionCookie) {
      return NextResponse.json(
        { error: "Login failed - no session cookie received" },
        { status: 401 }
      );
    }

    // Koombiyo returns "0" or error text on failed login
    if (loginBody.trim() === "0" || loginBody.toLowerCase().includes("error")) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // Step 2: Validate the session by hitting /myaccount
    const validateRes = await fetch("https://koombiyodelivery.lk/myaccount", {
      method: "GET",
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "cookie": `cisessionlk=${sessionCookie}`,
      },
      redirect: "manual",
    });

    // If we get a redirect (307), the login didn't actually succeed
    if (validateRes.status === 307 || validateRes.status === 302 || validateRes.status === 301) {
      return NextResponse.json(
        { error: "Login failed - invalid credentials" },
        { status: 401 }
      );
    }

    // Login successful - set the cookie on our domain
    const response = NextResponse.json({ success: true });

    response.cookies.set("koombiyo_session", sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 86400, // 24 hours, same as koombiyo
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "An error occurred during login" },
      { status: 500 }
    );
  }
}
