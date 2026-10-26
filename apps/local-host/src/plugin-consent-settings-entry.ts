import { randomUUID } from "node:crypto";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionUserAction } from "@molis-ai/molis-work-contracts/platform/actions";

// Only the Host's settings adapter issues these objects. Their text is audit evidence, never the credential.
// The private membership survives Host queue snapshots; copied or serialized plugin provenance cannot acquire it.
const entries = new WeakSet<ActionUserAction>();
// The project settings page's own door for what a plugin installed in that project holds (PG-002, S-93): a second membership, so a credential
// the Home's consent door issued is not good for it and the other way round.
const permissionEntries = new WeakSet<ActionUserAction>();
// The same switch for the plugins that run as the Home's own instance (BL-700, S-93): the Host settings door, no project; a third membership.
const homePermissionEntries = new WeakSet<ActionUserAction>();

export async function withPluginConsentSettingsEntry<Result>(caller: ActionCallContext,
  invoke: (caller: ActionCallContext) => Promise<Result>): Promise<Result> {
  const user_action: ActionUserAction = Object.freeze({ source: "web", conversation_ref: "web:settings:plugin-consents", message_ref: `web:request:${randomUUID()}` });
  entries.add(user_action);
  try { return await invoke({ ...caller, user_action }); }
  finally { entries.delete(user_action); }
}

export async function withPluginPermissionSettingsEntry<Result>(caller: ActionCallContext,
  invoke: (caller: ActionCallContext) => Promise<Result>): Promise<Result> {
  const user_action: ActionUserAction = Object.freeze({ source: "web", conversation_ref: "web:settings:plugin-permissions", message_ref: `web:request:${randomUUID()}` });
  permissionEntries.add(user_action);
  try { return await invoke({ ...caller, user_action }); }
  finally { permissionEntries.delete(user_action); }
}

export async function withHomePluginPermissionSettingsEntry<Result>(caller: ActionCallContext,
  invoke: (caller: ActionCallContext) => Promise<Result>): Promise<Result> {
  const user_action: ActionUserAction = Object.freeze({ source: "web", conversation_ref: "web:settings:home-plugin-permissions", message_ref: `web:request:${randomUUID()}` });
  homePermissionEntries.add(user_action);
  try { return await invoke({ ...caller, user_action }); }
  finally { homePermissionEntries.delete(user_action); }
}

/** Snapshot ordinary audit locators as before; an issued, immutable credential keeps its identity through the Host's queue. */
export function snapshotHostUserAction(action: ActionUserAction): ActionUserAction {
  return entries.has(action) || permissionEntries.has(action) || homePermissionEntries.has(action) ? action : { ...action };
}

export function assertPluginConsentSettingsEntry(caller: ActionCallContext): void {
  if (caller.audience !== "user" || caller.actor_id !== LOCAL_PERSON_ACTOR_ID || caller.project_id !== null
    || caller.host_plugin || caller.delegated_by || !caller.user_action || !entries.has(caller.user_action)) {
    throw new ActionError("actions.forbidden", "插件同意只接受本人在宿主设置里的操作");
  }
}

/** The project settings page's door: the person, in the settings of the project the route names (`project_id` is the Host's, never the request body's). */
export function assertPluginPermissionSettingsEntry(caller: ActionCallContext): void {
  if (caller.audience !== "user" || caller.actor_id !== LOCAL_PERSON_ACTOR_ID || !caller.project_id
    || caller.host_plugin || caller.delegated_by || !caller.user_action || !permissionEntries.has(caller.user_action)) {
    throw new ActionError("actions.forbidden", "改插件的授权只接受本人在项目设置里的操作");
  }
}

/** The Host settings door for the Home's own plugins: the person, with no project at all (a project in the call is a different door). */
export function assertHomePluginPermissionSettingsEntry(caller: ActionCallContext): void {
  if (caller.audience !== "user" || caller.actor_id !== LOCAL_PERSON_ACTOR_ID || caller.project_id !== null
    || caller.host_plugin || caller.delegated_by || !caller.user_action || !homePermissionEntries.has(caller.user_action)) {
    throw new ActionError("actions.forbidden", "改个人空间里插件的授权只接受本人在宿主设置里的操作");
  }
}
