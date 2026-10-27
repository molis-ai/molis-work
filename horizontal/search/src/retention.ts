import {
  SUBJECT_RETENTION_REQUEST_TYPE, SUBJECT_RETENTION_TYPE, requireSynchronous, actionSourceIdentity, sameActionSourceIdentity,
  type ActionCallContext, type ActionClient, type ActionView,
} from "@molis-ai/molis-work-contracts/platform/actions";
import type { SearchRetentionIdentity, SearchRetentionResult } from "@molis-ai/molis-work-contracts/services/search";

export const retentionView = (views: readonly ActionView[], provider: string, kind: string, project: string | null) => views.find(view =>
  view.provider.provider_id === provider && (view.provider.project_id == null || view.provider.project_id === project)
  && view.action.input_type === SUBJECT_RETENTION_REQUEST_TYPE && view.action.output_type === SUBJECT_RETENTION_TYPE
  && view.action.subject_kinds.includes(kind));

/** Current owner state, scoped to the original project and trusted installation generation. Refusal is never deletion. */
export async function readSubjectRetention(access: { client: ActionClient; caller: ActionCallContext }, identity: SearchRetentionIdentity,
  directory?: readonly ActionView[]): Promise<SearchRetentionResult> {
  if (identity.project_id !== null && identity.project_id !== (access.caller.project_id ?? null)) return { state: "unavailable" };
  try {
    const views = directory ?? await access.client.discover(access.caller, { provider_id: identity.provider_id });
    const view = retentionView(views, identity.provider_id, identity.subject.kind, identity.project_id);
    const system = views.some(candidate => candidate.provider.provider_id === identity.provider_id && candidate.provider.kind === "system");
    if (!view) return { state: identity.retention || system ? "unavailable" : "unsupported" };
    const sourceIdentity = identity.retention?.source_identity;
    if (!view.availability.available || !sameActionSourceIdentity(actionSourceIdentity(view.provider, identity.project_id), sourceIdentity)) return { state: "unavailable" };
    const reference = { provider_id: view.provider.provider_id, capability_id: view.capability_id, version: view.version };
    if (sourceIdentity && !access.client.captureSources) return { state: "unavailable" };
    const sourceCurrent = sourceIdentity ? access.client.captureSources!([{ context: access.caller, references: [reference] }]) : () => {};
    const result = await access.client.invoke(access.caller, reference, { subject_id: identity.subject.id }) as SearchRetentionResult;
    if (!("subject" in result) || result.subject.kind !== identity.subject.kind || result.subject.id !== identity.subject.id) return { state: "unavailable" };
    await access.caller.validate_authority?.(reference);
    const current = retentionView(await access.client.discover(access.caller, { provider_id: identity.provider_id }), identity.provider_id, identity.subject.kind, identity.project_id);
    requireSynchronous(access.caller.assert_authority_current?.(reference));
    if (!current?.availability.available || !sameActionSourceIdentity(actionSourceIdentity(current.provider, identity.project_id), sourceIdentity)) return { state: "unavailable" };
    if (view.provider.kind === "system" && (sourceIdentity?.kind !== "project-data" || result.state === "active"
      && (!identity.expected_revision || !result.current_revision || result.current_revision !== identity.expected_revision))) return { state: "unavailable" };
    sourceCurrent();
    return result;
  } catch { return { state: "unavailable" }; }
}
