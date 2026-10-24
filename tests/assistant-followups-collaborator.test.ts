import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { DUE_REMINDERS_INPUT_TYPE, DUE_REMINDERS_OUTPUT_TYPE } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentScheduleCapability, AgentScheduledTask } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantRule } from "@molis-ai/molis-work-contracts/services/assistant";
import { ASSISTANT_STORE_BASELINE, AssistantFollowUpRecords, AssistantFollowUps, FOLLOW_UP_KIND, type AssistantFollowUpPorts } from "@molis-ai/molis-work-app-local-host";

/**
 * W4-05: the Assistant's reminders and follow-ups are a collaborator of their own, shaped like a package. These run it on
 * its ports alone — no AssistantService, no Agent Host, a queue and a clock of the test's — which is what lets the
 * Assistant later move into its own package as a plain directory move.
 */

interface Work { work_id: string; title: string; session_id: string | null; archived: boolean }

function harness(start = "2026-10-15T08:00:00.000Z") {
  const db = new DatabaseSync(":memory:");
  db.exec(ASSISTANT_STORE_BASELINE.schema);
  let now = new Date(start);
  const works = new Map<string, Work>([["w1", { work_id: "w1", title: "周报", session_id: "s1", archived: false }]]);
  const changed: string[] = [], notices: Array<{ text: string; dedupe: string }> = [], sent: Array<{ text: string; requestId: string }> = [];
  const settings = new Map<string, string>(), told = new Set<string>();
  let rules: AssistantRule[] = [];
  const tasks = new Map<string, AgentScheduledTask>();
  let runner: ((task: AgentScheduledTask) => Promise<void>) | null = null;
  const schedule: AgentScheduleCapability = {
    claim: () => ({ survives_window_close: false, why: "test" }),
    enqueue: async input => { const task = { task_id: input.key, attempts: 0, runs: 0, state: "queued" as const, max_attempts: undefined, ...input }; tasks.set(input.key, task); return task; },
    cancel: async key => { const task = tasks.get(key) ?? null; tasks.delete(key); return task; },
    find: key => tasks.get(key) ?? null,
    list: () => [...tasks.values()],
    handle: (kind, run) => { assert.equal(kind, FOLLOW_UP_KIND); runner = run; return () => { runner = null; }; },
  };
  let homeActions: AssistantFollowUpPorts<Work>["homeActions"];
  const ports: AssistantFollowUpPorts<Work> = {
    actorId: "person", records: new AssistantFollowUpRecords(db, workId => changed.push(workId)), now: () => now, timeZone: "Asia/Shanghai",
    work: id => { const work = works.get(id); if (!work) throw new Error("gone"); return work; },
    assertCanSchedule: work => { assert.equal(works.get(work.work_id)?.archived, false, "the fixture owner admits only active Work"); },
    notify: (notice, dedupe) => { if (told.has(dedupe)) return false; told.add(dedupe); notices.push({ text: notice.text, dedupe }); return true; },
    setting: key => settings.get(key) ?? null, setSetting: (key, value) => { settings.set(key, value); },
    rules: () => rules, setRules: next => { rules = [...next]; }, pages: async () => ["home"],
    get homeActions() { return homeActions; },
    host: async () => ({}) as never, state: async () => "idle",
    send: async (_work, text, requestId) => { sent.push({ text, requestId }); },
    schedule: async () => schedule,
  };
  return { followUps: new AssistantFollowUps(ports), tasks, sent, notices, changed, settings, works,
    run: async (key: string) => { assert.ok(runner, "a runner is attached"); await runner!(tasks.get(key)!); },
    at: (iso: string) => { now = new Date(iso); }, setHome: (actions: typeof homeActions) => { homeActions = actions; } };
}

test("W4-05-01 a daily follow-up is queued, runs once at its time and queues the next day, on the collaborator's ports alone", async () => {
  const h = harness();
  const saved = await h.followUps.save({ work_id: "w1", text: "整理今天的进展", at: "2026-10-15T10:00:00.000Z", repeat: "daily", label: "每天十八点整理" });
  const key = `fu-${saved.followup_id}-${Date.parse("2026-10-15T10:00:00.000Z")}`;
  assert.deepEqual([...h.tasks.keys()], [key], "the durable queue holds it, not a timer of the Host's");
  assert.deepEqual(h.changed, ["w1"], "the work's page hears that its stored facts changed");
  h.at("2026-10-15T10:00:30.000Z");
  await h.run(key);
  assert.deepEqual(h.sent, [{ text: "（按你的定时安排「每天十八点整理」）整理今天的进展", requestId: key }], "one round, keyed by its due time");
  const [after] = h.followUps.list("w1");
  assert.equal(after?.next_at, "2026-10-16T10:00:00.000Z");
  assert.equal(after?.last?.outcome, "started");
  assert.ok(h.tasks.has(`fu-${saved.followup_id}-${Date.parse("2026-10-16T10:00:00.000Z")}`), "the next day is queued");
  // The task of a time since moved on does nothing.
  await h.run(key);
  assert.equal(h.sent.length, 1);
});

