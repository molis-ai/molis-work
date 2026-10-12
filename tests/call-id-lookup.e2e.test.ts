import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// W3-01 F in the workbench: 设置 › 诊断 opens in the workbench's settings (a settings address opened directly lands there), so the page's own
// inline script never runs; the lookup is a GET form the settings directory loads in place, and the id is copied by the handler the workbench
// already has. This checks both in a real browser, with the real clipboard.
const FIRST = "a1b2c3d4-0001-4000-8000-000000000001", SECOND = "b2c3d4e5-0002-4000-8000-000000000002";

test("a diagnostic id is looked up in the workbench's settings, in place, and copied whole", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null); if (!browser) return;
  const { origin, projectId, localHost, command, sessionId, evaluate, navigate, waitFor, click } = browser;
  assert.ok(localHost?.callLog, "the Host keeps a call log");
  const refuse = (id: string, title: string) => localHost.callLog!.record({ actor_id: "web-user", project_id: projectId, audience: "user", permissions: [], call_id: id } as never,
    { capability_id: "test.fixture." + title, version: 1, provider_id: "system.fixture", operation: "command", title, provider_title: "测试服务" } as never,
    { ok: false, code: "test.disconnected", message: "x", refused: true } as never);
  refuse(FIRST, "保存设置");
  refuse(SECOND, "导出报告");
  const prefix = `/projects/${projectId}`;
  await command("Browser.grantPermissions", { origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}${prefix}/?settingsPath=${encodeURIComponent("/settings/diagnostics?call=a1b2c3d4")}` }, sessionId));
  const panel = "[data-work-surface=settings] [data-settings-panel=diagnostics]";
  await waitFor(`!!document.querySelector(${JSON.stringify(panel + " [data-molis-call-id]")})`, 20_000);
  assert.equal(await evaluate("location.pathname"), prefix + "/", "no page of its own");
  assert.deepEqual(await evaluate(`[...document.querySelectorAll(${JSON.stringify(panel + " [data-molis-call-id]")})].map(button => button.dataset.molisCallId)`), [FIRST]);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(panel + " [data-molis-call-id]")}).textContent.trim()`), "诊断编号 a1b2c3d4");

  // The id is copied whole, not the short form on the button.
  await click(panel + " [data-molis-call-id]");
  await waitFor("document.querySelector('[data-toast]')?.textContent.includes('已复制')", 10_000);
  assert.equal(await evaluate("navigator.clipboard.readText()"), FIRST);

  // The lookup is a GET form of the page: it loads the other id in place.
  await evaluate(`(() => { const form = document.querySelector(${JSON.stringify(panel + " form[data-call-lookup]")}); form.elements.call.value = "b2c3d4"; form.requestSubmit(); })()`);
  await waitFor(`JSON.stringify([...document.querySelectorAll(${JSON.stringify(panel + " [data-molis-call-id]")})].map(button => button.dataset.molisCallId)) === ${JSON.stringify(JSON.stringify([SECOND]))}`, 15_000);
  assert.equal(await evaluate("location.pathname"), prefix + "/", "the lookup does not leave the workbench");
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(panel + " form[data-call-lookup]")}).elements.call.value`), "b2c3d4");
});
