import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const waybillIds: string[] = body.waybillIds;

        if (!waybillIds || !Array.isArray(waybillIds) || waybillIds.length === 0) {
            return NextResponse.json(
                { error: "A list of waybillIds is required." },
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

        const mergedPdf = await PDFDocument.create();

        // Fetch PDFs concurrently
        const pdfPromises = waybillIds.map(async (waybillid) => {
            const koombiyoUrl = `https://koombiyodelivery.lk/myaccount/pod_single?waybill=${encodeURIComponent(
                waybillid
            )}`;

            const podRes = await fetch(koombiyoUrl, {
                method: "GET",
                headers: {
                    cookie: `cisessionlk=${sessionCookie}`,
                },
                redirect: "manual",
            });

            if (podRes.status === 307 || podRes.status === 302 || podRes.status === 301) {
                throw new Error(`Unauthorized (redirected) for waybill: ${waybillid}`);
            }

            if (!podRes.ok) {
                throw new Error(`Failed to fetch POD for waybill: ${waybillid} (Status: ${podRes.status})`);
            }

            const contentType = podRes.headers.get("content-type");
            if (contentType && contentType.includes("text/html")) {
                // Might be an error page instead of PDF
                throw new Error(`Received HTML instead of PDF for waybill: ${waybillid}`);
            }

            const arrayBuffer = await podRes.arrayBuffer();
            return arrayBuffer;
        });

        const pdfBuffers = await Promise.allSettled(pdfPromises);
        let successfullyMergedCount = 0;

        for (let i = 0; i < pdfBuffers.length; i++) {
            const result = pdfBuffers[i];
            if (result.status === "fulfilled") {
                try {
                    const pdf = await PDFDocument.load(result.value);
                    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                    copiedPages.forEach((page) => mergedPdf.addPage(page));
                    successfullyMergedCount++;
                } catch (err) {
                    console.error(`Error processing PDF data for waybill ${waybillIds[i]}:`, err);
                }
            } else {
                console.error(result.reason);
            }
        }

        if (successfullyMergedCount === 0) {
            return NextResponse.json(
                { error: "Failed to retrieve any valid POD PDFs." },
                { status: 500 }
            );
        }

        const mergedPdfBytes = await mergedPdf.save();

        //@ts-ignore
        return new NextResponse(mergedPdfBytes, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename="bulk_pods.pdf"`,
            },
        });
    } catch (error) {
        console.error("Error creating bulk POD:", error);
        return NextResponse.json(
            { error: "An error occurred while creating the bulk POD" },
            { status: 500 }
        );
    }
}
