import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { setProjectOutputFolder } from "./fixtures/project-directories-http.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";
import { openTodoStore } from "./fixtures/plugin-home-stores.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";
import { asideReply } from "./fixtures/ending-review.js";
import { CODING_BOX, CODING_COMPOSER, CODING_OPEN, CODING_SEND, codingControl, codingType, codingDeliver, codingAdd } from "./fixtures/coding-composer.js";

async function fixture(t: TestContext, answer?: (turn: number) => Promise<Response>, title = "共享来源待办") {
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); });
  const requests: unknown[] = [];
  const model = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    const aside = asideReply(raw);
    if (!aside) requests.push(JSON.parse(raw));
    const result = !aside && answer ? await answer(requests.length) : cogniaModelResponse(aside || "已阅读本次材料。");
    response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text());
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const b = await openGoalBrowser(t, "seeded", undefined, undefined, undefined, undefined, {
    prepareHome: home => seedConfiguredModels(home, [{ provider_id: "fixture", model_id: "fixture-model" }], `http://127.0.0.1:${address.port}`),
  });
  if (!b) return;
  const directory = join(b.homeDirectory, "material-workspace"); await mkdir(directory);
  await writeFile(join(directory, "workspace-notes.txt"), "Workspace mention stays a Coding file reference.");
  await setProjectOutputFolder(b.web, b.projectId!, directory);
  const access = { actor: "user" as const, actorId: "web-user", projectId: b.projectId!, projectIds: [] };
  const store = openTodoStore(b.homeDirectory);
  const picked = (() => { try { return store.create({ title, notes: "只给本次模型的白鹭资料", placement: "project" }, access).item; } finally { store.close(); } })();
  const child = await pluginFrameBrowser(t, b, "coding");
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/?openPlugin=coding` }, b.sessionId));
  await child.click("[data-coding-new]"); await b.waitFor(CODING_OPEN);
  for (const [id, value] of [["model", JSON.stringify(["fixture", "fixture-model"])], ["intent", "discuss"]]) {
    await b.evaluate(`{ const control = document.querySelector(${JSON.stringify(codingControl(id!))}); control.value = ${JSON.stringify(value)}; control.dispatchEvent(new Event('change', { bubbles: true })); }`);
  }
  // Capture only real requests after the production frame adapter has prepared them; no backend response is replaced.
  await child.evaluate(`{ window.materialCommands = []; const original = window.molisWorkRequest; window.molisWorkRequest = Object.assign(async (url, options) => {
    if (options?.method === 'POST' && String(url).endsWith('/runs')) window.materialCommands.push({ url, body: structuredClone(options.body) });
    const response = await original(url, options);
    if (window.holdMaterialReceipts && (!options?.method || options.method === 'GET') && String(url).includes('/sessions/')) {
      await new Promise(resolve => (window.materialReadReleases ||= []).push(resolve));
    }
    return response;
  }, original); }`);
  const choose = async (title = "共享来源待办") => {
    await b.click(`${CODING_COMPOSER} [data-composer-add]`);
    await b.waitFor(`document.querySelector(${JSON.stringify(CODING_COMPOSER + " [data-composer-source]")})`);
    await b.evaluate(`[...document.querySelectorAll(${JSON.stringify(CODING_COMPOSER + " [data-composer-source]")})].find(item => item.textContent.includes('待办')).click()`);
    await b.waitFor(`[...document.querySelectorAll('[data-composer-pick]')].some(item => item.textContent.includes(${JSON.stringify(title)}))`);
    await b.evaluate(`[...document.querySelectorAll('[data-composer-pick]')].find(item => item.textContent.includes(${JSON.stringify(title)})).click()`);
  };
  const send = async (text: string) => { await b.evaluate(codingType(text)); await b.waitFor(`!document.querySelector(${JSON.stringify(CODING_SEND)}).disabled`); await b.click(CODING_SEND); };
  return { b, child, requests, picked, access, choose, send };
}

test("QEA-42 QEA-46: Coding sends a real Todo source once and preserves a rejected pick until the person removes it", { timeout: 180_000 }, async t => {
  const f = await fixture(t); if (!f) return;
  const { b, child, requests, picked, access, choose, send } = f;
  await b.click(CODING_BOX);
  await b.command("Input.insertText", { text: "@" }, b.sessionId);
  await b.command("Input.insertText", { text: "workspace-notes" }, b.sessionId);
  await b.waitFor("[...document.querySelectorAll('[data-composer-mention]')].some(row => row.textContent.includes('workspace-notes.txt'))");
  await b.evaluate("[...document.querySelectorAll('[data-composer-mention]')].find(row => row.textContent.includes('workspace-notes.txt')).click()");
  assert.match(await b.evaluate<string>(`document.querySelector(${JSON.stringify(CODING_BOX)}).value`), /@workspace-notes.txt/u);
  assert.equal(await b.evaluate(`document.querySelectorAll(${JSON.stringify(CODING_COMPOSER + " .mw-upload")}).length`), 0, "Coding's @ remains a workspace text reference, not a system material selection");
  await choose();
  // Coding current references intentionally read the latest owner version when a new round starts.
  const changed = openTodoStore(b.homeDirectory);
  try { changed.update(picked.id, { notes: "后来修改后的白鹭资料" }, undefined, access); } finally { changed.close(); }
  await send("@workspace-notes.txt 请阅读这份待办材料");
  await child.waitFor("window.materialCommands.length === 1 && document.querySelector('[data-coding-workbench]').textContent.includes('已阅读本次材料')", 30_000);
  await b.waitFor(`document.querySelector(${JSON.stringify(CODING_BOX)}).value === '' && !document.querySelector(${JSON.stringify(CODING_COMPOSER + " .mw-upload")})`);
  const first = await child.evaluate<{ url: string; body: { materials: Array<{ ref: { subject: { id: string; kind: string } } }> } }>("materialCommands[0]");
  assert.equal(first.body.materials.length, 1); assert.equal(first.body.materials[0]!.ref.subject.id, picked.id);
  assert.ok(JSON.stringify(requests).includes("后来修改后的白鹭资料"), "a current reference resolves the latest owner content, not the version at picking");
  const ended = `!document.querySelector(${JSON.stringify(CODING_COMPOSER + " [data-composer-stop]")})?.checkVisibility() && document.querySelector(${JSON.stringify(CODING_BOX)}).value === ''`;
  await b.waitFor(ended, 30_000); await send("下一轮没有新材料");
  await child.waitFor("materialCommands.length === 2", 20_000);
  assert.deepEqual(await child.evaluate("materialCommands[1].body.materials"), [], "a one-shot source never becomes a persistent next-round selection");
  await b.waitFor(ended, 30_000);
  await choose();
  // An actual owner exclusion after picking must fail before a Run.
  await b.web.post(`/projects/${b.projectId}/api/knowledge/exclude`, { subject: first.body.materials[0]!.ref.subject, excluded: true });
  const before = requests.length;
  await send("保留这次输入和材料");
  await b.waitFor(`document.querySelector(${JSON.stringify(CODING_COMPOSER + " .mw-upload .is-failed")})`, 20_000);
  assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(CODING_BOX)}).value`), "保留这次输入和材料");
  assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(CODING_SEND)}).disabled`), true);
  assert.equal(requests.length, before, "an excluded picked material creates no inference");
  assert.equal(await child.evaluate("document.querySelector('[data-coding-material-recovery]') !== null"), false, "a source error is marked in its own strip, not offered as removal of an unrelated saved selection");
  await b.click(`${CODING_COMPOSER} .mw-upload [data-composer-remove]`);
  await b.waitFor(`!document.querySelector(${JSON.stringify(CODING_SEND)}).disabled`);
  assert.equal(requests.length, before, "removal does not automatically resend");
  await b.click(CODING_SEND);
  await b.waitFor(`document.querySelector(${JSON.stringify(CODING_BOX)}).value === ''`, 30_000);
  assert.deepEqual(await child.evaluate("materialCommands.at(-1).body.materials"), []);
});

test("QEA-42 QEA-46: mixed saved and one-shot choices deduplicate exact refs and recover the failed owner's selection without automatic resend", { timeout: 180_000 }, async t => {
  const f = await fixture(t, undefined, '共享来源待办<img src=x onerror="globalThis.materialInjected=1">'); if (!f) return;
  const { b, child, requests, access, picked, choose, send } = f;
  await b.evaluate(codingAdd("materials"));
  await b.waitFor("document.querySelector('.knowledge-picker')?.open === true");
  await b.waitFor("[...document.querySelectorAll('[data-knowledge-picker-list] li')].some(row => row.textContent.includes('共享来源待办') && row.querySelector('input[type=checkbox]'))", 20_000);
  await b.evaluate("[...document.querySelectorAll('[data-knowledge-picker-list] li')].find(row => row.textContent.includes('共享来源待办')).querySelector('input[type=checkbox]').click()");
  await b.click("[data-knowledge-picker-confirm]");
  await b.waitFor("!document.querySelector('.knowledge-picker').open");
  const store = openTodoStore(b.homeDirectory);
  const bad = (() => { try { return store.create({ title: "另一个会撤回的来源", notes: "选择时的正文", placement: "project" }, access).item; } finally { store.close(); } })();
  await choose(bad.title);
  await b.web.post(`/projects/${b.projectId}/api/plugins/io.molis.work.todo/items/${bad.id}/delete`, { expected_revision: bad.revision });
  await send("混合材料失败时保留正常的长期选择");
  await b.waitFor(`document.querySelector(${JSON.stringify(CODING_COMPOSER + " .mw-upload .is-failed")})`, 20_000);
  const first = await child.evaluate<Array<{ ref: { subject: { id: string } } }>>("materialCommands[0].body.materials");
  assert.deepEqual(first.map(item => item.ref.subject.id), [picked.id, bad.id]);
  assert.equal(await child.evaluate("document.querySelector('[data-coding-material-recovery]') !== null"), false, "index 1 is the source strip; it does not remove saved selection 0");
  await b.click(`${CODING_COMPOSER} .mw-upload [data-composer-remove]`);
  await choose(); await b.click(CODING_SEND);
  await b.waitFor(`document.querySelector(${JSON.stringify(CODING_BOX)}).value === ''`, 30_000);
  assert.equal(await child.evaluate("materialCommands[1].body.materials.length"), 1, "the same exact reference selected through both entries is sent once");
  await b.waitFor(`!document.querySelector(${JSON.stringify(CODING_COMPOSER + " [data-composer-stop]")})?.checkVisibility()`, 30_000);
  await b.web.post(`/projects/${b.projectId}/api/knowledge/exclude`, { subject: { kind: "todo_item", id: picked.id }, excluded: true });
  const before = requests.length;
  await send("长期材料失败以后请保留我的输入");
  await child.waitFor("document.querySelector('[data-coding-drop-failed-materials]')?.checkVisibility()", 20_000);
  assert.deepEqual(await child.evaluate("[document.querySelectorAll('[data-coding-material-recovery] img').length, typeof globalThis.materialInjected]"), [0, "undefined"], "untrusted material names remain text in the locally rendered controls");
  const shots = join(process.cwd(), ".impeccable/qa/review/quality-audit-composer"); await mkdir(shots, { recursive: true });
  for (const width of [1440, 1024, 390]) for (const theme of ["light", "dark"]) {
    await b.evaluate(`localStorage.setItem('molis-work:theme',${JSON.stringify(theme)}); dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:${JSON.stringify(theme)}}))`);
    await child.waitFor(`document.documentElement.dataset.resolvedTheme === ${JSON.stringify(theme)}`);
    await b.command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, b.sessionId);
    await child.evaluate("document.querySelector('[data-coding-material-recovery]').scrollIntoView({ block: 'center' })");
    const bounds = await child.evaluate<{ left: number; right: number; width: number }>("{ const box = document.querySelector('[data-coding-material-recovery]').getBoundingClientRect(); ({left:box.left,right:box.right,width:innerWidth}) }");
    assert.ok(bounds.left >= 0 && bounds.right <= bounds.width + 1, JSON.stringify(bounds));
    const shot = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, b.sessionId);
    await writeFile(join(shots, `material-recovery-${theme}-${width}.png`), Buffer.from(shot.data, "base64"));
  }
  await child.click("[data-coding-drop-failed-materials]");
  await child.waitFor("!document.querySelector('[data-coding-material-recovery]')");
  assert.equal(requests.length, before);
  assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(CODING_BOX)}).value`), "长期材料失败以后请保留我的输入");
  assert.equal(await child.evaluate("materialCommands.length"), 3, "removing the failed saved choice does not submit from the frame");
  await b.click(CODING_SEND); await b.waitFor(`document.querySelector(${JSON.stringify(CODING_BOX)}).value === ''`, 30_000);
  assert.deepEqual(await child.evaluate("materialCommands[3].body.materials"), []);
});

