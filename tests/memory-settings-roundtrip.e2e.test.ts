import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ChromeHarness, locateTestChrome, type ChromePage } from "@molis-ai/molis-work-test-kit/browser";
import { bindActionClient, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, memoryActions, type MemoryExportPackage, type MemoryImportResult, type MemoryManagementItem } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { person } from "./fixtures/home-runtime.js";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";

const root = "[data-memory-roundtrip-test]";
const row = (id: string) => `${root} [data-memory-id="${id}"]`;
const ready = (page: ChromePage) => page.wait(`document.querySelector('${root} [data-memory-list]')?.getAttribute('aria-busy') === 'false' && document.querySelector('${root} [data-memory-error]').hidden`);
const items = async (client: BoundActionClient, scope: "personal" | "project") =>
  (await client.invoke(memoryActions.page, { scope })).items.sort((a, b) => a.memory_id.localeCompare(b.memory_id));

async function navigate(page: ChromePage, url: string) {
  await page.evaluate("document.documentElement.dataset.oldMemoryRoundtrip = '1'");
  await page.command("Page.navigate", { url });
  await page.wait("document.documentElement?.dataset.oldMemoryRoundtrip !== '1' && [...document.querySelectorAll('[data-memory-settings]')].some(node => node.checkVisibility())");
  await page.evaluate(`(() => { [...document.querySelectorAll('[data-memory-settings]')].find(node => node.checkVisibility()).setAttribute('data-memory-roundtrip-test', ''); })()`);
  await ready(page);
}

async function upload(page: ChromePage, file: string) {
  const { root: document } = await page.command<{ root: { nodeId: number } }>("DOM.getDocument");
  const { nodeId } = await page.command<{ nodeId: number }>("DOM.querySelector", { nodeId: document.nodeId, selector: root + " [data-memory-import]" });
  assert.ok(nodeId, "the production file input exists");
  await page.command("DOM.setFileInputFiles", { nodeId, files: [file] });
}

