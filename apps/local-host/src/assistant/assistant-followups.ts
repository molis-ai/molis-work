import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { AgentScheduleCapability, AgentScheduledTask } from "@molis-ai/molis-work-contracts/services/agent-host";
import { DUE_REMINDERS_INPUT_TYPE, DUE_REMINDERS_OUTPUT_TYPE, type ActionView, type DueReminderCollection, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantFollowUp, AssistantNotice, AssistantNoticeKind, AssistantRule, AssistantRuleInput, AssistantWorkState } from "@molis-ai/molis-work-contracts/services/assistant";
import { assistantErrors, whenThere } from "./assistant-errors.js";
import { repeatingFailure } from "../host-log.js";

/**
 * The Assistant's reminders and follow-ups (W4-05, the first collaborator split out of `AssistantService` along a
 * package-shaped boundary): the reminders the person set in Plugins, told once each as they come due; the timed rounds
 * the person asked for on a work (kept by Prologue's durable queue); and the person's attention rules. It reaches the rest
 * of the Assistant only through `AssistantFollowUpPorts` and owns its own table (`AssistantFollowUpRecords`), so moving the
 * Assistant into its own package moves this file as it is.
 */

export const FOLLOW_UP_KIND = "assistant.follow-up";
const FOLLOW_UP_GRACE_MS = 10 * 60 * 1000;
const MAX_FOLLOW_UPS_PER_WORK = 5;
/** Reminders are asked for from where the last look stopped, but never further back than this (Molis Work was off). */
const REMINDER_LOOKBACK_MS = 12 * 60 * 60 * 1000;
/** A reminder told later than this after its time is said to be missed. */
const REMINDER_LATE_MS = 10 * 60 * 1000;

type DatabaseSync = ReturnType<typeof openHomeSqliteDatabase>;

/** The rows of `assistant_followups`: one standing request each, read and written only here. */
export class AssistantFollowUpRecords {
  constructor(private readonly db: DatabaseSync, private readonly changed: (workId: string) => void) {}

