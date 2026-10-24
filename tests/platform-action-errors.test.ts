import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineFragmentOffersAction, defineObjectMoveAction, defineSubjectContextAction, subjectContext } from "@molis-ai/molis-work-plugin-sdk";
import { searchActions } from "@molis-ai/molis-work-contracts/services/search";
import { recordedCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { openTestHome } from "./fixtures/test-home.js";

const command: ActionDefinition<Record<string, never>, null> = {
  capability_id: "example.platform.save", version: 1, operation: "command", action: {
    title: "Save", description: "A rejected write", kind: "operation", scope: "project", audiences: ["mcp"],
    permissions: [], subject_kinds: [], input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "null" },
  },
};

test("W3-02-G1-01 real gateway preserves owner kind and details and marks only the matching recorded failure", { timeout: 60_000 }, async t => {
  const { host, home, origin, controlToken, createProject, grant, mcp } = await openTestHome(t);
  const project = await createProject("Gateway errors");
  const details = { current_version: 3, call_id: "owner-data-only", code: "owner-data-only" };
  let failure: unknown = new ActionError("example.stale", "原资料已变化", { kind: "conflict", details });
  const writes: string[] = [];
  await host.withProject(project.reference, () => host.actionRegistry(project.reference).registerProvider({
    provider: { provider_id: "example-platform", title: "Example", kind: "plugin", plugin_id: "io.molis.work.example.platform" },
    definitions: [command], handlers: [{ ...command, handle: () => { if (failure) throw failure; writes.push("saved"); return null; } }],
  }));
  const clientId = "runtime:platform-errors";
  await grant(clientId, project.project_id, [command]);
  const { client, caller } = await mcp(clientId, project.project_id);
  const homeId = createHash("sha256").update(home).digest("hex");
  const send = (body: Record<string, unknown>) => fetch(origin + "/api/internal/action-service", { method: "POST", headers: {
    origin, "content-type": "application/json", "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID(),
  }, body: JSON.stringify({ home_id: homeId, client_id: clientId, project_id: project.project_id, ...body }) });
  const directory = await send({ operation: "discover" });
  const { instance_id } = await directory.json();
  const rawId = randomUUID();
  const denied = await send({ operation: "invoke", instance_id, call_id: rawId, capability: { capability_id: command.capability_id, version: 1 }, input: {} });
  assert.equal(denied.status, 409);
  assert.deepEqual(await denied.json(), { error: "原资料已变化", code: "example.stale", details, call_id: rawId });
  assert.equal(denied.headers.get("x-molis-work-call-id"), rawId);
  assert.equal(host.callLog!.find(rawId).length, 1);
  const forwardedId = randomUUID();
  await withCallId(forwardedId, async () => {
    await assert.rejects(client.invoke(caller, command, {}), (error: unknown) => {
      assert.ok(error instanceof ActionError);
      assert.deepEqual([error.code, error.message, error.kind, error.details], ["example.stale", "原资料已变化", "conflict", details]);
      return true;
    });
    assert.equal(recordedCallId(), forwardedId, "the matching Host row is marked before the client throws");
  });
  assert.equal(host.callLog!.find(forwardedId).length, 1);
  const doorId = randomUUID();
  const malformed = await send({ operation: "invoke", instance_id, call_id: doorId, capability: "not a reference", input: {} });
  assert.equal(malformed.status, 400);
  assert.equal(Object.hasOwn(await malformed.json(), "call_id"), false);
  assert.equal(malformed.headers.get("x-molis-work-call-id"), null);
  assert.deepEqual(host.callLog!.find(doorId), []);
  failure = Object.assign(new Error("存储读取失败"), { code: "EIO", details: { private_driver: "not owner data" } });
  const internal = await send({ operation: "invoke", instance_id, call_id: randomUUID(), capability: { capability_id: command.capability_id, version: 1 }, input: {} });
  assert.equal(internal.status, 500);
  const internalBody = await internal.json();
  assert.deepEqual([internalBody.error, internalBody.code], ["存储读取失败", "actions.execution_failed"]);
  assert.equal(Object.hasOwn(internalBody, "details"), false);
  assert.deepEqual(writes, [], "no refused gateway call writes business data");
});

