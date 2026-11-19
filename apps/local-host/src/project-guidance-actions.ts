import { createHash } from "node:crypto";
import { ActionError, bindActionHandler, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionClient, type ActionHandlerBinding, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { PROJECT_GUIDANCE_PROVIDER_ID, PROJECT_GUIDANCE_READ_PERMISSION, projectGuidanceActions as a, type ProjectGuidanceView } from "@molis-ai/molis-work-contracts/modules/project-guidance";
import { createProjectGuidance } from "@molis-ai/molis-work-module-projects";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import { LocalSqliteJournal, type SqliteDatabase } from "@molis-ai/molis-work-storage";

/**
 * A project's guidance (specs/plugin-equal-standing/contract-design.md §9): the platform's own provider over the project library, whichever
 * plugins the project enables. Who acts is the caller's audit identity, as Goals took it before the move, so a receipt written then by the same
 * caller still replays.
 */
export function projectGuidanceActionProvider(projectId: string, db: SqliteDatabase, now: () => Date = () => new Date()): ActionProviderRegistration {
  const store = createProjectGuidance({ db, journal: new LocalSqliteJournal(db), now,
    requestHash: value => createHash("sha256").update(canonicalJsonText(value)!).digest("hex") });
  const actor = (caller: ActionCallContext) => {
    if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "调用不属于当前项目");
    return caller.audit_actor_id ?? caller.actor_id;
  };
  const handlers: ActionHandlerBinding[] = [
    bindActionHandler(a.read, (_input, caller) => { actor(caller); return store.read(projectId); }),
    bindActionHandler(a.add, async (input, caller) => { const who = actor(caller); await caller.beforeEffect(); return store.add(projectId, who, input); }),
    bindActionHandler(a.update, async (input, caller) => { const who = actor(caller); await caller.beforeEffect(); return store.update(projectId, who, input); }),
  ];
  return { provider: { provider_id: PROJECT_GUIDANCE_PROVIDER_ID, title: "项目长期说明", kind: "system", project_id: projectId },
    definitions: Object.values(a), handlers };
}

/**
 * The project's confirmed guidance, read by the Host for the project layer of a Run or an Assistant turn: the platform's own read as the
 * person on this machine, pinned to the platform's provider so no installation that registered the same id answers it. A refusal
 * leaves the caller to start without the layer.
 */
export async function readProjectGuidance(client: ActionClient, reference: LocalHostProjectReference): Promise<ProjectGuidanceView> {
  const provider_id = PROJECT_GUIDANCE_PROVIDER_ID;
  const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user", project_id: reference.project_id,
    permissions: [PROJECT_GUIDANCE_READ_PERMISSION], allowed_actions: [{ capability_id: a.read.capability_id, version: a.read.version, provider_id }] };
  return await client.invoke(caller, { ...a.read, provider_id }, {}) as ProjectGuidanceView;
}
