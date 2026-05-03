import * as XLSX from "xlsx";
import Papa from "papaparse";
import type { Sheet, Sheets } from "./dataEngine";

export async function parseFile(file: File): Promise<Sheets> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv") {
    const text = await file.text();
    const parsed = Papa.parse<Record<string, any>>(text, { header: true, dynamicTyping: true, skipEmptyLines: true });
    const rows = parsed.data || [];
    const columns = parsed.meta.fields || (rows[0] ? Object.keys(rows[0]) : []);
    const name = file.name.replace(/\.csv$/i, "") || "Sheet1";
    return { [name]: { name, rows, columns } };
  }
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheets: Sheets = {};
  wb.SheetNames.forEach((sn) => {
    const ws = wb.Sheets[sn];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: null });
    const range = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
    let columns: string[] = [];
    if (range) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: range.s.r, c })];
        if (cell && cell.v != null) columns.push(String(cell.v));
      }
    }
    if (!columns.length && rows[0]) columns = Object.keys(rows[0]);
    sheets[sn] = { name: sn, rows, columns };
  });
  return sheets;
}

export function exportSheets(sheets: Sheet[], filename = "ExcelPro-Result.xlsx") {
  const wb = XLSX.utils.book_new();
  sheets.forEach((s) => {
    const ws = XLSX.utils.json_to_sheet(s.rows, { header: s.columns });
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31) || "Sheet");
  });
  XLSX.writeFile(wb, filename);
}
