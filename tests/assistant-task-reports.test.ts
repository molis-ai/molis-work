import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { BackgroundTaskRow, BackgroundTasksReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import { backgroundTaskRow } from "@molis-ai/molis-work-service-mainline";
import { ASSISTANT_AGENT, ASSISTANT_REPORT_ROLE_ID, ASSISTANT_STORE_BASELINE, ASSISTANT_STORE_NAME, AssistantReportRounds, AssistantService, AssistantStore, AssistantTaskReports, reportOnlyAuthority, reportTurn, roundStartInput, type TaskReport } from "@molis-ai/molis-work-app-local-host";

// specs/work-line contract-design §9 and spec.md (user decision 2026-11-15): a task no conversation started marks its row
// `reports_to: "assistant"`; once the table shows it ended, the scope's Assistant runs one round in the main conversation that
// only reports (PWA-155), once across restarts (PWA-157), and that round can read but not act.

const SOURCE = { capability_id: "demo.tasks", version: 1, provider_id: "plugin:demo" };
const ORIGIN = { surface: "demo", title: "示例", icon: "list" };
const task = (over: Record<string, unknown> = {}) => ({ subject: { kind: "demo_task", id: "t1" }, title: "整理周报", state: "done", details: [], waiting: false, updated_at: "2026-11-15T10:00:00.000Z",
  executor: { kind: "plugin", label: "示例" }, serves: [], scope: "project", commands: [], decisions: [], open: null, reports_to: "assistant", ...over });
const row = (over: Record<string, unknown> = {}) => backgroundTaskRow(task(over), SOURCE, ORIGIN, ["demo_task"])!;
const table = (...tasks: BackgroundTaskRow[]): BackgroundTasksReadResult => ({ tasks, issues: [] });

test("PWA-155 a row may say it reports to the Assistant, and says nothing else there", () => {
  assert.equal(row().reports_to, "assistant");
  assert.equal(backgroundTaskRow(task({ reports_to: undefined }), SOURCE, ORIGIN, ["demo_task"])?.reports_to, undefined);
  assert.equal(backgroundTaskRow(task({ reports_to: "goals" }), SOURCE, ORIGIN, ["demo_task"]), null, "only the Assistant is a place to report to");
});

function reports(tables: Map<string, BackgroundTasksReadResult>, answer: (report: TaskReport) => "reported" | "later" | "none" = () => "reported", without = new Set<string>()) {
  let listener: ((projectId: string | null) => void) | undefined;
  const asked: TaskReport[] = [], read: string[] = [];
  const watcher = new AssistantTaskReports({ table: async id => { read.push(id); return tables.get(id) ?? table(); },
    reportsTo: id => !without.has(id), changes: next => { listener = next; return () => { listener = undefined; }; }, report: async report => { asked.push(report); return answer(report); } });
  watcher.start();
  return { watcher, asked, read, change: async (projectId: string | null) => { listener?.(projectId); await watcher.idle(); }, listening: () => Boolean(listener) };
}

test("PWA-155 PWA-157 an ended task that reports to the Assistant is reported once, from the project that changed, and nothing else is", async () => {
  const tables = new Map([["p", table(row(), row({ subject: { kind: "demo_task", id: "t2" }, state: "running" }), row({ subject: { kind: "demo_task", id: "t3" }, reports_to: undefined }))]]);
  const { watcher, asked, read, change, listening } = reports(tables);
  await change(null);
  assert.deepEqual(read, [], "the Assistant's own store changing reads no table while nothing waits");
  await change("p");
  assert.deepEqual(asked.map(one => [one.project_id, one.tasks.map(task => [task.row.subject.id, task.end])]), [["p", [["t1", "done"]]]], "only the ended row that reports here: not the running one, not the unmarked one");
  await change("p");
  assert.equal(asked.length, 1, "the same end is reported once");
  tables.set("p", table(row({ state: "failed", updated_at: "2026-11-15T11:00:00.000Z" })));
  await change("p");
  assert.deepEqual(asked.map(one => one.tasks.map(task => task.end)), [["done"], ["failed"]], "a new end of it is a new report");
  watcher.close();
  assert.equal(listening(), false, "closed, it hears nothing more");
});

test("PWA-155 a project with no main conversation to report to is not read at all", async () => {
  const { asked, read, change } = reports(new Map([["p", table(row())]]), () => "reported", new Set(["p"]));
  await change("p");
  assert.deepEqual([read, asked.length], [[], 0], "nothing could be told there, so its table is not read");
});

test("PWA-157 a main conversation busy answering is reported to once its round ends, not in the middle of it", async () => {
  let busy = true;
  const { asked, change } = reports(new Map([["p", table(row())]]), () => busy ? "later" : "reported");
  await change("p");
  assert.equal(asked.length, 1);
  busy = false;
  await change(null);
  assert.equal(asked.length, 2, "the Assistant's store changed (its round ended): looked at again");
  await change(null);
  assert.equal(asked.length, 2, "and once reported, not again");
});

const view = (id: string, operation: "query" | "command") => ({ capability_id: id, version: 1, operation, provider: { provider_id: "plugin:demo" }, action: { title: id } }) as ActionView;

test("PWA-156 the report's round reads and does nothing else: no command, no sub-task, no proposal, no delivery, no memory", async () => {
  const invoked: string[] = [];
  const full = { manifest: {}, prompts: {}, authorizedDirectories: [], actions: async () => ({
    discover: async () => [view("demo.read", "query"), view("demo.write", "command")],
    delegate: {}, deliver: {}, memory: { list: async () => [] }, offer: async () => ({ offer_id: "o" }), direct: () => true,
    invoke: async (reference: { capability_id: string }) => { invoked.push(reference.capability_id); return { ok: true }; } }) } as AgentStartAuthority;
  const client = await reportOnlyAuthority(full).actions!("prologue");
  assert.deepEqual((await client.discover()).map(one => one.capability_id), ["demo.read"], "only what reads is offered");
  for (const missing of ["delegate", "deliver", "memory", "offer"] as const) assert.equal(client[missing], undefined, `${missing} is not given`);
  assert.equal(client.direct?.(view("demo.write", "command")), false);
  assert.deepEqual(await client.invoke({ capability_id: "demo.read", version: 1, provider_id: "plugin:demo" }, {}), { ok: true });
  await assert.rejects(client.invoke({ capability_id: "demo.write", version: 1, provider_id: "plugin:demo" }, {}), (error: { code?: string }) => error.code === "assistant.action_revoked");
  assert.deepEqual(invoked, ["demo.read"], "a command is refused before it reaches its provider");
});

test("PWA-156 the report's round runs as a read-only role with no host tools, and never drives the side panel's browser", () => {
  const role = ASSISTANT_AGENT.roles.find(one => one.role_id === ASSISTANT_REPORT_ROLE_ID);
  assert.equal(role?.execution, "read-only", "queries only, a browser only looked at");
  assert.deepEqual(role?.host_tools, [], "it waits on nothing and asks nothing: no host tool, so it takes up no continuation of the conversation");
  assert.deepEqual(role?.prompts, ["assistant-base"], "read-only report role omits work/main prompts whose tools are unavailable");
  const work = { work_id: "w", title: "主对话", scope: { kind: "project", project_id: "p" }, project_ref: { project_id: "p", storage_key: "memory:p" }, main: true } as never;
  const round = { actor_id: "user", session: { runtime_id: "prologue", session_id: "s" }, role_id: ASSISTANT_REPORT_ROLE_ID, task: "t", text_materials: [], materials: [] } as never;
  assert.equal(roundStartInput(work, { ...(round as object), report_only: true } as never).browser, false);
  assert.equal(roundStartInput(work, round).browser, undefined, "a main conversation's own round keeps the side panel");
});

// PWA-133: a task no conversation started reports back to the main conversation once.
test("PWA-155 PWA-157 the Assistant tells the person once and starts one round that only reports, in the project's main conversation", async () => {
  const db = new DatabaseSync(":memory:"), store = new AssistantStore(db);
  let latest: { phase: AgentRunView["phase"] } | null = null, continuation: string | undefined, refuse: Error | undefined;
  const started: string[] = [], followed = new Set<string>();
  const rounds = (on: AssistantStore) => new AssistantReportRounds({ store: on, actorId: "user", session: async () => ({ latest_run: latest }), continuation: async () => continuation,
    start: async (_work, text) => { if (refuse) throw refuse; started.push(text); }, followed: async () => followed });
  const reportRounds = rounds(store);
  // Ends after the main conversation exists (an end from before it is not news to it, below).
  const later = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
  const report: TaskReport = { project_id: "p", tasks: [{ row: row({ updated_at: later(1) }), end: "done" }] };
  try {
    assert.equal(reportRounds.reportsTo("p"), false);
    assert.equal(await reportRounds.report(report), "none", "no main conversation in the project yet: nothing to report to");
    const main = store.create({ actor_id: "user", title: "", scope: { kind: "project", project_id: "p" }, project_ref: { project_id: "p", storage_key: "memory:p" }, origin: null, main: true });
    store.update("user", main.work_id, null, { session_id: "s-main" });
    assert.equal(reportRounds.reportsTo("p"), true);
    assert.equal(await reportRounds.report({ project_id: "p", tasks: [{ row: row({ subject: { kind: "demo_task", id: "t0" }, updated_at: "2020-01-01T00:00:00.000Z" }), end: "done" }] }), "none",
      "a task that ended before the main conversation existed is not told to it");
    latest = { phase: "running" };
    assert.equal(await reportRounds.report(report), "later", "answering now: later");
    latest = { phase: "completed" };
    continuation = "eligible";
    assert.equal(await reportRounds.report(report), "later", "a continuation the conversation may take up is left to it");
    continuation = undefined;
    assert.equal(await reportRounds.report(report), "reported");
    assert.equal(started.length, 1);
    assert.match(started[0]!, /整理周报[\s\S]*只汇报/u);
    const notices = () => (db.prepare("SELECT kind, work_id FROM assistant_notices").all() as Array<{ kind: string; work_id: string }>).map(one => [one.kind, one.work_id]);
    assert.deepEqual(notices(), [["completed", main.work_id]]);
    // A round that began in between: the report waits for it, nothing is marked told.
    const other: TaskReport = { project_id: "p", tasks: [{ row: row({ subject: { kind: "demo_task", id: "t9" }, updated_at: later(2) }), end: "failed" }] };
    refuse = Object.assign(new Error("busy"), { code: "assistant.state" });
    assert.equal(await reportRounds.report(other), "later");
    assert.equal(notices().length, 1);
    refuse = undefined;
    // PWA-155: a job a conversation started and follows is that conversation's news, whatever its row says.
    followed.add("t7");
    assert.equal(await reportRounds.report({ project_id: "p", tasks: [{ row: row({ subject: { kind: "demo_task", id: "t7" }, updated_at: later(3) }), end: "done" }] }), "none");
    assert.deepEqual([started.length, notices().length], [1, 1]);
    // Restarted: the same end is not reported again.
    assert.equal(await rounds(new AssistantStore(db)).report(report), "none");
    assert.equal(started.length, 1);
    assert.equal(notices().length, 1);
  } finally { db.close(); }
});

test("PWA-156 the Assistant starts a report as the Host, with a round that only reports", async () => {
  const db = new DatabaseSync(":memory:"), store = new AssistantStore(db);
  const host = { adapter: () => ({ readSession: async () => ({ latest_run: null }) }) };
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => host as never, authority: async () => { throw new Error("not reached"); } }, "user");
  const intents: unknown[] = [];
  service.dispatcher.dispatch = async (...args: Parameters<typeof service.dispatcher.dispatch>) => { intents.push(args[9]); return {} as never; };
  try {
    const main = store.create({ actor_id: "user", title: "", scope: { kind: "project", project_id: "p" }, project_ref: { project_id: "p", storage_key: "memory:p" }, origin: null, main: true });
    store.update("user", main.work_id, null, { session_id: "s-main" });
    assert.equal(await service.reports.report({ project_id: "p", tasks: [{ row: row({ updated_at: new Date(Date.now() + 60_000).toISOString() }), end: "done" }] }), "reported");
    assert.deepEqual(intents, [{ byHost: true, report_only: true }], "as the Host, a round that only reports");
  } finally { service.continuations.close(); db.close(); }
});

