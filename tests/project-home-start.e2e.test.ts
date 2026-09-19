import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

const captures = new URL("../.impeccable/review/home-start/", import.meta.url);
const homeHasQuotes = "!!document.querySelector('[data-home-quote], [data-home-quotes], .home-reflection, .home-quote-pages, .immersive-home blockquote, .immersive-home figure') || /千里之行|Stephen Hawking|Intelligence is the ability/.test(document.querySelector('.immersive-home')?.textContent || '')";

test("Settings gear sits above the account avatar and opens settings in the stage", { timeout: 45_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
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
      const metrics=await evaluate<any>(`(()=>{const account=document.querySelector('.personal-account'),gear=document.querySelector('[data-plugin-id=settings]'),name=account.querySelector('strong'),detail=account.querySelector('small'),avatar=account.querySelector('.personal-account-avatar'),icon=avatar.querySelector('svg'),footer=document.querySelector('.personal-sidebar-footer'),rail=document.querySelector('.plugin-rail');const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};return {name:rect(name),detail:rect(detail),avatar:rect(avatar),icon:rect(icon),account:rect(account),gear:rect(gear),rail:rect(rail),copyDisplay:getComputedStyle(account.querySelector('.personal-account-copy')).display,footerBorder:getComputedStyle(footer).borderTopWidth,decoration:getComputedStyle(account).textDecorationLine,color:getComputedStyle(account).color,expectedColor:getComputedStyle(document.querySelector('[data-plugin-id=home]')).color,path:location.pathname}})()`);
      assert.equal(metrics.copyDisplay,"none",width+theme+": account copy is icon-rail only");
      assert.equal(metrics.decoration,"none",width+theme);
      assert.equal(metrics.color,metrics.expectedColor,width+theme+": use the workbench theme");
      assert.ok(metrics.gear.bottom<=metrics.account.y+1,width+theme+": settings gear sits above the avatar");
      assert.ok(Math.abs(metrics.avatar.x+metrics.avatar.width/2-metrics.icon.x-metrics.icon.width/2)<1,width+theme+": avatar centered horizontally");
      assert.ok(Math.abs(metrics.avatar.y+metrics.avatar.height/2-metrics.icon.y-metrics.icon.height/2)<1,width+theme+": avatar centered vertically");
      assert.ok(metrics.account.bottom<=844 && metrics.account.right<=width,width+theme);
      assert.ok(metrics.account.bottom<=metrics.rail.bottom+1,width+theme+": account stays in the plugin rail");
      if (width > 600) assert.ok(metrics.account.height <= 38, width+theme+": compact desktop account "+metrics.account.height);
      else assert.ok(metrics.account.height >= 40 && metrics.account.height <= 48, width+theme+": drawer account "+metrics.account.height);
      assert.equal(metrics.footerBorder, "0px", width+theme+": no hairline above the account footer");
      const shot=await command<{data:string}>("Page.captureScreenshot",{format:"png",captureBeyondViewport:false},sessionId);
      await writeFile(new URL("footer-"+width+"-"+theme+".png",directory),Buffer.from(shot.data,"base64"));
    }
  }
  await command("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  await evaluate("dispatchEvent(new Event('resize'))");
  await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
  await evaluate("document.querySelector('.personal-account').click()");
  await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
  assert.equal(await evaluate("location.pathname"), "/projects/"+projectId+"/");
  await click("[data-plugin-id=settings]");
  await waitFor("document.querySelector('#goal-tree-pane').dataset.desktopDirectory==='settings' && document.querySelector('#goal-tree-pane').getBoundingClientRect().width>80 && document.querySelector('[data-tab-workspace]')?.dataset.exclusive==='settings' && document.querySelector('[data-work-surface=settings] [data-theme-option=dark]')");
  assert.equal(await evaluate("location.pathname"), "/projects/"+projectId+"/");
  assert.equal(await evaluate("document.body.classList.contains('settings-page')"), false);
  assert.equal(await evaluate("document.querySelector('[data-plugin-id=settings]').getAttribute('aria-current')"), "page");
  assert.equal(await evaluate("!!document.querySelector('[data-directory-panel=settings] [data-theme-option=dark]')"), false);
  await evaluate("document.querySelector('[data-work-surface=settings] [data-theme-option=dark]').click()");
  await waitFor("document.documentElement.dataset.resolvedTheme==='dark'");
  await click("[data-plugin-id=goals]");
  await waitFor("document.querySelector('#goal-tree-pane').dataset.desktopDirectory==='root' && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && !document.querySelector('[data-tab-workspace]').dataset.exclusive");
  assert.equal(await evaluate("document.querySelector('[data-plugin-id=settings]').hasAttribute('aria-current')"), false);
  await click(".navigator-project-settings");
  await waitFor("document.querySelector('#goal-tree-pane').dataset.desktopDirectory==='project-settings' && document.querySelector('#goal-tree-pane').getBoundingClientRect().width>80 && document.querySelector('[data-tab-workspace]')?.dataset.exclusive==='project-settings' && document.querySelector('[data-work-surface=project-settings] [data-project-rename]') && !document.body.dataset.navigationPending");
  assert.equal(await evaluate("location.pathname"), "/projects/"+projectId+"/");
  assert.equal(await evaluate("document.body.classList.contains('settings-page')"), false);
  assert.equal(await evaluate("document.querySelector('.navigator-project-settings').getAttribute('aria-current')"), "page");
  assert.equal(await evaluate("document.querySelector('[data-plugin-id=settings]').hasAttribute('aria-current')"), false);
  await click('[data-directory-panel=project-settings] [data-settings-section="guidance"]');
  await waitFor("!!document.querySelector('[data-work-surface=project-settings] [data-guidance-form]')");
  await click("[data-plugin-id=goals]");
  await waitFor("document.querySelector('#goal-tree-pane').dataset.desktopDirectory==='root' && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && !document.querySelector('[data-tab-workspace]').dataset.exclusive");
  assert.equal(await evaluate("document.querySelector('.navigator-project-settings').hasAttribute('aria-current')"), false);
});

