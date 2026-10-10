import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";

function captureRequest(requests: unknown[]): unknown {
  const request = requests.find(request => (request as { tools?: Array<{ name: string }> }).tools?.some(tool => tool.name === "suggest-action"));
  assert.ok(request, "Inspect the actual Assistant turn, not its separate history-selection model call"); return request;
}

function draftMessage(request: unknown): string {
  const { messages } = request as { messages: Array<{ role: string; content: string | Array<{ type: string; text?: string }> }> };
  const texts = messages.filter(message => message.role === "user").flatMap(message => typeof message.content === "string"
    ? [message.content] : message.content.filter(block => block.type === "text").map(block => block.text ?? ""));
  const text = texts.find(text => /录入草稿 [0-9a-f-]{36}/.test(text));
  assert.ok(text, "The model must receive the capture request as a user message"); return text;
}

// ISSUE-14: this exercises actual page input, Assistant HTTP/Prologue and SQLite with a scripted vision provider.
test("ISSUE-14 / ISSUE-17 description leads the request, six images and full long text reach Assistant; confirmation alone saves", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  const { requests } = await issueModel(t, b.homeDirectory);
  const { origin, navigate, command, sessionId, click, evaluate, waitFor } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/plugins/issues` }, sessionId));
  await waitFor("document.querySelector('[data-issues=workbench]')?.dataset.ready === 'true'");
  const db = new DatabaseSync(join(b.homeDirectory, "issues", "issues.db")); t.after(() => db.close());
  await click("[data-issue-new]");
  assert.equal(await evaluate("document.querySelector('[name=title]').closest('label').hidden"), true);
  const description = "  我输入了一段文字，切换页面回来就不见了。\n";
  await click("[name=description]"); await command("Input.insertText", { text: description }, sessionId);
  const image = await evaluate<string>(`(async()=>{const c=document.createElement('canvas');c.width=160;c.height=80;c.getContext('2d').fillRect(0,0,160,80);const data=c.toDataURL('image/png'), bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));const dt=new DataTransfer();for(let i=0;i<6;i++)dt.items.add(new File([bytes],i+'.png',{type:'image/png'}));document.querySelector('[data-issue-drop]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));return data;})()`);
  await waitFor("document.querySelectorAll('[data-issue-images] img').length === 6 && !document.querySelector('[data-issue-organize]').disabled");
  assert.equal(await evaluate("document.querySelector('[data-issue-pick]').disabled && document.querySelector('[data-issue-image-count]').textContent==='6 / 6'"), true);
  await click("[data-issue-organize]");
  try { await waitFor("!document.querySelector('[data-issue-save]').hidden && document.querySelector('[data-issue-save]').textContent==='确认并保存'", 15000); }
  catch (error) { t.diagnostic(JSON.stringify({ note: await evaluate("document.querySelector('[data-issue-assistant-note]').textContent"), requests: requests.length,
    drafts: requests.map(request => JSON.stringify(request).match(/录入草稿 ([0-9a-f-]{36})/)?.[1]) })); throw error; }
  assert.equal(db.prepare("SELECT count(*) AS n FROM issues").get()!.n, 0);
  assert.equal(await evaluate("document.querySelector('[name=title]').value"), "切换页面后输入内容丢失");
  assert.equal(await evaluate("document.querySelector('[name=type]').value"), "bug");
  assert.equal(await evaluate("document.querySelector('[name=description]').value"), description);
  // ISSUE-24: the immutable capture still lets the person inspect their screenshots.
  assert.equal(await evaluate("document.querySelector('[name=description]').readOnly && document.querySelector('[data-issue-pick]').disabled && [...document.querySelectorAll('[data-issue-remove]')].every(b=>b.disabled)"), true);
  await click("[data-issue-images] [data-issue-preview]");
  await waitFor("document.querySelector('[data-issue-image-dialog]').open"); await click("[data-issue-image-close]");
  await click("[data-issue-model-settings]");
  await waitFor("document.querySelector('[data-home-model-settings] [data-model-name]')");
  assert.equal(await evaluate("document.querySelector('[data-home-model-settings]').getBoundingClientRect().width>800"), true);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-model-api-format]')).backgroundRepeat"), "no-repeat");
  const providerName = await evaluate("document.querySelector('[data-model-name]').value");
  await evaluate("document.querySelector('[data-model-name]').value='尚未保存的供应商名称';document.querySelector('[data-model-name]').dispatchEvent(new Event('input',{bubbles:true}))");
  assert.equal(await evaluate("document.querySelector('[data-model-status]').textContent"), "有未保存的修改", "Use the real Work settings binding");
  await click("[data-home-model-close]"); await click("[data-issue-model-settings]");
  assert.equal(await evaluate("document.querySelector('[data-model-name]').value"), "尚未保存的供应商名称");
  await click("[data-model-discard]"); await waitFor(`document.querySelector('[data-model-name]').value===${JSON.stringify(providerName)}`);
  await click("[data-home-model-close]");
  assert.equal(await evaluate("document.querySelector('[name=description]').value"), description);
  assert.equal(await evaluate("document.querySelectorAll('[data-issue-images] img').length"), 6);
  assert.equal(await evaluate("document.querySelector('[data-issue-save]').textContent"), "确认并保存");
  const firstRequest = captureRequest(requests);
  const outbound = JSON.stringify(firstRequest); assert.ok(outbound.includes(image.split(",")[1]!));
  assert.ok(outbound.includes("suggest-action"));
  assert.equal((outbound.match(/"type":"image"/g) ?? []).length, 6);
  const assistantRequests = requests.filter(request => (request as { tools?: Array<{ name: string }> }).tools?.some(tool => tool.name === "suggest-action"));
  assert.ok(assistantRequests.length >= 2, "Inspect both discovery and suggestion calls");
  for (const request of assistantRequests) assert.equal((JSON.stringify(request).match(/"type":"image"/g) ?? []).length, 6, "Original images must survive tool rounds");
  // ISSUE-17: inspecting the real model request catches moving the description back into attachments alone.
  assert.ok(draftMessage(firstRequest).includes(`本次问题描述：\n${description.trimEnd()}`));
  await evaluate("document.querySelector('[name=title]').value='我确认的标题';document.querySelector('[name=title]').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[name=type]').value='experience'");
  const evidence = resolve(".impeccable/qa/review/issue-home-v0"); await mkdir(evidence, { recursive: true });
  const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId); await writeFile(join(evidence, "assistant-confirm.png"), Buffer.from(shot.data, "base64"));
  await click("[data-issue-save]"); await waitFor("document.querySelector('[data-issue-note]').textContent==='已保存'");
  const saved = db.prepare("SELECT * FROM issues").get()!;
  assert.equal(saved.title, "我确认的标题"); assert.equal(saved.type, "experience"); assert.equal(saved.description, description); assert.equal(saved.entered_via, "assistant");
  assert.deepEqual(JSON.parse(String(saved.images_json)), Array.from({ length: 6 }, (_, i) => ({ name: `${i}.png`, data_url: image })));
  await navigate(() => command("Page.reload", {}, sessionId)); await waitFor(`document.querySelector('[data-issue-id="${saved.id}"]')`);
  await click(`[data-issue-id="${saved.id}"]`); await waitFor("document.querySelectorAll('[data-issue-images] img').length===6");
  assert.equal(await evaluate("document.querySelector('[name=title]').value"), saved.title);
  const longDescription = "开头说明录入场景。".padEnd(49_980, "甲") + "中间说明复现步骤。".padEnd(49_980, "乙") + "末尾才说明真正的问题：返回页面后文字丢失。";
  const nextRequest = requests.length;
  await click("[data-issue-new]"); await click("[name=description]"); await command("Input.insertText", { text: longDescription }, sessionId);
  await click("[data-issue-organize]"); await waitFor("document.querySelector('[data-issue-save]').textContent==='确认并保存'");
  const confirmGeometry = await evaluate("['[name=title]','[name=type]','[data-issue-scroll]'].map(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();return {selector,top:r.top,bottom:r.bottom,scroll:e.scrollTop}})");
  assert.equal(await evaluate("['title','type'].every(name=>{const r=document.querySelector('[name='+name+']').getBoundingClientRect(),s=document.querySelector('[data-issue-scroll]').getBoundingClientRect();return r.top>=s.top && r.bottom<=s.bottom})"),true,JSON.stringify(confirmGeometry));
  const longRequest = captureRequest(requests.slice(nextRequest));
  assert.ok(draftMessage(longRequest).includes("问题描述”全文材料"));
  assert.ok(draftMessage(longRequest).length < 20_000);
  const longOutbound = JSON.stringify(longRequest);
  for (const marker of ["开头说明录入场景。", "中间说明复现步骤。", "末尾才说明真正的问题：返回页面后文字丢失。"]) {
    if (!longOutbound.includes(marker)) await writeFile(join(evidence, "title-priority-long-request.json"), JSON.stringify(longRequest, null, 2));
    assert.ok(longOutbound.includes(marker), `The model must receive the long description marker: ${marker}`);
  }
  assert.equal(db.prepare("SELECT count(*) AS n FROM issues").get()!.n, 1);
  await click("[data-issue-revise]");
  assert.equal(await evaluate("document.querySelector('[name=description]').value"), longDescription);
  assert.equal(db.prepare("SELECT count(*) AS n FROM issues").get()!.n, 1);
});