// Batch 97-1 (specs/post-anticorruption-roadmap/reference/batches/97.md): a round that only reports is no step the work took by itself. It neither
// counts toward the rounds in a row a work may go on alone (DELEGATION_LIMITS.autoRounds, 8) nor starts that count again.
const mainWork = (store: AssistantStore) => {
  const work = store.create({ actor_id: "user", title: "主对话", scope: { kind: "project", project_id: "p" }, project_ref: { project_id: "p", storage_key: "memory:p" }, origin: null, main: true });
  return store.update("user", work.work_id, null, { session_id: "s-main" });
};
const roundOf = (runId: string, over: Record<string, unknown> = {}) => ({ run_id: runId, text: "t", materials: [], context: null, started_at: new Date().toISOString(), ...over });

test("RRC-01 RRC-02 rounds that only report neither use up nor start again what a work may do on its own, across a restart: it still stops at the cap", async () => {
  const home = await mkdtemp(join(tmpdir(), "molis-report-rounds-"));
  const open = () => openBaselineHomeSqlite(home, ASSISTANT_STORE_NAME, ASSISTANT_STORE_BASELINE);
  let db = open(), store = new AssistantStore(db);
  const work = mainWork(store);
  store.addRound(work.work_id, roundOf("person"));
  for (let i = 1; i <= 7; i++) store.addRound(work.work_id, roundOf(`went-on-${i}`, { written_by: "host" }));
  for (let i = 1; i <= 3; i++) store.addRound(work.work_id, roundOf(`report-${i}`, { written_by: "host", report_only: true }));
  db.close();
  // Restarted: the stored mark, not anything this process remembered, tells a report from a round the work went on in.
  db = open(); store = new AssistantStore(db);
  const stored = (runId: string) => store.rounds(work.work_id).find(round => round.run_id === runId);
  assert.equal(stored("report-2")?.report_only, true);
  let view: unknown;
  const host = { adapter: () => ({ readSession: async () => ({ latest_run: null }), collaboration: { read: async () => [view] } }) };
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => host as never, authority: async () => { throw new Error("not reached"); } }, "user");
  let runs = 0;
  service.dispatcher.dispatch = async (...args: Parameters<typeof service.dispatcher.dispatch>) => {
    const [on, text, , , , writtenBy, , , , intent] = args, runId = `run-${++runs}`;
    store.addRound(on.work_id, roundOf(runId, { text, written_by: writtenBy, ...(intent?.report_only ? { report_only: true } : {}) }));
    return { run_id: runId } as never;
  };
  const eligible = (key: string) => { view = { wait: { wait_id: `w-${key}`, state: "satisfied", by: "model", reason: "条件已满足" }, continuation: { state: "eligible", auto: true, request_key: key, graph_id: "g", node_id: "n" } }; };
  try {
    eligible("k8");
    assert.deepEqual(await service.continuations.takeUp(store.get("user", work.work_id)), { run: { run_id: "run-1", session_id: "s-main" } },
      "seven rounds it went on in and three reports after them: the eighth on its own still starts");
    view = undefined; // its continuation taken up: nothing eligible is left for a report to wait on
    assert.equal(await service.reports.report({ project_id: "p", tasks: [{ row: row({ updated_at: new Date(Date.now() + 60_000).toISOString() }), end: "done" }] }), "reported");
    assert.equal(stored("run-2")?.report_only, true, "the report's own round is stored as one");
    eligible("k9");
    const refused = await service.continuations.takeUp(store.get("user", work.work_id));
    assert.equal((refused as { refused?: { code: string } }).refused?.code, "assistant.auto_round_cap", "the ninth stops at the cap, as without any report");
    assert.equal(runs, 2, "nothing started for it");
    assert.ok(service.notices.notices(null).some(notice => notice.work_id === work.work_id && "original" in notice.text && notice.text.label?.key === "workbench.assistant-notice.handoff-blocked"), "the person is told why it stopped");
    store.addRound(work.work_id, roundOf("person-again"));
    store.addRound(work.work_id, roundOf("report-after", { written_by: "host", report_only: true }));
    eligible("k10");
    assert.deepEqual(await service.continuations.takeUp(store.get("user", work.work_id)), { run: { run_id: "run-3", session_id: "s-main" } },
      "the person's word starts the count again; a report after it does not stand in for it");
  } finally { service.continuations.close(); db.close(); await rm(home, { recursive: true, force: true }); }
});

