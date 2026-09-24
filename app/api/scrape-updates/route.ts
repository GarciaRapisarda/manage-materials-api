import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

const SOURCE_ORDER = [
  "alumetal",
  "todoproyectable",
  "edify",
  "moreno",
  "merlino",
  "ropelato",
] as const;

const SOURCE_LABELS: Record<(typeof SOURCE_ORDER)[number], string> = {
  alumetal: "Alumetal",
  todoproyectable: "Todo Proyectable",
  edify: "Edify",
  moreno: "Materiales Moreno",
  merlino: "Merlino",
  ropelato: "Ropelato",
};

type SourceLastUpdate = {
  source: string;
  updatedAt: string;
  productCount: number;
  materialsFile: string;
};

type ScrapeUpdateRow = SourceLastUpdate & { label: string };

function outputDir(): string {
  return path.join(process.cwd(), "scripts", "output");
}

function readCombined(): {
  updatedAt: string | null;
  sources: ScrapeUpdateRow[];
} {
  const combinedPath = path.join(outputDir(), "last-update.json");
  if (!fs.existsSync(combinedPath)) {
    return { updatedAt: null, sources: [] };
  }
  const combined = JSON.parse(fs.readFileSync(combinedPath, "utf-8")) as {
    updatedAt?: string;
    sources?: Record<string, SourceLastUpdate>;
  };
  const bySource = combined.sources ?? {};
  const sources = SOURCE_ORDER.flatMap((key) => {
    const row = bySource[key];
    if (!row) return [];
    return [
      {
        source: key,
        label: SOURCE_LABELS[key],
        updatedAt: row.updatedAt,
        productCount: row.productCount,
        materialsFile: row.materialsFile,
      },
    ];
  });
  return { updatedAt: combined.updatedAt ?? null, sources };
}

export async function GET(request: Request) {
  const source = new URL(request.url).searchParams.get("source");
  const combined = readCombined();

  if (!source) {
    return NextResponse.json(combined);
  }

  if (!(source in SOURCE_LABELS)) {
    return NextResponse.json({ error: "Origen desconocido" }, { status: 400 });
  }

  const row = combined.sources.find((item) => item.source === source);
  if (!row) {
    return NextResponse.json(
      { error: "Esa tienda no tiene una corrida guardada" },
      { status: 404 }
    );
  }

  const fileName = path.basename(row.materialsFile);
  if (fileName !== row.materialsFile || !fileName.endsWith(".json")) {
    return NextResponse.json({ error: "Archivo de materiales inválido" }, { status: 400 });
  }

  const dir = path.resolve(outputDir());
  const filePath = path.resolve(dir, fileName);
  if (!filePath.startsWith(dir + path.sep) || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: "No se encontró el JSON de materiales" }, { status: 404 });
  }

  const items = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return NextResponse.json(items);
}