test("W3-02-G1-03/04 real platform routes reject JSON and UTF-8 byte overflow before any action or diagnostic row", { timeout: 60_000 }, async t => {
  const { host, origin, controlToken, createProject } = await openTestHome(t);
  const project = await createProject("Platform body limits");
  await host.withProject(project.reference, () => undefined);
  const prefix = `/projects/${project.project_id}`;
  const post = (path: string, body: string) => fetch(origin + prefix + path, { method: "POST", headers: {
    origin, "content-type": "application/json", "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID(),
  }, body });
  const text = JSON.stringify({ pane_id: "body-limit", padding: "中".repeat(85_320) });
  const atLimit = text + " ".repeat(256_000 - Buffer.byteLength(text, "utf8"));
  const aboveLimit = atLimit + "中";
  assert.ok(aboveLimit.length < 256_000, "the rejected input is below the limit in JavaScript characters");
  const rows = host.callLog!.recent(1000);
  for (const path of ["/api/home/dock-judgment", "/api/search/query", "/api/placement/move", "/api/contextual/cancel"]) {
    const malformed = await post(path, "{");
    assert.equal(malformed.status, 400, path);
    assert.deepEqual(await malformed.json(), { error: "请求不是有效 JSON", code: "actions.input_invalid" });
    const large = await post(path, aboveLimit);
    assert.equal(large.status, 413, path);
    assert.deepEqual(await large.json(), { error: "请求内容过大", code: "actions.input_too_large" });
    assert.equal(malformed.headers.get("x-molis-work-call-id"), null);
    assert.equal(large.headers.get("x-molis-work-call-id"), null);
  }
  assert.deepEqual(host.callLog!.recent(1000), rows, "reader refusals cannot execute an action, write its facts or manufacture a recorded number");
  const accepted = await post("/api/contextual/cancel", atLimit);
  assert.equal(accepted.status, 200, "exactly 256000 UTF-8 bytes still reaches the original cancel operation");
  assert.deepEqual(await accepted.json(), { ok: true });
  const empty = await post("/api/home/dock-judgment", "");
  assert.equal(empty.status, 400);
  assert.deepEqual(await empty.json(), { error: "请选择已发布函数，或留空", code: "actions.input_invalid" }, "empty input still decodes to an object before owner validation");
  for (const path of ["/api/search/query", "/api/placement/move", "/api/contextual/cancel"]) {
    const method = await fetch(origin + prefix + path);
    assert.equal(method.status, 405);
    assert.deepEqual(await method.json(), { error: "请求方法不受支持" });
  }
});

