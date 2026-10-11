import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionError, bindActionClient, type ActionAvailability, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { expectingRefusal, recordedCallId, withCallId, type CallContext } from "@molis-ai/molis-work-kernel";
import { feedQueryActions as q, feedSourceActions as s } from "@molis-ai/molis-work-plugin-feed";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { NATIVE_CONTENT_PERMISSIONS } from "../apps/local-host/src/content-action-providers.js";
import { ActionCallLog } from "../apps/local-host/src/action-call-log.js";

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
  seedDemoBoard(dbPath, PROJECT);
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const reference = molisWorkHostProjectReference({ databasePath: dbPath, projectId: PROJECT });
  const caller: ActionCallContext = { actor_id: "web-user", project_id: PROJECT, audience: "user", permissions: NATIVE_CONTENT_PERMISSIONS };
  const actions = bindActionClient(host.actionClient(reference), () => caller);
  try {
    const secret = "只在输入里出现的检索词";
    const { source } = await actions.invoke(s.register, { kind: "web_query", query: secret, name: "记录测试" });
    await assert.rejects(actions.invoke(s.disconnect, { source_id: source.source_id }), { code: "feed_source_invalid_state" });
    await host.actionClient(reference).discover(caller);
    // A page retrying the same refused command becomes one entry with a count, not a flood that pushes real entries out.
    for (let i = 0; i < 3; i++) await assert.rejects(actions.invoke(s.disconnect, { source_id: source.source_id }), { code: "feed_source_invalid_state" });
    // A read that works leaves nothing; a read that is turned away leaves a row, because someone is about to look for why.
    await actions.invoke(q.snapshot, {});
    await assert.rejects(actions.invoke(q.snapshot, { include_contents: "yes" } as never), { code: "actions.input_invalid" });

    const calls = host.callLog!.list(PROJECT);
    assert.deepEqual(calls.map(row => [row.capability_id, row.operation, row.ok, row.refused]),
      [[q.snapshot.capability_id, "query", false, true], [s.disconnect.capability_id, "command", false, undefined], [s.register.capability_id, "command", true, undefined]],
      "newest first: commands, and reads only when they failed");
    assert.equal(calls[1]!.count, 4);
    assert.ok(calls[1]!.last_at! >= calls[1]!.at);
    assert.equal(calls[1]!.code, "feed_source_invalid_state");
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

test("a command cancelled, revoked or disabled before its handler started leaves a 「未执行」 row under the number of its operation, and a handler that ran and failed leaves one without the mark", { timeout: 60_000 }, async () => {
  const home = mkdtempSync(join(tmpdir(), "action-call-log-before-handler-"));
  const dbPath = join(home, "project.db");
  seedDemoBoard(dbPath, PROJECT);
  let availability: ActionAvailability = { available: true };
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: () => availability });
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
    await operation(aborted, () => client.invoke({ ...caller, signal: AbortSignal.abort() }, s.register, register));
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
    await assert.rejects(client.invoke(caller, s.disconnect, { source_id: source.source_id }), { code: "feed_source_invalid_state" });
    assert.deepEqual(host.callLog!.list(PROJECT).slice(0, 2).map(row => [row.capability_id, row.ok, row.code, row.refused]),
      [[s.disconnect.capability_id, false, "feed_source_invalid_state", undefined], [s.register.capability_id, true, undefined, undefined]]);
    assert.equal(host.callLog!.list(PROJECT).length, 5);
  } finally {
    await host.close();
    rmSync(home, { recursive: true, force: true });
  }
});

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

test("a read is recorded only when it failed, a wait never, and a row says which kind of call it was", () => logOf("operations", (_home, log) => {
  log.record(callBy(), action("r.ok", "query"), { ok: true });
  log.record(callBy(), action("r.failed", "query"), { ok: false, code: "r.failed", message: "读取失败" });
  log.record(callBy(), action("r.refused", "query"), refusal("actions.forbidden", "无权"));
  log.record(callBy(), action("w.ok", "wait"), { ok: true });
  log.record(callBy(), action("w.failed", "wait"), { ok: false, message: "等待失败" });
  log.record(callBy(), action("missing.id", "unknown"), refusal("actions.missing", "没有这项能力"));
  log.record(callBy(), action("c.ok"), { ok: true });
  assert.deepEqual(log.list(null).map(row => [row.capability_id, row.operation]), [["c.ok", "command"], ["missing.id", "unknown"], ["r.refused", "query"], ["r.failed", "query"]]);
}));

test("a call through the Host's typed port is a row of its own kind, named for the Host and with no provider to tell search about", () => logOf("typed", (_home, log) => {
  const call = callBy();
  log.record(call, { capability_id: "agent.run.start", version: 1, provider_id: undefined, operation: "command", title: "agent.run.start", provider_title: "Molis Work", path: "typed" }, { ok: true });
  const [row] = log.list(null);
  assert.deepEqual([row!.call_id, row!.path, row!.provider_id, row!.provider_title, row!.operation], [call.call_id, "typed", "", "Molis Work", "command"]);
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
