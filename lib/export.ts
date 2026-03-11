import type { Material } from "@/types/material";
import * as XLSX from "xlsx";

export const EXPORT_COLUMNS = [
  "id",
  "name",
  "description",
  "price",
  "unit",
  "brand",
  "unquoted",
  "temporary",
  "created_at",
  "updated_at",
] as const;

function materialToPlainObject(m: Material): Record<string, string | number | boolean> {
  return {
    id: m.id ?? "",
    name: m.name ?? "",
    description: m.description ?? "",
    price: m.price ?? 0,
    unit: m.unit ?? "",
    brand: m.brand ?? "",
    unquoted: m.unquoted,
    temporary: m.temporary,
    created_at: m.created_at ?? "",
    updated_at: m.updated_at ?? "",
  };
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function materialToRow(m: Material): string[] {
  const obj = materialToPlainObject(m);
  return EXPORT_COLUMNS.map((col) => String(obj[col] ?? ""));
}

export function materialsToCSV(materials: Material[]): string {
  const header = EXPORT_COLUMNS.map(escapeCSV).join(",");
  const rows = materials.map((m) =>
    materialToRow(m).map(escapeCSV).join(",")
  );
  return [header, ...rows].join("\n");
}

export function downloadCSV(materials: Material[], filename: string): void {
  const csv = materialsToCSV(materials);
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadExcel(materials: Material[], filename: string): void {
  const rows = materials.map(materialToPlainObject);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Materiales");
  XLSX.writeFile(wb, filename);
}

export function getExportFilename(
  prefix: string,
  format: "csv" | "xlsx" = "csv"
): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}-${date}.${format}`;
}
