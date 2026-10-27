import type { AssistantContinuations } from "./assistant-continuations.js";
import type { AssistantFollowUps } from "./assistant-followups.js";
import type { AgentScheduleCapability } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantDelegations } from "./assistant-delegation.js";
import type { AssistantNotice, AssistantNoticeKind, AssistantRule, AssistantWorkState, AssistantWorkObject } from "@molis-ai/molis-work-contracts/services/assistant";
import { NOTICE_TTL_MS, scanNewMaterialOnce, type ScanLook } from "./assistant-material-scan.js";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import { type AssistantJobs, JOB_FOLLOW_MS } from "./assistant-jobs.js";
import { assistantErrors } from "./assistant-errors.js";
import { identity } from "./assistant-relations.js";
import { memoryLearningSources } from "./assistant-inputs.js";
import { RUNTIME, type AssistantServicePorts } from "./assistant-service-shared.js";
import type { AssistantWorkReads } from "./assistant-work-reads.js";

/** The rule that holds a notice of this kind on this surface now, if any. Rules apply exactly as written. */
export function holdingRule(rules: readonly AssistantRule[], kind: AssistantNoticeKind, surface: string | null): AssistantRule | undefined {
  return rules.find(rule => !rule.except.includes(kind) && (rule.kind === "pause" || !rule.surfaces.length || (surface !== null && rule.surfaces.includes(surface))));
}

export type AssistantNoticesLinks = Pick<AssistantWorkReads, "assistantPart" | "workObjects"> & { continuations: Pick<AssistantContinuations, "attach" | "pending">; followUps: Pick<AssistantFollowUps<StoredWork>, "pending" | "attach">; jobs: Pick<AssistantJobs, "attach">; delegations: Pick<AssistantDelegations, "attach"> };

/**
 * Notices and what raises them: a work's change of state, new material elsewhere (one look at a time), the person's
 * rules that hold a notice, and the timed work the Host attaches to when it starts. Only its ports reach the Host; the
 * other collaborators come through `link`.
 */
export class AssistantNotices {
  constructor(private readonly store: Pick<AssistantStore, "activeSince" | "get" | "list" | "observe" | "observed" | "openNotices" | "raiseNotice" | "relations" | "rounds" | "rules" | "setSetting" | "setting" | "settleNotices">, private readonly ports: AssistantServicePorts, private readonly actorId: string, private readonly now: () => Date, private readonly link: AssistantNoticesLinks) {}

  /**
   * A change of a work's state is what raises a notice — failed, waiting on the person, done — once per round and kind.
   * The first time a work is seen nothing is raised, so a restart never replays old news; a decision that is no longer
   * awaited stops asking. Notices never start anything.
   */
  notice(work: StoredWork, state: AssistantWorkState): void {
    const before = this.store.observed(this.actorId, work.work_id);
    if (before === state) return;
    this.store.observe(this.actorId, work.work_id, state);
    if (before === null) return;
    if (!["waiting-input", "waiting-review"].includes(state)) this.store.settleNotices(this.actorId, { work_id: work.work_id, kinds: ["needs-decision"] }, "resolved");
    if (state === "running") this.store.settleNotices(this.actorId, { work_id: work.work_id, kinds: ["failed", "completed"] }, "resolved");
    const round = this.store.rounds(work.work_id).at(-1)?.run_id ?? "none";
    const raise = (kind: AssistantNoticeKind, text: string) => this.store.raiseNotice(this.actorId, { kind, work_id: work.work_id, work_title: work.title, text }, `${work.work_id}:${round}:${kind}:${state}`);
    // A delegated work reports to the work that asked for it; only what the person must decide reaches them directly.
    if (work.delegated_by && state !== "waiting-review" && state !== "waiting-input") return;
    if (state === "failed") raise("failed", `「${work.title}」这一轮没有完成，打开看看原因`);
    else if (state === "waiting-review") raise("needs-decision", `「${work.title}」在等你确认一项修改`);
    else if (state === "waiting-input") raise("needs-decision", `「${work.title}」在等你回答一个问题`);
    else if (state === "completed" && ["running", "paused", "waiting-input", "waiting-review"].includes(before)) raise("completed", `「${work.title}」做完了`);
    // What the person said in this work may hold a standing wish worth keeping: the platform memory decides (a sub-task's
    // words are the delegating work's, not the person's, so it never learns from those).
    if (state === "completed" && before !== "completed" && !work.delegated_by && round !== "none")
      void this.link.assistantPart(work).then(part => part.sourceViews, () => []).then(views => this.ports.learnFromRound?.({ work, run_id: round, ...memoryLearningSources(views) }));
  }

