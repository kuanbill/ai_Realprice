export const CITY_CODES: Record<string, string> = {
  a: "台北市", b: "台中市", c: "基隆市", d: "台南市", e: "高雄市",
  f: "新北市", g: "宜蘭縣", h: "桃園市", i: "嘉義市", j: "新竹縣",
  k: "苗栗縣", l: "屏東縣", m: "南投縣", n: "彰化縣", o: "新竹市",
  p: "雲林縣", q: "嘉義縣", r: "澎湖縣", s: "連江縣", t: "屏東縣",
  u: "花蓮縣", v: "台東縣", w: "金門縣", x: "澎湖縣", z: "連江縣",
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
