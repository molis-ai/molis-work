import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import { isTerminalAgentPhase, type AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentCollaborationSessionView, AgentContinuationStartAnswer, AgentContinuationStartRequest } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { ASSISTANT_PERSONAL_OWNER, type AssistantWorkState } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import { whenThere } from "./assistant-errors.js";
import { agentContinuationStarts } from "../agent-continuation-starts.js";
import { DELEGATION_LIMITS } from "./assistant-delegation.js";
import { assistantWords } from "./assistant-saved-text.js";

const owner = (work: StoredWork) => work.project_ref?.project_id ?? ASSISTANT_PERSONAL_OWNER;
const RUNTIME = "prologue";
type Ports = {
  store: AssistantStore; actorId: string; host(): Promise<AgentHost>;
  start(work: StoredWork, text: string, current: () => boolean, continuedFrom?: AgentRunRef): Promise<{ run_id?: string } | unknown>;
  changed(work: StoredWork, current: () => boolean): Promise<void>;
  /** A notice for the person (the work stopped going on by itself), raised once per key. */
  notify?(work: StoredWork, text: { label: ReturnType<typeof assistantWords>; original: string }, key: string): void;
  holdSetups?(sessionId: string, revision: string): void;
};

/**
 * Starts this person's works again when a wait they were waiting on is over (specs/work-line/spec.md, result return): the
 * runtime asks, only when the work's session has no round going or starting, and the answer is the round started, `later`, or a
 * refusal that holds the continuation for the person. No model call is made while a wait is pending, and nothing is polled.
 */
export class AssistantContinuations {
  private readonly busy = new Map<string, number>();
  private readonly inputs = new Map<string, symbol>();
  private readonly stopped = new AbortController();
  private readonly observers = new Set<() => void>();
  private serving: Promise<void> | undefined;
  private withdraw_: (() => void) | undefined;
  constructor(private readonly ports: Ports) {}
  close(): void { this.stopped.abort(); this.withdraw_?.(); for (const off of this.observers) off(); this.observers.clear(); }
  private works() { return this.ports.store.list(this.ports.actorId, { limit: Number.MAX_SAFE_INTEGER }).filter(work => work.executor.kind === "assistant" && work.session_id && !work.reply_target); }
  /** The existing observed-state projection makes an interrupted or waiting work start the runtime on Host restart. */
  pending(): boolean { return this.works().some(work => !work.continuation_hold && ["running", "waiting-input", "waiting-review"].includes(this.ports.store.observed(this.ports.actorId, work.work_id) ?? "")); }
  /**
   * Serve the Home's starter for the Assistant's sessions, then take up what may go on now: a continuation that became eligible
   * while nothing served the starter was answered `later`, and the runtime asks again only after the session's next round.
   */
  attach(): void {
    if (this.stopped.signal.aborted) return;
    this.serving ??= this.ports.host().then(host => {
      if (this.stopped.signal.aborted) return;
      this.withdraw_ = agentContinuationStarts(host).serveAssistant(request => this.startFor(request));
    }).catch(error => { this.serving = undefined; throw error; });
    void this.serving.then(() => this.takeUpWaiting()).catch(() => undefined);
  }
  async view(work: StoredWork): Promise<AgentCollaborationSessionView | undefined> {
    if (!work.session_id || work.executor.kind !== "assistant" || work.reply_target) return undefined;
    const adapter = (await this.ports.host()).adapter(RUNTIME);
    const view = (await adapter.collaboration?.read(owner(work), work.session_id))?.[0];
    return view?.wait?.by === "app" ? undefined : view;
  }
  async state(work: StoredWork, fallback: AssistantWorkState): Promise<AssistantWorkState> {
    if (work.continuation_hold && work.executor.kind === "assistant") return work.continuation_hold === "input" ? "paused" : work.continuation_hold;
    if (!["completed", "idle"].includes(fallback)) return fallback;
    const view = await this.view(work).catch(() => undefined);
    return view?.wait?.state === "waiting" || view?.continuation?.state === "eligible" ? "waiting-input"
      : view?.continuation && ["blocked", "needs-reconciliation"].includes(view.continuation.state) ? "needs-check" : fallback;
  }
  /** A user Send invalidates a start being prepared, even before its first await. Its SDK wait is withdrawn separately. */
  begin(work: StoredWork, text: string, writeDraft = true) {
    const token = Symbol(); this.inputs.set(work.work_id, token);
    this.enter(work.work_id);
    const current = () => this.inputs.get(work.work_id) === token;
    const end = () => { if (current()) this.inputs.delete(work.work_id); this.end(work.work_id); };
    try {
      const updated = this.ports.store.update(this.ports.actorId, work.work_id, null, { ...(writeDraft ? { draft: text } : {}), continuation_hold: "input" }, false);
      if (updated.session_id) this.ports.holdSetups?.(updated.session_id, String(updated.revision));
      return { work: updated, current, accept: () => {
        if (current() && this.ports.store.get(this.ports.actorId, work.work_id).continuation_hold === "input")
          this.ports.store.update(this.ports.actorId, work.work_id, null, { continuation_hold: undefined }, false);
      }, end };
    } catch (error) { end(); throw error; }
  }
  invalidateInput(id: string): void { this.inputs.delete(id); }
  /** A tool keeps only the Send token present when its authority was assembled, never a later Send's token. */
  currentInput(id: string): () => boolean {
    const token = this.inputs.get(id);
    return () => token !== undefined && this.inputs.get(id) === token;
  }
  blockStart(id: string): () => void { this.enter(id); return () => this.end(id); }
  private enter(id: string): void { this.busy.set(id, (this.busy.get(id) ?? 0) + 1); }
  end(id: string): void { const count = this.busy.get(id) ?? 0; if (count > 1) this.busy.set(id, count - 1); else this.busy.delete(id); }
  async withdraw(work: StoredWork, note: string): Promise<boolean> {
    const view = await this.view(work);
    if (!view?.wait || view.continuation?.state === "started" || view.continuation?.state === "cancelled") return false;
    await (await this.ports.host()).adapter(RUNTIME).collaboration!.control(owner(work), { kind: "cancel-wait", wait_id: view.wait.wait_id, note }, this.ports.actorId);
    return true;
  }
  watch(work: StoredWork, run: AgentRunRef): void {
    void this.ports.host().then(host => {
      if (this.stopped.signal.aborted) return;
      let off: (() => void) | undefined, ended = false;
      const finish = () => { if (ended) return; ended = true; queueMicrotask(() => { off?.(); if (off) this.observers.delete(off); });
        if (!this.stopped.signal.aborted) void this.ports.changed(work, () => !this.stopped.signal.aborted).catch(() => undefined); };
      off = host.adapter(RUNTIME).observe(run, view => { if (isTerminalAgentPhase(view.phase)) finish(); });
      if (ended) off(); else this.observers.add(off);
    }).catch(() => undefined);
  }
  /** What may go on now among this person's works, taken up once each (the runtime asks again only after a round). */
  private async takeUpWaiting(): Promise<void> {
    for (const work of this.works()) {
      if (this.stopped.signal.aborted) return;
      const view = await this.view(work).catch(() => undefined), next = view?.continuation;
      if (!view?.wait || !next || next.state !== "eligible" || !next.auto) continue;
      await this.startFor({ runtime_id: RUNTIME, project_id: owner(work), session_id: work.session_id!, owner: { plugin_id: "", install_id: "" },
        request_key: next.request_key, wait_id: view.wait.wait_id, graph_id: next.graph_id, node_id: next.node_id }).catch(() => undefined);
    }
  }

