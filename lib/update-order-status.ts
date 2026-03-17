import { google } from "googleapis";

function colToA1(colNumber: number) {
  let n = colNumber;
  let s = "";
  while (n > 0) {
    const mod = (n - 1) % 26;
    s = String.fromCharCode(65 + mod) + s;
    n = Math.floor((n - mod) / 26);
  }
  return s;
}

export async function updateOrderStatusById(orderId: string, newStatus: string) {
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const sheetName = process.env.GOOGLE_SHEET_NAME?.trim() || "Orders";
  const clientEmail =
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ||
    process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!sheetId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Google Sheets credentials. Set GOOGLE_PRIVATE_KEY and either GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_CLIENT_EMAIL."
    );
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  const readRange = `${sheetName}!A1:Z`;
  const read = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: readRange,
  });

  const values = read.data.values ?? [];
  if (!values.length) throw new Error("Sheet is empty.");

  const headers = (values[0] || []).map((h) => String(h).toLowerCase().trim());
  const idIdx = headers.findIndex((h) => ["id", "order id", "orderid"].includes(h));
  const statusIdx = headers.findIndex((h) => h === "status");

  if (idIdx === -1 || statusIdx === -1) {
    throw new Error("Could not find id/status columns in sheet header row.");
  }

  const rowIndex = values.findIndex(
    (row, idx) => idx > 0 && String(row[idIdx] ?? "").trim() === String(orderId).trim()
  );

  if (rowIndex === -1) {
    throw new Error(`Order id "${orderId}" not found in sheet.`);
  }

  const rowNumber = rowIndex + 1;
  const statusCol = colToA1(statusIdx + 1);
  const targetRange = `${sheetName}!${statusCol}${rowNumber}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: targetRange,
    valueInputOption: "RAW",
    requestBody: {
      values: [[newStatus]],
    },
  });
}