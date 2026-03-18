import * as fs from "fs";
import * as path from "path";
import { CATEGORY_MAP } from "./edify-category-map";

const MAPPING_JSON = path.join(__dirname, "edify-category-mapping.json");
const MAPPING_CSV = path.join(
  process.cwd(),
  "scripts",
  "output",
  "edify-category-mapping.csv"
);

export function loadEdifyMapping(): Record<string, string> {
  if (fs.existsSync(MAPPING_JSON)) {
    const raw = fs.readFileSync(MAPPING_JSON, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed;
  }
  if (fs.existsSync(MAPPING_CSV)) {
    return loadMappingFromCsv(MAPPING_CSV);
  }
  return CATEGORY_MAP;
}

function loadMappingFromCsv(csvPath: string): Record<string, string> {
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  const map: Record<string, string> = {};
  const header = lines[0]
    .toLowerCase()
    .split(",")
    .map((c) => c.trim().replace(/^"|"$/g, ""));
  const slugIdx = header.indexOf("slug");
  const myCatIdx = header.indexOf("mycategory");
  if (slugIdx < 0 || myCatIdx < 0) return CATEGORY_MAP;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const slug = cols[slugIdx]?.trim().replace(/^"|"$/g, "");
    const myCategory = cols[myCatIdx]?.trim().replace(/^"|"$/g, "");
    if (!slug) continue;
    map[slug] = myCategory || (CATEGORY_MAP[slug] ?? "Otros");
  }
  return Object.keys(map).length > 0 ? map : CATEGORY_MAP;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else current += c;
  }
  result.push(current);
  return result;
}
