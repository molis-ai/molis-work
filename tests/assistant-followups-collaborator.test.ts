import { noticeText, savedText } from "./fixtures/assistant-saved-text.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { DUE_REMINDERS_INPUT_TYPE, DUE_REMINDERS_OUTPUT_TYPE } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentScheduleCapability, AgentScheduledTask } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantRule, AssistantSavedText } from "@molis-ai/molis-work-contracts/services/assistant";
import { AssistantFollowUpRecords, AssistantFollowUps, AssistantStore, FOLLOW_UP_KIND, type AssistantFollowUpPorts } from "@molis-ai/molis-work-app-local-host";

/**
 * W4-05: the Assistant's reminders and follow-ups are a collaborator of their own, shaped like a package. These run it on
 * its ports alone — no AssistantService, no Agent Host, a queue and a clock of the test's — which is what lets the
 * Assistant later move into its own package as a plain directory move.
 */

interface Work { work_id: string; title: string; session_id: string | null; archived: boolean }

function harness(start = "2026-10-15T08:00:00.000Z", options: { file?: string; timeZone?: string; failSend?: string } = {}) {
  const db = new DatabaseSync(options.file ?? ":memory:");
  let now = new Date(start);
  const store = new AssistantStore(db, () => now);
  const works = new Map<string, Work>([["w1", { work_id: "w1", title: "周报", session_id: "s1", archived: false }]]);
  const changed: string[] = [], notices: Array<{ text: AssistantSavedText; dedupe: string }> = [];
  // What the collaborator hands the send port: a bound key and its arguments, never a sentence written at the call site.
  type SendWords = Parameters<AssistantFollowUpPorts<Work>["send"]>[1];
  const sent: Array<{ words: SendWords; requestId: string }> = [];
  const settings = new Map<string, string>();
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
    actorId: "person", records: new AssistantFollowUpRecords(db, workId => changed.push(workId)), now: () => now, timeZone: options.timeZone ?? "Asia/Shanghai",
    work: id => { const work = works.get(id); if (!work) throw new Error("gone"); return work; },
    notify: (notice, dedupe) => { if (!store.raiseNotice("person", notice, dedupe)) return false; notices.push({ text: notice.text, dedupe }); return true; },
    setting: key => settings.get(key) ?? null, setSetting: (key, value) => { settings.set(key, value); },
    rules: () => rules, setRules: next => { rules = [...next]; }, pages: async () => ["home"],
    get homeActions() { return homeActions; },
    host: async () => ({}) as never, state: async () => "idle",
    send: async (_work, words, requestId) => { sent.push({ words, requestId }); if (options.failSend !== undefined) throw new Error(options.failSend); },
    schedule: async () => schedule,
  };
  return { followUps: new AssistantFollowUps(ports), tasks, sent, notices, changed, settings, works, db, store,
    run: async (key: string) => { assert.ok(runner, "a runner is attached"); await runner!(tasks.get(key)!); },
    at: (iso: string) => { now = new Date(iso); }, setHome: (actions: typeof homeActions) => { homeActions = actions; } };
}

test("FSS-38 FSS-39 nonempty follow-ups and notices retain stable keys, zoned instants and long original failures after a v1 restart", async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis-assistant-saved-text-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "assistant.db"), timeZone = "America/Los_Angeles";
  const original = "Original upstream failure <file>\n" + "原始错误内容，保留末尾。\n".repeat(230) + "EOF & 尾句";
  const failureAt = "2026-03-08T09:59:00.000Z", missedAt = "2026-03-08T10:00:37.000Z";
  const live = harness("2026-03-08T09:00:00.000Z", { file, timeZone, failSend: original });
  let missedId = "";
  try {
    const failed = await live.followUps.save({ work_id: "w1", text: "查原始记录", at: failureAt, label: "失败的跟进" });
    const missed = await live.followUps.save({ work_id: "w1", text: "未改写的安排", at: missedAt, label: "DST 原文" });
    missedId = missed.followup_id;
    live.at("2026-03-08T09:59:30.000Z");
    await live.run(`fu-${failed.followup_id}-${Date.parse(failureAt)}`);
    live.at("2026-03-08T10:15:00.000Z");
    await live.run(`fu-${missedId}-${Date.parse(missedAt)}`);
    assert.equal(live.sent.length, 1, "a missed follow-up never sends a late round");
  } finally { live.db.close(); }
  const restarted = harness("2026-03-08T10:15:00.000Z", { file, timeZone });
  try {
    assert.equal(restarted.db.prepare("PRAGMA user_version").get()?.user_version, 1);
    const [failed, missed] = restarted.followUps.list("w1");
    assert.deepEqual(failed!.last!.detail, { original });
    assert.equal(savedText(failed!.last!.detail, "en"), original, "no size limit for the upstream's own words");
    assert.equal(savedText(failed!.last!.detail, "zh"), original);
    assert.equal(missed!.text, "未改写的安排");
    assert.deepEqual(missed!.last!.detail, { owner: "workbench", key: "workbench.assistant-followup.missed" });
    assert.match(savedText(missed!.last!.detail, "en")!, /Molis Work was not running/u);
    const [notice] = restarted.store.openNotices("person");
    assert.ok(notice && "key" in notice.text);
    assert.deepEqual(notice.text.args, [{ name: "label", kind: "text", text: "DST 原文" },
      { name: "at", kind: "date", at: missedAt, style: "datetime", time_zone: timeZone }]);
    assert.match(noticeText(notice, "en"), /DST 原文.*3:00:37\sAM/u, "the due time after the DST jump is drawn to the second in its stored zone");
    assert.match(noticeText(notice, "zh"), /错过了「DST 原文」.*03:00:37/u);
    const { notice_id: _id, created_at: _created, state: _state, ...body } = notice;
    assert.equal(restarted.store.raiseNotice("person", body, `followup:${missedId}:${missedAt}:missed`), null);
    assert.deepEqual(restarted.store.openNotices("person"), [notice], "a restart and replay of the same request cannot duplicate or rewrite the row");
  } finally { restarted.db.close(); }
});

