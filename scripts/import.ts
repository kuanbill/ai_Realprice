import { importFromFolder } from "../lib/csv-import";

function getArg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const folder = getArg("path") || process.env.SOURCE_DEFAULT_PATH || "C:\\ai_Realprice\\source\\lvr_landcsv";
console.log(`匯入來源: ${folder}`);
const res = importFromFolder(folder);
console.log(res.message);
if (res.errors > 0) process.exitCode = 1;
