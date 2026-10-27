import { ActionError, requireSynchronous, resolveActionSubject, type ActionCallContext, type ActionClient, type ActionExecutionContext,
  type ActionHandlerBinding, type ActionReference, type ActionSubject, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { KNOWLEDGE_PROVIDER_ID, knowledgeManageActions, type KnowledgeBindCandidate, type KnowledgeBindPreviewRequest,
  type KnowledgeBindPreviewResponse, type KnowledgeBindRequest, type KnowledgeCardRecord, type KnowledgeCardStorePort,
  type KnowledgeRetentionIdentity } from "@molis-ai/molis-work-contracts/services/knowledge";
import type { SearchIndexPort, SearchRetentionResult } from "@molis-ai/molis-work-contracts/services/search";
import { knowledgeCatalog, type KnowledgeAccess, type KnowledgeCards, type KnowledgePiece } from "@molis-ai/molis-work-service-knowledge";

interface BindingPorts {
  store: KnowledgeCardStorePort;
  cards: KnowledgeCards;
  index: Pick<SearchIndexPort, "documents" | "sources">;
  clientFor(caller: ActionCallContext): ActionClient;
  retention(access: KnowledgeAccess, identity: KnowledgeRetentionIdentity, views?: readonly ActionView[]): Promise<SearchRetentionResult>;
}
const unavailable = () => new ActionError("actions.subject_unavailable", "选中的来源安装已变化或当前不可读取");
const conflict = () => new ActionError("actions.conflict", "选中的来源或内容版本已经变化");
const sameSubject = (left: ActionSubject, right: ActionSubject) => left.kind === right.kind && left.id === right.id;

/** The person's source selection and association share one current-source check; KnowledgeCards remains the sole card writer. */
export function knowledgeBindingActions(ports: BindingPorts): ActionHandlerBinding[] {
  const { store, index, cards } = ports;
  const originalCard = (caller: ActionExecutionContext, subject: ActionSubject) => {
    const original = store.get(caller.project_id!, subject);
    if (!original) throw new ActionError("actions.subject_unavailable", "这份保留卡片已不存在");
    return original;
  };
  const assertCard = (original: KnowledgeCardRecord) => {
    if (JSON.stringify(original) !== JSON.stringify(store.get(original.project_id, original.subject))) throw new ActionError("actions.conflict", "保留卡片已经变化，请重新查看");
  };
  const currentPiece = (piece: KnowledgePiece, project: string) => knowledgeCatalog(index, project).find(current => sameSubject(current.subject, piece.subject)
    && current.source_key === piece.source_key && current.provider_id === piece.provider_id);
  const assertPiece = (piece: KnowledgePiece, project: string) => {
    if (JSON.stringify(piece) !== JSON.stringify(currentPiece(piece, project))) throw conflict();
  };
  const referenceOf = (piece: KnowledgePiece, project: string): ActionReference => {
    const source = index.sources().find(source => source.project_id === project && source.source_key === piece.source_key && source.provider_id === piece.provider_id);
    if (!source) throw conflict();
    return { provider_id: source.provider_id, capability_id: source.capability_id, version: source.version };
  };
  const viewOf = (views: readonly ActionView[], reference: ActionReference, project: string) => views.find(view => view.provider.provider_id === reference.provider_id
    && view.capability_id === reference.capability_id && view.version === reference.version && (view.provider.project_id == null || view.provider.project_id === project));
  const assertView = (views: readonly ActionView[], reference: ActionReference, project: string, generation: string) => {
    const view = viewOf(views, reference, project);
    if (!view?.availability.available || view.provider.plugin_installation_generation !== generation) throw unavailable();
  };
  const check = async (caller: ActionExecutionContext, client: ActionClient, original: KnowledgeCardRecord, piece: KnowledgePiece,
    expected: Pick<KnowledgeBindRequest, "generation" | "source_revision">, replay = false) => {
    const project = original.project_id, reference = referenceOf(piece, project);
    if (!replay && piece.revision !== expected.source_revision) throw conflict();
    const current = async () => {
      await caller.validate_authority?.(reference);
      const views = await client.discover(caller); assertView(views, reference, project, expected.generation);
      if (piece.retention && piece.retention.generation !== expected.generation) throw unavailable();
      const state = await ports.retention({ client, caller }, { project_id: project, provider_id: piece.provider_id, subject: piece.subject,
        ...(piece.retention ? { retention: piece.retention } : {}) }, views);
      caller.signal?.throwIfAborted();
      if (state.state === "unavailable") throw unavailable();
      assertView(await client.discover(caller), reference, project, expected.generation);
      caller.signal?.throwIfAborted(); requireSynchronous(caller.assert_authority_current?.(reference));
      return state.state === "active" || state.state === "unsupported";
    };
    if (!await current()) return null;
    if (piece.content_policy === "context") {
      const selected: ActionClient = { discover: async context => (await client.discover(context)).filter(view => view.provider.provider_id === piece.provider_id),
        invoke: (context, reference, input) => client.invoke(context, reference, input) };
      const read = await resolveActionSubject(selected, caller, piece.subject);
      if (read.reader.provider_id !== piece.provider_id || read.context.revision !== piece.revision) throw conflict();
    }
    if (!await current()) throw unavailable();
    assertPiece(piece, project); assertCard(original);
    return { piece, reference, generation: expected.generation };
  };
  type Checked = NonNullable<Awaited<ReturnType<typeof check>>>;
  const finish = (caller: ActionExecutionContext, original: KnowledgeCardRecord, selected: readonly Checked[], action: ActionReference, views: readonly ActionView[]) => {
    caller.signal?.throwIfAborted();
    for (const entry of selected) {
      assertView(views, entry.reference, original.project_id, entry.generation); assertPiece(entry.piece, original.project_id);
      requireSynchronous(caller.assert_authority_current?.(entry.reference));
    }
    requireSynchronous(caller.assert_authority_current?.(action)); assertCard(original);
  };
  const bind = async (caller: ActionExecutionContext, input: KnowledgeBindRequest) => {
    const original = originalCard(caller, input.subject), client = ports.clientFor(caller);
    const piece = knowledgeCatalog(index, original.project_id).find(piece => sameSubject(piece.subject, input.subject) && piece.provider_id === input.provider_id && piece.source_key === input.source_key);
    if (!piece || !caller.retainAuthority) throw unavailable();
    const sourceAuthority = caller.retainAuthority([referenceOf(piece, original.project_id)], { providerCommands: "unchanged" });
    if (!await check(caller, client, original, piece, input, !!original.adoption)) throw unavailable();
    await caller.beforeEffect();
    const checked = await check(caller, client, original, piece, input, !!original.adoption);
    if (!checked) throw unavailable();
    const action = { ...knowledgeManageActions.bind, provider_id: KNOWLEDGE_PROVIDER_ID };
    await caller.validate_authority?.(action);
    const views = await client.discover(caller);
    finish(caller, original, [checked], action, views);
    sourceAuthority.assertCurrent();
    // No await is permitted between the original-card comparison and its synchronous owner write.
    assertPiece(piece, original.project_id); assertCard(original);
    return cards.bind(caller, input, piece);
  };
  const preview = async (caller: ActionExecutionContext, input: KnowledgeBindPreviewRequest): Promise<KnowledgeBindPreviewResponse> => {
    const original = originalCard(caller, input.subject), client = ports.clientFor(caller), views = await client.discover(caller);
    const candidates = knowledgeCatalog(index, original.project_id).filter(piece => sameSubject(piece.subject, input.subject)).flatMap(piece => {
      const view = viewOf(views, referenceOf(piece, original.project_id), original.project_id), generation = view?.provider.plugin_installation_generation;
      return view?.availability.available && generation ? [{ piece, generation }] : [];
    });
    if (!caller.retainAuthority) throw unavailable();
    const sourceAuthority = caller.retainAuthority(candidates.map(({ piece }) => referenceOf(piece, original.project_id)), { providerCommands: "unchanged" });
    const selected: Checked[] = [];
    for (const { piece, generation } of candidates) {
      const checked = await check(caller, client, original, piece, { generation, source_revision: piece.revision });
      if (checked) selected.push(checked);
    }
    // Earlier candidates may have changed while a later owner was being read.
    for (const entry of selected) if (!await check(caller, client, original, entry.piece, { generation: entry.generation, source_revision: entry.piece.revision })) throw unavailable();
    const action = { ...knowledgeManageActions.bindPreview, provider_id: KNOWLEDGE_PROVIDER_ID };
    await caller.validate_authority?.(action);
    const current = await client.discover(caller);
    finish(caller, original, selected, action, current);
    sourceAuthority.assertCurrent();
    for (const entry of selected) assertPiece(entry.piece, original.project_id);
    assertCard(original);
    const result: KnowledgeBindCandidate[] = selected.map(({ piece, generation }) => ({ provider_id: piece.provider_id, source_key: piece.source_key,
      generation, source_revision: piece.revision, title: piece.title, plugin_title: piece.plugin_title, summary: piece.summary, content_policy: piece.content_policy, updated_at: piece.updated_at }));
    return { subject: input.subject, candidates: result };
  };
  return [
    { ...knowledgeManageActions.bindPreview, handle: (caller, input) => preview(caller, input as KnowledgeBindPreviewRequest) },
    { ...knowledgeManageActions.bind, handle: (caller, input) => bind(caller, input as KnowledgeBindRequest) },
  ];
}
