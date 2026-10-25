import { randomUUID } from "node:crypto";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionUserAction } from "@molis-ai/molis-work-contracts/platform/actions";

// Only the Host's settings adapter issues these objects. Their text is audit evidence, never the credential.
// The private membership survives Host queue snapshots; copied or serialized plugin provenance cannot acquire it.
const entries = new WeakSet<ActionUserAction>();

export async function withPluginConsentSettingsEntry<Result>(caller: ActionCallContext,
  invoke: (caller: ActionCallContext) => Promise<Result>): Promise<Result> {
  const user_action: ActionUserAction = Object.freeze({ source: "web", conversation_ref: "web:settings:plugin-consents", message_ref: `web:request:${randomUUID()}` });
  entries.add(user_action);
  try { return await invoke({ ...caller, user_action }); }
  finally { entries.delete(user_action); }
}

/** Snapshot ordinary audit locators as before; an issued, immutable credential keeps its identity through the Host's queue. */
export function snapshotHostUserAction(action: ActionUserAction): ActionUserAction {
  return entries.has(action) ? action : { ...action };
}

export function assertPluginConsentSettingsEntry(caller: ActionCallContext): void {
  if (caller.audience !== "user" || caller.actor_id !== LOCAL_PERSON_ACTOR_ID || caller.project_id !== null
    || caller.host_plugin || caller.delegated_by || !caller.user_action || !entries.has(caller.user_action)) {
    throw new ActionError("actions.forbidden", "插件同意只接受本人在宿主设置里的操作");
  }
}
