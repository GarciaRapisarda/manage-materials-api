import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

function filePath() {
  return path.join(process.cwd(), "scripts", "output", "source-links.json");
}

export async function GET() {
  const target = filePath();
  if (!fs.existsSync(target)) return NextResponse.json({ links: {} });
  const saved = JSON.parse(fs.readFileSync(target, "utf-8")) as { links?: Record<string, string> };
  return NextResponse.json({ links: saved.links ?? {} });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { links?: Record<string, string> };
  const target = filePath();
  const current = fs.existsSync(target)
    ? (JSON.parse(fs.readFileSync(target, "utf-8")) as { links?: Record<string, string> }).links ?? {}
    : {};
  const links = { ...current, ...(body.links ?? {}) };
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify({ links }, null, 2), "utf-8");
  return NextResponse.json({ count: Object.keys(links).length });
}
