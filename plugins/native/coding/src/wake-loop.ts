/**
 * A session's step waits on the Host's task graph: the model waits for an answer or a background command, or the
 * person queued the round behind another session's work. The graph keeps the wait (it outlives a restart and settles
 * on the event); once it is over the step's continuation is ready, and this plugin takes it up by starting the session's
 * next round — the Host starts that round under the continuation's request key — or keeps a note for the person when it
 * should not start on its own (specs/prologue-adoption §4.6.10).
 */
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentCollaborationActions as collaboration } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import type { CodingSessionRecord } from "./store.js";
import { codingActionControl, type CodingBeforeWrite } from "./route-entry.js";
import { holdReason, openWait, waitViewOf, wakeBodyOf, type CodingWaitView } from "./waits.js";

type Capabilities = NonNullable<NonNullable<PluginStartContext["services"]>["capabilities"]>;

export interface CodingWakeDeps<Execution> {
  readonly context: PluginStartContext;
  readonly projectId: string;
  /** Sessions a send is being taken in for: a wait is not taken up beside one. */
  readonly busy: Set<string>;
  readonly stopped: AbortSignal;
  pause(ms: number): Promise<void>;
  records(execution: Execution): CodingSessionRecord[];
  record(execution: Execution, sessionId: string): CodingSessionRecord;
  /** The activation's own execution ports, which a loop started from a request reads and starts with. */
  activation(execution: Execution): Execution;
  startRound(record: CodingSessionRecord, body: Record<string, unknown>, actorId: string, api: Capabilities, execution: Execution, beforeWrite?: CodingBeforeWrite): Promise<unknown>;
}

