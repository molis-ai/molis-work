import type { ActionSubject, SearchOpenTarget } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  KNOWLEDGE_BRIEF_MAX_CHARS,
  KNOWLEDGE_CARD_MAX_KEYWORDS,
  KNOWLEDGE_KEYWORD_MAX_CHARS,
  KNOWLEDGE_SECTION_SUMMARY_MAX_CHARS,
  KNOWLEDGE_TITLE_MAX_CHARS,
  type KnowledgeCardFields,
  type KnowledgeCardRecord,
  type KnowledgeCardStorePort,
  type KnowledgeEditableField,
  type KnowledgeQuota,
  type KnowledgeSectionNote,
} from "@molis-ai/molis-work-contracts/services/knowledge";
import type { SearchIndexPort } from "@molis-ai/molis-work-contracts/services/search";
import { outlineOf } from "./text.js";

/** One piece in a project's catalog, as the system search indexed it with the local person's access (spec §4.4). */
export interface KnowledgePiece {
  subject: ActionSubject;
  source_key: string;
  provider_id: string;
  plugin_id: string;
  plugin_title: string;
  revision: string;
  title: string;
  summary: string;
  /** The text the owner let the index hold; empty for a `summary` source. */
  content: string;
  content_policy: "context" | "summary";
  updated_at: string | null;
  open: SearchOpenTarget | null;
}

/** A project's catalog: every document the search index holds for it, with the source that lists it. */
export function knowledgeCatalog(index: Pick<SearchIndexPort, "documents" | "sources">, projectId: string): KnowledgePiece[] {
  const sources = new Map(index.sources().filter(source => source.project_id === projectId).map(source => [source.source_key, source]));
  return index.documents(projectId).flatMap(document => {
    const source = sources.get(document.source_key);
    if (!source) return [];
    return [{ subject: { kind: document.kind, id: document.object_id }, source_key: document.source_key, provider_id: source.provider_id, plugin_id: source.plugin_id,
      plugin_title: source.title, revision: document.revision, title: document.title, summary: document.summary, content: document.content,
      content_policy: document.content_policy, updated_at: document.updated_at, open: document.open }];
  });
}

/** What the model is given for one piece: its title, its text (or each section's opening when it is long) and the section anchors. */
export interface KnowledgeDraftInput { title: string; summary: string; text: string; sections: Array<{ anchor: string; title: string }> }
/** What the model proposes. Anything outside these bounds is cut; a section anchor the piece does not have is dropped. */
export interface KnowledgeDraft { title: string; brief: string; keywords: string[]; sections: Array<{ anchor: string; summary: string }> }
export type KnowledgeWriter = (input: KnowledgeDraftInput) => Promise<KnowledgeDraft>;

export interface KnowledgeOrganizerOptions {
  store: KnowledgeCardStorePort;
  /** Every piece the project's catalog holds now. */
  catalog(projectId: string): Promise<KnowledgePiece[]>;
  /** The project's text model now; null when there is none, and pending cards wait for one. */
  writer(): KnowledgeWriter | null;
  /** Organizing allowed per project per day before it stops for the person (spec §12 Q3; numbers to be measured). */
  quota?: { pieces: number; chars: number };
  clock?: () => Date;
  onError?(error: unknown, where: string): void;
}

export const DEFAULT_KNOWLEDGE_QUOTA = { pieces: 100, chars: 600_000 } as const;
/** Most of a piece's text one organizing sends; a longer piece sends the opening of each section instead. */
export const ORGANIZE_TEXT_CHARS = 12_000;
/** Text shorter than this gets a card but no outline. */
export const OUTLINE_MIN_CHARS = 2_000;
const MAX_NOTES = 60;
const ERROR_CHARS = 200;

const keyOf = (subject: ActionSubject) => `${subject.kind}\u0000${subject.id}`;
const clip = (value: unknown, max: number) => (typeof value === "string" ? value : "").replace(/\s+/gu, " ").trim().slice(0, max);
const sameFields = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A new card for a piece: a `summary` piece is listed as its owner describes it; the rest wait for organizing. */
export function cardFor(projectId: string, piece: KnowledgePiece): KnowledgeCardRecord {
  const listed = piece.content_policy === "summary";
  return { project_id: projectId, subject: piece.subject, source_key: piece.source_key, provider_id: piece.provider_id, plugin_id: piece.plugin_id, plugin_title: piece.plugin_title,
    content_policy: piece.content_policy, revision: piece.revision, organized_revision: null, state: listed ? "listed" : "pending",
    title: clip(piece.title, KNOWLEDGE_TITLE_MAX_CHARS), brief: listed ? clip(piece.summary, KNOWLEDGE_BRIEF_MAX_CHARS) : "", keywords: [], outline: [], edited: [], suggestion: null,
    excluded: false, error: null, updated_at: piece.updated_at, organized_at: null, open: piece.open };
}

