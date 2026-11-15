import type { ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { StateRingState } from "@molis-ai/molis-work-contracts/platform/ui";
import type { BackgroundTaskRow, BackgroundTasksReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import type { AgentActionClient } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import { assistantErrors } from "./assistant-errors.js";

/**
 * Tasks no conversation started report to the scope's Assistant once they end (specs/work-line contract-design §9; user decision
 * 2026-11-15): a provider marks such a row `reports_to: "assistant"`. When a project's table shows it ended — done or failed — the
 * Assistant runs one round in that project's main conversation that only reports and advises. Nothing here is polled: the table is
 * read again only where something changed (the project's journal, its plugins' libraries), and a round that could not start yet
 * (the main conversation was busy) is looked at again when the Assistant's own store changes.
 */

/** The states a report is for: what ended well, and what ended without being done. */
const DONE: ReadonlySet<StateRingState> = new Set(["done", "saved", "partial"]);
const FAILED: ReadonlySet<StateRingState> = new Set(["failed"]);
export const reportedEnd = (row: Pick<BackgroundTaskRow, "state">): "done" | "failed" | null => DONE.has(row.state) ? "done" : FAILED.has(row.state) ? "failed" : null;

/** What a report answers: the row, which project it came from, how it ended. */
export interface TaskReport { project_id: string; row: BackgroundTaskRow; end: "done" | "failed" }

interface ReportPorts {
  /** The project's table, read as the person (the same read the task panel makes). */
  table(projectId: string): Promise<BackgroundTasksReadResult>;
  /** Which project changed (`null`: the Assistant's own store). */
  changes(listener: (projectId: string | null) => void): () => void;
  /**
   * Report one ended task: `reported` (a round started, or the person was told once), `later` (the main conversation is busy: look
   * again), `none` (nothing to report to, or reported before — once only, across restarts).
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
    const table = await this.ports.table(projectId);
    let later = false;
    for (const row of table.tasks) {
      const end = row.reports_to === "assistant" ? reportedEnd(row) : null;
      // The same end of the same task is reported once: by this process, then by the notice the report raises (across restarts).
      const key = JSON.stringify([projectId, row.id, end, row.updated_at]);
      if (!end || this.#told.has(key) || this.#closed) continue;
      const answer = await this.ports.report({ project_id: projectId, row, end });
      if (answer === "later") later = true; else this.#told.add(key);
    }
    if (later) this.#pending.add(projectId); else this.#pending.delete(projectId);
  }
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
