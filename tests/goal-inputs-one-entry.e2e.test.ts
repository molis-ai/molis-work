import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoGoals } from "@molis-ai/molis-work-app-local-host";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { GoalProjectApplication } from "./fixtures/goal-application.js";

// A Goal's inputs have one entry (artifact-positioning 五.1, 「合成一种入口」): 「加输入…」 lists what the project holds, and
// the person chooses whether the Goal follows the original or fixes this version.
test("「加输入…」 on a Goal takes a document either following the original or as a version fixed now, into one list", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  const pages = openPagesStore(homeDirectory);
  const [fixed, followed] = (() => {
    try { return [pages.create({ project_id: projectId!, title: "访谈纪要", body: { type: "doc", content: [] } }), pages.create({ project_id: projectId!, title: "竞品清单", body: { type: "doc", content: [] } })]; }
    finally { pages.close(); }
  })();
  const goal = `/projects/${projectId}/?openPlugin=goals&openItem=V1&openGoalView=work`;
  const open = async () => {
    await navigate(() => command("Page.navigate", { url: origin + goal }, sessionId));
    await waitFor("Boolean(document.querySelector('[data-goal-view=\"V1\"] [data-goal-materials-entry]'))", 15_000);
    await click('[data-goal-view="V1"] [data-goal-materials-entry]');
    await waitFor("[...document.querySelectorAll('[data-goal-inputs] [data-goal-input-add]')].some(button => button.getClientRects().length)", 10_000);
  };
  const add = async (title: string, mode: "live" | "fixed") => {
    await evaluate("[...document.querySelectorAll('[data-goal-inputs] [data-goal-input-add]')].find(button => button.getClientRects().length).click()");
    await waitFor("document.querySelector('dialog.placement-dialog')?.open === true", 15_000);
    // The project's own items are offered, the documents among them.
    await evaluate(`(() => { const row = [...document.querySelectorAll('dialog.placement-dialog .placement-choice')].find(label => label.querySelector('strong')?.textContent === ${JSON.stringify(title)});
      row.querySelector('input').checked = true;
      document.querySelector('dialog.placement-dialog input[name=mode][value=${mode}]').checked = true; })()`);
    await click("dialog.placement-dialog [data-placement-confirm]");
    await waitFor("!document.querySelector('dialog.placement-dialog')", 15_000);
  };

  await open();
  assert.match(await evaluate<string>("document.querySelector('[data-goal-inputs]').innerText"), /还没有输入|跟着原文|固定的第/);
  await add("访谈纪要", "fixed");
  await add("竞品清单", "live");

  // After the Goal is read again, both are in one list, each saying which way the Goal takes it.
  await open();
  await waitFor(`(document.querySelector('[data-goal-inputs]')?.innerText || '').includes('访谈纪要') && (document.querySelector('[data-goal-inputs]')?.innerText || '').includes('竞品清单')`, 15_000);
  const list = await evaluate<string>("document.querySelector('[data-goal-inputs] .bound-list').innerText");
  assert.match(list, /访谈纪要[\s\S]*固定的第 1 版|固定的第 1 版[\s\S]*访谈纪要/);
  assert.equal(await evaluate(`Boolean(document.querySelector('[data-goal-inputs] [data-placement-material][data-placement-id="${followed.id}"] [data-goal-input-mode="live"]'))`), true);
  assert.equal(await evaluate("document.querySelectorAll('[data-goal-inputs] [data-goal-input-fixed]').length"), 1);
  assert.equal(await evaluate(`Boolean(document.querySelector('[data-goal-inputs] [data-placement-material][data-placement-id="${fixed.id}"]'))`), false, "the fixed document is a version, not a followed object");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);

  // A fixed input can be taken off the Goal from the same list; the version stays in the 成果库.
  await click("[data-goal-inputs] [data-goal-input-fixed] [data-goal-input-remove]");
  await waitFor("!document.querySelector('[data-goal-inputs] [data-goal-input-fixed]')", 10_000);
  const left = await evaluate<{ inputs: unknown[] }>(`fetch('/projects/${projectId}/api/plugins/io.molis.work.goals/goals/V1/artifact-inputs').then(r => r.json())`);
  assert.deepEqual(left.inputs, []);
});

// An input an Agent only proposed reads 「待确认」 on the Goal, and the person decides it right there (specs/repository-anti-corruption §1, 2026-10-10).
test("a proposed input on a Goal reads 待确认 and is accepted or removed from the same list", { timeout: 120_000 }, async t => {
  const seed = async (databasePath: string, projectId?: string) => {
    await seedDemoGoals(databasePath, projectId);
    const store = new LocalProjectDatabase(databasePath);
    try {
      for (const item of ["item-accept", "item-remove"]) new GoalProjectApplication(store).goalInputs.register({ binding_id: `binding-${item}`, project_id: projectId ?? DEMO_PROJECT_ID,
        goal_id: "V1", input_name: `来源 ${item}`, source_type: "feed_item", source_ref: `feed-item:${item}`, snapshot_digest: `sha256:${"d".repeat(64)}`, state: "proposed",
        reason: "从 Feed Item 创建 Goal 时提议该输入", created_by: "runtime:promoter:session", created_at: "2026-10-10T00:00:00.000Z" });
    } finally { store.close(); }
  };
  const b = await openGoalBrowser(t, "seeded", seed, null); if (!b) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=goals&openItem=V1&openGoalView=work` }, sessionId));
  await waitFor("Boolean(document.querySelector('[data-goal-view=\"V1\"] [data-goal-materials-entry]'))", 15_000);
  await click('[data-goal-view="V1"] [data-goal-materials-entry]');
  const row = (item: string) => `[data-goal-inputs] [data-goal-input-binding="binding-${item}"]`;
  await waitFor(`Boolean(document.querySelector('${row("item-accept")} [data-goal-input-accept]')?.getClientRects().length)`, 10_000);

  // Pending, in words, with the two controls; never the raw state.
  assert.equal(await evaluate(`document.querySelector('${row("item-accept")} [data-goal-input-state]').textContent`), "待确认");
  assert.equal(await evaluate(`document.querySelector('${row("item-accept")} [data-goal-input-accept]').textContent`), "认可这条输入");
  assert.equal(await evaluate(`document.querySelector('${row("item-accept")} [data-goal-input-release]').textContent`), "移除");
  assert.doesNotMatch(await evaluate<string>("document.querySelector('[data-goal-inputs]').innerText"), /proposed|confirmed/);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);

  // Accepting reads 已确认 in place and takes the controls away.
  await click(`${row("item-accept")} [data-goal-input-accept]`);
  await waitFor(`document.querySelector('${row("item-accept")} [data-goal-input-state]')?.textContent === '已确认'`, 10_000);
  assert.equal(await evaluate(`Boolean(document.querySelector('${row("item-accept")} [data-goal-input-accept], ${row("item-accept")} [data-goal-input-release]'))`), false);
  assert.equal(await evaluate(`document.querySelector('${row("item-remove")} [data-goal-input-state]').textContent`), "待确认", "the other proposal is untouched");

  // Removing takes the proposal off the Goal.
  await click(`${row("item-remove")} [data-goal-input-release]`);
  await waitFor(`!document.querySelector('${row("item-remove")}')`, 10_000);

  // The Goal's own record agrees after it is read again.
  const html = await evaluate<string>(`fetch('/projects/${projectId}/api/goals/V1/document').then(r => r.text())`);
  assert.match(html, /binding-item-accept"[\s\S]*?data-goal-input-state="confirmed">已确认</);
  assert.doesNotMatch(html, /binding-item-remove/);
});
