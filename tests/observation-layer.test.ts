import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { OBSERVATION_LIMITS } from "@molis-ai/molis-work-contracts/services/observation";
import {
  ObservationLayer, observationKeys, readCoverage, readCoverageGaps, readRecords, snapshotText, withObservationSource,
  type ExitAction, type ExitObservation, type ObservationEnvironment,
} from "@molis-ai/molis-work-service-observation";

/** An in-memory secret store: the layer only asks for `get` and `createIfAbsent`. */
function memorySecrets() {
  const values = new Map<string, string>();
  return { values, get: (key: string) => values.get(key) ?? null, createIfAbsent: (key: string, value: string) => { if (values.has(key)) return false; values.set(key, value); return true; } };
}

function fixture(t: test.TestContext, options: { demo?: string[]; now?: () => Date } = {}) {
  const home = mkdtempSync(join(tmpdir(), "observation-layer-"));
  const secrets = memorySecrets(), projects = new Set(["p1", "p2", ...(options.demo ?? [])]);
  const env: ObservationEnvironment = { platformVersion: "0.test", now: options.now ?? (() => new Date()),
    projectClass: id => projects.has(id) ? (options.demo?.includes(id) ? "regenerable_demo" : "user") : undefined };
  const open = () => new ObservationLayer({ home, env, keys: has => observationKeys(secrets, has), flushDelayMs: 5 });
  let layer = open();
  t.after(() => { layer.close(); rmSync(home, { recursive: true, force: true }); });
  const db = () => layer.writer.database()!.db;
  return { home, secrets, projects, env, get layer() { return layer; }, reopen: () => { layer.close(); layer = open(); return layer; }, db,
    records: (filter?: Parameters<typeof readRecords>[1]) => { layer.flush(); return readRecords(db(), filter); } };
}

const person = (extra: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: "local-person", actor_kind: "user", project_id: "p1", audience: "user", permissions: [], call_id: "call-1", ...extra });
const agent = (extra: Partial<ActionCallContext> = {}): ActionCallContext => person({ actor_id: "agent-1", actor_kind: "runtime", audience: "agent", runtime_session_id: "rs-1", ...extra });
/** A plugin's Host-issued caller, as the platform gives it to a system action. */
const pluginCaller = (plugin_id: string, install_id: string): ActionCallContext => person({ audience: "plugin", actor_kind: "runtime",
  host_plugin: { plugin_id, install_id, actor_id: "x", project_id: "p1", declaration: { manifest: {} as never }, assertActive: () => {} } });
/** Runs the report handler as the dispatcher would; it answers synchronously, from the queue. */
const reporter = (layer: ObservationLayer, shellEntry: (caller: ActionCallContext) => void = () => {}) => {
  const { handler } = layer.reportAction(shellEntry);
  return (caller: ActionCallContext, facts: readonly unknown[]): unknown => {
    const result = handler.handle({ ...caller, beforeEffect: async () => {} }, { facts });
    assert.ok(!(result instanceof Promise));
    return result;
  };
};
const read: ExitAction = { capability_id: "notes.list", version: 1, provider_id: "notes-install", operation: "query" };
const write: ExitAction = { capability_id: "notes.create", version: 1, provider_id: "notes-install", operation: "command" };
const done = (input: unknown, result: unknown, extra: Partial<ExitObservation> = {}): ExitObservation =>
  ({ invocation_id: `inv-${Math.random()}`, started_at: Date.now() - 5, ended_at: Date.now(), handler_started: true, input, result, outcome: { ok: true }, aborted: false, ...extra });

test("OCL-11: a call refused before its handler keeps only who, what and the code; a failure once the handler began keeps no content (S-12, S-18)", t => {
  const f = fixture(t);
  f.layer.observed(agent(), write, { invocation_id: "a", started_at: 1, ended_at: 2, handler_started: false, outcome: { ok: false, code: "actions.forbidden", refused: true }, aborted: false });
  f.layer.observed(agent(), write, done({ title: "secret plan" }, undefined, { outcome: { ok: false, code: "actions.forbidden" } }));
  f.layer.observed(agent(), write, done({ title: "secret plan" }, undefined, { outcome: { ok: false, code: "notes.busy" }, aborted: true }));
  const [refused, failed, cancelled] = f.records({ fact: "action.call" });
  assert.equal(refused!.outcome, "refused");
  assert.deepEqual(refused!.evidence, [{ role: "input", ref: { kind: "missing", reason: "by_rule" } }]);
  assert.equal(refused!.detail.duration_ms, undefined);
  assert.equal(failed!.outcome, "failed");
  assert.equal(cancelled!.outcome, "cancelled");
  for (const record of [failed!, cancelled!]) {
    assert.ok(record.evidence.every(item => item.ref.kind === "missing" && item.ref.reason === "by_rule"));
    assert.equal(typeof record.detail.duration_ms, "number");
  }
  assert.ok(!JSON.stringify(f.records()).includes("secret plan"));
  assert.equal(f.db().prepare("SELECT COUNT(*) AS n FROM evidence_blobs").get()!.n, 0);
});

