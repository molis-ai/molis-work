import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {escapeHtml} from '@molis-ai/molis-work-design-system';
import {LocalProjectDatabase} from '../apps/local-host/src/project-database.js';
import {seedDemoBoard,DEMO_BOARD_ID} from '../apps/local-host/src/demo-seed.js';
import {handleBuilderHttp,releaseBuilderSurface} from '../apps/local-host/src/plugin-builder-surface.js';
import {authorizeLocalWebRequest,sendLocalWebJson,type LocalMutationState} from '../apps/local-host/src/web-http.js';
import {BrowserFixtureRuntime,ChromeHarness,type ChromePage} from './fixtures/plugin-builder-browser.js';

// The built-in design is explicit sample content. UI playback does not represent a model run.
// Visual reference: specs/plugin-builder/ui/design/approved-comp.png.
test('approved inspiration design supports real preview, publication and mobile use without model runs',{timeout:110000},async t=>{
 const directory=await mkdtemp(join(tmpdir(),'plugin-builder-visual-'));
 const browser=await ChromeHarness.start(directory);
 if(!browser){await rm(directory,{recursive:true,force:true});return t.skip('Chrome required for visual and interaction verification');}
 const databasePath=join(directory,'project.db');seedDemoBoard(databasePath);
 const store=new LocalProjectDatabase(databasePath),runtime=new BrowserFixtureRuntime(directory);
 const token=randomUUID()+randomUUID(),mutations=new Map<string,LocalMutationState>();
 const ports={store,boardId:DEMO_BOARD_ID,actorId:'visual-test',homeDirectory:directory,goalTitle:()=>undefined,escapeHtml,translate:(value:string)=>value,capabilities:runtime,
  execution:{async ready(){},async models(){return[];}}};
 const server=createServer((request,response)=>{
  const url=new URL(request.url??'/',`http://${request.headers.host}`);
  if(!authorizeLocalWebRequest(request,response,url,token,mutations))return;
  void handleBuilderHttp(request,response,url,ports,token).then(handled=>{if(!handled)sendLocalWebJson(response,404,{error:'fixture route missing'});}).catch(error=>sendLocalWebJson(response,500,{error:String(error)}));
 });
 t.after(async()=>{
  await browser.close();await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));
  await releaseBuilderSurface(store,DEMO_BOARD_ID);store.close();await rm(directory,{recursive:true,force:true});
 });
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
 const address=server.address();assert.ok(address&&typeof address==='object');const origin=`http://127.0.0.1:${address.port}`;
 const screenshots=resolve('.impeccable/review/plugin-builder-fidelity');await mkdir(screenshots,{recursive:true});
 const downloads=join(directory,'downloads');await mkdir(downloads);
 await browser.command('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads,eventsEnabled:true});
 await browser.command('Target.setDiscoverTargets',{discover:true});
 const page=await browser.page();await page.viewport(1586,992);
 const noOverflow=async(target:ChromePage,label:string)=>{
  const size=await target.evaluate<{width:number;scroll:number}>('({width:innerWidth,scroll:document.documentElement.scrollWidth})');
  assert.ok(size.scroll<=size.width+1,`${label}: horizontal overflow ${size.scroll} > ${size.width}`);
 };
 const scrollToTop=async(target:ChromePage,selector:string)=>{
  const {x,y,top}=await target.evaluate<{x:number;y:number;top:number}>(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),b=e.getBoundingClientRect();return{x:b.left+b.width/2,y:b.top+Math.min(140,b.height/2),top:e.scrollTop}})()`);
  if(top>0)await target.command('Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX:0,deltaY:-top});
  await target.wait(`document.querySelector(${JSON.stringify(selector)}).scrollTop===0`);
  await target.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 };
 const desktopComposition=async()=>{
  const geometry=await page.evaluate<{lakeBottom:number;shelfTop:number;cardUncovered:boolean;chatTop:number;chatBottom:number;composerTop:number;agents:Array<{top:number;bottom:number}>;replayTop:number;replayBottom:number}>(`(()=>{
   const card=document.querySelector('.pb-record:nth-child(4)'),lake=card.getBoundingClientRect(),shelf=document.querySelector('.pb-shelf').getBoundingClientRect(),chat=document.querySelector('[data-pb-chat]').getBoundingClientRect(),composer=document.querySelector('.pb-composer-wrap').getBoundingClientRect(),replay=document.querySelector('[data-pb-replay]').getBoundingClientRect();
   return{lakeBottom:lake.bottom,shelfTop:shelf.top,cardUncovered:card.contains(document.elementFromPoint(lake.left+lake.width/2,lake.bottom-2)),chatTop:chat.top,chatBottom:chat.bottom,composerTop:composer.top,agents:[...document.querySelectorAll('.pb-agent-status>div')].map(e=>{const b=e.getBoundingClientRect();return{top:b.top,bottom:b.bottom}}),replayTop:replay.top,replayBottom:replay.bottom};
  })()`);
  t.diagnostic('Desktop geometry: '+JSON.stringify(geometry));
  assert.ok(geometry.lakeBottom<=865,`desktop lake card must fit above 865px, got ${geometry.lakeBottom}`);
  assert.ok(geometry.shelfTop>=885,`component shelf must start at or below 885px, got ${geometry.shelfTop}`);
  assert.equal(geometry.cardUncovered,true,'the whole lake card remains uncovered by the component shelf');
  assert.equal(geometry.agents.length,2);
  for(const agent of geometry.agents)assert.ok(agent.top>=geometry.chatTop&&agent.bottom<=geometry.chatBottom&&agent.bottom<=geometry.composerTop,'both Agent status rows must remain visible above the composer');
  assert.ok(geometry.replayTop>=geometry.chatTop&&geometry.replayBottom<=geometry.chatBottom&&geometry.replayBottom<=geometry.composerTop,'the replay button must remain visible above the composer');
 };
 await page.command('Page.navigate',{url:origin+'/plugin-builder'});await page.command('Page.bringToFront');
 await page.wait("document.querySelector('[data-pb-starter=inspiration]')");
 await page.click('[data-pb-starter=inspiration]');
 await page.wait("document.querySelectorAll('.pb-record').length===4 && document.querySelector('[data-pb-status]')?.textContent.startsWith('界面与功能已接通')");
 assert.equal(await page.evaluate("document.querySelector('[data-pb-action=publish]').disabled"),false,'ready starter can publish immediately without an unrelated interaction');
 await page.wait("performance.getEntriesByType('resource').some(e=>e.name.includes('/assets/inspiration-atlas.png')&&e.responseEnd>0&&e.decodedBodySize>0)");
 assert.equal(await page.evaluate("document.querySelectorAll('.pb-cover[role=img]').length"),4);
 assert.deepEqual(await page.evaluate("[...document.querySelectorAll('.pb-app-title svg,[data-record-add] svg,.pb-search svg,.pb-top svg')].filter(e=>{const b=e.getBoundingClientRect();return b.width&&b.height}).filter(e=>!e.getBBox().width||!e.getBBox().height).map(e=>e.outerHTML)"),[],'visible product controls must draw their icons');
 assert.equal(await page.evaluate("[...document.querySelectorAll('.pb-mini.cards .pb-mini-cover')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0}).length"),4,'card candidate must show its four image thumbnails');
 assert.equal(await page.evaluate("document.querySelector('[data-pb-badge]').textContent"),'示例草稿');
 assert.deepEqual(runtime.starts,[]);await noOverflow(page,'desktop builder');
 await desktopComposition();
 await page.command('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:10});
 await page.screenshot(join(screenshots,'desktop.png'));
 t.diagnostic('Desktop capture: ready built-in sample, four persisted preview records, approved atlas loaded.');

 await page.command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await page.click('[data-pb-replay]');
 await page.wait("document.querySelector('.pb-record.pb-awaiting-placement')");
 const waiting=await page.evaluate<{id:string;inert:boolean;busy:string;childrenHidden:boolean;pointerVisible:boolean}>(`(()=>{const card=document.querySelector('.pb-record.pb-awaiting-placement');return{id:card.dataset.recordId,inert:card.inert,busy:card.getAttribute('aria-busy'),childrenHidden:[...card.children].every(e=>getComputedStyle(e).visibility==='hidden'),pointerVisible:!document.querySelector('[data-pb-pointer=ui]').hidden}})()`);
 assert.equal(waiting.inert,true,'a pending placement must not accept input');
 assert.equal(waiting.busy,'true');assert.equal(waiting.childrenHidden,true,'the future card keeps its geometry while its content waits for the pointer');
 assert.equal(waiting.pointerVisible,true,'the UI Agent must be visible before the content appears');
 await page.wait(`(()=>{const card=document.querySelector('[data-record-id="${waiting.id}"]');return card&&!card.classList.contains('pb-awaiting-placement')&&!card.inert&&card.getAttribute('aria-busy')!=='true'&&[...card.children].every(e=>getComputedStyle(e).visibility==='visible')})()`);
 await scrollToTop(page,'[data-pb-chat]');
 await page.wait("document.querySelectorAll('.pb-record').length===4 && !document.querySelector('.pb-awaiting-placement') && !document.querySelector('[data-pb-pointer=ui]').hidden && !document.querySelector('[data-pb-pointer=behavior]').hidden && document.querySelector('[data-pb-badge]').textContent==='示例回放'");
 await page.evaluate("Promise.all([...document.querySelectorAll('.pb-record,[data-pb-selection],[data-pb-pointer]')].flatMap(element=>element.getAnimations({subtree:true})).filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})))");
 await page.wait("[...document.querySelectorAll('.pb-record,[data-pb-selection],[data-pb-pointer]')].flatMap(element=>element.getAnimations({subtree:true})).every(animation=>animation.playState!=='running')");
 const outline=await page.evaluate<{card:{left:number;top:number;right:number;bottom:number};selection:{left:number;top:number;right:number;bottom:number}}>("(()=>{const bounds=element=>{const {left,top,right,bottom}=element.getBoundingClientRect();return{left,top,right,bottom}};return{card:bounds(document.querySelector('.pb-record:nth-child(4)')),selection:bounds(document.querySelector('[data-pb-selection]'))}})()");
 for(const edge of ['left','top','right','bottom'] as const){
  const expected=outline.card[edge]+(edge==='left'||edge==='top'?-5:5);
  assert.ok(Math.abs(outline.selection[edge]-expected)<=1,`settled selection ${edge} must sit 5px outside the card: expected ${expected}, got ${outline.selection[edge]}`);
 }
 t.diagnostic('Settled card selection: '+JSON.stringify(outline));
 assert.equal(await page.evaluate("document.querySelector('[data-pb-part=collection]').classList.contains('selected')"),true,'the selected logical card component remains highlighted while its record is placed');
 await desktopComposition();
 assert.match(await page.evaluate<string>("document.querySelector('[data-pb-status]').textContent"),/示例装配回放.*不调用模型/);
 await page.screenshot(join(screenshots,'building.png'));
 await page.click('[data-pb-replay]');
 await page.wait("document.querySelector('[data-pb-pointer=ui]').hidden && document.querySelector('[data-pb-badge]').textContent==='示例草稿'");
 assert.equal(await page.evaluate("document.querySelectorAll('.pb-record').length"),4,'stopping playback retains real records');

 // Capture the same original four records at mobile size before any content edits.
 await page.viewport(390,844,true);await page.wait('innerWidth===390');
 await noOverflow(page,'mobile builder');
 await page.click('[data-pb-chat-toggle]');await page.wait("document.querySelector('[data-builder]').classList.contains('pb-chat-open')");
 await page.click('[data-pb-chat-close]');await page.wait("!document.querySelector('[data-builder]').classList.contains('pb-chat-open')");
 await page.click('.pb-top [data-pb-settings]');await page.wait("!document.querySelector('[data-pb-settings-panel]').hidden");
 await noOverflow(page,'mobile settings');await page.click('[data-pb-settings-close]');
 await scrollToTop(page,'.pb-canvas-scroll');
 await page.wait("Math.abs(document.querySelector('.pb-top').getBoundingClientRect().top)<1 && visualViewport.offsetTop===0");
 const cards=await page.evaluate<Array<{left:number;right:number;width:number}>>("[...document.querySelectorAll('.pb-record')].map(e=>{const b=e.getBoundingClientRect();return{left:b.left,right:b.right,width:b.width}})");
 assert.ok(cards.every(card=>card.left>=0&&card.right<=391&&card.width>=280),'mobile cards must fit the viewport at a readable single-column width');
 await page.command('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2});
 await page.screenshot(join(screenshots,'mobile.png'));
 await page.click('.pb-app-head [data-record-add]');await page.wait("document.querySelector('[data-record-editor]').open");
 await noOverflow(page,'mobile record dialog');
 await page.fill('[data-record-form] input[name=title]','稍后继续的手机草稿');
 await page.click('[data-record-editor] header [data-record-cancel]');
 await page.wait("!document.querySelector('[data-record-editor]').open");
 assert.equal(await page.evaluate("document.querySelectorAll('.pb-record').length"),4,'canceling the mobile dialog leaves the sample unchanged');
 await page.viewport(1586,992);await page.wait('innerWidth===1586');

 await page.click('[data-pb-inspect-all]');await page.wait("!document.querySelector('[data-pb-inspector-panel]').hidden");
 await page.click('[data-pb-node-up=filter]');
 await page.wait("[...document.querySelectorAll('.pb-app-query > [data-node-id]')].map(e=>e.dataset.nodeId).join(',')==='filter,search'");
 await page.click('[data-pb-inspector-close]');
 await page.command('Page.reload');await page.wait("document.querySelectorAll('.pb-record').length===4");
 assert.deepEqual(await page.evaluate("[...document.querySelectorAll('.pb-app-query > [data-node-id]')].map(e=>e.dataset.nodeId)"),['filter','search'],'reordering must change the visible DOM and survive reload');
 await page.click('[data-pb-inspect-all]');await page.wait("!document.querySelector('[data-pb-inspector-panel]').hidden");
 await page.click('[data-pb-node-down=filter]');
 await page.wait("[...document.querySelectorAll('.pb-app-query > [data-node-id]')].map(e=>e.dataset.nodeId).join(',')==='search,filter'");
 await page.click('[data-pb-inspector-close]');
 await page.click('[data-pb-try]');
 await page.wait("document.querySelector('[data-builder]').classList.contains('pb-trying') && document.querySelector('.pb-shelf').hidden");
 await page.fill('[data-record-search]','少，但更好');
 await page.wait("document.querySelectorAll('.pb-record').length===1 && document.querySelector('.pb-record-title').textContent==='少，但更好'");
 await page.fill('[data-record-search]','');await page.wait("document.querySelectorAll('.pb-record').length===4");
 await page.click('[data-record-filter="设计"]');
 await page.wait("document.querySelectorAll('.pb-record').length===2");
 assert.deepEqual(await page.evaluate("[...document.querySelectorAll('.pb-record-title')].map(e=>e.textContent)"),['空间里的秩序','自然的节奏']);
 await page.click('[data-record-filter=""]');await page.wait("document.querySelectorAll('.pb-record').length===4");
 await page.click('.pb-record:first-child [data-record-edit]');await page.wait("document.querySelector('[data-record-editor]').open");
 await page.fill('[data-record-form] input[name=note]','实操修改：把光线和留白留在这里。');
 await page.click('[data-record-submit]');
 await page.wait("!document.querySelector('[data-record-editor]').open && document.querySelector('.pb-record:first-child').textContent.includes('实操修改：把光线和留白留在这里。')");
 await page.click('.pb-app-head [data-record-add]');await page.wait("document.querySelector('[data-record-editor]').open");
 await page.fill('[data-record-form] input[name=title]','试用里的新灵感');
 await page.fill('[data-record-form] input[name=note]','这一条通过真实表单保存。');
 await page.fill('[data-record-form] input[name=cover]',origin+'/api/plugins/io.molis.work.plugin-builder/assets/inspiration-atlas.png');
 await page.fill('[data-record-form] input[name=tags]','工作, 设计');
 await page.click('[data-record-submit]');
 await page.wait("!document.querySelector('[data-record-editor]').open && document.querySelectorAll('.pb-record').length===5");
 await page.wait("[...document.querySelectorAll('.pb-cover img')].some(img=>img.complete&&img.naturalWidth>0)");
 assert.equal(await page.evaluate("document.querySelector('.pb-cover img').src"),origin+'/api/plugins/io.molis.work.plugin-builder/assets/inspiration-atlas.png');
 assert.equal(await page.evaluate("getComputedStyle(document.querySelector('.pb-cover:has(img)'),'::before').display"),'none','a real image must not be covered by the sample atlas');
 await page.command('Page.reload');await page.wait("document.querySelectorAll('.pb-record').length===5");
 assert.match(await page.evaluate<string>("document.querySelector('[data-record-list]').textContent"),/实操修改：把光线和留白留在这里。/);
 assert.match(await page.evaluate<string>("document.querySelector('[data-record-list]').textContent"),/试用里的新灵感/);
 await page.click('[data-pb-try]');
 await page.click('.pb-record:first-child [data-record-select]');
 const started=browser.event('Browser.downloadWillBegin'),completed=browser.event('Browser.downloadProgress',params=>params.state==='completed');
 await page.click('[data-record-export]');const filename=String((await started).suggestedFilename);await completed;
 const csv=await readFile(join(downloads,filename),'utf8');
 assert.match(csv,/title,note,cover,tags,source,url\r\n/);assert.match(csv,/空间里的秩序/);assert.match(csv,/实操修改：把光线和留白留在这里。/);
 assert.doesNotMatch(csv,/少，但更好|试用里的新灵感/,'selection export must contain only the chosen record');
 await page.click('.pb-record:first-child [data-record-select]');
 await page.click('[data-pb-action=publish]');await page.wait("document.querySelector('[data-pb-connected] a')");
 const created=browser.event('Target.targetCreated',event=>(event.targetInfo as {type?:string}).type==='page');
 await page.click('[data-pb-connected] a');
 const installed=await browser.page(((await created).targetInfo as {targetId:string}).targetId);
 await installed.viewport(1586,992);await installed.command('Page.bringToFront');
 await installed.wait("document.querySelector('[data-record-list] .pb-record-empty')");
 assert.equal(await installed.evaluate("document.querySelectorAll('.pb-record').length"),0,'formal plugin must not receive sample or preview data');
 assert.match(await installed.evaluate<string>("document.querySelector('.pb-app-title').textContent"),/灵感库.*把好想法留在这里。/);
 await noOverflow(installed,'installed plugin');

 await page.command('Page.bringToFront');await page.viewport(390,844,true);await page.wait('innerWidth===390');
 await page.click('.pb-app-head [data-record-add]');await page.wait("document.querySelector('[data-record-editor]').open");
 await noOverflow(page,'mobile record dialog');
 await page.fill('[data-record-form] input[name=title]','手机上的灵感');
 await page.click('[data-record-submit]');
 await page.wait("!document.querySelector('[data-record-editor]').open && document.querySelectorAll('.pb-record').length===6");
 assert.match(await page.evaluate<string>("document.querySelector('[data-record-list]').textContent"),/手机上的灵感/);
 assert.deepEqual(runtime.starts,[],'starter, example playback, records and publishing must never fabricate a model run');
 assert.equal(await page.evaluate("document.querySelector('[data-pb-error]').hidden"),true);
 t.diagnostic('Verified sample playback labeling; persisted visual reorder, real search, tag filtering, edit, create, reload, selected CSV export, isolated publication, and mobile sidebar/settings/dialog/save.');
});
