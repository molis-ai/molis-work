import { buildMolisWorkWebView } from "@molis-ai/molis-work-app-local-host";
import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";

import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("refreshing create choices preserves the unsaved draft, selected relations and text cursor without creating a Goal", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, origin, sessionId, command, evaluate, waitFor, click, navigate, showGoalStageList } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/goals/RELEASE" }, sessionId));
  await waitFor("document.querySelector('[data-goal-canvas-shell]')");
  await showGoalStageList();
  await click("[data-goal-stage-chrome] [data-open-create]");
  await waitFor("document.activeElement.name === 'title'");
  await evaluate(`(() => {
    const form = document.querySelector('[data-create-form]');
    form.elements.title.value = 'Unsaved draft';
    form.elements.outcome.value = 'Keep my input';
    form.elements.parent_goal_id.value = 'V1';
    form.querySelector('[name=dependency_goal_ids][value=INTERFACES]').checked = true;
    form.elements.parent_goal_id.dispatchEvent(new Event('change', {bubbles:true}));
    form.elements.title.focus(); form.elements.title.setSelectionRange(2, 7);
  })()`);
  const response = await fetch(origin + "/api/goals", {
    method: "POST", headers: { "content-type": "application/json", origin,
      "x-molis-work-control-token": "goals-risk-test-control-token-0123456789",
      "x-molis-work-idempotency-key": "refresh-dialog-external-goal" },
    body: JSON.stringify({ goal_id: "NEW-CHOICE", title: "New available choice", outcome: "Refresh available choices",
      why: "Another operation changed the board", business_logic: "Keep the open form intact", priority: 10,
      acceptance_criteria: ["Available as a new choice"] }),
  });
  assert.equal(response.status, 201, await response.text());
  const baseline = store.snapshot(DEMO_BOARD_ID);
  // Use the application's visible-page refresh listener, not a private refresh function.
  await evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  await waitFor("document.querySelector('[data-create-form] [name=parent_goal_id] option[value=NEW-CHOICE]')");
  assert.deepEqual(await evaluate(`(() => {
    const form = document.querySelector('[data-create-form]');
    return {open: document.querySelector('[data-create-dialog]').open, title: form.elements.title.value,
      outcome: form.elements.outcome.value, parent: form.elements.parent_goal_id.value,
      dependencies: [...form.querySelectorAll('[name=dependency_goal_ids]:checked')].map(input=>input.value),
      focus: document.activeElement.name, start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd};
  })()`), { open: true, title: "Unsaved draft", outcome: "Keep my input", parent: "V1",
    dependencies: ["INTERFACES"], focus: "title", start: 2, end: 7 });
  await click('[data-create-dialog] [data-close-create]');
  const after = store.snapshot(DEMO_BOARD_ID);
  assert.deepEqual(after.goals, baseline.goals);
  assert.deepEqual(after.relations, baseline.relations);
  assert.deepEqual(after.claims, baseline.claims);
  assert.deepEqual(after.runs, baseline.runs);
});

