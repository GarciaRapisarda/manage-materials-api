import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

export async function GET() {
  const filePath = path.join(process.cwd(), "scripts", "output", "duplicate-review.json");
  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      { error: "No hay revisión. Corré npm run duplicates:review" },
      { status: 404 }
    );
  }
  const review = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return NextResponse.json(review);
}

export async function POST(request: Request) {
  const filePath = path.join(process.cwd(), "scripts", "output", "duplicate-review.json");
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "No hay revisión" }, { status: 404 });
  }
  const body = (await request.json()) as { deletedIds?: string[] };
  const deleted = new Set(body.deletedIds ?? []);
  const review = JSON.parse(fs.readFileSync(filePath, "utf-8")) as {
    groups: Array<{
      source: string;
      keepId: string;
      deleteIds: string[];
      names: string[];
      members?: Array<{ id: string }>;
    }>;
    mechanicalGroupCount?: number;
    llmConfirmedCount?: number;
    deleteCount?: number;
  };
  review.groups = review.groups.flatMap((group) => {
    const members = (group.members ?? []).filter((member) => !deleted.has(member.id));
    const remaining = [group.keepId, ...group.deleteIds].filter((id) => !deleted.has(id));
    if (remaining.length < 2) return [];
    const updatedAt = (id: string) => members.find((member) => member.id === id)?.updatedAt ?? "";
    const keepId = remaining.includes(group.keepId)
      ? group.keepId
      : [...remaining].sort((a, b) => new Date(updatedAt(b) || 0).getTime() - new Date(updatedAt(a) || 0).getTime())[0];
    return [{
      ...group,
      keepId,
      deleteIds: remaining.filter((id) => id !== keepId),
      members,
    }];
  });
  review.mechanicalGroupCount = review.groups.filter((group) => group.source === "mechanical").length;
  review.llmConfirmedCount = review.groups.filter((group) => group.source === "llm").length;
  review.deleteCount = review.groups.reduce((sum, group) => sum + group.deleteIds.length, 0);
  fs.writeFileSync(filePath, JSON.stringify(review, null, 2), "utf-8");
  return NextResponse.json({
    deleteCount: review.deleteCount,
    groups: review.groups.length,
  });
}
