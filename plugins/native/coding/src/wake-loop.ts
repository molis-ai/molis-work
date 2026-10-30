/**
 * A session's step waits on the Host's task graph: the model waits for an answer or a background command, or the
 * person queued the round behind another session's work. The graph keeps the wait (it outlives a restart and settles
 * on the event); once it is over the step's continuation is ready, and this plugin takes it up by starting the session's
 * next round — the Host starts that round under the continuation's request key — or keeps a note for the person when it
 * should not start on its own (specs/prologue-adoption §4.6.10).
 */
import { setTimeout as rest } from "node:timers/promises";
import { platformErrorKind } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginJobControl, PluginKeptJob, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentCollaborationActions as collaboration } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import type { CodingSessionRecord } from "./store.js";
import { codingActions, codingActionControl, codingJobWrite, type CodingBeforeWrite } from "./route-entry.js";
import { holdReason, openWait, waitViewOf, wakeBodyOf, type CodingWaitView } from "./waits.js";

type Capabilities = NonNullable<NonNullable<PluginStartContext["services"]>["actions"]>;

interface CodingWakeDeps<Execution> {
  readonly context: PluginStartContext;
  readonly projectId: string;
  /** Sessions a send is being taken in for: a wait is not taken up beside one. */
  readonly busy: Set<string>;
  records(execution: Execution): CodingSessionRecord[];
  record(execution: Execution, sessionId: string): CodingSessionRecord;
  startRound(record: CodingSessionRecord, body: Record<string, unknown>, api: Capabilities, execution: Execution, beforeWrite: CodingBeforeWrite): Promise<unknown>;
}

/**
 * The round was refused before it started: the job is stopping, the call was cancelled, or the authority to start it is gone
 * (withdrawn, the plugin turned off). A refused call writes no record (AGENTS): no note is kept and the continuation stays where
 * it is, for an activation that may start it.
 */
function refused(error: unknown, signal: AbortSignal): boolean {
  if (signal.aborted || (error as { name?: unknown } | undefined)?.name === "AbortError") return true;
  const { code, kind } = (error ?? {}) as { code?: unknown; kind?: unknown };
  const sort = typeof kind === "string" ? kind : typeof code === "string" ? platformErrorKind(code) : undefined;
  return sort === "forbidden" || sort === "cancelled" || sort === "unavailable";
}

