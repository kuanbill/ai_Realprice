import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const SQM_TO_PING = 0.3025;

function toHalfWidth(s: string): string {
  return s.replace(/[\uff01-\uff5e]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function toFullWidth(s: string): string {
  return s.replace(/[!-~]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
}

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
  if (dealType) {
    const types = dealType.split(",").filter(Boolean);
    if (types.length === 1) { where.push("deal_type = ?"); params.push(types[0]); }
    else if (types.length > 1) { where.push(`deal_type IN (${types.map(() => "?").join(",")})`); params.push(...types); }
  }
  if (dateFrom) { where.push("transaction_date >= ?"); params.push(dateFrom); }
  if (dateTo) { where.push("transaction_date <= ?"); params.push(dateTo); }
  if (priceMin) { const v = Number(priceMin) * 10000; if (Number.isFinite(v)) { where.push("total_price >= ?"); params.push(v); } }
  if (priceMax) { const v = Number(priceMax) * 10000; if (Number.isFinite(v)) { where.push("total_price <= ?"); params.push(v); } }
  if (unitMin) { const v = Number(unitMin) * SQM_TO_PING * 10000; if (Number.isFinite(v)) { where.push("unit_price >= ?"); params.push(v); } }
  if (unitMax) { const v = Number(unitMax) * SQM_TO_PING * 10000; if (Number.isFinite(v)) { where.push("unit_price <= ?"); params.push(v); } }
  if (keyword) {
    const half = toHalfWidth(keyword);
    const full = toFullWidth(keyword);
    where.push("records.id IN (SELECT id FROM records_fts WHERE records_fts MATCH ?)");
    params.push(`"${half}" OR "${full}"`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const t0 = Date.now();

  const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM records ${whereSql}`).get(...params) as { c: number };
  const total = totalRow.c;

  const rows = db.prepare(`
    SELECT id, city, town, deal_type, address, transaction_date, total_price, unit_price,
           building_area, building_state, total_floors, rooms, halls, baths, note, serial_no,
           (SELECT building_floor FROM details WHERE serial_no = records.serial_no AND record_type = '建物' LIMIT 1) AS building_floor
    FROM records ${whereSql}
    ORDER BY transaction_date DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize) as any[];

  let statRow: any = { avg_unit:null, avg_price:null, min_price:null, max_price:null, unit_cnt:0 };
  if (total <= 500000) {
    statRow = db.prepare(`
      SELECT
        AVG(unit_price) AS avg_unit,
        AVG(total_price) AS avg_price,
        MIN(total_price) AS min_price,
        MAX(total_price) AS max_price,
        SUM(CASE WHEN unit_price IS NOT NULL THEN 1 ELSE 0 END) AS unit_cnt
      FROM records ${whereSql}
    `).get(...params);
  } else {
    statRow.unit_cnt = total;
  }

  let medianUnit = 0;
  const unitCnt = total <= 500000 ? (statRow.unit_cnt || 0) : 0;
  if (unitCnt > 0 && unitCnt <= 50000) {
    const medianWhere = where.length ? `${whereSql} AND unit_price IS NOT NULL` : `WHERE unit_price IS NOT NULL`;
    const paramsForMedian = where.length ? params : [];
    const offset = Math.floor(unitCnt / 2) - 1;
    const sample = db.prepare(`
      SELECT unit_price FROM records ${medianWhere}
      ORDER BY unit_price LIMIT ? OFFSET ?
    `).all(...paramsForMedian, 2, offset) as { unit_price: number | null }[];
    if (sample.length >= 2) medianUnit = ((sample[0]?.unit_price ?? 0) + (sample[1]?.unit_price ?? 0)) / 2;
    else if (sample.length === 1) medianUnit = sample[0]?.unit_price ?? 0;
  }

  console.log(`[records] ${total} rows, ${Date.now()-t0}ms`);

  return NextResponse.json({
    total, page, page_size: pageSize,
    rows: rows.map(r => ({
      ...r,
      total_price: r.total_price ? r.total_price / 10000 : null,
      unit_price_ping: r.unit_price ? r.unit_price / SQM_TO_PING / 10000 : null,
      area_ping: r.building_area ? r.building_area * SQM_TO_PING : null,
    })),
    stats: {
      count: total,
      avg_unit: total <= 500000 ? (statRow.avg_unit ?? 0) / SQM_TO_PING / 10000 : null,
      median_unit: total <= 500000 ? medianUnit / SQM_TO_PING / 10000 : null,
      avg_price: total <= 500000 ? (statRow.avg_price ?? 0) / 10000 : null,
      max_price: total <= 500000 ? (statRow.max_price ?? 0) / 10000 : null,
      min_price: total <= 500000 ? (statRow.min_price ?? 0) / 10000 : null,
    },
  });
}
