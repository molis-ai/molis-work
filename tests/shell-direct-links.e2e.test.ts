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