test("OCL-05: a successful command keeps its input and result, sealed and compressed; the digest is keyed, not a plain sha256", t => {
  const f = fixture(t);
  f.layer.observed(agent(), write, done({ title: "季度计划正文" }, { id: "n1" }));
  const [record] = f.records({ fact: "action.call" });
  const input = record!.evidence.find(item => item.role === "input")!.ref;
  assert.equal(input.kind, "snapshot");
  if (input.kind !== "snapshot") return;
  assert.equal(snapshotText(f.db(), f.layer.writer.database()!.keys, input.digest), JSON.stringify({ title: "季度计划正文" }));
  assert.notEqual(input.digest, createHash("sha256").update(JSON.stringify({ title: "季度计划正文" })).digest("hex"));
  const body = (f.db().prepare("SELECT body FROM evidence_blobs WHERE digest = ?").get(input.digest) as { body: Uint8Array }).body;
  assert.ok(!Buffer.from(body).toString("latin1").includes("title"), "the stored body is not plain text");
  assert.equal(record!.work.call_id, "call-1");
  assert.equal(record!.work.runtime_session_id, "rs-1");
  assert.equal(record!.entry, "agent");
});

test("OCL-06: a person's page read keeps the result's digest only, by rule, and the register counts it; an Agent's read keeps both", t => {
  const f = fixture(t);
  f.layer.observed(person(), read, done({ q: 1 }, { items: ["a"] }));
  f.layer.observed(agent(), read, done({ q: 1 }, { items: ["a"] }));
  const [page, model] = f.records({ fact: "action.call" });
  const result = page!.evidence.find(item => item.role === "result")!.ref;
  assert.deepEqual({ kind: result.kind, reason: result.kind === "missing" ? result.reason : undefined }, { kind: "missing", reason: "by_rule" });
  assert.ok(result.kind === "missing" && typeof result.digest === "string" && typeof result.bytes === "number");
  assert.equal(model!.evidence.find(item => item.role === "result")!.ref.kind, "snapshot");
  const workbench = readCoverage(f.db()).find(row => row.fact === "action.call" && row.entry === "workbench")!;
  assert.equal(workbench.by_rule, 1);
});

test("OCL-10: the same read by the same work within a minute folds into one record; another operation's read does not", t => {
  const f = fixture(t);
  for (let i = 0; i < 3; i++) f.layer.observed(agent(), read, done({ q: 1 }, { items: ["a"] }));
  f.layer.observed(agent({ call_id: "call-2" }), read, done({ q: 1 }, { items: ["a"] }));
  f.layer.observed(agent(), read, done({ q: 1 }, { items: ["b"] }));
  const records = f.records({ fact: "action.call" });
  assert.equal(records.length, 3);
  assert.equal(records[0]!.coalesced?.count, 3);
  assert.equal(records[1]!.coalesced, undefined);
});

test("OCL-11: credential shapes are redacted before a snapshot is kept, and the snapshot says so", t => {
  const f = fixture(t);
  f.layer.observed(agent(), write, done({ header: "authorization: Bearer abc.def" }, { ok: true }));
  const input = f.records()[0]!.evidence.find(item => item.role === "input")!.ref;
  assert.ok(input.kind === "snapshot" && input.redacted === true);
  assert.ok(!snapshotText(f.db(), f.layer.writer.database()!.keys, input.digest)!.includes("abc.def"));
  assert.equal(readCoverage(f.db())[0]!.redacted, 1);
});

test("OCL-09: a snapshot over the size limit keeps its digest and length, and counts as a truncation", t => {
  const f = fixture(t);
  f.layer.observed(agent(), write, done({ body: "x".repeat(OBSERVATION_LIMITS.snapshot_bytes + 10) }, { ok: true }));
  const input = f.records()[0]!.evidence.find(item => item.role === "input")!.ref;
  assert.ok(input.kind === "missing" && input.reason === "truncated" && input.bytes! > OBSERVATION_LIMITS.snapshot_bytes);
  assert.equal(readCoverage(f.db())[0]!.truncated, 1);
});

