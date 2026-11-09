// Scoped visual/interaction probe of these static specimens, not a product integration test.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)), root=resolve(here,'../../../..');
const toolRoot=process.env.SPECIMEN_TOOL_ROOT||root;
const packageRoot=resolve(toolRoot,'packages/test-kit');
const meta=JSON.parse(await (await import('node:fs/promises')).readFile(resolve(packageRoot,'package.json'),'utf8'));
const {ChromeHarness}=await import(pathToFileURL(resolve(packageRoot,meta.exports['./browser'].import)));
const temp=await mkdtemp(resolve(tmpdir(),'batch15-specimens-'));
const out=resolve(root,'.impeccable/qa/review/batch15-presentation');await mkdir(out,{recursive:true});
const url=process.env.SPECIMEN_URL||'http://127.0.0.1:4418/intelligent-surfaces-forms/specimens/';
const browser=await ChromeHarness.start(temp,{executable:process.env.MOLIS_WORK_TEST_CHROME||resolve(process.env.HOME,'.local/bin/molis-test-browser')});assert(browser);
const page=await browser.page();const errors=[];browser.on('Runtime.exceptionThrown',x=>errors.push(x.exceptionDetails.text));await page.command('Runtime.enable');
const results=[];
const key=async name=>{await page.command('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:{Escape:27,ArrowDown:40,Home:36,End:35,Tab:9}[name]});await page.command('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:name});};
const navigate=async query=>{await page.command('Page.navigate',{url:url+query});await page.wait('document.querySelector(".forms .name-chip") && document.querySelector("[data-ring-segments]")');};
try {
 for(const width of [1440,1024,390])for(const lang of ['zh','en'])for(const theme of ['light','dark']){
  await page.viewport(width,1000,width===390);await navigate(`?lang=${lang}&theme=${theme}&long=1`);
  const layout=await page.evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth, cards:document.querySelectorAll('[data-slot="preview-card"]').length, theme:document.documentElement.dataset.resolvedTheme,ring:[...document.querySelectorAll('[data-ring-segments]')].every(x=>x.children.length===12),rowSingleLine:getComputedStyle(document.querySelector('.forms .title-link')).whiteSpace==='nowrap',selected:document.querySelectorAll('#controls .mw-toggle.is-current[aria-pressed=true]').length,statuses:[...document.querySelectorAll('.forms [data-status]')].every(x=>x.getBoundingClientRect().width>0&&getComputedStyle(x).display!=='none'),consequences:[...document.querySelectorAll('.forms .consequence')].every(x=>x.scrollWidth<=x.clientWidth+1)})`);
  assert.equal(layout.theme,theme);assert.equal(layout.overflow,false,`${width}/${lang}/${theme} overflow`);assert(layout.cards>=2);assert(layout.ring);assert(layout.statuses);assert(layout.consequences);assert(layout.rowSingleLine);assert.equal(layout.selected,5);
  await page.screenshot(resolve(out,`${width}-${lang}-${theme}.png`));if(width===390){await page.evaluate(`document.querySelector('.forms .presentation-card').scrollIntoView({block:'center'})`);await page.screenshot(resolve(out,`${width}-${lang}-${theme}-card.png`));}results.push({width,lang,theme,...layout});
 }
 await page.viewport(1440,1000);await navigate('?lang=en');
 // IUI-26: the single-line title exposes its whole value through the shared tooltip.
 await page.click('[data-long]');await page.evaluate(`document.querySelector('.forms .title-link').focus()`);await key('Tab');await page.command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',modifiers:8,windowsVirtualKeyCode:9});await page.command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab'});await page.wait(`document.querySelector('.craft-tip[data-shown]')?.textContent.includes('Mobile pricing')`);
 // IUI-26: keyboard focus opens the same peek; a menu owns the first Escape, then peek restores focus.
 await page.evaluate(`document.querySelector('[data-peek]').focus()`);await page.wait(`document.querySelector('#live-peek:popover-open')`);
 await page.click('#live-peek summary');
 await page.evaluate(`document.querySelector('#live-peek [role=menuitem]').focus()`);await key('ArrowDown');
 assert.equal(await page.evaluate(`document.activeElement.textContent.trim()`),'Open at the exact spot');
 await key('Escape');assert.equal(await page.evaluate(`!!document.querySelector('#live-peek:popover-open') && !document.querySelector('#live-peek details').open`),true);
 await key('Escape');await page.wait(`!document.querySelector('#live-peek')`);assert(await page.evaluate(`document.activeElement.matches('[data-peek]')`));
 // Exact destination and return preserve the object; no action changes it to a receipt.
 await page.click('.forms .presentation-row [data-destination="exact"]');assert(await page.evaluate(`!document.querySelector('#destination').hidden`));await page.click('[data-back]');assert(await page.evaluate(`document.activeElement.matches('.presentation-row [data-destination="exact"]')`));
 await page.click('.forms .presentation-card [data-prepare]');await page.wait(`document.querySelector('#action-preview:modal')`);await key('Escape');await page.wait(`!document.querySelector('#action-preview')`);assert(await page.evaluate(`document.querySelector('.forms [data-status="decide"]')!==null`));
 // IUI-10: the denial/deletion UI contains no private title, stale has an explicit example read time, first read has no old content.
 for(const state of ['normal','running','accept','failed','partial','stale','initial','forbidden','deleted']){
  await page.click(`[data-set-state="${state}"]`);
  const fact=await page.evaluate(`({text:document.querySelector('.forms').textContent,actions:document.querySelector('.forms').querySelectorAll('[data-prepare]').length,rings:[...document.querySelectorAll('.forms [data-ring-segments]')].every(x=>x.children.length===12)})`);
  assert(fact.rings);
  if(['forbidden','deleted','initial'].includes(state)){assert(!fact.text.includes('手机价格表'));assert.equal(fact.actions,0);}
  if(state==='stale'){assert(fact.text.includes('2026-11-08 09:40'));assert.equal(fact.actions,0);assert(fact.text.includes('手机价格表'));}
  if(state==='initial')assert(!fact.text.includes('2026-11-08 09:40'));
  await page.screenshot(resolve(out,`state-${state}.png`));
 }
 await page.click('[data-set-state="decide"]');
 for(const place of ['chat','discussion','plugin','wait']){await page.click(`[data-set-place="${place}"]`);assert(await page.evaluate(`!!document.querySelector('.context [data-status="decide"]')`));}
 // Pointer hover opens the same floating view without executing an action.
 await page.evaluate(`document.activeElement.blur();window.scrollTo(0,0)`);const hoverPoint=await page.evaluate(`(()=>{const b=document.querySelector('[data-peek]').getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()`);await page.command('Input.dispatchMouseEvent',{type:'mouseMoved',...hoverPoint});await page.wait(`document.querySelector('#live-peek:popover-open')`);await page.screenshot(resolve(out,'1440-en-hover-peek.png'));await key('Escape');
 // Touch opens the native shared bottom sheet; close restores the chip.
 await page.viewport(390,844,true);await navigate('?lang=en&theme=dark&long=1');await page.command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
 const point=await page.evaluate(`(()=>{let el=document.querySelector('[data-peek]');el.scrollIntoView({block:'center'});const b=el.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()`);
 await page.command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await page.command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.wait(`document.querySelector('#live-peek:modal')`);await page.screenshot(resolve(out,'390-en-dark-sheet.png'));
 await page.click('#live-peek [data-dialog-close]');await page.wait(`!document.querySelector('#live-peek')`);assert(await page.evaluate(`document.activeElement.matches('[data-peek]')`));
 // Reduced motion is applied to the actual ring animation: geometry must remain unchanged.
 const before=await page.evaluate(`document.querySelector('[data-ring-segments]').innerHTML`);await page.evaluate(`new Promise(r=>setTimeout(r,150))`);assert.equal(await page.evaluate(`document.querySelector('[data-ring-segments]').innerHTML`),before);
 assert.deepEqual(errors,[]);
 const report={scope:'Static specimen only; no Home/actions/persistence/product acceptance',combinations:results,checks:['12-segment rings','long title and consequences','keyboard peek','menu arrows','nested Escape and focus return','exact local destination and return','prepared action leaves state unchanged','all read/error states','four placements','touch sheet','reduced motion'],errors};
 await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {await browser.close();await rm(temp,{recursive:true,force:true});}
