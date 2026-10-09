import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// Every address a person can open lands in the workbench (specs/artifact-positioning): a plugin's own address opens its
// surface there, and an address the project does not have opens the workbench with a notice, never a bare error body.
test("direct addresses open the workbench: 成果 surface, unknown page notice, API errors stay JSON", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null); if (!browser) return;
  const { origin, projectId, command, sessionId, navigate, evaluate, waitFor } = browser;
  const prefix = `/projects/${projectId}`;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);

  await navigate(() => command("Page.navigate", { url: origin + prefix + "/artifacts" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'artifacts'", 15_000);
  assert.equal(await evaluate("Boolean(document.querySelector('[data-tab-workspace], [data-plugin-strip], .workbench-bar'))"), true, "the workbench shell is there");
  assert.equal(await evaluate("Boolean(document.querySelector('.artifact-shell, body.artifact-page'))"), false);

  await navigate(() => command("Page.navigate", { url: origin + prefix + "/no-such-page" }, sessionId));
  await waitFor("Boolean(document.querySelector('.workbench-bar')) && (document.querySelector('[data-toast]')?.textContent ?? '').includes('找不到这个页面')", 15_000);
  assert.equal(await evaluate("new URL(location.href).searchParams.has('missing')"), false, "the notice is shown once, not kept in the address");

  const api = await fetch(origin + prefix + "/api/no-such-endpoint", { headers: { accept: "text/html" } });
  assert.equal(api.status, 404);
  assert.match(api.headers.get("content-type") ?? "", /application\/json/);
  await api.text();
});

// Molis Work's own pages never open a second browser tab (specs/artifact-positioning §4, S7): a new-tab link to one, or
// window.open of one, opens it here, in this workbench.
test("a new-tab link or window.open to Molis Work's own page opens it in this workbench", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null); if (!browser) return;
  const { origin, projectId, command, sessionId, navigate, evaluate, waitFor, click } = browser;
  const prefix = `/projects/${projectId}`;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/" }, sessionId));
  await waitFor("!!document.querySelector('[data-side-panel]')", 15_000);
  await evaluate(`(() => { const link = document.createElement('a'); link.id = 'probe-own-page'; link.href = '/settings/models'; link.target = '_blank'; link.textContent = '模型设置';
    document.querySelector('[data-workspace]').append(link); })()`);
  await click("#probe-own-page");
  await waitFor("document.querySelector('[data-tab-workspace]')?.dataset.exclusive === 'settings' && !!document.querySelector('[data-work-surface=settings] [data-settings-panel=models]')", 15_000);
  assert.equal(await evaluate("location.pathname"), prefix + "/");
  assert.equal(await evaluate("window.open('/capabilities/library')"), null, "no second window");
  await waitFor("!!document.querySelector('[data-work-surface=settings] [data-settings-panel=library]')", 15_000);
  assert.equal(await evaluate("location.pathname"), prefix + "/");
});
