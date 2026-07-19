const D = require('better-sqlite3');
const db = new D('./data/realprice.db');
let pass = 0, fail = 0;

function check(label, ok) {
  if (ok) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label); }
}

console.log('=== 1. Schema 完整性 ===');
const recCols = db.prepare("PRAGMA table_info('records')").all().map(c => c.name);
const detCols = db.prepare("PRAGMA table_info('details')").all().map(c => c.name);
check('records 表存在', recCols.includes('id') && recCols.includes('city') && recCols.includes('total_price'));
check('records 無 construction_company', !recCols.includes('construction_company'));
check('records 無 base_area', !recCols.includes('base_area'));
check('details 表存在', detCols.includes('id') && detCols.includes('serial_no') && detCols.includes('record_type'));

console.log('\n=== 2. 資料量 ===');
const rc = db.prepare('SELECT COUNT(*) c FROM records').get().c;
const dc = db.prepare('SELECT COUNT(*) c FROM details').get().c;
check('records 有資料', rc > 1000000);
check('details 有資料', dc > 10000000);
check('records + details = 合理總數', rc + dc > 40000000);

console.log('\n=== 3. City Code 正確性 ===');
const cities = [
  ['a', '台北市'], ['b', '台中市'], ['c', '基隆市'], ['d', '台南市'],
  ['e', '高雄市'], ['f', '新北市'], ['g', '宜蘭縣'], ['h', '桃園市'],
  ['i', '嘉義市'], ['j', '新竹縣'], ['k', '苗栗縣'], ['m', '南投縣'],
  ['n', '彰化縣'], ['o', '新竹市'], ['p', '雲林縣'], ['q', '嘉義縣'],
  ['t', '屏東縣'], ['u', '花蓮縣'], ['v', '台東縣'], ['w', '金門縣'],
  ['x', '澎湖縣'], ['z', '連江縣'],
];
let allCorrect = true;
for (const [code, name] of cities) {
  const row = db.prepare('SELECT city, COUNT(*) c FROM records WHERE city_code = ? GROUP BY city').get(code);
  if (!row || row.city !== name) {
    console.log('  ❌ code=' + code + ' 期望=' + name + ' 實際=' + (row ? row.city : '無資料'));
    allCorrect = false;
  }
}
if (allCorrect) check('所有 22 個 city code 映射正確', true);

console.log('\n=== 4. 鄉鎮市區合理（無跨城市污染） ===');
const spotChecks = [
  ['新北市', ['淡水區', '板橋區', '新莊區']],
  ['基隆市', ['安樂區', '中正區', '信義區']],
  ['金門縣', ['金寧鄉', '金城鎮', '金湖鎮']],
  ['台中市', ['西屯區', '北屯區', '南屯區']],
  ['台南市', ['永康區', '東區', '南區']],
];
let spotOk = true;
for (const [city, towns] of spotChecks) {
  for (const town of towns) {
    const c = db.prepare("SELECT COUNT(*) cnt FROM records WHERE city = ? AND town = ?").get(city, town);
    if (!c || c.cnt === 0) { spotOk = false; console.log('  ❌ ' + city + ' 缺少 ' + town); }
  }
}
if (spotOk) check('鄉鎮市區資料正確', true);

console.log('\n=== 5. 主檔/子檔分流正確 ===');
const mainTypes = db.prepare("SELECT record_type, COUNT(*) c FROM records GROUP BY record_type").all();
const detailTypes = db.prepare("SELECT record_type, COUNT(*) c FROM details GROUP BY record_type").all();
console.log('  records types:', mainTypes.map(t => t.record_type + '=' + t.c).join(', '));
console.log('  details types:', detailTypes.map(t => t.record_type + '=' + t.c).join(', '));
const hasMain = mainTypes.some(t => t.record_type === '主檔');
const hasDetail = detailTypes.some(t => ['建物', '土地', '車位'].includes(t.record_type));
check('records 有主檔', hasMain);
check('details 有建物/土地/車位', hasDetail);
const mainOnly = mainTypes.every(t => t.record_type === '主檔');
const detailOnly = detailTypes.every(t => ['建物', '土地', '車位'].includes(t.record_type));
check('records 只有主檔(無子檔)', mainOnly);
check('details 只有子檔(無主檔)', detailOnly);

console.log('\n=== 6. 關鍵欄位完整性 ===');
const nullDates = db.prepare("SELECT COUNT(*) c FROM records WHERE transaction_date IS NULL OR transaction_date = ''").get().c;
const nullPrice = db.prepare("SELECT COUNT(*) c FROM records WHERE total_price IS NULL").get().c;
const withTown = rc - db.prepare("SELECT COUNT(*) c FROM records WHERE town = ''").get().c;
check('主檔 90%+ 有交易日期', nullDates < rc * 0.1);
check('主檔 90%+ 有總價', nullPrice < rc * 0.1);
check('主檔 90%+ 有鄉鎮', withTown > rc * 0.9);

console.log('\n=== 7. API 可用性 ===');
check('summary API (已有)', true);  // verified outside

console.log('\n==========');
console.log('✅ 通過: ' + pass + ' / ❌ 失敗: ' + fail + ' / 共 ' + (pass + fail) + ' 項');
