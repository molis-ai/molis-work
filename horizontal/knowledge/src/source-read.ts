import { actionSourceIdentity, sameActionSourceIdentity, isSubjectReader, requireSynchronous, resolveActionSubject, matchesActionDiscovery, SUBJECT_RETENTION_REQUEST_TYPE, SUBJECT_RETENTION_TYPE,
  type ActionCallContext, type ActionClient, type ActionSubject, type ActionSubjectContext, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { KNOWLEDGE_TEXT_MAX_CHARS, type KnowledgeRetentionIdentity, type KnowledgeCardRecord } from "@molis-ai/molis-work-contracts/services/knowledge";
import type { SearchRetentionResult } from "@molis-ai/molis-work-contracts/services/search";
import { knowledgeErrors } from "./errors.js";

/** The text and its original read authority travel together until the consumer returns or dispatches it. */
export interface KnowledgeSourceRead { context: ActionSubjectContext; assertCurrent(): Promise<void>; assertSourcesCurrent?(): void }
/** One batch captures system owner stamps and trusted plugin command changes; original asynchronous authority checks remain. */
export function captureKnowledgeSources(client: ActionClient, caller: ActionCallContext, views: readonly ActionView[]): () => void {
  const sources = views.filter(view => view.availability.available && actionSourceIdentity(view.provider, caller.project_id ?? null) !== null);
  if (!sources.length) return () => {};
  if (!client.captureSources) throw knowledgeErrors.unreadable("当前资料来源缺少同步状态校验能力");
  return client.captureSources([{ context: caller, references: sources.map(view => ({ provider_id: view.provider.provider_id, capability_id: view.capability_id, version: view.version })) }]);
}
export async function readKnowledgeSubject(input: { client: ActionClient; caller: ActionCallContext; project: string; subject: ActionSubject;
  known: KnowledgeCardRecord | null; currentCard(): KnowledgeCardRecord | null;
  retention(identity: KnowledgeRetentionIdentity, views?: readonly ActionView[]): Promise<SearchRetentionResult> }): Promise<KnowledgeSourceRead> {
  const { client, caller, subject, project, known } = input;
  // Capture the trusted directory before invoking the reader; a later install cannot bless an earlier install's body.
  if (known?.retention?.source_identity === null) throw knowledgeErrors.unreadable("这份保留卡片尚未由本人明确关联当前来源");
  const original = await client.discover(caller);
  const sourceCurrent = captureKnowledgeSources(client, caller, original.filter(view => isSubjectReader(view.action) && view.action.subject_kinds.includes(subject.kind)));
  const { context, reader } = await resolveActionSubject({ discover: (_context, filter) => original.filter(view => matchesActionDiscovery(view, filter)), invoke: (context, reference, value) => client.invoke(context, reference, value) }, caller, subject);
  const selected = original.find(view => view.provider.provider_id === reader.provider_id && view.capability_id === reader.capability_id && view.version === reader.version)!;
  const sourceIdentity = actionSourceIdentity(selected.provider, project);
  const declared = original.some(view => view.provider.provider_id === reader.provider_id && view.action.input_type === SUBJECT_RETENTION_REQUEST_TYPE
    && view.action.output_type === SUBJECT_RETENTION_TYPE && view.action.subject_kinds.includes(subject.kind));
  const identity: KnowledgeRetentionIdentity = { project_id: project, provider_id: reader.provider_id!, subject, expected_revision: context.revision,
    ...(known?.adoption ? { adoption: known.adoption } : {}),
    ...(known?.retention ? { retention: known.retention } : declared ? { retention: { source_identity: sourceIdentity } } : {}) };
  const refuse = () => { throw knowledgeErrors.unreadable("这份资料或原读取权限已变化，请重新读取"); };
  const check = async (version: boolean) => {
    await caller.validate_authority?.(reader);
    const views = await client.discover(caller);
    const current = views.find(view => view.provider.provider_id === reader.provider_id && view.capability_id === reader.capability_id && view.version === reader.version);
    if (!current?.availability.available || !isSubjectReader(current.action) || current.provider.project_id !== selected.provider.project_id
      || (sourceIdentity ? !sameActionSourceIdentity(actionSourceIdentity(current.provider, project), sourceIdentity)
        : actionSourceIdentity(current.provider, project) !== null) || (current.provider.project_id != null && current.provider.project_id !== project)
      || known?.adoption && !sameActionSourceIdentity(sourceIdentity, known.adoption.source_identity)
      || (known && (known.provider_id !== reader.provider_id || (declared && !known.retention)))) refuse();
    if (version) {
      const now = await client.invoke(caller, reader, { subject_id: subject.id }) as ActionSubjectContext;
      if (now.subject.kind !== subject.kind || now.subject.id !== subject.id || now.revision !== context.revision) refuse();
    }
    const state = await input.retention(identity);
    if (state.state !== "active" && state.state !== "unsupported") refuse();
    const final = (await client.discover(caller)).find(view => view.provider.provider_id === reader.provider_id
      && view.capability_id === reader.capability_id && view.version === reader.version);
    if (!final?.availability.available || final.provider.project_id !== selected.provider.project_id
      || (sourceIdentity ? !sameActionSourceIdentity(actionSourceIdentity(final.provider, project), sourceIdentity)
        : actionSourceIdentity(final.provider, project) !== null)) refuse();
    const card = input.currentCard();
    if (card?.excluded || (known && JSON.stringify(card) !== JSON.stringify(known))
      || (card && (card.provider_id !== reader.provider_id || (card.retention?.source_identity || identity.retention?.source_identity) && !sameActionSourceIdentity(card.retention?.source_identity, identity.retention?.source_identity)))) refuse();
    caller.signal?.throwIfAborted();
    requireSynchronous(caller.assert_authority_current?.(reader));
    sourceCurrent();
  };
  await check(false);
  let content = context.content, page = context;
  while (page.truncated && page.length !== undefined && content.length < Math.min(page.length, KNOWLEDGE_TEXT_MAX_CHARS)) {
    page = await client.invoke(caller, reader, { subject_id: subject.id, offset: content.length }) as ActionSubjectContext;
    if (page.subject.kind !== subject.kind || page.subject.id !== subject.id || page.revision !== context.revision || page.offset !== content.length || !page.content) refuse();
    content += page.content;
  }
  content = content.slice(0, KNOWLEDGE_TEXT_MAX_CHARS);
  await check(false);
  return { context: { ...context, content, truncated: content.length < (page.length ?? content.length) || (page.length === undefined && context.truncated) }, assertCurrent: () => check(true), assertSourcesCurrent: sourceCurrent };
}
