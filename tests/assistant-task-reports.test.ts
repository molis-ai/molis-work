import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { BackgroundTaskRow, BackgroundTasksReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import { backgroundTaskRow } from "@molis-ai/molis-work-service-mainline";
import { ASSISTANT_AGENT, ASSISTANT_REPORT_ROLE_ID, AssistantReportRounds, AssistantService, AssistantStore, AssistantTaskReports, reportOnlyAuthority, roundStartInput, type TaskReport } from "@molis-ai/molis-work-app-local-host";

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
  assert.deepEqual(asked.map(one => [one.project_id, one.row.subject.id, one.end]), [["p", "t1", "done"]], "only the ended row that reports here: not the running one, not the unmarked one");
  await change("p");
  assert.equal(asked.length, 1, "the same end is reported once");
  tables.set("p", table(row({ state: "failed", updated_at: "2026-11-15T11:00:00.000Z" })));
  await change("p");
  assert.deepEqual(asked.map(one => one.end), ["done", "failed"], "a new end of it is a new report");
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
    start: async (_work, text) => { if (refuse) throw refuse; started.push(text); }, follows: async (_project, job) => followed.has(job) });
  const reportRounds = rounds(store);
  // Ends after the main conversation exists (an end from before it is not news to it, below).
  const later = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
  const report: TaskReport = { project_id: "p", row: row({ updated_at: later(1) }), end: "done" };
  try {
    assert.equal(reportRounds.reportsTo("p"), false);
    assert.equal(await reportRounds.report(report), "none", "no main conversation in the project yet: nothing to report to");
    const main = store.create({ actor_id: "user", title: "", scope: { kind: "project", project_id: "p" }, project_ref: { project_id: "p", storage_key: "memory:p" }, origin: null, main: true });
    store.update("user", main.work_id, null, { session_id: "s-main" });
    assert.equal(reportRounds.reportsTo("p"), true);
    assert.equal(await reportRounds.report({ project_id: "p", row: row({ subject: { kind: "demo_task", id: "t0" }, updated_at: "2020-01-01T00:00:00.000Z" }), end: "done" }), "none",
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
    const other: TaskReport = { project_id: "p", row: row({ subject: { kind: "demo_task", id: "t9" }, updated_at: later(2) }), end: "failed" };
    refuse = Object.assign(new Error("busy"), { code: "assistant.state" });
    assert.equal(await reportRounds.report(other), "later");
    assert.equal(notices().length, 1);
    refuse = undefined;
    // PWA-155: a job a conversation started and follows is that conversation's news, whatever its row says.
    followed.add("t7");
    assert.equal(await reportRounds.report({ project_id: "p", row: row({ subject: { kind: "demo_task", id: "t7" }, updated_at: later(3) }), end: "done" }), "none");
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
    assert.equal(await service.reports.report({ project_id: "p", row: row({ updated_at: new Date(Date.now() + 60_000).toISOString() }), end: "done" }), "reported");
    assert.deepEqual(intents, [{ byHost: true, report_only: true }], "as the Host, a round that only reports");
  } finally { service.continuations.close(); db.close(); }
});
