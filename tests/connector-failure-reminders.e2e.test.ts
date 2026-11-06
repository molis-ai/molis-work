import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { raiseConnectionNotice, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

// ASC-58: a connection's notice is one of the things that wait on the person (the attention button shows it), drawn in the UI language,
// and its "打开" opens that service's connection settings through the settings' own listener; a notice whose settings address is not a
// path of this origin under /settings/ offers no way to open it.

test("ASC-58 a connection notice waits on the person, opens its service's connection settings, and offers nothing for a foreign address", { timeout: 120_000 }, async t => {
  const f = await serveHomeRuntime(t);
  const connection = withConnectorConnections(f.home, store => store.createToken({ serviceId: "github", displayName: "Work GitHub", token: "fixture-reminder-page-token" }));
  assert.equal(raiseConnectionNotice(f.home, { connection_id: connection.connection_id, revision: connection.updated_at, failure_class: "reauth",
    failing_since: new Date().toISOString(), name: "Work GitHub", settings_path: "/settings/connectors?connector=github" }), true);
  const project = await f.project("Connection notices"), path = `/projects/${project.project_id}/`;
  const directory = await mkdtemp(join(tmpdir(), "asc58-browser-"));
  let browser: Awaited<ReturnType<typeof ChromeHarness.start>> = null;
  try {
    browser = await ChromeHarness.start(directory, { describe: "JSON.stringify({url:location.href,attention:document.querySelector('[data-assistant-attention]')?.outerHTML,pop:document.querySelector('[data-assistant-notices]')?.outerHTML})" });
    if (!browser) { t.skip("Chrome is required for the connection notice UI"); return; }
    const page = await browser.page();
    await page.command("Page.enable");
    const shots = join(REVIEW_EVIDENCE, "asc58-connection-notice"); await mkdir(shots, { recursive: true });
    const texts = { zh: "服务连接「Work GitHub」的登录已失效，需要重新登录。", en: 'The sign-in for the service connection "Work GitHub" has expired. Sign in again.' };
    for (const locale of ["en", "zh"] as const) {
      await Promise.all([browser.event("Page.loadEventFired"), page.command("Page.navigate", { url: f.origin + "/locale?lang=" + locale + "&next=" + encodeURIComponent(path) })]);
      await page.wait(`document.documentElement?.lang === '${locale === "zh" ? "zh-CN" : "en"}'`);
      // Urgent: the attention button appears for it alone.
      await page.wait("(b => b && !b.hidden)(document.querySelector('[data-assistant-attention]'))");
      await page.evaluate("document.querySelector('[data-assistant-attention]').click()");
      await page.wait("document.querySelectorAll('[data-assistant-notices] .assistant-notice').length === 1");
      const row = await page.evaluate<{ text: string; open: boolean }>(`(item => ({ text: item.querySelector('.assistant-notice-text').textContent,
        open: !item.querySelector('[data-notice-action=open]').hidden }))(document.querySelector('[data-assistant-notices] .assistant-notice'))`);
      assert.deepEqual(row, { text: texts[locale], open: true });
      // Review shots: both widths, both color schemes (into the ignored QA folder unless MOLIS_WORK_REVIEW_EVIDENCE=1).
      for (const [width, height] of [[1024, 768], [390, 844]] as const) for (const scheme of ["light", "dark"] as const) {
        await page.viewport(width, height, width < 768);
        await page.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: scheme }] });
        await page.evaluate("(p => { if (p.hidden) document.querySelector('[data-assistant-attention]').click(); })(document.querySelector('[data-assistant-notices]'))");
        await page.wait("!document.querySelector('[data-assistant-notices]').hidden");
        await page.screenshot(join(shots, `${locale}-${width}-${scheme}.png`));
      }
    }
    // The page's own check: an address that is not a path of this origin under /settings/ gets no "打开".
    const shown = await page.evaluate<Array<[string, boolean]>>(`(() => {
      const base = { notice_id: "", kind: "connection", work_id: "", work_title: "Work GitHub", text: "服务连接「{name}」的登录已失效，需要重新登录。", created_at: new Date().toISOString() };
      const paths = ["https://evil.example/settings/connectors", "//evil.example/settings/connectors", "/projects/p1/", "javascript:alert(1)", 42, "/settings/connectors?connector=github"];
      document.dispatchEvent(new CustomEvent('molis-work:attention', { detail: { notices: paths.map((settings_path, index) => ({ ...base, notice_id: "n" + index, settings_path })) } }));
      return [...document.querySelectorAll('[data-assistant-notices] [data-notice-action=open]')].map(button => [button.dataset.noticeId, !button.hidden]);
    })()`);
    assert.deepEqual(shown, [["n0", false], ["n1", false], ["n2", false], ["n3", false], ["n4", false], ["n5", true]]);
    // "打开" on the real one opens the connection settings of its service, in place.
    await page.evaluate("document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'))");
    await page.wait("document.querySelectorAll('[data-assistant-notices] .assistant-notice').length === 1 && !document.querySelector('[data-notice-id=n5]')");
    await page.evaluate("document.querySelector('[data-assistant-notices] [data-notice-action=open]').click()");
    await page.wait("(d => d && !d.hidden && d.offsetParent !== null)(document.querySelector('[data-connectors-settings] [data-connector-detail=\"github\"]'))", { timeoutMs: 20_000 });
    assert.equal(await page.evaluate<string>("location.pathname"), path, "opened in place, not by navigating the page");
  } finally {
    try { await browser?.close(); } finally { await rm(directory, { recursive: true, force: true }); }
  }
});
