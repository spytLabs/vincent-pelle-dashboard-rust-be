import { NextResponse } from "next/server";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const districtId = searchParams.get("district_id");

        if (!districtId) {
            return NextResponse.json(
                { error: "district_id query parameter is required." },
                { status: 400 }
            );
        }

        const apiKey = process.env.KOOMBIYO_API_KEY?.trim();
        if (!apiKey) {
            return NextResponse.json(
                { error: "KOOMBIYO_API_KEY is missing." },
                { status: 500 }
            );
        }

        const url = `${process.env.KOOMBIYO_BASE_URL}/Cities/users`;
        const body = new URLSearchParams({
            apikey: apiKey,
            district_id: districtId,
        }).toString();

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
            },
            body,
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: `Failed to fetch cities: ${response.statusText}` },
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
