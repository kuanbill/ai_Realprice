# 實價登錄查詢網站 — 設計文件

日期：2026-07-18
狀態：設計已確認，待實作

## 1. 目標

建立一個實價登錄查詢網站，匯入台灣內政部實價登錄 CSV 資料（來源位於 `C:\ai_Realprice\source`），提供：

1. 關鍵字 / 條件查詢
2. 進階篩選 + 統計（平均 / 中位單價、總價等）
3. 地圖視覺化（以鄉鎮市區聚合標記）

## 2. 技術架構

- **框架**：Next.js (App Router) + TypeScript
- **資料庫**：SQLite（使用 `better-sqlite3`，同步 API、零設定、易部署）
- **地圖**：Leaflet + OpenStreetMap（免費、免 API key）
- **部署**：本機 `npm run dev` 開發；結構預留可部署 Vercel（SQLite 檔案型，部署時可改用 Turso/Postgres，但本期先本機）

## 3. 資料來源與匯入

### 3.1 來源資料夾結構

`C:\ai_Realprice\source` 下有兩種佈局，程式皆須處理：

- `source\lvr_landcsv\` — 扁平佈局，僅 CSV
- `source\20260701發布\` — 日期發布佈局，同一份資料同時有 `.csv` / `.txt` / `.xml` / `.xls` 多種格式，且 schema 檔較多

**匯入規則**：
- 使用者**手動指定來源路徑**（預設 `C:\ai_Realprice\source\lvr_landcsv`，可改填其他路徑如 `C:\ai_Realprice\source\20260701發布`）
- 只讀取副檔名為 `.csv` 的檔案，忽略 `.txt` / `.xml` / `.xls`
- 檔名規則：`{縣市代碼}_{lvr_land}_{類型}{子類}.csv`
  - 縣市代碼（檔名第 1 個字母）：`a`=台北市, `b`=高雄市, `c`=新北市, `d`=台中市, `e`=台南市, `f`=新竹縣, `g`=新竹市, `h`=桃園市, `i`=嘉義縣, `j`=嘉義市, `k`=苗栗縣, `m`=南投縣, `n`=彰化縣, `o`=雲林縣, `p`=台東縣, `q`=花蓮縣, `t`=屏東縣, `u`=宜蘭縣, `v`=澎湖縣, `w`=基隆市, `x`=金門縣（以實際檔名出現者為準，建立對照表）
  - 類型（第 2 段）：`a`=買賣, `b`=預售, `c`=租賃
  - 子類（選用）：`_build`=建物, `_land`=土地, `_park`=車位；無後綴為主檔

### 3.2 CSV 格式

- 第 1 行：中文欄位名（如 `鄉鎮市區,交易標的,...`）
- 第 2 行：英文欄位名（如 `The villages and towns urban district,...`）→ **匯入時跳過**
- 第 3 行起：資料
- 主檔欄位對應 `schema-main-sale.csv`（買賣）/ `schema-main-rent.csv`（租賃）
- `schema-main-buildcase.csv` 含建案額外欄位（建案名稱、棟及號、建設公司、基地面積、總戶數、公設比等）

### 3.3 匯入流程（lib/csv-import.ts + scripts/import.ts）

1. 接收來源路徑參數
2. 掃描路徑下所有 `*.csv`，過濾出 `?_lvr_land_?*.csv` 主檔與子檔
3. 讀取同資料夾的 `schema-*.csv` 取得欄位對照（name→title）
4. 逐檔解析：
   - 跳過第 2 行（英文標題）
   - 由檔名推導 `city`（縣市）、`deal_type`（買賣/預售/租賃）、`record_type`（土地/建物/車位/主檔）
   - 對齊主表欄位，缺失欄位填空
5. **去重增量**：以 `移轉編號`（主檔）或 `編號` 為唯一鍵；匯入前查詢是否已存在，存在則跳過，僅插入新資料
6. 匯入過程回報進度（已處理檔數 / 筆數）
7. 完成後輸出總筆數

### 3.4 匯入觸發

- **CLI 腳本**：`npm run import -- --path "C:\ai_Realprice\source\lvr_landcsv"`
- **管理頁面** `/admin/import`：輸入路徑、按鈕執行、顯示進度與結果（呼叫 `/api/import`）
- 兩者共用 `lib/csv-import.ts`

## 4. 資料模型（SQLite `records` 表）

單一主表，涵蓋買賣/預售/租賃共通欄位；建案專屬欄位一併存入（允許空值）。

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | INTEGER PK | 自增 |
| city | TEXT | 縣市（中文，由代碼對照） |
| city_code | TEXT | 檔名代碼 a/b/c... |
| deal_type | TEXT | 買賣/預售/租賃 |
| record_type | TEXT | 主檔/土地/建物/車位 |
| 鄉鎮市區 | TEXT | |
| 交易標的 | TEXT | |
| 土地位置建物門牌 | TEXT | 地址關鍵字查詢來源 |
| 交易年月日 | TEXT | 格式 yyyymmdd，轉可排序 |
| 交易筆棟數 | TEXT | |
| 總樓層數 | TEXT | |
| 建物型態 | TEXT | |
| 主要用途 | TEXT | |
| 建築完成年月 | TEXT | |
| 建物移轉總面積平方公尺 | REAL | 坪數計算來源 |
| 建物現況格局-房/廳/衛 | INTEGER | |
| 總價元 | REAL | |
| 單價元平方公尺 | REAL | |
| 車位類別/面積/總價 | TEXT/REAL | |
| 備註 | TEXT | |
| 編號 | TEXT | |
| 移轉編號 | TEXT | 唯一鍵（去重用） |
| 建案名稱 | TEXT | buildcase 欄位 |
| 棟及號 | TEXT | |
| 建設公司 | TEXT | |
| 基地面積 | TEXT | |
| 總戶數 | TEXT | |
| 公設比 | TEXT | |
| 型式 | TEXT | |
| lat | REAL | 地圖用（見 §6） |
| lng | REAL | 地圖用 |

索引：`city`, `deal_type`, `鄉鎮市區`, `交易年月日`, `單價元平方公尺`, `總價元`, `移轉編號`(UNIQUE)

## 5. 查詢介面（首頁 `/`）

### 5.1 篩選條件（左側面板）
- 縣市（下拉，由資料動態產生）
- 鄉鎮市區（聯動縣市）
- 交易類型（買賣/預售/租賃，多選）
- 交易日期區間（起~訖，年月）
- 總價區間（萬元）
- 單價區間（元/坪，由 單價元平方公尺 換算，1 平方公尺 ≈ 0.3025 坪）
- 建物型態 / 主要用途（可選）
- 關鍵字（地址模糊搜尋）

### 5.2 結果顯示（右側）
- 結果表格：縣市、鄉鎮市區、地址、交易日期、總價、單價(元/坪)、坪數、建物型態、樓層
- 分頁（每頁 50 筆）
- 統計卡（依目前篩選結果）：筆數、平均單價、中位單價、平均總價、最高/最低總價
- 匯出 CSV（目前篩選結果）

### 5.3 地圖 Tab
- Leaflet 地圖，切換到「地圖」頁籤顯示
- 以 `鄉鎮市區` 聚合：每區一個 marker，popup 顯示該區成交筆數與平均單價
- 點擊 marker 可鑽取該區列表

## 6. 地圖座標處理

原始 CSV **無經緯度**。本期方案：
- 建立「縣市 + 鄉鎮市區 → 經緯度」對照表（台灣鄉鎮市區中心點靜態資料，內建於 `lib/town-coords.ts`）
- 匯入時（或查詢時）依 `鄉鎮市區` 關聯座標，存入 `lat/lng`
- 地圖以鄉鎮市區聚合標記（非門牌級）
- 後續可擴充：接 Nominatim 做門牌級定位

## 7. 專案結構

```
C:\ai_Realprice\
├─ app/
│  ├─ layout.tsx
│  ├─ page.tsx                  # 查詢首頁
│  ├─ admin/import/page.tsx     # 匯入管理頁
│  └─ api/
│     ├─ records/route.ts       # 查詢 + 統計 API
│     └─ import/route.ts        # 觸發匯入 API
├─ lib/
│  ├─ db.ts                     # SQLite 連線 + 建表
│  ├─ csv-import.ts             # 掃描/解析/匯入邏輯
│  ├─ city-map.ts               # 縣市代碼對照表
│  ├─ town-coords.ts            # 鄉鎮市區座標對照表
│  └─ queries.ts                # 查詢/統計 SQL 封裝
├─ data/
│  └─ realprice.db              # SQLite 資料庫（gitignore）
├─ scripts/import.ts            # CLI 匯入腳本
├─ package.json
├─ tsconfig.json
├─ next.config.js
└─ .env.local                   # SOURCE_DEFAULT_PATH 等設定
```

## 8. 錯誤處理

- 來源路徑不存在 / 無 CSV → 回傳明確錯誤訊息
- 單筆解析失敗（欄位數不符、型別錯誤）→ 跳過該筆並計入錯誤計數，不中斷整批
- 匯入使用交易（transaction）批次提交，失敗可回滾
- 查詢參數非法 → 回傳 400 並說明

## 9. 測試與驗證

- 匯入後 `SELECT COUNT(*) FROM records` 應與 CSV 總筆數一致（容許解析失敗筆數）
- 抽查：台北市文山區某筆資料欄位正確
- 首頁篩選：選縣市+類型，結果筆數與統計合理
- 地圖：切換地圖 Tab 顯示各鄉鎮市區 marker
- 重複匯入同一資料夾：筆數不變（去重生效）

## 10. 實作範圍（YAGNI）

本期包含：CSV 匯入（手動路徑+去重）、查詢/篩選/統計、地圖聚合、匯出 CSV。
不包含：使用者帳號、門牌級地圖定位、自動定時匯入、線上部署設定（僅預留結構）。
