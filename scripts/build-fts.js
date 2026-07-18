const Database = require("better-sqlite3");
const db = new Database("data/realprice.db");

console.log("Creating FTS5 table...");
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS records_fts
  USING fts5(id UNINDEXED, address, content=records, content_rowid=id)
`);

console.log("Rebuilding FTS index (this may take a few minutes)...");
const t0 = Date.now();
db.exec(`INSERT INTO records_fts(records_fts) VALUES('rebuild')`);
console.log("Done in", Math.round((Date.now() - t0) / 1000), "seconds");

const count = db.prepare("SELECT COUNT(*) as c FROM records_fts").get();
console.log("FTS rows:", count.c);

db.close();