  /** Open notices, each saying whether one of the person's rules holds it here and now (on this surface). */
  notices(surface: string | null): AssistantNotice[] {
    const now = this.now();
    const rules = this.store.rules(this.actorId).filter(rule => rule.enabled && (!rule.until || new Date(rule.until) > now));
    const stale = now.getTime() - NOTICE_TTL_MS;
    const shownMaterial = new Map<string, number>();
    const open = this.store.openNotices(this.actorId);
    return open.flatMap(notice => {
      // What waited too long is no longer news: it goes quietly instead of arriving in a burst.
      if (Date.parse(notice.created_at) < stale) { this.store.settleNotices(this.actorId, { notice_id: notice.notice_id }, "resolved"); return []; }
      // New material for one work is one notice, however many items arrived (newest first).
      if (notice.kind === "material") {
        if (shownMaterial.has(notice.work_id)) return [];
        shownMaterial.set(notice.work_id, 1);
      }
      const { state: _state, ...view } = notice;
      const count = notice.kind === "material" ? open.filter(item => item.kind === "material" && item.work_id === notice.work_id && Date.parse(item.created_at) >= stale).length : 1;
      const shown = count > 1 ? { ...view, text: `${view.text}（另有 ${count - 1} 条）` } : view;
      const rule = holdingRule(rules, notice.kind, surface);
      return [rule ? { ...shown, held: { rule_id: rule.rule_id, reason: rule.label } } : shown];
    });
  }

  settleNotices(target: { notice_id?: string; work_id?: string }, state: "seen" | "dismissed"): number {
    // Reminders belong to no work: they are settled one by one, never as "every notice of work ''".
    if (!target.notice_id && !target.work_id) return 0;
    // The merged new-material notice stands for all of that work's: settling it settles them together.
    const material = target.notice_id ? this.store.openNotices(this.actorId).find(item => item.notice_id === target.notice_id && item.kind === "material") : undefined;
    if (material) return this.store.openNotices(this.actorId).filter(item => item.kind === "material" && item.work_id === material.work_id)
      .reduce((sum, item) => sum + this.store.settleNotices(this.actorId, { notice_id: item.notice_id }, state), 0);
    return this.store.settleNotices(this.actorId, target, state);
  }

  /**
   * New items elsewhere that matter to a live work: they share a Goal with it (read from the items' owners, never
   * guessed). Items the Assistant produced itself, items already seen and works that are idle for a week are left
   * out; nothing here starts a round, so a notice cannot feed itself. Looks from where it last stopped.
   */
  async scanNewMaterial(): Promise<number> {
    // One look at a time: a look still running (a slow owner) is not joined by another.
    if (this.#scanning) return 0;
    this.#scanning = true;
    const started_at = this.now().toISOString();
    this.scanLooks = [];
    this.store.setSetting(this.actorId, "material_scan", JSON.stringify({ started_at }));
    try {
      const raised = await scanNewMaterialOnce({ store: this.store, identity, actorId: this.actorId, now: this.now(), scopeActions: this.ports.scopeActions?.bind(this.ports), looks: this.scanLooks });
      this.store.setSetting(this.actorId, "material_scan", JSON.stringify({ started_at, finished_at: this.now().toISOString(), raised, projects: this.scanLooks }));
      return raised;
    } catch (error) {
      this.store.setSetting(this.actorId, "material_scan", JSON.stringify({ started_at, finished_at: this.now().toISOString(), error: error instanceof Error ? error.message : String(error) }));
      throw error;
    } finally { this.#scanning = false; }
  }

  #scanning = false;

  /** What the last look saw in each project, kept with its record (for diagnostics). */
  private scanLooks: ScanLook[] = [];

  /**
   * Whether anything timed may be waiting: an enabled follow-up with a next time, or a work active within the time a
   * background job is followed (its step is on the work's graph, which only the runtime reads).
   */
  hasTimedWork(): boolean {
    return this.link.continuations.pending() || this.link.followUps.pending() || this.store.activeSince(this.actorId, new Date(this.now().getTime() - JOB_FOLLOW_MS).toISOString());
  }

  /**
   * Become the runner for timed rounds, make sure each standing one is queued again, and hear the background jobs that
   * end. Called when the Host starts.
   */
  async attachSchedule(): Promise<boolean> {
    this.link.continuations.attach();
    const schedule = await this.schedule().catch(() => null);
    if (!schedule) return false;
    // Jobs that ended while the Host was away are told now; the runtime looks again at those still followed.
    await this.link.jobs.attach().catch(() => undefined);
    await this.link.followUps.attach(schedule);
    // Works whose sub-tasks all came back while the Host was away go on now.
    await this.link.delegations.attach().catch(() => undefined);
    return true;
  }

  async schedule(): Promise<AgentScheduleCapability> {
    const schedule = (await this.ports.host()).adapter(RUNTIME).schedule;
    if (!schedule) throw assistantErrors.unsupported("当前运行时不能安排定时");
    return schedule;
  }

  /**
   * A “做完了” or “交回结果” notice about a result the person has since changed or removed in its plugin is no longer
   * news: they already acted on it. Only works with such open notices are read, a few at a time.
   */
  async settleHandledNotices(): Promise<number> {
    const open = this.store.openNotices(this.actorId).filter(notice => notice.kind === "completed" || notice.kind === "result");
    let settled = 0;
    for (const workId of [...new Set(open.map(notice => notice.work_id))].slice(0, 5)) {
      let work: StoredWork;
      try { work = this.store.get(this.actorId, workId); } catch { continue; }
      const objects = await this.link.workObjects(work).catch(() => [] as AssistantWorkObject[]);
      if (!objects.some(object => object.relation === "result" && (object.state === "changed" || object.state === "missing"))) continue;
      for (const notice of open.filter(item => item.work_id === workId)) settled += this.store.settleNotices(this.actorId, { notice_id: notice.notice_id }, "seen");
    }
    return settled;
  }
}
