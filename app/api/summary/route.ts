import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM records) AS total,
      MAX(transaction_date) AS d
    FROM records
    WHERE transaction_date IS NOT NULL AND transaction_date <> ''
  `).get() as { total: number; d: string | null };
  return NextResponse.json({ count: row.total, latest_date: row.d ?? "" });
}
