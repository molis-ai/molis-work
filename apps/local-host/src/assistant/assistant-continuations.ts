import { setTimeout as pause } from "node:timers/promises";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import { isTerminalAgentPhase, type AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentCollaborationSessionView } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { ASSISTANT_PERSONAL_OWNER, type AssistantWorkState } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import { repeatingFailure } from "../host-log.js";
import { whenThere } from "./assistant-errors.js";

const owner = (work: StoredWork) => work.project_ref?.project_id ?? ASSISTANT_PERSONAL_OWNER;
const RUNTIME = "prologue";
type Ports = {
  store: AssistantStore; actorId: string; host(): Promise<AgentHost>;
  start(work: StoredWork, text: string, current: () => boolean, continuedFrom?: AgentRunRef): Promise<unknown>;
  changed(work: StoredWork, current: () => boolean): Promise<void>;
  holdSetups?(sessionId: string, revision: string): void;
};

/** Watches SDK-owned continuations, never the login endpoint. No model calls are made while a wait is pending. */
export class AssistantContinuations {
  private readonly busy = new Map<string, number>();
  private readonly inputs = new Map<string, symbol>();
  private readonly loops = new Set<string>();
  private readonly stopped = new AbortController();
  private readonly observers = new Set<() => void>();
  private readonly nudges = new Map<string, AbortController>();
  private readonly offChanges: () => void;
  private readonly watchFailures = repeatingFailure("assistant", "continuation_watch_failed"); // A failing watch is retried every 5 s; written when it starts failing.
  constructor(private readonly ports: Ports) { this.offChanges = ports.store.onChange(id => {
    // Deleted work has no scope to wake; a store that cannot be read fails this listener, which the store writes.
    const work = whenThere(() => ports.store.get(ports.actorId, id));
    if (work) this.nudges.get(owner(work))?.abort();
  }); }
  close(): void { this.stopped.abort(); this.offChanges(); for (const nudge of this.nudges.values()) nudge.abort(); for (const off of this.observers) off(); this.observers.clear(); }
  private works() { return this.ports.store.list(this.ports.actorId, { limit: Number.MAX_SAFE_INTEGER }).filter(work => work.executor.kind === "assistant" && work.session_id && !work.reply_target); }
  /** The existing observed-state projection makes an interrupted or waiting work start the runtime on Host restart. */
  pending(): boolean { return this.works().some(work => !work.continuation_hold && ["running", "waiting-input", "waiting-review"].includes(this.ports.store.observed(this.ports.actorId, work.work_id) ?? "")); }
  attach(): void { for (const work of this.works()) this.watchScope(owner(work)); }
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
  begin(work: StoredWork, text: string) {
    const token = Symbol(); this.inputs.set(work.work_id, token);
    this.enter(work.work_id);
    const current = () => this.inputs.get(work.work_id) === token;
    const end = () => { if (current()) this.inputs.delete(work.work_id); this.end(work.work_id); };
    try {
      const updated = this.ports.store.update(this.ports.actorId, work.work_id, null, { draft: text, continuation_hold: "input" }, false);
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
    this.watchScope(owner(work));
    void this.ports.host().then(host => {
      if (this.stopped.signal.aborted) return;
      let off: (() => void) | undefined, ended = false;
      const finish = () => { if (ended) return; ended = true; queueMicrotask(() => { off?.(); if (off) this.observers.delete(off); });
        if (!this.stopped.signal.aborted) void this.ports.changed(work, () => !this.stopped.signal.aborted).catch(() => undefined); };
      off = host.adapter(RUNTIME).observe(run, view => { if (isTerminalAgentPhase(view.phase)) finish(); });
      if (ended) off(); else this.observers.add(off);
    }).catch(() => undefined);
  }
  private watchScope(scope: string): void {
    if (this.loops.has(scope) || this.stopped.signal.aborted) return;
    this.loops.add(scope);
    void this.keepWatching(scope).finally(() => this.loops.delete(scope));
  }
  private async keepWatching(scope: string): Promise<void> {
    while (!this.stopped.signal.aborted) {
      try { await this.loop(scope); return; }
      catch (error) { if (this.stopped.signal.aborted) return; this.watchFailures.failed(scope, error, { scope }); await pause(5_000, undefined, { signal: this.stopped.signal }).catch(() => undefined); }
    }
  }
  private async loop(scope: string): Promise<void> {
    const collaboration = (await this.ports.host()).adapter(RUNTIME).collaboration;
    if (!collaboration) return;
    const held = new Map<string, { work_id?: string; revision?: number }>();
    while (!this.stopped.signal.aborted) {
      const works = this.works().filter(work => owner(work) === scope);
      for (const [key, saved] of held) if (saved.work_id && works.find(work => work.work_id === saved.work_id)?.revision !== saved.revision) held.delete(key);
      const nudge = new AbortController(); this.nudges.set(scope, nudge);
      const views = await collaboration.awaitReady(scope, 25_000, [...held.keys()], AbortSignal.any([this.stopped.signal, nudge.signal]));
      if (this.stopped.signal.aborted) return;
      this.watchFailures.worked(scope);
      let retry = false;
      for (const view of views) {
        const next = view.continuation;
        if (!next) continue;
        if (view.wait?.by === "app") { held.set(next.request_key, {}); continue; }
        const work = this.works().find(work => owner(work) === scope && work.session_id === view.session_id);
        if (!work) { held.set(next.request_key, {}); continue; }
        if (work.continuation_hold || next.state !== "eligible" || !next.auto || view.wait?.state !== "satisfied") {
          await this.ports.changed(work, () => !this.stopped.signal.aborted); held.set(next.request_key, { work_id: work.work_id, revision: work.revision }); continue;
        }
        if (this.busy.has(work.work_id)) { retry = true; continue; }
        const adapter = (await this.ports.host()).adapter(RUNTIME);
        const session = await adapter.readSession({ runtime_id: RUNTIME, session_id: view.session_id });
        if (session.recovery || session.latest_run && !isTerminalAgentPhase(session.latest_run.phase)) { retry = true; continue; }
        const revision = work.revision;
        const current = () => {
          if (this.stopped.signal.aborted || (this.busy.get(work.work_id) ?? 0) > 1) return false;
          const now = whenThere(() => this.ports.store.get(this.ports.actorId, work.work_id)); // A store that cannot be read is thrown: the watch writes it.
          return now !== null && now.revision === revision && !now.archived && !now.continuation_hold;
        };
        if (!current()) { retry = true; continue; }
        this.enter(work.work_id);
        try {
          await this.ports.start(work, `（Molis 转告）这项工作等待的条件已有结果：${view.wait.reason}。请读取当前状态，依照本对话最新有效的要求，从尚未完成的地方继续；不要重复已完成的操作。等待结果只证明它报告的事实，不证明原任务已经完成。`, current, session.latest_run?.ref);
        } catch {
          // A revoked/stale start changes no wait and writes no diagnostic business record. A future activation may retry.
          if (current()) held.set(next.request_key, { work_id: work.work_id, revision: work.revision }); else retry = true;
        } finally { this.end(work.work_id); }
      }
      if (retry) await pause(500, undefined, { signal: this.stopped.signal });
    }
  }
}