test("OCL-13: a demonstration project's records are demo, a source scope classes its work, and the scope closes when its run ends", async t => {
  const f = fixture(t, { demo: ["demo-1"] });
  f.layer.observed(agent({ project_id: "demo-1" }), write, done({}, {}));
  let later: (() => void) | undefined;
  await withObservationSource("first_read", async () => {
    f.layer.observed(agent({ call_id: "sync" }), write, done({ n: 1 }, {}));
    later = () => f.layer.observed(agent({ call_id: "timer" }), write, done({ n: 2 }, {}));
  });
  await new Promise<void>(resolve => setTimeout(() => { later!(); resolve(); }, 0));
  const classes = f.records().map(record => [record.work.call_id, record.source_class]);
  assert.deepEqual(classes, [["call-1", "demo"], ["sync", "first_read"], ["timer", "real"]]);
});

test("OCL-11: only the shell through its door and plugins under their own prefix may report", t => {
  const f = fixture(t);
  // The door knows the request by the frozen entry credential it issued (`webEntryDoor`), not by the caller object.
  const door = new WeakSet<object>();
  const call = reporter(f.layer, caller => { if (!caller.user_action || !door.has(caller.user_action)) throw new ActionError("actions.forbidden", "不是界面阶段路由"); });
  const handwritten = person({ user_action: Object.freeze({ source: "web", conversation_ref: "c", message_ref: "m" }) });
  assert.throws(() => call(handwritten, [{ fact: "ui.stage", outcome: "succeeded" }]), /不是界面/u);
  const issued = Object.freeze({ source: "web", conversation_ref: "c", message_ref: "m" });
  door.add(issued);
  const shell = person({ user_action: issued });
  assert.deepEqual(call(shell, [{ fact: "ui.stage", outcome: "succeeded" }, { fact: "notes.made_up", outcome: "succeeded" }]),
    { accepted: 1, rejected: [{ index: 1, code: "observation.fact_not_owned" }] });
  const plugin = pluginCaller("notes", "notes-install");
  assert.deepEqual(call(plugin, [{ fact: "notes.saved", outcome: "succeeded" }, { fact: "ui.stage", outcome: "succeeded" }]),
    { accepted: 1, rejected: [{ index: 1, code: "observation.fact_not_owned" }] });
  assert.throws(() => call(agent(), [{ fact: "agent.x", outcome: "succeeded" }]), /observation\.reporter_unknown|只有/u);
  const owners = f.records().map(record => record.owner);
  assert.deepEqual(owners, [{ kind: "shell" }, { kind: "plugin", id: "notes" }]);
});

test("OCL-15: a reporter's day quota holds across a restart, and the overflow is one stretch for the reporter, not per fact name", t => {
  const f = fixture(t);
  const plugin = pluginCaller("spam", "spam-install");
  const facts = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => ({ fact: `spam.f${i + offset}`, outcome: "succeeded" }));
  let call = reporter(f.layer);
  for (let sent = 0; sent < OBSERVATION_LIMITS.facts_per_reporter_day; sent += OBSERVATION_LIMITS.facts_per_report) call(plugin, facts(OBSERVATION_LIMITS.facts_per_report, sent));
  f.layer.flush();
  call = reporter(f.reopen());
  for (let i = 0; i < 3; i++) assert.throws(() => call(plugin, facts(2, i * 2)), /observation\.report_quota_exceeded|上限/u);
  f.layer.flush();
  const gaps = readCoverageGaps(f.db()).filter(gap => gap.reason === "report_quota");
  assert.equal(gaps.length, 1);
  assert.deepEqual([gaps[0]!.owner, gaps[0]!.fact, gaps[0]!.count], ["plugin:spam", "observation.report", 6]);
  assert.ok(!readCoverage(f.db()).some(row => row.fact === "spam.f20000"));
});

test("OCL-15: a report over 1 MiB of content is turned down whole", t => {
  const f = fixture(t);
  const plugin = pluginCaller("notes", "i");
  const big = { fact: "notes.x", outcome: "succeeded", evidence: [{ role: "body", ref: { kind: "content", media_type: "text/plain", text: "y".repeat(OBSERVATION_LIMITS.report_content_bytes + 1) } }] };
  assert.throws(() => reporter(f.layer)(plugin, [big]), /observation\.report_too_large|1 MiB/u);
  assert.equal(f.records().length, 0);
});

