import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionError, bindActionClient, type ActionAvailability, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalHost, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { expectingRefusal, recordedCallId, refusalExpected, withCallId, type CallContext } from "@molis-ai/molis-work-kernel";
import { feedQueryActions as q, feedSourceActions as s } from "@molis-ai/molis-work-plugin-feed";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { NATIVE_CONTENT_PERMISSIONS } from "../apps/local-host/dist/content-action-providers.js";
import { ActionCallLog } from "../apps/local-host/dist/action-call-log.js";

const PROJECT = "project-call-log";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A call as the host settles it: the caller, plus the number of its operation. */
const idOf = (n: number) => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
const callBy = (projectId: string | null = null, over: Partial<CallContext> = {}): CallContext =>
  ({ actor_id: "web-user", project_id: projectId, audience: "user", permissions: [], call_id: randomUUID(), ...over });
const action = (capability_id: string, operation = "command") => ({ capability_id, version: 1, provider_id: "system.test", operation, title: capability_id, provider_title: "测试" });
const refusal = (code: string, message: string) => ({ ok: false as const, code, message, refused: true as const });
const lines = (home: string) => readFileSync(join(home, "logs/action-calls.jsonl"), "utf8").trim().split("\n");
const logOf = async (label: string, run: (home: string, log: ActionCallLog) => void | Promise<void>): Promise<void> => {
  const home = mkdtempSync(join(tmpdir(), `action-call-log-${label}-`));
  try { await run(home, new ActionCallLog(home)); } finally { rmSync(home, { recursive: true, force: true }); }
};

