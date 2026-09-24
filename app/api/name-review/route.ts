import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

const latestPath = () => path.join(process.cwd(), "scripts", "output", "name-review.json");

export async function GET() {
  const filePath = latestPath();
  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      { error: "No hay revisión. Corré npm run names:review" },
      { status: 404 }
    );
  }
  return NextResponse.json(JSON.parse(fs.readFileSync(filePath, "utf-8")));
}

export async function POST(request: Request) {
  const filePath = latestPath();
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
      cleanName: string;
      members?: Array<{ id: string; name: string; updatedAt?: string }>;
    }>;
    mechanicalGroupCount?: number;
    llmConfirmedCount?: number;
    deleteCount?: number;
    appliedAt?: string;
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
  review.appliedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(review, null, 2), "utf-8");
  return NextResponse.json({ deleteCount: review.deleteCount, groups: review.groups.length });
}
