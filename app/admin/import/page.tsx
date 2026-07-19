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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <input value={path} onChange={(e) => setPath(e.target.value)} style={{ width: "60%", padding: 8 }} />
        <button onClick={run} disabled={busy} style={{ padding: "8px 16px" }}>
          {busy ? "匯入中..." : "開始匯入"}
        </button>
      </div>
      {busy && (
        <div style={{ padding: 16, background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 8, marginBottom: 16, color: "#856404" }}>
          資料匯入中，請勿關閉頁面或離開...
        </div>
      )}
      {result && (
        <pre style={{ marginTop: 16, background: "#f4f4f4", padding: 16 }}>{JSON.stringify(result, null, 2)}</pre>
      )}
    </main>
  );
}
