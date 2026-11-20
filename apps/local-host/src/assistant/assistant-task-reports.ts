import { BACKGROUND_TASK_DONE_STATES, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { StateRingState } from "@molis-ai/molis-work-contracts/platform/ui";
import type { BackgroundTaskRow, BackgroundTasksReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import type { AgentActionClient } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import { createHash } from "node:crypto";
import { isTerminalAgentPhase, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { assistantErrors } from "./assistant-errors.js";
import { mainWorkOf } from "./assistant-line-actions.js";
import { assistantWords } from "./assistant-saved-text.js";
import type { AssistantStore, StoredWork } from "./assistant-store.js";

/**
 * Tasks no conversation started report to the scope's Assistant once they end (specs/work-line contract-design §9; user decision
 * 2026-11-15): a provider marks such a row `reports_to: "assistant"`. When a project's table shows it ended — done or failed — the
 * Assistant runs one round in that project's main conversation that only reports and advises. Nothing here is polled: the table is
 * read again only where something changed (the project's journal, its plugins' libraries), and a round that could not start yet
 * (the main conversation was busy) is looked at again when the Assistant's own store changes.
 */

/** The states a report is for: what ended well, and what ended without being done. */
const DONE = BACKGROUND_TASK_DONE_STATES;
const FAILED: ReadonlySet<StateRingState> = new Set(["failed"]);
export const reportedEnd = (row: Pick<BackgroundTaskRow, "state">): "done" | "failed" | null => DONE.has(row.state) ? "done" : FAILED.has(row.state) ? "failed" : null;

/** One task a report tells of: its row and how it ended. */
export interface EndedTask { row: BackgroundTaskRow; end: "done" | "failed" }
/** What one report answers: the tasks of one project that one read of its table found ended and not yet told. */
export interface TaskReport { project_id: string; tasks: readonly EndedTask[] }

interface ReportPorts {
  /** The project's table, read as the person (the same read the task panel makes). */
  table(projectId: string): Promise<BackgroundTasksReadResult>;
  /** Whether the project has a main conversation to report to: a project without one is not read (nothing could be told). */
  reportsTo(projectId: string): boolean;
  /** Which project changed (`null`: the Assistant's own store). */
  changes(listener: (projectId: string | null) => void): () => void;
  /**
   * Report the ended tasks one read found in a project, together: `reported` (one round started, or the person was told once of each),
   * `later` (the main conversation is busy: all of them wait for its next pause), `none` (nothing to report to, or each reported
   * before — once only per task, across restarts).
   */
  report(report: TaskReport): Promise<"reported" | "later" | "none">;
}

/** The least time between two reads of one project's table. */
const LOOK_MS = 1000;

export class AssistantTaskReports {
  readonly #told = new Set<string>();
  readonly #pending = new Set<string>();
  readonly #queue = new Set<string>();
  readonly #lastAt = new Map<string, number>();
  #off: (() => void) | undefined;
  #looking: Promise<void> | undefined;
  #closed = false;
  constructor(private readonly ports: ReportPorts) {}

  start(): void {
    if (this.#off || this.#closed) return;
    this.#off = this.ports.changes(projectId => {
      // The Assistant's own store changed (a round ended, a work moved): what waited for an idle conversation is looked at again.
      if (projectId === null) { for (const waiting of this.#pending) this.#queue.add(waiting); }
      else this.#queue.add(projectId);
      if (this.#queue.size) this.#look();
    });
  }
  close(): void { this.#closed = true; this.#off?.(); this.#off = undefined; this.#queue.clear(); this.#pending.clear(); }
  /** Settled once what was asked to be looked at has been (for tests and for the Host's own shutdown). */
  async idle(): Promise<void> { while (this.#looking) await this.#looking; }

  #look(): void {
    if (this.#looking || this.#closed) return;
    this.#looking = (async () => {
      while (this.#queue.size && !this.#closed) {
        const projectId = this.#queue.values().next().value!;
        this.#queue.delete(projectId);
        // A project that keeps writing is read at most once a second: what changed meanwhile is in the next read.
        const wait = (this.#lastAt.get(projectId) ?? -Infinity) + LOOK_MS - Date.now();
        if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait).unref?.());
        if (this.#closed) return;
        this.#lastAt.set(projectId, Date.now());
        await this.#lookAt(projectId).catch(() => undefined);
      }
    })().finally(() => { this.#looking = undefined; if (this.#queue.size && !this.#closed) this.#look(); });
  }

  async #lookAt(projectId: string): Promise<void> {
    if (!this.ports.reportsTo(projectId)) { this.#pending.delete(projectId); return; }
    const table = await this.ports.table(projectId);
    // What ended in one read goes in one report: the same end of the same task is reported once, by this process, then by the notice
    // the report raises for it (across restarts).
    const ended = table.tasks.flatMap(row => {
      const end = row.reports_to === "assistant" ? reportedEnd(row) : null, key = JSON.stringify([projectId, row.id, end, row.updated_at]);
      return end && !this.#told.has(key) ? [{ row, end, key }] : [];
    });
    if (!ended.length || this.#closed) { this.#pending.delete(projectId); return; }
    const answer = await this.ports.report({ project_id: projectId, tasks: ended.map(({ row, end }) => ({ row, end })) });
    if (answer === "later") { this.#pending.add(projectId); return; }
    for (const { key } of ended) this.#told.add(key);
    this.#pending.delete(projectId);
  }
}

interface ReportRoundPorts {
  store: Pick<AssistantStore, "list" | "noticeReceipts" | "raiseNotice">;
  actorId: string;
  /** The main conversation's session: a round going, or a recovery, means it is busy. */
  session(work: StoredWork): Promise<{ recovery?: unknown; latest_run: { phase: AgentRunView["phase"] } | null }>;
  /** Where the conversation's own continuation stands: an eligible one is its next round's, a report never takes it. */
  continuation(work: StoredWork): Promise<string | undefined>;
  /** Start the round that only reports, as the Host (`report_only`). */
  start(work: StoredWork, text: string): Promise<unknown>;
  /** The jobs this person's works in the project follow: a row about one is that conversation's news. Read once per report. */
  followed(projectId: string): Promise<ReadonlySet<string>>;
}

/**
 * Tasks no conversation started have ended and report to the Assistant (`reports_to: "assistant"`): the person is told once of each (a
 * notice per task, kept across restarts by its key), and the project's main conversation with the Assistant gets one round that only
 * reports and advises (`reportOnlyAuthority`, the read-only report role), for all that one read of the project found ended. A busy
 * main conversation has them all wait for its next pause. A project without a main conversation is not read at all, and an end from
 * before the main conversation existed is not told to it.
 */
export class AssistantReportRounds {
  constructor(private readonly ports: ReportRoundPorts) {}

  #main(projectId: string): StoredWork | undefined {
    const main = mainWorkOf(this.ports.store, this.ports.actorId, { kind: "project", project_id: projectId }, null);
    return main && !main.archived ? main : undefined;
  }

  /** Whether a project has a main conversation a report could go to. */
  reportsTo(projectId: string): boolean { return this.#main(projectId) !== undefined; }

  async report(report: TaskReport): Promise<"reported" | "later" | "none"> {
    const main = this.#main(report.project_id);
    if (!main) return "none";
    const keyOf = ({ row, end }: EndedTask) => `task-report-${createHash("sha256").update(JSON.stringify([report.project_id, row.id, end, row.updated_at])).digest("base64url").slice(0, 32)}`;
    const unseen = report.tasks.flatMap(task => Date.parse(task.row.updated_at) < Date.parse(main.created_at) ? [] : [{ ...task, key: keyOf(task) }])
      .filter(task => !this.ports.store.noticeReceipts.has(this.ports.actorId, task.key));
    if (!unseen.length) return "none";
    // Busy first: while the main conversation answers, a project looked at again does not read who follows what each time.
    if (main.session_id) {
      const session = await this.ports.session(main);
      if (session.recovery || (session.latest_run && !isTerminalAgentPhase(session.latest_run.phase))) return "later";
      if (await this.ports.continuation(main) === "eligible") return "later";
    }
    // A job a conversation started and follows returns to it (assistant-jobs.ts): its provider may not know who started it.
    const followed = await this.ports.followed(report.project_id);
    const news = unseen.filter(task => !followed.has(task.row.subject.id));
    if (!news.length) return "none";
    try {
      await this.ports.start(main, reportWords(news));
    } catch (error) {
      // A round began in between: the report waits for it. Any other refusal (no model, budget) leaves the person told only.
      if (["assistant.state", "assistant.busy", "agent.session_busy"].includes(String((error as { code?: unknown } | undefined)?.code))) return "later";
    }
    for (const { row, end, key } of news) this.ports.store.raiseNotice(this.ports.actorId, { kind: end === "failed" ? "failed" : "completed", work_id: main.work_id, work_title: main.title,
      text: assistantWords(`workbench.assistant-notice.task-report-${end}`, { title: row.title, from: row.origin.title }) }, key);
    return "reported";
  }
}

/** What the report's round is told: the one task as it always was, or each of several on a line of its own. */
function reportWords(tasks: readonly EndedTask[]): string {
  const ended = ({ row, end }: EndedTask) => `「${row.title}」${end === "failed" ? "没有办成" : "已经办完"}${row.step ? `：${row.step.text}` : ""}`;
  if (tasks.length === 1) {
    const task = tasks[0]!;
    return `（Molis 转告）后台任务${ended(task)}。这项任务由「${task.row.origin.title}」发起，不是从这段对话派出的。请用一两句话向用户汇报结果，需要时给出建议；这一轮只汇报，不接着做、不派新任务、不做任何改动。`;
  }
  const lines = tasks.map(task => `- ${ended(task)}（由「${task.row.origin.title}」发起）`).join("\n");
  return `（Molis 转告）这个项目有 ${tasks.length} 项后台任务同时结束了：\n${lines}\n这些任务都不是从这段对话派出的。请在一次回复里向用户逐项简要汇报结果，需要时给出建议；这一轮只汇报，不接着做、不派新任务、不做任何改动。`;
}

const same = (a: ExactActionReference) => (b: { capability_id: string; version: number; provider: { provider_id: string } }) =>
  b.capability_id === a.capability_id && b.version === a.version && b.provider.provider_id === a.provider_id;

/**
 * The authority of a round that only reports (a task no conversation started ended): it may read what its round may read, and
 * nothing else — no command, no sub-task, no proposal, no delivery, no memory written. The words the round is given say so too;
 * what holds it is this, not the words.
 */
export function reportOnlyAuthority(authority: AgentStartAuthority): AgentStartAuthority {
  const actions = authority.actions;
  if (!actions) return authority;
  return { ...authority, actions: async (...args: Parameters<NonNullable<AgentStartAuthority["actions"]>>) => {
    const all = await actions(...args);
    const reads = async () => (await all.discover()).filter(view => view.operation === "query");
    const readable = async (action: ExactActionReference) => {
      if (!(await reads()).some(same(action))) throw assistantErrors.action_revoked("这一轮只汇报：只能读取，不做操作、不派新任务");
    };
    const client: AgentActionClient = {
      discover: reads,
      ...(all.reader ? { reader: all.reader } : {}),
      direct: () => false,
      check: async (action, input) => { await readable(action); await all.check?.(action, input); },
      invoke: async (action, input, signal, memorySelection) => { await readable(action); return all.invoke(action, input, signal, memorySelection); },
    };
    return client;
  } };
}