test("OCL-12: deleting a project drops its waiting and kept records, collects their bodies, and turns its later writes away", t => {
  const f = fixture(t);
  f.layer.observed(agent({ project_id: "p2" }), write, done({ only: "p2" }, {}));
  f.layer.flush();
  f.layer.observed(agent({ project_id: "p2" }), write, done({ waiting: "p2" }, {}));
  f.layer.observed(agent(), write, done({ keep: "p1" }, {}));
  f.projects.delete("p2");
  f.layer.clearProject("p2");
  f.layer.observed(agent({ project_id: "p2" }), write, done({ late: "p2" }, {}));
  assert.deepEqual(f.records().map(record => record.project_id), ["p1"]);
  assert.equal(f.db().prepare("SELECT COUNT(*) AS n FROM evidence_blobs").get()!.n, 2);
  f.layer.clearProject("p2");
  f.projects.add("p2");
  f.layer.observed(agent({ project_id: "p2" }), write, done({ rebuilt: "p2" }, {}));
  assert.deepEqual(f.records().map(record => record.project_id), ["p1", "p2"]);
});

test("OCL-09: clearing a plugin's data removes its records and the content of calls it answered or made, as purged", t => {
  const f = fixture(t);
  const plugin = pluginCaller("notes", "notes-install");
  reporter(f.layer)(plugin, [{ fact: "notes.saved", outcome: "succeeded" }]);
  f.layer.observed(agent(), write, done({ to: "notes" }, { id: 1 }));
  f.layer.observed(person({ audience: "plugin", plugin_install_id: "notes-install" }), { ...write, capability_id: "todo.create", provider_id: "todo-install" }, done({ from: "notes" }, {}));
  f.layer.observed(agent(), { ...write, capability_id: "todo.create", provider_id: "todo-install" }, done({ other: true }, {}));
  f.layer.flush();
  f.layer.purgePlugin({ plugin_id: "notes", install_ids: ["notes-install"], provider_ids: ["notes-install"] });
  const records = f.records();
  assert.equal(records.filter(record => record.owner.kind === "plugin").length, 0);
  const calls = records.filter(record => record.fact === "action.call");
  assert.deepEqual(calls.map(record => record.evidence.every(item => item.ref.kind === "missing" && item.ref.reason === "purged")), [true, true, false]);
  assert.equal(f.db().prepare("SELECT COUNT(*) AS n FROM evidence_blobs").get()!.n, 2);
  assert.ok(readCoverageGaps(f.db()).some(gap => gap.state === "purged" && gap.owner === "plugin:notes"));
});

test("OCL-15: a batch that cannot be written is kept as a lost stretch, and the work it recorded is not failed", t => {
  const f = fixture(t);
  f.layer.observed(agent(), write, done({}, {}));
  f.layer.flush();
  f.db().exec("CREATE TRIGGER fail_records BEFORE INSERT ON records BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  assert.doesNotThrow(() => f.layer.observed(agent(), write, done({ n: 2 }, {})));
  f.layer.flush();
  f.db().exec("DROP TRIGGER fail_records");
  f.layer.observed(agent(), write, done({ n: 3 }, {}));
  f.layer.flush();
  const lost = readCoverageGaps(f.db()).filter(gap => gap.reason === "write_failed");
  assert.equal(lost.length, 1);
  assert.equal(lost[0]!.count, 1);
  assert.equal(f.records().length, 2);
});

test("OCL-15: a run that ended without writing its queue shows the stretch since its last write as lost for an unknown reason", t => {
  const f = fixture(t);
  f.layer.observed(agent(), write, done({}, {}));
  f.layer.flush();
  // A run that crashed never marked its end: the library still says it is open, and the next run to open it finds that.
  const next = new ObservationLayer({ home: f.home, env: f.env, keys: has => observationKeys(f.secrets, has), flushDelayMs: 5 });
  t.after(() => next.close());
  next.flush();
  assert.ok(readCoverageGaps(next.writer.database()!.db).some(gap => gap.reason === "unknown_exit" && gap.state === "lost"));
});

test("OCL-11: the exit never records the observation layer's own calls", t => {
  const f = fixture(t);
  f.layer.observed(person(), { capability_id: "observation.report", version: 1, operation: "command" }, done({}, {}));
  assert.equal(f.records().length, 0);
});

test("OCL-01: an exit record names the runtime client that acted, from the Host's audit name and never from input", t => {
  const f = fixture(t);
  f.layer.observed(agent({ audience: "mcp", audit_actor_id: "client-7:session-2" }), read, done({ client: "forged" }, { ok: true }));
  f.layer.observed(person(), read, done({}, { ok: true }));
  const [mcp, page] = f.records({ fact: "action.call" });
  assert.equal(mcp!.detail.client, "client-7:session-2");
  assert.equal(page!.detail.client, undefined);
});
