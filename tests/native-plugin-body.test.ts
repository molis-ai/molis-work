import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MolisWorkLocalHost, molisWorkHostProjectReference, handleScheduleNativePluginHttp } from "@molis-ai/molis-work-app-local-host";
import { bindActionClient, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { listProjectRoots } from "@molis-ai/molis-work-module-projects";
import { scheduleActions, SCHEDULE_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-schedule";
import { serveNativeHttp } from "./fixtures/native-http.js";

// Schedule still uses the shared native reader with a 256,000-byte budget. Pages and Workflows now use the Plugin Runtime;
// their declared route body limits are exercised through real HTTP in document-plugins-error-model.test.ts.
test("W2-18-NATIVE-BODY-01 native HTTP accepts Chinese within budget and refuses byte overflow before the owner or model", async t => {
  const home = await mkdtemp(join(tmpdir(), "native-body-"));
  let modelCalls = 0, ownerEntries = 0, invalidations = 0;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: async () => { modelCalls++; throw new Error("no model request expected"); } });
  const reference = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "body-test" });
  await host.withProject(reference, ({ coordinator, store }) => {
    coordinator.initializeBoard({ project_id: "body-test", title: "Native body", actor_id: "owner", idempotency_key: "native-body-project" });
    assert.deepEqual(listProjectRoots(store.db).map(row => row.project_id), ["body-test"], "the HTTP fixture uses a current project library with its root");
  });
  const actions = bindActionClient(host.actionClient(reference), () => ({ actor_id: "owner", project_id: "body-test", audience: "user", permissions: SCHEDULE_ACTION_PERMISSIONS }));
  const counted: BoundActionClient = { discover: () => actions.discover(),
    invoke: (definition, input, control, transport) => { ownerEntries++; return actions.invoke(definition, input, control, transport); } };
  const edge = await serveNativeHttp((request, response, url) => handleScheduleNativePluginHttp(request, response, url, {
    actions: counted, invalidateWebView: () => { invalidations++; },
  }));
  t.after(async () => { await edge.close(); await host.close(); await rm(home, { recursive: true, force: true }); });
  const input = { title: "中文任务", instructions: "读取中文内容", time: "08:30" };
  const saved = await edge.post("/api/schedule/tasks", JSON.stringify(input));
  assert.equal(saved.status, 201, JSON.stringify(saved.body));
  const before = (await actions.invoke(scheduleActions.list, {})).tasks;
  assert.equal(before.length, 1);
  assert.equal(before[0]!.title, input.title);
  assert.equal(before[0]!.instructions, input.instructions);
  const entered = ownerEntries;
  const changed = invalidations;
  const body = JSON.stringify({ ...input, padding: "中".repeat(90_000) });
  assert.ok(body.length < 256_000 && Buffer.byteLength(body) > 256_000);
  const oversized = await edge.post("/api/schedule/tasks", body);
  assert.deepEqual([oversized.status, oversized.body.code], [413, "actions.input_too_large"]);
  assert.equal(ownerEntries, entered, "the oversized request never enters even the owner's action client");
  assert.deepEqual((await actions.invoke(scheduleActions.list, {})).tasks, before, "owner persistence is unchanged");
  assert.equal(modelCalls, 0);
  const malformed = await edge.post("/api/schedule/tasks", "{");
  assert.deepEqual([malformed.status, malformed.body.code], [400, "actions.input_invalid"]);
  assert.deepEqual([ownerEntries, invalidations, modelCalls], [entered, changed, 0], "neither refusal reaches the owner, changes the view or calls a model");
  assert.deepEqual((await actions.invoke(scheduleActions.list, {})).tasks, before, "both refusals leave persistence unchanged");
});

test("W2-18-NATIVE-BODY-01 split input stops processing and parsing after the first refusal", async t => {
  const request = new IncomingMessage(new Socket());
  request.method = "POST"; request.httpVersionMajor = 1; request.httpVersionMinor = 1;
  const response = new ServerResponse(request);
  t.after(() => request.destroy());
  let entries = 0, converted = 0, parsed = 0;
  const originalParse = JSON.parse;
  t.mock.method(JSON, "parse", (text: string, reviver?: Parameters<typeof JSON.parse>[1]) => {
    if (text.startsWith('{"native_body_marker":')) parsed++;
    return originalParse(text, reviver);
  });
  const unreachable: BoundActionClient = { discover: async () => { entries++; throw new Error("the owner must not be reached"); },
    invoke: async () => { entries++; throw new Error("the owner must not be reached"); } };
  const handled = handleScheduleNativePluginHttp(request, response, new URL("http://127.0.0.1/api/schedule/tasks"), {
    actions: unreachable, invalidateWebView: () => { entries++; },
  });
  request.emit("data", Buffer.from('{"native_body_marker":"'));
  request.emit("data", Buffer.alloc(256_001, 120));
  await handled;
  assert.equal(response.statusCode, 413);
  // A real Buffer still carries valid bytes; the observer catches the old reader's post-refusal string accumulation.
  const tail = Buffer.from('"}');
  Object.defineProperty(tail, Symbol.toPrimitive, { value: () => { converted++; return '"}'; } });
  request.emit("data", tail); request.emit("end");
  assert.deepEqual([entries, converted, parsed], [0, 0, 0]);
});