  list(actorId: string, workId?: string): AssistantFollowUp[] {
    const rows = workId ? this.db.prepare("SELECT body FROM assistant_followups WHERE actor_id=? AND work_id=?").all(actorId, workId)
      : this.db.prepare("SELECT body FROM assistant_followups WHERE actor_id=?").all(actorId);
    return rows.map(row => JSON.parse(String(row.body)) as AssistantFollowUp).sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  /** With `expected`, a running callback updates the row it read and never inserts a removed or changed standing request. */
  save(actorId: string, followUp: AssistantFollowUp, expected?: AssistantFollowUp): boolean {
    const saved = expected
      ? Number(this.db.prepare("UPDATE assistant_followups SET body=? WHERE actor_id=? AND followup_id=? AND body=?")
        .run(JSON.stringify(followUp), actorId, followUp.followup_id, JSON.stringify(expected)).changes) > 0
      : (this.db.prepare("INSERT INTO assistant_followups(followup_id,actor_id,work_id,body) VALUES (?,?,?,?) ON CONFLICT(followup_id) DO UPDATE SET body=excluded.body")
        .run(followUp.followup_id, actorId, followUp.work_id, JSON.stringify(followUp)), true);
    if (saved) this.changed(followUp.work_id);
    return saved;
  }

  remove(actorId: string, followupId: string): boolean {
    return Number(this.db.prepare("DELETE FROM assistant_followups WHERE actor_id=? AND followup_id=?").run(actorId, followupId).changes) > 0;
  }
}

/** A work as the follow-ups see it. */
interface FollowUpWork {
  work_id: string;
  title: string;
  session_id: string | null;
  archived: boolean;
  reply_target?: unknown;
}

/** The person's own actions in their Home, each call already bounded in time by the caller. */
interface FollowUpHomeActions {
  discover(): Promise<readonly ActionView[]>;
  invoke(reference: ExactActionReference, input: unknown): Promise<unknown>;
}

/** Everything the follow-ups need from the Assistant, for one person. Nothing else of the service. */
export interface AssistantFollowUpPorts<W extends FollowUpWork> {
  readonly actorId: string;
  readonly records: AssistantFollowUpRecords;
  now(): Date;
  /** IANA zone the person works in, for a follow-up's default zone and a reminder's shown time. */
  readonly timeZone?: string;
  /** The work by id; throws when it no longer exists. */
  work(workId: string): W;
  notify(notice: Pick<AssistantNotice, "kind" | "work_id" | "work_title" | "text" | "open">, dedupe: string): boolean;
  setting(key: string): string | null;
  setSetting(key: string, value: string): void;
  rules(): AssistantRule[];
  setRules(rules: readonly AssistantRule[]): void;
  /** The page ids a rule may name now, read from the catalog when a rule is written (PG-036). */
  pages(): Promise<readonly string[]>;
  /** Absent: no reminders are asked for. */
  homeActions?(): Promise<FollowUpHomeActions>;
  host(): Promise<AgentHost>;
  state(host: AgentHost, work: W): Promise<AssistantWorkState>;
  /** Start one round of the work with these words; `stillCurrent` is checked again right before it starts. */
  send(work: W, text: string, requestId: string, stillCurrent: () => boolean): Promise<unknown>;
  schedule(): Promise<AgentScheduleCapability>;
}

function followUpTask(followUp: AssistantFollowUp, sessionId: string) {
  return { key: `fu-${followUp.followup_id}-${Date.parse(followUp.next_at!)}`, session_id: sessionId, kind: FOLLOW_UP_KIND,
    payload: { followup_id: followUp.followup_id }, due_at: followUp.next_at!, max_attempts: 1 };
}

export class AssistantFollowUps<W extends FollowUpWork> {
  #detachSchedule: (() => void) | null = null;
  #sweeping = false;
  /** A reminder source that cannot be asked, by its capability: written when it starts failing (the stretch is asked again next time). */
  #reminderSourceFailures = repeatingFailure("assistant", "reminder_source_failed");
  /** A timed round whose work cannot be read when the Host starts, by the follow-up: written when it starts failing. */
  #unreadableWorks = repeatingFailure("assistant", "followup_work_unreadable");

  constructor(private readonly ports: AssistantFollowUpPorts<W>) {}

  list(workId?: string): AssistantFollowUp[] { return this.ports.records.list(this.ports.actorId, workId); }

  /** Whether a follow-up waits for its next time. */
  pending(): boolean { return this.list().some(item => item.enabled && item.next_at); }

  /**
   * A standing request on a work: at `at` (and then daily or weekly), start a round of it with these words. The time is
   * kept by Prologue's durable local queue (it survives a restart), not by a timer of the Host's own.
   */
  async save(input: { work_id: string; text: string; at: string; repeat?: AssistantFollowUp["repeat"]; label: string; time_zone?: string }): Promise<AssistantFollowUp> {
    const { ports } = this, work = ports.work(String(input?.work_id ?? ""));
    if (work.reply_target || work.archived) throw assistantErrors.state("评论回复或已归档工作不能添加定时");
    const text = typeof input.text === "string" ? input.text.trim().slice(0, 4000) : "";
    const label = typeof input.label === "string" ? input.label.trim().slice(0, 120) : "";
    if (!text || !label) throw assistantErrors.invalid("定时要写明到时让助理做什么，以及一句说法");
    const at = new Date(String(input.at));
    if (Number.isNaN(at.getTime()) || at.getTime() <= ports.now().getTime()) throw assistantErrors.invalid("时间要在现在之后，并写明日期和时间");
    const repeat = input.repeat ?? "none";
    if (!["none", "daily", "weekly"].includes(repeat)) throw assistantErrors.invalid("重复只能是一次、每天或每周");
    if (this.list(work.work_id).filter(item => item.enabled).length >= MAX_FOLLOW_UPS_PER_WORK) throw assistantErrors.limit(`一项工作最多 ${MAX_FOLLOW_UPS_PER_WORK} 个定时`);
    if (!work.session_id) throw assistantErrors.state("这项工作还没有开始过：先让助理做一轮，再给它加定时");
    const schedule = await ports.schedule();
    const followUp: AssistantFollowUp = { followup_id: randomUUID(), work_id: work.work_id, label, text, repeat, next_at: at.toISOString(),
      time_zone: input.time_zone || ports.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone, enabled: true, created_at: ports.now().toISOString() };
    ports.records.save(ports.actorId, followUp);
    this.#runnerFor(schedule);
    await this.#enqueueCurrent(followUp, work.session_id, schedule);
    return followUp;
  }