test("commands that ran are recorded with caller, outcome and diagnostic id, successful queries are not, failed ones are, and inputs never reach the record", { timeout: 60_000 }, async () => {
  const home = mkdtempSync(join(tmpdir(), "action-call-log-"));
  const dbPath = join(home, "project.db");
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  seedDemoBoard(dbPath, PROJECT);
  const reference = molisWorkHostProjectReference({ databasePath: dbPath, projectId: PROJECT });
  const caller: ActionCallContext = { actor_id: "web-user", project_id: PROJECT, audience: "user", permissions: NATIVE_CONTENT_PERMISSIONS };
  const actions = bindActionClient(host.actionClient(reference), () => caller);
  try {
    const secret = "只在输入里出现的检索词";
    const { source } = await actions.invoke(s.register, { kind: "web_query", query: secret, name: "记录测试" });
    await assert.rejects(actions.invoke(s.disconnect, { source_id: source.source_id }), { code: "feed.source_invalid_state" });
    await host.actionClient(reference).discover(caller);
    // A page retrying the same refused command becomes one entry with a count, not a flood that pushes real entries out.
    for (let i = 0; i < 3; i++) await assert.rejects(actions.invoke(s.disconnect, { source_id: source.source_id }), { code: "feed.source_invalid_state" });
    // A read that works leaves nothing; a read that is turned away leaves a row, because someone is about to look for why.
    await actions.invoke(q.snapshot, {});
    await assert.rejects(actions.invoke(q.snapshot, { include_contents: "yes" } as never), { code: "actions.input_invalid" });

    const calls = host.callLog!.list(PROJECT);
    assert.deepEqual(calls.map(row => [row.capability_id, row.operation, row.ok, row.refused]),
      [[q.snapshot.capability_id, "query", false, true], [s.disconnect.capability_id, "command", false, undefined], [s.register.capability_id, "command", true, undefined]],
      "newest first: commands, and reads only when they failed");
    assert.equal(calls[1]!.count, 4);
    assert.ok(calls[1]!.last_at! >= calls[1]!.at);
    assert.equal(calls[1]!.code, "feed.source_invalid_state");
    assert.equal(calls[0]!.code, "actions.input_invalid");
    assert.equal(calls[2]!.actor_id, "web-user");
    assert.equal(calls[2]!.audience, "user");
    assert.equal(calls[2]!.provider_title, "Feed");
    for (const row of calls) assert.match(row.call_id, UUID, "every row carries the number of its operation");
    // The four identical failures were four operations: the folded row keeps the newest number and the last few, so any of them can be found.
    assert.equal(calls[1]!.call_ids!.length, 4);
    assert.equal(calls[1]!.call_ids!.at(-1), calls[1]!.call_id);
    assert.ok(calls[1]!.call_ids!.every(id => host.callLog!.find(id.slice(0, 8)).some(row => row.capability_id === s.disconnect.capability_id)));
    assert.deepEqual(host.callLog!.list(null), [], "another scope sees none of them");
    assert.ok(!readFileSync(join(home, "logs/action-calls.jsonl"), "utf8").includes(secret), "the input is never written");
  } finally {
    await host.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("two processes sharing a Home keep each other's records, and a repeat rewrites only the last line", () => {
  const home = mkdtempSync(join(tmpdir(), "action-call-log-shared-"));
  const first = new ActionCallLog(home), second = new ActionCallLog(home);
  try {
    first.record(callBy(), action("a.run"), { ok: true });
    second.record(callBy(), action("b.run"), { ok: true });
    first.record(callBy(), action("b.run"), { ok: true });
    first.record(callBy(), action("b.run"), { ok: true });
    second.record(callBy(), action("c.run"), { ok: false, message: "拒绝" });
    first.record(callBy(), action("q.read", "query"), { ok: true });
    assert.deepEqual(first.list(null).map(row => [row.capability_id, row.count ?? 1]), [["c.run", 1], ["b.run", 3], ["a.run", 1]]);
    assert.equal(lines(home).length, 3, "one line per entry, none torn");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a command turned away before its handler ran leaves a 「未执行」 row, one whose handler ran and failed leaves a row without the mark, and neither hides the other", () => logOf("refused", (home, log) => {
  log.record(callBy(), action("a.disabled"), refusal("actions.plugin_disabled", "插件已停用"));
  log.record(callBy(), action("b.failed"), { ok: false, code: "b.failed", message: "处理器失败" });
  log.record(callBy(), action("c.cancelled"), refusal("actions.cancelled", "操作已取消"));
  log.record(callBy(), action("d.ok"), { ok: true });
  assert.deepEqual(log.list(null).map(row => [row.capability_id, row.ok, row.refused, row.code]),
    [["d.ok", true, undefined, undefined], ["c.cancelled", false, true, "actions.cancelled"], ["b.failed", false, undefined, "b.failed"], ["a.disabled", false, true, "actions.plugin_disabled"]],
    "every command is written, and only the ones that never began say so");
  assert.equal(lines(home).length, 4);
  assert.ok(lines(home).every(line => !/"input"|"result"/.test(line)), "a diagnostic row names who, what, how it ended and the error code, never content");
}));

test("PREP-108-01/03: a command cancelled, revoked or disabled before its handler started leaves a 「未执行」 row under the number of its operation, and a handler that ran and failed leaves one without the mark", { timeout: 60_000 }, async () => {
  const home = mkdtempSync(join(tmpdir(), "action-call-log-before-handler-"));
  const dbPath = join(home, "project.db");
  let availability: ActionAvailability = { available: true };
  let opened = 0;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: () => availability, onRuntimeOpen: () => { opened++; } });
  seedDemoBoard(dbPath, PROJECT);
  const reference = molisWorkHostProjectReference({ databasePath: dbPath, projectId: PROJECT });
  const caller: ActionCallContext = { actor_id: "web-user", project_id: PROJECT, audience: "user", permissions: NATIVE_CONTENT_PERMISSIONS };
  const client = host.actionClient(reference);
  const register = { kind: "web_query" as const, query: "拒绝之前不会登记", name: "处理器之前被拒的记录测试" };
  // The operation the caller is in: after a refusal, its number is one a person can look up.
  const operation = async (id: string, run: () => Promise<unknown>) => withCallId(id, async () => {
    await assert.rejects(run());
    assert.equal(recordedCallId(), id, "the refusal left a row, so this number may be shown to a person");
  });
  try {
    const [aborted, revoked, disabled] = [idOf(9001), idOf(9002), idOf(9003)];
    const stopped = new Error("private preparation reason"), signal = AbortSignal.abort(stopped);
    await withCallId(aborted, async () => {
      await assert.rejects(client.invoke({ ...caller, signal }, s.register, register), error => error === stopped);
      assert.equal(recordedCallId(), aborted, "the actual original rejection has one findable diagnostic");
    });
    assert.equal(opened, 0, "a command already cancelled does not open its project or prepare its plugins");
    const homeId = idOf(9005);
    await operation(homeId, () => host.homeActionClient().invoke({ ...caller, actor_id: "home-person", project_id: null, signal }, s.register, register));
    const homeRefusal = host.callLog!.list(null).find(row => row.call_id === homeId)!;
    assert.deepEqual([homeRefusal.actor_id, homeRefusal.project_id, homeRefusal.capability_id, homeRefusal.code, homeRefusal.refused], ["home-person", null, s.register.capability_id, undefined, true]);
    assert.equal(opened, 0);
    assert.ok(!lines(home).some(line => line.includes("private preparation reason") || line.includes(register.query)), "a preparation refusal records no reason or input content");
    await operation(revoked, () => client.invoke({ ...caller, validate_authority: () => { throw new ActionError("actions.revoked", "授权已撤销"); } }, s.register, register));
    availability = { available: false, code: "actions.plugin_disabled", reason: "插件已停用" };
    await operation(disabled, () => client.invoke(caller, s.register, register));
    availability = { available: true };
    const refused = host.callLog!.list(PROJECT);
    assert.deepEqual(refused.map(row => [row.call_id, row.ok, row.refused === true]), [[disabled, false, true], [revoked, false, true], [aborted, false, true]],
      "no handler began, and each refusal is a row of its own under its own number");
    assert.deepEqual([refused[0]!.code, refused[1]!.code], ["actions.plugin_disabled", "actions.revoked"]);

    // A handler that ran is recorded, whichever way it ended, and does not carry the mark.
    const { source } = await client.invoke(caller, s.register, register) as { source: { source_id: string } };
    await assert.rejects(client.invoke(caller, s.disconnect, { source_id: source.source_id }), { code: "feed.source_invalid_state" });
    assert.deepEqual(host.callLog!.list(PROJECT).slice(0, 2).map(row => [row.capability_id, row.ok, row.code, row.refused]),
      [[s.disconnect.capability_id, false, "feed.source_invalid_state", undefined], [s.register.capability_id, true, undefined, undefined]]);
    assert.equal(host.callLog!.list(PROJECT).length, 5);
  } finally {
    await host.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("PREP-108-02/04: registered metadata does not start a Runtime or await Host policy, and an early scoped refusal is settled once", () => logOf("registered-metadata", async (_home, log) => {
  let opened = 0, policies = 0, providerPolicies = 0, snapshots = 0, effects = 0;
  const policy = Object.assign(() => { policies++; return { available: false, code: "actions.forbidden", reason: "Host policy" } as const; },
    { snapshotForDiscovery: () => { snapshots++; return () => ({ available: true } as const); } });
  const host = new LocalHost({ runtimeFactory: { open: () => { opened++; return {}; }, close: () => {} }, actionAvailability: policy,
    actionSettled: (caller, definition, outcome) => log.record(caller, definition, outcome) });
  const definition = areaAction("fixture.prepare.change");
  host.actionRegistry().registerProvider({ provider: { provider_id: "fixture.prepare", title: "Visible metadata", kind: "system" }, definitions: [definition],
    availability: () => { providerPolicies++; return { available: true }; },
    handlers: [{ ...definition, handle: () => { effects++; return "done"; } }] });
  const reference = { project_id: PROJECT, storage_key: "memory:prepare" }, caller = callBy(PROJECT, { actor_id: "prepare-person" });
  try {
    const rows = host.inspectActionMetadata(caller, reference);
    assert.equal(rows.find(row => row.capability_id === definition.capability_id)?.provider.title, "Visible metadata");
    assert.equal("availability" in rows[0]!, false, "registered declarations do not pretend to be an execution availability check");
    assert.deepEqual([opened, policies, providerPolicies, snapshots, effects], [0, 0, 0, 0, 0]);
    assert.throws(() => host.inspectActionMetadata({ ...caller, project_id: "another-project" }, reference), { code: "actions.scope_mismatch" });
    const client = host.actionClient(reference), other = { ...caller, actor_id: "another-person", project_id: "another-project", call_id: idOf(9006) };
    await withCallId(other.call_id, () => assert.rejects(client.invoke(other, definition, { privateInput: "never recorded" }), { code: "actions.scope_mismatch" }));
    const recorded = log.list("another-project");
    assert.equal(recorded.length, 1);
    assert.deepEqual([recorded[0]!.call_id, recorded[0]!.actor_id, recorded[0]!.project_id, recorded[0]!.title, recorded[0]!.refused],
      [other.call_id, "another-person", "another-project", definition.capability_id, true], "the unknown descriptor contains only the requested reference, not another project's definition");
    assert.deepEqual([opened, policies, providerPolicies, snapshots, effects], [0, 0, 0, 0, 0]);
  } finally { await host.close(); }
}));

test("PREP-108-01/02: cancellation, open failure or Host close during Runtime preparation retains one original refusal and starts no handler", { timeout: 60_000 }, () => logOf("preparation-wait", async (_home, log) => {
  for (const stage of ["cancel", "close", "failure"] as const) {
    let release!: (runtime: { opened: true }) => void, fail!: (error: unknown) => void, entered!: () => void, effects = 0;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const opening = new Promise<{ opened: true }>((resolve, reject) => { release = resolve; fail = reject; });
    const host = new LocalHost({ runtimeFactory: { open: () => { entered(); return opening; }, close: () => {} },
      actionSettled: (caller, definition, outcome) => log.record(caller, definition, outcome) });
    const definition = areaAction("fixture.preparation." + stage);
    host.actionRegistry().registerProvider({ provider: { provider_id: "fixture.preparation", title: "Preparation", kind: "system" }, definitions: [definition],
      handlers: [{ ...definition, handle: () => { effects++; return "done"; } }] });
    const signal = new AbortController(), reason = stage === "cancel" ? new ActionError("actions.cancelled", "stopped while opening") : new Error("private startup failure");
    const caller = callBy(PROJECT, { actor_id: stage + "-person", call_id: idOf(stage === "cancel" ? 9007 : stage === "close" ? 9008 : 9009), signal: signal.signal });
    let closing: Promise<void> | undefined;
    try {
      const pending = withCallId(caller.call_id, () => host.actionClient({ project_id: PROJECT, storage_key: "memory:" + stage }).invoke(caller, definition, {}));
      const refused = assert.rejects(pending, error => stage !== "close" ? error === reason : error instanceof ActionError && error.code === "host.closed");
      await ready;
      if (stage === "cancel") signal.abort(reason); else if (stage === "close") closing = host.close(); else fail(reason);
      if (stage !== "failure") release({ opened: true });
      await refused;
      const rows = log.list(PROJECT).filter(row => row.call_id === caller.call_id);
      assert.equal(rows.length, 1);
      assert.deepEqual([rows[0]!.actor_id, rows[0]!.project_id, rows[0]!.refused], [caller.actor_id, PROJECT, true]);
      assert.equal(effects, 0);
    } finally { release({ opened: true }); await (closing ?? host.close()); }
  }
}));

test("a 「未执行」 row keeps who, what, the outcome and the error code and no content: not the reason the provider gave, not what was asked with", { timeout: 60_000 }, async () => {
  const home = mkdtempSync(join(tmpdir(), "action-call-log-reason-"));
  const dbPath = join(home, "project.db");
  const reason = "服务暂停：客户张三的备注";
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: () => ({ available: false, code: "test.paused", reason }) });
  seedDemoBoard(dbPath, PROJECT);
  const reference = molisWorkHostProjectReference({ databasePath: dbPath, projectId: PROJECT });
  const caller: ActionCallContext = { actor_id: "web-user", project_id: PROJECT, audience: "user", permissions: NATIVE_CONTENT_PERMISSIONS };
  try {
    const secret = "只在输入里出现的口令";
    // The caller is told why; the record is not.
    await assert.rejects(host.actionClient(reference).invoke(caller, s.register, { kind: "web_query", query: secret, name: "口令测试" }), { code: "test.paused", message: reason });
    const [row] = host.callLog!.list(PROJECT);
    assert.deepEqual([row!.refused, row!.ok, row!.code, row!.actor_id, row!.capability_id], [true, false, "test.paused", "web-user", s.register.capability_id]);
    assert.equal(row!.message, undefined, "a refused row stores no message");
    const text = readFileSync(join(home, "logs/action-calls.jsonl"), "utf8");
    assert.ok(!("message" in JSON.parse(text.trim().split("\n").at(-1)!)), "…not even as an empty field");
    assert.ok(!text.includes("客户张三") && !text.includes(secret), "neither what the provider said nor what was asked with is written");
  } finally {
    await host.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("only a command that ran and failed keeps a message, as before; a refused row and a failed read keep the error code and nothing that was said", () => logOf("message", (_home, log) => {
  const said = "出错了：客户张三的备注";
  log.record(callBy(), action("m.refused"), refusal("m.refused", said));
  log.record(callBy(), action("m.read", "query"), { ok: false, code: "m.read", message: said });
  log.record(callBy(), action("m.unknown", "unknown"), refusal("actions.missing", said));
  log.record(callBy(), action("m.command"), { ok: false, code: "m.command", message: said });
  const byId = new Map(log.list(null).map(row => [row.capability_id, row]));
  assert.equal(byId.get("m.command")!.message, said, "a failed command keeps its message, as it did before");
  for (const id of ["m.refused", "m.read", "m.unknown"]) {
    const row = byId.get(id)!;
    assert.equal(row.message, undefined, `${id} stores no message`);
    assert.ok(row.code, `${id} keeps its error code`);
  }
}));

test("a refusal the caller was looking for leaves no row, and another code, a failed handler, or the same refusal outside the scope does", () => logOf("expected", async (_home, log) => {
  const notEnabled = refusal("actions.plugin_disabled", "此项目未启用该插件");
  await expectingRefusal(["actions.plugin_disabled"], async () => {
    log.record(callBy(), action("page.area", "query"), notEnabled);
    // The scope goes with the asynchronous work started inside it, a command is covered as a read is, and none of them is shown a number.
    await new Promise<void>(resolve => setImmediate(resolve));
    const timer = callBy();
    await withCallId(timer.call_id, async () => { log.record(timer, action("page.timer"), notEnabled); assert.equal(recordedCallId(), undefined, "no row, so no number to show"); });
    log.record(callBy(), action("page.other", "query"), refusal("actions.forbidden", "无权"));
    log.record(callBy(), action("page.handler"), { ok: false, code: "actions.plugin_disabled", message: "处理器自己报的，它已经开始" });
  });
  log.record(callBy(), action("person.named", "query"), notEnabled);
  assert.deepEqual(log.list(null).reverse().map(row => [row.capability_id, row.code, row.refused === true]),
    [["page.other", "actions.forbidden", true], ["page.handler", "actions.plugin_disabled", false], ["person.named", "actions.plugin_disabled", true]]);
}));

test("the exemption ends with the page's own call: a timer, a detached promise and a child process started inside the scope that finish after it are refused calls and are recorded", { timeout: 60_000 }, () => logOf("ends", async (_home, log) => {
  const notEnabled = refusal("actions.plugin_disabled", "此项目未启用该插件");
  const code = "actions.plugin_disabled";
  const late: Promise<void>[] = [], lookingFor: [string, boolean][] = [];
  const later = (name: string, start: (record: () => void) => void) => late.push(new Promise<void>(resolve => start(() => {
    lookingFor.push([name, refusalExpected(code)]);
    log.record(callBy(), action(`late.${name}`), notEnabled);
    resolve();
  })));
  await expectingRefusal([code], async () => {
    assert.equal(refusalExpected(code), true, "while the page's call is pending the refusal is its answer");
    log.record(callBy(), action("page.probe", "query"), notEnabled);
    later("timer", record => { setTimeout(record, 30); });
    later("detached", record => { void new Promise(resolve => setTimeout(resolve, 30)).then(record); });
    later("child", record => { spawn(process.execPath, ["-e", ""], { stdio: "ignore" }).on("close", record); });
  });
  assert.equal(refusalExpected(code), false);
  await Promise.all(late);
  assert.deepEqual(lookingFor.map(([, expected]) => expected), [false, false, false], "the page's call is over, so nothing it left running is looking for the refusal");
  assert.deepEqual(log.list(null).map(row => [row.capability_id, row.refused === true]).sort(([a], [b]) => String(a).localeCompare(String(b))),
    [["late.child", true], ["late.detached", true], ["late.timer", true]], "the probe left nothing; everything that finished after the scope is a row");
}));

test("the exemption also ends when the page's call returns without waiting or throws", async () => {
  const code = "actions.plugin_disabled";
  const seen: boolean[] = [];
  const after = () => new Promise<void>(resolve => setTimeout(() => { seen.push(refusalExpected(code)); resolve(); }, 5));
  expectingRefusal([code], () => { void after(); return 1; });
  assert.throws(() => expectingRefusal([code], () => { void after(); throw new Error("sync"); }), { message: "sync" });
  await assert.rejects(expectingRefusal([code], async () => { void after(); throw new Error("async"); }), { message: "async" });
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.deepEqual(seen, [false, false, false]);
});

/** A command of a made-up plugin, and the Host's own policy: the plugins named in `closed` are "not enabled" in this project. */
const areaAction = (capability_id: string): ActionDefinition<Record<string, never>, string> => ({ capability_id, version: 1, operation: "command",
  action: { title: capability_id, description: "fixture", kind: "operation", scope: "project", audiences: ["user"], permissions: [], subject_kinds: [],
    input_schema: { type: "object", properties: {}, additionalProperties: false }, output_schema: { type: "string" } } });

test("a refusal the page looked for is exempt, but what the handler it started then calls is not: a nested refusal with the same code, in awaited work, work left running, and a Host action reached through the project client, is a row", { timeout: 60_000 }, () => logOf("nested", async (_home, log) => {
  const project = { project_id: "nested", storage_key: "memory:nested" };
  const caller: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: [] };
  const [probe, outer, awaited, detached, typedInner] = ["probe", "outer", "awaited", "detached", "typed_inner"].map(name => areaAction(`fixture.area.${name}`));
  const typedOuter = areaAction("fixture.area.typed_outer");
  const closed = new Set([probe, awaited, detached, typedInner].map(definition => definition!.capability_id));
  const notEnabled = { code: "actions.plugin_disabled" };
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} }, actionSettled: (call, described, outcome) => log.record(call, described, outcome),
    actionAvailability: (_context, view) => closed.has(view.capability_id) ? { available: false, code: "actions.plugin_disabled", reason: "此项目未启用该插件" } : { available: true } });
  const client = host.actionClient(project);
  let leftRunning: Promise<unknown> = Promise.resolve();
  host.actionRegistry(project).registerProvider({ provider: { provider_id: "fixture", title: "Fixture", kind: "system" }, definitions: [probe!, outer!, awaited!, detached!, typedInner!], handlers: [
    ...[probe!, awaited!, detached!, typedInner!].map(definition => ({ ...definition, handle: () => "never runs" })),
    { ...outer!, handle: async () => {
      await assert.rejects(client.invoke(caller, awaited!, {}), notEnabled);
      // Work the handler starts and leaves running belongs to the handler as well.
      leftRunning = (async () => { await new Promise<void>(resolve => setImmediate(resolve)); await assert.rejects(client.invoke(caller, detached!, {}), notEnabled); })();
      return "outer done";
    } },
  ] });
  host.registerAction(typedOuter, async () => { await assert.rejects(client.invoke(caller, typedInner!, {}), notEnabled); return "typed done"; });
  try {
    await expectingRefusal(["actions.plugin_disabled"], async () => {
      await assert.rejects(client.invoke(caller, probe!, {}), notEnabled);
      assert.equal(await client.invoke(caller, outer!, {}), "outer done");
      assert.equal(await host.client(project).invoke(typedOuter, {}), "typed done");
    });
    await leftRunning;
    assert.deepEqual(log.list(project.project_id).map(row => [row.capability_id, row.ok, row.refused === true]).sort(([a], [b]) => String(a).localeCompare(String(b))), [
      [awaited!.capability_id, false, true], [detached!.capability_id, false, true], [outer!.capability_id, true, false], [typedInner!.capability_id, false, true], [typedOuter.capability_id, true, false],
    ], "the probe's own refusal is the answer it looked for and leaves nothing; everything its callee did is recorded as usual");
  } finally { await host.close(); }
}));

