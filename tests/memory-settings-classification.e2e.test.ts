import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ChromeHarness, locateTestChrome, type ChromePage } from "@molis-ai/molis-work-test-kit/browser";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, memoryActions, type MemoryWriteResult, type MemoryPageResponse } from "@molis-ai/molis-work-contracts/services/memory";
import { person } from "./fixtures/home-runtime.js";
import { openTestHome } from "./fixtures/test-home.js";

const root = "[data-memory-b1-active]";
const row = (id: string) => `${root} [data-memory-id="${id}"]`;
const ready = (page: ChromePage) => page.wait(`document.querySelector('${root} [data-memory-list]')?.getAttribute('aria-busy') === 'false' && document.querySelector('${root} [data-memory-error]').hidden`);
const ids = (page: ChromePage) => page.evaluate<string[]>(`[...document.querySelectorAll('${root} [data-memory-id]')].map(item => item.dataset.memoryId)`);
async function select(page: ChromePage, selector: string, value: string) {
  await page.wait(`document.querySelector(${JSON.stringify(selector)})?.closest('.mw-select-picker')`);
  await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).closest('.mw-select-picker').setAttribute('data-b1-picker', '')`);
  await page.click("[data-b1-picker] .mw-select-picker__trigger");
  await page.click(`.mw-select-picker__menu:popover-open [data-value="${value}"]`);
  await page.evaluate("document.querySelector('[data-b1-picker]')?.removeAttribute('data-b1-picker')");
}

// MEM-04/08/17/28: final renderer, real HTTP Action, SDK and SQLite, with representative nonempty data.
test("real Memory settings pages filter and paginate, then preserve a conditional reclassification after a new page visit", { timeout: 90_000 }, async t => {
  const executable = locateTestChrome(); assert.ok(executable, "Chrome is required for the real classification journey");
  let browser: ChromeHarness | undefined, directory: string | undefined;
  t.after(async () => { await browser?.close(); if (directory) await rm(directory, { recursive: true, force: true }); });
  const env = await openTestHome(t), client = bindActionClient(env.host.homeActionClient(), () => person(MEMORY_PERMISSIONS));
  const saved: string[] = [];
  for (let index = 0; index < 43; index++) {
    const result = await client.invoke(memoryActions.write, { scope: "personal", kind: "convention", text: `归档记录编号 ${index} 保留原始出处与更新时间` }) as MemoryWriteResult;
    assert.ok(result.memory); saved.push(result.memory.memory_id);
  }
  directory = await mkdtemp(join(tmpdir(), "memory-b1-browser-"));
  browser = await ChromeHarness.start(directory, { executable }); const page = await browser.page(); await page.viewport(1440, 1000);
  const navigate = async () => {
    await page.command("Page.navigate", { url: env.origin + "/settings/memory" });
    await page.wait(`document.readyState === 'complete' && [...document.querySelectorAll('[data-memory-settings]')].some(node => node.checkVisibility())`);
    await page.evaluate(`(() => { document.querySelectorAll('${root}').forEach(node => node.removeAttribute('data-memory-b1-active')); [...document.querySelectorAll('[data-memory-settings]')].find(node => node.checkVisibility()).setAttribute('data-memory-b1-active', ''); })()`);
    await ready(page);
  };
  await navigate();
  const first = await ids(page); assert.equal(first.length, 40);
  assert.match(await page.evaluate<string>(`document.querySelector('${root} [data-memory-summary]').textContent`), /总数未知/);
  await page.click(root + " [data-memory-next]"); await ready(page); const last = await ids(page); assert.equal(last.length, 3);
  assert.deepEqual([...first, ...last].sort(), saved.sort());
  await page.click(root + " [data-memory-previous]"); await ready(page); assert.deepEqual(await ids(page), first);
  const id = first[0]!;
  await page.click(row(id) + " button[aria-label^=修改]");
  await page.click(row(id) + " .memory-origin summary");
  await select(page, row(id) + " select[aria-label=类别]", "habit");
  await page.click(row(id) + ' [data-memory-scene][value="assistant"]');
  await page.click(row(id) + " button[type=submit]");
  await page.wait("document.querySelector('[data-memory-confirm-yes]')"); await page.click("[data-memory-confirm-yes]");
  await page.wait(`!document.querySelector('${row(id)} textarea')`); await ready(page);
  await select(page, root + ' [data-memory-filter="scene"]', "assistant"); await ready(page);
  assert.deepEqual(await ids(page), [id]);
  assert.match(await page.evaluate<string>(`document.querySelector('${row(id)}').textContent`), /习惯/);
  await navigate();
  const response = await fetch(env.origin + "/api/memory/page?input=" + encodeURIComponent(JSON.stringify({ scope: "personal", filter: { scenes: ["assistant"], kinds: ["habit"] } })), { headers: { origin: env.origin, "x-molis-work-control-token": env.controlToken } });
  const stored = await response.json() as MemoryPageResponse;
  assert.equal(response.status, 200, JSON.stringify(stored)); assert.deepEqual(stored.items.map(item => item.memory_id), [id]);
  assert.deepEqual(stored.items[0]!.classification, { scenes: ["assistant", "common"], lifecycle: "long-term" });
  assert.equal(stored.items[0]!.expires_at, null); assert.equal(stored.items[0]!.version, 2);
});
