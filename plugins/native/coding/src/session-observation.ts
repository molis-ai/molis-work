import { codingBackgroundState } from "./background-state.js";
import { type Capabilities, type CodingActivation, priorityOf, sessionState } from "./route-activation.js";
import { codingActions, type CodingBeforeWrite } from "./route-entry.js";
import type { CodingExecution } from "./routes.js";
import type { CodingSessionRecord } from "./store.js";
import type { CodingWaitView } from "./waits.js";
import { codingText } from "./words.js";
import { agentHostCapabilities as agent, isTerminalAgentPhase, type AgentSessionStatus } from "@molis-ai/molis-work-contracts/services/agent-host";

/** Queries return current projections. Only the activation's observation job persists them (SYS-15-Q1/Q2). */
export async function readCodingSessions(a: CodingActivation, api: Capabilities, execution: CodingExecution, beforeWrite: CodingBeforeWrite, persist = false) {
  const { projectId } = a;
  // Every session's standing in one Host call per runtime, rather than one queued read per session.
  const records = execution.sessions.list(projectId);
  // The titles of the Goals sessions are attached to, as Goals has them now: read through Goals' public action, and kept for the
  // directory, which draws at once (goal-titles.ts). A Goal that cannot be read keeps the title it had, or none.
  await execution.goalTitles.read(records.flatMap(record => record.goal_id ? [record.goal_id] : []), beforeWrite, persist);
  const statuses = new Map<string, AgentSessionStatus | { session_id: string; error: string }>();
  for (const runtimeId of new Set(records.filter(record => record.runtime_session_id).map(record => record.runtime_id))) {
    const ids = records.filter(record => record.runtime_id === runtimeId && record.runtime_session_id).map(record => record.runtime_session_id!);
    try { for (const status of await api.invoke(agent.readSessionStatuses, [runtimeId, ids])) statuses.set(`${runtimeId}:${status.session_id}`, status); }
    catch (error) { for (const id of ids) statuses.set(`${runtimeId}:${id}`, { session_id: id, error: error instanceof Error ? error.message : codingText(execution.locale)("coding.server.session-unreadable") }); }
  }
  // Parked sessions are read without starting their consumer; the activation job owns its recovery.
  const parked = new Map<string, CodingWaitView>(), backgroundUnreadable = await codingBackgroundState(codingActions(a.context, beforeWrite), records, execution.sessions, projectId, persist ? beforeWrite : undefined);
  for (const runtimeId of new Set(records.filter(record => record.runtime_session_id).map(record => record.runtime_id))) {
    try { for (const [session, wait] of await a.waits.openWaits(runtimeId)) parked.set(`${runtimeId}:${session}`, wait); } catch { /* shown as not waiting */ }
  }
  // One session after the other: each recorded state is its own write, and the writes keep the order the sessions are listed in.
  const describe = async (record: CodingSessionRecord) => {
    const write = async () => {
      await beforeWrite();
      const current = execution.sessions.get(projectId, record.session_id);
      if (current.updated_at !== record.updated_at || current.runtime_session_id !== record.runtime_session_id || current.state !== record.state) throw new Error("Session changed during observation");
    };
    const background_unreadable = backgroundUnreadable.has(record.runtime_id);
    let checkpointBusy = false, steps = execution.sessions.stepsOf(projectId, record.session_id);
    // A parked session waits whatever its last round did — unless a round is under way right now.
    const wait = record.runtime_session_id ? parked.get(`${record.runtime_id}:${record.runtime_session_id}`) : undefined;
    const status = record.runtime_session_id ? statuses.get(`${record.runtime_id}:${record.runtime_session_id}`) : undefined;
    const active = status && !("error" in status) && status.latest_phase && !isTerminalAgentPhase(status.latest_phase);
    if (wait && !active) {
      if (record.state !== "queued") record = persist ? await execution.sessions.setState(write, projectId, record.session_id, "queued", record.updated_at) : { ...record, state: "queued" };
      return { ...record, background_unreadable, checkpoint_busy: false, ...(steps ? { steps } : {}), queued: a.waits.waitView(wait),
        goal_title: record.goal_id ? execution.goalTitles.known(record.goal_id) ?? null : null };
    }
    if (record.runtime_session_id) {
      const status = statuses.get(`${record.runtime_id}:${record.runtime_session_id}`);
      if (status && !("error" in status)) {
        checkpointBusy = status.checkpoint_busy;
        const read = status.steps ?? null;
        if (JSON.stringify(read) !== JSON.stringify(steps)) { if (persist) await execution.sessions.setSteps(write, projectId, record.session_id, read); steps = read; }
        const next = status.recovery ? "reconcile-required" : status.latest_phase ? sessionState({ phase: status.latest_phase }) : "idle";
        if (next !== record.state) record = persist ? await execution.sessions.setState(write, projectId, record.session_id, next, record.updated_at) : { ...record, state: next };
      } else if (record.state !== "reconcile-required") {
        // One unreadable ledger must not hide other sessions or make the
        // directory call completed work safe to continue.
        record = persist ? await execution.sessions.setState(write, projectId, record.session_id, "reconcile-required", record.updated_at) : { ...record, state: "reconcile-required" };
      }
    }
    return { ...record, background_unreadable, checkpoint_busy: checkpointBusy, ...(steps ? { steps } : {}), ...(priorityOf(a, record.session_id) ? { priority: true } : {}), goal_title: record.goal_id ? execution.goalTitles.known(record.goal_id) ?? null : null };
  };
  const sessions = [];
  for (const record of records) sessions.push(await describe(record));
  return sessions;
}
