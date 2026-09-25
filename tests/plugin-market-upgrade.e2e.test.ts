import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("plugin market sends a manual upgrade after a real browser click", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = browser;
  assert.ok(projectId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=market]')");

  await command("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const nativeFetch = window.fetch.bind(window);
    const requests = window.__pluginUpgradeRequests = [];
    let attempts = 0;
    const projectId = ${JSON.stringify(projectId)};
    const candidate = {
      plugin_id: "io.molis.work.coding",
      install_id: "browser-fixture-install",
      installed_version: "1.0.0",
      target_version: "2.0.0",
      mode: "compatible",
      can_upgrade: true,
      project_plugin_id: "coding"
    };
    window.fetch = async (input, init) => {
      const rawUrl = typeof input === "string" ? input : input.url;
      const pathname = new URL(rawUrl, location.href).pathname;
      if (pathname.endsWith("/api/settings/project-plugins")) {
        return new Response(JSON.stringify({ projects: [{ project_id: projectId, display_name: "浏览器验收项目", plugins: ["coding"] }] }), { headers: { "content-type": "application/json" } });
      }
      if (pathname.endsWith("/api/plugins/runtime/updates")) {
        return new Response(JSON.stringify({ updates: [candidate] }), { headers: { "content-type": "application/json" } });
      }
      if (pathname.endsWith("/api/plugins/io.molis.work.coding/upgrade") && init?.method === "POST") {
        attempts += 1;
        requests.push({ pathname, method: init.method, headers: Object.keys(init.headers || {}) });
        return attempts === 1
          ? new Response(JSON.stringify({ error: "旧私有数据校验失败：格式不支持" }), { status: 409, headers: { "content-type": "application/json" } })
          : new Response(JSON.stringify({ version: "2.0.0" }), { headers: { "content-type": "application/json" } });
      }
      return nativeFetch(input, init);
    };
  })();` }, sessionId);
  await command("Page.reload", {}, sessionId);
  await waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=market]')");
  await waitFor("!document.querySelector('[data-plugin-strip] [data-plugin-id=market] [data-market-update-count]').hidden");
  assert.equal(await evaluate<string>("document.querySelector('[data-plugin-strip] [data-market-update-count]').textContent"), "1", "update reminder appears before opening the market");

  await click('[data-plugin-strip] [data-plugin-id="market"]');
  await waitFor("document.querySelector('[data-work-surface=market]') && !document.querySelector('[data-work-surface=market]').hidden");
  await waitFor("document.querySelector('[data-market-plugin=coding] [data-market-upgrade]')?.dataset.marketUpgrade === 'io.molis.work.coding'");
  assert.equal(await evaluate<string>("document.querySelector('[data-plugin-strip] [data-market-update-count]').textContent"), "1");
  assert.equal(await evaluate<string>("document.querySelector('[data-market-plugin=coding] [data-market-version]').textContent"), "已安装 v1.0.0 · 可升级至 v2.0.0");
  assert.equal(await evaluate<string>("document.querySelector('[data-market-plugin=coding] [data-market-upgrade]').textContent"), "升级");
  assert.equal(await evaluate<boolean>("document.querySelector('[data-market-plugin=coding] [data-market-upgrade]').disabled"), false);

  assert.equal(await evaluate<string>("document.querySelector('[data-market-plugin=coding] [data-market-add]').textContent"), "移除", "removal remains available alongside an upgrade");
  await click('[data-market-plugin="coding"] [data-market-upgrade]');
  await waitFor("document.querySelector('[data-market-status]')?.textContent === '旧私有数据校验失败：格式不支持'");
  assert.equal(await evaluate<string>("document.querySelector('[data-market-plugin=coding] [data-market-upgrade]').textContent"), "升级", "failed validation keeps the candidate available");
  assert.equal(await evaluate<boolean>("document.querySelector('[data-market-plugin=coding] [data-market-upgrade]').disabled"), false, "failed validation can be retried");
  assert.equal(await evaluate<string>("document.querySelector('[data-plugin-strip] [data-market-update-count]').textContent"), "1");

  await click('[data-market-plugin="coding"] [data-market-upgrade]');
  await waitFor("document.querySelector('[data-market-status]')?.textContent === '已升级至 v2.0.0'");
  await waitFor("document.querySelector('[data-market-plugin=coding] [data-market-add]')?.textContent === '移除' && document.querySelector('[data-plugin-strip] [data-market-update-count]').hidden");
  assert.equal(await evaluate<boolean>("document.querySelector('[data-market-plugin=coding] [data-market-version]').hidden"), true);
  assert.equal(await evaluate<string>("document.querySelector('[data-plugin-strip] [data-plugin-id=market]').getAttribute('aria-label')"), "插件市场");
  assert.deepEqual(await evaluate("window.__pluginUpgradeRequests"), [1, 2].map(() => ({
    pathname: `/projects/${projectId}/api/plugins/io.molis.work.coding/upgrade`,
    method: "POST",
    headers: ["content-type", "x-molis-work-control-token", "x-molis-work-idempotency-key"],
  })));
});