/** The card as the catalog lists the piece now: where it is and its revision; its state follows the revision. */
export function cardSeen(card: KnowledgeCardRecord, piece: KnowledgePiece): KnowledgeCardRecord {
  const next: KnowledgeCardRecord = { ...card, source_key: piece.source_key, provider_id: piece.provider_id, plugin_id: piece.plugin_id, plugin_title: piece.plugin_title,
    content_policy: piece.content_policy, revision: piece.revision, updated_at: piece.updated_at, open: piece.open };
  if (piece.content_policy === "summary") {
    // Nothing of its text was organized: the owner's own title and summary, unless the person wrote their own.
    const own = { title: clip(piece.title, KNOWLEDGE_TITLE_MAX_CHARS), brief: clip(piece.summary, KNOWLEDGE_BRIEF_MAX_CHARS) };
    return { ...next, state: "listed", outline: [], organized_revision: null,
      title: card.edited.includes("title") ? card.title : own.title, brief: card.edited.includes("brief") ? card.brief : own.brief };
  }
  if (card.state === "listed" || card.state === "missing" || card.revision !== piece.revision || card.content_policy !== piece.content_policy) {
    return { ...next, state: next.organized_revision === piece.revision ? "ready" : "pending", error: null };
  }
  return next;
}

/** What the model reads: the whole text when it is short, otherwise each section's opening, within `ORGANIZE_TEXT_CHARS`. */
export function draftInput(piece: KnowledgePiece): KnowledgeDraftInput {
  const sections = piece.content.length >= OUTLINE_MIN_CHARS ? outlineOf(piece.content).slice(0, MAX_NOTES) : [];
  const heads = sections.length >= 2 ? sections.map(section => ({ anchor: section.anchor, title: section.title })) : [];
  if (piece.content.length <= ORGANIZE_TEXT_CHARS || heads.length < 2) {
    return { title: piece.title, summary: piece.summary, text: piece.content.slice(0, ORGANIZE_TEXT_CHARS), sections: heads };
  }
  const each = Math.max(200, Math.floor(ORGANIZE_TEXT_CHARS / sections.length));
  const text = sections.map(section => `[${section.anchor}] ${piece.content.slice(section.start, section.start + Math.min(section.length, each))}`).join("\n\n").slice(0, ORGANIZE_TEXT_CHARS);
  return { title: piece.title, summary: piece.summary, text, sections: heads };
}

/**
 * The card after organizing one revision. Fields the person edited keep their words; what organizing would write for them,
 * when it differs, waits in `suggestion` for the person to adopt.
 */
export function cardOrganized(card: KnowledgeCardRecord, input: KnowledgeDraftInput, draft: KnowledgeDraft, at: string): KnowledgeCardRecord {
  const proposed: KnowledgeCardFields = { title: clip(draft.title, KNOWLEDGE_TITLE_MAX_CHARS) || card.title, brief: clip(draft.brief, KNOWLEDGE_BRIEF_MAX_CHARS),
    keywords: [...new Set((Array.isArray(draft.keywords) ? draft.keywords : []).map(word => clip(word, KNOWLEDGE_KEYWORD_MAX_CHARS)).filter(Boolean))].slice(0, KNOWLEDGE_CARD_MAX_KEYWORDS) };
  const heads = new Map(input.sections.map(section => [section.anchor, section.title]));
  const outline: KnowledgeSectionNote[] = [];
  for (const note of Array.isArray(draft.sections) ? draft.sections : []) {
    const title = heads.get(note?.anchor), summary = clip(note?.summary, KNOWLEDGE_SECTION_SUMMARY_MAX_CHARS);
    if (title === undefined || !summary || outline.some(item => item.anchor === note.anchor)) continue;
    outline.push({ anchor: note.anchor, title, summary });
  }
  const kept = (field: KnowledgeEditableField) => card.edited.includes(field);
  const next: KnowledgeCardRecord = { ...card, outline, organized_revision: card.revision, state: "ready", error: null, organized_at: at,
    title: kept("title") ? card.title : proposed.title, brief: kept("brief") ? card.brief : proposed.brief, keywords: kept("keywords") ? card.keywords : proposed.keywords };
  const suggestion: Partial<KnowledgeCardFields> = {};
  if (kept("title") && card.title !== proposed.title) suggestion.title = proposed.title;
  if (kept("brief") && card.brief !== proposed.brief) suggestion.brief = proposed.brief;
  if (kept("keywords") && !sameFields(card.keywords, proposed.keywords)) suggestion.keywords = proposed.keywords;
  next.suggestion = Object.keys(suggestion).length ? suggestion : null;
  return next;
}

/**
 * Organizes a project's pieces into cards (spec §5): the catalog decides what is there, a piece is organized once per revision,
 * one at a time per project, within the day's allowance. Nothing is organized without a model; a `summary` piece never reaches one.
 */
export class KnowledgeOrganizer {
  private readonly running = new Map<string, Promise<void>>();
  private readonly again = new Set<string>();
  private closed = false;

