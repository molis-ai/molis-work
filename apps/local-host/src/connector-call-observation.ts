import type { ActionHandlerBinding, ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ConnectorCallObservation } from "@molis-ai/molis-work-service-connector-host";
import { lastConnectorCheck, withConnectorConnections } from "./connector-connection-store.js";
import { withConnectorObservations } from "./connector-observations.js";
import { hostLog } from "./host-log.js";
import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { nextRun, remindable, useOfError, type ConnectionUse } from "./connector-failure-runs.js";
import { refreshRefused } from "./connector-refresh-refusals.js";
import { raiseConnectionNotice, settleConnectionNotices } from "./assistant/assistant-connection-notices.js";

type Caller = Parameters<ActionHandlerBinding["handle"]>[0];
type CallIdentity = Omit<ConnectorCallObservation, "at" | "revision" | "outcome" | "failures" | "failing_since" | "failure_class">;

/** Where a connection's notice opens: the connection settings of its service (the page has no address for one account of it). */
export const connectionSettingsPath = (serviceId: string) => `/settings/connectors?connector=${encodeURIComponent(serviceId)}`;

/**
 * Remember one use of a connection of the registry as its last call, with the run of failures it carries on (ASC-58), and tell the person
 * or stop telling them. `always: false` writes only what changes something: a failure, or the end of a run (a plugin's request that went
 * through, where nothing was written before either). The caller has already asked the call again (`beforeEffect`); a revision that moved
 * meanwhile writes nothing.
 */
export function recordConnectionUse(home: string, id: string, revision: string, identity: CallIdentity, outcome: ConnectorCallObservation["outcome"],
  use: ConnectionUse, always: boolean): void {
  const at = new Date().toISOString();
  const row = withConnectorConnections(home, store => store.get(id));
  if (!row || row.updated_at !== revision) return;
  const { previous, run } = withConnectorObservations(home, store => {
    const previous = store.read(id).call, run = nextRun(previous, revision, use, at);
    const ending = use.kind !== "skipped" && use.kind !== "failed" && previous?.revision === revision && Boolean(previous.failures);
    if (always || use.kind === "failed" || ending) store.call(id, { at, revision, outcome, ...identity, ...run });
    return { previous, run };
  });
  if (use.kind === "failed") {
    if (remindable(run, at)) raiseConnectionNotice(home, { connection_id: id, revision, failure_class: use.failure_class, failing_since: run.failing_since!,
      name: row.display_name, settings_path: connectionSettingsPath(row.service_id) });
  } else if (use.kind !== "skipped" && previous?.failures) settleConnectionNotices(home, id);
}

/** Records only the attempted business operation; discovery and refusal before dispatch do not replace its receipt. */
export async function observeConnectorCall<T>(home: string, id: string, action: ActionReference, caller: Caller,
  run: (dispatched: () => void) => Promise<T>): Promise<T> {
  const revision = () => withConnectorConnections(home, store => {
    const row = store.get(id); return row?.enabled && !row.disconnected_at ? row.updated_at : undefined;
  });
  // A refresh the token endpoint refused during this call (S-70) is a run of `reauth`; one refused before it is not this call's.
  const markedBefore = () => withConnectorConnections(home, store => { const row = store.get(id); return row ? refreshRefused(home, row, lastConnectorCheck(store, id)) : false; });
  const wasMarked = markedBefore();
  return observeConnectionCall(home, id, action, caller, revision, run, (outcome, error) => {
    if (outcome === "succeeded") return { kind: "succeeded" };
    if (error === undefined) return { kind: "ended" };
    return !wasMarked && markedBefore() ? { kind: "failed", failure_class: "reauth" } : useOfError(error);
  });
}

/** Project MCP keeps its configuration in the SDK; it supplies a live revision reader instead of copying that record. */
export async function observeConnectionCall<T>(home: string, id: string, action: ActionReference, caller: Caller,
  revision: () => string | undefined | Promise<string | undefined>,
  run: (dispatched: () => void, result: (outcome: ConnectorCallObservation["outcome"]) => void) => Promise<T>,
  /** For a connection of the registry: what the use says about the connection, so its run of failures is kept (ASC-58). */
  useOf?: (outcome: ConnectorCallObservation["outcome"], error: unknown) => ConnectionUse): Promise<T> {
  const initial = await revision();
  let dispatched = false;
  let known: ConnectorCallObservation["outcome"] | undefined;
  const settle = async (outcome: ConnectorCallObservation["outcome"], error?: unknown) => {
    if (!dispatched) return;
    await caller.beforeEffect(); caller.signal?.throwIfAborted();
    if (!initial || await revision() !== initial) throw connectorErrors["connector.connection.invalid"]("调用期间连接已变化，结果不能继续用于原任务");
    await caller.beforeEffect(); caller.signal?.throwIfAborted();
    const identity: CallIdentity = { action, actor_id: caller.actor_id, project_id: caller.project_id, ...(caller.call_id ? { call_id: caller.call_id } : {}) };
    try {
      if (useOf) recordConnectionUse(home, id, initial, identity, outcome, useOf(outcome, error), true);
      else withConnectorObservations(home, store => store.call(id, { at: new Date().toISOString(), revision: initial, outcome, ...identity }));
    } catch (failure) { hostLog.warn("connections", "call_observation_unwritten", failure, { connection_id: id }); }
  };
  let result: T;
  try { result = await run(() => { dispatched = true; }, outcome => { known = outcome; }); }
  // Observation cannot replace the original dispatch failure (including the SDK's cancellation/error contract).
  catch (error) { await settle(known ?? "unknown", error).catch(() => undefined); throw error; }
  await settle(known ?? (result && typeof result === "object" && "isError" in result && result.isError === true ? "failed" : "succeeded"));
  return result;
}
