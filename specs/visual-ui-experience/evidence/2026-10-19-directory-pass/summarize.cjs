const fs=require('fs'), dir=process.argv[2];
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2}, p95=a=>{const s=[...a].sort((x,y)=>x-y);return s[Math.ceil(s.length*.95)-1]};
const r1=x=>Math.round(x*10)/10;
for (const side of ['base','head']) {
  const http=[1,2,3].map(i=>JSON.parse(fs.readFileSync(`${dir}/http-${side}-${i}.json`)));
  const br=[1,2,3].map(i=>JSON.parse(fs.readFileSync(`${dir}/browser-${side}-${i}.json`)));
  const pick=(lab)=>http.flatMap(h=>h.samples.filter(s=>s.label===lab).map(s=>s.bodyMs));
  const per=(lab)=>http.map(h=>r1(med(h.samples.filter(s=>s.label===lab).map(s=>s.bodyMs))));
  console.log(`== ${side} (${http[0].commit.slice(0,9)})`);
  for (const lab of ['project-first-response','project-warm','coding-pane-http','projects-directory-warm']) { const v=pick(lab); console.log(`  http ${lab.padEnd(24)} n=${v.length} median ${r1(med(v))} p95 ${r1(p95(v))} min ${r1(Math.min(...v))} max ${r1(Math.max(...v))} per-run medians ${per(lab).join('/')}`); }
  const first=br.map(b=>b.scenarios.open[0]), warm=br.flatMap(b=>b.scenarios.open.slice(1));
  for (const [name,rows] of [['first open',first],['reopen',warm]]) for (const k of ['responseStart','firstContentfulPaint','domContentLoaded','operableFromNavigateMs','longTaskMs']) { const v=rows.map(r=>r[k]); console.log(`  browser ${name.padEnd(10)} ${k.padEnd(22)} n=${v.length} median ${r1(med(v))} min ${r1(Math.min(...v))} max ${r1(Math.max(...v))}`); }
  const fe=br.flatMap(b=>b.scenarios.pluginFirstEntry), re=br.flatMap(b=>b.scenarios.pluginReturn);
  console.log(`  plugin first entry ready median ${r1(med(fe.map(x=>x.readyMs)))} (${[...new Set(fe.map(x=>x.id))].map(id=>id+':'+r1(med(fe.filter(x=>x.id===id).map(x=>x.readyMs)))).join(' ')})`);
  console.log(`  plugin return ready median ${r1(med(re.map(x=>x.readyMs)))} (${[...new Set(re.map(x=>x.id))].map(id=>id+':'+r1(med(re.filter(x=>x.id===id).map(x=>x.readyMs)))).join(' ')})`);
  console.log(`  click event durations median ${med(fe.concat(re).flatMap(x=>x.press))} max ${Math.max(...fe.concat(re).flatMap(x=>x.press))}`);
  console.log(`  rounds heap MB ${br.map(b=>b.scenarios.switchRounds.map(x=>x.heapUsedMB).join('→')).join(' | ')}`);
  console.log(`  rounds nodes ${br.map(b=>b.scenarios.switchRounds[0].nodes+'→'+b.scenarios.switchRounds.at(-1).nodes).join(' | ')} listeners ${br.map(b=>b.scenarios.switchRounds[0].listeners+'→'+b.scenarios.switchRounds.at(-1).listeners).join(' | ')}`);
  console.log(`  typing longest event ${br.map(b=>b.scenarios.typing.longestEventMs).join('/')} over16 counts ${br.map(b=>b.scenarios.typing.eventsOver16ms.length).join('/')}`);
  console.log(`  open nodes ${first.map(f=>f.nodes).join('/')} requests ${first.map(f=>f.requests).join('/')} transferKB ${first.map(f=>Math.round(f.transferBytes/1024)).join('/')} reopen transferKB ${warm.slice(0,1).map(f=>Math.round(f.transferBytes/1024))}`);
}
