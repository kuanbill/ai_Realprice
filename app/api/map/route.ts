import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
const SQM_TO_PING = 0.3025;

export function GET(req: NextRequest) {
  const db = getDb();
  const sp = req.nextUrl.searchParams;
  const where: string[] = [];
  const params: any[] = [];
  const city = sp.get("city"); if (city) { where.push("city=?"); params.push(city); }
  const town = sp.get("town"); if (town) { where.push("town=?"); params.push(town); }
  const deal = sp.get("deal_type"); if (deal) { where.push("deal_type=?"); params.push(deal); }
  where.push("lat IS NOT NULL");
  const whereSql = `WHERE ${where.join(" AND ")}`;

  const rows = db.prepare(`
    SELECT city, town, lat, lng, COUNT(*) AS cnt,
           AVG(CASE WHEN unit_price>0 THEN unit_price END) AS avg_unit
    FROM records ${whereSql}
    GROUP BY city, town, lat, lng
  `).all(...params) as any[];

  return NextResponse.json({
    points: rows.map(r => ({
      city: r.city, town: r.town, lat: r.lat, lng: r.lng,
      count: r.cnt, avg_unit: r.avg_unit ? r.avg_unit / SQM_TO_PING : null,
    })),
  });
}
