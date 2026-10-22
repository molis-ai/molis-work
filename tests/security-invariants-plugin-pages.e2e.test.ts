import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

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
  for (const path of ["/api/host/plugin-pages", "/api/plugins/io.molis.work.cognia/disable"]) {
    assert.equal(await child.evaluate(`fetch(${JSON.stringify(`/projects/${browser.projectId}` + path)},{method:'POST',body:'{}'}).then(response=>response.status)`), 403, path);
  }
  for (const operation of ["prepare", "attach"]) {
    const path = `/projects/${browser.projectId}/api/contextual/${operation}`;
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
