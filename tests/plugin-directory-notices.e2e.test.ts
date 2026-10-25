import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { directoryForHome } from "@molis-ai/molis-work-app-local-host";
import type { AssistantNotice } from "@molis-ai/molis-work-contracts/services/assistant";
import type { PluginDirectoryReadRequest, PluginDirectoryReadResult } from "@molis-ai/molis-work-contracts/platform/plugin-directory";
import { grantHomeProbe, homeProbe, person, serveHomeRuntime } from "./fixtures/home-runtime.js";

test("PG049-N01 PG049-N02 PG049-N03 saved directory outcomes render in the current language as text", { timeout: 120_000 }, async t => {
  const probe = homeProbe("directorynotice");
  const plugin = "Notice <b>{origin}</b> $&", folder = "Vault <img> {plugin} $&";
  probe.permissions.push("directory:read");
  probe.definition.manifest = { ...probe.definition.manifest, name: plugin, permissions: [
    ...probe.definition.manifest.permissions, { permission: "directory:read", required: false, reason: "Read a selected folder" },
  ] };
  let request: PluginDirectoryReadRequest = { grant_id: "missing" }, vault = "";
  probe.behavior.ask = async context => JSON.stringify(await context.services!.directory!.read(request));
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } }, { chooseDirectory: async () => ({ status: "picked", path: vault }) });
  await grantHomeProbe(f.host, probe);
  vault = join(f.home, folder); await mkdir(vault); await writeFile(join(vault, "inside.md"), "private file content");
  const selected = await f.request("/api/host/directory-grants", { method: "POST", body: { plugin_id: probe.id } });
  assert.equal(selected.status, 200);
  const grant = await selected.json();
  const saved = async () => {
    const response = await f.request("/api/assistant/notices");
    assert.equal(response.status, 200);
    return ((await response.json()).notices as AssistantNotice[]).filter(notice => notice.kind === "directory-read");
  };
  const expected = new Map<string, { zh: string; en: string }>();
  const scenarios = [
    { path: ["inside.md"], outcome: "text", zh: `「${plugin}」读取了你授权的本机目录「${folder}」（你在页面上发起）。可在设置「本机目录」查看记录或撤回。`,
      en: `"${plugin}" read your authorized local folder "${folder}" (started by you on the page). View the record or revoke access in Settings > Local folders.` },
    { path: [".."], outcome: "denied", zh: `「${plugin}」尝试读取你授权的本机目录「${folder}」，但被拒绝（你在页面上发起）。可在设置「本机目录」查看记录或撤回。`,
      en: `"${plugin}" tried to read your authorized local folder "${folder}", but access was denied (started by you on the page). View the record or revoke access in Settings > Local folders.` },
    { path: ["absent.md"], outcome: "missing", zh: `「${plugin}」尝试读取你授权的本机目录「${folder}」，但未完成（你在页面上发起）。可在设置「本机目录」查看记录或撤回。`,
      en: `"${plugin}" tried to read your authorized local folder "${folder}", but the read did not complete (started by you on the page). View the record or revoke access in Settings > Local folders.` },
  ];
  for (const scenario of scenarios) {
    request = { grant_id: grant.grant_id, path: scenario.path, kind: "text" };
    const result = JSON.parse(await f.host.homeActionClient().invoke<string>(person(probe.permissions), probe.ask, {})) as PluginDirectoryReadResult;
    assert.equal(result.outcome, scenario.outcome);
    const notices = await saved(), fresh = notices.filter(notice => !expected.has(notice.notice_id));
    assert.equal(fresh.length, 1, "each real call produces exactly one new notice");
    assert.deepEqual(fresh[0]!.text_params, { plugin, folder, origin: "你在页面上发起" });
    expected.set(fresh[0]!.notice_id, scenario);
  }
  const persisted = await saved();
  assert.equal(directoryForHome(f.home).list()[0]!.read_count, 3);
  assert.doesNotMatch(JSON.stringify(persisted), /inside\.md|absent\.md|private file content/, "no file names or contents enter notices");
  const project = await f.project("Saved notices"), path = `/projects/${project.project_id}/`;
  const projectNotices = await (await f.request(path.slice(0, -1) + "/api/assistant/notices")).json();
  assert.deepEqual(projectNotices.notices, persisted, "the actual project API carries the same saved Home notices");
  const directory = await mkdtemp(join(tmpdir(), "pg049-notice-browser-"));
  let browser: Awaited<ReturnType<typeof ChromeHarness.start>> = null;
  try {
    browser = await ChromeHarness.start(directory, { describe: "JSON.stringify({url:location.href,ready:document.readyState,attention:document.querySelector('[data-assistant-attention]')?.outerHTML,pop:document.querySelector('[data-assistant-notices]')?.outerHTML})" });
    if (!browser) { t.skip("Chrome is required for directory notice UI"); return; }
    const page = await browser.page();
    await page.command("Page.enable");
    for (const [index, locale] of (["zh", "en", "en"] as const).entries()) {
      await Promise.all([browser.event("Page.loadEventFired"), index === 2 ? page.command("Page.reload")
        : page.command("Page.navigate", { url: f.origin + "/locale?lang=" + locale + "&next=" + encodeURIComponent(path) })]);
      await page.wait(`document.documentElement?.lang === '${locale === "zh" ? "zh-CN" : "en"}' && document.querySelector('[data-assistant-attention]')`);
      await page.wait("document.querySelector('[data-assistant-attention]')?.hasAttribute('aria-label')");
      // These notices keep their existing non-urgent grouping. Exercise its initialized open handler without changing reachability.
      await page.evaluate("document.querySelector('[data-assistant-attention]').click()");
      await page.wait("document.querySelector('[data-assistant-attention]').getAttribute('aria-expanded') === 'true'");
      await page.wait("document.querySelectorAll('[data-assistant-notices] [data-notice-action=dismiss]').length === 3");
      const rows = await page.evaluate<Array<{ id: string; text: string; open: string; dismiss: string; html: number }>>(`[...document.querySelectorAll('[data-assistant-notices] .assistant-notice')].map(item => ({
        id: item.querySelector('[data-notice-id]').dataset.noticeId,
        text: item.querySelector('.assistant-notice-text').textContent,
        open: item.querySelector('[data-notice-action=open]').getAttribute('aria-label'),
        dismiss: item.querySelector('[data-notice-action=dismiss]').getAttribute('aria-label'),
        html: item.querySelectorAll('b,img').length
      }))`);
      assert.equal(rows.length, 3);
      for (const row of rows) {
        const text = expected.get(row.id)![locale];
        assert.equal(row.text, text);
        assert.equal(row.open, (locale === "en" ? "Open" : "打开") + "：" + text);
        assert.equal(row.dismiss, (locale === "en" ? "Got it" : "知道了") + "：" + text);
        assert.equal(row.html, 0, "plugin and folder names stay literal text");
      }
      assert.deepEqual(await saved(), persisted, "locale changes and page reload keep exactly the same saved notices");
    }
    // PG049-N03: an invalid current-shape payload is explicit; no old Chinese parsing or fallback.
    const bad = { ...persisted[0]!, notice_id: "invalid-current-notice", text_params: undefined };
    const other = { ...persisted[0]!, kind: "reminder", notice_id: "unchanged-notice", text: "Unchanged <b>{plugin}</b> $&", text_params: undefined };
    const invalidRows = await page.evaluate<string[]>(`(() => {
      document.dispatchEvent(new CustomEvent('molis-work:attention', { detail: { notices: ${JSON.stringify([bad, other])} } }));
      return [...document.querySelectorAll('[data-assistant-notices] .assistant-notice-text')].map(node => node.textContent);
    })()`);
    assert.deepEqual(invalidRows.sort(), ["The directory-read notice has incomplete data.", other.text].sort());
    assert.deepEqual(await saved(), persisted, "the malformed UI payload writes no records");
    assert.equal(directoryForHome(f.home).list()[0]!.read_count, 3, "rendering does not perform another read");
  } finally {
    try { await browser?.close(); } finally { await rm(directory, { recursive: true, force: true }); }
  }
});