test("Home shows a seven-day strip and keeps a chosen day across midnight", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, store } = browser;
  const before = store.snapshot(DEMO_BOARD_ID);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__homeErrors=[];addEventListener('error',e=>window.__homeErrors.push(e.message));
    window.__clock=new Date(2028,1,29,23,59).getTime();const RealDate=Date;
    window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[window.__clock]))}static now(){return window.__clock}};
    window.__homeTimers={};const interval=window.setInterval;window.setInterval=(fn,ms,...args)=>{
      if(ms===30000){window.__homeTimers[ms]=fn;return 0}return interval(fn,ms,...args)};
  ` }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  await waitFor("document.querySelectorAll('[data-home-day]').length===7 && document.querySelector('[data-home-date]')?.dateTime==='2028-02-29'");
  assert.equal(await evaluate("document.querySelector('[data-home-date]').dateTime"), "2028-02-29");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-home-day]')].map(x=>x.dataset.homeDay)"), [
    "2028-02-26", "2028-02-27", "2028-02-28", "2028-02-29", "2028-03-01", "2028-03-02", "2028-03-03",
  ]);
  assert.equal(await evaluate("document.querySelector('[data-home-day].is-on').dataset.homeDay"), "2028-02-29");
  assert.equal(await evaluate("document.querySelector('.home-calendar, .home-composer, [data-home-agent-input]')"), null);
  await evaluate("window.__homeTimers[30000]()");
  assert.equal(await evaluate("document.querySelector('[data-home-date]').dateTime"), "2028-02-29");
  await evaluate("window.__clock=new Date(2028,2,1,0,1).getTime();window.__homeTimers[30000]()");
  assert.equal(await evaluate("document.querySelector('[data-home-date]').dateTime"), "2028-03-01", "unpinned home follows midnight");
  await click('[data-home-day="2028-02-28"]');
  assert.equal(await evaluate("document.querySelector('[data-home-date]').dateTime"), "2028-02-28");
  await evaluate("window.__clock=new Date(2028,2,2).getTime();window.__homeTimers[30000]()");
  assert.equal(await evaluate("document.querySelector('[data-home-date]').dateTime"), "2028-02-28", "chosen day survives midnight while still in the week");
  assert.equal(await evaluate("document.querySelector('[data-quote-step], [data-quote-pause], [data-home-draft], [data-home-activity], [data-home-quote-next], .home-goals-entry')"), null);
  assert.equal(await evaluate(homeHasQuotes), false, "home has no quotation carousel or famous-quote copy");
  assert.equal(await evaluate("window.__homeTimers[8000]"), undefined, "no quote autoplay timer");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goal'");
  await click('[data-plugin-strip] [data-plugin-id="home"]');
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  const homeStack = await evaluate<{ gap: number; dates: number }>("(()=>{const d=document.querySelector('.home-dates').getBoundingClientRect();const v=document.querySelector('.home-dayview').getBoundingClientRect();const l=document.querySelector('.home-launch').getBoundingClientRect();return {gap:Math.round(v.left-d.right),dates:Math.round(d.width)}})()");
  assert.ok(homeStack.gap >= 8 && homeStack.gap <= 24, "day column sits beside the date cards: " + homeStack.gap);
  assert.ok(homeStack.dates >= 90 && homeStack.dates <= 130, "date cards stay a narrow rail: " + homeStack.dates);
  await mkdir(captures, { recursive: true });
  for (const [name, width, height, dark] of [["desktop", 1440, 1000, false], ["desktop-dark", 1440, 1000, true], ["user-1024", 1024, 768, false], ["user-1024-dark", 1024, 768, true], ["mobile", 390, 844, false], ["mobile-dark", 390, 844, true]] as const) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
    await evaluate(`document.documentElement.dataset.resolvedTheme=${JSON.stringify(dark ? "dark" : "light")};document.activeElement.blur()`);
    await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 }, sessionId);
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, name);
    assert.equal(await evaluate(homeHasQuotes), false, name + ": no quotes after viewport change");
    await evaluate("document.querySelector('[data-work-surface=home]').scrollTop=0;new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
    const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
    await writeFile(new URL(name + ".png", captures), Buffer.from(shot.data, "base64"));
  }
  await evaluate("document.cookie='molis_work_locale=en;path=/'");
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  assert.equal(await evaluate(homeHasQuotes), false, "english locale still has no quotations");
  for (const [name, width, height] of [["english-1024", 1024, 768], ["english-760", 760, 844], ["english-mobile", 390, 844]] as const) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
    await evaluate("document.documentElement.dataset.resolvedTheme='light';document.activeElement.blur()");
    await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 }, sessionId);
    await evaluate("document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))");
    assert.equal(await evaluate(homeHasQuotes), false, name);
    const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
    await writeFile(new URL(name + ".png", captures), Buffer.from(shot.data, "base64"));
  }
  await waitFor("document.querySelector('.immersive-home [data-home-shortcut-add]').getBoundingClientRect().height>0");
  await click(".immersive-home [data-home-shortcut-add]");
  await click(".home-shortcut-save");
  const dialog = await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
  await writeFile(new URL("dialog-mobile.png", captures), Buffer.from(dialog.data, "base64"));
  assert.deepEqual(await evaluate("window.__homeErrors"), []);
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).goals, before.goals);
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).runs, before.runs);
});

test("Home stream opens real Inbox, Feed reconnect, and Sessions", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  await waitFor("document.querySelectorAll('[data-home-day]').length===7");
  await waitFor('document.querySelector("[data-home-open-event^=\\"inbox:\\"], [data-home-open-event^=\\"auth:\\"]")', 8_000);
  const visitHomeDays = `(visit) => {
    const ids = [...document.querySelectorAll("[data-home-day]")].map((day) => day.dataset.homeDay);
    for (const id of ids) {
      document.querySelector('[data-home-day="' + CSS.escape(id) + '"]')?.click();
      const found = visit(id);
      if (found) return found;
    }
    return null;
  }`;
  const dumpHome = `(async () => {
    const days = [];
    const ids = [...document.querySelectorAll("[data-home-day]")].map((day) => day.dataset.homeDay);
    for (const id of ids) {
      document.querySelector('[data-home-day="' + CSS.escape(id) + '"]')?.click();
      days.push({ id, events: [...document.querySelectorAll("[data-home-open-event]")].map((row) => row.dataset.homeOpenEvent) });
    }
    const response = await fetch((document.body.dataset.routePrefix || "") + "/api/feed", {
      cache: "no-store",
      headers: globalThis.molisWorkControlHeaders?.() || {},
    });
    const snapshot = await response.json();
    return JSON.stringify({
      status: response.status,
      days,
      inbox: (snapshot.inbox_entries || []).map((entry) => [entry.status, entry.created_at, entry.subject_type]),
      sources: (snapshot.sources || []).map((source) => [source.status, source.last_error_code]),
    });
  })()`;
  const inboxId = await evaluate<string | null>(`(${visitHomeDays})(() => {
    const ids = [...document.querySelectorAll('[data-home-open-event^="inbox:"]')].map((row) => row.dataset.homeOpenEvent);
    for (const id of ids) {
      document.querySelector('[data-home-open-event="' + CSS.escape(id) + '"]')?.click();
      if (document.querySelector("[data-home-continue]") && document.querySelector("[data-home-done]")) return id;
    }
    return null;
  })`);
  if (!inboxId) assert.fail(await evaluate(dumpHome));
  await waitFor("document.querySelector('[data-work-surface=home]').dataset.event==='on' && document.querySelector('[data-home-continue]') && document.querySelector('[data-home-done]')");
  const dock = await evaluate<{ wrap: boolean; talkRight: boolean }>("(()=>{const act=document.querySelector('[data-home-detail-act]');const buttons=[...act.querySelectorAll('.mw-btn')];const tops=buttons.map(b=>Math.round(b.getBoundingClientRect().y));const talk=act.querySelector('[data-home-open-talk]');const last=buttons.at(-1);return {wrap:new Set(tops).size!==1,talkRight:last===talk && talk.getBoundingClientRect().left>buttons[0].getBoundingClientRect().left}})()");
  assert.equal(dock.wrap, false, "dock actions stay on one row");
  assert.equal(dock.talkRight, true, "say-something sits on the right");
  await click("[data-home-continue]");
  await waitFor("document.body.dataset.desktopSurface === 'feed'");
  await click('[data-plugin-strip] [data-plugin-id="home"]');
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  await evaluate(`document.querySelector('[data-home-open-event="${inboxId}"]')?.click()`);
  await waitFor("document.querySelector('[data-home-done]')");
  const beforeCount = await evaluate<number>("document.querySelectorAll('[data-home-open-event]').length");
  await click("[data-home-done]");
  await waitFor(`!document.querySelector('[data-home-open-event="${inboxId}"]')`, 8_000);
  assert.ok(await evaluate<number>("document.querySelectorAll('[data-home-open-event]').length") < beforeCount);
  const openedAuth = await evaluate<boolean>(`(() => {
    if (document.querySelector("[data-home-reauth]")) return true;
    return Boolean((${visitHomeDays})(() => {
      const ids = [...document.querySelectorAll('[data-home-open-event^="auth:"], [data-home-open-event^="inbox:"]')]
        .map((row) => row.dataset.homeOpenEvent);
      for (const id of ids) {
        document.querySelector('[data-home-open-event="' + CSS.escape(id) + '"]')?.click();
        if (document.querySelector("[data-home-reauth]")) return true;
      }
      return null;
    }));
  })()`);
  assert.equal(openedAuth, true, "demo home still has a reconnect action");
  await click("[data-home-reauth]");
  await waitFor("document.body.dataset.desktopSurface === 'feed'");
  await click('[data-plugin-strip] [data-plugin-id="home"]');
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  await evaluate("document.querySelector('[data-home-open-event]')?.click()");
  await waitFor("document.querySelector('[data-home-open-talk]')");
  await click("[data-home-open-talk]");
  await waitFor("document.querySelector('[data-work-surface=home]').dataset.dock==='open'");
  await evaluate("document.querySelector('[data-home-talk-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
  await waitFor("document.body.dataset.desktopSurface === 'sessions'");
});

test("Home shortcuts persist per project, open a new browser page, and preserve edits on failure", { timeout: 90_000 }, async t => {
  const browser=await openGoalBrowser(t,"seeded");if(!browser)return;
  const {command,sessionId,evaluate,waitFor,navigate,click,origin,projectId,reloadPage,store}=browser;
  const before=store.snapshot(DEMO_BOARD_ID);
  await command("Emulation.setDeviceMetricsOverride",{width:1024,height:768,deviceScaleFactor:1,mobile:false},sessionId);
  const url=origin+"/projects/"+projectId+"/";
  const key="molis-work:home-shortcuts:"+projectId;
  const saved=()=>evaluate<any[]>(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})||'[]')`);
  const fill=async(name:string,target:string)=>evaluate(`document.querySelector('[name=shortcut_name]').value=${JSON.stringify(name)};document.querySelector('[name=shortcut_url]').value=${JSON.stringify(target)}`);
  await navigate(()=>command("Page.navigate",{url},sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  await waitFor("document.querySelector('.immersive-home [data-home-shortcut-add]').getBoundingClientRect().height>0");
  assert.ok(await evaluate("Boolean(document.querySelector('.immersive-home [data-home-shortcut-add]'))"));
  assert.equal(await evaluate("document.querySelector('[data-directory-shortcuts]')"),null);
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
  assert.equal(await evaluate("document.querySelector('[data-directory-shortcuts]')"),null);
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