test("Goal dialogs create once after retry, cancel without writes, and trash/restore the same Goal with history", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, origin, before, sessionId, command, evaluate, waitFor, click, navigate, reloadPage, showGoalStageList } = browser;
  const dom = (selector: string) => "document.querySelector(" + JSON.stringify(selector) + ")";
  const goalId = "DIALOG-BROWSER";
  const current = () => store.snapshot(DEMO_BOARD_ID);
  const goal = () => current().goals.find(item => item.goal_id === goalId)!;
  await command("Network.enable", {}, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/goals/RELEASE" }, sessionId));
  await waitFor(dom("[data-open-create]"));
  await showGoalStageList();
  await evaluate("document.querySelector('[data-goal-stage-chrome] [data-open-create]')?.click()");
  await waitFor(dom("[data-create-dialog]") + ".open");
  await waitFor("document.activeElement.name === 'title'");
  const values = { goal_id: goalId, title: '新建 "<safe>', priority: "67", outcome: "A recoverable result", why: "Keep user history",
    business_logic: "Create, cancel, trash, restore", acceptance_criteria: "Can be created\nCan be restored" };
  await evaluate("(() => {const form=" + dom("[data-create-form]") + "; for(const [name,value] of Object.entries(" + JSON.stringify(values) + ")){form.elements[name].value=value;form.elements[name].dispatchEvent(new Event('input',{bubbles:true}));} return true;})()");
  await evaluate("(() => { const form=" + dom("[data-create-form]") + "; form.elements.parent_goal_id.value='V1'; form.elements.parent_goal_id.dispatchEvent(new Event('change',{bubbles:true})); const dependency=form.querySelector('[name=dependency_goal_ids][value=INTERFACES]'); dependency.checked=true; dependency.dispatchEvent(new Event('change',{bubbles:true})); return true; })()");
  const parentTitle = before.goals.find(item => item.goal_id === "V1")!.title;
  const dependencyTitle = before.goals.find(item => item.goal_id === "INTERFACES")!.title;
  assert.equal(await evaluate(dom("[data-parent-preview]") + ".textContent"), "关系预览：新 Goal → 属于 → 「" + parentTitle + "」。这是目录层级，不需要等待它完成。");
  assert.equal(await evaluate(dom("[data-dependency-preview]") + ".textContent"), "关系预览：新 Goal → 依赖 → 「" + dependencyTitle + "」；这些 Goal 完成前，新 Goal 还不能收尾。普通笔记和准备仍可先做。");
  await command("Network.setBlockedURLs", { urls: [origin + "/api/goals"] }, sessionId);
  const createSubmit = '[data-create-form] button[type="submit"]';
  await click(createSubmit);
  await waitFor("!" + dom("[data-create-error]") + ".hidden && !" + dom(createSubmit) + ".disabled");
  assert.equal(await evaluate(dom('[data-create-form] [name="title"]') + ".value"), values.title);
  assert.deepEqual(current().goals, before.goals);
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  await navigate(() => click(createSubmit));
  await waitFor(dom('[data-goal-view="' + goalId + '"]'));
  assert.equal(goal().title, values.title);
  assert.equal(goal().outcome, values.outcome);
  assert.equal(goal().why, values.why);
  assert.equal(goal().business_logic, values.business_logic);
  assert.equal(goal().priority, 67);
  assert.equal(goal().definition_state, "draft");
  assert.equal(goal().accepted_at, null);
  const app = new GoalProjectApplication(store);
  assert.deepEqual(
    app.goalEvents.readState(DEMO_BOARD_ID, goalId).requirements.map((item) => item.statement).sort(),
    ["Can be created", "Can be restored"],
  );
  assert.equal(current().goals.length, before.goals.length + 1);
  const saved = structuredClone(goal());
  const newRelations = () => current().relations.filter(item => item.from_goal_id === goalId)
    .map(({ from_goal_id, to_goal_id, type, state }) => ({ from_goal_id, to_goal_id, type, state })).sort((a,b) => a.type.localeCompare(b.type));
  const expectedRelations = [
    { from_goal_id: goalId, to_goal_id: "INTERFACES", type: "depends_on", state: "active" },
    { from_goal_id: goalId, to_goal_id: "V1", type: "part_of", state: "active" },
  ];
  assert.deepEqual(newRelations(), expectedRelations);
  const openTrash = '[data-goal-view="' + goalId + '"] [data-open-goal-trash]';
  const openTrashMenu = async () => {
    if (await evaluate("document.querySelector('[data-frame-goal-work]')?.getBoundingClientRect().width > 0")) await click("[data-frame-goal-work]");
    if (!await evaluate(dom(".goal-more") + ".open")) await click(".goal-more > summary");
    await click(openTrash);
  };
  await openTrashMenu();
  await waitFor(dom("[data-goal-trash-dialog]") + ".open");
  assert.equal(await evaluate(dom("[data-goal-trash-target-title]") + ".textContent"), values.title);
  await click('[data-goal-trash-dialog] footer [data-close-goal-trash]');
  assert.equal(await evaluate(dom("[data-goal-trash-dialog]") + ".open"), false);
  assert.deepEqual(goal(), saved);
  await openTrashMenu();
  const trashSubmit = "[data-goal-trash-submit]", reason = '[data-goal-trash-form] [name="reason"]';
  await click(trashSubmit);
  assert.equal(await evaluate(dom(reason) + ".validity.valueMissing"), true);
  assert.deepEqual(goal(), saved);
  await evaluate(dom(reason) + ".value='Package migration browser test'");
  await command("Network.setBlockedURLs", { urls: [origin + "/api/goals/" + goalId + "/trash"] }, sessionId);
  await click(trashSubmit);
  await waitFor("!" + dom("[data-goal-trash-error]") + ".hidden && !" + dom(trashSubmit) + ".disabled");
  assert.equal(await evaluate(dom(reason) + ".value"), "Package migration browser test");
  assert.deepEqual(goal(), saved);
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  // The server may have saved while the browser is still waiting for its response.
  await evaluate(`{
    const original = window.fetch; window.trashRequests = 0;
    window.fetch = async (url, options) => {
      const response = await original(url, options);
      if (String(url).endsWith('/trash') && options?.method === 'POST') {
        window.trashRequests++;
        window.trashResponseReady = true;
        await new Promise(resolve => { window.releaseTrashResponse = resolve; });
      }
      return response;
    };
  }`);
  await click(trashSubmit);
  await waitFor("window.trashResponseReady === true");
  assert.ok(goal().trashed_at, "the production endpoint has already saved the original Goal");
  assert.equal(await evaluate("document.querySelector('[data-goal-trash-form]').getAttribute('aria-busy')"), "true");
  await click('[data-goal-trash-dialog] footer [data-close-goal-trash]');
  await command('Input.dispatchKeyEvent', {type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27}, sessionId);
  await command('Input.dispatchKeyEvent', {type:'keyUp', key:'Escape', code:'Escape', windowsVirtualKeyCode:27}, sessionId);
  await evaluate("document.querySelector('[data-goal-trash-form]').requestSubmit()");
  assert.equal(await evaluate("document.querySelector('[data-goal-trash-dialog]').open"), true);
  assert.equal(await evaluate("window.trashRequests"), 1, "pending submit cannot issue a second mutation");
  assert.equal(await evaluate("document.querySelector('[data-goal-trash-target-id]').textContent"), goalId);
  await navigate(() => evaluate("window.releaseTrashResponse()"));
  await waitFor(dom("[data-open-goal-restore]"));
  assert.ok(goal().trashed_at);
  assert.equal(goal().title, saved.title);
  assert.equal(goal().created_at, saved.created_at);
  await reloadPage();
  await waitFor("document.querySelector('.trash-goal-panel--restore [data-open-goal-restore]')");
  await evaluate("document.querySelector('.trash-goal-panel--restore [data-open-goal-restore]')?.click()");
  await waitFor("document.querySelector('[data-goal-trash-dialog]')?.open === true && document.querySelector('[data-goal-trash-title]')?.textContent === '恢复 Goal'");
  await evaluate(dom(reason) + ".value='Restore the same Goal'");
  await navigate(() => click(trashSubmit));
  await waitFor(dom('[data-goal-view="' + goalId + '"]'));
  assert.equal(goal().trashed_at, null);
  assert.equal(goal().goal_id, saved.goal_id);
  assert.equal(goal().created_at, saved.created_at);
  assert.deepEqual(goal().acceptance_criteria, saved.acceptance_criteria);
  assert.equal(current().goals.length, before.goals.length + 1);
  const view = buildMolisWorkWebView(store, new GoalProjectApplication(store), { boardId: DEMO_BOARD_ID });
  const events = view.goals.find(item => item.goal.goal_id === goalId)!.events;
  assert.equal(events.filter(event => event.type === "goal.created").length, 1);
  assert.ok(events.some(event => event.reason === "Package migration browser test"));
  assert.ok(events.some(event => event.reason === "Restore the same Goal"));
  assert.deepEqual(current().goals.filter(item => item.goal_id !== goalId), before.goals);
  assert.deepEqual(current().relations.filter(item => item.from_goal_id !== goalId), before.relations);
  assert.deepEqual(newRelations(), expectedRelations);
  assert.deepEqual(current().runs, before.runs);
});