test("ISSUE-15 no model keeps the original draft and allows explicit manual recovery", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  const { origin, navigate, command, sessionId, click, evaluate, waitFor } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/plugins/issues` }, sessionId));
  await waitFor("document.querySelector('[data-issues=workbench]')?.dataset.ready==='true'"); await click("[data-issue-new]");
  await click("[name=description]"); await command("Input.insertText", { text: "没有模型也不丢掉描述" }, sessionId);
  await click("[data-issue-organize]");
  await waitFor("document.querySelector('[data-issue-assistant-note]').textContent.includes('模型')", 15000);
  assert.equal(await evaluate("document.querySelector('[name=description]').value"), "没有模型也不丢掉描述");
  // ISSUE-23: failed loading is recoverable in place, without unloading the Issue draft.
  await command("Network.enable", {}, sessionId);
  await command("Network.setBlockedURLs", { urls: [`${origin}/settings/models*`] }, sessionId);
  await click("[data-issue-model-settings]");
  await waitFor("document.querySelector('[data-home-model-settings]')?.open");
  await waitFor("!document.querySelector('[data-home-model-retry]').hidden");
  assert.equal(await evaluate("location.pathname"), "/plugins/issues");
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  await click("[data-home-model-retry]");
  await waitFor("document.querySelector('[data-home-model-settings] [data-model-settings]')");
  assert.equal(await evaluate("document.querySelector('[data-home-model-settings]').textContent.includes('还没有配置供应商')"), true);
  await click("[data-home-model-close]");
  assert.equal(await evaluate("document.activeElement.matches('[data-issue-model-settings]')"), true);
  await click("[data-issue-model-settings]");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await waitFor("!document.querySelector('[data-home-model-settings]').open");
  assert.equal(await evaluate("document.querySelector('[name=description]').value"), "没有模型也不丢掉描述");
  await click("[data-issue-revise]"); await click("[data-issue-manual]");
  assert.equal(await evaluate("document.querySelector('[name=title]').closest('label').hidden"), false);
  assert.equal(await evaluate("document.querySelector('[name=description]').value"), "没有模型也不丢掉描述");
});
