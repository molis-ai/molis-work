import {
  SUBJECT_RETENTION_REQUEST_TYPE, SUBJECT_RETENTION_TYPE, requireSynchronous,
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
    const views = directory ?? await access.client.discover(access.caller);
    const view = retentionView(views, identity.provider_id, identity.subject.kind, identity.project_id);
    if (!view) return { state: identity.retention ? "unavailable" : "unsupported" };
    if (!view.availability.available || !identity.retention?.generation
      || view.provider.plugin_installation_generation !== identity.retention.generation) return { state: "unavailable" };
    const reference = { provider_id: view.provider.provider_id, capability_id: view.capability_id, version: view.version };
    const result = await access.client.invoke(access.caller, reference, { subject_id: identity.subject.id }) as SearchRetentionResult;
    if (!("subject" in result) || result.subject.kind !== identity.subject.kind || result.subject.id !== identity.subject.id) return { state: "unavailable" };
    await access.caller.validate_authority?.(reference);
    const current = retentionView(await access.client.discover(access.caller), identity.provider_id, identity.subject.kind, identity.project_id);
    requireSynchronous(access.caller.assert_authority_current?.(reference));
    if (!current?.availability.available || current.provider.plugin_installation_generation !== identity.retention.generation) return { state: "unavailable" };
    return result;
  } catch { return { state: "unavailable" }; }
}