export function codingWakeLoop<Execution>(deps: CodingWakeDeps<Execution>) {
  const { context } = deps;
  const storage = () => context.services?.storage;
  const noteKey = (waitId: string) => `wake-note:${waitId}`;
  const noteOf = (waitId: string) => storage()?.get(noteKey(waitId)) ?? undefined;
  const hold = (waitId: string, note: string) => storage()!.set(noteKey(waitId), note);
  /** The round the person queued, kept here by the wait that starts it. */
  const queuedOf = (waitId: string) => { const saved = storage()?.get(`queued:${waitId}`); return saved ? JSON.parse(saved) as { body: Record<string, unknown>; actor_id?: string; work_id: string } : undefined; };
  const hostActions = () => {
    if (!context.services?.actions) throw Object.assign(new Error("宿主未提供系统动作调用入口"), { code: "actions.unredeemed" });
    return context.services.actions;
  };
  /** The project's open waits, by runtime session. */
  const openWaits = async (runtimeId: string) => {
    const byRuntime = new Map<string, CodingWaitView>();
    for (const view of (await hostActions().invoke(collaboration.read, { runtime_id: runtimeId })).sessions) { const open = openWait(view); if (open) byRuntime.set(view.session_id, open); }
    return byRuntime;
  };
  /** The session's open wait; none when the Host keeps no task graph. */
  const openWaitOf = async (record: CodingSessionRecord) => record.runtime_session_id
    ? openWait((await hostActions().invoke(collaboration.read, { runtime_id: record.runtime_id, session_id: record.runtime_session_id }).catch(() => ({ sessions: [] }))).sessions[0]) : undefined;
  const waitView = (view: CodingWaitView) => waitViewOf(view, noteOf(view.wait.wait_id));
  /** The round a wait goes on to, from the body of the round that waited, or the round the person queued. */
  const wakeBody = (record: CodingSessionRecord, view: CodingWaitView, person = false) => {
    const saved = storage()?.get(`last-start:${record.session_id}`);
    return wakeBodyOf(view, saved ? JSON.parse(saved) as Record<string, unknown> : {}, person, queuedOf(view.wait.wait_id));
  };
  const actorOf = (record: CodingSessionRecord, view: CodingWaitView) => {
    const queued = queuedOf(view.wait.wait_id);
    if (queued) return String(queued.actor_id ?? LOCAL_PERSON_ACTOR_ID);
    try { return String(JSON.parse(storage()?.get(`last-start:${record.session_id}`) ?? "{}").actor_id ?? LOCAL_PERSON_ACTOR_ID); } catch { return LOCAL_PERSON_ACTOR_ID; }
  };
  /** A wait that is over: start the next round (it takes the continuation up), or leave it for the person with a note. */
  const takeUp = async (api: Capabilities, execution: Execution, runtimeId: string, view: CodingWaitView): Promise<"started" | "held" | "later" | "not-ours"> => {
    const found = deps.records(execution).find(entry => entry.runtime_id === runtimeId && entry.runtime_session_id === view.session_id);
    if (!found) return "not-ours";
    const reason = holdReason(view);
    if (reason) { hold(view.wait.wait_id, reason); return "held"; }
    if (deps.busy.has(found.session_id)) return "later";
    deps.busy.add(found.session_id);
    try {
      await deps.startRound(deps.record(execution, found.session_id), wakeBody(found, view), actorOf(found, view), api, execution);
      storage()?.delete(`queued:${view.wait.wait_id}`);
      return "started";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // The round it waited in may still be closing: try again shortly rather than give up.
      if (/正在|进行中|still running|session_busy/.test(message)) return "later";
      hold(view.wait.wait_id, `自动开始没有成功：${message}`);
      return "held";
    } finally { deps.busy.delete(found.session_id); }
  };
  const waking = new Set<string>();
  /**
   * One loop per runtime: it waits for a continuation to be ready (no polling of what the waits wait on) and takes it up.
   * It belongs to the activation, not to the request that started it: it reads and starts with the activation's own
   * capabilities and execution ports.
   */
  const wakeLoop = (_api: Capabilities, from: Execution, runtimeId: string) => {
    const api = context.services!.capabilities!, execution = deps.activation(from);
    if (waking.has(runtimeId) || deps.stopped.aborted) return;
    waking.add(runtimeId);
    void (async () => {
      const held = new Set<string>();
      // Transient read failures back off while this activation is alive; a Host without a task graph ends the loop.
      for (let failures = 0; !deps.stopped.aborted;) {
        let ready: CodingWaitView[];
        try { ready = (await api.invoke(agent.awaitContinuations, [runtimeId, 25_000, [...held]], { signal: deps.stopped })).flatMap(view => openWait(view) ?? []); failures = 0; }
        catch (error) {
          if (error && typeof error === "object" && "code" in error && error.code === "agent.capability_unavailable") break;
          failures += 1; await deps.pause(Math.min(30_000, failures * 5_000)); continue;
        }
        if (deps.stopped.aborted) break;
        let later = false;
        for (const view of ready) {
          const outcome = await takeUp(api, execution, runtimeId, view).catch(() => "later" as const);
          if ((outcome === "held" || outcome === "not-ours") && view.continuation) held.add(view.continuation.request_key);
          if (outcome === "later") later = true;
        }
        if (later) await deps.pause(2_000);
      }
    })().catch(() => undefined).finally(() => waking.delete(runtimeId));
  };
  /** The person gives the wait up: a request it waited on is withdrawn, a queued round's project work item goes. */
  const cancel = async (api: Capabilities, record: CodingSessionRecord, view: CodingWaitView, beforeWrite?: CodingBeforeWrite) => {
    for (const one of view.wait.conditions) if (one.kind === "envelope") await api.invoke(agent.cancelMessage, [record.runtime_id, one.ref]).catch(() => undefined);
    const queued = queuedOf(view.wait.wait_id);
    if (view.wait.by === "app" && queued) await api.invoke(agent.releaseProjectRound, [record.runtime_id, queued.work_id, "用户取消了等待"]).catch(() => undefined);
    if (view.wait.state === "waiting") await hostActions().invoke(collaboration.control, { runtime_id: record.runtime_id, kind: "cancel-wait", wait_id: view.wait.wait_id, note: "用户取消了等待" },
      beforeWrite && codingActionControl(beforeWrite));
    storage()?.delete(`queued:${view.wait.wait_id}`);
  };
  /** The person goes on before the wait is over: the continuation is ready at once, and the round started now takes it up. */
  const goOn = async (api: Capabilities, execution: Execution, record: CodingSessionRecord, view: CodingWaitView, actorId: string, beforeWrite?: CodingBeforeWrite) => {
    if (view.wait.state === "waiting") await hostActions().invoke(collaboration.control, { runtime_id: record.runtime_id, kind: "continue-now", wait_id: view.wait.wait_id, note: "用户选择现在开始" },
      beforeWrite && codingActionControl(beforeWrite));
    const started = await deps.startRound(record, wakeBody(record, view, true), actorId, api, execution, beforeWrite);
    storage()?.delete(`queued:${view.wait.wait_id}`);
    return started;
  };
  /** Keep the round the person queued, by the wait that will start it. */
  const keepQueued = (waitId: string, body: Record<string, unknown>, actorId: string, workId: string) => storage()!.set(`queued:${waitId}`, JSON.stringify({ body, actor_id: actorId, work_id: workId }));
  return { openWaits, openWaitOf, waitView, wakeLoop, cancel, goOn, keepQueued };
}
