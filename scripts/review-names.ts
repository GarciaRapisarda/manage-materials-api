import { config } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { cleanDisplayName } from "../lib/name-hygiene";
import {
  buildNameReview,
  type NameLlmCandidate,
  type NameReviewGroup,
} from "../lib/name-review";

config({ path: path.join(process.cwd(), ".env.local") });

const BATCH_SIZE = 12;

type LlmRow = { id?: string; verdict?: string; cleanName?: string };

async function classifyBatch(
  batch: NameLlmCandidate[],
  apiKey: string
): Promise<Map<string, { verdict: "same" | "different" | "unsure"; cleanName: string }>> {
  const payload = batch.map((group) => ({
    id: group.id,
    names: group.items.map((item) => item.name),
  }));
  const prompt = `Decidí si cada grupo es el MISMO material publicado con el nombre sucio, o productos distintos.

Mismo producto: cambia puntuación, guión suelto, coma, la x de cantidad, el orden de las palabras, una marca pegada al nombre, o falta un 1 delante de la unidad (m3 y 1 m3).
Distinto: cambia el tipo (fina contra gruesa), la medida (1/4 lt contra 4 lt), el color, la mano (izquierda contra derecha), la calidad (2° calidad), el envase, la zona o cualquier palabra que sea otro producto.
Si dudás, unsure.
Si es el mismo, proponé un solo nombre limpio, sin guiones ni comas sueltas, y conservá la medida y el color.

Grupos:
${JSON.stringify(payload)}

Formato JSON: {"groups":[{"id":"...","verdict":"same|different|unsure","cleanName":"..."}]} mismo orden y cantidad. Nada fuera de ese objeto.`;

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
          content: "Revisás nombres de materiales de construcción. No inventes ids. No unas productos distintos.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("OpenAI no devolvió contenido");
  const parsed = readVerdicts(raw);
  const verdicts = new Map<string, { verdict: "same" | "different" | "unsure"; cleanName: string }>();
  for (const row of parsed) {
    if (!row.id) continue;
    const verdict = row.verdict === "same" || row.verdict === "different" ? row.verdict : "unsure";
    verdicts.set(row.id, { verdict, cleanName: (row.cleanName ?? "").trim() });
  }
  return verdicts;
}

function readVerdicts(raw: string): LlmRow[] {
  const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
  const start = cleaned.search(/[\[{]/);
  if (start < 0) throw new Error("La respuesta no trae JSON");
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) {
        const value = JSON.parse(cleaned.slice(start, i + 1)) as LlmRow[] | { groups?: LlmRow[] };
        return Array.isArray(value) ? value : value.groups ?? [];
      }
    }
  }
  throw new Error("JSON incompleto");
}

function groupFromCandidate(candidate: NameLlmCandidate, cleanName: string): NameReviewGroup {
  const latest = [...candidate.items].sort((a, b) => {
    const delta = new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    if (delta !== 0) return delta;
    return Number(a.id) - Number(b.id);
  })[0];
  return {
    source: "llm",
    keepId: latest.id,
    deleteIds: candidate.items.map((item) => item.id).filter((id) => id !== latest.id),
    cleanName: cleanName || cleanDisplayName(latest.name),
    members: candidate.items,
  };
}

