import { NextResponse } from "next/server";

export async function GET(req: Request) {
    try {
        const apiKey = process.env.KOOMBIYO_API_KEY?.trim();
        if (!apiKey) {
            return NextResponse.json(
                { error: "KOOMBIYO_API_KEY is missing." },
                { status: 500 }
            );
        }

        const clientIp = req.headers.get("x-forwarded-for") || "";
        const userAgent = req.headers.get("user-agent") || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

        const url = `${process.env.KOOMBIYO_BASE_URL}/Districts/users`;
        const body = new URLSearchParams({ apikey: apiKey }).toString();

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
                "user-agent": userAgent,
                "x-forwarded-for": clientIp,
            },
            body,
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: `Failed to fetch districts: ${response.statusText}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown server error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