  /**
   * The runtime asks to start a work's continuation. A wait the Host armed for a work's parts is the hand-back's (assistant-delegation.ts)
   * and is left to it; a work the person stopped, is sending to now, or that went on by itself too many rounds in a row is not started.
   */
  async startFor(request: AgentContinuationStartRequest): Promise<AgentContinuationStartAnswer> {
    const later = (code: string): AgentContinuationStartAnswer => ({ later: { code } });
    const work = this.works().find(one => owner(one) === request.project_id && one.session_id === request.session_id);
    if (!work || this.stopped.signal.aborted) return later("assistant.continuation_not_mine");
    const view = await this.view(work);
    if (!view?.wait || view.wait.wait_id !== request.wait_id) return later("assistant.handback_by_delegations");
    if (work.continuation_hold || view.wait.state !== "satisfied") {
      await this.ports.changed(work, () => !this.stopped.signal.aborted).catch(() => undefined);
      return later(work.continuation_hold ? "assistant.work_held" : "assistant.wait_not_satisfied");
    }
    if (this.busy.has(work.work_id)) return later("assistant.send_in_progress");
    const adapter = (await this.ports.host()).adapter(RUNTIME);
    const session = await adapter.readSession({ runtime_id: RUNTIME, session_id: request.session_id });
    if (session.recovery || session.latest_run && !isTerminalAgentPhase(session.latest_run.phase)) return later("agent.session_busy");
    // So many rounds in a row that no person wrote: the work stops here and says so; the person's next word starts the count again.
    const rounds = this.ports.store.rounds(work.work_id);
    let auto = 0;
    while (auto < rounds.length && rounds[rounds.length - 1 - auto]!.written_by === "host") auto++;
    if (auto >= DELEGATION_LIMITS.autoRounds) {
      this.ports.notify?.(work, { label: assistantWords("workbench.assistant-notice.handoff-blocked", { title: work.title }),
        original: `已经连续自己接着做了 ${DELEGATION_LIMITS.autoRounds} 轮，先停下来等你看一眼；你再说一句，它就接着做` }, `auto-cap-${request.request_key}`.slice(0, 80));
      return { refused: { code: "assistant.auto_round_cap", note: "连续自己接着做的轮数到了上限，等用户看一眼" } };
    }
    const revision = work.revision;
    const current = () => {
      if (this.stopped.signal.aborted || (this.busy.get(work.work_id) ?? 0) > 1) return false;
      const now = whenThere(() => this.ports.store.get(this.ports.actorId, work.work_id));
      return now !== null && now.revision === revision && !now.archived && !now.continuation_hold;
    };
    if (!current()) return later("assistant.work_changed");
    this.enter(work.work_id);
    try {
      const started = await this.ports.start(work, `（Molis 转告）这项工作等待的条件已有结果：${view.wait.reason}。请读取当前状态，依照本对话最新有效的要求，从尚未完成的地方继续；不要重复已完成的操作。等待结果只证明它报告的事实，不证明原任务已经完成。`, current, session.latest_run?.ref);
      const runId = (started as { run_id?: unknown } | undefined)?.run_id;
      return typeof runId === "string" ? { run: { run_id: runId, session_id: request.session_id } } : later("assistant.not_started");
    } catch (error) {
      // A revoked or stale start changes no wait and writes no business record: it stays eligible for the next round.
      if (!current()) return later("assistant.work_changed");
      const code = (error as { code?: unknown } | undefined)?.code;
      return { refused: { code: typeof code === "string" ? code.slice(0, 64) : "assistant.start_failed", note: (error instanceof Error ? error.message : String(error)).slice(0, 200) } };
    } finally { this.end(work.work_id); }
  }

}