test("a contract failure keeps the fact and not the fields: a record keyed by what a person typed does not reach the call log through the field path", { timeout: 60_000 }, () => logOf("fields", async (home, log) => {
  const project = { project_id: "fields", storage_key: "memory:fields" };
  const caller: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: [] };
  const label = "客户张三的备注";
  const tags = areaAction("fixture.area.tags");
  const keyed = { ...tags, action: { ...tags.action, input_schema: { type: "object", additionalProperties: { type: "integer" } } } };
  const returned = areaAction("fixture.area.returned");
  const keyedResult = { ...returned, action: { ...returned.action, output_schema: { type: "object", additionalProperties: { type: "integer" } } } };
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} }, actionSettled: (call, described, outcome) => log.record(call, described, outcome) });
  host.actionRegistry(project).registerProvider({ provider: { provider_id: "fixture", title: "Fixture", kind: "system" }, definitions: [keyed, keyedResult],
    handlers: [{ ...keyed, handle: () => "never runs" }, { ...keyedResult, handle: () => ({ [label]: "不是整数" }) as never }] });
  try {
    // The caller made the call and is told which field did not fit; the record is read by someone else later.
    await assert.rejects(host.actionClient(project).invoke(caller, keyed, { [label]: "不是整数" } as never), error => {
      assert.equal((error as ActionError).code, "actions.input_invalid");
      assert.ok((error as ActionError).message.includes(label), "the caller keeps the whole message");
      return true;
    });
    // A command that ran and returned something the contract does not allow is a failed row, which keeps its message: cut before the field path.
    await assert.rejects(host.actionClient(project).invoke(caller, keyedResult, {}), error => {
      assert.equal((error as ActionError).code, "actions.output_invalid_after_effect");
      assert.ok((error as ActionError).message.includes(label), "the caller keeps the whole message");
      return true;
    });
    const rows = new Map(log.list(project.project_id).map(row => [row.capability_id, row]));
    const refused = rows.get(keyed.capability_id)!, ran = rows.get(keyedResult.capability_id)!;
    assert.deepEqual([refused.refused, refused.code, refused.message], [true, "actions.input_invalid", undefined], "a refused row has no message at all");
    assert.deepEqual([ran.refused, ran.code, ran.message], [undefined, "actions.output_invalid_after_effect", "操作已执行，但结果不符合能力合同"]);
    assert.ok(!readFileSync(join(home, "logs/action-calls.jsonl"), "utf8").includes(label), "the field name is the input's, and the input is never written");
  } finally { await host.close(); }
}));

