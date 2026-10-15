import { isDeepStrictEqual } from "node:util";
import type { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { AgentScheduleCapability } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantFollowUp, AssistantWorkState } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AssistantStore, StoredWork } from "./assistant-store.js";

export const FOLLOW_UP_KIND = "assistant.follow-up";
const FOLLOW_UP_GRACE_MS = 10 * 60 * 1000;

/** A running callback updates the row it read, never inserts a removed or changed standing request. */
export function saveFollowUpRecord(db: ReturnType<typeof openHomeSqliteDatabase>, actorId: string,
  followUp: AssistantFollowUp, expected?: AssistantFollowUp): boolean {
  if (expected) return Number(db.prepare("UPDATE assistant_followups SET body=? WHERE actor_id=? AND followup_id=? AND body=?")
    .run(JSON.stringify(followUp), actorId, followUp.followup_id, JSON.stringify(expected)).changes) > 0;
  db.prepare("INSERT INTO assistant_followups(followup_id,actor_id,work_id,body) VALUES (?,?,?,?) ON CONFLICT(followup_id) DO UPDATE SET body=excluded.body")
    .run(followUp.followup_id, actorId, followUp.work_id, JSON.stringify(followUp));
  return true;
}

export function followUpTask(followUp: AssistantFollowUp, sessionId: string) {
  return { key: `fu-${followUp.followup_id}-${Date.parse(followUp.next_at!)}`, session_id: sessionId, kind: FOLLOW_UP_KIND,
    payload: { followup_id: followUp.followup_id }, due_at: followUp.next_at!, max_attempts: 1 };
}

function isCurrent(store: AssistantStore, actor: string, expected: AssistantFollowUp): boolean {
  return isDeepStrictEqual(store.followUps(actor).find(item => item.followup_id === expected.followup_id), expected);
}

export async function enqueueCurrentFollowUp(store: AssistantStore, actor: string, followUp: AssistantFollowUp,
  sessionId: string, schedule: AgentScheduleCapability): Promise<void> {
  if (!isCurrent(store, actor, followUp)) return;
  const task = followUpTask(followUp, sessionId);
  await schedule.enqueue(task);
  if (!isCurrent(store, actor, followUp)) await schedule.cancel(task.key);
}

interface FollowUpPorts {
  store: AssistantStore;
  actorId: string;
  now(): Date;
  host(): Promise<AgentHost>;
  state(host: AgentHost, work: StoredWork): Promise<AssistantWorkState>;
  send(work: StoredWork, text: string, requestId: string, stillCurrent: () => boolean): Promise<unknown>;
  schedule(): Promise<AgentScheduleCapability>;
}

/** Re-read the standing request across awaits; deletion stops future work and its final write. */
export async function runDueFollowUp(followUp: AssistantFollowUp, ports: FollowUpPorts): Promise<void> {
  const { store, actorId } = ports, current = () => isCurrent(store, actorId, followUp);
  if (!current()) return;
  const now = ports.now(), due = followUp.next_at!;
  let outcome: NonNullable<AssistantFollowUp["last"]>["outcome"] = "started", detail: string | undefined;
  let work: StoredWork | undefined;
  try { work = store.get(actorId, followUp.work_id); } catch { outcome = "failed"; detail = "这项工作已不存在"; }
  if (work?.archived) { outcome = "skipped"; detail = "这项工作已归档，这一次没有开始"; }
  else if (work && now.getTime() - Date.parse(due) > FOLLOW_UP_GRACE_MS) {
    outcome = "missed"; detail = "当时 Molis Work 没有在运行，没有补做";
    store.raiseNotice(actorId, { kind: "failed", work_id: work.work_id, work_title: work.title,
      text: `错过了「${followUp.label}」（原定 ${new Date(due).toLocaleString("zh-CN", { timeZone: followUp.time_zone })}）：当时 Molis Work 没有在运行，没有补做` }, `followup:${followUp.followup_id}:${due}:missed`);
  } else if (work) {
    const host = await ports.host();
    if (!current()) return;
    const state = await ports.state(host, work);
    if (!current()) return;
    if (["running", "paused", "waiting-input", "waiting-review"].includes(state)) { outcome = "skipped"; detail = "上一轮还没结束，这一次没有开始"; }
    else {
      try { await ports.send(work, `（按你的定时安排「${followUp.label}」）${followUp.text}`, `fu-${followUp.followup_id}-${Date.parse(due)}`, current); }
      catch (error) { outcome = "failed"; detail = error instanceof Error ? error.message : String(error); }
    }
  }
  if (!current()) return;
  const days = followUp.repeat === "daily" ? 1 : followUp.repeat === "weekly" ? 7 : 0;
  let next = days && !work?.archived ? sameLocalTimeLater(Date.parse(due), days, followUp.time_zone) : undefined;
  while (next !== undefined && next <= now.getTime()) next = sameLocalTimeLater(next, days, followUp.time_zone);
  const { next_at: _next, ...rest } = followUp;
  const saved: AssistantFollowUp = { ...rest, ...(next !== undefined ? { next_at: new Date(next).toISOString() } : {}), enabled: next !== undefined,
    last: { due_at: due, at: now.toISOString(), outcome, ...(detail ? { detail } : {}) } };
  if (!store.saveFollowUp(actorId, saved, followUp)) return;
  if (next !== undefined && work?.session_id) {
    const schedule = await ports.schedule();
    await enqueueCurrentFollowUp(store, actorId, saved, work.session_id, schedule);
  }
}

/** The same wall-clock time `days` later where the person is: “每天六点” stays at six across a daylight-saving change. */
export function sameLocalTimeLater(at: number, days: number, timeZone: string | undefined): number {
  let wall: (ms: number) => number;
  try {
    const format = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    wall = ms => { const part = Object.fromEntries(format.formatToParts(new Date(ms)).map(item => [item.type, item.value])); return Date.UTC(+part.year!, +part.month! - 1, +part.day!, +part.hour!, +part.minute!, +part.second!) + ms % 1000; };
  } catch { return at + days * 86_400_000; }
  const target = wall(at) + days * 86_400_000;
  const guess = target - (wall(at) - at);
  return target - (wall(guess) - guess);
}