test("RRC-03 a store written before opens as it is, at the same version: rounds with no mark keep their meaning, nothing is guessed from words", async () => {
  const home = await mkdtemp(join(tmpdir(), "molis-report-rounds-existing-"));
  // User 2026-11-19 (batch 97): no version raise and no migration. A round the Host wrote before the mark existed stays an ordinary
  // Host round, whatever its words say; only rounds started from now on carry `report_only`.
  const report = "（Molis 转告）后台任务「整理周报」已经办完：已汇总。这项任务由「示例」发起，不是从这段对话派出的。请用一两句话向用户汇报结果，需要时给出建议；这一轮只汇报，不接着做、不派新任务、不做任何改动。";
  let db = openBaselineHomeSqlite(home, ASSISTANT_STORE_NAME, ASSISTANT_STORE_BASELINE);
  let position = 0;
  const raw = (round: ReturnType<typeof roundOf>) => db.prepare("INSERT INTO assistant_rounds(work_id,run_id,position,body) VALUES (?,?,?,?)").run("w-old", round.run_id, ++position, JSON.stringify(round));
  raw(roundOf("person"));
  raw(roundOf("went-on", { written_by: "host" }));
  raw(roundOf("old-report", { written_by: "host", text: report }));
  const before = db.prepare("SELECT body FROM assistant_rounds ORDER BY position").all().map(row => String(row.body));
  db.close();
  db = openBaselineHomeSqlite(home, ASSISTANT_STORE_NAME, ASSISTANT_STORE_BASELINE);
  const store = new AssistantStore(db);
  try {
    assert.equal((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, ASSISTANT_STORE_BASELINE.version, "the same version: nothing to upgrade");
    assert.deepEqual(db.prepare("SELECT body FROM assistant_rounds ORDER BY position").all().map(row => String(row.body)), before, "the rows are not rewritten");
    assert.deepEqual(store.rounds("w-old").map(round => [round.run_id, round.report_only ?? false]), [["person", false], ["went-on", false], ["old-report", false]],
      "an old round is not taken for a report by its words");
    store.addRound("w-old", roundOf("new-report", { written_by: "host", report_only: true }));
    assert.equal(store.rounds("w-old", 1)[0]?.report_only, true, "a report from now on is stored as one");
  } finally { db.close(); await rm(home, { recursive: true, force: true }); }
});

// Batch 97-2 (specs/post-anticorruption-roadmap/reference/batches/97.md): what one read of a project's table finds ended goes to its main
// conversation in one round; a busy conversation has all of it wait; each task is still told once, by its own notice.
const ENDED_AT = new Date(Date.now() + 60_000).toISOString(); // after the main conversations below exist
const ended = (id: string, over: Record<string, unknown> = {}) => row({ subject: { kind: "demo_task", id }, title: `任务${id}`, updated_at: ENDED_AT, ...over });

test("WRB-01 WRB-02 two tasks of one project ending together are one report; another project's are its own", async () => {
  const tables = new Map([["p", table(ended("a"), ended("b", { state: "failed" }))], ["q", table(ended("c"))]]);
  const { asked, change } = reports(tables);
  await change("p");
  await change("q");
  assert.deepEqual(asked.map(one => [one.project_id, one.tasks.map(task => [task.row.subject.id, task.end])]),
    [["p", [["a", "done"], ["b", "failed"]]], ["q", [["c", "done"]]]], "one report per project and read, never one that mixes projects");
});

test("WRB-03 a busy main conversation has the whole batch wait, and what ended meanwhile joins it", async () => {
  let busy = true;
  const tables = new Map([["p", table(ended("a"), ended("b"))]]);
  const { asked, change } = reports(tables, () => busy ? "later" : "reported");
  await change("p");
  tables.set("p", table(ended("a"), ended("b"), ended("c")));
  busy = false;
  await change(null);
  assert.deepEqual(asked.map(one => one.tasks.map(task => task.row.subject.id)), [["a", "b"], ["a", "b", "c"]], "nothing told while busy; then all three in one report");
  await change("p");
  assert.equal(asked.length, 2, "and each only once");
});

test("WRB-01 WRB-03 WRB-04 one round lists every result, busy waits whole, a retry tells each task once, and another project stays apart", async () => {
  const db = new DatabaseSync(":memory:"), store = new AssistantStore(db);
  let latest: { phase: AgentRunView["phase"] } | null = { phase: "running" }, refuse: Error | undefined;
  const started: Array<{ work: string; text: string }> = [];
  const rounds = (on: AssistantStore) => new AssistantReportRounds({ store: on, actorId: "user", session: async () => ({ latest_run: latest }), continuation: async () => undefined,
    start: async (work, text) => { if (refuse) throw refuse; started.push({ work: work.work_id, text }); }, followed: async () => new Set() });
  const reportRounds = rounds(store);
  const notices = () => (db.prepare("SELECT work_id, body FROM assistant_notices ORDER BY created_at").all() as Array<{ work_id: string; body: string }>)
    .map(one => [one.work_id, /任务[a-z]/u.exec(one.body)?.[0]]);
  try {
    const p = mainWork(store);
    const q = store.update("user", store.create({ actor_id: "user", title: "主对话", scope: { kind: "project", project_id: "q" }, project_ref: { project_id: "q", storage_key: "memory:q" }, origin: null, main: true }).work_id, null, { session_id: "s-q" });
    const both: TaskReport = { project_id: "p", tasks: [{ row: ended("a"), end: "done" }, { row: ended("b", { state: "failed", step: { text: "缺少权限" } }), end: "failed" }] };
    assert.equal(await reportRounds.report(both), "later", "busy: the whole batch waits");
    latest = { phase: "completed" };
    refuse = Object.assign(new Error("busy"), { code: "agent.session_busy" });
    assert.equal(await reportRounds.report(both), "later", "a round began in between: still all of it waits");
    assert.deepEqual([started.length, notices().length], [0, 0], "nothing started, nobody told");
    refuse = undefined;
    assert.equal(await reportRounds.report(both), "reported");
    assert.equal(started.length, 1, "one round for both");
    assert.equal(started[0]!.work, p.work_id);
    assert.match(started[0]!.text, /2 项后台任务[\s\S]*「任务a」已经办完[\s\S]*「任务b」没有办成：缺少权限[\s\S]*只汇报/u);
    assert.deepEqual(notices(), [[p.work_id, "任务a"], [p.work_id, "任务b"]], "each task told once, by its own notice");
    // Retried with one already told and one new: only the new one, in a round of its own.
    assert.equal(await reportRounds.report({ project_id: "p", tasks: [{ row: ended("a"), end: "done" }, { row: ended("d"), end: "done" }] }), "reported");
    assert.equal(started.length, 2);
    assert.doesNotMatch(started[1]!.text, /任务a/u, "what was told before is not told again");
    assert.match(started[1]!.text, /^（Molis 转告）后台任务「任务d」已经办完。/u, "one task: told as one always was");
    assert.equal(await rounds(new AssistantStore(db)).report(both), "none", "after a restart, the same ends are not told again");
    // Another project's end goes to its own main conversation only.
    assert.equal(await reportRounds.report({ project_id: "q", tasks: [{ row: ended("c"), end: "done" }] }), "reported");
    assert.deepEqual(started.map(one => one.work), [p.work_id, p.work_id, q.work_id]);
    assert.deepEqual(notices().map(([work]) => work), [p.work_id, p.work_id, p.work_id, q.work_id]);
  } finally { db.close(); }
});

// Batch 97-1: whether the round under way is a report is read from its stored mark (`reports`), not from a list this process kept.
test("RRC-02 a person's words stop a round under way only when its stored mark says it reports; a report never joins a round under way", async () => {
  const ref = { session_id: "s" } as never;
  const run = (phase: string) => ({ latest_run: { ref: { run_id: "r1", session_id: "s" }, phase } }) as never;
  const adapter = (after: string) => {
    const calls: string[] = [];
    return { calls, control: async (_ref: unknown, control: { kind: string }) => { calls.push(control.kind); },
      observe: (_ref: unknown, listener: (view: { phase: string }) => void) => { queueMicrotask(() => listener({ phase: "stopped" })); return () => undefined; },
      readSession: async () => { calls.push("read"); return run(after); } } as never as Parameters<typeof reportTurn>[0] & { calls: string[] };
  };
  const idle = adapter("stopped");
  const ended = run("completed");
  assert.equal(await reportTurn(idle, ref, ended, () => { throw new Error("not asked"); }, false), ended);
  assert.equal(await reportTurn(idle, ref, ended, () => { throw new Error("not asked"); }, true), ended, "a report starts once nothing is under way");
  assert.deepEqual(idle.calls, [], "nothing under way: nothing stopped or read again");

  const answering = adapter("stopped");
  await assert.rejects(reportTurn(answering, ref, run("running"), () => true, true), { code: "assistant.state" }, "a report waits for the round under way");
  assert.deepEqual(answering.calls, []);

  const notReport = adapter("stopped"), session = run("running");
  assert.equal(await reportTurn(notReport, ref, session, runId => { assert.equal(runId, "r1"); return false; }, false), session, "a round with no mark goes on: the words join it");
  assert.deepEqual(notReport.calls, []);

  const report = adapter("stopped");
  assert.deepEqual(await reportTurn(report, ref, run("running"), () => true, false), run("stopped"), "a marked report is stopped and the session read again");
  assert.deepEqual(report.calls, ["stop", "read"]);

  const stuck = adapter("running");
  await assert.rejects(reportTurn(stuck, ref, run("running"), () => true, false), { code: "assistant.state" }, "a report that did not stop keeps the words out");
});

test("WRB-05 followed scans beyond 50 works and propagates jobs.views failure instead of misreporting into main conversation", async () => {
  const db = new DatabaseSync(":memory:");
  const store = new AssistantStore(db);
  let failViews = false;
  let oldestWorkId = "";
  const host = { adapter: () => ({ readSession: async () => ({ latest_run: null }) }) };
  const service = new AssistantService(store, {
    pages: async () => ["home"],
    host: async () => host as never,
    authority: async () => { throw new Error("not reached"); },
  }, "user");
  const started: string[] = [];
  service.dispatcher.dispatch = async (...args: Parameters<typeof service.dispatcher.dispatch>) => {
    started.push(args[1]);
    return {} as never;
  };
  service.jobs.views = async work => {
    if (failViews) throw new Error("jobs read failed");
    if (work.work_id === oldestWorkId) return [{ job_id: "job-oldest" }] as never;
    return [];
  };
  try {
    const oldest = store.create({
      actor_id: "user",
      title: "最早对话",
      scope: { kind: "project", project_id: "p" },
      project_ref: { project_id: "p", storage_key: "memory:p" },
      origin: null,
    });
    oldestWorkId = oldest.work_id;
    // Create 55 more works so the oldest work falls past the default LIMIT 50.
    for (let i = 0; i < 55; i++) {
      store.create({
        actor_id: "user",
        title: `对话-${i}`,
        scope: { kind: "project", project_id: "p" },
        project_ref: { project_id: "p", storage_key: "memory:p" },
        origin: null,
      });
    }
    const main = store.create({
      actor_id: "user",
      title: "主对话",
      scope: { kind: "project", project_id: "p" },
      project_ref: { project_id: "p", storage_key: "memory:p" },
      origin: null,
      main: true,
    });
    store.update("user", main.work_id, null, { session_id: "s-main" });

    const taskReport: TaskReport = {
      project_id: "p",
      tasks: [{ row: ended("job-oldest"), end: "done" }],
    };
    assert.equal(await service.reports.report(taskReport), "none", "oldest work beyond 50 is still found in followed");
    assert.equal(started.length, 0);

    failViews = true;
    await assert.rejects(service.reports.report({
      project_id: "p",
      tasks: [{ row: ended("job-other"), end: "done" }],
    }), /jobs read failed/);
    assert.equal(started.length, 0, "jobs.views error never misreports into main conversation");
  } finally {
    service.continuations.close();
    db.close();
  }
});

test("WRB-06 transient failures retry via pending, batches stay bounded, permanent refusals still raise notice, and executorDispatch rejects report_only", async () => {
  // 1. AssistantTaskReports retries after transient #lookAt failure and caps batch size at 20.
  let listener: ((projectId: string | null) => void) | undefined;
  let failTableOnce = true;
  const many = Array.from({ length: 25 }, (_, i) => ended(`batch-${i}`));
  const seenBatches: number[] = [];
  const watcher = new AssistantTaskReports({
    table: async () => {
      if (failTableOnce) {
        failTableOnce = false;
        throw new Error("temporary table error");
      }
      return table(...many);
    },
    reportsTo: () => true,
    changes: next => {
      listener = next;
      return () => {
        listener = undefined;
      };
    },
    report: async batch => {
      seenBatches.push(batch.tasks.length);
      return "reported";
    },
  });
  watcher.start();
  listener?.("p");
  await watcher.idle();
  assert.deepEqual(seenBatches, [], "transient table error deferred project to pending");
  // Next store change retries the pending project and sends first bounded batch of 20.
  listener?.(null);
  await watcher.idle();
  assert.deepEqual(seenBatches, [20], "first batch capped at 20");
  // Next store change reports the remaining 5.
  listener?.(null);
  await watcher.idle();
  assert.deepEqual(seenBatches, [20, 5], "remaining 5 tasks reported in follow-up batch");
  watcher.close();

  // 2. AssistantReportRounds propagates transient start errors without writing notices, while permanent refusals still raise notices.
  const db = new DatabaseSync(":memory:");
  const store = new AssistantStore(db);
  let startError: Error | undefined;
  const startedTexts: string[] = [];
  const rounds = new AssistantReportRounds({
    store,
    actorId: "user",
    session: async () => ({ latest_run: null }),
    continuation: async () => undefined,
    start: async (_work, text) => {
      if (startError) throw startError;
      startedTexts.push(text);
    },
    followed: async () => new Set(),
  });
  const countNotices = () => (db.prepare("SELECT COUNT(*) AS n FROM assistant_notices").get() as { n: number }).n;
  try {
    mainWork(store);
    const transientReport: TaskReport = { project_id: "p", tasks: [{ row: ended("transient"), end: "done" }] };
    startError = new Error("transient storage error");
    await assert.rejects(rounds.report(transientReport), /transient storage error/);
    assert.equal(countNotices(), 0, "transient error must not write notice receipts");

    startError = undefined;
    assert.equal(await rounds.report(transientReport), "reported");
    assert.equal(startedTexts.length, 1);
    assert.equal(countNotices(), 1);

    const noModelReport: TaskReport = { project_id: "p", tasks: [{ row: ended("nomodel"), end: "failed" }] };
    startError = Object.assign(new Error("no model"), { code: "agent.model_not_configured" });
    assert.equal(await rounds.report(noModelReport), "reported");
    assert.equal(countNotices(), 2, "permanent model refusal still raises one notice");

    // 3. executorDispatch explicitly rejects report_only rounds.
    const host = { adapter: () => ({ readSession: async () => ({ latest_run: null }) }) };
    const service = new AssistantService(store, {
      pages: async () => ["home"],
      host: async () => host as never,
      authority: async () => { throw new Error("not reached"); },
    }, "user");
    const pluginWork = store.create({
      actor_id: "user",
      title: "插件工作",
      scope: { kind: "project", project_id: "p" },
      project_ref: { project_id: "p", storage_key: "memory:p" },
      origin: null,
      executor: { kind: "plugin", plugin_id: "io.molis.work.coding", title: "Coding", session_id: null },
    });
    await assert.rejects(
      service.dispatcher.executorDispatch(pluginWork, "report", [], null, undefined, "host", undefined, { byHost: true, report_only: true }),
      { code: "assistant.unsupported" },
    );
    service.continuations.close();
  } finally {
    db.close();
  }
});
