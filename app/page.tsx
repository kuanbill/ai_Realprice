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