test("a read is recorded only when it failed, and a row says which kind of call it was", () => logOf("operations", (_home, log) => {
  log.record(callBy(), action("r.ok", "query"), { ok: true });
  log.record(callBy(), action("r.failed", "query"), { ok: false, code: "r.failed", message: "读取失败" });
  log.record(callBy(), action("r.refused", "query"), refusal("actions.forbidden", "无权"));
  log.record(callBy(), action("missing.id", "unknown"), refusal("actions.missing", "没有这项能力"));
  log.record(callBy(), action("c.ok"), { ok: true });
  assert.deepEqual(log.list(null).map(row => [row.capability_id, row.operation]), [["c.ok", "command"], ["missing.id", "unknown"], ["r.refused", "query"], ["r.failed", "query"]]);
}));

test("W5-01-DELEGATE-07 S-43 a call made through a plugin's action directory records which plugin made it, and never folds into the same call made another way", () => logOf("delegated", (_home, log) => {
  const by = (delegated_by?: string) => callBy(null, { actor_id: "runtime:logged", audience: "workflow", ...(delegated_by ? { delegated_by } : {}) });
  const delegator = "io.molis.work.example.delegator", other = "io.molis.work.example.other";
  log.record(by(delegator), action("w.command"), { ok: true });
  log.record(by(delegator), action("w.command"), { ok: true });
  log.record(by(), action("w.command"), { ok: true });
  log.record(by(other), action("w.command"), { ok: true });
  assert.deepEqual(log.list(null).map(row => [row.actor_id, row.delegated_by, row.count ?? 1]),
    [["runtime:logged", other, 1], ["runtime:logged", undefined, 1], ["runtime:logged", delegator, 2]]);
}));

