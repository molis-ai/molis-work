// node summarize.cjs <this directory>: pools every press of the three runs on each side.
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const dir = process.argv[2] ?? __dirname;
const pick = (values, q) => { const v = [...values].sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.floor(q * v.length))]; };
for (const side of ['base', 'branch']) {
  const rows = readdirSync(dir).filter(f => f.startsWith(side + '-') && f.endsWith('.json')).flatMap(f => JSON.parse(readFileSync(join(dir, f), 'utf8')).rows);
  const clicks = rows.filter(r => r.click).map(r => r.click[0]), handler = rows.filter(r => r.click).map(r => r.click[1]);
  const style = rows.map(r => r.styleMs), recalcs = rows.map(r => r.styles), layouts = rows.map(r => r.layouts);
  console.log(`${side}: presses ${rows.length}; click to next paint median ${pick(clicks, .5)} ms, p90 ${pick(clicks, .9)}, max ${Math.max(...clicks)}; handler median ${pick(handler, .5)} ms; style per press median ${pick(style, .5)} ms (p90 ${pick(style, .9)}); style recalcs ${pick(recalcs, .5)}; layouts ${pick(layouts, .5)}`);
}
