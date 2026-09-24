import { config } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import {
  buildDuplicateCandidates,
  finishGroup,
  type DuplicateMember,
  type DuplicateReviewGroup,
  type LlmCandidateGroup,
} from "../lib/duplicate-review";

config({ path: path.join(process.cwd(), ".env.local") });

const BATCH_SIZE = 12;

type LlmVerdict = "same" | "different" | "unsure";

async function classifyBatch(
  batch: LlmCandidateGroup[],
  apiKey: string
): Promise<Map<string, LlmVerdict>> {
  const payload = batch.map((group) => ({
    id: group.id,
    names: group.items.map((item) => item.name),
  }));
  const prompt = `Decidí si cada grupo es el MISMO producto publicado más de una vez, o productos distintos.

Mismo producto: solo cambia espacio, "x", unidad pegada (18lt / 18 lt), coma decimal, o la palabra unidad.
Distinto: cambia medida, tamaño, color, modelo o una palabra que altera el producto (Soft, Recto, Negro, Blanco, 1lt contra 18lt, 15cm contra 30cm).
Si dudás, unsure.

Grupos:
${JSON.stringify(payload)}

Formato: [{"id":"...","verdict":"same|different|unsure"}, ...] mismo orden y cantidad.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Clasificás grupos de nombres de materiales de construcción. No inventes ids.",
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
  const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
  const parsed = JSON.parse(cleaned) as Array<{ id?: string; verdict?: string }>;
  const verdicts = new Map<string, LlmVerdict>();
  for (const row of parsed) {
    if (!row.id) continue;
    const verdict = row.verdict === "same" || row.verdict === "different" ? row.verdict : "unsure";
    verdicts.set(row.id, verdict);
  }
  return verdicts;
}

async function main(): Promise<void> {
  const skipLlm = process.argv.includes("--skip-llm");
  const username = process.env.EDIFY_USERNAME?.trim();
  const password = process.env.EDIFY_PASSWORD?.trim();
  if (!username || !password) {
    console.error(
      "Faltan EDIFY_USERNAME y EDIFY_PASSWORD en .env.local. La API exige sesión."
    );
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
  const membersById = new Map<string, DuplicateMember>(
    materials.map((material) => [
      material.id,
      {
        id: material.id,
        name: material.name,
        price: material.price,
        updatedAt: material.updated_at,
      },
    ])
  );

  if (process.argv.includes("--sync")) {
    const outputPath = path.join(process.cwd(), "scripts", "output", "duplicate-review.json");
    if (!fs.existsSync(outputPath)) {
      console.error("No hay duplicate-review.json. Corré npm run duplicates:review primero.");
      process.exit(1);
    }
    const previous = JSON.parse(fs.readFileSync(outputPath, "utf-8")) as {
      skippedDifferent?: number;
      skippedUnsure?: number;
      llmCandidateCount?: number;
      groups: DuplicateReviewGroup[];
    };
    const groups = previous.groups
      .map((group) => {
        const ids = [group.keepId, ...group.deleteIds].filter((id) => membersById.has(id));
        if (ids.length < 2) return null;
        return finishGroup(
          ids.map((id) => ({ id, name: membersById.get(id)?.name ?? id })),
          group.source,
          membersById
        );
      })
      .filter((group): group is DuplicateReviewGroup => group != null);
    const review = {
      generatedAt: new Date().toISOString(),
      materialCount: materials.length,
      mechanicalGroupCount: groups.filter((group) => group.source === "mechanical").length,
      llmCandidateCount: previous.llmCandidateCount ?? 0,
      llmConfirmedCount: groups.filter((group) => group.source === "llm").length,
      skippedDifferent: previous.skippedDifferent ?? 0,
      skippedUnsure: previous.skippedUnsure ?? 0,
      deleteCount: groups.reduce((sum, group) => sum + group.deleteIds.length, 0),
      groups,
    };
    fs.writeFileSync(outputPath, JSON.stringify(review, null, 2), "utf-8");
    console.log(`Materiales vigentes: ${materials.length}`);
    console.log(`Grupos que siguen: ${groups.length}`);
    console.log(`A eliminar: ${review.deleteCount}`);
    console.log(outputPath);
    return;
  }

  const { mechanical, llm } = buildDuplicateCandidates(
    materials.map((material) => ({
      id: material.id,
      name: material.name,
      brand: material.brand,
    }))
  );

  const confirmed: DuplicateReviewGroup[] = [];
  let skippedDifferent = 0;
  let skippedUnsure = 0;

  if (!skipLlm && llm.length > 0) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("OPENAI_API_KEY no configurada en .env.local");
      process.exit(1);
    }
    for (let i = 0; i < llm.length; i += BATCH_SIZE) {
      const batch = llm.slice(i, i + BATCH_SIZE);
      console.log(
        `LLM ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(llm.length / BATCH_SIZE)} (${batch.length} grupos)`
      );
      const verdicts = await classifyBatch(batch, apiKey);
      for (const group of batch) {
        const verdict = verdicts.get(group.id) ?? "unsure";
        if (verdict === "same") {
          confirmed.push(finishGroup(group.items, "llm", new Map()));
        } else if (verdict === "different") {
          skippedDifferent++;
        } else {
          skippedUnsure++;
        }
      }
    }
  } else if (skipLlm) {
    skippedUnsure = llm.length;
  }

  const groups = [...mechanical, ...confirmed].map((group) =>
    finishGroup(
      [group.keepId, ...group.deleteIds].map((id) => ({
        id,
        name: membersById.get(id)?.name ?? id,
      })),
      group.source,
      membersById
    )
  );
  const review = {
    generatedAt: new Date().toISOString(),
    materialCount: materials.length,
    mechanicalGroupCount: mechanical.length,
    llmCandidateCount: llm.length,
    llmConfirmedCount: confirmed.length,
    skippedDifferent,
    skippedUnsure,
    deleteCount: groups.reduce((sum, group) => sum + group.deleteIds.length, 0),
    groups,
  };

  const outputDir = path.join(process.cwd(), "scripts", "output");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "duplicate-review.json");
  fs.writeFileSync(outputPath, JSON.stringify(review, null, 2), "utf-8");
  console.log(`Materiales: ${materials.length}`);
  console.log(`Grupos mecánicos: ${mechanical.length}`);
  console.log(`Candidatos LLM: ${llm.length} · confirmados: ${confirmed.length}`);
  console.log(`Descartados distintos: ${skippedDifferent} · duda: ${skippedUnsure}`);
  console.log(`A eliminar (se conserva el update más reciente): ${review.deleteCount}`);
  console.log(outputPath);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