async function main(): Promise<void> {
  const skipLlm = process.argv.includes("--skip-llm");
  const username = process.env.EDIFY_USERNAME?.trim();
  const password = process.env.EDIFY_PASSWORD?.trim();
  if (!username || !password) {
    console.error("Faltan EDIFY_USERNAME y EDIFY_PASSWORD en .env.local. La API exige sesión.");
    process.exit(1);
  }

  const { login } = await import("../services/auth");
  const { fetchAllMaterials } = await import("../services/materials");
  const token = await login({ username, password });
  if (!token) {
    console.error("El login no devolvió token");
    process.exit(1);
  }

  const materials = (await fetchAllMaterials(token)).data;
  const { mechanical, llm } = buildNameReview(
    materials.map((material) => ({
      id: material.id,
      name: material.name,
      brand: material.brand,
      price: material.price,
      updatedAt: material.updated_at,
    }))
  );

  const groups: NameReviewGroup[] = [...mechanical];
  let skippedDifferent = 0;
  let skippedUnsure = 0;
  if (!skipLlm && llm.length > 0) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      console.error("Falta OPENAI_API_KEY en .env.local");
      process.exit(1);
    }
    const progressPath = path.join(process.cwd(), "scripts", "output", "name-review-progress.json");
    const saved = fs.existsSync(progressPath)
      ? (JSON.parse(fs.readFileSync(progressPath, "utf-8")) as {
          candidateCount?: number;
          verdicts?: Record<string, { verdict: "same" | "different" | "unsure"; cleanName: string }>;
        })
      : {};
    const remembered =
      saved.candidateCount === llm.length && saved.verdicts ? saved.verdicts : {};
    const verdictsById = new Map(Object.entries(remembered));
    for (let offset = 0; offset < llm.length; offset += BATCH_SIZE) {
      const batch = llm.slice(offset, offset + BATCH_SIZE);
      if (batch.every((candidate) => verdictsById.has(candidate.id))) {
        console.log(`Modelo ${Math.min(offset + BATCH_SIZE, llm.length)}/${llm.length} (ya estaba)`);
        continue;
      }
      let verdicts = new Map<string, { verdict: "same" | "different" | "unsure"; cleanName: string }>();
      try {
        verdicts = await classifyBatch(batch, apiKey);
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        try {
          verdicts = await classifyBatch(batch, apiKey);
        } catch (retryError) {
          console.error(retryError instanceof Error ? retryError.message : retryError);
          console.error(`Lote ${offset + 1} quedó en duda`);
        }
      }
      for (const candidate of batch) {
        if (!verdicts.has(candidate.id)) {
          verdicts.set(candidate.id, { verdict: "unsure", cleanName: "" });
        }
        verdictsById.set(candidate.id, verdicts.get(candidate.id)!);
      }
      fs.mkdirSync(path.dirname(progressPath), { recursive: true });
      fs.writeFileSync(
        progressPath,
        JSON.stringify({
          candidateCount: llm.length,
          verdicts: Object.fromEntries(verdictsById),
        }),
        "utf-8"
      );
      console.log(`Modelo ${Math.min(offset + BATCH_SIZE, llm.length)}/${llm.length}`);
    }
    for (const candidate of llm) {
      const row = verdictsById.get(candidate.id) ?? { verdict: "unsure" as const, cleanName: "" };
      if (row.verdict === "different") {
        skippedDifferent++;
        continue;
      }
      if (row.verdict !== "same") {
        skippedUnsure++;
        continue;
      }
      groups.push(groupFromCandidate(candidate, row.cleanName));
    }
  }

  const generatedAt = new Date().toISOString();
  const review = {
    generatedAt,
    materialCount: materials.length,
    mechanicalGroupCount: mechanical.length,
    llmCandidateCount: llm.length,
    llmConfirmedCount: groups.filter((group) => group.source === "llm").length,
    skippedDifferent,
    skippedUnsure,
    deleteCount: groups.reduce((sum, group) => sum + group.deleteIds.length, 0),
    groups,
  };

  const outputDir = path.join(process.cwd(), "scripts", "output");
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = generatedAt.replace(/[:.]/g, "-");
  const datedPath = path.join(outputDir, `name-review-${stamp}.json`);
  const latestPath = path.join(outputDir, "name-review.json");
  const body = JSON.stringify(review, null, 2);
  fs.writeFileSync(datedPath, body, "utf-8");
  fs.writeFileSync(latestPath, body, "utf-8");
  console.log(`Materiales: ${materials.length}`);
  console.log(`Grupos mecánicos: ${mechanical.length}`);
  console.log(`Candidatos al modelo: ${llm.length}`);
  console.log(`Confirmados por el modelo: ${review.llmConfirmedCount}`);
  console.log(`Distintos: ${skippedDifferent}`);
  console.log(`En duda: ${skippedUnsure}`);
  console.log(`A eliminar: ${review.deleteCount}`);
  console.log(datedPath);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
