import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createServer } from "node:http";
import { AsyncLocalStorage } from "node:async_hooks";
import { DEMO_PROJECT_ID as project } from "@molis-ai/molis-work-app-local-host";
import { ActionError, type ActionSubjectContext, type ActionSubjectRetention, type SearchEntriesPage } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginPrivateStorage } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingRouteActions } from "@molis-ai/molis-work-plugin-coding";
import { codingSdkRuntime } from "./fixtures/coding-sdk-runtime.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";
import { noEffect } from "./fixtures/coding-sessions.js";

type Fixture = Awaited<ReturnType<typeof codingSdkRuntime>>;
type Decision = NonNullable<ReturnType<Fixture["sessions"]["lifecycle"]["current"]>>["request"];
const path = (id: string) => `/sessions/${id}`;
const operation = (decision: Decision) => decision.mode === "local" ? decision.operation_id : decision.decision.operation_id;
/** Real Node Host HTTP requests, including any background requests; none are filtered from the count. */
async function loopbackModel(t: TestContext, text: string) {
  const requests: Array<{ method: string | undefined; path: string | undefined; body: unknown }> = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({ method: request.method, path: request.url, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
    if (request.method !== "POST" || request.url !== "/v1/messages") { response.writeHead(404).end(); return; }
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(await cogniaModelResponse(text).text());
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  return { endpoint: `http://127.0.0.1:${address.port}/v1/messages`, requests };
}
async function source(f: Fixture, id: string): Promise<ActionSubjectContext> {
  const result = await f.call(path(id) + "/subject");
  assert.equal(result?.status, 200, JSON.stringify(result?.body)); return result!.body as ActionSubjectContext;
}
async function retention(f: Fixture, id: string): Promise<ActionSubjectRetention> {
  const result = await f.call(path(id) + "/retention");
  assert.equal(result?.status, 200, JSON.stringify(result?.body)); return result!.body as ActionSubjectRetention;
}
async function preview(f: Fixture, id: string, archived: boolean): Promise<Decision> {
  const result = await f.call(path(id) + (archived ? "/archive-preview" : "/unarchive-preview"));
  assert.equal(result?.status, 200, JSON.stringify(result?.body));
  return (result!.body as { archive_decision: Decision; unarchive_decision: Decision })[archived ? "archive_decision" : "unarchive_decision"];
}
const apply = (f: Fixture, id: string, archived: boolean, decision: Decision) => archived
  ? f.call(path(id), { archive: true, archive_decision: decision }, "PATCH")
  : f.call(path(id) + "/unarchive", { unarchive_decision: decision });
async function restart(f: Fixture) {
  const install = f.platform.supervisor.state("io.molis.work.coding")!.install_id!;
  await f.platform.runtime.stop(install); await f.reopenSdk(); await f.platform.runtime.start(install);
}
async function complete(f: Fixture, id: string) {
  const result = await f.call(path(id) + "/runs", { task: "Explain this project.", intent: "discuss", workspace_id: "work", provider_id: "fixture", model_id: "fixture" });
  assert.equal(result?.status, 200, JSON.stringify(result?.body));
  for (const deadline = Date.now() + 15_000; f.sessions.get(project, id).state !== "done";) {
    assert.ok(Date.now() < deadline, "the real Coding follower must finish"); await new Promise(resolve => setTimeout(resolve, 10));
  }
}

test("Coding retention is body-free, reads no Run, and preserves the same frozen version and restore operation after restart/retry", async t => {
  const f = await codingSdkRuntime(t, { hostActions: true }); await f.create("local");
  const reads = t.mock.method(f.adapter, "read", async () => { throw new Error("retention must not read a Run"); });
  const sessions = t.mock.method(f.adapter, "readSession", async () => { throw new Error("local retention must not read a Runtime Session"); });
  const before = await source(f, "local");
  assert.deepEqual(await retention(f, "local"), { subject: before.subject, state: "active", retained: null });
  const archive = await preview(f, "local", true);
  assert.equal((await apply(f, "local", true, archive))?.status, 200);
  const frozen = { subject: before.subject, state: "temporarily_archived", retained: { content_revision: before.revision, restoration_operation_id: null } };
  assert.deepEqual(await retention(f, "local"), frozen);
  assert.equal((await f.call(path("local") + "/subject"))?.status, 404);
  assert.equal((await f.call(path("local")))?.status, 200, "explicit user history remains readable");
  assert.equal(reads.mock.callCount(), 0); assert.equal(sessions.mock.callCount(), 0);
  reads.mock.restore(); sessions.mock.restore(); await restart(f);
  assert.deepEqual(await retention(f, "local"), frozen);
  const restore = await preview(f, "local", false);
  assert.equal((await apply(f, "local", false, restore))?.status, 200);
  const restored = { subject: before.subject, state: "active", retained: { content_revision: before.revision, restoration_operation_id: operation(restore) } };
  assert.deepEqual(await retention(f, "local"), restored);
  assert.equal((await source(f, "local")).revision, before.revision, "archive timestamp and restore operation are not content");
  await restart(f);
  assert.equal((await apply(f, "local", false, restore))?.status, 200);
  assert.deepEqual(await retention(f, "local"), restored);
  assert.equal(f.sessions.lifecycle.current(project, "local")?.content_revision, before.revision);
});

test("Coding content/list revisions reflect title, intent and Goal facts while restoration retains the original content version", async t => {
  let storage!: PluginPrivateStorage;
  const f = await codingSdkRuntime(t, { hostActions: true, wrapCoding: definition => ({ ...definition, start: context => {
    storage = context.services!.storage!; return definition.start(context);
  } }) });
  await f.create("facts");
  const listRevision = async () => {
    const result = await f.call("/search/entries"); assert.equal(result?.status, 200);
    return (result!.body as SearchEntriesPage).entries.find(row => row.subject.id === "facts")!.revision;
  };
  const initial = await source(f, "facts"), listed = await listRevision();
  const renamed = await f.call(path("facts"), { title: "Changed title" }, "PATCH"); assert.equal(renamed?.status, 200);
  const named = await source(f, "facts");
  assert.notEqual(named.revision, initial.revision); assert.notEqual(await listRevision(), listed);
  assert.equal((await f.call(path("facts"), { configuration: { intent: "discuss", provider_id: "fixture", model_id: "fixture", workspace_id: "work" } }, "PATCH"))?.status, 200);
  assert.notEqual((await source(f, "facts")).revision, named.revision, "intent is content even without a Run");
  await f.sessions.setGoal(noEffect, project, "facts", "retention-goal", f.sessions.get(project, "facts").updated_at);
  storage.set("goal-title:retention-goal", "Original Goal title");
  const linked = await source(f, "facts"), linkedList = await listRevision();
  assert.match(linked.content, /Original Goal title/);
  assert.equal((await apply(f, "facts", true, await preview(f, "facts", true)))?.status, 200);
  storage.set("goal-title:retention-goal", "Updated Goal title"); await restart(f);
  assert.equal((await retention(f, "facts")).retained?.content_revision, linked.revision);
  assert.equal((await apply(f, "facts", false, await preview(f, "facts", false)))?.status, 200);
  const current = await source(f, "facts"); assert.match(current.content, /Updated Goal title/);
  assert.notEqual(current.revision, linked.revision); assert.notEqual(await listRevision(), linkedList);
  assert.equal((await retention(f, "facts")).retained?.content_revision, linked.revision, "restoration does not recompute the archived original");
});

test("Coding source hashes full already-read text past display cuts and rejects an in-flight read overtaken by archive", { timeout: 60_000 }, async t => {
  const model = await loopbackModel(t, "A".repeat(1300) + "original tail");
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), readingScope = new AsyncLocalStorage<boolean>(); let held = false;
  const f = await codingSdkRuntime(t, { hostActions: true, modelEndpoint: model.endpoint, wrapCoding: definition => ({ ...definition, start: context => {
    const actions = context.services!.actions!;
    return definition.start({ ...context, services: { ...context.services, actions: { ...actions, invoke: async (definition, input, control, transport) => {
      const result = await actions.invoke(definition, input, control, transport);
      // Hold the actual result after the Host Action released its project queue, before Coding consumes it.
      if (!held && definition.capability_id === agent.readRun.capability_id && readingScope.getStore() === true) {
        held = true; entered.resolve(); await release.promise;
      }
      return result;
    } } } });
  } }) });
  await f.create("text"); await complete(f, "text");
  const listReads = t.mock.method(f.adapter, "read", async () => { throw new Error("list must not read a Run"); });
  assert.equal((await f.call("/search/entries"))?.status, 200); assert.equal(listReads.mock.callCount(), 0); listReads.mock.restore();
  const before = await source(f, "text"), realRead = f.adapter.read.bind(f.adapter);
  const tail = t.mock.method(f.adapter, "read", async (...args) => {
    const run = structuredClone(await realRead(...args)), reply = [...run.turns].reverse().find(turn => turn.kind === "assistant");
    assert.ok(reply); reply.text += " changed beyond display"; return run;
  });
  const after = await source(f, "text"); assert.equal(after.content, before.content); assert.notEqual(after.revision, before.revision);
  tail.mock.restore();
  const reading = readingScope.run(true, () => f.call(path("text") + "/subject"));
  try {
    await Promise.race([entered.promise, reading.then(() => { throw new Error("source did not reach its Run read"); })]);
    assert.equal((await apply(f, "text", true, await preview(f, "text", true)))?.status, 200);
  } finally { release.resolve(); }
  assert.equal((await reading)?.status, 409);
  const readCount = t.mock.method(f.adapter, "read", async () => { throw new Error("retention must not read a Run"); });
  const sessionCount = t.mock.method(f.adapter, "readSession", async () => { throw new Error("retention must not read a Session"); });
  assert.equal((await retention(f, "text")).retained?.content_revision, before.revision);
  assert.equal(readCount.mock.callCount(), 0); assert.equal(sessionCount.mock.callCount(), 0);
  readCount.mock.restore(); sessionCount.mock.restore();
  assert.equal((await f.call(path("text")))?.status, 200);
  assert.equal(model.requests.length, 1);
});

test("Coding pending originals are unavailable to retention and ordinary source but exact retry and user history remain available", { timeout: 60_000 }, async t => {
  const model = await loopbackModel(t, "Completed before archive.");
  const f = await codingSdkRuntime(t, { hostActions: true, modelEndpoint: model.endpoint });
  await f.create("pending"); await complete(f, "pending");
  const originalSource = await source(f, "pending"), archive = await preview(f, "pending", true);
  const realArchive = f.adapter.sessionLifecycle!.archive.bind(f.adapter.sessionLifecycle);
  const fault = t.mock.method(f.adapter.sessionLifecycle!, "archive", async (...args) => { await realArchive(...args); throw new Error("lost archive receipt"); });
  assert.ok((await apply(f, "pending", true, archive))!.status >= 400);
  assert.equal(f.sessions.lifecycle.current(project, "pending")?.content_revision, originalSource.revision);
  assert.equal((await f.call(path("pending") + "/retention"))?.status, 409);
  assert.equal((await f.call(path("pending") + "/subject"))?.status, 409);
  assert.equal((await f.call(path("pending")))?.status, 200);
  fault.mock.restore(); await restart(f);
  assert.equal((await f.call(path("pending") + "/retention"))?.status, 409);
  const read = t.mock.method(f.adapter, "read", async () => { throw new Error("original retry must not read or recompute Run content"); });
  assert.equal((await apply(f, "pending", true, archive))?.status, 200);
  assert.equal((await retention(f, "pending")).retained?.content_revision, originalSource.revision);
  assert.equal(read.mock.callCount(), 0); assert.equal(model.requests.length, 1);
});

test("Coding authoritative row absence differs from denied, cancelled, foreign-owner and storage failure", async t => {
  let failRead = false, revokeAfterRead = false, allowed = true;
  const f = await codingSdkRuntime(t, { hostActions: true, wrapCoding: definition => ({ ...definition, start: context => {
    const database = context.services!.project_database!;
    return definition.start({ ...context, services: { ...context.services, project_database: { ...database, get(sql, parameters) {
      if (sql.startsWith("SELECT * FROM coding_sessions") && parameters?.[1] === "absent") {
        if (failRead) throw new Error("injected owner storage unavailable");
        if (revokeAfterRead) allowed = false;
      }
      return database.get(sql, parameters);
    } } } });
  } }) });
  assert.deepEqual(await retention(f, "absent"), { subject: { kind: "coding_session", id: "absent" }, state: "deleted", retained: null });
  const definition = codingRouteActions["coding.subject-retention"]!.definition;
  const caller = { actor_id: "web-user", project_id: project, audience: "user" as const, permissions: ["artifact:read", "storage:private"] };
  await assert.rejects(f.service.invoke({ ...caller, permissions: [] }, definition, { subject_id: "absent" }));
  await assert.rejects(f.service.invoke({ ...caller, actor_id: "other-user" }, definition, { subject_id: "absent" }), { code: "actions.owner_mismatch" });
  await assert.rejects(f.service.invoke({ ...caller, project_id: "other-project" }, definition, { subject_id: "absent" }));
  const current = () => { throw new ActionError("actions.forbidden", "authority revoked"); };
  const denied = await f.call(path("absent") + "/retention", undefined, "GET", { beforeEffect: async () => current(), assert_authority_current: current });
  assert.equal(denied?.status, 403);
  const authority = () => { if (!allowed) current(); };
  revokeAfterRead = true;
  assert.equal((await f.call(path("absent") + "/retention", undefined, "GET", { beforeEffect: async () => authority(), assert_authority_current: authority }))?.status, 403,
    "authority lost at the exact absence read is refused before returning deleted");
  revokeAfterRead = false; allowed = true; failRead = true;
  assert.ok((await f.call(path("absent") + "/retention"))!.status >= 400); failRead = false;
  const aborted = new AbortController(); aborted.abort();
  assert.notEqual((await f.call(path("absent") + "/retention", undefined, "GET", { signal: aborted.signal }))?.status, 200);
  // Stop the actual owner registration; absence must no longer be answered from any cached state.
  const install = f.platform.supervisor.state("io.molis.work.coding")!.install_id!; await f.platform.runtime.stop(install);
  await assert.rejects(f.service.invoke(caller, definition, { subject_id: "absent" }));
});