test("a client trying many ids that do not exist leaves one row, with the last twenty of them and of the operations", () => logOf("missing", (home, log) => {
  const calls = Array.from({ length: 500 }, () => callBy(null, { actor_id: "mcp-client", audience: "mcp" }));
  calls.forEach((call, i) => log.record(call, action(`guess.nothing_${i}`, "unknown"), refusal("actions.missing", `没有能力 guess.nothing_${i}`)));
  log.record(callBy(null, { actor_id: "someone-else", audience: "mcp" }), action("guess.nothing_0", "unknown"), refusal("actions.missing", "没有能力 guess.nothing_0"));
  const rows = log.list(null);
  assert.equal(rows.length, 2, "one row for the client, one for the other caller");
  const folded = rows[1]!;
  assert.equal(folded.count, 500);
  assert.equal(folded.refused, true);
  assert.deepEqual(folded.capability_ids, Array.from({ length: 20 }, (_, i) => `guess.nothing_${480 + i}`), "the newest twenty different ids");
  assert.deepEqual(folded.call_ids, calls.slice(-20).map(call => call.call_id), "the newest twenty operations");
  assert.equal(folded.call_id, calls.at(-1)!.call_id);
  assert.equal(folded.capability_id, "guess.nothing_499");
  assert.deepEqual(log.find(calls[0]!.call_id.slice(0, 8)), [], "an operation that has been folded out for more than twenty others can no longer be found");
  assert.equal(log.find(calls[499]!.call_id.slice(0, 8)).length, 1);
  assert.equal(lines(home).length, 2, "two lines in the file");
}));