  constructor(private readonly options: KnowledgeOrganizerOptions) {}

  /** Bring cards in line with the catalog, then organize what waits. Calls for a project that is already running fold into one more pass. */
  kick(projectId: string): Promise<void> {
    const current = this.running.get(projectId);
    if (current) { this.again.add(projectId); return current; }
    const pass = (async () => {
      do {
        this.again.delete(projectId);
        await this.reconcile(projectId);
        await this.organizePending(projectId);
      } while (this.again.has(projectId) && !this.closed);
    })().catch(error => this.options.onError?.(error, "knowledge.organize")).finally(() => this.running.delete(projectId));
    this.running.set(projectId, pass);
    return pass;
  }

  /** Cards for every piece in the catalog; a card whose piece left goes, unless the person edited or kept it back. */
  async reconcile(projectId: string): Promise<void> {
    const store = this.options.store;
    const pieces = await this.options.catalog(projectId);
    const cards = new Map(store.list(projectId).map(card => [keyOf(card.subject), card]));
    for (const piece of pieces) {
      const card = cards.get(keyOf(piece.subject));
      cards.delete(keyOf(piece.subject));
      const next = card ? cardSeen(card, piece) : cardFor(projectId, piece);
      if (!card || !sameFields(card, next)) store.put(next);
    }
    for (const card of cards.values()) {
      if (card.edited.length || card.excluded) { if (card.state !== "missing") store.put({ ...card, state: "missing" }); }
      else store.remove(projectId, card.subject);
    }
  }

  /**
   * Named pieces are organized again from their text now. Without names, the ones that did not get done (failed, or stopped at
   * the day's allowance) wait again. `confirm` lets one more day's allowance be used today.
   */
  queue(projectId: string, subjects: readonly ActionSubject[] | undefined, confirm: boolean): number {
    const store = this.options.store;
    if (confirm) { const limits = this.limits(); store.addUsage(projectId, this.day(), { extra_pieces: limits.pieces, extra_chars: limits.chars }); }
    const named = subjects?.length ? new Set(subjects.map(keyOf)) : null;
    let queued = 0;
    for (const card of store.list(projectId)) {
      if (card.state === "listed" || card.state === "missing") continue;
      if (named ? !named.has(keyOf(card.subject)) : card.state !== "failed" && card.state !== "over_quota") continue;
      store.put({ ...card, state: "pending", organized_revision: named ? null : card.organized_revision, error: null });
      queued += 1;
    }
    return queued;
  }

  quota(projectId: string): KnowledgeQuota {
    const usage = this.options.store.usage(projectId, this.day()), limits = this.limits();
    const limit_pieces = limits.pieces + usage.extra_pieces, limit_chars = limits.chars + usage.extra_chars;
    return { day: usage.day, used_pieces: usage.pieces, used_chars: usage.chars, limit_pieces, limit_chars, reached: usage.pieces >= limit_pieces || usage.chars >= limit_chars };
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.allSettled([...this.running.values()]);
  }

  private async organizePending(projectId: string): Promise<void> {
    const writer = this.options.writer();
    if (!writer) return;
    const pieces = new Map((await this.options.catalog(projectId)).map(piece => [keyOf(piece.subject), piece]));
    for (const waiting of this.options.store.list(projectId).filter(card => card.state === "pending")) {
      if (this.closed) return;
      const piece = pieces.get(keyOf(waiting.subject));
      if (!piece || piece.revision !== waiting.revision || piece.content_policy !== "context") continue;
      const input = draftInput(piece);
      const quota = this.quota(projectId);
      if (quota.used_pieces + 1 > quota.limit_pieces || quota.used_chars + input.text.length > quota.limit_chars) {
        // Stop for the person: every card still waiting says so, and nothing more goes to the model today.
        for (const card of this.options.store.list(projectId)) if (card.state === "pending") this.options.store.put({ ...card, state: "over_quota" });
        return;
      }
      this.options.store.addUsage(projectId, this.day(), { pieces: 1, chars: input.text.length });
      const outcome = await writer(input).then(draft => ({ draft }), (error: unknown) => ({ error }));
      // The piece may have changed, or the person queued it again, while the model wrote: then this draft is for nothing.
      const now = this.options.store.get(projectId, waiting.subject);
      if (!now || now.revision !== waiting.revision || now.state !== "pending") continue;
      this.options.store.put("draft" in outcome ? cardOrganized(now, input, outcome.draft, this.clock().toISOString())
        : { ...now, state: "failed", error: (outcome.error instanceof Error ? outcome.error.message : String(outcome.error)).slice(0, ERROR_CHARS) });
    }
  }

  private limits() { return this.options.quota ?? DEFAULT_KNOWLEDGE_QUOTA; }
  private clock(): Date { return this.options.clock?.() ?? new Date(); }
  private day(): string { return this.clock().toISOString().slice(0, 10); }
}