export function codingWakeLoop<Execution>(deps: CodingWakeDeps<Execution>) {
  const { context } = deps;
  const storage = () => context.services?.storage;
  const noteKey = (waitId: string) => `wake-note:${waitId}`;
  const noteOf = (waitId: string) => storage()?.get(noteKey(waitId)) ?? undefined;
  const hold = (waitId: string, note: string) => storage()!.set(noteKey(waitId), note);
  /** The round the person queued, kept here by the wait that starts it. */
  const queuedOf = (waitId: string) => { const saved = storage()?.get(`queued:${waitId}`); return saved ? JSON.parse(saved) as { body: Record<string, unknown>; work_id: string } : undefined; };
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
  /**
   * A wait that is over: start the next round (it takes the continuation up), or leave it for the person with a note. The round
   * names no one: the Host starts it for the caller it bound (horizontal/agent-host), and the job's caller is the activation's.
   */
  const takeUp = async (api: Capabilities, execution: Execution, runtimeId: string, view: CodingWaitView, control: PluginJobControl): Promise<"started" | "held" | "later" | "not-ours" | "refused"> => {
    const found = deps.records(execution).find(entry => entry.runtime_id === runtimeId && entry.runtime_session_id === view.session_id);
    if (!found) return "not-ours";
    const reason = holdReason(view);
    if (reason) { hold(view.wait.wait_id, reason); return "held"; }
    if (deps.busy.has(found.session_id)) return "later";
    deps.busy.add(found.session_id);
    try {
      await deps.startRound(deps.record(execution, found.session_id), wakeBody(found, view), api, execution, codingJobWrite(control));
      storage()?.delete(`queued:${view.wait.wait_id}`);
      return "started";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // The round it waited in may still be closing: try again shortly rather than give up.
      if (/正在|进行中|still running|session_busy/.test(message)) return "later";
      if (refused(error, control.signal)) return "refused";
      hold(view.wait.wait_id, `自动开始没有成功：${message}`);
      return "held";
    } finally { deps.busy.delete(found.session_id); }
  };
  /**
   * One runtime's loop: it waits for a continuation to be ready (no polling of what the waits wait on) and takes it up, until the
   * job stops. Its pauses are timers the job's signal clears: stopping the plugin aborts the signal before `stop()` runs, so no
   * pause of a stopped activation fires and reaches a platform service (BL-411).
   *
   * A loop that `recovery` started (the activation found sessions tied to an Agent run) did not wait for the runtime to be ready: its
   * first read starts the runtime. If that first read fails, before any has succeeded, the runtime is not there to be woken (not
   * attached, or it cannot start), and the loop ends as it does for a Host without a task graph, instead of retrying every 5 to 30 s
   * for nothing; the next `coding.state` read or round starts a loop again. A loop a request started keeps retrying.
   */
  const loop = async (control: PluginJobControl, execution: Execution, runtimeId: string, recovery: boolean) => {
    const api = context.services!.actions!, pause = (ms: number) => rest(ms, undefined, { signal: control.signal, ref: false });
    const held = new Set<string>();
    let served = false;
    // Transient read failures back off while the job runs; a Host without a task graph ends the loop.
    for (let failures = 0; !control.signal.aborted;) {
      let ready: CodingWaitView[];
      try { ready = (await context.services!.actions!.invoke(agent.awaitContinuations, [runtimeId, 25_000, [...held]], { signal: control.signal, beforeEffect: control.beforeEffect })).flatMap(view => openWait(view) ?? []); failures = 0; served = true; }
      catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "agent.capability_unavailable") return;
        if (recovery && !served) return;
        failures += 1; await pause(Math.min(30_000, failures * 5_000)); continue;
      }
      control.signal.throwIfAborted();
      let later = false;
      for (const view of ready) {
        const outcome = await takeUp(api, execution, runtimeId, view, control).catch(() => "later" as const);
        // Held, not ours, or refused: this activation does not ask again.
        if ((outcome === "held" || outcome === "not-ours" || outcome === "refused") && view.continuation) held.add(view.continuation.request_key);
        if (outcome === "later") later = true;
      }
      if (later) await pause(2_000);
    }
  };
  const jobs = wakeJob(context, loop);
  /** Ask for `runtimeId`'s loop; nothing when one runs. */
  const wakeLoop = (_api: Capabilities, execution: Execution, runtimeId: string, recovery = false) => jobs.wake(execution, runtimeId, recovery);
  /** The person gives the wait up: a request it waited on is withdrawn, a queued round's project work item goes. */
  const cancel = async (record: CodingSessionRecord, view: CodingWaitView, beforeWrite: CodingBeforeWrite) => {
    const actions = codingActions(context, beforeWrite);
    for (const one of view.wait.conditions) if (one.kind === "envelope") await actions.invoke(agent.cancelMessage, [record.runtime_id, one.ref]).catch(() => undefined);
    const queued = queuedOf(view.wait.wait_id);
    if (view.wait.by === "app" && queued) await actions.invoke(agent.releaseProjectRound, [record.runtime_id, queued.work_id, "用户取消了等待"]).catch(() => undefined);
    // An open wait is cancelled; one over whose step is held for the person gives the step back.
    if (view.wait.state === "waiting" || ["blocked", "needs-reconciliation"].includes(view.continuation?.state ?? ""))
      await actions.invoke(collaboration.control, { runtime_id: record.runtime_id, kind: "cancel-wait", wait_id: view.wait.wait_id, note: "用户取消了等待" });
    storage()?.delete(`queued:${view.wait.wait_id}`);
  };
  /** The person goes on before the wait is over: the continuation is ready at once, and the round started now takes it up. */
  const goOn = async (api: Capabilities, execution: Execution, record: CodingSessionRecord, view: CodingWaitView, beforeWrite: CodingBeforeWrite) => {
    if (view.wait.state === "waiting") await hostActions().invoke(collaboration.control, { runtime_id: record.runtime_id, kind: "continue-now", wait_id: view.wait.wait_id, note: "用户选择现在开始" },
      codingActionControl(beforeWrite));
    const started = await deps.startRound(record, wakeBody(record, view, true), api, execution, beforeWrite);
    storage()?.delete(`queued:${view.wait.wait_id}`);
    return started;
  };
  /** Keep the round the person queued, by the wait that will start it. */
  const keepQueued = (waitId: string, body: Record<string, unknown>, workId: string) => storage()!.set(`queued:${waitId}`, JSON.stringify({ body, work_id: workId }));
  return { openWaits, openWaitOf, waitView, wakeLoop, keep: jobs.keep, cancel, goOn, keepQueued };
}

/**
 * The loops belong to the activation, not to the request that asked for one: they run in its `wake` job (PG-038), kept when the
 * activation starts, with the installation's own authority, and they read and start with the activation's own capabilities. A
 * request only says which runtime to look at; one runtime has one loop at a time.
 */
function wakeJob<Execution>(context: PluginStartContext, loop: (control: PluginJobControl, execution: Execution, runtimeId: string, recovery: boolean) => Promise<void>) {
  const wanted = new Map<string, { execution: Execution; recovery: boolean }>();
  let job: PluginKeptJob | undefined, nudge: (() => void) | undefined;
  const supervise = async (control: PluginJobControl) => {
    const looping = new Set<string>();
    while (!control.signal.aborted) {
      for (const [runtimeId, { execution, recovery }] of wanted) {
        wanted.delete(runtimeId);
        if (looping.has(runtimeId)) continue;
        looping.add(runtimeId);
        void loop(control, execution, runtimeId, recovery).catch(() => undefined).finally(() => looping.delete(runtimeId));
      }
      // Idle until a request names a runtime, or the job stops: the listener goes with the wait it ends.
      await new Promise<void>(resolve => {
        const done = () => { nudge = undefined; control.signal.removeEventListener("abort", done); resolve(); };
        nudge = done; control.signal.addEventListener("abort", done, { once: true });
      });
    }
  };
  /**
   * Keeps the activation's `wake` job when none runs. The platform keeps one only from `start()`, a command or a job: from a read
   * (`coding.state`) it is refused, and the read only wakes the job that runs.
   */
  const keep = () => {
    if (job || !context.services?.background) return;
    try {
      const kept = job = context.services.background.keep("wake", supervise);
      void kept.done.catch(() => undefined).finally(() => { if (job === kept) job = undefined; });
    } catch { /* Not kept from here; the next command or round keeps it. */ }
  };
  const wake = (execution: Execution, runtimeId: string, recovery: boolean) => {
    if (!wanted.has(runtimeId)) wanted.set(runtimeId, { execution, recovery });
    keep();
    nudge?.();
  };
  return { keep, wake };
}
