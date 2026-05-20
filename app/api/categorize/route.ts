import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import {
  applyRuleOverrides,
  normalizeImportUnit,
} from "@/lib/import-categorization";

const VALID_UNITS = ["kg", "gr", "mt", "cm", "l", "ml", "m2", "cm2", "m3", "cm3", "u"];
const BATCH_SIZE = 15;

function getCategoriasDoc(): string {
  const path = join(process.cwd(), "docs", "categorias-llm-contexto.md");
  return readFileSync(path, "utf-8");
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY no configurada" },
      { status: 500 }
    );
  }

  let body: { items: Array<{ name: string; sectionContext?: string | null }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { items } = body;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items debe ser un array no vacío" }, { status: 400 });
  }

  const categoriasDoc = getCategoriasDoc();
  const results: Array<{ categoryId: string; unit: string }> = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchItems = batch.map((it, idx) => ({
      index: i + idx,
      name: it.name,
      sectionContext: it.sectionContext ?? "",
    }));

    const hasSections = batch.some((it) => it.sectionContext?.trim());
    const contextNote = hasSections
      ? `CONTEXTO CLAVE: Los sectionContext indican la sección del listado. ÚSALOS como pista principal. Si sectionContext contiene "LADRILLOS", "CERÁMICOS", "BLOQUES" → categoría 21. Si contiene "ELECTRICIDAD", "ELÉCTRICO", "Jeluz" → categoría 19. Si contiene "SANITARIO", "BAÑO", "PVC" (caños) → categoría 20. Si contiene "HERRAMIENTAS" → categoría 15. Si contiene "CALEFACCIÓN", "CALEFACTOR" → categoría 26.\n\n`
      : "";

    const prompt = `Categorizá estos materiales según la guía y los EJEMPLOS REALES del documento. Para cada uno devolvé categoryId (string, 1-28) y unit (una de: ${VALID_UNITS.join(", ")}).

${contextNote}REGLAS (consultar la sección "Ejemplos reales" del documento):
- sectionContext tiene prioridad absoluta: si el listado dice "LADRILLOS", "ELECTRICIDAD", "CONSTRUCCIÓN EN SECO", etc., usar esa categoría.
- Lana de vidrio x m2 → 1 Aditivos, m2. Membranas, Plavicon, hidrófugos → 1, u. Pintura asfáltica, látex, antióxido, cielorrasos x lt → 24 Pintura, l.
- Split, termotanque → 14 Equipamiento, u. Calefactor Sombrilla gas → 26 Calefacción, l.
- Cerámicos muro/tabique/portante, adoquín, Brimax, Sphan → 21 Ladrillos, u. Porcelanato, piso vinílico, cerámico piso → 25 Suelos, m2.
- Placa Durlock, montante, solera drywall, Acustic, Buña, Cubrecanto → 11 Construcción en Seco, mt o m2.
- Tornillos, galvanizado, alambre → 17 Hierros, u o kg. Caja, campanilla, caño galvanizado/hierro, Jabalina, Led, Anclaje, Cartela, Tapa Jeluz → 19 Instalaciones Eléctricas.
- Unión PVC paracaño (canaleta eléctrica) → 19. Unión/caño para agua → 20.
- Sierra, amoladora, taladro, lijadora → 15 Herramientas, u. Puerta placa cedro → 7 Carpintería Madera, u.
- Chapa acanalada x m → 10 Chapas, mt. Cal, cemento x kg → 5, kg.

CRÍTICO: El array de respuesta debe tener EXACTAMENTE un elemento por material, en el MISMO ORDEN. posición 0 → material 0, posición 1 → material 1, etc. Analizá CADA material por su nombre individualmente.

Materiales:
${JSON.stringify(batchItems, null, 0)}

Formato: [{"categoryId":"21","unit":"u"}, ...]`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: categoriasDoc,
          },
          { role: "user", content: prompt },
        ],
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json(
        { error: `OpenAI: ${response.status} - ${err}` },
        { status: 502 }
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      return NextResponse.json(
        { error: "OpenAI no devolvió contenido" },
        { status: 502 }
      );
    }

    let parsed: Array<Record<string, unknown>>;
    try {
      const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: `OpenAI respuesta no es JSON válido: ${raw.slice(0, 200)}` },
        { status: 502 }
      );
    }

    for (let j = 0; j < batch.length; j++) {
      const p = parsed[j];
      const item = batch[j];
      let catId = "1";
      let unit = "u";
      if (p && typeof p === "object") {
        const row = p as { categoryId?: string; category_id?: string; unit?: string };
        catId = String(row.categoryId ?? row.category_id ?? "1").trim();
        unit = normalizeImportUnit(String(row.unit ?? "u"));
      }
      const corrected = applyRuleOverrides(item.name, catId || "1", unit);
      results.push(corrected);
    }
  }

  return NextResponse.json({ results });
}
