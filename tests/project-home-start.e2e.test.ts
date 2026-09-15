import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

const captures = new URL("../.impeccable/review/home-start/", import.meta.url);
// Original Adeptify product copy: verify the complete migration through the rendered carousel.
const adeptifyCopy = [
  "Intelligence is the ability to adapt to change. - Stephen Hawking",
  "The question of whether a computer can think is no more interesting than the question of whether a submarine can swim. - Edsger Dijkstra",
  "AI will likely continue to amplify human ingenuity, not replace it. - Satya Nadella",
  "The real danger is not that machines will begin to think like humans, but that humans will begin to think like machines. - David Chalmers",
  "Prediction is not just about seeing the future, it's about creating it. - Peter Drucker",
  "Simplicity is the ultimate sophistication. - Leonardo da Vinci",
  "The best way to predict the future is to invent it. - Alan Kay",
  "We are the only species that can rewrite our own code. - Anonymous",
  "Knowledge is not power. Knowledge applied is power. - Bruce Lee",
  "The measure of intelligence is the ability to change. - Aristotle"
];

const quote = "document.querySelector('[data-home-quote][aria-hidden=false]').dataset.homeQuote";

test("Account footer keeps its two text rows and theme below the old desktop breakpoint", { timeout: 45_000 }, async t => {
  const browser = await openGoalBrowser(t, "migrated"); if (!browser) return;
  const {command,sessionId,evaluate,navigate,click,origin,projectId,waitFor}=browser;
  const directory = new URL("../.impeccable/review/home-footer-quotes/", import.meta.url);
  await mkdir(directory,{recursive:true});
  await command("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]},sessionId);
  await command("Network.setCookie",{name:"molis_work_locale",value:"en",url:origin},sessionId);
  await navigate(()=>command("Page.navigate",{url:origin+"/projects/"+projectId+"/"},sessionId));
  await waitFor("document.body.dataset.desktopSurface==='home'");
  for(const width of [761,760,600,390]){
    await command("Emulation.setDeviceMetricsOverride",{width,height:844,deviceScaleFactor:1,mobile:width<=600},sessionId);
    if(width<=600 && !await evaluate("document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')"))await click('[data-directory-show]');
    for(const theme of ["light","dark"]){
      await evaluate(`document.documentElement.dataset.resolvedTheme=${JSON.stringify(theme)}`);
      await waitFor("getComputedStyle(document.querySelector('.personal-account')).color===getComputedStyle(document.querySelector('[data-plugin-id=home]')).color");
      await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
      const metrics=await evaluate<any>(`(()=>{const account=document.querySelector('.personal-account'),name=account.querySelector('strong'),detail=account.querySelector('small'),avatar=account.querySelector('.personal-account-avatar'),icon=avatar.querySelector('svg'),settings=account.querySelector('.personal-account-settings'),footer=document.querySelector('.personal-sidebar-footer'),shortcuts=document.querySelector('.directory-shortcuts');const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};return {name:rect(name),detail:rect(detail),avatar:rect(avatar),icon:rect(icon),settings:rect(settings),account:rect(account),footerBorder:getComputedStyle(footer).borderTopWidth,shortcutsBorder:getComputedStyle(shortcuts).borderTopWidth,decoration:getComputedStyle(account).textDecorationLine,color:getComputedStyle(account).color,nameColor:getComputedStyle(name).color,expectedColor:getComputedStyle(document.querySelector('[data-plugin-id=home]')).color}})()`);
      assert.ok(metrics.name.bottom<=metrics.detail.y+1, width+theme+": name and space must remain separate rows "+JSON.stringify(metrics));
      assert.equal(metrics.decoration,"none",width+theme);
      assert.equal(metrics.color,metrics.nameColor,width+theme);
      assert.equal(metrics.color,metrics.expectedColor,width+theme+": use the workbench theme");
      assert.ok(metrics.name.right<=metrics.settings.x && metrics.detail.right<=metrics.settings.x,width+theme);
      assert.ok(Math.abs(metrics.avatar.x+metrics.avatar.width/2-metrics.icon.x-metrics.icon.width/2)<1,width+theme+": avatar centered horizontally");
      assert.ok(Math.abs(metrics.avatar.y+metrics.avatar.height/2-metrics.icon.y-metrics.icon.height/2)<1,width+theme+": avatar centered vertically");
      assert.ok(metrics.account.bottom<=844 && metrics.account.right<=width,width+theme);
      if (width > 600) assert.ok(metrics.account.height <= 38, width+theme+": compact desktop account "+metrics.account.height);
      else assert.ok(metrics.account.height >= 40 && metrics.account.height <= 48, width+theme+": drawer account "+metrics.account.height);
      assert.equal(metrics.footerBorder, "0px", width+theme+": no hairline above the account footer");
      assert.equal(metrics.shortcutsBorder, "0px", width+theme+": no hairline above shortcuts");
      const shot=await command<{data:string}>("Page.captureScreenshot",{format:"png",captureBeyondViewport:false},sessionId);
      await writeFile(new URL("footer-"+width+"-"+theme+".png",directory),Buffer.from(shot.data,"base64"));
    }
  }
  await click('.personal-account');
  await waitFor("location.pathname==='/settings/appearance'");
  assert.equal(await evaluate("new URL(location.href).searchParams.get('project')"),projectId);
});

test("Home keeps local calendar and quotes current without enabling Agent input or moving the layout", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "migrated");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, store } = browser;
  const before = store.snapshot(DEMO_BOARD_ID);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__homeErrors=[];addEventListener('error',e=>window.__homeErrors.push(e.message));
    window.__clock=new Date(2028,1,29,23,59).getTime();const RealDate=Date;
    window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[window.__clock]))}static now(){return window.__clock}};
    window.__homeTimers={};const interval=window.setInterval;window.setInterval=(fn,ms,...args)=>{
      if(ms===5000||ms===30000){window.__homeTimers[ms]=fn;return 0}return interval(fn,ms,...args)};
  ` }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  assert.equal(await evaluate("document.querySelector('[data-home-date]').dateTime"), "2028-02-29");
  assert.equal(await evaluate("document.querySelector('.home-calendar [aria-current=date]').textContent"), "29");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-home-calendar] tr:first-child td')].map(x=>x.textContent)"), ["31","1","2","3","4","5","6"]);
  await click('[data-home-month-step="1"]');
  assert.equal(await evaluate("document.querySelector('[data-home-month]').textContent"), "2028年3月");
  await evaluate("window.__homeTimers[30000]()");
  assert.equal(await evaluate("document.querySelector('[data-home-month]').textContent"), "2028年3月");
  await click('[data-home-month-step="-1"]');
  await evaluate("window.__clock=new Date(2028,2,1,0,1).getTime();window.__homeTimers[30000]()");
  assert.equal(await evaluate("document.querySelector('[data-home-date]').dateTime"), "2028-03-01");
  assert.equal(await evaluate("document.querySelector('[data-home-month]').textContent"), "2028年3月");
  await click('[data-home-month-step="-1"]');
  await evaluate("window.__clock=new Date(2028,2,2).getTime();window.__homeTimers[30000]()");
  assert.equal(await evaluate("document.querySelector('[data-home-month]').textContent"), "2028年2月", "user-browsed month survives midnight");
  await click('[data-home-month-step="1"]');
  assert.deepEqual(await evaluate("[document.querySelector('[data-home-agent-input]').disabled,document.querySelector('.home-send').disabled]"), [true,true]);
  await click('[data-home-agent-input]');
  await command("Input.insertText", { text: "不能保存的输入" }, sessionId);
  assert.equal(await evaluate("document.querySelector('[data-home-agent-input]').value"), "");
  assert.equal(await evaluate("document.querySelector('[data-quote-step], [data-quote-pause], [data-home-draft], [data-home-activity]')"), null);
  await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 10, y: 10 }, sessionId);
  await evaluate("document.activeElement.blur();window.__homeTimers[5000]()");
  assert.equal(await evaluate(quote), "1");
  const focusedQuote=await evaluate<any>("(()=>{const link=document.querySelector('[data-home-quote][aria-hidden=false] a');link.focus();const q=link.closest('figure'),s=getComputedStyle(q);return {focused:document.activeElement===link,inert:q.inert,hasInert:q.hasAttribute('inert'),aria:q.getAttribute('aria-hidden'),visibility:s.visibility,transition:s.transition,animation:s.animation,active:document.activeElement.tagName}})()");
  assert.equal(focusedQuote.focused,true,JSON.stringify(focusedQuote));
  assert.equal(await evaluate("(()=>{const link=document.querySelector('[data-home-quote][aria-hidden=true] a');link.focus();return document.activeElement===link})()"),false,"inactive citation cannot take keyboard focus");
  await evaluate("window.__homeTimers[5000]()");
  assert.equal(await evaluate(quote), "1", "focused citation pauses rotation");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goal'");
  await evaluate("window.__homeTimers[5000]()");
  assert.equal(await evaluate(quote), "1", "non-home surface pauses rotation");
  await click('[data-plugin-strip] [data-plugin-id="home"]');
  await evaluate("document.activeElement.blur();Object.defineProperty(document,'hidden',{configurable:true,value:true});window.__homeTimers[5000]();delete document.hidden");
  assert.equal(await evaluate(quote), "1", "background page pauses rotation");
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] }, sessionId);
  await evaluate("window.__homeTimers[5000]()");
  assert.equal(await evaluate("document.querySelector('.home-quote-pages').classList.contains('is-changing')"), true);
  assert.equal(await evaluate(quote), "1", "old words remain until fade completes");
  await waitFor(quote + " === '2'");
  await mkdir(captures, { recursive: true });
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  for (const [name,width,height,dark] of [["desktop",1440,1000,false],["desktop-dark",1440,1000,true],["user-1024",1024,768,false],["user-1024-dark",1024,768,true],["mobile",390,844,false],["mobile-dark",390,844,true]] as const) {
    await command("Emulation.setDeviceMetricsOverride", { width,height,deviceScaleFactor:1,mobile:width<600 }, sessionId);
    await evaluate(`document.documentElement.dataset.resolvedTheme=${JSON.stringify(dark?"dark":"light")};document.activeElement.blur()`);
    await command("Input.dispatchMouseEvent", { type:"mouseMoved", x:1,y:1 }, sessionId);
    const heights:number[]=[];
    for(let i=0;i<adeptifyCopy.length+3;i++) {
      await evaluate("window.__homeTimers[5000]()");
      heights.push(await evaluate<number>("document.querySelector('.home-context').getBoundingClientRect().height"));
    }
    assert.ok(Math.max(...heights)-Math.min(...heights)<1, name+": quotes must not shift layout");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"),true,name);
    await evaluate("for(let n=0;n<13&&document.querySelector('[data-home-quote][aria-hidden=false]').dataset.homeQuote!=='4';n++)window.__homeTimers[5000]()");
    await evaluate("document.querySelector('[data-work-surface=home]').scrollTop=0;new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
    const shot=await command<{data:string}>("Page.captureScreenshot",{format:"png",captureBeyondViewport:false},sessionId);
    await writeFile(new URL(name+".png",captures),Buffer.from(shot.data,"base64"));
  }
  await evaluate("document.cookie='molis_work_locale=en;path=/'");
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-home-quote]')].slice(3).map(q=>q.querySelector('blockquote').textContent+' - '+q.querySelector('figcaption').textContent)"),adeptifyCopy,"all original Adeptify passages and attributions are migrated in order");
  assert.equal(await evaluate("[...document.querySelectorAll('[data-home-quote]')].slice(3).some(q=>q.querySelector('a'))"),false,"no invented source links");
  for (const [name,width,height] of [["english-1024",1024,768],["english-760",760,844],["english-mobile",390,844]] as const) {
    await command("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<600},sessionId);
    await evaluate("document.documentElement.dataset.resolvedTheme='light';document.activeElement.blur()");
    await command("Input.dispatchMouseEvent",{type:"mouseMoved",x:1,y:1},sessionId);
    await evaluate("document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))");
    const heights:number[]=[];
    const visited=new Set<string>();
    for(let i=0;i<adeptifyCopy.length+3;i++){
      await evaluate("window.__homeTimers[5000]()");
      heights.push(await evaluate<number>("document.querySelector('.home-context').getBoundingClientRect().height"));
      visited.add(await evaluate<string>(quote));
      assert.equal(await evaluate("[...document.querySelectorAll('[data-home-quote]')].every(q=>q.inert===(q.getAttribute('aria-hidden')==='true')&&getComputedStyle(q).visibility===(q.inert?'hidden':'visible'))"),true);
    }
    assert.equal(visited.size,adeptifyCopy.length+3,"every passage is actually reachable in a full rotation");
    assert.ok(Math.max(...heights)-Math.min(...heights)<1,name+": translated quotes must not shift layout: "+heights.join(','));
    await evaluate("for(let n=0;n<13&&document.querySelector('[data-home-quote][aria-hidden=false]').dataset.homeQuote!=='4';n++)window.__homeTimers[5000]()");
    const shot=await command<{data:string}>("Page.captureScreenshot",{format:"png",captureBeyondViewport:false},sessionId);
    await writeFile(new URL(name+".png",captures),Buffer.from(shot.data,"base64"));
  }
  if(!await evaluate("document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')")) await click('[data-directory-show]');
  await waitFor("document.querySelector('[data-home-shortcut-add]').getBoundingClientRect().height>0");
  await click('[data-home-shortcut-add]');
  await click('.home-shortcut-save');
  const dialog=await command<{data:string}>("Page.captureScreenshot",{format:"png",captureBeyondViewport:false},sessionId);
  await writeFile(new URL("dialog-mobile.png",captures),Buffer.from(dialog.data,"base64"));
  assert.deepEqual(await evaluate("window.__homeErrors"),[]);
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).goals,before.goals);
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).runs,before.runs);
});

test("Home shortcuts persist per project, open a new browser page, and preserve edits on failure", { timeout: 90_000 }, async t => {
  const browser=await openGoalBrowser(t,"migrated");if(!browser)return;
  const {command,sessionId,evaluate,waitFor,navigate,click,origin,projectId,reloadPage,store}=browser;
  const before=store.snapshot(DEMO_BOARD_ID);
  await command("Emulation.setDeviceMetricsOverride",{width:1024,height:768,deviceScaleFactor:1,mobile:false},sessionId);
  const url=origin+"/projects/"+projectId+"/";
  const key="molis-work:home-shortcuts:"+projectId;
  const saved=()=>evaluate<any[]>(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})||'[]')`);
  const fill=async(name:string,target:string)=>evaluate(`document.querySelector('[name=shortcut_name]').value=${JSON.stringify(name)};document.querySelector('[name=shortcut_url]').value=${JSON.stringify(target)}`);
  await navigate(()=>command("Page.navigate",{url},sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  assert.equal(await evaluate("document.querySelector('.immersive-home [data-home-shortcut-add]')"),null);
  assert.equal(await evaluate("document.querySelector('[data-directory-shortcuts] .directory-shortcuts-title').textContent"),"快捷方式");
  assert.equal(await evaluate("document.querySelectorAll('[data-shortcut-id]').length"),0);
  await click('[data-home-shortcut-add]');
  await fill("取消的内容","https://example.com/");
  await click('.home-shortcut-dialog footer [data-home-shortcut-cancel]');
  assert.deepEqual(await saved(),[]);
  await click('[data-home-shortcut-add]');
  for(const invalid of ["javascript:alert(1)","file:///tmp/a","https://user:secret@example.com/","不是网址"]){
    await fill("文档",invalid);await click('.home-shortcut-save');
    assert.equal(await evaluate("document.querySelector('[data-home-shortcut-dialog]').open"),true);
    assert.match(await evaluate<string>("document.querySelector('[data-home-shortcut-form-error]').textContent"),/http/);
    assert.deepEqual(await saved(),[]);
  }
  const target=origin+"/health?shortcut=1#result";
  await fill("项目文档",target);await click('.home-shortcut-save');
  await waitFor("!document.querySelector('[data-home-shortcut-dialog]').open");
  const first=await saved();assert.equal(first[0].name,"项目文档");assert.equal(first[0].url,target);
  await reloadPage();await waitFor("document.querySelector('[data-home-shortcut-link]')");
  assert.equal(await evaluate("document.querySelector('[data-home-shortcut-name]').textContent"),"项目文档");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goal'");
  assert.ok(await evaluate("document.querySelector('[data-directory-shortcuts] [data-home-shortcut-link]')"));
  await click('[data-plugin-strip] [data-plugin-id="home"]');
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  await click('[data-home-shortcut-link]');
  const targets=await command<{targetInfos:{targetId:string;url:string;openerId?:string}[]}>("Target.getTargets");
  const opened=targets.targetInfos.find(x=>x.url===target);assert.ok(opened?.openerId,"real new tab opened the stored destination");
  await command("Target.closeTarget",{targetId:opened.targetId});
  assert.equal(await evaluate("location.href"),url);
  await click('[data-home-shortcut-edit]');await fill("<img src=x onerror=alert(1)>",target);
  await evaluate("window.__save=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('molis-work:home-shortcuts:'))throw new DOMException('blocked','QuotaExceededError');return window.__save.call(this,k,v)}");
  await click('.home-shortcut-save');
  assert.equal(await evaluate("document.querySelector('[data-home-shortcut-dialog]').open"),true);
  assert.match(await evaluate<string>("document.querySelector('[data-home-shortcut-form-error]').textContent"),/未能保存/);
  assert.deepEqual(await saved(),first);
  assert.equal(await evaluate("document.querySelector('[name=shortcut_name]').value"),"<img src=x onerror=alert(1)>");
  await evaluate("Storage.prototype.setItem=window.__save");await click('.home-shortcut-save');
  assert.equal((await saved())[0].id,first[0].id);
  assert.equal(await evaluate("document.querySelector('[data-home-shortcut-name]').textContent"),"<img src=x onerror=alert(1)>");
  assert.equal(await evaluate("document.querySelector('[data-home-shortcut-name] img')"),null);
  await reloadPage();await waitFor("document.querySelector('[data-home-shortcut-link]')");
  await evaluate("window.__external=[];globalThis.molisWorkOpenExternalUrl=async url=>{window.__external.push(url);throw new Error('native open failed')}");
  await click('[data-home-shortcut-link]');
  await waitFor("!document.querySelector('[data-home-shortcut-error]').hidden");
  assert.deepEqual(await evaluate("window.__external"),[target]);
  await evaluate("globalThis.molisWorkOpenExternalUrl=async url=>window.__external.push(url)");
  await click('[data-home-shortcut-link]');await waitFor("document.querySelector('[data-home-shortcut-error]').hidden");
  const other=await evaluate<string>(`(async()=>{const r=await fetch('/api/settings/projects',{method:'POST',headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify({display_name:'另一张书桌',user_confirmed:true})});if(!r.ok)throw new Error(await r.text());return(await r.json()).project.project_id})()`);
  await navigate(()=>command("Page.navigate",{url:origin+"/projects/"+other+"/"},sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  assert.equal(await evaluate("document.querySelectorAll('[data-shortcut-id]').length"),0);
  await navigate(()=>command("Page.navigate",{url},sessionId));await waitFor("document.querySelector('[data-home-shortcut-link]')");
  await click('[data-home-shortcut-edit]');await click('[data-home-shortcut-remove]');
  assert.deepEqual(await saved(),[]);await reloadPage();
  assert.equal(await evaluate("document.querySelectorAll('[data-shortcut-id]').length"),0);
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).goals,before.goals);
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).runs,before.runs);
});
