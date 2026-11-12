export type Cell = string | number | null | undefined;

/** Escapes a CSV cell. Text starting with = + - @ is prefixed with ' so spreadsheets never run it as a formula. */
export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "number" ? String(v) : v;
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV(rows: Cell[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** Triggers a browser download. A BOM is added so Excel reads ₹ and Hindi text correctly. */
export function downloadCSV(filename: string, rows: Cell[][]) {
  const blob = new Blob(["﻿" + toCSV(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
