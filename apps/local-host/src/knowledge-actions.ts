import type { ActionCallContext, ActionClient, ActionHandlerBinding, ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import {
  KNOWLEDGE_PROVIDER_ID,
  knowledgeActions,
  knowledgeManageActions,
  type KnowledgeCardsRequest,
  type KnowledgeEditRequest,
  type KnowledgeExcludeRequest,
  type KnowledgeGrepRequest,
  type KnowledgeOrganizeRequest,
  type KnowledgeOutlineRequest,
  type KnowledgeReadRequest,
  type KnowledgeSearchRequest,
} from "@molis-ai/molis-work-contracts/services/knowledge";
import type { SearchIndexPort } from "@molis-ai/molis-work-contracts/services/search";
import { KnowledgeCards, KnowledgeOrganizer, KnowledgeService, knowledgeCatalog, type KnowledgeAccess, type KnowledgeDraft, type KnowledgeWriter } from "@molis-ai/molis-work-service-knowledge";
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
  close(): Promise<void>;
}

const KICK_DELAY_MS = 2_000;
const CARD_SCHEMA = { type: "object", properties: { title: { type: "string" }, brief: { type: "string" }, keywords: { type: "array", items: { type: "string" } },
  sections: { type: "array", items: { type: "object", properties: { anchor: { type: "string" }, summary: { type: "string" } }, required: ["anchor", "summary"], additionalProperties: false } } },
  required: ["title", "brief", "keywords", "sections"], additionalProperties: false } as const;

/** The Home's text model writing one card with the registered instruction; null when no text model is configured. */
export function knowledgeModelWriter(homeDirectory: string): KnowledgeWriter | null {
  const generate = hostTextGeneration({ homeDirectory });
  if (!generate) return null;
  return async input => {
    const result = await generate(resolveModelPrompt(homeDirectory, instructed(KNOWLEDGE_ORGANIZE, JSON.stringify(input)), KNOWLEDGE_ORGANIZE.prompt_id), {
      structured: { mode: "local", name: "knowledge_card", schema: CARD_SCHEMA as never }, timeoutMs: 120_000, maxOutputTokens: 1500 });
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
  const service = new KnowledgeService({ search: (access, input) => ports.search.query(access, input), cards: store });
  const cards = new KnowledgeCards(store, organizer);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let closed = false;
  const changed = (projectId: string | null) => {
    if (closed || !projectId || timers.has(projectId)) return;
    const timer = setTimeout(() => { timers.delete(projectId); void organizer.kick(projectId); }, KICK_DELAY_MS);
    (timer as { unref?: () => void }).unref?.();
    timers.set(projectId, timer);
  };
  const access = (caller: ActionCallContext): KnowledgeAccess => ({ client: ports.clientFor(caller), caller });
  const handlers: ActionHandlerBinding[] = [
    // A search brings the project's sources current; what it found new is organized shortly after.
    { ...knowledgeActions.search, handle: async (caller, input) => { const found = await service.search(access(caller), input as KnowledgeSearchRequest); changed(caller.project_id); return found; } },
    { ...knowledgeActions.outline, handle: (caller, input) => service.outline(access(caller), input as KnowledgeOutlineRequest) },
    { ...knowledgeActions.read, handle: (caller, input) => service.read(access(caller), input as KnowledgeReadRequest) },
    { ...knowledgeActions.grep, handle: (caller, input) => service.grep(access(caller), input as KnowledgeGrepRequest) },
    { ...knowledgeManageActions.cards, handle: (caller, input) => cards.list(caller, input as KnowledgeCardsRequest) },
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
    close: async () => {
      closed = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      await organizer.close();
      store.close();
    },
  };
}