test("a row folded from different operations can be found by the number of any of the last twenty, in any project, from six characters on", () => logOf("find", (_home, log) => {
  const one = callBy("project-one"), two = callBy("project-one"), other = callBy("project-two"), unscoped = callBy(null);
  log.record(one, action("a.run"), { ok: false, code: "a.failed", message: "失败" });
  log.record(two, action("a.run"), { ok: false, code: "a.failed", message: "失败" });
  log.record(other, action("b.run"), { ok: true });
  log.record(unscoped, action("c.run"), { ok: true });
  assert.deepEqual(log.find(one.call_id.slice(0, 8)).map(row => row.capability_id), ["a.run"], "the folded row answers to the first of its operations");
  assert.deepEqual(log.find(two.call_id.slice(0, 8)).map(row => row.capability_id), ["a.run"], "…and to the latest");
  assert.deepEqual(log.find(other.call_id).map(row => [row.capability_id, row.project_id]), [["b.run", "project-two"]], "whole numbers are found, whatever the project");
  assert.deepEqual(log.find(unscoped.call_id.slice(0, 6).toUpperCase()).map(row => row.capability_id), ["c.run"], "six characters are enough, and case is not what a person copies");
  assert.deepEqual(log.find(unscoped.call_id.slice(0, 5)), [], "five are not: a short prefix would match everything");
  assert.deepEqual(log.find(""), []);
  assert.deepEqual(log.find("ffffffff"), []);
  assert.equal(log.find(one.call_id.slice(0, 6), 0).length, 0, "the limit applies");
}));

