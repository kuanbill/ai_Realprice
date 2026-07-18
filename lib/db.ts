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
  lat REAL,
  lng REAL
);
CREATE INDEX IF NOT EXISTS idx_city_date ON records(city, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_deal_date ON records(deal_type, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_town_date ON records(town, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_date ON records(transaction_date);
CREATE INDEX IF NOT EXISTS idx_unit_date ON records(unit_price, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_total_date ON records(total_price, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_date_total ON records(transaction_date DESC, total_price);
CREATE INDEX IF NOT EXISTS idx_date_unit ON records(transaction_date DESC, unit_price);
CREATE INDEX IF NOT EXISTS idx_city_deal_date ON records(city, deal_type, transaction_date DESC);

CREATE TABLE IF NOT EXISTS details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  serial_no TEXT,
  record_type TEXT,
  building_area REAL,
  main_use TEXT,
  main_materials TEXT,
  build_complete_date TEXT,
  total_floors TEXT,
  building_floor TEXT,
  land_position TEXT,
  land_area REAL,
  use_zoning_code TEXT,
  right_holder_numerator REAL,
  right_holder_denominator REAL,
  parcel TEXT,
  berth_category TEXT,
  berth_price REAL,
  berth_area REAL,
  berth_floor TEXT,
  transaction_situation TEXT
);
CREATE INDEX IF NOT EXISTS idx_details_serial ON details(serial_no);
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
