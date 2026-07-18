import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { getDb } from "./db";
import { getCityName, getDealType } from "./city-map";
import { getTownCoord } from "./town-coords";

export interface ImportResult {
  files: number;
  inserted: number;
  skipped: number;
  errors: number;
  message: string;
}

function parseFileName(name: string) {
  const base = name.replace(/\.csv$/i, "");
  const m = base.match(/^([a-z])_lvr_land_([abc])(?:_(build|land|park))?$/i);
  if (!m) return null;
  const code = m[1].toLowerCase();
  const type = m[2].toLowerCase();
  const sub = (m[3] || "main").toLowerCase();
  return {
    cityCode: code,
    city: getCityName(code),
    dealType: getDealType(type),
    recordType: sub === "build" ? "建物" : sub === "land" ? "土地" : sub === "park" ? "車位" : "主檔",
  };
}

function toNum(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// 遞迴掃描資料夾下所有符合實價登錄命名規則的 CSV（含各層子資料夾）
function walkCsv(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkCsv(p));
    else if (e.name.toLowerCase().endsWith(".csv") && /^._lvr_land_.*\.csv$/i.test(e.name)) out.push(p);
  }
  return out;
}

export function importFromFolder(folderPath: string): ImportResult {
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    return { files: 0, inserted: 0, skipped: 0, errors: 0, message: `路徑不存在或不是資料夾: ${folderPath}` };
  }
  const files = walkCsv(folderPath);

  const db = getDb();
  const result: ImportResult = { files: files.length, inserted: 0, skipped: 0, errors: 0, message: "" };
  const insertStmt = db.prepare(`
    INSERT INTO records
    (city, city_code, deal_type, record_type, town, transaction_sign, address, transaction_date,
     transaction_count, total_floors, building_state, main_use, build_complete_date, building_area,
     rooms, halls, baths, total_price, unit_price, berth_type, berth_area, berth_price, note,
     serial_no, transfer_no, build_case_name, building_no, construction_company, base_area,
     total_units, public_ratio, form_type, lat, lng)
    VALUES
    (@city, @city_code, @deal_type, @record_type, @town, @transaction_sign, @address, @transaction_date,
     @transaction_count, @total_floors, @building_state, @main_use, @build_complete_date, @building_area,
     @rooms, @halls, @baths, @total_price, @unit_price, @berth_type, @berth_area, @berth_price, @note,
     @serial_no, @transfer_no, @build_case_name, @building_no, @construction_company, @base_area,
     @total_units, @public_ratio, @form_type, @lat, @lng)
  `);

  for (const file of files) {
    const meta = parseFileName(path.basename(file));
    if (!meta) continue;
    const full = file;
    let raw = fs.readFileSync(full, "utf8");
    raw = raw.replace(/^\uFEFF/, "");
    const lines = raw.split(/\r?\n/);
    // 第1行=中文標題(保留為 header), 第2行=英文標題(跳過), 第3行起=資料
    const dataCsv = [lines[0], ...lines.slice(2)].join("\n");
    let rows: any[];
    try {
      const parsed = Papa.parse(dataCsv, { header: true, skipEmptyLines: true });
      rows = parsed.data as any[];
    } catch {
      result.errors++;
      continue;
    }
    const run = db.transaction((rs: any[]) => {
      for (let ri = 0; ri < rs.length; ri++) {
        const r = rs[ri];
        try {
          const town = r["鄉鎮市區"] || "";
          const coord = getTownCoord(meta.city, town);
          // 不去重：每一筆都直接寫入。transfer_no 僅作追溯用（完整路徑+列序），可重複。
          const transferNo = `${file}#${ri}`;
          const info = insertStmt.run({
            city: meta.city,
            city_code: meta.cityCode,
            deal_type: meta.dealType,
            record_type: meta.recordType,
            town,
            transaction_sign: r["交易標的"] || "",
            address: r["土地位置建物門牌"] || "",
            transaction_date: r["交易年月日"] || "",
            transaction_count: r["交易筆棟數"] || "",
            total_floors: r["總樓層數"] || "",
            building_state: r["建物型態"] || "",
            main_use: r["主要用途"] || "",
            build_complete_date: r["建築完成年月"] || "",
            building_area: toNum(r["建物移轉總面積平方公尺"]),
            rooms: toNum(r["建物現況格局-房"]),
            halls: toNum(r["建物現況格局-廳"]),
            baths: toNum(r["建物現況格局-衛"]),
            total_price: toNum(r["總價元"]),
            unit_price: toNum(r["單價元平方公尺"]),
            berth_type: r["車位類別"] || "",
            berth_area: toNum(r["車位移轉總面積平方公尺"]),
            berth_price: toNum(r["車位總價元"]),
            note: r["備註"] || "",
            serial_no: r["編號"] || "",
            transfer_no: transferNo,
            build_case_name: r["建案名稱"] || "",
            building_no: r["棟及號"] || "",
            construction_company: r["建設公司"] || "",
            base_area: r["基地面積"] || "",
            total_units: r["總戶數"] || "",
            public_ratio: r["公設比"] || "",
            form_type: r["型式"] || "",
            lat: coord ? coord.lat : null,
            lng: coord ? coord.lng : null,
          });
          result.inserted++;
        } catch {
          result.errors++;
        }
      }
    });
    try { run(rows); }
    catch { result.errors += rows.length; }
  }
  result.message = `完成：處理 ${result.files} 個檔，新增 ${result.inserted} 筆，跳過(重複) ${result.skipped} 筆，錯誤 ${result.errors} 筆`;
  return result;
}
