import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MolisWorkLocalHost, molisWorkHostProjectReference, handlePagesNativePluginHttp } from "@molis-ai/molis-work-app-local-host";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { pagesActions, PAGES_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-pages";
import { serveNativeHttp } from "./fixtures/native-http.js";

test("W2-18-NATIVE-BODY-01 native HTTP accepts Chinese within budget and refuses byte overflow before the owner or model", async t => {
  const home = await mkdtemp(join(tmpdir(), "native-body-"));
  let modelCalls = 0, ownerEntries = 0;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: async () => { modelCalls++; throw new Error("no model request expected"); } });
  const reference = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "body-test" });
  const actions = bindActionClient(host.actionClient(reference), () => ({ actor_id: "owner", project_id: "body-test", audience: "user", permissions: PAGES_ACTION_PERMISSIONS }));
  const edge = await serveNativeHttp((request, response, url) => handlePagesNativePluginHttp(request, response, url, async () => {
    ownerEntries++; return { projectId: "body-test", actions };
  }));
  t.after(async () => { await edge.close(); await host.close(); await rm(home, { recursive: true, force: true }); });
  const saved = await edge.post("/api/pages", JSON.stringify({ title: "中文正文", markdown: "正文与来源" }));
  assert.equal(saved.status, 200);
  const before = (await actions.invoke(pagesActions.list, {})).documents;
  assert.equal(before.length, 1);
  const body = JSON.stringify({ title: "不能保存", markdown: "中".repeat(400_000) });
  assert.ok(body.length < 1_000_000 && Buffer.byteLength(body) > 1_000_000);
  const oversized = await edge.post("/api/pages", body);
  assert.deepEqual([oversized.status, oversized.body.code], [413, "actions.input_too_large"]);
  assert.equal(ownerEntries, 1, "the oversized request never enters even the ports factory");
  assert.deepEqual((await actions.invoke(pagesActions.list, {})).documents, before, "owner persistence is unchanged");
  assert.equal(modelCalls, 0);
  assert.equal((await edge.post("/api/pages", "{")).status, 400);
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
  const handled = handlePagesNativePluginHttp(request, response, new URL("http://127.0.0.1/api/pages"), async () => {
    entries++; throw new Error("the owner must not be reached");
  });
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
