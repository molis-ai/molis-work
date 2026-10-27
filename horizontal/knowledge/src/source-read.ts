import { isSubjectReader, requireSynchronous, resolveActionSubject, SUBJECT_RETENTION_REQUEST_TYPE, SUBJECT_RETENTION_TYPE,
  type ActionCallContext, type ActionClient, type ActionSubject, type ActionSubjectContext, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { KNOWLEDGE_TEXT_MAX_CHARS, type KnowledgeCardRecord } from "@molis-ai/molis-work-contracts/services/knowledge";
import type { SearchRetentionIdentity, SearchRetentionResult } from "@molis-ai/molis-work-contracts/services/search";
import { knowledgeErrors } from "./errors.js";

/** The text and its original read authority travel together until the consumer returns or dispatches it. */
export interface KnowledgeSourceRead { context: ActionSubjectContext; assertCurrent(): Promise<void> }
export async function readKnowledgeSubject(input: { client: ActionClient; caller: ActionCallContext; project: string; subject: ActionSubject;
  known: KnowledgeCardRecord | null; currentCard(): KnowledgeCardRecord | null;
  retention(identity: SearchRetentionIdentity, views?: readonly ActionView[]): Promise<SearchRetentionResult> }): Promise<KnowledgeSourceRead> {
  const { client, caller, subject, project, known } = input;
  // Capture the trusted directory before invoking the reader; a later install cannot bless an earlier install's body.
  const original = await client.discover(caller);
  const { context, reader } = await resolveActionSubject({ discover: () => original, invoke: (context, reference, value) => client.invoke(context, reference, value) }, caller, subject);
  const selected = original.find(view => view.provider.provider_id === reader.provider_id && view.capability_id === reader.capability_id && view.version === reader.version)!;
  const generation = selected.provider.plugin_installation_generation;
  const declared = original.some(view => view.provider.provider_id === reader.provider_id && view.action.input_type === SUBJECT_RETENTION_REQUEST_TYPE
    && view.action.output_type === SUBJECT_RETENTION_TYPE && view.action.subject_kinds.includes(subject.kind));
  const identity: SearchRetentionIdentity = { project_id: project, provider_id: reader.provider_id!, subject,
    ...(known?.retention ? { retention: known.retention } : declared ? { retention: { generation: generation ?? null } } : {}) };
  const refuse = () => { throw knowledgeErrors.unreadable("这份资料或原读取权限已变化，请重新读取"); };
  const check = async (version: boolean) => {
    await caller.validate_authority?.(reader);
    const views = await client.discover(caller);
    const current = views.find(view => view.provider.provider_id === reader.provider_id && view.capability_id === reader.capability_id && view.version === reader.version);
    if (!current?.availability.available || !isSubjectReader(current.action) || current.provider.project_id !== selected.provider.project_id
      || current.provider.plugin_installation_generation !== generation || (current.provider.project_id != null && current.provider.project_id !== project)
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
      || final.provider.plugin_installation_generation !== generation) refuse();
    const card = input.currentCard();
    if (card?.excluded || (known && JSON.stringify(card) !== JSON.stringify(known))
      || (card && (card.provider_id !== reader.provider_id || card.retention?.generation !== identity.retention?.generation))) refuse();
    caller.signal?.throwIfAborted();
    requireSynchronous(caller.assert_authority_current?.(reader));
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
  return { context: { ...context, content, truncated: content.length < (page.length ?? content.length) || (page.length === undefined && context.truncated) }, assertCurrent: () => check(true) };
}
