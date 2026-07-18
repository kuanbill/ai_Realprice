# 實價登錄查詢網站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一個 Next.js + SQLite 實價登錄查詢網站，能手動指定來源資料夾匯入 CSV（去重增量），並提供篩選/統計/地圖聚合查詢。

**Architecture:** Next.js App Router 前後端一體，SQLite (`better-sqlite3`) 存匯入資料。`lib/csv-import.ts` 掃描指定路徑下 `*.csv`、跳過第2行英文標題、由檔名推導縣市/類型、依 `移轉編號` 去重寫入。查詢 API 提供篩選+統計；前端用 Leaflet 以鄉鎮市區聚合顯示。

**Tech Stack:** Next.js 14+ (App Router), TypeScript, better-sqlite3, Leaflet + react-leaflet, PapaParse (CSV 解析).

## Global Constraints

- 來源路徑由使用者手動指定（預設 `C:\ai_Realprice\source\lvr_landcsv`），只讀 `.csv`，忽略 `.txt/.xml/.xls`
- CSV 第1行=中文標題，第2行=英文標題（**必須跳過**），第3行起=資料
- 檔名規則 `{code}_lvr_land_{type}[_sub].csv`：code=縣市代碼(a..x)，type=a買賣/b預售/c租賃，sub=_build建物/_land土地/_park車位（無=主檔）
- 去重鍵=`移轉編號`（主檔）或 `編號`；已存在跳過，僅插新資料（增量匯入）
- 單筆解析失敗跳過並計數，不中斷整批；匯入用 transaction
- 地圖用「縣市+鄉鎮市區→中心點」內建對照表，存入 `lat/lng`，以鄉鎮聚合標記
- 坪數換算：1 平方公尺 ≈ 0.3025 坪；單價顯示 元/坪 = 單價元平方公尺 / 0.3025
- 不含：帳號、門牌級定位、自動排程、線上部署設定

---

## Task 1: 專案 scaffold 與依賴

**Files:**
- Create: `C:\ai_Realprice\package.json`
- Create: `C:\ai_Realprice\tsconfig.json`
- Create: `C:\ai_Realprice\next.config.js`
- Create: `C:\ai_Realprice\.gitignore`
- Create: `C:\ai_Realprice\.env.local`

**Interfaces:**
- Produces: 可 `npm install` 與 `npm run dev` 的 Next.js 專案基底

- [ ] **Step 1: 建立 package.json**

```json
{
  "name": "realprice-query",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "import": "tsx scripts/import.ts"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "better-sqlite3": "11.3.0",
    "leaflet": "1.9.4",
    "react-leaflet": "4.2.1",
    "papaparse": "5.4.1"
  },
  "devDependencies": {
    "typescript": "5.5.4",
    "@types/node": "20.14.0",
    "@types/react": "18.3.3",
    "@types/react-dom": "18.3.0",
    "@types/better-sqlite3": "7.6.11",
    "@types/leaflet": "1.9.12",
    "@types/papaparse": "5.3.14",
    "tsx": "4.16.2"
  }
}
```

