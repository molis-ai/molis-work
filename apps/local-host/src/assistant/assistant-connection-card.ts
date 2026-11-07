import { connectionNeedHtml, type ConnectionNeedView } from "@molis-ai/molis-work-app-workbench";
import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantCard } from "@molis-ai/molis-work-contracts/services/assistant";
import type { MolisWorkLocalHost } from "../project-host.js";
import { connectorManagementActions } from "../connector-management-actions.js";
import { listConnectorSettingsCards } from "../connector-directory.js";
import { localWebActionContext } from "../local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "../local-owner-permissions.js";
import { assistantErrors } from "./assistant-errors.js";
import type { StoredWork } from "./assistant-store.js";

type Say = (text: string, values?: Record<string, string | number>) => string;
type Setup = { service_id: string; method: string; display_name: string; connection_id?: string };
/** What the page needs to go on in the card: the card itself, and the non-secret plan the person's own connections routes take. */
export type AssistantConnectionCardView = { state: "link" }
  | { state: "prepared" | "pending" | "connected" | "cancelled"; html: string; setup?: Setup & { setup_id: string } };

/**
 * The connection card of an Assistant result that declared a pending connection (`ActionResultView.pending_connection`, C5, ASC-69):
 * the same card a plugin page gets, drawn here from the request's real state. The request is read and cancelled only through the
 * registered actions, as the person in the work's own project and runtime session, so `requireConnectorInitiator` lets only whoever
 * prepared it through: another session's request id draws no card (the page keeps the 「继续接入」 link) and cannot be cancelled. The
 * id comes from the card the Host kept, never from the request. Expired or failed, the card gives way to the link too.
 */
export async function assistantConnectionCard(host: MolisWorkLocalHost, home: string, work: StoredWork, card: AssistantCard, step: "read" | "cancel", say: Say): Promise<AssistantConnectionCardView> {
  const id = card.status === "done" ? card.presentation?.pending_connection?.authorization_id : undefined;
  if (!id) throw assistantErrors.not_found("这张卡没有待完成的接入");
  const reference = work.project_ref;
  const caller = { ...await localWebActionContext(host, reference, LOCAL_OWNER_PERMISSIONS), ...(work.session_id ? { runtime_session_id: work.session_id } : {}) };
  const client = reference ? host.actionClient(reference) : host.homeActionClient();
  const call = async (definition: ActionDefinition) => await client.invoke(caller, { capability_id: definition.capability_id, version: definition.version, provider_id: "system.connectors" }, { authorization_id: id }) as { status: string; setup?: Setup };
  let status: Awaited<ReturnType<typeof call>>;
  // Cancelling someone else's request is refused as it is (the caller hears why); reading one only falls back to the link.
  if (step === "cancel") status = await call(connectorManagementActions.cancel);
  else try { status = await call(connectorManagementActions.authorization); } catch (error) { if (error instanceof ActionError) return { state: "link" }; throw error; }
  const setup = status.setup, state = status.status;
  // Only a login in the browser or one pasted key is done in the card; every other way stays on the connections page.
  if (!setup || !["prepared", "pending", "connected", "cancelled"].includes(state) || !["oauth", "token"].includes(setup.method)) return { state: "link" };
  const title = (await listConnectorSettingsCards(home)).find(row => row.connector_id === setup.service_id)?.title ?? setup.display_name;
  const done = state === "connected" || state === "cancelled";
  const view: ConnectionNeedView & { read: NonNullable<ConnectionNeedView["read"]> } = {
    stage: done ? "line" : state === "pending" ? "running" : setup.method === "oauth" ? "ask" : "key", note: "", danger: false, busy: false, answered: done, accounts: [],
    read: { service_title: title, connection: null },
    ...(done ? { line: state === "connected" ? say("已连上 {name}", { name: title }) : say("没有连上，这里什么都没改") } : {}),
  };
  return { state: state as "prepared", html: connectionNeedHtml(say, say("助理"), view),
    ...(done ? {} : { setup: { service_id: setup.service_id, method: setup.method, display_name: setup.display_name, setup_id: id, ...(setup.connection_id ? { connection_id: setup.connection_id } : {}) } }) };
}
