import assert from "node:assert/strict";
import test from "node:test";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { blueprintActions } from "@molis-ai/molis-work-contracts/services/blueprints";
import type { SettingsValues } from "@molis-ai/molis-work-contracts/platform/settings";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("ONB-22/23/28, PWA-36: the scene, settings page and Assistant share lookback and budget through retries and later edits", async t => {
  const b = await openGoalBrowser(t, "user", undefined, null);
  const { localHost, origin, command, sessionId, navigate, evaluate, waitFor, click } = b;
  assert.ok(localHost);
  const caller = await localHost.localPersonContext(), raw = localHost.homeActionClient(), person = bindActionClient(raw, () => caller);
  const read = { capability_id: "assistant.preferences.read", version: 1, provider_id: "system.assistant-settings" };
  const write = { ...read, capability_id: "assistant.preferences.write" };
  const key = "assistant.lookback", cap = "assistant.daily_tokens";
  const actor = caller.actor_id, store = localHost.assistantStore!();
  store.setSetting(actor, "daily_tokens", "4500");
  const get = async () => (await raw.invoke(caller, read, { keys: [key, cap] }) as SettingsValues).values;
  const [range, budget] = await get();
  assert.equal(range?.state === "ok" && range.source, "provider_default");
  assert.equal(budget?.state === "ok" && budget.value, 4500);
  const title = { literal: "Editorial review" };
  const { draft } = await person.invoke(blueprintActions.draftSave, { expected_revision: null, blueprint: {
    title, purpose: { audience: title, work: title, inputs: title, outputs: title, first_result: title },
    parts: [{ part_id: "look", layer: "personal", required: true, proposal: { kind: "setting", key, value: { count: 2, unit: "weeks" } } },
      { part_id: "report", layer: "project", required: false, proposal: { kind: "content", type: "notes.outline.v1", body: {} } }],
    steps: [{ step_id: "read", title, part_ids: ["look", "report"] }],
    example_task: { title, input: title, step_ids: ["read"], result: { part_id: "report", location: title } },
  } });
  const preview = await person.invoke(blueprintActions.preview, { source: draft.source, target: { kind: "personal" }, part_ids: ["look"] });
  assert.equal(preview.parts[0]?.decision, "update");
  const request = { preview_id: preview.preview_id, part_ids: ["look"], request_id: "editorial-lookback" };
  const done = await person.invoke(blueprintActions.apply, request);
  assert.equal(done.steps[0]?.state, "applied");

  await navigate(() => command("Page.navigate", { url: origin + "/settings/assistant" }, sessionId));
  await waitFor("document.querySelector('[data-lookback-count]')?.value === '2' && document.querySelector('[data-lookback-unit]').value === 'weeks'");
  assert.equal(await evaluate("document.querySelector('[data-assistant-budget-input]').value"), "4500");
  await evaluate("document.querySelector('[data-lookback-count]').value='3'; document.querySelector('[data-lookback-unit]').value='days'");
  await click("[data-assistant-lookback] button[type=submit]");
  await waitFor("!document.querySelector('[data-assistant-lookback] button[type=submit]').disabled");
  await b.reloadPage();
  await waitFor("document.querySelector('[data-lookback-count]')?.value === '3' && document.querySelector('[data-lookback-unit]').value === 'days'");
  assert.deepEqual(JSON.parse(store.setting(actor, "lookback")!), { count: 3, unit: "days" });
  await person.invoke(blueprintActions.apply, request);
  const undo = await person.invoke(blueprintActions.revert, { adoption_id: done.adoption_id, request_id: "return-window" });
  assert.equal(undo.undo.steps[0]?.state, "skipped");
  assert.deepEqual(JSON.parse(store.setting(actor, "lookback")!), { count: 3, unit: "days" });
  await click("[data-assistant-lookback] [data-inherit]");
  await waitFor("document.querySelector('[data-lookback-count]')?.value === '48' && document.querySelector('[data-assistant-lookback] [data-inherit]').hidden");

  const change = { key: cap, layer: "personal", expected_revision: budget!.revision, request_id: "cost-limit", change: { set: 6000 } };
  const receipt = await raw.invoke(caller, write, change);
  assert.equal(store.setting(actor, "daily_tokens"), "6000");
  await b.reloadPage();
  await waitFor("document.querySelector('[data-assistant-budget-input]')?.value === '6000'");
  await click("[data-budget-inherit]");
  await waitFor("document.querySelector('[data-assistant-budget-input]')?.value === '' && document.querySelector('[data-budget-inherit]').hidden");
  assert.deepEqual(await raw.invoke(caller, write, change), receipt);
  const updated = (await get())[1];
  assert.equal(updated?.state === "ok" && updated.source, "provider_default");
  assert.equal(store.setting(actor, "daily_tokens"), "");
  await assert.rejects(raw.invoke({ ...caller, actor_kind: "runtime" }, write, change), { code: "assistant.scope" });
});