test("W4-05-01 a follow-up removed before its time does not run, and archiving stops the rest with a reason", async () => {
  const h = harness();
  const first = await h.followUps.save({ work_id: "w1", text: "a", at: "2026-10-15T09:00:00.000Z", label: "一次" });
  const second = await h.followUps.save({ work_id: "w1", text: "b", at: "2026-10-15T09:30:00.000Z", repeat: "weekly", label: "每周" });
  assert.equal(await h.followUps.remove(first.followup_id), true);
  assert.equal(h.tasks.size, 1, "its queued task is cancelled with it");
  await h.followUps.stopForArchive("w1", { beforeEffect: async () => {}, assert_current: () => {} });
  const [stopped] = h.followUps.list("w1");
  assert.equal(stopped?.followup_id, second.followup_id);
  assert.equal(stopped?.enabled, false);
  assert.equal(stopped?.last?.detail, "这项工作已归档，定时已停用");
  assert.equal(h.tasks.size, 0);
  assert.equal(h.followUps.pending(), false);
});

test("W4-05-02 due reminders are told once each, and a Plugin that did not answer is asked about the same stretch again", async () => {
  const h = harness("2026-10-15T08:00:00.000Z");
  const view = (provider: string) => ({ capability_id: `${provider}.due`, version: 1, provider: { provider_id: provider },
    action: { input_type: DUE_REMINDERS_INPUT_TYPE, output_type: DUE_REMINDERS_OUTPUT_TYPE }, availability: { available: true } });
  let todoFails = true;
  h.setHome(async () => ({
    discover: async () => [view("todo"), view("schedule")] as never,
    invoke: async reference => {
      if (reference.provider_id === "todo" && todoFails) throw new Error("no answer");
      return { source: { title: reference.provider_id }, reminders: [
        { reminder_id: "r1", title: "交周报", due_at: "2026-10-15T07:58:00.000Z", project_id: null },
        { reminder_id: "r2", title: "明天的", due_at: "2026-10-16T07:58:00.000Z", project_id: null },
      ] };
    },
  }));
  assert.equal(await h.followUps.sweepReminders(), 1, "only the one that came due is told");
  assert.equal(h.settings.get("reminder_sweep"), undefined, "one Plugin did not answer: the stretch is asked again");
  todoFails = false;
  h.at("2026-10-15T08:01:00.000Z");
  assert.equal(await h.followUps.sweepReminders(), 1, "the Plugin that answered now tells its reminder; the other's is not told twice");
  assert.equal(h.settings.get("reminder_sweep"), "2026-10-15T08:01:00.000Z");
  assert.deepEqual(h.notices.map(notice => notice.dedupe).sort(), ["reminder:schedule:r1", "reminder:todo:r1"]);
});

test("W4-05-02 attention rules are checked strictly and kept through the rules port", () => {
  const h = harness();
  assert.throws(() => h.followUps.saveRule({ kind: "pause", label: "开会" } as never), /暂停提醒要有结束时间/);
  const [rule] = h.followUps.saveRule({ kind: "quiet", surfaces: ["pages", "Bad Id"], label: "写作时不打扰" } as never);
  assert.deepEqual(rule?.surfaces, ["pages"]);
  assert.equal(h.followUps.rules().length, 1);
  assert.deepEqual(h.followUps.removeRule(rule!.rule_id), []);
});

test("W4-05-03 the collaborator depends on its own ports only: no import of another Assistant module's implementation", () => {
  const source = readFileSync(new URL("../apps/local-host/src/assistant/assistant-followups.ts", import.meta.url), "utf8");
  const siblings = [...source.matchAll(/from "\.\/([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(siblings, ["assistant-errors.js"], "only the Assistant's shared error table, which moves with it");
  const imports = source.split("\n").filter(line => line.startsWith("import ")).join("\n");
  assert.doesNotMatch(imports, /AssistantStore|AssistantService/, "the store and the service are reached through ports");
});
