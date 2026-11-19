import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { blueprintActions } from "@molis-ai/molis-work-contracts/services/blueprints";
import type { SettingsValues } from "@molis-ai/molis-work-contracts/platform/settings";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("ONB-22/23/28, PWA-36: the scene, settings page and Assistant share lookback and budget through retries and later edits", async t => {
  const b = await openGoalBrowser(t, "user", undefined, null);
  if (!b) return;
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

test("ONB-28/29: after a partial adoption the reopened page retries only the unconfirmed setting", async t => {
  const b = await openGoalBrowser(t, "user", undefined, null);
  if (!b) return;
  const { localHost, origin, command, sessionId, navigate, evaluate, waitFor, click } = b;
  assert.ok(localHost);
  const caller = await localHost.localPersonContext(), person = bindActionClient(localHost.homeActionClient(), () => caller);
  const title = { literal: "A week of editing" };
  const { draft } = await person.invoke(blueprintActions.draftSave, { expected_revision: null, blueprint: {
    title, purpose: { audience: title, work: title, inputs: title, outputs: title, first_result: title },
    parts: [{ part_id: "invalid-report", layer: "project", required: false, proposal: { kind: "setting", key: "assistant.report_schedule",
      value: { enabled: true, frequency: "weekly", weekday: 1700000000000, time: "09:00", time_zone: "UTC" } } },
      { part_id: "range", layer: "personal", required: true, proposal: { kind: "setting", key: "assistant.lookback", value: { count: 1, unit: "weeks" } } },
      { part_id: "cap", layer: "personal", required: true, proposal: { kind: "setting", key: "assistant.daily_tokens", value: 5000 } },
      { part_id: "note", layer: "project", required: false, proposal: { kind: "content", type: "notes.outline.v1", body: {} } }],
    steps: [{ step_id: "prepare", title, part_ids: ["invalid-report", "range", "cap", "note"] }],
    example_task: { title, input: title, step_ids: ["prepare"], result: { part_id: "note", location: title } },
  } });
  const db = new DatabaseSync(homeSqlitePath(b.homeDirectory, "assistant"));
  try {
    db.exec("CREATE TRIGGER budget_unavailable BEFORE INSERT ON assistant_settings WHEN NEW.key='daily_tokens' BEGIN SELECT RAISE(ABORT,'budget unavailable'); END");
    const address = origin + "/onboarding?scene&draft=" + encodeURIComponent(draft.source.draft_id);
    await navigate(() => command("Page.navigate", { url: address }, sessionId));
    await waitFor("document.querySelector('[name=scene-target]')");
    await click("[name=scene-target][value=personal]");
    await click(".arrival-bar .bar-end .mw-btn--primary");
    await waitFor("document.querySelector('[data-scene-main] dl')");
    assert.match(await evaluate<string>("document.querySelector('[data-scene-main]').innerText"), /此设置不适用于所选范围|cannot be written in the selected scope/i);
    assert.equal(await evaluate("document.querySelector('[data-scene-main] input[type=checkbox]')"), null);
    await click("[data-scene-aside] button:nth-of-type(2)");
    await waitFor("document.querySelector('[data-scene-main] input[type=checkbox]')?.checked");
    assert.match(await evaluate<string>("document.querySelector('[data-scene-main] dl').innerText"), /1\s*(周|week)/i);
    await click(".arrival-bar .bar-end .mw-btn--primary");
    const partial = "document.querySelector('[data-scene-main]')?.textContent.match(/待核对|Awaiting verification/i) && document.querySelector('.arrival-bar .bar-end .mw-btn--primary')";
    await waitFor(partial);
    const review = join(process.cwd(), ".impeccable", "qa", "review", "batch-38");
    await mkdir(review, { recursive: true });
    const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(join(review, "partial-adoption.png"), Buffer.from(shot.data, "base64"));
    const appliedRange = db.prepare("SELECT value, revision FROM assistant_settings WHERE actor_id=? AND key='lookback'").get(caller.actor_id);
    assert.ok(appliedRange);
    assert.deepEqual(JSON.parse(String(appliedRange.value)), { count: 1, unit: "weeks" });
    assert.equal(db.prepare("SELECT value FROM assistant_settings WHERE actor_id=? AND key='daily_tokens'").get(caller.actor_id), undefined);
    db.exec("DROP TRIGGER budget_unavailable");
    await b.reloadPage(); await waitFor(partial);
    await click(".arrival-bar .bar-end .mw-btn--primary");
    await waitFor("document.querySelectorAll('[data-scene-main] details').length === 4 && !document.querySelector('.arrival-bar .bar-end .mw-btn--primary') && document.querySelector('[data-scene-aside] button')");
    assert.deepEqual(db.prepare("SELECT value, revision FROM assistant_settings WHERE actor_id=? AND key='lookback'").get(caller.actor_id), appliedRange);
    assert.equal(db.prepare("SELECT value FROM assistant_settings WHERE actor_id=? AND key='daily_tokens'").get(caller.actor_id)!.value, "5000");
    assert.equal(db.prepare("SELECT count(*) AS n FROM assistant_settings WHERE key LIKE 'preferences/receipt/%' AND actor_id=?").get(caller.actor_id)!.n, 2);
  } finally { db.close(); }
});

test("ONB-23/34: the Assistant's report preference follows the scene, then the person's local calendar choice without creating a standing delegation", async t => {
  const b = await openGoalBrowser(t, "user", undefined, null);
  if (!b) return;
  const { localHost, origin, command, sessionId, navigate, evaluate, waitFor, click } = b;
  assert.ok(localHost);
  const caller = await localHost.localPersonContext(), raw = localHost.homeActionClient(), person = bindActionClient(raw, () => caller);
  const key = "assistant.report_schedule", title = { literal: "Friday review" };
  const read = { capability_id: "assistant.preferences.read", version: 1, provider_id: "system.assistant-settings" };
  const write = { ...read, capability_id: "assistant.preferences.write" };
  const current = async () => (await raw.invoke(caller, read, { keys: [key] }) as SettingsValues).values[0]!;
  const initial = await current();
  assert.ok(initial.state === "ok" && initial.source === "provider_default");
  const friday = { enabled: true, frequency: "weekly", weekday: 5, time: "17:30", time_zone: "Asia/Shanghai" };
  for (const invalid of [{ ...friday, time_zone: "no/such-zone" }, { ...friday, time: "25:00" }, { ...friday, frequency: "daily" }]) {
    await assert.rejects(raw.invoke(caller, write, { key, layer: "personal", expected_revision: initial.revision, change: { set: invalid }, request_id: "invalid" }),
      { code: "assistant.setting_invalid" });
  }
  assert.deepEqual(await current(), initial);
  const { draft } = await person.invoke(blueprintActions.draftSave, { expected_revision: null, blueprint: {
    title, purpose: { audience: title, work: title, inputs: title, outputs: title, first_result: title },
    parts: [{ part_id: "calendar", layer: "personal", required: true, proposal: { kind: "setting", key, value: friday } },
      { part_id: "note", layer: "project", required: false, proposal: { kind: "content", type: "notes.outline.v1", body: {} } }],
    steps: [{ step_id: "review", title, part_ids: ["calendar", "note"] }],
    example_task: { title, input: title, step_ids: ["review"], result: { part_id: "note", location: title } },
  } });
  const preview = await person.invoke(blueprintActions.preview, { source: draft.source, target: { kind: "personal" }, part_ids: ["calendar"] });
  assert.deepEqual(preview.parts[0]?.consequences, ["schedule"]);
  await navigate(() => command("Page.navigate", { url: origin + "/onboarding?scene&preview=" + preview.preview_id }, sessionId));
  await waitFor("document.querySelector('[data-scene-main] dl')");
  const summary = await evaluate<string>("document.querySelector('[data-scene-main] dl').innerText");
  assert.match(summary, /星期五|Friday/i);
  assert.match(summary, /17:30.*Asia\/Shanghai/);
  assert.doesNotMatch(summary, /time_zone|month_day/);
  const request = { preview_id: preview.preview_id, part_ids: ["calendar"], request_id: "prepare-fridays" };
  const result = await person.invoke(blueprintActions.apply, request);
  assert.equal(result.steps[0]?.state, "applied");

  const form = "document.querySelector('[data-assistant-report]')", fields = form + ".elements";
  await navigate(() => command("Page.navigate", { url: origin + "/settings/assistant" }, sessionId));
  await waitFor(form + " && " + fields + ".weekday.value === '5' && " + fields + ".time_zone.value === 'Asia/Shanghai'");
  assert.equal(await evaluate(fields + ".time.value"), "17:30");
  await evaluate(fields + ".frequency.value = 'monthly'; " + fields + ".frequency.dispatchEvent(new Event('change')); " +
    fields + ".month_day.value = '12'; " + fields + ".time.value = '08:45'; " + fields + ".time_zone.value = 'America/Los_Angeles'; " + fields + ".enabled.checked = false");
  await click("[data-assistant-report] button[type=submit]");
  await waitFor("!" + form + ".querySelector('button[type=submit]').disabled");
  const revised = await current();
  assert.deepEqual(revised.state === "ok" && revised.value, { enabled: false, frequency: "monthly", month_day: 12, time: "08:45", time_zone: "America/Los_Angeles" });
  await b.reloadPage();
  await waitFor(form + " && " + fields + ".month_day.value === '12' && !" + fields + ".enabled.checked && " + fields + ".weekday.disabled");
  assert.equal((await person.invoke(blueprintActions.apply, request)).adoption_id, result.adoption_id);
  await person.invoke(blueprintActions.revert, { adoption_id: result.adoption_id, request_id: "remove-fridays" });
  assert.deepEqual(await current(), revised);
  const db = new DatabaseSync(homeSqlitePath(b.homeDirectory, "assistant"), { readOnly: true });
  try {
    assert.equal(db.prepare("SELECT count(*) AS n FROM assistant_followups").get()!.n, 0);
  } finally { db.close(); }
  await click("[data-assistant-report] [data-inherit]");
  await waitFor(form + ".querySelector('[data-inherit]').hidden && " + fields + ".frequency.value === 'daily'");
  const inherited = await current();
  assert.deepEqual(inherited.state === "ok" && inherited.value, initial.value);
});
