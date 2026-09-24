import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

type Anomaly = {
  source: string;
  sourceProductId: string;
  materialId: string | null;
  reason: "price" | "identity";
  currentName: string;
  incomingName: string;
  currentPrice: number;
  incomingPrice: number | null;
  note?: string;
};

function latestPath() {
  return path.join(process.cwd(), "scripts", "output", "import-anomalies.json");
}

export async function GET() {
  const target = latestPath();
  if (!fs.existsSync(target)) return NextResponse.json({ items: [] });
  return NextResponse.json(JSON.parse(fs.readFileSync(target, "utf-8")));
}

export async function POST(request: Request) {
  const body = (await request.json()) as { items?: Anomaly[]; note?: boolean };
  const items = body.items ?? [];
  const generatedAt = new Date().toISOString();
  const review = { generatedAt, items };
  const outputDir = path.join(process.cwd(), "scripts", "output");
  fs.mkdirSync(outputDir, { recursive: true });
  const dated = path.join(outputDir, `import-anomalies-${generatedAt.replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(dated, JSON.stringify(review, null, 2), "utf-8");
  fs.writeFileSync(latestPath(), JSON.stringify(review, null, 2), "utf-8");

  if (!body.note || items.length === 0) {
    return NextResponse.json({ generatedAt, items: items.length, dated });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Falta OPENAI_API_KEY" }, { status: 500 });
  }

  const payload = items.map((item, index) => ({
    id: String(index),
    reason: item.reason,
    currentName: item.currentName,
    incomingName: item.incomingName,
    currentPrice: item.currentPrice,
    incomingPrice: item.incomingPrice,
  }));
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Anotás anomalías de precios y nombres de materiales. No digas que hay que borrarlos ni propongas un nombre que quite color, medida, calidad o modelo.",
        },
        {
          role: "user",
          content: `Para cada caso escribí una nota corta: si el precio parece haber perdido dígitos, o si el nombre cambió de producto (color, medida, mano, calidad, modelo).
${JSON.stringify(payload)}
Formato: {"notes":[{"id":"0","note":"..."}]}`,
        },
      ],
    }),
  });
  if (!response.ok) {
    return NextResponse.json({ error: await response.text() }, { status: 502 });
  }
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { notes?: Array<{ id?: string; note?: string }> };
  const notes = new Map((parsed.notes ?? []).map((row) => [row.id, row.note ?? ""]));
  review.items = items.map((item, index) => ({ ...item, note: notes.get(String(index)) ?? "" }));
  fs.writeFileSync(latestPath(), JSON.stringify(review, null, 2), "utf-8");
  fs.writeFileSync(dated, JSON.stringify(review, null, 2), "utf-8");
  return NextResponse.json({ generatedAt, items: review.items.length, dated });
}
