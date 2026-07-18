import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const SQM_TO_PING = 0.3025;

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const db = getDb();
  const sp = req.nextUrl.searchParams;
  const city = sp.get("city") || "";
  const town = sp.get("town") || "";
  const dealType = sp.get("deal_type") || "";
  const dateFrom = sp.get("date_from") || "";
  const dateTo = sp.get("date_to") || "";
  const priceMin = sp.get("price_min") || "";
  const priceMax = sp.get("price_max") || "";
  const unitMin = sp.get("unit_min") || "";
  const unitMax = sp.get("unit_max") || "";
  const keyword = sp.get("keyword") || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const pageSize = Math.min(200, parseInt(sp.get("page_size") || "50", 10));

  const where: string[] = [];
  const params: any[] = [];
  if (city) { where.push("city = ?"); params.push(city); }
  if (town) { where.push("town = ?"); params.push(town); }
  if (dealType) { where.push("deal_type = ?"); params.push(dealType); }
  if (dateFrom) { where.push("transaction_date >= ?"); params.push(dateFrom); }
  if (dateTo) { where.push("transaction_date <= ?"); params.push(dateTo); }
  if (priceMin) { where.push("total_price >= ?"); params.push(Number(priceMin) * 10000); }
  if (priceMax) { where.push("total_price <= ?"); params.push(Number(priceMax) * 10000); }
  if (unitMin) { where.push("unit_price >= ?"); params.push(Number(unitMin) * SQM_TO_PING); }
  if (unitMax) { where.push("unit_price <= ?"); params.push(Number(unitMax) * SQM_TO_PING); }
  if (keyword) { where.push("address LIKE ?"); params.push(`%${keyword}%`); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM records ${whereSql}`).get(...params) as { c: number };
  const total = totalRow.c;

  const rows = db.prepare(`
    SELECT id, city, town, deal_type, address, transaction_date, total_price, unit_price,
           building_area, building_state, total_floors, rooms, halls, baths, note
    FROM records ${whereSql}
    ORDER BY transaction_date DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize) as any[];

  const statRows = db.prepare(`
    SELECT unit_price, total_price FROM records ${whereSql}
  `).all(...params) as { unit_price: number | null; total_price: number | null }[];
  const units = statRows.map(r => r.unit_price).filter((v): v is number => v !== null).sort((a,b)=>a-b);
  const prices = statRows.map(r => r.total_price).filter((v): v is number => v !== null);
  const avg = (arr: number[]) => arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : 0;
  const median = (arr: number[]) => arr.length ? (arr.length%2 ? arr[(arr.length-1)/2] : (arr[arr.length/2-1]+arr[arr.length/2])/2) : 0;

  return NextResponse.json({
    total, page, page_size: pageSize,
    rows: rows.map(r => ({
      ...r,
      unit_price_ping: r.unit_price ? r.unit_price / SQM_TO_PING : null,
      area_ping: r.building_area ? r.building_area * SQM_TO_PING : null,
    })),
    stats: {
      count: total,
      avg_unit: avg(units) / SQM_TO_PING,
      median_unit: median(units) / SQM_TO_PING,
      avg_price: avg(prices),
      max_price: prices.length ? Math.max(...prices) : 0,
      min_price: prices.length ? Math.min(...prices) : 0,
    },
  });
}