test("the newest failed or refused calls are listed across all projects", () => logOf("recent", (_home, log) => {
  log.record(callBy("project-one"), action("a.ok"), { ok: true });
  log.record(callBy("project-one"), action("b.failed"), { ok: false, code: "b.failed", message: "失败" });
  log.record(callBy("project-two"), action("c.ok"), { ok: true });
  log.record(callBy(null), action("d.refused"), refusal("actions.forbidden", "无权"));
  log.record(callBy("project-two"), action("e.ok"), { ok: true });
  assert.deepEqual(log.recent(10).map(row => row.capability_id), ["e.ok", "d.refused", "c.ok", "b.failed", "a.ok"]);
  assert.deepEqual(log.recent(10, { failedOnly: true }).map(row => row.capability_id), ["d.refused", "b.failed"]);
  assert.deepEqual(log.recent(1, { failedOnly: true }).map(row => row.capability_id), ["d.refused"]);
}));

test("tidying keeps the commands that ran apart from the diagnostics, so a flood of refusals and failed reads cannot push them out", () => logOf("classes", (home, log) => {
  const commands = Array.from({ length: 50 }, (_, i) => `ran.command_${i}`);
  for (const id of commands) log.record(callBy(), action(id), { ok: true });
  // 1,000 refused commands and 1,000 failed reads, every one different so none is folded into the one before it.
  for (let i = 0; i < 1000; i++) {
    log.record(callBy(), action(`flood.refused_${i}`), refusal("actions.plugin_disabled", `停用 ${i}`));
    log.record(callBy(), action(`flood.read_${i}`, "query"), { ok: false, code: `flood.read_${i}`, message: "读取失败" });
  }
  const kept = log.list(null, 5000);
  for (const id of commands) assert.ok(kept.some(row => row.capability_id === id), `${id} survived the tidy`);
  const others = kept.filter(row => row.operation !== "command" || row.refused);
  assert.ok(others.length <= 200 + 100, `the diagnostics were cut back to the newest (${others.length})`);
  assert.equal(others[0]!.capability_id, "flood.read_999", "the newest is first");
  assert.ok(lines(home).length < 500, `the file was rewritten (${lines(home).length} lines)`);
}));

