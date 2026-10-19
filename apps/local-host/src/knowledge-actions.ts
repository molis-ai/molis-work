import type { ActionCallContext, ActionClient, ActionExecutionContext, ActionHandlerBinding, ActionProviderRegistration, ActionReference, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import {
  KNOWLEDGE_PROVIDER_ID,
  KNOWLEDGE_READ_PERMISSION,
  knowledgeActions,
  knowledgeManageActions,
  type KnowledgeCardsRequest,
  type KnowledgeEditRequest,
  type KnowledgeExcludeRequest,
  type KnowledgeGlobRequest,
  type KnowledgeGrepRequest,
  type KnowledgeListRequest,
  type KnowledgeOrganizeRequest,
  type KnowledgeOutlineRequest,
  type KnowledgeReadRequest,
  type KnowledgeReceiptsRequest,
  type KnowledgeSearchRequest,
} from "@molis-ai/molis-work-contracts/services/knowledge";
import type { SearchIndexPort } from "@molis-ai/molis-work-contracts/services/search";
import { KnowledgeCards, KnowledgeOrganizer, KnowledgeService, knowledgeCatalog, knowledgeCutPieces, knowledgeReader, type KnowledgeAccess, type KnowledgeDraft, type KnowledgeWriter } from "@molis-ai/molis-work-service-knowledge";
import type { SearchService } from "@molis-ai/molis-work-service-search";
import { openKnowledgeCards } from "@molis-ai/molis-work-storage";
import { KNOWLEDGE_ORGANIZE } from "./agent-definitions/system-prompts.js";
import { resolveModelPrompt } from "./agent-definitions/instructions.js";
import { hostTextGeneration } from "./host-complete-text.js";

export interface KnowledgeHostPorts {
  homeDirectory: string;
  search: Pick<SearchService, "query">;
  /** The search index: the catalog of each project is what it holds (spec §4.4). */
  index: Pick<SearchIndexPort, "documents" | "sources">;
  clientFor(caller: ActionCallContext): ActionClient;
  /** The project owner's authority, which indexing and organizing read every source with. */
  ownerContext?(projectId: string): Promise<ActionCallContext>;
  /** The project's text model now (tests give their own); by default the Home's configured text model. */
  writer?(): KnowledgeWriter | null;
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
  tally(projectId: string, views: readonly ActionView[]): { total: number; sources: Array<{ plugin_title: string; count: number }> };
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
  return async input => {
    const result = await generate(resolveModelPrompt(homeDirectory, instructed(KNOWLEDGE_ORGANIZE, JSON.stringify(input)), KNOWLEDGE_ORGANIZE.prompt_id), {
      structured: { mode: "local", name: "knowledge_card", schema: CARD_SCHEMA as never }, timeoutMs: 120_000, maxOutputTokens: 4000 });
    const draft = result.structured as KnowledgeDraft | undefined;
    if (!draft || typeof draft !== "object") throw new Error("模型没有给出合格式的卡片");
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
  const organizer = new KnowledgeOrganizer({ store, catalog: async projectId => knowledgeCatalog(ports.index, projectId),
    writer: ports.writer ?? (() => knowledgeModelWriter(ports.homeDirectory)), ...(ports.quota ? { quota: ports.quota } : {}), ...(ports.onError ? { onError: ports.onError } : {}) });
  const service = new KnowledgeService({ search: (access, input) => ports.search.query({ client: access.client, caller: knowledgeReader(access) }, input), cards: store,
    cut: projectId => knowledgeCutPieces(ports.index, projectId) });
  const cards = new KnowledgeCards(store, organizer);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let closed = false;
  const changed = (projectId: string | null) => {
    if (closed || !projectId || timers.has(projectId)) return;
    const timer = setTimeout(() => { timers.delete(projectId); void organizer.kick(projectId); }, KICK_DELAY_MS);
    (timer as { unref?: () => void }).unref?.();
    timers.set(projectId, timer);
  };
  /**
   * A Plugin holding `knowledge:read` (Coding reading what the person picked for its round) reads the project's knowledge with the
   * project owner's authority, as indexing and organizing do: a Plugin is not offered the sources' own readers. The receipt, the
   * round's fill and the pieces kept from agents are still the Plugin's call's, and it stays bound to that call's own authority.
   */
  const access = async (caller: ActionExecutionContext, action: ActionReference): Promise<KnowledgeAccess> => {
    const asked: KnowledgeAccess = { client: ports.clientFor(caller), caller, beforeEffect: caller.beforeEffect };
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
  const handlers: ActionHandlerBinding[] = [
    { ...knowledgeActions.list, handle: async (caller, input) => service.list(await access(caller, knowledgeActions.list), input as KnowledgeListRequest, await caughtUp(caller)) },
    // A search brings the project's sources current; what it found new is organized shortly after.
    { ...knowledgeActions.search, handle: async (caller, input) => { const found = await service.search(await access(caller, knowledgeActions.search), input as KnowledgeSearchRequest); changed(caller.project_id); return found; } },
    { ...knowledgeActions.outline, handle: async (caller, input) => service.outline(await access(caller, knowledgeActions.outline), input as KnowledgeOutlineRequest) },
    { ...knowledgeActions.read, handle: async (caller, input) => service.read(await access(caller, knowledgeActions.read), input as KnowledgeReadRequest) },
    { ...knowledgeActions.grep, handle: async (caller, input) => service.grep(await access(caller, knowledgeActions.grep), input as KnowledgeGrepRequest) },
    { ...knowledgeActions.glob, handle: async (caller, input) => service.glob(await access(caller, knowledgeActions.glob), input as KnowledgeGlobRequest) },
    { ...knowledgeManageActions.cards, handle: async (caller, input) => cards.list(caller, input as KnowledgeCardsRequest, await caughtUp(caller)) },
    { ...knowledgeManageActions.receipts, handle: (caller, input) => cards.receipts(caller, input as KnowledgeReceiptsRequest) },
    { ...knowledgeManageActions.edit, handle: async (caller, input) => { await caller.beforeEffect(); return cards.edit(caller, input as KnowledgeEditRequest); } },
    { ...knowledgeManageActions.exclude, handle: async (caller, input) => { await caller.beforeEffect(); return cards.exclude(caller, input as KnowledgeExcludeRequest); } },
    { ...knowledgeManageActions.organize, handle: async (caller, input) => { await caller.beforeEffect(); return cards.organize(caller, input as KnowledgeOrganizeRequest); } },
  ];
  return {
    registration: { provider: { provider_id: KNOWLEDGE_PROVIDER_ID, title: "项目资料", kind: "system" },
      definitions: [...Object.values(knowledgeActions), ...Object.values(knowledgeManageActions)], handlers },
    organizer,
    changed,
    projectDeleted: projectId => { clearTimeout(timers.get(projectId)); timers.delete(projectId); store.removeProject(projectId); },
    tally: (projectId, views) => service.tally(projectId, views),
    close: async () => {
      closed = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      await organizer.close();
      store.close();
    },
  };
}
