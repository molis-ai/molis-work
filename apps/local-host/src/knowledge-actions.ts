import { knowledgeBindingActions } from "./knowledge-bindings.js";
import { knowledgeSourceAuthority } from "./knowledge-source-authority.js";
import { ActionError, requireSynchronous, actionSourceIdentity, sameActionSourceIdentity, type ActionCallContext, type ActionClient, type ActionExecutionContext, type ActionHandlerBinding, type ActionProviderRegistration, type ActionReference, type ActionSubject, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import {
  KNOWLEDGE_PROVIDER_ID,
  KNOWLEDGE_READ_PERMISSION,
  knowledgeActions,
  knowledgeManageActions,
  type KnowledgeCardsRequest,
  type KnowledgeCardRecord,
  type KnowledgeRetentionIdentity,
  type KnowledgeEditRequest,
  type KnowledgeExcludeRequest,
  type KnowledgeGlobRequest,
  type KnowledgeGrepRequest,
  type KnowledgeListRequest,
  type KnowledgeLocateRequest,
  type KnowledgeOrganizeRequest,
  type KnowledgeOutlineRequest,
  type KnowledgeReadRequest,
  type KnowledgeReceiptsRequest,
  type KnowledgeSearchRequest,
} from "@molis-ai/molis-work-contracts/services/knowledge";
import type { SearchIndexPort, SearchRetentionIdentity, SearchRetentionResult } from "@molis-ai/molis-work-contracts/services/search";
import { KnowledgeCards, KnowledgeOrganizer, KnowledgeService, knowledgeCatalog, knowledgeCutPieces, knowledgeReader, type KnowledgeAccess, type KnowledgeDraft, type KnowledgeLocateDraft,
  type KnowledgeLocator, type KnowledgeWriter } from "@molis-ai/molis-work-service-knowledge";
import { readSubjectRetention, type SearchService } from "@molis-ai/molis-work-service-search";
import { openKnowledgeCards } from "@molis-ai/molis-work-storage";
import { KNOWLEDGE_LOCATE, KNOWLEDGE_ORGANIZE } from "./agent-definitions/system-prompts.js";
import { resolveModelPrompt } from "./agent-definitions/instructions.js";
import { hostTextGeneration } from "./host-complete-text.js";

export interface KnowledgeHostPorts {
  homeDirectory: string;
  search: Pick<SearchService, "query">;
  /** The search index: the catalog of each project is what it holds (spec §4.4). */
  index: Pick<SearchIndexPort, "documents" | "sources" | "related">;
  clientFor(caller: ActionCallContext): ActionClient;
  /** The project owner's authority, which indexing and organizing read every source with. */
  ownerContext?(projectId: string): Promise<ActionCallContext>;
  /** Metadata can only rule out adopting an unbound piece; it never grants access or supplies an installation generation. */
  unboundRetention?(caller: ActionCallContext, identity: SearchRetentionIdentity): "unsupported" | "unavailable";
  /** The project's text model now (tests give their own); by default the Home's configured text model. */
  writer?(): KnowledgeWriter | null;
  /** The text model `knowledge.locate` asks (tests give their own); by default the Home's configured text model. */
  locator?(): KnowledgeLocator | null;
  quota?: { pieces: number; chars: number };
  onError?(error: unknown, where: string): void;
}

export interface KnowledgeHost {
  readonly registration: ActionProviderRegistration;
  readonly organizer: KnowledgeOrganizer;
  /** Something in a project's catalog may have changed: organize it shortly after. */
  changed(projectId: string | null): void;
  projectDeleted(projectId: string): void;
  /** How many pieces a caller whose directory is `views` would see listed in a project, by source (no titles, no text). */
  tally(projectId: string, views: readonly ActionView[]): ReturnType<KnowledgeService["tally"]>;
  /** A round's catalog for that caller (specs/project-knowledge §6.4): whole when small, otherwise the pieces related to `words`. */
  catalog(projectId: string, views: readonly ActionView[], words: string): ReturnType<KnowledgeService["catalog"]>;
  close(): Promise<void>;
}

const KICK_DELAY_MS = 2_000;
// Only what a card cannot be without is required: a title and a brief. Keywords and section notes are typed but optional, and
// cardOrganized keeps the notes that name a given section with a summary, so one stray note no longer costs the whole card
// (measured with MiniMax: a missing keywords field, a note carrying the section's title instead of a summary; spec §14 K1).
const CARD_SCHEMA = { type: "object", properties: { title: { type: "string" }, brief: { type: "string" }, keywords: { type: "array", items: { type: "string" } },
  sections: { type: "array", items: { type: "object", properties: { anchor: { type: "string" }, summary: { type: "string" } } } } },
  required: ["title", "brief"] } as const;

/** The Home's text model writing one card with the registered instruction; null when no text model is configured. */
export function knowledgeModelWriter(homeDirectory: string): KnowledgeWriter | null {
  const generate = hostTextGeneration({ homeDirectory });
  if (!generate) return null;
  return async (input, signal, control) => {
    const result = await generate(resolveModelPrompt(homeDirectory, instructed(KNOWLEDGE_ORGANIZE, JSON.stringify(input)), KNOWLEDGE_ORGANIZE.prompt_id), {
      structured: { mode: "local", name: "knowledge_card", schema: CARD_SCHEMA as never }, signal, ...(control ? { beforeDispatch: control.beforeDispatch, afterResult: control.afterResult, assertCurrent: control.assertCurrent } : {}), timeoutMs: 120_000, maxOutputTokens: 4000 });
    const draft = result.structured as KnowledgeDraft | undefined;
    if (!draft || typeof draft !== "object") throw new Error("模型没有给出合格式的卡片");
    return draft;
  };
}

const LOCATE_SCHEMA = { type: "object", properties: { sections: { type: "array", items: { type: "object",
  properties: { piece: { type: "integer" }, anchor: { type: "string" }, reason: { type: "string" } } } } }, required: ["sections"] } as const;

/** The Home's text model choosing sections for `knowledge.locate` with the registered instruction; null when none is configured. */
export function knowledgeModelLocator(homeDirectory: string): KnowledgeLocator | null {
  const generate = hostTextGeneration({ homeDirectory });
  if (!generate) return null;
  return async (input, control) => {
    const result = await generate(resolveModelPrompt(homeDirectory, instructed(KNOWLEDGE_LOCATE, JSON.stringify(input)), KNOWLEDGE_LOCATE.prompt_id), {
      structured: { mode: "local", name: "knowledge_sections", schema: LOCATE_SCHEMA as never }, ...(control ? { signal: control.signal, beforeDispatch: control.beforeDispatch, afterResult: control.afterResult, assertCurrent: control.assertCurrent } : {}), timeoutMs: 120_000, maxOutputTokens: 2000 });
    const draft = result.structured as KnowledgeLocateDraft | undefined;
    if (!draft || typeof draft !== "object") throw new Error("模型没有给出合格式的选节结果");
    return draft;
  };
}

/**
 * Host wiring for project knowledge (specs/project-knowledge): the provider `system.knowledge` over the system search it rides
 * on, the Home's card store, and organizing in the background. It is registered and closed together with search
 * (search-actions.ts), since every card comes from search's index.
 */
export function createKnowledgeHost(ports: KnowledgeHostPorts): KnowledgeHost {
  const store = openKnowledgeCards({ homeDirectory: ports.homeDirectory });
  const ownerAccess = async (projectId: string): Promise<KnowledgeAccess> => {
    if (!ports.ownerContext) throw new ActionError("actions.forbidden", "当前没有项目资料读取权限");
    const caller = await ports.ownerContext(projectId);
    return { caller, client: ports.clientFor(caller) };
  };
  const retention = async (access: KnowledgeAccess, identity: KnowledgeRetentionIdentity, views?: readonly ActionView[]): Promise<SearchRetentionResult> => {
    const caller = knowledgeReader(access);
    if (identity.adoption) {
      const current = await access.client.discover(caller);
      if (!current.some(view => view.provider.provider_id === identity.provider_id && view.availability.available
        && sameActionSourceIdentity(actionSourceIdentity(view.provider, identity.project_id), identity.adoption!.source_identity))
        || identity.retention && !sameActionSourceIdentity(identity.retention.source_identity, identity.adoption.source_identity)) return { state: "unavailable" };
      const result = await readSubjectRetention({ client: access.client, caller }, identity, current);
      const final = await access.client.discover(caller);
      caller.signal?.throwIfAborted(); requireSynchronous(caller.assert_authority_current?.());
      return final.some(view => view.provider.provider_id === identity.provider_id && view.availability.available
        && sameActionSourceIdentity(actionSourceIdentity(view.provider, identity.project_id), identity.adoption!.source_identity)) ? result : { state: "unavailable" };
    }
    return readSubjectRetention({ client: access.client, caller }, identity, views);
  };
  const ownerRetention = async (identity: KnowledgeRetentionIdentity): Promise<SearchRetentionResult> => {
    if (!ports.ownerContext && !identity.retention && !identity.adoption) return { state: "unsupported" };
    try { return await retention(await ownerAccess(identity.project_id!), identity); }
    catch { return { state: "unavailable" }; }
  };
  const organizer = new KnowledgeOrganizer({ store, retention: ownerRetention,
    ...(ports.unboundRetention && ports.ownerContext ? { prepareUnboundRetention: async (projectId: string) => {
      const { caller } = await ownerAccess(projectId);
      return (identity: SearchRetentionIdentity) => ports.unboundRetention!(caller, identity);
    } } : {}),
    authorize: ports.ownerContext ? async (projectId, piece, card) => {
      const source = ports.index.sources().find(source => source.source_key === piece.source_key);
      return source ? knowledgeSourceAuthority(await ownerAccess(projectId), { provider_id: source.provider_id,
        capability_id: source.capability_id, version: source.version }, piece, card) : null;
    } : undefined, catalog: async projectId => knowledgeCatalog(ports.index, projectId),
    writer: ports.writer ?? (() => knowledgeModelWriter(ports.homeDirectory)), ...(ports.quota ? { quota: ports.quota } : {}), ...(ports.onError ? { onError: ports.onError } : {}) });
  const service = new KnowledgeService({ search: (access, input) => ports.search.query({ client: access.client, caller: knowledgeReader(access) }, input), cards: store, retention, requireCard: true,
    cut: projectId => knowledgeCutPieces(ports.index, projectId),
    related: (projectId, query, limit, snippets) => ports.index.related(projectId, query, limit, snippets).map(document => ({ kind: document.kind, id: document.object_id, snippet: document.snippet })) });
  const cards = new KnowledgeCards(store, organizer);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let closed = false;
  // Something in the project changed with nobody searching: its sources are brought current with the owner's authority first, so
  // the catalog (each round's directory and counts, the cards) holds the new piece before anyone asks for it.
  const settle = async (projectId: string) => {
    if (ports.ownerContext) {
      const owner = await ports.ownerContext(projectId).catch(error => { ports.onError?.(error, "knowledge.catch_up"); return null; });
      if (owner) await service.catchUp({ client: ports.clientFor(owner), caller: owner }).catch(error => ports.onError?.(error, "knowledge.catch_up"));
    }
    if (!closed) await organizer.kick(projectId);
  };
  const changed = (projectId: string | null) => {
    if (closed || !projectId || timers.has(projectId)) return;
    const timer = setTimeout(() => { timers.delete(projectId); void settle(projectId); }, KICK_DELAY_MS);
    (timer as { unref?: () => void }).unref?.();
    timers.set(projectId, timer);
  };
  /**
   * A Plugin holding `knowledge:read` (Coding reading what the person picked for its round) reads the project's knowledge with the
   * project owner's authority, as indexing and organizing do: a Plugin is not offered the sources' own readers. The receipt, the
   * round's fill and the pieces kept from agents are still the Plugin's call's, and it stays bound to that call's own authority.
   */
  const access = async (caller: ActionExecutionContext, action: ActionReference): Promise<KnowledgeAccess> => {
    const asked: KnowledgeAccess = { client: ports.clientFor(caller), caller, workspace: caller, beforeEffect: caller.beforeEffect };
    if (caller.audience !== "plugin" || !caller.project_id || !caller.permissions.includes(KNOWLEDGE_READ_PERMISSION) || !ports.ownerContext) return asked;
    const owner = await ports.ownerContext(caller.project_id), origin = { ...action, provider_id: KNOWLEDGE_PROVIDER_ID };
    return { ...asked, reader: { ...owner, ...(caller.signal ? { signal: caller.signal } : {}),
      validate_authority: async reference => { await caller.validate_authority?.(origin); await owner.validate_authority?.(reference); },
      assert_authority_current: (reference, permissions) => { caller.assert_authority_current?.(origin); owner.assert_authority_current?.(reference, permissions); } } };
  };
  // Listing brings the project's sources current first (a catch-up that fails still lists what is there); cards for what it found
  // are there before the list is read, and organizing them follows shortly after.
  const caughtUp = async (caller: ActionExecutionContext) => {
    const caught = await service.catchUp(await access(caller, knowledgeActions.list)).catch(error => { ports.onError?.(error, "knowledge.catch_up"); return { listing: false }; });
    if (caller.project_id) await organizer.reconcile(caller.project_id).catch(error => ports.onError?.(error, "knowledge.reconcile"));
    changed(caller.project_id);
    return caught.listing;
  };
  // What a search or grep hands back carries refs, which resolve through the cards: a piece found before its card was written gets
  // one now, so the ref it was given reads it.
  const known = async (projectId: string | null | undefined, subjects: readonly ActionSubject[]) => {
    if (projectId && subjects.some(subject => !store.get(projectId, subject))) await organizer.reconcile(projectId).catch(error => ports.onError?.(error, "knowledge.reconcile"));
  };
  const unboundCard = (card: KnowledgeCardRecord) => card.retention?.source_identity === null && !card.adoption;
  const manageable = async (caller: ActionExecutionContext, action: ActionReference) => {
    const visible = await service.visible(await access(caller, action));
    return Object.assign((card: KnowledgeCardRecord) => card.project_id === caller.project_id && (visible(card) || unboundCard(card))
      && JSON.stringify(card) === JSON.stringify(store.get(card.project_id, card.subject)), { assertCurrent: visible.assertCurrent });
  };
  const changeCards = async <Result>(caller: ActionExecutionContext, action: ActionReference, subjects: readonly ActionSubject[],
    write: (selected: readonly ActionSubject[]) => Result, partial = false): Promise<Result> => {
    const asked = await access(caller, action), visible = action.capability_id === knowledgeManageActions.organize.capability_id ? await service.visible(asked) : await manageable(caller, action);
    const original = subjects.map(subject => store.get(caller.project_id!, subject)).filter((card): card is KnowledgeCardRecord => !!card && visible(card));
    if (!partial && original.length !== subjects.length) throw new ActionError("actions.subject_unavailable", "这份资料已归档或当前不可读取");
    await caller.beforeEffect();
    const current = action.capability_id === knowledgeManageActions.organize.capability_id ? await service.visible(asked) : await manageable(caller, action);
    if (original.some(card => !current(card))) throw new ActionError("actions.subject_unavailable", "资料或原授权已变化，这次修改没有执行");
    caller.signal?.throwIfAborted();
    requireSynchronous(caller.assert_authority_current?.({ ...action, provider_id: KNOWLEDGE_PROVIDER_ID }));
    current.assertCurrent?.();
    return write(original.map(card => card.subject));
  };
  const handlers: ActionHandlerBinding[] = [
    ...knowledgeBindingActions({ store, cards, index: ports.index, clientFor: ports.clientFor, retention }),
    { ...knowledgeActions.list, handle: async (caller, input) => service.list(await access(caller, knowledgeActions.list), input as KnowledgeListRequest, await caughtUp(caller)) },
    // A search brings the project's sources current; what it found new is organized shortly after.
    { ...knowledgeActions.search, handle: async (caller, input) => { await caughtUp(caller); const found = await service.search(await access(caller, knowledgeActions.search), input as KnowledgeSearchRequest);
      // requireCard means every returned search ref was already bound before the final visibility check.
      changed(caller.project_id); return found; } },
    { ...knowledgeActions.outline, handle: async (caller, input) => service.outline(await access(caller, knowledgeActions.outline), input as KnowledgeOutlineRequest) },
    { ...knowledgeActions.read, handle: async (caller, input) => service.read(await access(caller, knowledgeActions.read), input as KnowledgeReadRequest) },
    { ...knowledgeActions.grep, handle: async (caller, input) => service.grep(await access(caller, knowledgeActions.grep), input as KnowledgeGrepRequest,
      subjects => known(caller.project_id, subjects)) },
    { ...knowledgeActions.glob, handle: async (caller, input) => service.glob(await access(caller, knowledgeActions.glob), input as KnowledgeGlobRequest) },
    // Waits on the model: the section trees are read with the caller's authority, and a call no longer current answers nothing.
    { ...knowledgeActions.locate, handle: async (caller, input) => { const asked = await access(caller, knowledgeActions.locate);
      return service.locate(asked, input as KnowledgeLocateRequest, (ports.locator ?? (() => knowledgeModelLocator(ports.homeDirectory)))()); } },
    // A page past the first comes from the same catch-up as the first: paging through every card catches up once.
    { ...knowledgeManageActions.cards, handle: async (caller, input) => { const asked = input as KnowledgeCardsRequest;
      const listing = asked.offset ? false : await caughtUp(caller);
      const visible = await manageable(caller, knowledgeManageActions.cards), result = cards.list(caller, asked, listing, visible);
      visible.assertCurrent?.(); return result; } },
    { ...knowledgeManageActions.receipts, handle: (caller, input) => cards.receipts(caller, input as KnowledgeReceiptsRequest) },
    { ...knowledgeManageActions.edit, handle: async (caller, input) => { return changeCards(caller, knowledgeManageActions.edit, [(input as KnowledgeEditRequest).subject], () => cards.edit(caller, input as KnowledgeEditRequest)); } },
    { ...knowledgeManageActions.exclude, handle: async (caller, input) => { return changeCards(caller, knowledgeManageActions.exclude, [(input as KnowledgeExcludeRequest).subject], () => cards.exclude(caller, input as KnowledgeExcludeRequest)); } },
    { ...knowledgeManageActions.organize, handle: async (caller, input) => { const request = input as KnowledgeOrganizeRequest;
      const subjects = request.subjects ?? store.list(caller.project_id!).filter(card => card.state === "failed" || card.state === "over_quota").map(card => card.subject);
      return changeCards(caller, knowledgeManageActions.organize, subjects, selected => selected.length
        ? cards.organize(caller, { ...request, subjects: [...selected] }) : { queued: 0, quota: organizer.quota(caller.project_id!) }, true); } },
  ];
  return {
    registration: { provider: { provider_id: KNOWLEDGE_PROVIDER_ID, title: "项目资料", kind: "system" },
      definitions: [...Object.values(knowledgeActions), ...Object.values(knowledgeManageActions)], handlers },
    organizer,
    changed,
    projectDeleted: projectId => { clearTimeout(timers.get(projectId)); timers.delete(projectId); organizer.removeProject(projectId); store.removeProject(projectId); },
    tally: async (projectId, views) => service.tally(projectId, views, await ownerAccess(projectId)),
    catalog: async (projectId, views, words) => service.catalog(projectId, views, words, await ownerAccess(projectId)),
    close: async () => {
      closed = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      await organizer.close();
      store.close();
    },
  };
}
