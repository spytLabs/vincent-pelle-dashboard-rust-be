import { google } from "googleapis";
import dotenv from 'dotenv';
dotenv.config();

export type SheetField = {
  header: string;
  value: string;
  editable: boolean;
};

type SheetData = {
  spreadsheetId: string;
  sheetName: string;
  values: string[][];
  headers: string[];
  normalizedHeaders: string[];
};

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

function normalizeHeader(value: string) {
  return String(value).toLowerCase().trim();
}

function getStatusValueByHeaderMap(
  normalizedHeaders: string[],
  row: string[]
): string {
  const statusIndex = normalizedHeaders.findIndex((h) => h === "status");
  if (statusIndex === -1) return "";
  return String(row[statusIndex] ?? "");
}

function getEditableByHeader(header: string): boolean {
  const h = normalizeHeader(header);
  return h !== "status" && h !== "order id" && h !== "id";
}

async function getSheetsClient() {
  const clientEmail =
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ||
    process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Missing Google Sheets credentials. Set GOOGLE_PRIVATE_KEY and either GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_CLIENT_EMAIL."
    );
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

async function getSheetData(): Promise<SheetData> {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const sheetName = process.env.GOOGLE_SHEET_NAME?.trim() || "Orders";

  if (!spreadsheetId) {
    throw new Error("Missing GOOGLE_SHEET_ID in environment.");
  }

  const sheets = await getSheetsClient();

  const read = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:AZ`,
  });

  const values = (read.data.values ?? []).map((row) => row.map((v) => String(v ?? "")));
  if (!values.length) {
    throw new Error("Sheet is empty.");
  }

  const headers = values[0] ?? [];
  const normalizedHeaders = headers.map(normalizeHeader);

  return {
    spreadsheetId,
    sheetName,
    values,
    headers,
    normalizedHeaders,
  };
}

function findOrderRowIndex(data: SheetData, orderId: string) {
  const idIdx = data.normalizedHeaders.findIndex((h) =>
    ["id", "order id", "orderid"].includes(h)
  );

  if (idIdx === -1) {
    throw new Error("Could not find order id column in sheet header row.");
  }

  const rowIndex = data.values.findIndex(
    (row, idx) => idx > 0 && String(row[idIdx] ?? "").trim() === String(orderId).trim()
  );

  if (rowIndex === -1) {
    throw new Error(`Order id "${orderId}" not found in sheet.`);
  }

  return rowIndex;
}

export async function getOrderDetailsById(orderId: string) {
  const data = await getSheetData();
  const rowIndex = findOrderRowIndex(data, orderId);
  const row = data.values[rowIndex] ?? [];

  const fields: SheetField[] = data.headers.map((header, idx) => ({
    header,
    value: String(row[idx] ?? ""),
    editable: getEditableByHeader(header),
  }));

  const status = getStatusValueByHeaderMap(data.normalizedHeaders, row);

  return {
    id: String(orderId),
    status,
    fields,
  };
}

export async function updateOrderDetailsById(
  orderId: string,
  fieldUpdates: Record<string, string>
) {
  const data = await getSheetData();
  const rowIndex = findOrderRowIndex(data, orderId);
  const rowNumber = rowIndex + 1;
  const sheets = await getSheetsClient();

  const updates = Object.entries(fieldUpdates)
    .filter(([header]) => {
      const normalized = normalizeHeader(header);
      return normalized !== "status" && normalized !== "order id" && normalized !== "id";
    })
    .map(([header, value]) => {
      const headerIndex = data.headers.findIndex((h) => h === header);
      if (headerIndex === -1) {
        return null;
      }

      return {
        range: `${data.sheetName}!${colToA1(headerIndex + 1)}${rowNumber}`,
        values: [[String(value ?? "")]],
      };
    })
    .filter((item): item is { range: string; values: string[][] } => Boolean(item));

  if (!updates.length) {
    return getOrderDetailsById(orderId);
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: data.spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: updates,
    },
  });

  return getOrderDetailsById(orderId);
}

export async function updateOrderStatusByIdInSheet(orderId: string, newStatus: string) {
  const data = await getSheetData();
  const rowIndex = findOrderRowIndex(data, orderId);
  const rowNumber = rowIndex + 1;

  const statusIdx = data.normalizedHeaders.findIndex((h) => h === "status");
  if (statusIdx === -1) {
    throw new Error("Could not find status column in sheet header row.");
  }

  const sheets = await getSheetsClient();

  await sheets.spreadsheets.values.update({
    spreadsheetId: data.spreadsheetId,
    range: `${data.sheetName}!${colToA1(statusIdx + 1)}${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[newStatus]],
    },
  });

  return {
    orderId,
    status: newStatus,
  };
}
