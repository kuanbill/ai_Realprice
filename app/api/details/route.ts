import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const serialNo = req.nextUrl.searchParams.get("serial_no") || "";
  if (!serialNo) return NextResponse.json({ error: "serial_no required" }, { status: 400 });

  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM details WHERE serial_no = ?
  `).all(serialNo);

  return NextResponse.json({ rows });
}
