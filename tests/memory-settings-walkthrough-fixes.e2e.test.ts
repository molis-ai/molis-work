import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ChromeHarness, locateTestChrome, type ChromePage } from "@molis-ai/molis-work-test-kit/browser";
import { bindActionClient, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import { person } from "./fixtures/home-runtime.js";
import { openTestHome } from "./fixtures/test-home.js";

// What the BL-1076 walkthrough found on the memory settings page (2026-11-12), checked in a real browser on a real Host.
const root = "[data-memory-walkthrough-test]";
const row = (id: string) => `${root} [data-memory-id="${id}"]`;
const ready = (page: ChromePage) => page.wait(`document.querySelector('${root} [data-memory-list]')?.getAttribute('aria-busy') === 'false'`);
const texts = async (client: BoundActionClient, scope: "personal" | "project") => (await client.invoke(memoryActions.page, { scope })).items.map(item => item.text);

async function open(page: ChromePage, url: string) {
  await page.evaluate("document.documentElement.dataset.oldWalkthrough = '1'");
  await page.command("Page.navigate", { url });
  await page.wait("document.documentElement?.dataset.oldWalkthrough !== '1' && [...document.querySelectorAll('[data-memory-settings]')].some(node => node.checkVisibility())");
  await page.evaluate("[...document.querySelectorAll('[data-memory-settings]')].find(node => node.checkVisibility()).setAttribute('data-memory-walkthrough-test', '')");
  await ready(page);
}

test("BL-1076 「明确要求时记住」 says it is not in effect while 允许记住 is off", { timeout: 60_000 }, async t => {
  const executable = locateTestChrome(); assert.ok(executable, "Chrome is required for the memory settings page");
  const env = await openTestHome(t), project = await env.createProject("开关说明");
  const client = bindActionClient(env.host.actionClient(project.reference), () => person(MEMORY_PERMISSIONS, project.project_id));
  const directory = await mkdtemp(join(tmpdir(), "memory-walkthrough-switch-")), browser = await ChromeHarness.start(directory, { executable });
  try {
    const page = await browser.page(); await page.viewport(1440, 1000);
    const ask = (part: string) => page.evaluate<string>(`document.querySelector('${root} [data-memory-pref-ask]${part}')${part ? ".textContent" : ".getAttribute('aria-disabled')"}`);
    await open(page, env.origin + "/settings/memory");
    assert.equal(await ask(" [data-memory-pref-ask-value]"), "总是");
    assert.equal(await ask(""), "false");
    await client.invoke(memoryActions.savePrefs, { scope: "personal", prefs: { form: false } });
    await open(page, env.origin + "/settings/memory");
    assert.equal(await ask(" [data-memory-pref-ask-value]"), "不生效");
    assert.equal(await ask(""), "true");
    assert.match(await ask(" [data-memory-pref-ask-copy]"), /说“记住……”也不会记下/);
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});

test("BL-1076 a personal memory moves into a project picked on the personal page, and changes made elsewhere show without reload", { timeout: 90_000 }, async t => {
  const executable = locateTestChrome(); assert.ok(executable, "Chrome is required for the memory settings page");
  const env = await openTestHome(t), project = await env.createProject("设计工作室服务");
  const client = bindActionClient(env.host.actionClient(project.reference), () => person(MEMORY_PERMISSIONS, project.project_id));
  const moving = (await client.invoke(memoryActions.write, { scope: "personal", text: "这个项目的页面文案用简体中文", kind: "convention" })).memory!;
  const directory = await mkdtemp(join(tmpdir(), "memory-walkthrough-move-")), browser = await ChromeHarness.start(directory, { executable });
  try {
    const page = await browser.page(); await page.viewport(1440, 1000);
    // 最近变动 lists what happened without the person's own hand: here the memory was kept in a work. The Host's records say so
    // through the change's `work`, which this page's answer gains on the way in; whether a change is `moved_to` stays the Host's own.
    await page.command("Page.enable"); await page.command("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
      const original = window.fetch;
      window.fetch = async (...args) => {
        const response = await original(...args), url = String(args[0] && args[0].url || args[0]);
        if (!/\\/api\\/memory\\/(?:overview|page)\\?/.test(url) || !response.ok) return response;
        const body = await response.clone().json();
        for (const change of body.changes || []) if (change.memory_id === ${JSON.stringify(moving.memory_id)}) change.work = { work_id: "work-walkthrough", title: "整理周报" };
        return new Response(JSON.stringify(body), { status: response.status, headers: response.headers });
      };
    })()` });
    await open(page, env.origin + "/settings/memory");
    const changesText = () => page.evaluate<string>(`document.querySelector('${root} [data-memory-changes]')?.textContent ?? ''`);
    assert.match(await changesText(), /这个项目的页面文案用简体中文/, "the change from the work is listed with its text before the move");
    await page.click(row(moving.memory_id) + " summary[aria-label^=更多操作]");
    await page.evaluate(`[...document.querySelectorAll('${row(moving.memory_id)} .memory-menu button')].find(button => button.textContent === '改为项目记忆').dataset.walkthroughMove = ''`);
    await page.click("[data-walkthrough-move]");
    await page.wait("document.querySelector('dialog.memory-project-picker[open]')");
    assert.equal(await page.evaluate<string>("document.querySelector('dialog.memory-project-picker h2').textContent"), "改为哪个项目的记忆？");
    await page.evaluate("[...document.querySelectorAll('dialog.memory-project-picker .memory-project-choices button')].find(button => button.textContent === '设计工作室服务').dataset.walkthroughPick = ''");
    await page.click("[data-walkthrough-pick]");
    await page.wait(`!document.querySelector('dialog.memory-project-picker') && !document.querySelector('${row(moving.memory_id)}')`);
    await ready(page);
    assert.equal((await texts(client, "personal")).includes(moving.text), false, "it left personal memory");
    assert.equal((await texts(client, "project")).includes(moving.text), true, "it is the chosen project's memory now");
    // The page it left keeps the work's change, now without the text and saying where the memory went; it never calls it deleted.
    await page.wait(`(document.querySelector('${root} [data-memory-changes]')?.textContent ?? '').includes('已移到项目记忆')`);
    assert.equal((await changesText()).includes("这个项目的页面文案用简体中文"), false, "the moved memory's text is not kept on the page it left");
    assert.equal((await changesText()).includes("这条后来被删除了"), false);

    // Something else (the Assistant) keeps a memory while the page is open: the page shows it without pressing reload.
    const later = (await client.invoke(memoryActions.write, { scope: "personal", text: "周报用要点列表，每条一句", kind: "preference" })).memory!;
    assert.equal(await page.evaluate(`Boolean(document.querySelector('${row(later.memory_id)}'))`), false);
    await page.evaluate("document.dispatchEvent(new CustomEvent('molis-work:memory-changed', { detail: { work_id: 'work-elsewhere' } }))");
    await page.wait(`Boolean(document.querySelector('${row(later.memory_id)}'))`);
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});
