const Database = require("better-sqlite3");
const db = new Database("data/realprice.db");

const indexes = [
  // Composite indexes for common filter + ORDER BY transaction_date DESC patterns
  { name: "idx_city_date", sql: "CREATE INDEX IF NOT EXISTS idx_city_date ON records(city, transaction_date DESC)" },
  { name: "idx_deal_date", sql: "CREATE INDEX IF NOT EXISTS idx_deal_date ON records(deal_type, transaction_date DESC)" },
  { name: "idx_total_date", sql: "CREATE INDEX IF NOT EXISTS idx_total_date ON records(total_price, transaction_date DESC)" },
  { name: "idx_unit_date", sql: "CREATE INDEX IF NOT EXISTS idx_unit_date ON records(unit_price, transaction_date DESC)" },
  { name: "idx_city_deal_date", sql: "CREATE INDEX IF NOT EXISTS idx_city_deal_date ON records(city, deal_type, transaction_date DESC)" },
  { name: "idx_town_date", sql: "CREATE INDEX IF NOT EXISTS idx_town_date ON records(town, transaction_date DESC)" },
];

for (const idx of indexes) {
  console.log(`Creating ${idx.name}...`);
  const t0 = Date.now();
  db.exec(idx.sql);
  console.log(`  Done in ${Date.now() - t0}ms`);
}

db.close();
console.log("All indexes created.");
