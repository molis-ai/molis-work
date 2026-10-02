import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// A link that names only a plugin (`?openPlugin=`) opens that plugin's page — if this project has it on. A plugin the
// project does not offer is not opened half-way (its page would load and then refuse every action); the link is dropped.
test("a plugin link opens the plugin the project offers and drops one it does not", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  const visit = (plugin: string) => navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=${plugin}` }, sessionId));
  const offered = "[...new Set([...document.querySelectorAll('[data-global-menu] [data-plugin-id], [data-plugin-strip] [data-plugin-id]')].map(node => node.dataset.pluginId))]";

  await visit("todo");
  await waitFor("document.body.dataset.desktopSurface === 'todo' && !new URL(location.href).searchParams.has('openPlugin')");
  assert.ok((await evaluate<string[]>(offered)).includes("todo"));
  // The person takes Feed out of this project in the plugin market.
  const removed = await evaluate<number>(`fetch('/api/settings/projects/' + encodeURIComponent(${JSON.stringify(projectId)}) + '/plugins', { method: 'DELETE',
    headers: typeof molisWorkControlHeaders === 'function' ? molisWorkControlHeaders() : { 'content-type': 'application/json' }, body: JSON.stringify({ plugin_id: 'feed' }) }).then(response => response.status)`);
  assert.equal(removed, 200);
  const off = "feed";

  await visit(off);
  assert.equal((await evaluate<string[]>(offered)).includes(off), false, "the project no longer offers Feed");
  await waitFor("!new URL(location.href).searchParams.has('openPlugin')");
  // Nothing opens late either: the page stays where a project arrives.
  await evaluate("new Promise(resolve => setTimeout(resolve, 500))");
  assert.notEqual(await evaluate("document.body.dataset.desktopSurface"), off);
});
