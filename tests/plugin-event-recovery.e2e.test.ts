import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Database from "better-sqlite3";
import { DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { SqlitePluginEventsRepository, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { CODING_FILE_CHANGED_EVENT } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("event recovery uses real project HTTP and SQLite, preserves failed confirmations, and requires an explicit browser decision", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId, databasePath } = browser;
  const endpoint = `/projects/${projectId}/api/plugins/runtime/events`;
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("Boolean(globalThis.molisWorkControlHeaders)");
  const initial = await evaluate<{ status: number }>(`fetch(${JSON.stringify(endpoint)}).then(response=>({status:response.status}))`);
  assert.equal(initial.status, 200);
  const db = new Database(databasePath), repository = new SqlitePluginEventsRepository(db);
  t.after(() => db.close());
  const installs = new SqlitePluginRuntimeRepository(db).list();
  const source = installs.find(record => record.plugin_id === "io.molis.work.coding")!;
  const subscriber = installs.find(record => record.plugin_id === "io.molis.work.files")!;
  assert.ok(source && subscriber);
  const event = repository.append({ event_id: `browser-event-${randomUUID()}`, board_id: DEMO_BOARD_ID,
    source_plugin_id: source.plugin_id, source_install_id: source.install_id, event_type_id: CODING_FILE_CHANGED_EVENT,
    type_version: 1, payload: { project_id: projectId, path: ["example.txt"] }, correlation_id: null, occurred_at: new Date().toISOString() });
  // A real persisted interrupted delivery, as left by a Host crash, with no fake HTTP responses on the happy path.
  const cursor = { revision: randomUUID(), board_id: DEMO_BOARD_ID, subscriber_plugin_id: subscriber.plugin_id,
    subscriber_install_id: subscriber.install_id, subscriber_generation: subscriber.installation_generation!,
    source_plugin_id: source.plugin_id, event_type_id: CODING_FILE_CHANGED_EVENT, type_version: 1,
    delivered_sequence: event.sequence - 1, state: "quarantined" as const, retry_at: null,
    last_error_code: "subscriber_outcome_unknown", updated_at: new Date().toISOString() };
  repository.saveCursor(cursor);
  const denied = await fetch(origin + endpoint + "/recover", { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
  assert.equal(denied.status, 403, "Runtime management requires the local control token");
  assert.deepEqual(repository.resolutions(DEMO_BOARD_ID), []);
  await click('[data-global-menu] [data-plugin-id="market"]');
  await waitFor("document.querySelector('[data-plugin-event-open]')?.getClientRects().length > 0");
  await click('[data-plugin-event-open]');
  await waitFor("document.querySelector('[data-plugin-event-dialog]').open");
  assert.equal(await evaluate("document.querySelector('[data-plugin-event-form] input:checked')"), null, "retry is never preselected");
  await click('[data-plugin-event-cancel]');
  assert.equal(repository.listCursors(DEMO_BOARD_ID).find(row => row.subscriber_plugin_id === subscriber.plugin_id && row.event_type_id === CODING_FILE_CHANGED_EVENT)!.revision, cursor.revision);

  await click('[data-plugin-event-open]');
  await evaluate("document.querySelector('[data-plugin-event-form] textarea').value='已核对文件内容，原通知无需再次处理。'");
  await click('[data-plugin-event-form] input[value="skip"]');
  repository.saveCursor({ ...cursor, revision: randomUUID() });
  await click('[data-plugin-event-form] [type="submit"]');
  await waitFor("document.querySelector('[data-plugin-event-error]').textContent.includes('已变化')");
  assert.equal(await evaluate("document.querySelector('[data-plugin-event-dialog]').open"), true);
  assert.equal(await evaluate("document.querySelector('[data-plugin-event-form] textarea').value"), "已核对文件内容，原通知无需再次处理。");
  assert.deepEqual(repository.resolutions(DEMO_BOARD_ID), []);

  await evaluate(`(() => {
    const original=window.fetch;let fail=true;
    window.fetch=(input,init)=>{
      if(fail&&String(input).endsWith('/api/plugins/runtime/events')){fail=false;return Promise.resolve(new Response(JSON.stringify({error:'暂时无法读取，请重试'}),{status:503,headers:{'content-type':'application/json'}}));}
      return original(input,init);
    };
  })()`);
  await click('[data-plugin-event-reload]');
  await waitFor("document.querySelector('[data-plugin-event-error]').textContent==='暂时无法读取，请重试'");
  assert.equal(await evaluate("document.querySelector('[data-plugin-event-form] textarea').value"), "已核对文件内容，原通知无需再次处理。");
  assert.equal(await evaluate("document.querySelector('[data-plugin-event-form] [type=submit]').disabled"), true);
  await click('[data-plugin-event-reload]');
  await waitFor("!document.querySelector('[data-plugin-event-form] [type=submit]').disabled");
  assert.equal(await evaluate("document.querySelector('[data-plugin-event-form] input:checked')"), null, "refresh requires a new explicit decision");
  await click('[data-plugin-event-form] input[value="skip"]');

  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, sessionId);
  await waitFor("document.querySelector('[data-plugin-event-dialog]').getBoundingClientRect().width <= innerWidth");
  assert.equal(await evaluate("document.querySelector('[data-plugin-event-form] input[type=radio]').getBoundingClientRect().width < 24"), true);
  const directory = join(process.cwd(), ".impeccable/qa/review"); await mkdir(directory, { recursive: true });
  for (const theme of ["light", "dark"]) {
    await evaluate(`document.documentElement.dataset.resolvedTheme=${JSON.stringify(theme)}`);
    await new Promise(resolve => setTimeout(resolve, 250));
    const capture = await command("Page.captureScreenshot", { format: "png" }, sessionId) as { data: string };
    await writeFile(join(directory, `plugin-event-recovery-${theme}.png`), Buffer.from(capture.data, "base64"));
  }
  await click('[data-plugin-event-form] [type="submit"]');
  await waitFor("!document.querySelector('[data-plugin-event-dialog]').open && document.querySelector('[data-plugin-events-status]').textContent==='没有待核对的通知。'");
  const history = repository.resolutions(DEMO_BOARD_ID);
  assert.equal(history.length, 1); assert.equal(history[0]!.decision, "skip");
  assert.equal(history[0]!.actor_id, "web-user"); assert.equal(history[0]!.event_id, event.event_id);
  assert.equal(repository.listCursors(DEMO_BOARD_ID).find(row => row.subscriber_plugin_id === subscriber.plugin_id && row.event_type_id === CODING_FILE_CHANGED_EVENT)!.delivered_sequence, event.sequence);
  assert.equal(await evaluate("document.querySelector('[data-plugin-events-history]').hidden"), false);
});
