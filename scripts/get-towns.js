const Database = require("better-sqlite3");
const db = new Database("data/realprice.db", { readonly: true });
const rows = db.prepare("SELECT DISTINCT city, town FROM records WHERE town IS NOT NULL AND town != '' ORDER BY city, town").all();
const map = {};
rows.forEach(r => { if (!map[r.city]) map[r.city] = []; map[r.city].push(r.town); });
console.log(JSON.stringify(map));
db.close();
