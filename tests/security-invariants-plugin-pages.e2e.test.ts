import { realpathSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages/testing";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";

// SYS-15-V2: local media is allowed while independent network, socket and owner-credential access is refused.

test("SYS-15 S-47 real opaque page cannot read owner credentials, bypass its broker or navigate to owner HTML", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "cognia");
  await browser.command("Network.enable", {}, browser.sessionId);
  t.after(browser.on("Target.attachedToTarget", params => {
    if ((params.targetInfo as { type?: string }).type === "iframe")
      void browser.command("Network.enable", {}, String(params.sessionId)).catch(() => undefined);
  }));
  const ownerUrl = browser.origin + "/?opaque-navigation-check=1";
  const responses: number[] = [];
  t.after(browser.on("Network.responseReceived", params => {
    const response = params.response as { url: string; status: number };
    if (response.url === ownerUrl) responses.push(response.status);
  }));
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?openPlugin=cognia` }, browser.sessionId));
  await browser.surfaceReady("cognia"); await child.waitFor("document.querySelector('[data-cognia-rows]')");
  assert.deepEqual(await child.evaluate(`(()=>{
    let owner='readable';try{parent.document.querySelector('meta[name=molis-work-control-token]')}catch(error){owner=error.name}
    return {owner,token:!!document.querySelector('meta[name=molis-work-control-token]'),native:!!window.__TAURI_INTERNALS__};
  })()`), { owner: "SecurityError", token: false, native: false });
  const own = `/projects/${browser.projectId}/api/plugins/io.molis.work.cognia/library`;
  assert.equal(await child.evaluate(`fetch(${JSON.stringify(own)}).then(response=>response.status)`), 200);
  assert.equal(await child.evaluate(`new Promise(resolve=>{
    const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='),character=>character.charCodeAt(0));
    const address=URL.createObjectURL(new Blob([bytes],{type:'image/png'})),image=new Image();
    const finish=value=>{image.remove();URL.revokeObjectURL(address);resolve(value)};
    image.onload=()=>finish(image.naturalWidth===1);image.onerror=()=>finish(false);image.src=address;document.body.append(image);
  })`), true, "authorized bytes can be displayed as a local blob inside the opaque page");
  for (const path of ["/api/settings/projects", `/projects/${browser.projectId}/api/plugins/io.molis.work.todo/items`,
    "/projects/another-project/api/plugins/io.molis.work.cognia/library", "/api/plugins/io.molis.work.cognia/library"]) {
    assert.equal(await child.evaluate(`fetch(${JSON.stringify(path)}).then(response=>response.status)`), 403, path);
  }
  // SYS-15-U2: the read bridges are bound to this manifest's subject reader and this project.
  const prefix = `/projects/${browser.projectId}`;
  assert.equal(await child.evaluate(`fetch(${JSON.stringify(prefix + "/api/assistant/related?kind=cognia_material&id=missing")}).then(response=>response.status)`), 200);
  for (const path of ["/api/assistant/related?kind=todo_item&id=missing", "/api/assistant/works", "/api/assistant/works/another-work"]) {
    assert.equal(await child.evaluate(`fetch(${JSON.stringify(prefix + path)}).then(response=>response.status)`), 403, "a page cannot read another owner's object or a work's conversation");
  }
  for (const object of [{kind: "todo_item", id: "missing"}, {kind: "cognia_material", id: "missing", project_id: "another-project"}]) {
    assert.equal(await child.evaluate(`fetch(${JSON.stringify(prefix + "/api/placement/describe")},{method:'POST',body:JSON.stringify(${JSON.stringify({object})})}).then(response=>response.status)`), 403);
  }
  // SYS-15-U1: a page cannot forge the speaking surface, a result reply, or a user gesture.
  await browser.evaluate("window.pageMessages=[];window.addEventListener('molis:assistant-message',event=>pageMessages.push(event.detail))");
  await child.evaluate("window.dispatchEvent(new CustomEvent('molis:assistant-message',{detail:{message_id:'page-test',purpose:'delegate',source:{surface:'other-plugin'},text:'test suggestion'}}))");
  await browser.waitFor("pageMessages.length===1");
  assert.deepEqual(await browser.evaluate("[pageMessages[0].purpose,pageMessages[0].source.surface]"), ["suggest", "cognia"]);
  await child.evaluate("window.dispatchEvent(new CustomEvent('molis:assistant-message',{detail:{message_id:'forged-result',purpose:'reply',source:{surface:'other-plugin'}}}))");
  await child.evaluate("new Promise(resolve=>setTimeout(resolve,80))");
  assert.equal(await browser.evaluate("pageMessages.length"), 1);
  for (const path of ["/api/host/plugin-pages", "/api/plugins/io.molis.work.cognia/disable"]) {
    assert.equal(await child.evaluate(`fetch(${JSON.stringify(`/projects/${browser.projectId}` + path)},{method:'POST',body:'{}'}).then(response=>response.status)`), 403, path);
  }
  for (const operation of ["contextual/prepare", "contextual/attach", "placement/convert", "plugins/io.molis.work.todo/items"]) {
    const path = `/projects/${browser.projectId}/api/${operation}`;
    assert.equal(await child.evaluate(`fetch(${JSON.stringify(path)},{method:'POST',headers:{'x-molis-context-page':'invented'},body:'{}'}).then(response=>response.status)`), 403,
      "a child cannot turn its ordinary fetch into a trusted toolbar callback");
  }
  const blocked = await child.evaluate(`new Promise(resolve=>{
    let violation=false,errored=false;const done=()=>{if(violation&&errored)resolve(true)};
    document.addEventListener('securitypolicyviolation',event=>{if(event.effectiveDirective==='connect-src'){violation=true;done()}},{once:true});
    const xhr=new XMLHttpRequest();xhr.open('GET',${JSON.stringify(browser.origin + "/settings")});
    xhr.onerror=()=>{errored=xhr.status===0;done()};xhr.send();setTimeout(()=>resolve(false),2000);
  })`);
  assert.equal(blocked, true, "the browser itself refuses direct network access");
  const socketUrl = browser.origin.replace("http:", "ws:") + "/pty";
  assert.equal(await child.evaluate(`new Promise(resolve=>{
    let violation=false,errored=false;const done=()=>{if(violation&&errored)resolve(true)};
    document.addEventListener('securitypolicyviolation',event=>{if(event.effectiveDirective==='connect-src'){violation=true;done()}},{once:true});
    try{const socket=new WebSocket(${JSON.stringify(socketUrl)});socket.onerror=()=>{errored=true;done()};socket.onopen=()=>{socket.close();resolve(false)}}
    catch(error){resolve(error.name==='SecurityError')}setTimeout(()=>resolve(false),2000);
  })`), true, "the browser refuses the connection whether the API reports it synchronously or asynchronously");
  await child.evaluate(`location.href=${JSON.stringify(ownerUrl)}`);
  await browser.waitFor("!document.querySelector('iframe[data-plugin-frame=cognia]')");
  assert.deepEqual(responses, [403], "actual opaque-frame navigation is refused before the owner token can be delivered");
  assert.equal(await browser.evaluate("Boolean(document.querySelector('meta[name=molis-work-control-token]'))"), true, "the owner's independent page remains available");
});

// SYS-15 S-47 (2026-10-23 review of #1018): a page's link channel never navigates the owner document. The settings
// addresses the parent used to click through now open the settings surface in place; a shareable link address that is not
// a settings address changes nothing, and neither path needs a gesture the page does not have.
test("SYS-15 S-47 a page link never navigates the owner document: a settings address opens the settings surface in place", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "cognia");
  const { command, sessionId, evaluate, navigate, waitFor } = browser;
  await navigate(() => command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?openPlugin=cognia` }, sessionId));
  await browser.surfaceReady("cognia"); await child.waitFor("!document.querySelector('[data-cognia-rows]').textContent.includes('正在读取')");
  const opened = "Boolean(document.querySelector('[data-work-surface=settings] [data-model-settings]') || document.querySelector('[data-directory-panel=settings] [data-settings-section=models][aria-current]'))";
  const owner = "({href:location.href,marker:window.__ownerMarker,frames:document.querySelectorAll('iframe[data-plugin-frame]').length,token:Boolean(document.querySelector('meta[name=molis-work-control-token]'))})";
  const page = await child.evaluate<string>("location.href");
  await evaluate("window.__ownerMarker='owner-page';window.__settingsAddresses=[];document.addEventListener('molis-work:open-settings-path',event=>window.__settingsAddresses.push(String(event.detail?.href||'')))");
  const before = await evaluate(owner);
  assert.equal(await evaluate(opened), false, "the settings are not open yet");
  // A scripted click carries no gesture: the page's own settings link suppresses its navigation and reports the address.
  await child.evaluate(`(() => {
    const link = document.createElement("a"); link.setAttribute("href", "/settings/models"); link.textContent = "模型设置";
    document.body.append(link); link.click(); link.remove();
  })()`);
  await waitFor(opened, 10_000);
  assert.deepEqual(await evaluate<string[]>("window.__settingsAddresses"), [`${browser.origin}/settings/models`], "the address reached the shell as a settings request, not as a navigation");
  assert.deepEqual(await evaluate(owner), before, "the owner document did not navigate, reload or lose its frame");
  assert.equal(await evaluate<string>("window.__ownerMarker"), "owner-page", "no full page load happened");
  assert.equal(await child.evaluate<string>("location.href"), page, "the page itself did not follow the link");
  // The message path without any click moves nothing either, for an owner address that opens no surface.
  await child.evaluate(`molisWorkOpenExternalUrl(${JSON.stringify(`/projects/${browser.projectId}/desk`)})`);
  await waitFor("window.__settingsAddresses.some(href=>href.endsWith('/desk'))");
  assert.deepEqual(await evaluate(owner), before, "a host address that opens no surface still moves nothing");
});