test("tidying keeps the newest thousand commands that ran", () => logOf("thousand", (_home, log) => {
  for (let i = 0; i < 1100; i++) log.record(callBy(), action(`ran.command_${i}`), { ok: true });
  for (let i = 0; i < 950; i++) log.record(callBy(), action(`flood.read_${i}`, "query"), { ok: false, code: `flood.read_${i}`, message: "读取失败" });
  const kept = log.list(null, 5000);
  const commands = kept.filter(row => row.operation === "command");
  assert.equal(commands.length, 1000);
  assert.equal(commands.at(-1)!.capability_id, "ran.command_100", "the oldest hundred went");
  assert.equal(commands[0]!.capability_id, "ran.command_1099");
}));

test("rows written before calls had a number are not read, and the next tidy removes them from the file", () => logOf("old", (home, log) => {
  mkdirSync(join(home, "logs"), { recursive: true });
  const oldRow = (i: number) => JSON.stringify({ at: "2026-10-01T00:00:00.000Z", capability_id: `old.run_${i}`, version: 1, provider_id: "system.test", provider_title: "测试", title: "旧", actor_id: "web-user", audience: "user", project_id: null, ok: true });
  writeFileSync(join(home, "logs/action-calls.jsonl"), Array.from({ length: 1990 }, (_, i) => oldRow(i)).join("\n") + "\n{torn line\n");
  assert.deepEqual(log.list(null), [], "an old row is not shown");
  assert.deepEqual(log.recent(10), []);
  assert.deepEqual(log.find("00000001"), []);
  for (let i = 0; i < 20; i++) log.record(callBy(), action(`new.run_${i}`), { ok: true });
  assert.equal(log.list(null).length, 20);
  assert.equal(lines(home).length, 20, "the old rows and the torn line were dropped when the file was tidied");
  // A row that has a number but no kind is not a current row either.
  appendFileSync(join(home, "logs/action-calls.jsonl"), JSON.stringify({ at: "2026-10-02T00:00:00.000Z", call_id: idOf(77), capability_id: "half.new", version: 1, actor_id: "web-user", audience: "user", project_id: null, ok: true }) + "\n");
  assert.equal(log.list(null).length, 20);
}));

test("the number of the operation a row was written in is marked as recorded, and only then", () => logOf("marked", async (_home, log) => {
  const written = callBy(), skipped = callBy(), failedRead = callBy(), elsewhere = callBy();
  await withCallId(written.call_id, async () => { log.record(written, action("c.ok"), { ok: true }); assert.equal(recordedCallId(), written.call_id); });
  await withCallId(skipped.call_id, async () => { log.record(skipped, action("r.ok", "query"), { ok: true }); assert.equal(recordedCallId(), undefined, "a read that worked leaves nothing to look up"); });
  await withCallId(failedRead.call_id, async () => { log.record(failedRead, action("r.failed", "query"), { ok: false, message: "失败" }); assert.equal(recordedCallId(), failedRead.call_id); });
  await withCallId(elsewhere.call_id, async () => { log.record(callBy(), action("c.ok"), { ok: true }); assert.equal(recordedCallId(), undefined, "a row of some other operation does not make this one findable"); });
  // A repeat is folded into the row before it, and is just as findable.
  const first = callBy(), again = callBy();
  log.record(first, action("c.same"), { ok: false, message: "同一个失败" });
  await withCallId(again.call_id, async () => { log.record(again, action("c.same"), { ok: false, message: "同一个失败" }); assert.equal(recordedCallId(), again.call_id); });
  assert.equal(log.find(again.call_id).length, 1);
  assert.equal(log.list(null).find(row => row.capability_id === "c.same")!.count, 2);
}));
