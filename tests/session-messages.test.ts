import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { ActionError, bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost, molisWorkHostProjectReference, seedDemoBoard, DEMO_BOARD_ID, openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
import { SessionMessageService, workActions, WORK_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-work";
import type { RuntimeSessionTransport } from "@molis-ai/molis-work-contracts/services/runtime-host";

const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };

test("Session message actions deduplicate concurrent callers, keep private scope, and persist the actual receipt before revocation", { timeout: 45_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "session-message-actions-"));
  const databasePath = join(home, "project.db"); seedDemoBoard(databasePath);
  const reference = molisWorkHostProjectReference({ databasePath, boardId: DEMO_BOARD_ID, projectId: "message-project" });
  const started = deferred<void>(), response = deferred<unknown>();
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  let revoked = false;
  const host = new MolisWorkLocalHost({ homeDirectory: home, runtimeSessionTransport: {
    async request(method, params) { calls.push({ method, params }); started.resolve(); return response.promise; }, subscribe() { return () => undefined; },
  } });
  const caller = { actor_id: "owner", project_id: reference.project_id, audience: "user" as const, permissions: WORK_ACTION_PERMISSIONS,
    validate_authority: async () => { if (revoked) throw new ActionError("actions.forbidden", "grant revoked"); } };
  const actions = bindActionClient(host.actionClient(reference), () => caller);
  try {
    const owner = await host.sessionResources();
    const session = owner.registry.explicitlyLinkSession({ runtime_id: "codex", native_runtime_session_id: "chosen-thread", project_id: reference.project_id, current_goal_id: "chosen-goal", actor_id: "owner", user_confirmed: true });
    const input = { session_id: session.session_id, expected_goal_id: "chosen-goal", idempotency_key: "user-submit-1", text: "  保留用户原文\n第二行  ", context: { kind: "feed_item", id: "source-1", content: "所选材料的明确上下文" } };
    await assert.rejects(actions.invoke(workActions.messageSend, { ...input, expected_goal_id: "wrong-goal" }), { code: "session.message_target_changed" });
    const pending = actions.invoke(workActions.messageSend, input); await started.promise;
    const duplicate = await actions.invoke(workActions.messageSend, input);
    assert.equal(duplicate.state, "uncertain"); assert.equal(duplicate.attempt_count, 1); assert.equal(calls.length, 1);
    assert.equal(owner.registry.eventCount(session.session_id), 0, "unconfirmed delivery is not a sent timeline message");
    assert.deepEqual(calls[0], { method: "turn/start", params: { threadId: "chosen-thread", input: [{ type: "text", text: "所选材料的明确上下文\n\n用户消息：\n  保留用户原文\n第二行  ", text_elements: [] }], turnTrigger: "molis_work_message" } });
    await assert.rejects(actions.invoke(workActions.messageSend, { ...input, text: "changed" }), { code: "session.message_conflict" });
    const stranger = bindActionClient(host.actionClient(reference), () => ({ ...caller, actor_id: "stranger" }));
    await assert.rejects(stranger.invoke(workActions.messageRead, { request_id: duplicate.request_id }), { code: "session.message_not_found" });
    revoked = true; response.resolve({ turn: { id: "turn-accepted" } });
    await assert.rejects(pending, { code: "actions.forbidden" });
    assert.equal(owner.registry.messages.get(duplicate.request_id).state, "accepted", "real acceptance survives response-time revocation");
    assert.equal(owner.registry.eventCount(session.session_id), 1);
    revoked = false;
    const replay = await actions.invoke(workActions.messageSend, input);
    assert.equal(replay.native_turn_id, "turn-accepted"); assert.equal(calls.length, 1);
    assert.equal((await actions.invoke(workActions.messageRetry, { request_id: replay.request_id })).state, "accepted");
    assert.equal(calls.length, 1);
    const foreign = owner.registry.createSession({ runtime_id: "codex", project_id: "foreign", native_runtime_session_id: "foreign-thread", actor_id: "owner", user_confirmed: true });
    await assert.rejects(actions.invoke(workActions.messageSend, { ...input, session_id: foreign.session_id, idempotency_key: "foreign" }), { code: "sessions.not_found" });
    assert.equal(calls.length, 1);
    const persisted = await readFile(owner.registry.databasePath); assert.ok(!persisted.includes(Buffer.from(input.text)));
  } finally { response.resolve({ turn: { id: "cleanup" } }); await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("only definite rejections are retried; unknown delivery survives restart and reopening cannot reset an in-flight request", async () => {
  const home = await mkdtemp(join(tmpdir(), "session-message-recovery-"));
  const caller = { actor_id: "owner", project_id: "project" };
  let count = 0, behavior: "reject" | "accept" | "unknown" | "missing" = "reject";
  const transport: RuntimeSessionTransport = { async request(method) {
    assert.equal(method, "turn/start"); count++;
    if (behavior === "reject") throw Object.assign(new Error("private rejection detail"), { deliveryAccepted: false, retryable: true });
    if (behavior === "unknown") throw new Error("connection lost");
    return behavior === "missing" ? {} : { turn: { id: `turn-${count}` } };
  }, subscribe() { return () => undefined; } };
  let host = new MolisWorkLocalHost({ homeDirectory: home, runtimeSessionTransport: transport });
  const auth = async () => undefined;
  try {
    let resources = await host.sessionResources();
    const session = resources.registry.createSession({ runtime_id: "codex", project_id: caller.project_id, native_runtime_session_id: "thread", actor_id: caller.actor_id, user_confirmed: true });
    const input = { ...caller, session_id: session.session_id, expected_goal_id: null, idempotency_key: "request-1", text: "A durable message" };
    const failed = await resources.messages.send(input, auth); assert.equal(failed.state, "failed"); assert.equal(count, 1);
    assert.equal((await resources.messages.send(input, auth)).state, "failed"); assert.equal(count, 1, "ordinary replay never implicitly retries");
    behavior = "accept";
    const accepted = await resources.messages.retry(failed.request_id, caller, auth); assert.equal(accepted.state, "accepted"); assert.equal(accepted.attempt_count, 2);
    assert.equal(resources.registry.eventCount(session.session_id), 1);
    behavior = "unknown";
    const unknown = await resources.messages.send({ ...input, idempotency_key: "request-2" }, auth); assert.equal(unknown.state, "uncertain");
    const before = count; await host.close();
    host = new MolisWorkLocalHost({ homeDirectory: home, runtimeSessionTransport: transport }); resources = await host.sessionResources();
    assert.equal(resources.messages.read(unknown.request_id, caller).state, "uncertain");
    assert.equal((await resources.messages.retry(unknown.request_id, caller, auth)).state, "uncertain"); assert.equal(count, before);
    assert.equal((await resources.messages.send({ ...input, idempotency_key: "request-2" }, auth)).state, "uncertain"); assert.equal(count, before);
    behavior = "missing";
    const missing = await resources.messages.send({ ...input, idempotency_key: "missing-receipt" }, auth); assert.equal(missing.state, "uncertain");
    assert.equal(resources.registry.eventCount(session.session_id), 1);
    behavior = "reject";
    const changed = await resources.messages.send({ ...input, idempotency_key: "changed-target" }, auth);
    resources.registry.updateAssociations({ session_id: session.session_id, current_goal_id: "new-goal", actor_id: caller.actor_id, user_confirmed: true });
    await assert.rejects(resources.messages.retry(changed.request_id, caller, auth), { code: "session.message_target_changed" });
    const staged = resources.registry.messages.prepare({ ...input, expected_goal_id: "new-goal", idempotency_key: "crash-window" });
    const claim = resources.registry.messages.claim(staged.request_id, false); assert.equal(claim.claimed, true);
    const other = await openWorkSessionRegistry({ homeDirectory: home });
    try {
      assert.equal(other.messages.claim(staged.request_id, false).claimed, false);
      assert.equal(other.messages.get(staged.request_id).state, "uncertain");
      resources.registry.messages.finish(staged.request_id, claim.record.attempt_count, { state: "accepted", native_turn_id: "late-receipt" });
      assert.equal(other.messages.get(staged.request_id).state, "accepted");
    } finally { other.close(); }
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("v5 Session storage upgrades without replacing sessions, encrypted history or associations", async () => {
  const home = await mkdtemp(join(tmpdir(), "session-message-migration-"));
  let registry = await openWorkSessionRegistry({ homeDirectory: home });
  const session = registry.createSession({ runtime_id: "codex", project_id: "project", current_goal_id: "goal", native_runtime_session_id: "thread", actor_id: "owner", user_confirmed: true });
  registry.appendEvent({ session_id: session.session_id, source: "molis_work", source_id: "old-event", kind: "user_message", content: "retained history" });
  const databasePath = registry.databasePath; registry.close();
  const db = new Database(databasePath); db.exec("DROP TABLE session_messages; UPDATE session_meta SET value = '5' WHERE key = 'schema_version'"); db.close();
  try {
    registry = await openWorkSessionRegistry({ homeDirectory: home });
    assert.equal(registry.get(session.session_id).current_goal_id, "goal");
    assert.equal(registry.events(session.session_id)[0]!.content, "retained history");
    const request = registry.messages.prepare({ session_id: session.session_id, actor_id: "owner", project_id: "project", expected_goal_id: "goal", idempotency_key: "new", text: "new message" });
    assert.equal(request.state, "pending"); assert.equal(registry.eventCount(session.session_id), 1);
    const service = new SessionMessageService(registry, registry.messages, { capabilities: () => ({ create: "unsupported", list: "unsupported", discover: "unsupported", read: "unsupported", resume: "unsupported", events: "unsupported", handoff: "unsupported", message: "unsupported" }), invoke: async () => { throw new Error("must not invoke"); } });
    await assert.rejects(service.send({ session_id: session.session_id, actor_id: "owner", project_id: "project", expected_goal_id: "goal", idempotency_key: "new", text: "new message" }, async () => undefined), { code: "session.message_unavailable" });
  } finally { registry.close(); await rm(home, { recursive: true, force: true }); }
});

test("receipt commit failure rolls back its timeline event and leaves an uncertain request that cannot be replayed", async () => {
  const home = await mkdtemp(join(tmpdir(), "session-message-atomic-"));
  let calls = 0;
  const host = new MolisWorkLocalHost({ homeDirectory: home, runtimeSessionTransport: {
    async request() { calls++; return { turn: { id: "accepted-before-local-failure" } }; }, subscribe() { return () => undefined; },
  } });
  try {
    const resources = await host.sessionResources();
    const session = resources.registry.createSession({ runtime_id: "codex", project_id: "project", native_runtime_session_id: "thread", actor_id: "owner", user_confirmed: true });
    const input = { actor_id: "owner", project_id: "project", session_id: session.session_id, expected_goal_id: null, idempotency_key: "request", text: "acknowledged but local commit fails" };
    const db = new Database(resources.registry.databasePath);
    try {
      db.exec("CREATE TRIGGER reject_message_receipt BEFORE UPDATE ON session_messages WHEN NEW.state = 'accepted' BEGIN SELECT RAISE(ABORT, 'receipt storage failure'); END;");
      await assert.rejects(resources.messages.send(input, async () => undefined), /receipt storage failure/);
      assert.equal(resources.registry.eventCount(session.session_id), 0, "timeline append must roll back with the failed receipt");
      const record = resources.registry.messages.prepare(input); assert.equal(record.state, "uncertain");
      db.exec("DROP TRIGGER reject_message_receipt");
      assert.equal((await resources.messages.send(input, async () => undefined)).state, "uncertain"); assert.equal(calls, 1);
    } finally { db.close(); }
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});
