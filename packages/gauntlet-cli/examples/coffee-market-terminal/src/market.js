import fs from 'node:fs';

export function parsePrices(csv) {
  const [header,...rows]=csv.trim().split(/\r?\n/); const columns=header.split(',');
  return rows.map(row=>Object.fromEntries(row.split(',').map((value,i)=>[columns[i],i===2?Number(value):value])));
}
export function loadPrices(file) { return parsePrices(fs.readFileSync(file,'utf8')); }
export function latestPrice(rows) { return [...rows].sort((a,b)=>a.date.localeCompare(b.date)).at(-1); }
