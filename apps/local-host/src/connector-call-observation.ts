import type { ActionHandlerBinding, ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ConnectorCallObservation } from "@molis-ai/molis-work-service-connector-host";
import { withConnectorConnections } from "./connector-connection-store.js";
import { withConnectorObservations } from "./connector-observations.js";
import { hostLog } from "./host-log.js";
import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";

type Caller = Parameters<ActionHandlerBinding["handle"]>[0];

/** Records only the attempted business operation; discovery and refusal before dispatch do not replace its receipt. */
export async function observeConnectorCall<T>(home: string, id: string, action: ActionReference, caller: Caller,
  run: (dispatched: () => void) => Promise<T>): Promise<T> {
  return observeConnectionCall(home, id, action, caller, () => withConnectorConnections(home, store => {
    const row = store.get(id); return row?.enabled && !row.disconnected_at ? row.updated_at : undefined;
  }), run);
}

/** Project MCP keeps its configuration in the SDK; it supplies a live revision reader instead of copying that record. */
export async function observeConnectionCall<T>(home: string, id: string, action: ActionReference, caller: Caller,
  revision: () => string | undefined | Promise<string | undefined>,
  run: (dispatched: () => void, result: (outcome: ConnectorCallObservation["outcome"]) => void) => Promise<T>): Promise<T> {
  const initial = await revision();
  let dispatched = false;
  let known: ConnectorCallObservation["outcome"] | undefined;
  const settle = async (outcome: ConnectorCallObservation["outcome"]) => {
    if (!dispatched) return;
    await caller.beforeEffect(); caller.signal?.throwIfAborted();
    if (!initial || await revision() !== initial) throw connectorErrors["connector.connection.invalid"]("调用期间连接已变化，结果不能继续用于原任务");
    await caller.beforeEffect(); caller.signal?.throwIfAborted();
    try {
      withConnectorObservations(home, store => store.call(id, { at: new Date().toISOString(), revision: initial, outcome,
        action, actor_id: caller.actor_id, project_id: caller.project_id, ...(caller.call_id ? { call_id: caller.call_id } : {}) }));
    } catch (error) { hostLog.warn("connections", "call_observation_unwritten", error, { connection_id: id }); }
  };
  let result: T;
  try { result = await run(() => { dispatched = true; }, outcome => { known = outcome; }); }
  // Observation cannot replace the original dispatch failure (including the SDK's cancellation/error contract).
  catch (error) { await settle(known ?? "unknown").catch(() => undefined); throw error; }
  await settle(known ?? (result && typeof result === "object" && "isError" in result && result.isError === true ? "failed" : "succeeded"));
  return result;
}