  async remove(followupId: string): Promise<boolean> {
    const followUp = this.list().find(item => item.followup_id === followupId);
    const removed = this.ports.records.remove(this.ports.actorId, followupId);
    if (followUp?.next_at) await (await this.ports.schedule().catch(() => null))?.cancel(followUpTask(followUp, "").key).catch(() => null);
    return removed;
  }

  /** The work is put away: its timed rounds stop with it, each saying why. */
  async stopForArchive(workId: string): Promise<void> {
    const { ports } = this, schedule = await ports.schedule().catch(() => null), at = ports.now().toISOString();
    for (const { next_at, ...rest } of this.list(workId).filter(item => item.enabled)) {
      if (next_at) await schedule?.cancel(followUpTask({ ...rest, next_at }, "").key).catch(() => null);
      ports.records.save(ports.actorId, { ...rest, enabled: false, last: { due_at: next_at ?? at, at, outcome: "skipped", detail: "这项工作已归档，定时已停用" } });
    }
  }

  /**
   * Become the runner for timed rounds, and make sure each standing one has its queued task (idempotent by key: one per
   * follow-up and due time). Called when the Host starts; tasks that fell due meanwhile run as soon as it attaches.
   */
  async attach(schedule: AgentScheduleCapability): Promise<void> {
    this.#runnerFor(schedule);
    for (const followUp of this.list().filter(item => item.enabled && item.next_at)) {
      // A work that is gone has nothing to queue; one that cannot be read is written and left for the next start (its task, if any, stays queued).
      let work: W | null;
      try { work = whenThere(() => this.ports.work(followUp.work_id)); this.#unreadableWorks.worked(followUp.followup_id); }
      catch (error) { this.#unreadableWorks.failed(followUp.followup_id, error, { followup_id: followUp.followup_id }); continue; }
      if (!work?.session_id) continue;
      const task = followUpTask(followUp, work.session_id), held = schedule.find(task.key);
      // Its time came with no runner attached (the Host was still starting): decided now by the same rule — on time
      // enough it runs, too late it is reported as missed — never left silently undone.
      if (held && (held.state === "failed" || held.state === "reconcile-required")) { await this.#run(followUp).catch(() => undefined); continue; }
      await this.#enqueueCurrent(followUp, work.session_id, schedule).catch(() => undefined);
    }
  }

  /** What the queue says about running with the window closed, for the person to read beside their timed rounds. */
  async claim(): Promise<{ survives_window_close: boolean; why: string } | null> {
    return (await this.ports.schedule().catch(() => null))?.claim() ?? null;
  }

  #runnerFor(schedule: AgentScheduleCapability): void {
    if (!this.#detachSchedule) this.#detachSchedule = schedule.handle(FOLLOW_UP_KIND, task => this.#runTask(task));
  }

  #isCurrent(expected: AssistantFollowUp): boolean {
    return isDeepStrictEqual(this.list().find(item => item.followup_id === expected.followup_id), expected);
  }

  async #enqueueCurrent(followUp: AssistantFollowUp, sessionId: string, schedule: AgentScheduleCapability): Promise<void> {
    if (!this.#isCurrent(followUp)) return;
    const task = followUpTask(followUp, sessionId);
    await schedule.enqueue(task);
    if (!this.#isCurrent(followUp)) await schedule.cancel(task.key);
  }

  /** One due time of one follow-up, handed back by the queue. A task for a time since changed or removed does nothing. */
  async #runTask(task: AgentScheduledTask): Promise<void> {
    const followUp = this.list().find(item => item.followup_id === String(task.payload.followup_id ?? ""));
    if (!followUp || !followUp.enabled || !followUp.next_at || Date.parse(followUp.next_at) !== Date.parse(task.due_at)) return;
    await this.#run(followUp);
  }

  /**
   * A due time came. Too late (Molis Work was not running) is reported and moved on, never replayed; a work still busy is
   * skipped; otherwise one round starts (its request id is the due time, so it cannot start twice). Then the next time is
   * queued. The standing request is read again across every await: deletion stops future work and its final write.
   */
  async #run(followUp: AssistantFollowUp): Promise<void> {
    const { ports } = this, current = () => this.#isCurrent(followUp);
    if (!current()) return;
    const now = ports.now(), due = followUp.next_at!;
    let outcome: NonNullable<AssistantFollowUp["last"]>["outcome"] = "started", detail: string | undefined;
    // Gone is said so. A store that cannot be read is thrown and writes nothing: the queue keeps this time failed with the error, and the next start runs it again.
    const work = whenThere(() => ports.work(followUp.work_id)) ?? undefined;
    if (!work) { outcome = "failed"; detail = "这项工作已不存在"; }
    else if (work.archived) { outcome = "skipped"; detail = "这项工作已归档，这一次没有开始"; }
    else if (work && now.getTime() - Date.parse(due) > FOLLOW_UP_GRACE_MS) {
      outcome = "missed"; detail = "当时 Molis Work 没有在运行，没有补做";
      ports.notify({ kind: "failed", work_id: work.work_id, work_title: work.title,
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
    if (!ports.records.save(ports.actorId, saved, followUp)) return;
    if (next !== undefined && work?.session_id) await this.#enqueueCurrent(saved, work.session_id, await ports.schedule());
  }

  /**
   * Reminders the person set in Plugins that came due since the last look: each told once, as a notice subject to the
   * person's rules like any other. Asked of the Plugins that declare due reminders; nothing is started or changed.
   */
  async sweepReminders(): Promise<number> {
    const { ports } = this;
    if (this.#sweeping || !ports.homeActions) return 0;
    this.#sweeping = true;
    try {
      const now = ports.now(), last = ports.setting("reminder_sweep");
      // The first look starts a few minutes back; later ones from where the last stopped (bounded when Molis Work was off).
      const from = new Date(Math.max(last ? Date.parse(last) : now.getTime() - REMINDER_LATE_MS, now.getTime() - REMINDER_LOOKBACK_MS));
      const window = { from: from.toISOString(), to: new Date(now.getTime() + 1).toISOString() };
      const actions = await ports.homeActions();
      const providers = (await actions.discover()).filter(view => view.action.input_type === DUE_REMINDERS_INPUT_TYPE && view.action.output_type === DUE_REMINDERS_OUTPUT_TYPE && view.availability.available);
      let raised = 0, missed = false;
      for (const provider of providers) {
        let collection: DueReminderCollection;
        try { collection = await actions.invoke({ capability_id: provider.capability_id, version: provider.version, provider_id: provider.provider.provider_id }, window) as DueReminderCollection; }
        catch (error) { missed = true; this.#reminderSourceFailures.failed(provider.capability_id, error, { capability_id: provider.capability_id }); continue; }
        this.#reminderSourceFailures.worked(provider.capability_id);
        for (const reminder of collection.reminders) {
          const due = Date.parse(reminder.due_at);
          if (!(due >= from.getTime() && due <= now.getTime())) continue;
          const late = now.getTime() - due > REMINDER_LATE_MS;
          const at = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false, ...(ports.timeZone ? { timeZone: ports.timeZone } : {}) }).format(new Date(due));
          const told = ports.notify({ kind: "reminder", work_id: "", work_title: collection.source.title,
            text: `${late ? "错过的提醒" : "提醒"}（${collection.source.title} · ${at}）：${reminder.title.slice(0, 120)}`,
            ...(reminder.open ? { open: { surface: reminder.open.surface, id: reminder.open.id, title: reminder.title.slice(0, 120), project_id: reminder.project_id } } : {}) },
            `reminder:${provider.provider.provider_id}:${reminder.reminder_id}`);
          if (told) raised += 1;
        }
      }
      // A Plugin that could not answer is asked again for the same stretch next time (each reminder is still told once).
      if (!missed) ports.setSetting("reminder_sweep", now.toISOString());
      return raised;
    } finally { this.#sweeping = false; }
  }

  rules(): AssistantRule[] { return this.ports.rules(); }

  /**
   * Add or change a rule on the person's word (PG-036). A page it names has to be one that is installed, read from the
   * catalog now, so the Host keeps no list of plugin names; one that is not is refused with the pages there are. Pages the
   * rule being changed already names stay, so turning it on or off still works after a plugin was taken out.
   */
  async addRule(input: AssistantRuleInput, ruleId?: string): Promise<AssistantRule[]> {
    const installed = new Set(await this.ports.pages());
    if (input && input.kind !== "pause" && Array.isArray(input.surfaces)) {
      const named = new Set(ruleId ? this.ports.rules().find(rule => rule.rule_id === ruleId)?.surfaces : []);
      const missing = [...new Set(input.surfaces)].filter((page): page is string => typeof page === "string" && !installed.has(page) && !named.has(page));
      if (missing.length) throw assistantErrors.invalid(`没有这样的页面：${missing.slice(0, 5).join("、")}。现有的页面：${[...installed].sort().join("、")}`);
    }
    return this.saveRule(input, ruleId);
  }

  /**
   * Add or change one of the person's attention rules; checked strictly, since the Host applies them exactly as written.
   * It does not check that a page the rule names is installed (that needs the catalog, so `addRule` does it): a new entry
   * point calls `addRule`, and only the tests and `addRule` itself call this.
   */
  saveRule(input: AssistantRuleInput, ruleId?: string): AssistantRule[] {
    const kinds: readonly AssistantNoticeKind[] = ["failed", "needs-decision", "completed", "result", "material", "reminder"];
    if (!input || !["quiet", "pause"].includes(input.kind)) throw assistantErrors.invalid("规则只能是“在某处不提醒”或“暂停提醒”");
    const surfaces = Array.isArray(input.surfaces) ? [...new Set(input.surfaces.filter(value => typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,80}$/.test(value)))].slice(0, 20) : [];
    const except = Array.isArray(input.except) ? [...new Set(input.except.filter(kind => kinds.includes(kind)))] : [];
    const label = typeof input.label === "string" ? input.label.trim().slice(0, 200) : "";
    if (!label) throw assistantErrors.invalid("写一句这条规则的说法，方便以后认出它");
    const until = input.until === undefined || input.until === null || input.until === "" ? undefined : new Date(String(input.until));
    if (until && (Number.isNaN(until.getTime()) || until.getTime() <= this.ports.now().getTime())) throw assistantErrors.invalid("结束时间要在现在之后");
    if (input.kind === "pause" && !until) throw assistantErrors.invalid("暂停提醒要有结束时间");
    const rules = this.ports.rules();
    const existing = ruleId ? rules.find(rule => rule.rule_id === ruleId) : undefined;
    if (ruleId && !existing) throw assistantErrors.not_found("没有这条规则");
    const rule: AssistantRule = { rule_id: existing?.rule_id ?? randomUUID(), kind: input.kind, surfaces: input.kind === "pause" ? [] : surfaces, except, label,
      ...(until ? { until: until.toISOString() } : {}), enabled: input.enabled ?? true, created_at: existing?.created_at ?? this.ports.now().toISOString() };
    const next = existing ? rules.map(item => item.rule_id === rule.rule_id ? rule : item) : [...rules, rule].slice(-50);
    this.ports.setRules(next);
    return next;
  }

  removeRule(ruleId: string): AssistantRule[] {
    const next = this.ports.rules().filter(rule => rule.rule_id !== ruleId);
    this.ports.setRules(next);
    return next;
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
