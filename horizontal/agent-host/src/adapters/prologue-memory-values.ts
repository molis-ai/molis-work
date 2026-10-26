import type { MemoryPage, MemoryEntry, MemoryMeta, MemorySourceIdentity, MemorySourceSnapshot, ScopedCandidate, MemoryPurgePreviewInput, MemoryPurgePreviewPage } from "@prologue/sdk";
import type { AgentMemoryPage, AgentMemoryEntry as Entry, AgentMemoryMeta as Meta, AgentMemoryCandidateEntry as Candidate, AgentMemorySourceIdentity, AgentMemorySourceSnapshot, AgentMemoryPurgeQuery, AgentMemoryPurgePage } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";

type SdkMeta = MemoryMeta;
export const purgeQuery = ({ session_ref, ...query }: AgentMemoryPurgeQuery): MemoryPurgePreviewInput =>
  ({ ...query, ...(session_ref ? { sessionRef: session_ref } : {}) });
export const purgePageView = (page: MemoryPurgePreviewPage): AgentMemoryPurgePage => ({ ...page,
  issues: page.issues.map(issue => ({ ...issue })), items: page.items.map(item => {
    if (!["user", "project", "character"].includes(item.identity.scope)) throw agentErrors.capability_unavailable("清理预览不属于平台记忆范围");
    const identity = { scope: item.identity.scope as Entry["scope"], owner: item.identity.owner };
    const common = { identity, expected_version: item.expectedVersion, ...(item.sessionRef ? { session_ref: { ...item.sessionRef } } : {}) };
    return item.kind === "memory" ? { ...common, kind: item.kind, memory_id: item.ref.id, state: item.state }
      : { ...common, kind: item.kind, candidate_id: item.ref.id, state: item.state,
        sources: item.sources?.map(source => ({ event_id: source.eventId, version: source.version })) ?? null };
  }) });
/** The SDK boundary owns the complete value translation, shared by public reads and promotion callbacks. */
export const sourceIdentityView = (source: MemorySourceIdentity): AgentMemorySourceIdentity => ({ event_id: source.eventId, version: source.version,
  speaker: { ...source.speaker }, derivation: source.derivation, occurred_at_ms: source.occurredAtMs,
  ...(source.about ? { about: { event_id: source.about.eventId, version: source.about.version } } : {}) });
export const sourceSnapshotView = (source: MemorySourceSnapshot): AgentMemorySourceSnapshot => ({ ...sourceIdentityView(source), text: source.text });
export const sourceIdentityToSdk = (source: AgentMemorySourceIdentity): MemorySourceIdentity => ({ eventId: source.event_id, version: source.version,
  speaker: { ...source.speaker }, derivation: source.derivation, occurredAtMs: source.occurred_at_ms,
  ...(source.about ? { about: { eventId: source.about.event_id, version: source.about.version } } : {}) });

