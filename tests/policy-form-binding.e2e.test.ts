import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { GoalProjectApplication } from "./fixtures/goal-application.js";

test("W1-18-GOAL-POLICY-01 Goal requirements use events, while the project rules page saves its current default once", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { origin, projectId, command, sessionId, evaluate, navigate, waitFor, click } = browser;
  const prefix = `/projects/${projectId}`;
  assert.ok(projectId);
  const app = new GoalProjectApplication(browser.store);
  const goal = app.goalEvents.createIntent({ project_id: projectId, title: "规则入口", outcome: "只通过现行合同保存", actor_id: "web-user",
    actor_kind: "user", source_kind: "web", idempotency_key: "policy-current-goal" }).goal;
  // Every rules request the page sends is kept for this browser session, through any reload a save causes.
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const original = window.fetch;
    window.fetch = (url, options) => { if (String(url).endsWith('/api/plugins/io.molis.work.goals/policy-bindings') && options?.method === 'POST') {
      const posts = JSON.parse(sessionStorage.getItem('policy-posts') || '[]'); posts.push(JSON.parse(options.body).scope); sessionStorage.setItem('policy-posts', JSON.stringify(posts)); }
      return original(url, options); }; })()` }, sessionId);
  // The Goal details sit beside the work at a desktop width; below 840px they fold away.
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/goals/" + goal.goal_id }, sessionId));
  await browser.openGoalWork();
  const posts = () => evaluate<string[]>("JSON.parse(sessionStorage.getItem('policy-posts') || '[]')");
  const projectDefaults = () => JSON.stringify(browser.store.db.prepare("SELECT policy_binding_id, policy_json FROM policy_bindings WHERE scope = 'project_default' AND state = 'active'").all());
  const before = projectDefaults();

  await waitFor("!!document.querySelector('[data-goal-event-document]')", 15_000);
  assert.equal(await evaluate("!!document.querySelector('[data-policy-form] [name=goal_id], [data-policy-form] [name=scope][value=goal]')"), false);
  await click('[data-goal-event-document]:not([hidden]) [data-goal-requirement-progress]');
  await click('[data-event-panel="requirements"] [data-event-form-open="requirement"]');
  await evaluate(`(() => { const form = document.querySelector('[data-event-form="requirement"]');
    form.querySelector('[name="statement"]').value = '由用户核对真实结果';
    form.querySelector('[name="human_decision_required"]').checked = true;
    form.querySelector('[name="statement"]').dispatchEvent(new Event('input', {bubbles:true})); })()`);
  await click('[data-event-form="requirement"] button[type=submit]');
  await waitFor("document.querySelector('[data-document-pane]')?.getAttribute('aria-busy') !== 'true' && document.querySelector('[data-event-panel=requirements]')?.textContent.includes('由用户核对真实结果')", 10_000);
  assert.equal(app.goalEvents.readState(projectId, goal.goal_id).requirements[0]?.statement, "由用户核对真实结果");
  assert.deepEqual(await posts(), []);
  assert.equal(projectDefaults(), before, "a Goal requirement does not rewrite the project default");

  await evaluate("sessionStorage.removeItem('policy-posts')");
  await evaluate(`document.dispatchEvent(new CustomEvent("molis-work:open-settings-path", { detail: { href: ${JSON.stringify(prefix + "/settings/rules")} } }))`);
  await waitFor("!!document.querySelector('[data-work-surface=project-settings] [data-project-rules-form]')", 15_000);
  const accepted = await evaluate<boolean>("(() => { const box = document.querySelector('[data-project-rules-form] [name=human_approval]'); box.checked = !box.checked; return box.checked; })()");
  // With the service out of reach the page stays, so every request the one save sent is still on record.
  await command("Network.enable", {}, sessionId);
  await command("Network.setBlockedURLs", { urls: [origin + prefix + "/api/plugins/io.molis.work.goals/policy-bindings"] }, sessionId);
  await click("[data-project-rules-form] button[type=submit]");
  await waitFor("!document.querySelector('[data-project-rules-form] [data-policy-error]').hidden", 10_000);
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.deepEqual(await posts(), ["project_default"]);
  assert.match(await evaluate<string>("document.querySelector('[data-project-rules-form] [data-policy-error]').textContent"), /输入已保留/);
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  await navigate(() => click("[data-project-rules-form] button[type=submit]"));
  const saved = JSON.parse(projectDefaults()) as { policy_json: string }[];
  assert.equal(saved.length, 1);
  assert.deepEqual(JSON.parse(saved[0]!.policy_json), { human_approval: accepted });
});
