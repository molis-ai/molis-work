import assert from "node:assert/strict";
import { readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { jellyActions, JELLY_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-jelly";
import { openJellyStore } from "./fixtures/plugin-home-stores.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

/**
 * UPG3-04 (specs/upgrade-continuity/owner-isolation-and-rollback-design.md §8): the plugin whose tables an upgrade left behind is the
 * only one stopped, and the start page says so — its entry carries the dot and reads 「暂不可用」, not 「没有启动」 (the top strip keeps
 * no plugins of its own since specs/screen-polish §3 方案 C). Its card carries a diagnostic
 * number that stays the same for this round, so the person can quote it and the log can be searched for it. The number's rules and
 * the log line are tested without a browser (`tests/upgrade-owner-isolation.test.ts`); this is what the person sees.
 *
 * The Home is made by this build; then Feed's ledger row in the demo project's library says a newer version than Feed declares, the
 * way a newer build would have left it.
 */
const FEED = "io.molis.work.feed";

test("UPG3-04 the start page's entry of a plugin an upgrade stopped has the dot and reads 暂不可用; its card's number stays the same", { timeout: 180_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true, undefined, undefined, undefined, undefined, {
    prepareHome: home => {
      const db = new DatabaseSync(join(home, "projects", "molis-work-v1-demo", "molis-work.db"));
      try { db.prepare("UPDATE plugin_project_databases SET version = version + 1 WHERE plugin_id = ?").run(FEED); } finally { db.close(); }
    },
  });
  if (!browser) return;
  const { evaluate, waitFor, navigate, command, sessionId, origin, projectId } = browser;
  const project = `${origin}/projects/${projectId}/`;
  // The top strip keeps no plugins of its own (specs/screen-polish §3 方案 C): the start page (＋) names every plugin.
  const entry = (id: string) => `document.querySelector('[data-plugin-picker-popover] .plugin-rail-items [data-plugin-id="${id}"]')`;
  await navigate(() => command("Page.navigate", { url: project }, sessionId));
  await waitFor(`${entry("feed")} && ${entry("inbox")} && document.querySelector('.workbench-header[data-dock-drawn]')`);
  const unavailable = await evaluate<string>(`globalThis.t.text("workbench.navigation-presentation.unavailable-for-now")`);
  const didNotStart = await evaluate<string>(`globalThis.t.text("workbench.navigation-presentation.didn-t-start")`);
  assert.equal(await evaluate(`${entry("feed")}.querySelector(':scope > .nav-warn-dot')?.getAttribute('aria-label')`), unavailable, "marked and read out as unavailable for now");
  assert.notEqual(unavailable, didNotStart);
  assert.equal(await evaluate(`!!${entry("inbox")}.querySelector(':scope > .nav-warn-dot')`), false, "the others are as usual");

  const card = `document.querySelector('[data-work-surface="feed"] [data-owner-unavailable]')`;
  const number = `${card}.querySelector('[data-copy-value]').dataset.copyValue`;
  await evaluate(`${entry("feed")}.click()`);
  await waitFor(`${card} && !${card}.closest('[hidden]')`);
  assert.equal(await evaluate(`${card}.dataset.ownerUnavailable`), "store_too_new", "the newer version is named as such");
  assert.equal(await evaluate(`${card}.getAttribute('role')`), "alert");
  const first = await evaluate<string>(number);
  assert.match(first, /^D-[0-9A-F]{8}$/u);
  assert.equal(await evaluate(`!!${card}.querySelector('[data-owner-unavailable-rollback]')`), false, "a newer version is not undone by going back");

  await navigate(() => command("Page.navigate", { url: project }, sessionId));
  await waitFor(`${card}`);
  assert.equal(await evaluate(number), first, "the same number on the next look, in the same round");
});

test("B112-06 Clean v1 names a structure mismatch and can restart after the person moves the old file", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null, undefined, undefined, { prepareHome(home) {
    openJellyStore(home).close();
    const db = new DatabaseSync(join(home, "jelly", "jelly.db"));
    try { db.exec("ALTER TABLE jelly_notes RENAME TO old_notes"); } finally { db.close(); }
  } });
  if (!browser) return;
  assert.ok(browser.localHost);
  const file = join(browser.homeDirectory, "jelly", "jelly.db");
  const original = readFileSync(file);
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?openPlugin=jelly` }, browser.sessionId));
  const recovery = '[data-home-plugin-unavailable] button[data-project-plugin-restart="restart"]';
  await browser.waitFor(`document.querySelector('${recovery}')?.checkVisibility()`);
  assert.match(await browser.evaluate<string>("document.querySelector('[data-owner-unavailable]').textContent"), /数据结构.*备份/u);
  assert.deepEqual(readFileSync(file), original);
  renameSync(file, file + ".backup");
  await browser.navigate(() => browser.click(recovery));
  const frame = await pluginFrameBrowser(t, browser, "jelly");
  await frame.waitFor("document.querySelector('[data-jelly-day][data-selected]')");
  const client = bindActionClient(browser.localHost.homeActionClient(), () => ({ actor_id: "owner", project_id: null, audience: "user", permissions: JELLY_ACTION_PERMISSIONS }));
  const result = await client.invoke(jellyActions.notes, {});
  assert.deepEqual(result.notes, []);
  assert.deepEqual(readFileSync(file + ".backup"), original);
});