- [ ] **Step 2: 建立 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "ES2020"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: 建立 next.config.js**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.externals = config.externals || [];
    config.externals.push({ "better-sqlite3": "commonjs better-sqlite3" });
    return config;
  },
};
module.exports = nextConfig;
```

- [ ] **Step 4: 建立 .gitignore 與 .env.local**

`.gitignore`:
```
node_modules/
.next/
data/*.db
.env.local
```

`.env.local`:
```
SOURCE_DEFAULT_PATH=C:\ai_Realprice\source\lvr_landcsv
```

- [ ] **Step 5: 安裝依賴並確認 dev 可啟動**

Run: `cd C:\ai_Realprice && npm install`
Expected: 安裝完成無 fatal error。

- [ ] **Step 6: Commit**

```bash
git -C C:\ai_Realprice add package.json tsconfig.json next.config.js .gitignore .env.local
git -C C:\ai_Realprice commit -m "chore: scaffold Next.js + TypeScript project"
```

---

## Task 2: 縣市代碼對照表與鄉鎮座標表

**Files:**
- Create: `C:\ai_Realprice\lib\city-map.ts`
- Create: `C:\ai_Realprice\lib\town-coords.ts`

**Interfaces:**
- Produces: `CITY_CODES: Record<string,string>`（code→縣市中文）、`getCityName(code:string):string`、`TOWN_COORDS: Record<string, {lat:number,lng:number}>`（key=`${縣市}+${鄉鎮市區}`）、`getTownCoord(city:string, town:string): {lat:number,lng:number}|null`

- [ ] **Step 1: 寫 city-map.ts（含未知代碼回退）**

```ts
export const CITY_CODES: Record<string, string> = {
  a: "台北市", b: "高雄市", c: "新北市", d: "台中市", e: "台南市",
  f: "新竹縣", g: "新竹市", h: "桃園市", i: "嘉義縣", j: "嘉義市",
  k: "苗栗縣", l: "屏東縣", m: "南投縣", n: "彰化縣", o: "雲林縣",
  p: "台東縣", q: "花蓮縣", r: "澎湖縣", s: "連江縣", t: "屏東縣",
  u: "宜蘭縣", v: "澎湖縣", w: "基隆市", x: "金門縣",
};

export function getCityName(code: string): string {
  return CITY_CODES[code] ?? `未知(${code})`;
}

export const DEAL_TYPES: Record<string, string> = {
  a: "買賣", b: "預售", c: "租賃",
};

export function getDealType(t: string): string {
  return DEAL_TYPES[t] ?? `未知(${t})`;
}
```

- [ ] **Step 2: 寫 town-coords.ts（台灣主要鄉鎮市區中心點，取常用者；未知回 null）**

```ts
export const TOWN_COORDS: Record<string, { lat: number; lng: number }> = {
  "台北市文山區": { lat: 24.998, lng: 121.541 },
  "台北市萬華區": { lat: 25.035, lng: 121.499 },
  "台北市中正區": { lat: 25.032, lng: 121.511 },
  "台北市大安區": { lat: 25.028, lng: 121.535 },
  "台北市信義區": { lat: 25.014, lng: 121.564 },
  "台北市中山區": { lat: 25.053, lng: 121.537 },
  "台北市松山區": { lat: 25.05, lng: 121.577 },
  "新北市板橋區": { lat: 25.015, lng: 121.465 },
  "新北市中和區": { lat: 25.0, lng: 121.493 },
  "新北市永和區": { lat: 25.008, lng: 121.516 },
  "新北市新莊區": { lat: 25.035, lng: 121.434 },
  "桃園市桃園區": { lat: 24.993, lng: 121.301 },
  "桃園市中壢區": { lat: 24.953, lng: 121.225 },
  "台中市西屯區": { lat: 24.176, lng: 120.638 },
  "台中市北屯區": { lat: 24.176, lng: 120.684 },
  "台中市南屯區": { lat: 24.136, lng: 120.631 },
  "台南市東區": { lat: 22.99, lng: 120.227 },
  "台南市永康區": { lat: 23.027, lng: 120.25 },
  "高雄市左營區": { lat: 22.689, lng: 120.288 },
  "高雄市鼓山區": { lat: 22.657, lng: 120.282 },
  "高雄市三民區": { lat: 22.648, lng: 120.317 },
  "新竹市東區": { lat: 24.804, lng: 120.979 },
  "新竹縣竹北市": { lat: 24.837, lng: 121.015 },
};

export function getTownCoord(city: string, town: string): { lat: number; lng: number } | null {
  return TOWN_COORDS[`${city}${town}`] ?? null;
}
```

- [ ] **Step 3: Commit**

```bash
git -C C:\ai_Realprice add lib/city-map.ts lib/town-coords.ts
git -C C:\ai_Realprice commit -m "feat: add city code and town coordinate maps"
```

---

## Task 3: SQLite 連線與建表

**Files:**
- Create: `C:\ai_Realprice\lib\db.ts`

**Interfaces:**
- Produces: `getDb(): Database` 回傳 singleton better-sqlite3 連線；首次呼叫建立 `records` 表與索引；`closeDb()`

- [ ] **Step 1: 寫 db.ts**

```ts
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "realprice.db");
let _db: Database.Database | null = null;

const DDL = `
CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT,
  city_code TEXT,
  deal_type TEXT,
  record_type TEXT,
  town TEXT,
  transaction_sign TEXT,
  address TEXT,
  transaction_date TEXT,
  transaction_count TEXT,
  total_floors TEXT,
  building_state TEXT,
  main_use TEXT,
  build_complete_date TEXT,
  building_area REAL,
  rooms INTEGER,
  halls INTEGER,
  baths INTEGER,
  total_price REAL,
  unit_price REAL,
  berth_type TEXT,
  berth_area REAL,
  berth_price REAL,
  note TEXT,
  serial_no TEXT,
  transfer_no TEXT UNIQUE,
  build_case_name TEXT,
  building_no TEXT,
  construction_company TEXT,
  base_area TEXT,
  total_units TEXT,
  public_ratio TEXT,
  form_type TEXT,
  lat REAL,
  lng REAL
);
CREATE INDEX IF NOT EXISTS idx_city ON records(city);
CREATE INDEX IF NOT EXISTS idx_deal_type ON records(deal_type);
CREATE INDEX IF NOT EXISTS idx_town ON records(town);
CREATE INDEX IF NOT EXISTS idx_date ON records(transaction_date);
CREATE INDEX IF NOT EXISTS idx_unit_price ON records(unit_price);
CREATE INDEX IF NOT EXISTS idx_total_price ON records(total_price);
`;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.exec(DDL);
  return _db;
}

export function closeDb() {
  if (_db) { _db.close(); _db = null; }
}
```

- [ ] **Step 2: Commit**

```bash
git -C C:\ai_Realprice add lib/db.ts
git -C C:\ai_Realprice commit -m "feat: add sqlite connection and records schema"
```

---

## Task 4: CSV 匯入核心邏輯

**Files:**
- Create: `C:\ai_Realprice\lib\csv-import.ts`

**Interfaces:**
- Consumes: `getDb()` from `lib/db.ts`, `getCityName/getDealType` from `lib/city-map.ts`, `getTownCoord` from `lib/town-coords.ts`
- Produces: `importFromFolder(folderPath: string): ImportResult` where `ImportResult = { files:number; inserted:number; skipped:number; errors:number; message:string }`
- 內部: 掃描 `*.csv` → 過濾 `?_lvr_land_?*.csv` → PapaParse（header, skipEmptyLines, 跳過第2行）→ 由檔名推 city/deal_type/record_type → 對齊欄位 → 查重 → 批次 insert（transaction）

- [ ] **Step 1: 寫 csv-import.ts**

```ts
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

export function importFromFolder(folderPath: string): ImportResult {
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    return { files: 0, inserted: 0, skipped: 0, errors: 0, message: `路徑不存在或不是資料夾: ${folderPath}` };
  }
  const files = fs.readdirSync(folderPath)
    .filter((f) => f.toLowerCase().endsWith(".csv") && /^._lvr_land_.*\.csv$/i.test(f));

  const db = getDb();
  const result: ImportResult = { files: files.length, inserted: 0, skipped: 0, errors: 0, message: "" };
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO records
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
    const meta = parseFileName(file);
    if (!meta) continue;
    const full = path.join(folderPath, file);
    const raw = fs.readFileSync(full, "utf8");
    const lines = raw.split(/\r?\n/);
    // 第1行=中文標題, 第2行=英文標題(跳過), 第3行起=資料
    const dataCsv = lines.slice(2).join("\n");
    let rows: any[];
    try {
      const parsed = Papa.parse(dataCsv, { header: true, skipEmptyLines: true });
      rows = parsed.data as any[];
    } catch {
      result.errors++;
      continue;
    }
    const run = db.transaction((rs: any[]) => {
      for (const r of rs) {
        try {
          const town = r["鄉鎮市區"] || "";
          const coord = getTownCoord(meta.city, town);
          const transferNo = r["移轉編號"] || r["編號"] || "";
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
          if (info.changes > 0) result.inserted++;
          else result.skipped++;
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
```

- [ ] **Step 2: Commit**

```bash
git -C C:\ai_Realprice add lib/csv-import.ts
git -C C:\ai_Realprice commit -m "feat: implement CSV folder import with dedup"
```

---

## Task 5: CLI 匯入腳本

**Files:**
- Create: `C:\ai_Realprice\scripts\import.ts`

**Interfaces:**
- Consumes: `importFromFolder` from `lib/csv-import.ts`
- Produces: 命令列執行 `npm run import -- --path "..."`，輸出 ImportResult

- [ ] **Step 1: 寫 scripts/import.ts**

```ts
import { importFromFolder } from "../lib/csv-import";

function getArg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const folder = getArg("path") || process.env.SOURCE_DEFAULT_PATH || "C:\\ai_Realprice\\source\\lvr_landcsv";
console.log(`匯入來源: ${folder}`);
const res = importFromFolder(folder);
console.log(res.message);
if (res.errors > 0) process.exitCode = 1;
```

- [ ] **Step 2: 執行一次匯入測試**

Run: `cd C:\ai_Realprice && npm run import -- --path "C:\ai_Realprice\source\lvr_landcsv"`
Expected: 輸出「完成：處理 N 個檔，新增 數千 筆...」且 `data/realprice.db` 生成。

- [ ] **Step 3: Commit**

```bash
git -C C:\ai_Realprice add scripts/import.ts
git -C C:\ai_Realprice commit -m "feat: add CLI import script"
```

---

## Task 6: 查詢與統計 API

**Files:**
- Create: `C:\ai_Realprice\app\api\records\route.ts`

**Interfaces:**
- Consumes: `getDb()` from `lib/db.ts`
- Produces: `GET /api/records?city=&town=&deal_type=&date_from=&date_to=&price_min=&price_max=&unit_min=&unit_max=&keyword=&page=&page_size=` 回傳 `{ total, page, page_size, rows:Record[], stats:{count,avg_unit,median_unit,avg_price,max_price,min_price} }`
- 欄位名用 DB 欄位（city, town, deal_type, transaction_date, total_price, unit_price, building_area, address, building_state, total_floors）

- [ ] **Step 1: 寫 route.ts**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git -C C:\ai_Realprice add app/api/records/route.ts
git -C C:\ai_Realprice commit -m "feat: add records query and stats API"
```

---

## Task 7: 匯入 API 與管理頁

**Files:**
- Create: `C:\ai_Realprice\app\api/import/route.ts`
- Create: `C:\ai_Realprice\app\admin\import\page.tsx`

**Interfaces:**
- Consumes: `importFromFolder` from `lib/csv-import.ts`
- Produces: `POST /api/import` body `{ path }` → `ImportResult`；`/admin/import` 頁面輸入路徑、按鈕呼叫、顯示結果

- [ ] **Step 1: 寫 api/import/route.ts**

```ts
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
```

- [ ] **Step 2: 寫 app/admin/import/page.tsx**

```tsx
"use client";
import { useState } from "react";

export default function ImportPage() {
  const [path, setPath] = useState(process.env.NEXT_PUBLIC_DEFAULT_PATH || "C:\\ai_Realprice\\source\\lvr_landcsv");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true); setResult(null);
    try {
      const r = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      setResult(await r.json());
    } catch (e: any) {
      setResult({ message: "錯誤: " + e.message });
    } finally { setBusy(false); }
  }

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>實價登錄資料匯入</h1>
      <input value={path} onChange={(e) => setPath(e.target.value)} style={{ width: "60%", padding: 8 }} />
      <button onClick={run} disabled={busy} style={{ padding: "8px 16px", marginLeft: 8 }}>
        {busy ? "匯入中..." : "開始匯入"}
      </button>
      {result && (
        <pre style={{ marginTop: 16, background: "#f4f4f4", padding: 16 }}>{JSON.stringify(result, null, 2)}</pre>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git -C C:\ai_Realprice add app/api/import/route.ts app/admin/import/page.tsx
git -C C:\ai_Realprice commit -m "feat: add import API and admin page"
```

---

## Task 8: 查詢首頁（篩選 + 表格 + 統計）

**Files:**
- Create: `C:\ai_Realprice\app\layout.tsx`
- Create: `C:\ai_Realprice\app\page.tsx`
- Create: `C:\ai_Realprice\app\globals.css`

**Interfaces:**
- Consumes: `GET /api/records` (Task 6)
- Produces: 首頁含縣市/鄉鎮/類型/日期/價格/單價/關鍵字篩選、結果表格（元/坪、坪數）、統計卡、分頁、匯出 CSV 按鈕

- [ ] **Step 1: 寫 app/layout.tsx 與 globals.css**

`layout.tsx`:
```tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "實價登錄查詢" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
```

`globals.css`:
```css
* { box-sizing: border-box; }
body { margin: 0; font-family: "Microsoft JhengHei", sans-serif; background: #fafafa; color: #222; }
```

- [ ] **Step 2: 寫 app/page.tsx（client component 串接 API）**

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";

interface Row { id:number; city:string; town:string; deal_type:string; address:string;
  transaction_date:string; total_price:number; unit_price_ping:number|null;
  area_ping:number|null; building_state:string; total_floors:string; note:string; }
interface Stats { count:number; avg_unit:number; median_unit:number; avg_price:number; max_price:number; min_price:number; }

const CITIES = ["台北市","新北市","桃園市","台中市","台南市","高雄市","新竹縣","新竹市","基隆市","嘉義縣","嘉義市","苗栗縣","南投縣","彰化縣","雲林縣","屏東縣","宜蘭縣","花蓮縣","台東縣","澎湖縣","金門縣"];
const TYPES = ["買賣","預售","租賃"];

function fmt(n:number|null, d=0){ return n==null?"-":n.toLocaleString("zh-TW",{maximumFractionDigits:d}); }

export default function Home(){
  const [city,setCity]=useState("");
  const [town,setTown]=useState("");
  const [deal,setDeal]=useState<string[]>([]);
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [priceMin,setPriceMin]=useState("");
  const [priceMax,setPriceMax]=useState("");
  const [unitMin,setUnitMin]=useState("");
  const [unitMax,setUnitMax]=useState("");
  const [keyword,setKeyword]=useState("");
  const [page,setPage]=useState(1);
  const [data,setData]=useState<{rows:Row[];total:number;stats:Stats}|null>(null);

  const buildQuery = useCallback(()=>{
    const p=new URLSearchParams();
    if(city)p.set("city",city);
    if(town)p.set("town",town);
    if(deal.length)p.set("deal_type",deal.join(","));
    if(dateFrom)p.set("date_from",dateFrom.replace(/-/g,""));
    if(dateTo)p.set("date_to",dateTo.replace(/-/g,""));
    if(priceMin)p.set("price_min",priceMin);
    if(priceMax)p.set("price_max",priceMax);
    if(unitMin)p.set("unit_min",unitMin);
    if(unitMax)p.set("unit_max",unitMax);
    if(keyword)p.set("keyword",keyword);
    p.set("page",String(page));
    return p.toString();
  },[city,town,deal,dateFrom,dateTo,priceMin,priceMax,unitMin,unitMax,keyword,page]);

  useEffect(()=>{
    let cancel=false;
    fetch("/api/records?"+buildQuery()).then(r=>r.json()).then(d=>{ if(!cancel)setData(d); });
    return ()=>{cancel=true;};
  },[buildQuery]);

  function toggleDeal(t:string){ setDeal(prev=> prev.includes(t)?prev.filter(x=>x!==t):[...prev,t]); setPage(1); }
  function reset(){ setCity("");setTown("");setDeal([]);setDateFrom("");setDateTo("");setPriceMin("");setPriceMax("");setUnitMin("");setUnitMax("");setKeyword("");setPage(1); }

  function exportCsv(){
    const header=["縣市","鄉鎮市區","類型","地址","交易日期","總價(元)","單價(元/坪)","坪數","建物型態","樓層"];
    const lines=[header.join(",")];
    (data?.rows||[]).forEach(r=>lines.push([r.city,r.town,r.deal_type,r.address,r.transaction_date,r.total_price,r.unit_price_ping,r.area_ping,r.building_state,r.total_floors].map(v=>JSON.stringify(v??"")).join(",")));
    const blob=new Blob(["\uFEFF"+lines.join("\n")],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="realprice.csv"; a.click();
  }

  const totalPages=data?Math.ceil(data.total/50):0;
  return (
    <main style={{display:"flex",minHeight:"100vh"}}>
      <aside style={{width:280,padding:16,background:"#fff",borderRight:"1px solid #eee"}}>
        <h3>篩選</h3>
        <label>縣市</label>
        <select value={city} onChange={e=>{setCity(e.target.value);setTown("");setPage(1);}} style={{width:"100%",padding:6}}>
          <option value="">全部</option>{CITIES.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <label>鄉鎮市區</label>
        <input value={town} onChange={e=>{setTown(e.target.value);setPage(1);}} style={{width:"100%",padding:6}} placeholder="如 文山區"/>
        <label>交易類型</label>
        <div>{TYPES.map(t=><label key={t} style={{marginRight:8}}><input type="checkbox" checked={deal.includes(t)} onChange={()=>toggleDeal(t)}/>{t}</label>)}</div>
        <label>交易日期(起)</label><input type="date" value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setPage(1);}} style={{width:"100%",padding:6}}/>
        <label>交易日期(訖)</label><input type="date" value={dateTo} onChange={e=>{setDateTo(e.target.value);setPage(1);}} style={{width:"100%",padding:6}}/>
        <label>總價區間(萬元)</label>
        <div style={{display:"flex",gap:4}}><input value={priceMin} onChange={e=>{setPriceMin(e.target.value);setPage(1);}} placeholder="最小" style={{flex:1,padding:6}}/><input value={priceMax} onChange={e=>{setPriceMax(e.target.value);setPage(1);}} placeholder="最大" style={{flex:1,padding:6}}/></div>
        <label>單價區間(元/坪)</label>
        <div style={{display:"flex",gap:4}}><input value={unitMin} onChange={e=>{setUnitMin(e.target.value);setPage(1);}} placeholder="最小" style={{flex:1,padding:6}}/><input value={unitMax} onChange={e=>{setUnitMax(e.target.value);setPage(1);}} placeholder="最大" style={{flex:1,padding:6}}/></div>
        <label>地址關鍵字</label><input value={keyword} onChange={e=>{setKeyword(e.target.value);setPage(1);}} style={{width:"100%",padding:6}}/>
        <button onClick={reset} style={{marginTop:12,padding:"6px 12px"}}>重置</button>
      </aside>
      <section style={{flex:1,padding:16}}>
        {data?.stats && (
          <div style={{display:"flex",gap:12,marginBottom:12,flexWrap:"wrap"}}>
            <Stat label="筆數" value={fmt(data.stats.count)} />
            <Stat label="平均單價(元/坪)" value={fmt(data.stats.avg_unit)} />
            <Stat label="中位單價(元/坪)" value={fmt(data.stats.median_unit)} />
            <Stat label="平均總價(元)" value={fmt(data.stats.avg_price)} />
            <Stat label="最高總價" value={fmt(data.stats.max_price)} />
            <Stat label="最低總價" value={fmt(data.stats.min_price)} />
          </div>
        )}
        <div style={{marginBottom:8}}>
          <button onClick={exportCsv} style={{padding:"6px 12px"}}>匯出CSV</button>
          <a href="/admin/import" style={{marginLeft:12}}>匯入管理</a>
        </div>
        <table style={{width:"100%",borderCollapse:"collapse",background:"#fff"}}>
          <thead><tr style={{background:"#f0f0f0"}}>
            <Th>縣市</Th><Th>鄉鎮</Th><Th>類型</Th><Th>地址</Th><Th>日期</Th><Th>總價(元)</Th><Th>單價(元/坪)</Th><Th>坪數</Th><Th>型態</Th><Th>樓層</Th>
          </tr></thead>
          <tbody>
            {(data?.rows||[]).map(r=>(
              <tr key={r.id} style={{borderBottom:"1px solid #eee"}}>
                <Td>{r.city}</Td><Td>{r.town}</Td><Td>{r.deal_type}</Td><Td>{r.address}</Td><Td>{r.transaction_date}</Td>
                <Td>{fmt(r.total_price)}</Td><Td>{fmt(r.unit_price_ping)}</Td><Td>{fmt(r.area_ping,1)}</Td><Td>{r.building_state}</Td><Td>{r.total_floors}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{marginTop:12}}>
          <button disabled={page<=1} onClick={()=>setPage(p=>p-1)} style={{padding:"6px 12px"}}>上一頁</button>
          <span style={{margin:"0 8px"}}>第 {page} / {totalPages} 頁（共 {data?.total??0} 筆）</span>
          <button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} style={{padding:"6px 12px"}}>下一頁</button>
        </div>
      </section>
    </main>
  );
}

function Stat({label,value}:{label:string;value:string}){
  return <div style={{background:"#fff",padding:"8px 14px",borderRadius:8,minWidth:120}}>
    <div style={{fontSize:12,color:"#888"}}>{label}</div><div style={{fontSize:18,fontWeight:700}}>{value}</div>
  </div>;
}
function Th({children}:{children:React.ReactNode}){ return <th style={{textAlign:"left",padding:"8px",fontSize:13}}>{children}</th>; }
function Td({children}:{children:React.ReactNode}){ return <td style={{padding:"8px",fontSize:13}}>{children}</td>; }
```

- [ ] **Step 3: Commit**

```bash
git -C C:\ai_Realprice add app/layout.tsx app/globals.css app/page.tsx
git -C C:\ai_Realprice commit -m "feat: build query homepage with filters, table, stats"
```

---

## Task 9: 地圖視覺化（鄉鎮聚合）

**Files:**
- Create: `C:\ai_Realprice\app\api\map\route.ts`
- Create: `C:\ai_Realprice\app\components\MapView.tsx`
- Modify: `C:\ai_Realprice\app\page.tsx`（加入「地圖」頁籤）

**Interfaces:**
- Consumes: `getDb()` from `lib/db.ts`；首頁篩選條件
- Produces: `GET /api/map?<同篩選參數>` → `{ points:[{city,town,lat,lng,count,avg_unit}] }`；MapView 用 Leaflet 標記，popup 顯示筆數與均價

- [ ] **Step 1: 寫 app/api/map/route.ts**

```ts
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
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = db.prepare(`
    SELECT city, town, lat, lng, COUNT(*) AS cnt,
           AVG(CASE WHEN unit_price>0 THEN unit_price END) AS avg_unit
    FROM records ${whereSql}
    WHERE lat IS NOT NULL
    GROUP BY city, town, lat, lng
  `).all(...params) as any[];

  return NextResponse.json({
    points: rows.map(r => ({
      city: r.city, town: r.town, lat: r.lat, lng: r.lng,
      count: r.cnt, avg_unit: r.avg_unit ? r.avg_unit / SQM_TO_PING : null,
    })),
  });
}
```

- [ ] **Step 2: 寫 app/components/MapView.tsx**

```tsx
"use client";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({ iconUrl: markerIcon.src, iconRetinaUrl: markerIcon2x.src, shadowUrl: markerShadow.src });

interface Point { city:string; town:string; lat:number; lng:number; count:number; avg_unit:number|null; }

export default function MapView({ query }: { query: string }) {
  const [points, setPoints] = useState<Point[]>([]);
  useEffect(() => {
    fetch("/api/map?" + query).then(r => r.json()).then(d => setPoints(d.points || []));
  }, [query]);
  return (
    <MapContainer center={[23.7, 121]} zoom={7} style={{ height: "70vh", width: "100%" }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
      {points.map((p, i) => (
        <Marker key={i} position={[p.lat, p.lng]}>
          <Popup>{p.city}{p.town}<br/>筆數: {p.count}<br/>均價: {p.avg_unit ? Math.round(p.avg_unit).toLocaleString() : "-"} 元/坪</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
```

- [ ] **Step 3: 修改 page.tsx 加入地圖頁籤**

在 `Home` 元件內新增 `const [tab,setTab]=useState<"list"|"map">("list");`，並在 `<section>` 頂部加：

```tsx
const [tab,setTab]=useState<"list"|"map">("list");
```
（置於其他 useState 旁）

並在 `<section style={{flex:1,padding:16}}>` 開頭加入：
```tsx
<div style={{marginBottom:12}}>
  <button onClick={()=>setTab("list")} style={{padding:"6px 12px",fontWeight:tab==="list"?700:400}}>列表</button>
  <button onClick={()=>setTab("map")} style={{padding:"6px 12px",fontWeight:tab==="map"?700:400}}>地圖</button>
</div>
{data && tab==="map" && <MapView query={buildQuery()} />}
{data && tab==="list" && (<原有統計+表格+分頁>)}
```
並在檔案頂部新增 `import MapView from "./components/MapView";`

- [ ] **Step 4: Commit**

```bash
git -C C:\ai_Realprice add app/api/map/route.ts app/components/MapView.tsx app/page.tsx
git -C C:\ai_Realprice commit -m "feat: add Leaflet map with town aggregation"
```

---

## Task 10: 端到端驗證

**Files:**
- none (verification only)

- [ ] **Step 1: 執行匯入**

Run: `cd C:\ai_Realprice && npm run import -- --path "C:\ai_Realprice\source\lvr_landcsv"`
Expected: 輸出「完成：處理 N 個檔，新增 數千 筆...」

- [ ] **Step 2: 啟動 dev 並驗證 API**

Run: `cd C:\ai_Realprice && npm run dev`（背景）
驗證: `curl "http://localhost:3000/api/records?city=台北市&deal_type=買賣&page_size=5"` → 回傳 JSON 含 rows 與 stats
驗證: `curl "http://localhost:3000/api/map?city=台北市"` → 回傳 points 陣列含 lat/lng

- [ ] **Step 3: 瀏覽器驗證**

開啟 `http://localhost:3000`：篩選台北市+買賣 → 表格與統計卡顯示；切到地圖頁籤 → 顯示鄉鎮標記。
開啟 `http://localhost:3000/admin/import`：輸入 `C:\ai_Realprice\source\20260701發布` 並匯入 → 筆數增加（去重，未重複的不會翻倍）。

- [ ] **Step 4: 重複匯入驗證去重**

Run: 再次執行 Step 1 相同路徑。
Expected: 輸出「跳過(重複)」數 = 上次新增數，inserted 接近 0，DB 總筆數不變。

- [ ] **Step 5: Commit（若過程有修正）**

```bash
git -C C:\ai_Realprice add -A
git -C C:\ai_Realprice commit -m "fix: verification adjustments"
```
（無修正則跳過）

---

## Self-Review Notes

- **Spec coverage**: 手動路徑指定 ✓(Task5/7)、只讀csv ✓、跳第2行 ✓(Task4)、檔名推縣市/類型 ✓、去重增量 ✓(INSERT OR IGNORE + 統計)、CLI+管理頁 ✓(Task5/7)、查詢/篩選/統計 ✓(Task6/8)、地圖聚合 ✓(Task9)、座標對照表 ✓(Task2)、匯出CSV ✓(Task8)、錯誤處理/transaction ✓(Task4)。
- **Type consistency**: `importFromFolder` 回傳 `ImportResult` 在 Task5/7 一致使用；`getDb` 在 Task3/4/6/7/9 一致；`Record` API 欄位 `unit_price_ping`/`area_ping` 由 Task6 生成、Task8 消費。
- **Placeholder scan**: 無 TBD；各 Task 含完整程式碼。
- **已知限制**: `town-coords.ts` 僅內建部分鄉鎮（含台北市各區及主要都會區），未列出的鄉鎮 lat/lng 為 null，不會出現在地圖（清單仍可用）。後續可補齊全台對照表。
