import type { AgentSessionLifecycle } from "@molis-ai/molis-work-contracts/services/agent-host";
import { isTerminalAgentPhase } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";
import { restoredSessionRecords } from "./prologue-restored-session.js";
import type { PrologueRuntimePort, RunRecord, SessionRecord } from "./prologue.js";

/** One adapter's historical handles; the Node index fence also invalidates other handles sharing its owner. */
export class PrologueSessionCache {
  readonly restoring = new Map<string, Promise<SessionRecord>>();
  readonly #blocked = new Set<string>();
  readonly #generation = new Map<string, number>();
  constructor(private readonly runtime: PrologueRuntimePort, private readonly sessions: Map<string, SessionRecord>,
    private readonly runs: Map<string, RunRecord>, private readonly starting: Set<string>,
    private readonly publish: (runId: string) => void, private readonly flush: (runs: string[]) => Promise<void>) {}

  capture(id: string): () => void {
    const generation = this.#generation.get(id), external = this.runtime.sessions.capture?.(id);
    const current = () => {
      if (this.#blocked.has(id) || this.#generation.get(id) !== generation) throw agentErrors.session_busy("会话生命周期已变化，不能发布旧内容");
      external?.();
    };
    current(); return current;
  }
  require(id: string): SessionRecord {
    this.capture(id)();
    const found = this.sessions.get(id);
    if (!found) throw agentErrors.session_unknown("找不到这条会话");
    return found;
  }
  async load(id: string): Promise<SessionRecord> {
    const current = this.capture(id);
    await this.runtime.sessions.assertReadable?.(id); current();
    const found = this.sessions.get(id); if (found) return found;
    const held = this.restoring.get(id); if (held) return held;
    const loading = (async () => {
      const restored = await this.runtime.sessions.restore?.(id); current();
      if (!restored) return this.require(id);
      const { session, records } = restoredSessionRecords(restored);
      this.sessions.set(id, session);
      for (const record of records) { this.runs.set(record.view.ref.run_id, record); this.publish(record.view.ref.run_id); }
      return session;
    })();
    this.restoring.set(id, loading);
    try { return await loading; }
    finally { if (this.restoring.get(id) === loading) this.restoring.delete(id); }
  }
  bind(port: AgentSessionLifecycle): AgentSessionLifecycle {
    const quiet = (id: string) => {
      if (this.#blocked.has(id) || this.starting.has(id) || [...this.runs.values()].some(run => run.view.ref.session_id === id && !isTerminalAgentPhase(run.view.phase))) {
        throw agentErrors.session_busy("请先完成或停止当前执行，再管理会话生命周期");
      }
    };
    const change = async <T>(id: string, work: () => Promise<T>): Promise<T> => {
      quiet(id);
      let invalidated = false, current: (() => void) | undefined;
      try { current = this.runtime.sessions.capture?.(id); } catch { invalidated = true; }
      this.#blocked.add(id);
      const runs = [...this.runs.values()].filter(run => run.view.ref.session_id === id);
      try {
        await Promise.all(runs.map(run => run.timingCommit));
        await this.flush(runs.map(run => run.view.ref.run_id));
        const result = await work(); invalidated = true; return result;
      } finally {
        try { current?.(); } catch { invalidated = true; }
        if (invalidated) {
          this.#generation.set(id, (this.#generation.get(id) ?? 0) + 1);
          for (const run of runs) { run.unsubscribe(); run.listeners.clear(); this.runs.delete(run.view.ref.run_id); }
          this.sessions.delete(id); this.restoring.delete(id);
        }
        this.#blocked.delete(id);
      }
    };
    return { read: (session, owner) => port.read(session, owner), previewPurge: async (session, owner) => { quiet(session.session_id); return port.previewPurge(session, owner); },
      archive: (session, decision, owner) => { const args = structuredClone({ session, decision, owner }); return change(args.session.session_id, () => port.archive(args.session, args.decision, args.owner)); },
      unarchive: (session, decision, owner) => { const args = structuredClone({ session, decision, owner }); return change(args.session.session_id, () => port.unarchive(args.session, args.decision, args.owner)); },
      purge: (session, decision, preview, owner) => { const args = structuredClone({ session, decision, preview, owner }); return change(args.session.session_id, () => port.purge(args.session, args.decision, args.preview, args.owner)); },
    };
  }
}
