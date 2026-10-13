import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// A Goal's rules form and the project's rules page live in the same workbench document. Each is saved by its own
// script, once: saving a Goal's rules never rewrites the project's default rules, and the project's rules page is not
// also sent as a Goal's.
test("a Goal's rules and the project's rules are each saved once, by their own script", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { origin, projectId, command, sessionId, evaluate, navigate, waitFor, click } = browser;
  const prefix = `/projects/${projectId}`;
  // Every rules request the page sends is kept for this browser session, through any reload a save causes.
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const original = window.fetch;
    window.fetch = (url, options) => { if (String(url).endsWith('/api/policy-bindings') && options?.method === 'POST') {
      const posts = JSON.parse(sessionStorage.getItem('policy-posts') || '[]'); posts.push(JSON.parse(options.body).scope); sessionStorage.setItem('policy-posts', JSON.stringify(posts)); }
      return original(url, options); }; })()` }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/" }, sessionId));
  const posts = () => evaluate<string[]>("JSON.parse(sessionStorage.getItem('policy-posts') || '[]')");
  const projectDefaults = () => JSON.stringify(browser.store.db.prepare("SELECT policy_binding_id, policy_json FROM policy_bindings WHERE scope = 'project_default' AND state = 'active'").all());
  const before = projectDefaults();

  await waitFor("!!document.querySelector('.policy-form[data-policy-form] [name=goal_id]')", 15_000);
  await evaluate(`(() => { const form = document.querySelector('.policy-form[data-policy-form]');
    form.querySelectorAll('[required]').forEach(field => { if (!field.value) field.value = '只验证这条 Goal 的规则'; });
    form.requestSubmit(); })()`);
  await waitFor("JSON.parse(sessionStorage.getItem('policy-posts') || '[]').length > 0", 10_000);
  await new Promise(resolve => setTimeout(resolve, 1500));
  assert.deepEqual(await posts(), ["goal"]);
  assert.equal(projectDefaults(), before, "a Goal's rules did not become the project's defaults");

  await evaluate("sessionStorage.removeItem('policy-posts')");
  await evaluate(`document.dispatchEvent(new CustomEvent("molis-work:open-settings-path", { detail: { href: ${JSON.stringify(prefix + "/settings/rules")} } }))`);
  await waitFor("!!document.querySelector('[data-work-surface=project-settings] [data-project-rules-form]')", 15_000);
  const accepted = await evaluate<boolean>("(() => { const box = document.querySelector('[data-project-rules-form] [name=human_approval]'); box.checked = !box.checked; return box.checked; })()");
  // With the service out of reach the page stays, so every request the one save sent is still on record.
  await command("Network.enable", {}, sessionId);
  await command("Network.setBlockedURLs", { urls: [origin + prefix + "/api/policy-bindings"] }, sessionId);
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