for (const mutation of ["unchanged", "updated", "revoked"] as const) test(`QEA-45: lost response with ${mutation} current material preserves its sending identity until the owner confirms it`, { timeout: 180_000 }, async t => {
  const release = Promise.withResolvers<void>(); t.after(() => release.resolve());
  const f = await fixture(t, async turn => { if (turn === 1) await release.promise; return cogniaModelResponse("已结束首轮。"); });
  if (!f) return;
  const { b, child, requests, choose, send, access, picked } = f;
  await send("先进行这一轮讨论");
  await b.waitFor(`document.querySelector(${JSON.stringify(CODING_COMPOSER + " [data-composer-stop]")})?.checkVisibility() && !document.querySelector(${JSON.stringify(CODING_COMPOSER + " [data-composer-stop]")}).disabled`, 30_000);
  await child.evaluate(`{
    window.holdMaterialReceipts = true;
    window.controlRequests = [];
    const fetch = window.fetch;
    window.fetch = async (...args) => {
      const body = args[1]?.body;
      if (typeof body === 'string' && body.includes('"kind":"steer"')) {
        window.controlRequests.push(JSON.parse(body));
        window.receiptSessionUrl = new URL(args[0], location.href).pathname.slice(0, -'/control'.length);
        const response = await fetch(...args);
        if (window.controlRequests.length === 1) {
          window.acceptedMaterialReceipt = await response.clone().json();
          throw new TypeError('controlled response loss after actual owner acceptance');
        }
        return response;
      }
      return fetch(...args);
    };
  }`);
  await choose(); await b.evaluate(codingDeliver("after-run")); await send("这段原话和所选材料已交给主人");
  await child.waitFor("window.acceptedMaterialReceipt?.receipt", 20_000);
  await b.waitFor(`document.querySelector(${JSON.stringify(CODING_COMPOSER)}).textContent.includes('没确认送到')`);
  assert.equal(await child.evaluate("controlRequests.length"), 1);
  assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(CODING_BOX)}).value`), "这段原话和所选材料已交给主人");
  if (mutation !== "unchanged") {
    if (mutation === "updated") await b.web.post(`/projects/${b.projectId}/api/plugins/io.molis.work.todo/items/${picked.id}`, { notes: "材料已经改成新的内容", expected_revision: picked.revision });
    else await b.web.post(`/projects/${b.projectId}/api/knowledge/exclude`, { subject: { kind: "todo_item", id: picked.id }, excluded: true });
    for (let attempt = 2; attempt <= 3; attempt++) {
      await b.click(CODING_SEND);
      await child.waitFor(`controlRequests.length === ${attempt}`);
      await b.waitFor(`document.querySelector(${JSON.stringify(CODING_COMPOSER)}).textContent.includes('上次是否送达仍待确认')`, 20_000);
      assert.equal(await b.evaluate(`document.querySelectorAll(${JSON.stringify(CODING_COMPOSER + " .mw-upload")}).length`), 1);
    }
    assert.equal(await child.evaluate("new Set(controlRequests.map(input => input.key)).size"), 1, "a refused retry never invents a new input identity");
  }
  const store = openTodoStore(b.homeDirectory);
  try { store.create({ title: "后来选择的另一份材料", notes: "未发送的新内容", placement: "project" }, access); } finally { store.close(); }
  await b.evaluate(codingType("后来输入的内容请保留")); await choose("后来选择的另一份材料");
  await b.waitFor(`document.querySelectorAll(${JSON.stringify(CODING_COMPOSER + " .mw-upload")}).length === 2`);
  // RC-18/D31: the runtime intentionally exposes the session queue only after the active round ends.
  // End that real round, then release ordinary owner reads; this must not start the queued round by itself.
  release.resolve();
  await child.evaluate("window.holdMaterialReceipts = false; for (const release of window.materialReadReleases || []) release(); window.materialReadReleases = []");
  await b.waitFor(`document.querySelectorAll(${JSON.stringify(CODING_COMPOSER + " .mw-upload")}).length === 1`, 20_000);
  assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(CODING_BOX)}).value`), "后来输入的内容请保留");
  assert.match(await b.evaluate<string>(`document.querySelector(${JSON.stringify(CODING_COMPOSER + " .mw-upload")}).textContent`), /后来选择的另一份材料/u);
  assert.equal(await child.evaluate("controlRequests.length"), mutation === "unchanged" ? 1 : 3, "a successful owner observation settles without sending the supplement again");
  assert.equal(requests.length, 1, "after-run input still waits after the first round ends; observing its receipt starts no model");
  const queued = await child.evaluate<Array<{ key: string; text: string }>>("(async () => (await window.molisWorkRequest(window.receiptSessionUrl)).session.queued_inputs)()");
  assert.equal(queued.length, 1, "the actual owner still has one accepted input after all explicit retries");
  assert.equal(queued[0]!.key, await child.evaluate("controlRequests[0].key"));
  assert.ok(queued[0]!.text.includes("只给本次模型的白鹭资料"), "the first accepted material text stays immutable");
  assert.ok(!queued[0]!.text.includes("材料已经改成新的内容"));
  release.resolve();
});
