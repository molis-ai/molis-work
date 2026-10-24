import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ChromeHarness, locateTestChrome, type ChromePage } from "@molis-ai/molis-work-test-kit/browser";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { MolisWorkLocalHost, ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { person } from "./fixtures/home-runtime.js";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";

const root = "[data-memory-import-test]", editor = root + " [data-memory-import-editor]";
const row = (index: number) => editor + ` [data-memory-import-entry="${index}"]`;
const entry = (text: string, changes: Record<string, unknown> = {}): Record<string, unknown> => ({ text, kind: "convention", source: "manual", basis: "repeated",
  origin: "归档的发布要求", applies: { task: "发布前核对" }, expires_at: null, ...changes });
const pack = (version: number, entries: Record<string, unknown>[]) => ({ format: "molis.memory", version,
  exported_at: "2026-10-20T00:00:00Z", scope: "personal", redactions: [], entries });
const ready = (page: ChromePage) => page.wait(`document.querySelector('${root} [data-memory-list]')?.getAttribute('aria-busy') === 'false' && !document.querySelector('${root} [data-import-before-read]')`);
const beforeRead = (page: ChromePage) => page.evaluate(`document.querySelector('${root} [data-memory-list]')?.firstElementChild?.setAttribute('data-import-before-read', '')`);
async function select(page: ChromePage, selector: string, value: string) {
  await page.wait(`document.querySelector(${JSON.stringify(selector)})?.closest('.mw-select-picker')`);
  await page.evaluate(`(() => {
    document.querySelector('[data-import-picker]')?.removeAttribute('data-import-picker');
    document.querySelector(${JSON.stringify(selector)}).closest('.mw-select-picker').setAttribute('data-import-picker', '');
  })()`);
  await page.click("[data-import-picker] .mw-select-picker__trigger");
  await page.click(`.mw-select-picker__menu:popover-open [data-value="${value}"]`);
}
async function choose(page: ChromePage, index: number, lifecycle = "long-term") {
  await page.click(row(index) + " [data-memory-import-scene][value=assistant]");
  await select(page, row(index) + " select[aria-label=保留时间]", lifecycle);
}
async function submit(page: ChromePage, accept = true) {
  await beforeRead(page);
  await page.click(editor + " button[type=submit]"); await page.wait("document.querySelector('[data-memory-confirm-yes]')");
  await page.click(accept ? "[data-memory-confirm-yes]" : ".memory-confirm button:not([data-memory-confirm-yes])");
}
async function error(page: ChromePage) {
  await page.wait(`document.querySelector('${root} [data-memory-error]')?.checkVisibility()`);
  return page.evaluate<string>(`document.querySelector('${root} [data-memory-error]').textContent`);
}
/** Type actual date segments, including the localized AM/PM control, without assigning a DOM value. */
async function deadline(page: ChromePage, selector: string, year: number) {
  await page.click(selector);
  const document = await page.command<{ root: { nodeId: number } }>("DOM.getDocument", { depth: 0 });
  const { nodeId } = await page.command<{ nodeId: number }>("DOM.querySelector", { nodeId: document.root.nodeId, selector });
  interface Node { backendNodeId: number; attributes?: string[]; children?: Node[]; shadowRoots?: Node[] }
  const { node } = await page.command<{ node: Node }>("DOM.describeNode", { nodeId, depth: -1, pierce: true });
  const nodes: Node[] = [];
  const collect = (one: Node) => { nodes.push(one); for (const child of [...one.children || [], ...one.shadowRoots || []]) collect(child); };
  collect(node);
  const field = (name: string) => nodes.find(one => one.attributes?.includes("-webkit-datetime-edit-" + name + "-field"));
  const parts = { year: String(year), month: "10", day: "24", hour: field("ampm") ? "04" : "16", minute: "45", second: "30", ...(field("ampm") ? { ampm: "p" } : {}) };
  for (const [name, value] of Object.entries(parts)) {
    const segment = field(name); assert.ok(segment, `native ${name} segment is available`);
    const { model } = await page.command<{ model: { content: number[] } }>("DOM.getBoxModel", { backendNodeId: segment.backendNodeId });
    const [x1, y1, x2, , , y2] = model.content;
    for (const type of ["mousePressed", "mouseReleased"]) await page.command("Input.dispatchMouseEvent", { type, x: (x1! + x2!) / 2, y: (y1! + y2!) / 2, button: "left", clickCount: 1 });
    for (const key of value) {
      const numeric = /[0-9]/.test(key), code = numeric ? "Digit" + key : "KeyP", windowsVirtualKeyCode = numeric ? 48 + Number(key) : 80;
      await page.command("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode, text: key });
      await page.command("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
    }
  }
  assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).value`), `${year}-10-24T16:45:30`);
}

async function setup(t: TestContext) {
  const executable = locateTestChrome(); assert.ok(executable, "Chrome is required for real memory file adoption");
  let browser: ChromeHarness | undefined, directory: string | undefined;
  t.after(async () => { await browser?.close(); if (directory) await rm(directory, { recursive: true, force: true }); });
  const env = await openTestHome(t), project = await env.createProject("旧记忆采用");
  const client = bindActionClient(env.host.actionClient(project.reference), () => person(MEMORY_PERMISSIONS, project.project_id));
  const canonical = async (host = env.host) => {
    const system = ensureSystemAgentService(host, env.home); await system.ready;
    const entries = await system.agentHost.adapter("prologue").memory!.withCaller({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id,
      person: true, consumer: "ui", purpose: "management", current_scene: "common" }).list("project", project.project_id);
    // List order is unspecified; reopening must preserve every field of the same identities.
    return entries.toSorted((a, b) => a.memory_id.localeCompare(b.memory_id));
  };
  const originalImport = MemoryService.prototype.importScope; let loseReply = false;
  const failures: Array<{ code?: string; details?: Record<string, unknown> }> = [];
  t.mock.method(MemoryService.prototype, "importScope", async function(this: MemoryService, ...args: Parameters<MemoryService["importScope"]>) {
    const result = await originalImport.apply(this, args).catch(error => { failures.push({ code: error.code, details: structuredClone(error.details) }); throw error; });
    if (loseReply) { loseReply = false; throw new Error("导入提交成功后的响应丢失"); }
    return result;
  });
  directory = await mkdtemp(join(tmpdir(), "molis-import-browser-")); browser = await ChromeHarness.start(directory, { executable });
  const page = await browser.page(), deliveries: Array<{ scope: string; package: ReturnType<typeof pack>; operation_id: string }> = [];
  browser.on("Network.requestWillBeSent", (params, sessionId) => {
    const request = params.request as { url?: string; postData?: string };
    if (sessionId === page.sessionId && request.url?.endsWith("/api/memory/import") && request.postData) deliveries.push(JSON.parse(request.postData));
  });
  await page.command("Network.enable");
  const { windowId } = await page.command<{ windowId: number }>("Browser.getWindowForTarget", { targetId: page.targetId });
  await page.command("Browser.setWindowBounds", { windowId, bounds: { width: 1440, height: 1000 } }); await page.viewport(1440, 1000);
  const navigate = async () => {
    await page.evaluate("document.documentElement.dataset.importOld = '1'");
    await page.command("Page.navigate", { url: env.origin + `/projects/${project.project_id}/settings/memory` });
    await page.wait(`document.documentElement !== null && document.documentElement.dataset.importOld !== '1'
      && document.readyState !== 'loading' && location.pathname === ${JSON.stringify(`/projects/${project.project_id}/`)}
      && [...document.querySelectorAll('[data-memory-settings]')].some(node => node.dataset.memoryScope === 'project' && node.checkVisibility())`,
      { describe: "JSON.stringify({url:location.href,ready:document.readyState,settings:document.querySelector('[data-settings-stage-body]')?.textContent.slice(0,300)})" });
    assert.equal(await page.evaluate(`(() => {
      const roots = [...document.querySelectorAll('[data-memory-settings]')].filter(node => node.checkVisibility());
      if (roots.length !== 1 || roots[0].dataset.memoryScope !== 'project') return false;
      roots[0].setAttribute('data-memory-import-test', ''); return true;
    })()`), true); await ready(page);
  };
  let fileNumber = 0;
  const upload = async (value: unknown) => {
    const file = join(directory!, `memory-${++fileNumber}.json`); await writeFile(file, JSON.stringify(value));
    const document = await page.command<{ root: { nodeId: number } }>("DOM.getDocument");
    const input = await page.command<{ nodeId: number }>("DOM.querySelector", { nodeId: document.root.nodeId, selector: root + " [data-memory-import]" });
    await beforeRead(page); await page.command("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [file] }); return file;
  };
  const restart = async () => {
    await page.command("Page.navigate", { url: "about:blank" }); await page.wait("location.href === 'about:blank'"); await env.close(); await env.host.close();
    const reopened = new MolisWorkLocalHost({ homeDirectory: env.home, completeText: null });
    let served: Awaited<ReturnType<typeof serveTestHost>> | undefined;
    try { served = await serveTestHost(null, { home: env.home, host: reopened }); return await canonical(reopened); }
    finally { await served?.close(); await reopened.close(); }
  };
  await navigate(); return { page, client, deliveries, failures, canonical, upload, navigate, restart, env, directory, loseNextReply: () => { loseReply = true; } };
}

test("IMPORT-01: old four-kind file requires explicit decisions, preserves unknown basis and survives reopening", { timeout: 180_000 }, async t => {
  const f = await setup(t), { page } = f, expires = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const kinds = ["preference", "convention", "fact", "experience"];
  const file = pack(1, kinds.map((kind, index) => entry(`第${index}项发布约定`, { kind, basis: index ? "inferred" : undefined, expires_at: expires })));
  await f.upload(file); await page.wait(`document.querySelector('${editor}')?.checkVisibility()`); await ready(page);
  assert.equal(await page.evaluate(`document.querySelectorAll('${editor} input[type=checkbox]:checked').length`), 0);
  assert.deepEqual(await page.evaluate(`Array.from(document.querySelectorAll('${editor} select[aria-label=保留时间]'), node => node.value)`), ["", "", "", ""]);
  assert.match(await page.evaluate<string>(`document.querySelector('${editor}').textContent`), /原依据未知/);
  await page.click(editor + " button[type=submit]"); assert.match(await error(page), /至少选择/);
  assert.equal(f.deliveries.length, 0); assert.deepEqual(await f.canonical(), []);
  await page.click(editor + " [data-memory-import-cancel]"); assert.equal(await page.evaluate(`document.querySelector('${editor}').hidden`), true);
  await f.upload(file); await page.wait(`document.querySelector('${editor}')?.checkVisibility()`); await ready(page);
  for (let index = 0; index < 4; index++) await choose(page, index, index ? "short-term" : "long-term");
  await submit(page, false); await ready(page); assert.equal(f.deliveries.length, 0); assert.deepEqual(await f.canonical(), []);
  await submit(page); await page.wait(`document.querySelector('${editor}').hidden`); await ready(page);
  const stored = await f.canonical(); assert.equal(stored.length, 4); assert.equal(f.deliveries.length, 1);
  const projection = await f.client.invoke(memoryActions.page, { scope: "project" });
  assert.equal(projection.items.find(one => one.text === file.entries[0]!.text)!.basis, null);
  assert.equal(f.deliveries[0]!.scope, "project"); assert.equal(f.deliveries[0]!.package.version, 2);
  assert.equal(f.deliveries[0]!.package.entries[0]!.basis, null);
  for (let index = 0; index < 4; index++) {
    const item = stored.find(one => one.text === file.entries[index]!.text)!; assert.ok(item);
    assert.equal(item.meta.kind, kinds[index]); assert.equal(item.meta.basis, index ? "inferred" : undefined);
    assert.equal(item.meta.source, "imported"); assert.equal(item.meta.approved_by, undefined);
    assert.equal(item.meta.expires_at_ms, Date.parse(expires)); assert.deepEqual(item.meta.applies_when, file.entries[index]!.applies);
    assert.deepEqual(item.meta.classification, { scenes: ["assistant"], lifecycle: index ? "short-term" : "long-term" });
    assert.match(item.origin, /原出处：归档的发布要求/);
  }
  assert.deepEqual(await f.restart(), stored);
});

test("IMPORT-01: an unknown kind requires an explicit correction before adopting missing classification", { timeout: 120_000 }, async t => {
  const f = await setup(t), { page } = f;
  const file = pack(2, [entry("旧类别不应被默认猜测", { kind: "unknown-kind", basis: null })]);
  await f.upload(file); await page.wait(`document.querySelector('${editor}')?.checkVisibility()`); await ready(page);
  assert.equal(await page.evaluate(`document.querySelector('${row(0)} select[aria-label=类别]').value`), "");
  await choose(page, 0); await page.click(editor + " button[type=submit]");
  assert.match(await error(page), /请选择类别/); assert.equal(f.deliveries.length, 0); assert.deepEqual(await f.canonical(), []);
  await select(page, row(0) + " select[aria-label=类别]", "fact");
  await submit(page); await page.wait(`document.querySelector('${editor}').hidden`); await ready(page);
  assert.equal(f.deliveries.length, 1); assert.equal(f.deliveries[0]!.package.entries[0]!.kind, "fact");
  const stored = await f.canonical(); assert.equal(stored.length, 1); assert.equal(stored[0]!.meta.kind, "fact");
  assert.equal(stored[0]!.meta.basis, undefined); assert.equal(file.entries[0]!.kind, "unknown-kind");
  assert.deepEqual(await f.restart(), stored);
});

test("IMPORT-02: malformed classification, basis and Session adoption are refused before any HTTP import", { timeout: 120_000 }, async t => {
  const f = await setup(t), good = entry("拒绝前不应产生部分导入");
  const invalid = [pack(9, [good]), pack(2, [good, entry("非法依据", { basis: "guessed" })]),
    pack(2, [good, entry("未知场景", { classification: { scenes: ["unknown"], lifecycle: "long-term" } })]),
    pack(2, [good, entry("空分类对象", { classification: {} })]), pack(1, [entry("空分类字符串", { classification: "" })]),
    pack(1, [entry("非法期限", { expires_at: "not-a-date" })]), pack(1, [entry("缺出处", { origin: undefined })]),
    pack(1, [good, entry("完整旧会话仍拒绝采用", { classification: { scenes: ["assistant"], lifecycle: "session" },
      session_ref: { kind: "session", id: "untrusted-session", revision: 1 } })]),
    pack(2, [good, entry("会话不能去绑定", { session_ref: { kind: "session", id: "untrusted-session", revision: 1 } })])];
  for (const value of invalid) {
    await f.upload(value); assert.match(await error(f.page), /没有导入任何条目/);
    assert.equal(await f.page.evaluate(`document.querySelector('${editor}').hidden`), true);
    assert.equal(f.deliveries.length, 0); assert.deepEqual(await f.canonical(), []);
  }
  // Complete packages retain the original route. A forged Session cannot gain authority from a file.
  const session = { kind: "session", id: "untrusted-session", revision: 1 };
  const current = pack(2, [entry("完整会话包仍受授权约束", { classification: { scenes: ["assistant"], lifecycle: "session" }, session_ref: session })]);
  await f.upload(current); await f.page.wait(`document.querySelector('${root} [data-memory-retry]')`);
  assert.equal(f.deliveries.length, 1); assert.deepEqual(f.deliveries[0]!.package, current); assert.deepEqual(await f.canonical(), []);
  const extra = pack(2, [entry("扩展分类不能被剥离以通过导入", { classification: { scenes: ["coding"], lifecycle: "long-term", extra: { unannounced: ["value"] } } })]);
  await f.upload(extra); await f.page.wait(`document.querySelectorAll('${root} [data-memory-retry]').length === 2`);
  assert.equal(f.deliveries.length, 2); assert.deepEqual(f.deliveries[1]!.package, extra); assert.deepEqual(await f.canonical(), []);
});

test("IMPORT-02/04: a complete v2 mixed Session package preserves the backend partial outcome and original retry", { timeout: 120_000 }, async t => {
  const f = await setup(t), { page } = f;
  const ordinary = entry("会话项之前已导入的普通约定", { classification: { scenes: ["coding"], lifecycle: "long-term" } });
  const session = entry("文件不能授权的会话约定", { classification: { scenes: ["assistant"], lifecycle: "session" },
    session_ref: { kind: "session", id: "untrusted-session", revision: 1 } });
  const untouched = entry("失败之后尚未开始的普通约定", { classification: { scenes: ["assistant"], lifecycle: "long-term" } });
  const file = pack(2, [ordinary, session, untouched]);
  await f.upload(file); assert.match(await error(page), /导入没有全部完成/);
  assert.equal(await page.evaluate(`document.querySelector('${editor}').hidden`), true);
  assert.equal(f.deliveries.length, 1); assert.deepEqual(f.deliveries[0]!.package, file);
  const applied = await f.canonical(); assert.equal(applied.length, 1); assert.equal(applied[0]!.text, ordinary.text);
  assert.equal(f.failures.length, 1); assert.equal(f.failures[0]!.code, "memory.conflict");
  assert.deepEqual(f.failures[0]!.details, { operation_id: f.deliveries[0]!.operation_id,
    completed_memory_ids: [applied[0]!.memory_id], skipped: 0, refused: 0, failed_index: 1,
    failed_operation_id: `${f.deliveries[0]!.operation_id}:import:1`, failed_outcome: "unknown", not_started: 1 });
  await page.click(root + " [data-memory-retry]"); assert.match(await error(page), /导入没有全部完成/);
  assert.equal(f.deliveries.length, 2); assert.deepEqual(f.deliveries[1], f.deliveries[0]);
  assert.equal(f.failures.length, 2); assert.deepEqual(f.failures[1], f.failures[0]);
  assert.deepEqual(await f.canonical(), applied); assert.deepEqual(await f.restart(), applied);
});

test("IMPORT-03: expired adoption needs a chosen future instant and confirmation, never automatic renewal", { timeout: 120_000 }, async t => {
  const f = await setup(t), { page } = f;
  await page.command("Emulation.setTimezoneOverride", { timezoneId: "Asia/Tokyo" });
  const expired = "2020-01-01T00:00:00Z", file = pack(2, [entry("仅在明确新期限内使用的发布要求", { expires_at: expired })]);
  await f.upload(file); await page.wait(`document.querySelector('${editor}')?.checkVisibility()`); await ready(page);
  await choose(page, 0, "short-term"); await page.click(editor + " button[type=submit]");
  assert.match(await error(page), /原记忆已到期/); assert.equal(f.deliveries.length, 0);
  await select(page, row(0) + " select[aria-label=保留时间]", "long-term");
  await select(page, row(0) + " select[aria-label=期限决定]", "remove"); await page.click(editor + " button[type=submit]");
  assert.match(await error(page), /原记忆已到期/); assert.deepEqual(await f.canonical(), []);
  await select(page, row(0) + " select[aria-label=保留时间]", "short-term");
  await select(page, row(0) + " select[aria-label=期限决定]", "set");
  const year = new Date().getUTCFullYear() + 1, expected = new Date(Date.UTC(year, 9, 24, 7, 45, 30)).toISOString();
  const date = row(0) + " input[type=datetime-local]";
  assert.equal(await page.evaluate(`document.querySelector('${date}').value`), "");
  await deadline(page, date, year);
  await beforeRead(page);
  await page.click(editor + " button[type=submit]"); await page.wait("document.querySelector('[data-memory-confirm-yes]')");
  assert.match(await page.evaluate<string>("document.querySelector('.memory-confirm').textContent"), /按新期限重新导入.*不是对原记忆续期/s);
  await page.click(".memory-confirm button:not([data-memory-confirm-yes])"); await ready(page);
  assert.equal(f.deliveries.length, 0); assert.deepEqual(await f.canonical(), []);
  await submit(page); await page.wait(`document.querySelector('${editor}').hidden`); await ready(page);
  assert.equal(f.deliveries[0]!.package.entries[0]!.expires_at, expected);
  const stored = await f.canonical(); assert.equal(stored.length, 1); assert.equal(stored[0]!.meta.expires_at_ms, Date.parse(expected));
  assert.deepEqual(stored[0]!.meta.classification, { scenes: ["assistant"], lifecycle: "short-term" });
  assert.equal(file.entries[0]!.expires_at, expired); assert.deepEqual(await f.restart(), stored);
});

for (const version of [1, 2]) test(`IMPORT-04: a mixed v${version} file keeps current constraints and replays the frozen decision after a lost reply`, { timeout: 120_000 }, async t => {
  const f = await setup(t), { page } = f, expires = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const complete = entry("已分类插件的发布约定", { classification: { scenes: ["coding"], lifecycle: "short-term", extra: {} }, namespace: "example.plugin", expires_at: expires });
  const file = pack(version, [complete, entry("仍需本人分类的项目事实", { kind: "fact", basis: null }), entry("另一条待分类", { kind: "experience" })]);
  const selectedFile = await f.upload(file); await page.wait(`document.querySelector('${editor}')?.checkVisibility()`); await ready(page);
  assert.equal(await page.evaluate(`document.querySelectorAll('${editor} [data-memory-import-entry]').length`), 2);
  assert.equal(await page.evaluate(`document.querySelector('${row(0)}') === null`), true, "a complete item is never offered classification editing, including in v1");
  await choose(page, 1); await page.click(editor + " button[type=submit]"); assert.match(await error(page), /至少选择/);
  assert.equal(f.deliveries.length, 0); assert.deepEqual(await f.canonical(), []);
  await choose(page, 2, "short-term"); await page.click(editor + " button[type=submit]");
  assert.match(await error(page), /短期记忆需要未来的截止时间/); assert.equal(f.deliveries.length, 0);
  await select(page, row(2) + " select[aria-label=保留时间]", "long-term"); f.loseNextReply(); await submit(page);
  await page.wait(`document.querySelector('${root} [data-memory-retry]')`);
  const first = structuredClone(f.deliveries[0]!); assert.equal(first.package.version, 2); assert.deepEqual(first.package.entries[0], complete);
  const applied = await f.canonical(); assert.equal(applied.length, 3);
  const constrained = applied.find(one => one.text === complete.text)!; assert.ok(constrained);
  // The SDK omits empty extra dimensions; the delivered complete item above must still retain every original field.
  assert.deepEqual(constrained.meta, { kind: "convention", source: "imported", basis: "repeated",
    classification: { scenes: ["coding"], lifecycle: "short-term" }, namespace: "example.plugin",
    expires_at_ms: Date.parse(expires), applies_when: { task: "发布前核对" } });
  assert.match(constrained.origin, /原出处：归档的发布要求/);
  assert.equal(await page.evaluate(`document.querySelector('${editor}').hidden`), true);
  await writeFile(selectedFile, JSON.stringify(pack(1, [entry("原文件已被外部替换")])));
  await f.upload(pack(1, [entry("另一次尚未提交的采用草稿")])); await page.wait(`document.querySelector('${editor}')?.checkVisibility()`); await ready(page);
  await choose(page, 0, "short-term");
  await beforeRead(page);
  await page.click(root + " [data-memory-retry]"); await page.wait(`document.querySelector('${root} [data-memory-retries]').hidden`); await ready(page);
  assert.equal(f.deliveries.length, 2); assert.deepEqual(f.deliveries[1], first); assert.deepEqual(await f.canonical(), applied);
  await page.click(editor + " [data-memory-import-cancel]");
  // The complete current package still imports immediately and deduplicates without opening the adoption editor.
  await f.upload(first.package); await ready(page);
  assert.equal(f.deliveries.length, 3); assert.deepEqual(f.deliveries[2]!.package, first.package); assert.deepEqual(await f.canonical(), applied);
  assert.deepEqual(await f.restart(), applied);
});

test("IMPORT-05: adoption remains readable and cancellable in both languages and three viewport widths", { timeout: 240_000 }, async t => {
  const f = await setup(t), { page } = f, value = pack(1, [entry("供本人核对的旧记忆正文")]);
  const screenshots = join(process.cwd(), ".impeccable/qa/review/memory-import-adoption");
  await mkdir(screenshots, { recursive: true });
  for (const locale of ["zh", "en"]) for (const width of [1440, 1024, 390]) for (const theme of ["light", "dark"]) {
    await page.command("Network.setCookie", { name: "molis_work_locale", value: locale, url: f.env.origin, path: "/" });
    await page.viewport(width, 960); await page.evaluate(`localStorage.setItem('molis-work:theme', '${theme}')`); await f.navigate();
    await f.upload(value); await page.wait(`document.querySelector('${editor}')?.checkVisibility()`); await ready(page);
    assert.equal(await page.evaluate(`document.querySelector('${editor} h3').textContent`), locale === "zh" ? "决定旧记忆的用途" : "Choose how to use these memories");
    assert.equal(await page.evaluate("document.documentElement.dataset.theme"), theme);
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth && document.querySelector('${editor}').scrollWidth <= document.querySelector('${editor}').clientWidth + 1`), true);
    await page.screenshot(join(screenshots, `adoption-${locale}-${width}-${theme}.png`));
    await page.click(editor + " [data-memory-import-cancel]"); assert.equal(f.deliveries.length, 0); assert.deepEqual(await f.canonical(), []);
  }
});