export const toSdkMemoryMeta = (meta: Meta): SdkMeta => ({
  ...(meta.classification ? { classification: structuredClone(meta.classification) } : {}),
  ...(meta.session_ref ? { sessionRef: { ...meta.session_ref } } : {}),
  ...(meta.kind !== undefined ? { kind: meta.kind } : {}), ...(meta.source !== undefined ? { source: meta.source } : {}), ...(meta.basis !== undefined ? { basis: meta.basis } : {}),
  ...(meta.applies_when ? { appliesWhen: { ...(meta.applies_when.plugins ? { plugins: meta.applies_when.plugins } : {}), ...(meta.applies_when.object_kinds ? { objectKinds: meta.applies_when.object_kinds } : {}),
    ...(meta.applies_when.goals ? { goals: meta.applies_when.goals } : {}), ...(meta.applies_when.task !== undefined ? { task: meta.applies_when.task } : {}),
    ...(meta.applies_when.from_ms !== undefined ? { fromMs: meta.applies_when.from_ms } : {}), ...(meta.applies_when.until_ms !== undefined ? { untilMs: meta.applies_when.until_ms } : {}) } } : {}),
  ...(meta.evidence ? { evidence: meta.evidence.map(one => ({ kind: one.kind, ...(one.text !== undefined ? { text: one.text } : {}), ...(one.ref !== undefined ? { ref: one.ref } : {}), ...(one.at_ms !== undefined ? { atMs: one.at_ms } : {}) })) } : {}),
  ...(meta.expires_at_ms !== undefined ? { expiresAtMs: meta.expires_at_ms } : {}), ...(meta.approved_by ? { approvedBy: meta.approved_by } : {}),
  ...(meta.namespace !== undefined ? { namespace: meta.namespace } : {}),
});
export const fromSdkMemoryMeta = (meta: SdkMeta): Meta => ({
  ...(meta.classification ? { classification: { scenes: [...meta.classification.scenes], lifecycle: meta.classification.lifecycle,
    ...(meta.classification.extra ? { extra: Object.fromEntries(Object.entries(meta.classification.extra).map(([key, values]) => [key, [...values]])) } : {}) } } : {}),
  ...(meta.sessionRef ? { session_ref: { ...meta.sessionRef } } : {}),
  ...(meta.kind !== undefined ? { kind: meta.kind } : {}), ...(meta.source !== undefined ? { source: meta.source } : {}), ...(meta.basis !== undefined ? { basis: meta.basis } : {}),
  ...(meta.appliesWhen ? { applies_when: { ...(meta.appliesWhen.plugins ? { plugins: [...meta.appliesWhen.plugins] } : {}), ...(meta.appliesWhen.objectKinds ? { object_kinds: [...meta.appliesWhen.objectKinds] } : {}),
    ...(meta.appliesWhen.goals ? { goals: [...meta.appliesWhen.goals] } : {}), ...(meta.appliesWhen.task !== undefined ? { task: meta.appliesWhen.task } : {}),
    ...(meta.appliesWhen.fromMs !== undefined ? { from_ms: meta.appliesWhen.fromMs } : {}), ...(meta.appliesWhen.untilMs !== undefined ? { until_ms: meta.appliesWhen.untilMs } : {}) } } : {}),
  ...(meta.evidence ? { evidence: meta.evidence.map(one => ({ kind: one.kind, ...(one.text !== undefined ? { text: one.text } : {}), ...(one.ref !== undefined ? { ref: one.ref } : {}), ...(one.atMs !== undefined ? { at_ms: one.atMs } : {}) })) } : {}),
  ...(meta.expiresAtMs !== undefined ? { expires_at_ms: meta.expiresAtMs } : {}), ...(meta.approvedBy ? { approved_by: { ...meta.approvedBy } } : {}),
  ...(meta.namespace !== undefined ? { namespace: meta.namespace } : {}),
});
export const memoryView = (entry: MemoryEntry): Entry => ({ memory_id: entry.ref.id, scope: entry.scope as Entry["scope"], owner: entry.owner,
  text: entry.text, origin: entry.origin, tags: [...entry.tags], version: entry.version, meta: fromSdkMemoryMeta(entry.meta ?? {}),
  tombstoned: entry.tombstoned === true,
  ...(entry.disabled ? { disabled: { reason: entry.disabled.reason, at_ms: entry.disabled.atMs } } : {}),
  ...(entry.key ? { key: { ...entry.key } } : {}),
  ...(entry.paused ? { paused: { reason: entry.paused.reason, at_ms: entry.paused.atMs } } : {}), created_at_ms: entry.createdAtMs ?? 0, updated_at_ms: entry.updatedAtMs ?? 0 });
export const candidateView = (item: ScopedCandidate): Candidate => ({ candidate_id: item.ref.id, version: item.version,
  ...(item.replacement ? { replacement: { memory_id: item.replacement.ref.id, expected_version: item.replacement.expectedVersion } } : {}),
  ...(item.suggestedBasis === undefined ? {} : { suggested_basis: item.suggestedBasis }),
  ...(item.sources ? { sources: item.sources.map(sourceIdentityView) } : {}), scope: item.scope as Candidate["scope"], owner: item.owner,
  text: item.text, origin: item.origin, tags: [...item.tags], meta: fromSdkMemoryMeta(item.meta), state: item.state, created_at_ms: item.createdAtMs,
  ...(item.settledAtMs !== undefined ? { settled_at_ms: item.settledAtMs } : {}), ...(item.entry ? { memory_id: item.entry.id } : {}) });

/** Translate the whole management page without changing its cursor, counts or hidden costs. */
export function memoryPageView(page: MemoryPage): AgentMemoryPage {
  return { ...page, items: page.items.map(memoryView), cost: {
    directory_entries: page.cost.directoryEntries, directory_enumerations: page.cost.directoryEnumerations,
    directory_traversal: page.cost.directoryTraversal, metadata_reads: page.cost.metadataReads, body_reads: page.cost.bodyReads,
  } };
}
