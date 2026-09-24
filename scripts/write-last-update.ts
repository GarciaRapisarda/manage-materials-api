import * as fs from "fs";
import * as path from "path";

export type SourceLastUpdate = {
  source: string;
  updatedAt: string;
  productCount: number;
  materialsFile: string;
};

const SOURCE_ORDER = [
  "alumetal",
  "todoproyectable",
  "edify",
  "moreno",
  "merlino",
  "ropelato",
] as const;

function readSourceLastUpdate(
  outputDir: string,
  source: string
): SourceLastUpdate | null {
  const filePath = path.join(outputDir, `${source}-last-update.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as SourceLastUpdate;
}

export function writeSourceLastUpdate(
  outputDir: string,
  update: SourceLastUpdate
): void {
  const sourcePath = path.join(outputDir, `${update.source}-last-update.json`);
  fs.writeFileSync(sourcePath, JSON.stringify(update, null, 2), "utf-8");

  const sources: Record<string, SourceLastUpdate> = {};
  for (const source of SOURCE_ORDER) {
    const existing =
      source === update.source ? update : readSourceLastUpdate(outputDir, source);
    if (existing) sources[source] = existing;
  }

  const combinedPath = path.join(outputDir, "last-update.json");
  fs.writeFileSync(
    combinedPath,
    JSON.stringify(
      {
        updatedAt: update.updatedAt,
        sources,
      },
      null,
      2
    ),
    "utf-8"
  );

  console.log(`Last update: ${sourcePath}`);
  console.log(`Last update (todas): ${combinedPath}`);
}
