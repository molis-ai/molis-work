import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

/**
 * UPG3-04 (specs/upgrade-continuity/owner-isolation-and-rollback-design.md §8): the plugin whose tables an upgrade left behind is the
 * only one stopped, and the Dock says so — its pin carries the dot and reads 「暂不可用」, not 「没有启动」. Its card carries a diagnostic
 * number that stays the same for this round, so the person can quote it and the log can be searched for it. The number's rules and
 * the log line are tested without a browser (`tests/upgrade-owner-isolation.test.ts`); this is what the person sees.
 *
 * The Home is made by this build; then Feed's ledger row in the demo project's library says a newer version than Feed declares, the
 * way a newer build would have left it.
 */
const FEED = "io.molis.work.feed";

test("UPG3-04 the Dock's pin of a plugin an upgrade stopped has the dot and reads 暂不可用; its card's number stays the same", { timeout: 180_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true, undefined, undefined, undefined, undefined, {
    prepareHome: home => {
      const db = new DatabaseSync(join(home, "projects", "molis-work-v1-demo", "molis-work.db"));
      try { db.prepare("UPDATE plugin_project_databases SET version = version + 1 WHERE plugin_id = ?").run(FEED); } finally { db.close(); }
    },
  });
  if (!browser) return;
  const { evaluate, waitFor, navigate, command, sessionId, origin, projectId } = browser;
  const project = `${origin}/projects/${projectId}/`;
  const pin = (id: string) => `document.querySelector('[data-dock-pin="${id}"]')`;
  await navigate(() => command("Page.navigate", { url: project }, sessionId));
  await waitFor(`${pin("feed")} && ${pin("inbox")}`);
  const unavailable = await evaluate<string>(`globalThis.t.text("workbench.navigation-presentation.unavailable-for-now")`);
  const didNotStart = await evaluate<string>(`globalThis.t.text("workbench.navigation-presentation.didn-t-start")`);
  assert.equal(await evaluate(`${pin("feed")}.getAttribute('aria-label')`), `Feed · ${unavailable}`, "read out as unavailable for now");
  assert.notEqual(unavailable, didNotStart);
  assert.equal(await evaluate(`!!${pin("feed")}.querySelector(':scope > .nav-warn-dot')`), true, "and marked");
  assert.equal(await evaluate(`${pin("inbox")}.getAttribute('aria-label')`), "Inbox", "the others are as usual");
  assert.equal(await evaluate(`!!${pin("inbox")}.querySelector(':scope > .nav-warn-dot')`), false);

  const card = `document.querySelector('[data-work-surface="feed"] [data-owner-unavailable]')`;
  const number = `${card}.querySelector('[data-copy-value]').dataset.copyValue`;
  await evaluate(`${pin("feed")}.click()`);
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
