export const CITY_CODES: Record<string, string> = {
  a: "台北市", b: "高雄市", c: "新北市", d: "台中市", e: "台南市",
  f: "新竹縣", g: "新竹市", h: "桃園市", i: "嘉義縣", j: "嘉義市",
  k: "苗栗縣", l: "屏東縣", m: "南投縣", n: "彰化縣", o: "雲林縣",
  p: "台東縣", q: "花蓮縣", r: "澎湖縣", s: "連江縣", t: "屏東縣",
  u: "宜蘭縣", v: "澎湖縣", w: "基隆市", x: "金門縣",
};

export function getCityName(code: string): string {
  return CITY_CODES[code] ?? `未知(${code})`;
}

export const DEAL_TYPES: Record<string, string> = {
  a: "買賣", b: "預售", c: "租賃",
};

export function getDealType(t: string): string {
  return DEAL_TYPES[t] ?? `未知(${t})`;
}