test("W3-02-G1-03 real Home, Placement and Contextual routes preserve owner details, trusted recorded numbers and unknown failure messages", { timeout: 60_000 }, async t => {
  const { host, origin, controlToken, createProject } = await openTestHome(t);
  const project = await createProject("Platform owner failures"), target = await createProject("Move target");
  const reader = defineSubjectContextAction("example.platform.subject", "example_note", "Example note", []);
  const mover = defineObjectMoveAction("example.platform.move", ["example_note"], "Example note", []);
  const write: ActionDefinition<{ id: string }, null> = { ...command, capability_id: "example.platform.write", action: {
    ...command.action, audiences: ["user"], subject_kinds: ["example_note"], input_schema: {
      type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false,
    },
  } };
  const offers = defineFragmentOffersAction("example.platform.fragment", ["example_note"], "Example note", [], [{
    offer_id: "check", title: "检查", intent: "understand", apply: "result", hint: "检查这段内容", granularities: ["range"],
    action: { capability_id: write.capability_id, version: 1 },
  }]);
  const note = { id: "note-1", project_id: project.project_id, body: "原有正文" };
  const details = { current_version: 4, call_id: "owner-data-only", code: "owner-data-only" };
  let failure: unknown = new ActionError("example.stale", "原资料已变化", { kind: "conflict", details });
  const writes: string[] = [];
  await host.withProject(project.reference, () => host.actionRegistry(project.reference).registerProvider({
    provider: { provider_id: "example-platform", title: "Example", kind: "plugin", plugin_id: "io.molis.work.example.platform", project_id: project.project_id },
    definitions: [reader, mover, offers, write], handlers: [
      { ...reader, handle: () => { return subjectContext({ subject: { kind: "example_note", id: note.id },
        revision: "1", title: "Example note", content: note.body, project_id: note.project_id, goal_ids: [] }); } },
      { ...mover, handle: () => { if (failure) throw failure; writes.push("moved"); return { subject: { kind: "example_note", id: note.id }, project_id: target.project_id, revision: "2" }; } },
      { ...offers, handle: () => { throw failure; } },
      { ...write, handle: () => { writes.push("written"); return null; } },
    ],
  }));
  const post = (path: string, body: unknown) => fetch(`${origin}/projects/${project.project_id}${path}`, { method: "POST", headers: {
    origin, "content-type": "application/json", "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID(),
  }, body: JSON.stringify(body) });
  const focus = { context_id: "g1-note", plugin_id: "io.molis.work.example.platform", activity: "selecting", granularity: "range",
    object: { kind: "example_note", id: note.id }, targets: [{ kind: "text_range", text: note.body }] };
  const candidates = await post("/api/contextual/candidates", { pane_id: "g1-note", focus });
  assert.equal(candidates.status, 200);
  const { plan } = await candidates.json();
  const offered = plan.candidates.find((item: { offer_id: string }) => item.offer_id === "check");
  assert.ok(offered, "the actual directory offers the declared fragment choice");
  const paths = [
    ["/api/placement/move", { object: { kind: "example_note", id: note.id, project_id: project.project_id }, to_project_id: target.project_id }],
    ["/api/contextual/prepare", { pane_id: "g1-note", focus, key: offered.key, request_id: "g1-prepare" }],
  ] as const;
  for (const [path, body] of paths) {
    const refused = await post(path, body), answer = await refused.json();
    assert.equal(refused.status, 409, `${path}: ${JSON.stringify(answer)}`);
    assert.deepEqual({ error: answer.error, code: answer.code, details: answer.details }, { error: "原资料已变化", code: "example.stale", details });
    assert.equal(answer.call_id, refused.headers.get("x-molis-work-call-id"));
    assert.notEqual(answer.call_id, details.call_id);
    assert.ok(host.callLog!.find(answer.call_id).some(row => row.code === "example.stale"), "only the Host's recorded number appears at the top");
  }
  failure = Object.assign(new Error("存储暂时读不到"), { code: "EIO", details: { driver: "private" } });
  for (const [path, body] of paths) {
    const refused = await post(path, body), answer = await refused.json();
    assert.equal(refused.status, 500, `${path}: ${JSON.stringify(answer)}`);
    assert.deepEqual([answer.error, answer.code], ["存储暂时读不到", "actions.execution_failed"]);
    assert.equal(Object.hasOwn(answer, "details"), false);
  }
  const same = await post("/api/placement/move", { object: { kind: "example_note", id: note.id, project_id: project.project_id }, to_project_id: project.project_id });
  assert.equal(same.status, 400, "the existing same_location classification is invalid, including through HTTP");
  const sameBody = await same.json();
  assert.deepEqual([sameBody.code, sameBody.error], ["placement.same_location", "它已经在这个位置"]);
  assert.deepEqual(writes, [], "a failed prepare or move never executes a write or a prepared action");
  assert.equal(note.body, "原有正文");
  const described = await post("/api/placement/describe", { object: { kind: "example_note", id: note.id, project_id: project.project_id } });
  assert.equal(described.status, 200, "a readable object's normal business result remains successful");
  assert.equal((await described.json()).location.project_id, project.project_id, "a failed mover has not changed the object's placement");
});

test("W3-02-G1-03 Search and Contextual HTTP preserve real Host refusals and unknown directory failures", { timeout: 60_000 }, async t => {
  let directoryFailure: Error | undefined;
  const { host, origin, controlToken, createProject } = await openTestHome(t, { host: {
    actionAvailability: (_caller, view) => {
      if (view.capability_id !== searchActions.query.capability_id) return { available: true };
      if (directoryFailure) throw directoryFailure;
      return { available: false, code: "actions.scope_mismatch", reason: "搜索缺少当前项目运行环境", kind: "forbidden" };
    },
  } });
  const project = await createProject("Search refused scope");
  const search = () => fetch(`${origin}/projects/${project.project_id}/api/search/query`, { method: "POST", headers: {
    origin, "content-type": "application/json", "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID(),
  }, body: JSON.stringify({ query: "正文" }) });
  const response = await search();
  assert.equal(response.status, 403);
  const answer = await response.json();
  assert.deepEqual([answer.error, answer.code], ["搜索缺少当前项目运行环境", "actions.scope_mismatch"]);
  assert.equal(answer.call_id, response.headers.get("x-molis-work-call-id"));
  assert.ok(host.callLog!.find(answer.call_id).some(row => row.code === "actions.scope_mismatch"));
  directoryFailure = new Error("目录读取失败");
  const failedSearch = await search(), failedBody = await failedSearch.json();
  assert.equal(failedSearch.status, 500);
  assert.deepEqual([failedBody.code, failedBody.error], ["actions.execution_failed", "目录读取失败"]);
  const rows = host.callLog!.recent(1000);
  const surfaces = await fetch(`${origin}/projects/${project.project_id}/api/contextual/surfaces`);
  assert.equal(surfaces.status, 500);
  assert.deepEqual(await surfaces.json(), { code: "actions.execution_failed", error: "目录读取失败" });
  assert.equal(surfaces.headers.get("x-molis-work-call-id"), null);
  assert.deepEqual(host.callLog!.recent(1000), rows, "directory discovery does not claim an action row");
});
