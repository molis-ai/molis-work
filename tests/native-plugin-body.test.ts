import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MolisWorkLocalHost, molisWorkHostProjectReference, handleWorkflowsNativePluginHttp } from "@molis-ai/molis-work-app-local-host";
import { bindActionClient, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { workflowsActions, WORKFLOWS_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-workflows";
import { serveNativeHttp } from "./fixtures/native-http.js";

// The shared native reader is exercised through the Workflows edge (its 400,000-byte budget): Pages left the native edge for the Plugin Runtime
// (W5-01-PAGES), whose route body limit is covered in pages-import.test.ts and pages-plugin.test.ts.
test("W2-18-NATIVE-BODY-01 native HTTP accepts Chinese within budget and refuses byte overflow before the owner or model", async t => {
  const home = await mkdtemp(join(tmpdir(), "native-body-"));
  let modelCalls = 0, ownerEntries = 0;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: async () => { modelCalls++; throw new Error("no model request expected"); } });
  const reference = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "body-test" });
  const actions = bindActionClient(host.actionClient(reference), () => ({ actor_id: "owner", project_id: "body-test", audience: "user", permissions: WORKFLOWS_ACTION_PERMISSIONS }));
  const counted: BoundActionClient = { discover: () => actions.discover(),
    invoke: (definition, input, control, transport) => { ownerEntries++; return actions.invoke(definition, input, control, transport); } };
  const edge = await serveNativeHttp((request, response, url) => handleWorkflowsNativePluginHttp(request, response, url, { actions: counted }));
  t.after(async () => { await edge.close(); await host.close(); await rm(home, { recursive: true, force: true }); });
  const saved = await edge.post("/api/workflows", JSON.stringify({ title: "中文流程" }));
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const before = (await actions.invoke(workflowsActions.list, {})).workflows;
  assert.equal(before.length, 1);
  const entered = ownerEntries;
  const body = JSON.stringify({ title: "中".repeat(140_000) });
  assert.ok(body.length < 400_000 && Buffer.byteLength(body) > 400_000);
  const oversized = await edge.post("/api/workflows", body);
  assert.deepEqual([oversized.status, oversized.body.code], [413, "actions.input_too_large"]);
  assert.equal(ownerEntries, entered, "the oversized request never enters even the owner's action client");
  assert.deepEqual((await actions.invoke(workflowsActions.list, {})).workflows, before, "owner persistence is unchanged");
  assert.equal(modelCalls, 0);
  assert.equal((await edge.post("/api/workflows", "{")).status, 400);
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
  const handled = handleWorkflowsNativePluginHttp(request, response, new URL("http://127.0.0.1/api/workflows"), { actions: unreachable });
  request.emit("data", Buffer.from('{"native_body_marker":"'));
  request.emit("data", Buffer.alloc(1_000_001, 120));
  await handled;
  assert.equal(response.statusCode, 413);
  // A real Buffer still carries valid bytes; the observer catches the old reader's post-refusal string accumulation.
  const tail = Buffer.from('"}');
  Object.defineProperty(tail, Symbol.toPrimitive, { value: () => { converted++; return '"}'; } });
  request.emit("data", tail); request.emit("end");
  assert.deepEqual([entries, converted, parsed], [0, 0, 0]);
});