test("SYS-15-F1 SYS-15-F2 desktop search releases only the file selected by a trusted click, then opens its owned copy", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "shelf");
  // The IPC adapter is simulated; the opaque page, trusted picker, authorization and Shelf import are production paths.
  await browser.command("Page.addScriptToEvaluateOnNewDocument", { source: `if(window===top){
    window.nativeCalls=[];window.__TAURI__={core:{invoke:async(name,input)=>{
      nativeCalls.push({name,input});
      if(name==='shelf_find_files')return[{name:'Selected.txt',path:'/private/source/Selected.txt'}];
      if(name==='platform_read_selected_file')return{name:'Selected.txt',bytes_base64:btoa('ONLY_SELECTED_CONTENT')};
      return null;
    }}};
  }` }, browser.sessionId);
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/side/shelf/side` }, browser.sessionId));
  await browser.waitFor("document.querySelector('[data-work-surface=shelf]')?.dataset.uiClientState==='ready'");
  await child.waitFor("document.querySelector('[data-shelf-search]')");
  const search = "[data-shelf-search]";
  await child.evaluate(`document.querySelector('${search}').value='Selected';document.querySelector('${search}').dispatchEvent(new Event('input',{bubbles:true}))`);
  await child.waitFor("document.querySelector('[data-shelf-bar-hint]').textContent.includes('请重新点击')");
  assert.equal(await browser.evaluate("nativeCalls.filter(call=>call.name==='shelf_find_files').length"), 0, "scripted input cannot start a native search without activation");
  const find = async () => {
    await child.click(search);
    await child.evaluate(`document.querySelector('${search}').value='Selected';document.querySelector('${search}').dispatchEvent(new Event('input',{bubbles:true}))`);
    await browser.waitFor("document.querySelector('[data-native-file-choice]')");
  };
  await find();
  assert.equal(await child.evaluate("document.body.textContent.includes('/private/source')"), false, "search paths never enter the child");
  await browser.evaluate("document.querySelector('[data-native-file-choice]').click()");
  assert.equal(await browser.evaluate("nativeCalls.filter(call=>call.name==='platform_read_selected_file').length"), 0, "a synthetic selection does not read bytes");
  await browser.click("[data-native-file-choice]");
  await child.waitFor("document.querySelector('[data-shelf-preview]').textContent.includes('ONLY_SELECTED_CONTENT')");
  assert.equal(await browser.evaluate("nativeCalls.filter(call=>call.name==='platform_read_selected_file').length"), 1);
  const selectedId = await child.evaluate<string>("[...document.querySelectorAll('[data-shelf-item]')].find(row=>row.textContent.includes('Selected.txt')).dataset.shelfItem");
  await child.click(`[data-shelf-item="${selectedId}"] .shelf-name`, 2);
  await child.waitFor("!document.querySelector('[data-shelf-bar-hint]').textContent.includes('拒绝')");
  await browser.waitFor("nativeCalls.some(call=>call.name==='shelf_open_path')");
  const opened = await browser.evaluate<string>("nativeCalls.find(call=>call.name==='shelf_open_path').input.path");
  assert.ok(opened.startsWith(realpathSync(browser.homeDirectory) + "/"), opened);
  assert.ok(opened.endsWith("/Selected.txt"), opened);
  await find(); await browser.click("[data-native-file-cancel]");
  assert.equal(await browser.evaluate("nativeCalls.filter(call=>call.name==='platform_read_selected_file').length"), 1, "cancel imports nothing else");
});


test("SYS-15-U7 S-47 embedded content is host owned, confined to the page and cannot be selected by an arbitrary URL", {timeout:60_000}, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null); if (!browser) return;
  const child = await pluginFrameBrowser(t,browser,"cognia");
  const embedded = await pluginFrameBrowser(t,browser,"pages",'iframe[data-plugin-embedded="pages"]');
  const store = openPagesStore(browser.homeDirectory);
  const page = (()=>{try{return store.create({project_id:browser.projectId!,title:"Embedded witness",body:{type:"doc",content:[{type:"paragraph",content:[{type:"text",text:"PRIVATE_EMBEDDED_WITNESS"}]}]}})}finally{store.close()}})();
  // Observe only the public host ports that the production plugin factory already receives.
  await pluginFrameInitScript(t, browser, `
    let factories;
    Object.defineProperty(globalThis,'molisWorkbenchPluginFactories',{configurable:true,get:()=>factories,set:value=>{
      factories=new Proxy(value,{set:(target,key,factory)=>{target[key]=host=>{window.publicViewForTest=host.view;return factory(host)};return true}});
    }});
  `);
  await browser.navigate(()=>browser.command("Page.navigate",{url:browser.origin+"/projects/"+browser.projectId+"/?openPlugin=cognia"},browser.sessionId));
  await child.waitFor("window.publicViewForTest && document.querySelector('[data-cognia-rows]')");
  await child.evaluate("window.slot=document.body.appendChild(document.createElement('div'));slot.style.cssText='position:absolute;left:-40px;top:-20px;width:2000px;height:1600px';");
  for(const surface of ["https://example.invalid/", "../settings", "cognia", "unavailable-surface"]){
    const rejected = await child.evaluate(`publicViewForTest.embed(slot,{surface:${JSON.stringify(surface)},itemId:'x'}).ready.then(()=>false,()=>true)`);
    assert.equal(rejected,true,surface);
    assert.equal(await browser.evaluate("document.querySelectorAll('iframe[data-plugin-embedded]').length"),0);
  }
  await child.evaluate(`window.openEmbed=publicViewForTest.embed(slot,{surface:'pages',itemId:${JSON.stringify(page.id)},title:'Embedded witness'});openEmbed.ready`);
  await embedded.waitFor("document.querySelector('.ProseMirror')?.textContent.includes('PRIVATE_EMBEDDED_WITNESS')");
  await browser.waitFor("document.querySelector('iframe[data-plugin-embedded]')?.parentElement.getBoundingClientRect().width>100");
  assert.equal(await child.evaluate("document.body.textContent.includes('PRIVATE_EMBEDDED_WITNESS')"),false);
  assert.equal(await child.evaluate("(()=>{try{return Boolean(parent.document.querySelector('[data-plugin-embedded]').contentDocument)}catch(error){return error.name}})()"),"SecurityError");
  const clipped=await browser.evaluate<boolean>(`(()=>{const box=document.querySelector('iframe[data-plugin-embedded]').parentElement.getBoundingClientRect(),root=document.querySelector('[data-work-surface=cognia]').getBoundingClientRect();
    return box.left>=root.left && box.top>=root.top && box.right<=root.right && box.bottom<=root.bottom;})()`);
  assert.equal(clipped,true,"a page cannot place its embedded region over owner controls");
  await child.evaluate("slot.remove()");
  await browser.waitFor("!document.querySelector('iframe[data-plugin-embedded]')");
});

// W2-18-HOME-LOCALE-01: the standalone Home settings host consumes the same restricted request.
test("SYS-15 S-47 standalone Home settings reject invalid addresses and accept the existing connection pages", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  const child = await pluginFrameBrowser(t, b, "issues");
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/locale?lang=en&next=%2Fplugins%2Fissues` }, b.sessionId));
  await child.waitFor("document.querySelector('[data-issues=workbench]')?.dataset.ready === 'true'");
  const address = await b.evaluate("location.href");
  const refuse = () => b.evaluate(`(async () => {
    const fetch = window.fetch, requests = [], field = document.querySelector('[data-model-base-url]');
    window.fetch = function(url, init) { requests.push(String(url)); return fetch.call(this, url, init); };
    try {
      for (const detail of [undefined, null, {}, {href:null}, {href:42}, {href:'http://['},
        {href:'https://example.invalid/settings/models'}, {href:'/settings/appearance'},
        {href:'/projects/another-project/settings'}, {href:'/api/plugins/io.molis.work.issues/list'}]) {
        document.dispatchEvent(new CustomEvent('molis-work:open-settings-path', {detail}));
      }
      await Promise.resolve();
      return {requests, open:document.querySelector('[data-home-model-settings]').open, address:location.href,
        draft:field?.value ?? null, sameField:field === document.querySelector('[data-model-base-url]')};
    } finally { window.fetch = fetch; }
  })()`);
  assert.deepEqual(await refuse(), { requests: [], open: false, address, draft: null, sameField: true }, "unsupported settings requests neither fetch, open nor navigate");
  await b.evaluate("document.dispatchEvent(new CustomEvent('molis-work:open-settings-path', {detail:{href:'/settings/models'}}))");
  await b.waitFor("document.querySelector('[data-home-model-content] [data-model-settings]')", 15_000);
  await b.click("[data-model-template=deepseek]");
  await b.waitFor("document.querySelector('[data-model-base-url]')");
  const draft = "https://example.invalid/unsaved-model";
  await b.evaluate(`(() => { const field = document.querySelector('[data-model-base-url]'); field.value = ${JSON.stringify(draft)}; field.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  assert.deepEqual(await refuse(), { requests: [], open: true, address, draft, sameField: true }, "unsupported settings requests preserve the open settings draft");
  await b.click("[data-home-model-close]"); await b.waitFor("!document.querySelector('[data-home-model-settings]').open");
  for (const href of ["/settings/connectors", "/capabilities/connections"]) {
    await b.evaluate(`document.dispatchEvent(new CustomEvent('molis-work:open-settings-path', {detail:{href:${JSON.stringify(href)}}}))`);
    await b.waitFor("document.querySelector('[data-home-model-settings]').open && document.querySelector('[data-home-model-content] [data-connectors-settings]') && document.querySelector('[data-home-model-status]').hidden", 15_000);
    assert.equal(await b.evaluate("location.href"), address);
    await b.click("[data-home-model-close]"); await b.waitFor("!document.querySelector('[data-home-model-settings]').open");
  }
});
