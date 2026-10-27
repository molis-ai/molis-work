import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  KNOWLEDGE_BRIEF_MAX_CHARS,
  KNOWLEDGE_CARD_MAX_KEYWORDS,
  KNOWLEDGE_KEYWORD_MAX_CHARS,
  KNOWLEDGE_TITLE_MAX_CHARS,
  type KnowledgeCardRecord,
  type KnowledgeCardsRequest,
  type KnowledgeCardsResponse,
  type KnowledgeCardStorePort,
  type KnowledgeEditableField,
  type KnowledgeEditRequest,
  type KnowledgeExcludeRequest,
  type KnowledgeOrganizeRequest,
  type KnowledgeOrganizeResponse,
  type KnowledgeReceiptsRequest,
  type KnowledgeReceiptsResponse,
} from "@molis-ai/molis-work-contracts/services/knowledge";
import { knowledgeErrors } from "./errors.js";
import type { KnowledgeOrganizer } from "./organize.js";

const DEFAULT_PAGE = 50;
const words = (values: readonly string[]) => [...new Set(values.map(value => value.replace(/\s+/gu, " ").trim().slice(0, KNOWLEDGE_KEYWORD_MAX_CHARS)).filter(Boolean))].slice(0, KNOWLEDGE_CARD_MAX_KEYWORDS);

/**
 * The person's management of a project's cards (spec §8.3). What the person writes on a card is theirs: the edited fields
 * are marked and organizing never writes over them; adopting a suggestion hands those fields back to organizing.
 */
export class KnowledgeCards {
  constructor(private readonly store: KnowledgeCardStorePort, private readonly organizer: KnowledgeOrganizer) {}

  /** `listing`: whether the catch-up before this list left a source still being listed (the caller's to know). */
  list(caller: ActionCallContext, input: KnowledgeCardsRequest, listing = false, visible: (card: KnowledgeCardRecord) => boolean = card => !card.retention): KnowledgeCardsResponse {
    const project = this.project(caller);
    const all = this.store.list(project).filter(card => visible(card) && (!input.states?.length || input.states.includes(card.state)));
    const offset = input.offset ?? 0;
    return { cards: all.slice(offset, offset + (input.limit ?? DEFAULT_PAGE)), total: all.length, quota: this.organizer.quota(project), model_ready: this.organizer.modelReady(), listing };
  }

  edit(caller: ActionCallContext, input: KnowledgeEditRequest): KnowledgeCardRecord {
    const card = this.card(caller, input);
    const next: KnowledgeCardRecord = { ...card, edited: [...card.edited] };
    const mark = (field: KnowledgeEditableField) => { if (!next.edited.includes(field)) next.edited.push(field); };
    if (input.title !== undefined) { next.title = input.title.replace(/\s+/gu, " ").trim().slice(0, KNOWLEDGE_TITLE_MAX_CHARS); mark("title"); }
    if (input.brief !== undefined) { next.brief = input.brief.replace(/\s+/gu, " ").trim().slice(0, KNOWLEDGE_BRIEF_MAX_CHARS); mark("brief"); }
    if (input.keywords !== undefined) { next.keywords = words(input.keywords); mark("keywords"); }
    if (!next.title) throw knowledgeErrors.invalid("卡片的标题不能为空");
    // Adopting gives the field back to organizing: its suggestion becomes the field, and later organizing may change it again.
    for (const field of input.adopt ?? []) {
      const proposed = card.suggestion?.[field];
      if (field === "keywords" && Array.isArray(proposed)) next.keywords = proposed;
      else if (field === "title" && typeof proposed === "string") next.title = proposed;
      else if (field === "brief" && typeof proposed === "string") next.brief = proposed;
      next.edited = next.edited.filter(item => item !== field);
    }
    const left = { ...card.suggestion };
    for (const field of [...input.adopt ?? [], ...next.edited.filter(field => input[field] !== undefined)]) delete left[field];
    next.suggestion = Object.keys(left).length ? left : null;
    this.store.put(next);
    return next;
  }

  /** A piece let back to agents that waited is organized now; one kept back waits (its text goes to no model meanwhile). */
  exclude(caller: ActionCallContext, input: KnowledgeExcludeRequest): KnowledgeCardRecord {
    const next = { ...this.card(caller, input), excluded: input.excluded };
    this.store.put(next);
    if (!next.excluded && next.state === "pending") void this.organizer.kick(next.project_id);
    return next;
  }

  organize(caller: ActionCallContext, input: KnowledgeOrganizeRequest): KnowledgeOrganizeResponse {
    const project = this.project(caller);
    const queued = this.organizer.queue(project, input.subjects, input.confirm_over_quota === true);
    void this.organizer.kick(project);
    return { queued, quota: this.organizer.quota(project) };
  }

  /** Who read which piece's original text, newest first (PMAT-12). */
  receipts(caller: ActionCallContext, input: KnowledgeReceiptsRequest): KnowledgeReceiptsResponse {
    return this.store.receipts(this.project(caller), { ...(input.subject ? { subject: input.subject } : {}), limit: input.limit ?? DEFAULT_PAGE, offset: input.offset ?? 0 });
  }

  private card(caller: ActionCallContext, input: { subject: KnowledgeCardRecord["subject"] }): KnowledgeCardRecord {
    const card = this.store.get(this.project(caller), input.subject);
    if (!card) throw knowledgeErrors.unknown("这份资料还没有卡片；在项目资料里搜一次或等它进入目录后再试");
    return card;
  }

  private project(caller: ActionCallContext): string {
    if (!caller.project_id) throw knowledgeErrors.scope("项目资料只能在项目里管理");
    return caller.project_id;
  }
}