test("W4-05-01 a daily follow-up is queued, runs once at its time and queues the next day, on the collaborator's ports alone", async () => {
  const h = harness();
  const saved = await h.followUps.save({ work_id: "w1", text: "整理今天的进展", at: "2026-10-15T10:00:00.000Z", repeat: "daily", label: "每天十八点整理" });
  const key = `fu-${saved.followup_id}-${Date.parse("2026-10-15T10:00:00.000Z")}`;
  assert.deepEqual([...h.tasks.keys()], [key], "the durable queue holds it, not a timer of the Host's");
  assert.deepEqual(h.changed, ["w1"], "the work's page hears that its stored facts changed");
  h.at("2026-10-15T10:00:30.000Z");
  await h.run(key);
  assert.equal(h.sent.length, 1, "one round, keyed by its due time");
  assert.equal(h.sent[0]!.requestId, key);
  assert.deepEqual(h.sent[0]!.words, { owner: "workbench", key: "workbench.assistant-followup.scheduled-message",
    args: [{ name: "label", kind: "text", text: "每天十八点整理" }, { name: "text", kind: "text", text: "整理今天的进展" }] },
  "the timed round carries a bound key and the person's own words, not a Chinese shell built at the call site");
  const [after] = h.followUps.list("w1");
  assert.equal(after?.next_at, "2026-10-16T10:00:00.000Z");
  assert.equal(after?.last?.outcome, "started");
  assert.ok(h.tasks.has(`fu-${saved.followup_id}-${Date.parse("2026-10-16T10:00:00.000Z")}`), "the next day is queued");
  // The task of a time since moved on does nothing.
  await h.run(key);
  assert.equal(h.sent.length, 1);
});

test("W6 the timed round's words are read in the language in use and carry the person's label and request unchanged", async () => {
  const h = harness();
  const saved = await h.followUps.save({ work_id: "w1", text: "整理今天的进展", at: "2026-10-15T10:00:00.000Z", label: "每天十八点整理" });
  h.at("2026-10-15T10:00:30.000Z");
  await h.run(`fu-${saved.followup_id}-${Date.parse("2026-10-15T10:00:00.000Z")}`);
  const words = h.sent[0]!.words;
  const zh = savedText(words as AssistantSavedText, "zh")!, en = savedText(words as AssistantSavedText, "en")!;
  assert.match(zh, /按你的定时安排/u); assert.match(zh, /「每天十八点整理」/u);
  assert.match(en, /Scheduled by you/u); assert.match(en, /“每天十八点整理”/u);
  assert.match(zh, /整理今天的进展/u); assert.match(en, /整理今天的进展/u);
  assert.doesNotMatch(en, /[（）「」：；，、]/u, "English words use English punctuation, not the Chinese marks of the zh sentence");
  assert.notEqual(zh, en, "the sentence is taken from the language in use, not frozen in one language");
});

test("W4-05-01 a follow-up removed before its time does not run, and archiving stops the rest with a reason", async () => {
  const h = harness();
  const first = await h.followUps.save({ work_id: "w1", text: "a", at: "2026-10-15T09:00:00.000Z", label: "一次" });
  const second = await h.followUps.save({ work_id: "w1", text: "b", at: "2026-10-15T09:30:00.000Z", repeat: "weekly", label: "每周" });
  assert.equal(await h.followUps.remove(first.followup_id), true);
  assert.equal(h.tasks.size, 1, "its queued task is cancelled with it");
  await h.followUps.stopForArchive("w1");
  const [stopped] = h.followUps.list("w1");
  assert.equal(stopped?.followup_id, second.followup_id);
  assert.equal(stopped?.enabled, false);
  assert.equal(savedText(stopped?.last?.detail), "这项工作已归档，定时已停用");
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
  assert.deepEqual(siblings, ["assistant-errors.js", "assistant-saved-text.js"], "only the Assistant's shared error table and pure text reference constructor");
  const imports = source.split("\n").filter(line => line.startsWith("import ")).join("\n");
  assert.doesNotMatch(imports, /AssistantStore|AssistantService/, "the store and the service are reached through ports");
});