async function journey(t: TestContext) {
  const executable = locateTestChrome(); assert.ok(executable, "Chrome is required for the current-package browser journey");
  const env = await openTestHome(t), project = await env.createProject("当前记忆包的目标项目");
  const client = bindActionClient(env.host.actionClient(project.reference), () => person(MEMORY_PERMISSIONS, project.project_id));
  const expiry = new Date(Date.now() + 3 * 86_400_000).toISOString();
  for (const request of [
    { text: "交付说明先列结论和可核对依据", kind: "preference" as const,
      classification: { scenes: ["assistant", "common"], lifecycle: "long-term" as const }, expires_at: null },
    { text: "本轮周报提交前复核引用的出处", kind: "convention" as const, applies: { task: "提交本轮周报时" },
      classification: { scenes: ["coding"], lifecycle: "short-term" as const }, expires_at: expiry },
  ]) assert.equal((await client.invoke(memoryActions.write, { scope: "personal", ...request })).outcome, "written");
  const sentinel = (await client.invoke(memoryActions.write, { scope: "project", text: "目标项目的原有约定必须保留", kind: "convention" })).memory!;
  const source = await items(client, "personal"), before = await items(client, "project");
  const directory = await mkdtemp(join(tmpdir(), "memory-v0-exchange-browser-path-20261105-"));
  t.diagnostic(`Browser download and screenshots: ${directory}`);
  let browser: ChromeHarness | undefined;
  t.after(async () => { await browser?.close(); });
  browser = await ChromeHarness.start(directory, { executable });
  const page = await browser.page(); await page.viewport(1440, 1000);
  const deliveries: Array<{ body: string; key: string }> = [];
  browser.on("Network.requestWillBeSent", (params, sessionId) => {
    const request = params.request as { url?: string; postData?: string; headers?: Record<string, string> };
    if (sessionId !== page.sessionId || !request.url?.endsWith("/api/memory/import") || !request.postData) return;
    const key = Object.entries(request.headers ?? {}).find(([name]) => name.toLowerCase() === "x-molis-work-idempotency-key")?.[1] ?? "";
    deliveries.push({ body: request.postData, key });
  });
  await page.command("Network.enable");
  await navigate(page, env.origin + "/settings/memory");
  for (const item of source) assert.equal(await page.evaluate(`document.querySelector('${row(item.memory_id)}')?.checkVisibility()`), true);
  const downloads = join(directory, "downloads"); await mkdir(downloads);
  await browser.command("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads, eventsEnabled: true });
  const beginning = browser.event("Browser.downloadWillBegin"), completion = browser.event("Browser.downloadProgress", event => event.state === "completed");
  await page.click(root + " [data-memory-export]");
  const [began, completed] = await Promise.all([beginning, completion]);
  assert.equal(completed.guid, began.guid); assert.match(String(began.url), /^blob:/);
  assert.match(String(began.suggestedFilename), /^molis-memory-personal-\d{4}-\d{2}-\d{2}\.json$/);
  const file = join(downloads, String(began.suggestedFilename));
  const pack = JSON.parse(await readFile(file, "utf8")) as MemoryExportPackage;
  assert.equal(pack.format, "molis.memory"); assert.equal(pack.version, 2); assert.equal(pack.scope, "personal");
  assert.equal(pack.entries.length, source.length);
  for (const item of source) {
    const exported = pack.entries.find(one => one.text === item.text); assert.ok(exported);
    assert.deepEqual(exported.classification, item.classification); assert.equal(exported.kind, item.kind);
    assert.equal(exported.expires_at, item.expires_at); assert.deepEqual(exported.applies, item.applies);
    assert.equal(exported.basis, item.basis); assert.equal(exported.source, item.source); assert.equal(exported.origin, item.origin);
  }
  assert.equal(pack.entries.find(one => one.expires_at !== null)?.expires_at, expiry, "the downloaded package retains the absolute deadline");
  const projectUrl = env.origin + `/projects/${project.project_id}/settings/memory`;
  await navigate(page, projectUrl);
  assert.equal(await page.evaluate(`document.querySelectorAll('${root} [data-memory-id]').length`), 1);
  assert.equal(await page.evaluate(`document.querySelector('${row(sentinel.memory_id)}')?.checkVisibility()`), true);
  return { env, project, client, browser, page, directory, file, pack, source, before, deliveries, projectUrl };
}

async function assertImported(page: ChromePage, imported: MemoryManagementItem[], pack: MemoryExportPackage) {
  assert.equal(imported.length, pack.entries.length);
  for (const entry of pack.entries) {
    const item = imported.find(one => one.text === entry.text); assert.ok(item);
    assert.equal(item.scope, "project"); assert.equal(item.kind, entry.kind); assert.equal(item.source, "imported");
    assert.equal(item.basis, entry.basis, "import keeps the original basis rather than inventing evidence");
    assert.equal(item.approved_by, null, "import does not invent a person or policy approval"); assert.deepEqual(item.evidence, []);
    assert.match(item.origin, /导入/); assert.ok(item.origin.endsWith(entry.origin));
    assert.deepEqual(item.classification, entry.classification); assert.equal(item.expires_at, entry.expires_at);
    assert.deepEqual(item.applies, entry.applies); assert.equal(item.state, "active"); assert.equal(item.version, 1);
    assert.equal(await page.evaluate(`document.querySelector('${row(item.memory_id)}')?.checkVisibility()`), true);
    assert.ok((await page.evaluate<string>(`document.querySelector('${row(item.memory_id)}').innerText`)).includes(entry.text));
    await page.click(row(item.memory_id) + " .memory-origin summary");
    assert.ok((await page.evaluate<string>(`document.querySelector('${row(item.memory_id)} .memory-origin').innerText`)).includes(item.origin));
  }
}

// MEM-PAGE-03: production download -> actual downloaded file -> real HTTP/Host/SDK in another authorized scope.
test("current v2 package downloads from personal settings, imports into project settings and skips a repeat without changing either original", { timeout: 180_000 }, async t => {
  const f = await journey(t);
  await upload(f.page, f.file);
  await f.page.wait("document.querySelector('[data-settings-toast]')?.textContent.includes('导入 2')"); await ready(f.page);
  const first = await items(f.client, "project"), imported = first.filter(one => !f.before.some(old => old.memory_id === one.memory_id));
  await assertImported(f.page, imported, f.pack);
  assert.deepEqual(first.filter(one => f.before.some(old => old.memory_id === one.memory_id)), f.before);
  const changes = await f.client.invoke(memoryActions.changes, { scope: "project", limit: 50 });
  const histories = await Promise.all(imported.map(one => f.client.invoke(memoryActions.history, { memory_id: one.memory_id })));
  await f.page.screenshot(join(f.directory, "current-v2-imported.png"));
  await upload(f.page, f.file);
  await f.page.wait("document.querySelector('[data-settings-toast]')?.textContent.includes('导入 0') && document.querySelector('[data-settings-toast]').textContent.includes('跳过 2')"); await ready(f.page);
  assert.deepEqual(await items(f.client, "project"), first, "a second import does not replace or bump existing entries");
  assert.deepEqual(await items(f.client, "personal"), f.source, "export and import leave the personal originals unchanged");
  assert.deepEqual(await f.client.invoke(memoryActions.changes, { scope: "project", limit: 50 }), changes);
  assert.deepEqual(await Promise.all(imported.map(one => f.client.invoke(memoryActions.history, { memory_id: one.memory_id }))), histories);
  assert.equal(f.deliveries.length, 2);
  const bodies = f.deliveries.map(one => JSON.parse(one.body) as { package: MemoryExportPackage; operation_id: string });
  assert.deepEqual(bodies.map(one => one.package), [f.pack, f.pack]);
  assert.notEqual(bodies[0]!.operation_id, bodies[1]!.operation_id, "selecting the file after success is a new decision");
});

// MEM-PAGE-03: whole-file validation, committed-but-lost reply, original retry and real Home reopening.
test("a damaged v2 package writes nothing and a committed import can retry its original request once without duplicate effects across Home reopen", { timeout: 180_000 }, async t => {
  const f = await journey(t);
  const damaged = join(f.directory, "damaged-current-v2.json");
  await writeFile(damaged, JSON.stringify({ ...f.pack, entries: [...f.pack.entries.map(one => ({ ...one, text: one.text + "（损坏包不得写入）" })), { ...f.pack.entries[0], text: "" }] }));
  const changesBefore = await f.client.invoke(memoryActions.changes, { scope: "project", limit: 50 });
  await upload(f.page, damaged);
  await f.page.wait(`document.querySelector('${root} [data-memory-error]')?.checkVisibility() && document.querySelector('${root} [data-memory-error]').textContent.includes('没有写入任何一条')`);
  assert.deepEqual(await items(f.client, "project"), f.before);
  assert.deepEqual(await items(f.client, "personal"), f.source);
  assert.deepEqual(await f.client.invoke(memoryActions.changes, { scope: "project", limit: 50 }), changesBefore);
  await f.page.screenshot(join(f.directory, "damaged-v2-zero-write.png"));
  // The rejected malformed command is not the subsequent, valid import decision.
  await navigate(f.page, f.projectUrl);
  const original = MemoryService.prototype.importScope, outcomes: MemoryImportResult[] = [], operations: Array<string | undefined> = [];
  let loseReply = true;
  t.mock.method(MemoryService.prototype, "importScope", async function(this: MemoryService, ...args: Parameters<MemoryService["importScope"]>) {
    const result = await original.apply(this, args);
    outcomes.push(structuredClone(result)); operations.push(args[0].operation_id);
    if (loseReply) { loseReply = false; throw new Error("Committed import response unavailable"); }
    return result;
  });
  await upload(f.page, f.file);
  await f.page.wait(`document.querySelector('${root} [data-memory-error]')?.checkVisibility() && document.querySelector('${root} [data-memory-retry]')?.checkVisibility()`);
  assert.equal(await f.page.evaluate(`document.querySelector('${root} [data-memory-import]').files.length`), 0);
  assert.doesNotMatch(await f.page.evaluate<string>("document.querySelector('[data-settings-toast]')?.textContent || ''"), /导入 2|这次操作已完成/);
  assert.deepEqual(outcomes, [{ written: 2, skipped: 0, refused: 0 }], "the fault follows the real complete submission");
  const committed = await items(f.client, "project"), imported = committed.filter(one => !f.before.some(old => old.memory_id === one.memory_id));
  assert.equal(imported.length, 2, "the real Host committed even though the browser received a failure");
  const changes = await f.client.invoke(memoryActions.changes, { scope: "project", limit: 50 });
  const histories = await Promise.all(imported.map(one => f.client.invoke(memoryActions.history, { memory_id: one.memory_id })));
  await f.page.screenshot(join(f.directory, "committed-import-response-failed.png"));
  await f.page.click(root + " [data-memory-retry]");
  await f.page.wait(`!document.querySelector('${root} [data-memory-retry]') && document.querySelector('[data-settings-toast]')?.textContent.includes('导入 2')`); await ready(f.page);
  assert.deepEqual(outcomes, [{ written: 2, skipped: 0, refused: 0 }, { written: 2, skipped: 0, refused: 0 }]);
  assert.equal(f.deliveries.length, 3);
  const [first, retry] = f.deliveries.slice(1); assert.ok(first && retry);
  assert.equal(retry.body, first.body, "the complete serialized request and operation id stay fixed");
  const body = JSON.parse(first.body) as { package: MemoryExportPackage; operation_id: string };
  assert.deepEqual(body.package, f.pack); assert.deepEqual(operations, [body.operation_id, body.operation_id]);
  assert.ok(first.key && retry.key); assert.notEqual(first.key, retry.key, "HTTP one-time keys must be fresh for each delivery");
  assert.deepEqual(await items(f.client, "project"), committed);
  assert.deepEqual(await f.client.invoke(memoryActions.changes, { scope: "project", limit: 50 }), changes);
  assert.deepEqual(await Promise.all(imported.map(one => f.client.invoke(memoryActions.history, { memory_id: one.memory_id }))), histories);
  await assertImported(f.page, imported, f.pack);
  await f.page.screenshot(join(f.directory, "original-import-retry-completed.png"));
  await f.page.command("Page.navigate", { url: "about:blank" }); await f.page.wait("location.href === 'about:blank'");
  await f.env.close(); await f.env.host.close();
  const reopened = new MolisWorkLocalHost({ homeDirectory: f.env.home, completeText: null });
  let served: Awaited<ReturnType<typeof serveTestHost>> | undefined;
  try {
    served = await serveTestHost(null, { home: f.env.home, host: reopened });
    const read = bindActionClient(reopened.actionClient(f.project.reference), () => person(MEMORY_PERMISSIONS, f.project.project_id));
    assert.deepEqual(await items(read, "project"), committed); assert.deepEqual(await items(read, "personal"), f.source);
    assert.deepEqual(await read.invoke(memoryActions.changes, { scope: "project", limit: 50 }), changes);
    assert.deepEqual(await Promise.all(imported.map(one => read.invoke(memoryActions.history, { memory_id: one.memory_id }))), histories);
    await navigate(f.page, served.origin + `/projects/${f.project.project_id}/settings/memory`);
    await assertImported(f.page, imported, f.pack);
    await f.page.screenshot(join(f.directory, "same-home-reopened.png"));
    await f.page.command("Page.navigate", { url: "about:blank" }); await f.page.wait("location.href === 'about:blank'");
  } finally { await served?.close(); await reopened.close(); }
});
