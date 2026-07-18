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
  transfer_no TEXT,
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
