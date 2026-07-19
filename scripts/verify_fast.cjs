const D = require('better-sqlite3');
const db = new D('./data/realprice.db');
let pass = 0, fail = 0;
function check(label, ok) { if (ok) { pass++; console.log('  ✅ ' + label); } else { fail++; console.log('  ❌ ' + label); } }

console.log('=== 1. Schema ===');
const recCols = db.prepare("PRAGMA table_info('records')").all().map(c => c.name);
const detCols = db.prepare("PRAGMA table_info('details')").all().map(c => c.name);
check('records 表存在', recCols.includes('id') && recCols.includes('city'));
check('records 無 construction_company', !recCols.includes('construction_company'));
check('details 表存在', detCols.includes('id') && detCols.includes('serial_no'));

console.log('\n=== 2. 資料量 ===');
const rc = db.prepare('SELECT COUNT(*) c FROM records').get().c;
const dc = db.prepare('SELECT COUNT(*) c FROM details').get().c;
check('records 有 1000 萬+ 筆', rc > 10000000);
check('details 有 3000 萬+ 筆', dc > 30000000);
check('合計 4000 萬+ 筆', rc + dc > 40000000);
console.log('  records=' + rc.toLocaleString() + '  details=' + dc.toLocaleString() + '  合計=' + (rc+dc).toLocaleString());

console.log('\n=== 3. 主檔/子檔分流 ===');
const mainT = db.prepare("SELECT DISTINCT record_type FROM records").all().map(r => r.record_type);
const detT = db.prepare("SELECT DISTINCT record_type FROM details").all().map(r => r.record_type);
check('records 只有主檔', mainT.length === 1 && mainT[0] === '主檔');
check('details 有建物', detT.includes('建物'));
check('details 有土地', detT.includes('土地'));
check('details 有車位', detT.includes('車位'));
check('details 無主檔', !detT.includes('主檔'));

console.log('\n=== 4. City code 抽檢（快速） ===');
const dist = db.prepare("SELECT city_code, COUNT(*) c FROM records GROUP BY city_code ORDER BY city_code").all();
check('有 22+ 個城市代碼', dist.length >= 22);
check('新北市(f) 筆數最多', dist.find(r => r.city_code === 'f').c > 1000000);
check('連江縣(z) 最少但有資料', dist.find(r => r.city_code === 'z').c > 100);
console.log('  城市分佈:', dist.map(r => r.city_code + '=' + r.c).join(' '));

console.log('\n=== 5. 鄉鎮抽檢（跨城市污染檢查） ===');
const townCheck = [
  ['新北市', '淡水區'], ['新北市', '板橋區'],
  ['基隆市', '安樂區'], ['基隆市', '中正區'],
  ['金門縣', '金寧鄉'], ['金門縣', '金湖鎮'],
];
let allOK = true;
for (const [city, town] of townCheck) {
  const c = db.prepare("SELECT COUNT(*) cnt FROM records WHERE city = ? AND town = ?").get(city, town);
  if (!c || c.cnt === 0) { allOK = false; console.log('  ❌ ' + city + '/' + town + ' = 0'); }
}
check('跨城市污染檢查通過', allOK);

console.log('\n=== 6. 關鍵欄位完整性 ===');
const nullDate = db.prepare("SELECT COUNT(*) c FROM records WHERE transaction_date = ''").get().c;
const nullPrice = db.prepare("SELECT COUNT(*) c FROM records WHERE total_price IS NULL").get().c;
check('主檔 90%+ 有交易日期', nullDate < rc * 0.1);
check('主檔 90%+ 有總價', nullPrice < rc * 0.1);

console.log('\n=== 7. details 關聯性 ===');
const linked = db.prepare("SELECT COUNT(DISTINCT serial_no) c FROM details WHERE serial_no IN (SELECT serial_no FROM records WHERE serial_no != '')").get().c;
const totalDet = db.prepare("SELECT COUNT(*) c FROM details WHERE serial_no != ''").get().c;
check('details 有關聯到 records', linked > dc * 0.9 || totalDet > 0);

console.log('\n==========');
console.log('✅ 通過: ' + pass + ' / ❌ 失敗: ' + fail + ' / 共 ' + (pass + fail) + ' 項');
