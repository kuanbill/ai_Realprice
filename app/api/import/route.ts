import { NextRequest, NextResponse } from "next/server";
import { importFromFolder } from "@/lib/csv-import";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const folder = body.path || process.env.SOURCE_DEFAULT_PATH || "";
  if (!folder) return NextResponse.json({ error: "缺少 path" }, { status: 400 });
  const res = importFromFolder(folder);
  return NextResponse.json(res);
}
