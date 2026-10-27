import { setImmediate as yieldToIO } from "node:timers/promises";
import { requireSynchronous, type ActionSubject, type SearchOpenTarget } from "@molis-ai/molis-work-contracts/platform/actions";
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
import { SEARCH_INDEX_CONTENT_CHARS, type SearchIndexPort, type SearchRetentionIdentity, type SearchRetentionResult } from "@molis-ai/molis-work-contracts/services/search";
import { outlineOf } from "./text.js";

/** One piece in a project's catalog, as the system search indexed it with the local person's access (spec §4.4). */
export interface KnowledgePiece {
  retention?: { generation: string | null };
  restoration?: { content_revision: string; restoration_operation_id: string };
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
      plugin_title: source.title, revision: document.content_revision ?? document.revision, ...(document.retention ? { retention: document.retention } : {}), title: document.title, summary: document.summary, content: document.content,
      content_policy: document.content_policy, updated_at: document.updated_at, open: document.open }];
  });
}

/** A project's pieces whose text the index holds only the start of: a word past that is found only by reading them (PMAT-32). */
export function knowledgeCutPieces(index: Pick<SearchIndexPort, "documents">, projectId: string): ActionSubject[] {
  return index.documents(projectId).filter(document => document.content.length >= SEARCH_INDEX_CONTENT_CHARS).map(document => ({ kind: document.kind, id: document.object_id }));
}

/** What the model is given for one piece: its title, its text (or each section's opening when it is long) and the section anchors. */
export interface KnowledgeDraftInput { title: string; summary: string; text: string; sections: Array<{ anchor: string; title: string }> }
/** What the model proposes. Anything outside these bounds is cut; a section anchor the piece does not have is dropped. */
/** What a model wrote for one piece: only a title and a brief are certain; keywords and section notes may be missing or partial. */
export interface KnowledgeDraft { title: string; brief: string; keywords?: string[]; sections?: Array<{ anchor?: string; summary?: string }> }
export interface KnowledgeWriterControl { beforeDispatch(): Promise<void>; afterResult(): Promise<void> }
export type KnowledgeWriter = (input: KnowledgeDraftInput, signal?: AbortSignal, control?: KnowledgeWriterControl) => Promise<KnowledgeDraft>;

type UnboundRetentionClassifier = (identity: SearchRetentionIdentity) => "unsupported" | "unavailable";

export interface KnowledgeOrganizerOptions {
  store: KnowledgeCardStorePort;
  /** Every piece the project's catalog holds now. */
  catalog(projectId: string): Promise<KnowledgePiece[]>;
  /** The project's text model now; null when there is none, and pending cards wait for one. */
  writer(): KnowledgeWriter | null;
  retention?(identity: SearchRetentionIdentity): Promise<SearchRetentionResult>;
  /** Prepare only the caller; classification of unbound pieces reads the current declarations synchronously. */
  prepareUnboundRetention?(projectId: string): Promise<UnboundRetentionClassifier>;
  /** Pins the original permission and installation before sending; completion rechecks version without sending again. */
  authorize?(projectId: string, piece: KnowledgePiece, card: KnowledgeCardRecord): Promise<{ assertCurrent(): void; beforeDispatch(): Promise<void>; current(): Promise<boolean> } | null>;
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

/**
 * A piece organizing has nothing to read in: its owner shares only a title and summary, or no text could be read out of it (an
 * image, a binary file). Its card is listed as its owner describes it, and nothing of it goes to the model.
 */
const bare = (piece: KnowledgePiece) => piece.content_policy === "summary" || !piece.content.trim();

/** A new card for a piece: a bare piece is listed as its owner describes it; the rest wait for organizing. */
export function cardFor(projectId: string, piece: KnowledgePiece): KnowledgeCardRecord {
  const listed = bare(piece) || piece.restoration?.content_revision === piece.revision;
  return { project_id: projectId, subject: piece.subject, source_key: piece.source_key, provider_id: piece.provider_id, plugin_id: piece.plugin_id, plugin_title: piece.plugin_title,
    ...(piece.retention ? { retention: { ...piece.retention, restoration_operation_id: piece.restoration?.restoration_operation_id ?? null } } : {}),
    can_organize: !bare(piece), content_policy: piece.content_policy, revision: piece.revision, organized_revision: null, state: listed ? "listed" : "pending",
    title: clip(piece.title, KNOWLEDGE_TITLE_MAX_CHARS), brief: listed ? clip(piece.summary, KNOWLEDGE_BRIEF_MAX_CHARS) : "", keywords: [], outline: [], edited: [], suggestion: null,
    excluded: false, error: null, updated_at: piece.updated_at, organized_at: null, open: piece.open };
}

/** The card as the catalog lists the piece now: where it is and its revision; its state follows the revision. */
export function cardSeen(card: KnowledgeCardRecord, piece: KnowledgePiece): KnowledgeCardRecord {
  // An old card cannot be adopted by a different install, or acquire a binding after the fact.
  if (card.provider_id !== piece.provider_id || card.source_key !== piece.source_key
    || (card.retention?.generation ?? null) !== (piece.retention?.generation ?? null) || !!card.retention !== !!piece.retention) return card;
  if (card.retention && card.content_policy === "context" && piece.content_policy === "summary") return card;
  const operation = piece.restoration?.restoration_operation_id;
  const firstRestore = !!operation && card.retention?.restoration_operation_id !== operation;
  const next: KnowledgeCardRecord = { ...card, source_key: piece.source_key, provider_id: piece.provider_id, plugin_id: piece.plugin_id, plugin_title: piece.plugin_title,
    ...(card.retention ? { retention: { ...card.retention, restoration_operation_id: operation ?? card.retention.restoration_operation_id } } : {}),
    can_organize: !bare(piece), content_policy: piece.content_policy, revision: piece.revision, updated_at: piece.updated_at, open: piece.open };
  if (piece.restoration?.content_revision === piece.revision && card.state === "listed" && card.content_policy === "summary"
    && card.organized_revision === null && card.retention?.restoration_operation_id === operation) return { ...next, state: "listed" };
  if (firstRestore && piece.restoration?.content_revision === piece.revision) {
    // An older organized card is not evidence about the archived version. Keep human edits, discard stale derived material.
    if (card.revision !== piece.revision) return { ...next, state: "listed", organized_revision: null, organized_at: null,
      title: card.edited.includes("title") ? card.title : clip(piece.title, KNOWLEDGE_TITLE_MAX_CHARS),
      brief: card.edited.includes("brief") ? card.brief : "", keywords: card.edited.includes("keywords") ? card.keywords : [],
      outline: [], suggestion: null, error: null };
    return { ...next, state: card.state === "pending" || card.state === "missing" ? "listed" : card.state };
  }
  if (card.state === "listed" && card.retention?.restoration_operation_id && card.revision === piece.revision && card.content_policy === piece.content_policy) return next;
  if (bare(piece)) {
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
  const text = sections.map(section => `[${section.anchor}] ${piece.content.slice(section.start, section.start + Math.min(section.own, each))}`).join("\n\n").slice(0, ORGANIZE_TEXT_CHARS);
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
    const anchor = note?.anchor, title = anchor === undefined ? undefined : heads.get(anchor), summary = clip(note?.summary, KNOWLEDGE_SECTION_SUMMARY_MAX_CHARS);
    if (anchor === undefined || title === undefined || !summary || outline.some(item => item.anchor === anchor)) continue;
    outline.push({ anchor, title, summary });
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
  private readonly removed = new Set<string>();
  private readonly controllers = new Map<string, AbortController>();
  private closed = false;

  constructor(private readonly options: KnowledgeOrganizerOptions) {}

  /** Bring cards in line with the catalog, then organize what waits. Calls for a project that is already running fold into one more pass. */
  kick(projectId: string): Promise<void> {
    if (this.closed || this.removed.has(projectId)) return Promise.resolve();
    const current = this.running.get(projectId);
    if (current) { this.again.add(projectId); return current; }
    const controller = new AbortController();
    this.controllers.set(projectId, controller);
    const pass = (async () => {
      do {
        this.again.delete(projectId);
        await this.reconcile(projectId);
        if (!controller.signal.aborted) await this.organizePending(projectId, controller.signal);
      } while (this.again.has(projectId) && !controller.signal.aborted);
    })().catch(error => { if (!controller.signal.aborted) this.options.onError?.(error, "knowledge.organize"); }).finally(() => {
      this.running.delete(projectId); this.controllers.delete(projectId);
    });
    this.running.set(projectId, pass);
    return pass;
  }

  /** Cards for every piece in the catalog; a card whose piece left goes, unless the person edited or kept it back. */
  async reconcile(projectId: string): Promise<void> {
    if (this.closed || this.removed.has(projectId)) return;
    const store = this.options.store;
    const pieces = await this.options.catalog(projectId);
    if (this.closed || this.removed.has(projectId)) return;
    let unbound: UnboundRetentionClassifier | undefined;
    try { unbound = await this.options.prepareUnboundRetention?.(projectId); }
    catch { return; }
    if (this.closed || this.removed.has(projectId)) return;
    const cards = new Map(store.list(projectId).map(card => [keyOf(card.subject), card]));
    for (const candidate of pieces) {
      const observed = cards.get(keyOf(candidate.subject));
      cards.delete(keyOf(candidate.subject));
      await yieldToIO();
      if (this.closed || this.removed.has(projectId)) return;
      const card = store.get(projectId, candidate.subject) ?? undefined;
      if (!sameFields(observed, card)) continue;
      const target = card ?? candidate;
      let state: SearchRetentionResult;
      if (unbound && target.retention === undefined) state = this.unboundRetention(projectId, target, unbound);
      else {
        state = await this.retention(projectId, target);
        if (this.closed || this.removed.has(projectId)) return;
        if (!sameFields(card, store.get(projectId, candidate.subject) ?? undefined)) continue;
      }
      if (state.state !== "unsupported" && state.state !== "active") {
        if (state.state === "deleted") store.remove(projectId, candidate.subject);
        continue;
      }
      const piece = state.state === "active" && state.retained ? { ...candidate, restoration: state.retained } : candidate;
      const next = card ? cardSeen(card, piece) : cardFor(projectId, piece);
      if (!card || !sameFields(card, next)) store.put(next);
    }
    for (const observed of cards.values()) {
      await yieldToIO();
      if (this.closed || this.removed.has(projectId)) return;
      const card = store.get(projectId, observed.subject);
      if (!card || !sameFields(observed, card)) continue;
      let state: SearchRetentionResult;
      if (unbound && card.retention === undefined) state = this.unboundRetention(projectId, card, unbound);
      else {
        state = await this.retention(projectId, card);
        if (this.closed || this.removed.has(projectId)) return;
        if (!sameFields(card, store.get(projectId, card.subject))) continue;
      }
      if (state.state === "deleted") { store.remove(projectId, card.subject); continue; }
      if (state.state !== "unsupported") continue;
      if (card.edited.length || card.excluded) { if (card.state !== "missing") store.put({ ...card, state: "missing" }); }
      else store.remove(projectId, card.subject);
    }
  }

  /**
   * Named pieces are organized again from their text now. Without names, the ones that did not get done (failed, or stopped at
   * the day's allowance) wait again. `confirm` lets one more day's allowance be used today.
   */
  queue(projectId: string, subjects: readonly ActionSubject[] | undefined, confirm: boolean): number {
    if (this.closed || this.removed.has(projectId)) return 0;
    const store = this.options.store;
    if (confirm) { const limits = this.limits(); store.addUsage(projectId, this.day(), { extra_pieces: limits.pieces, extra_chars: limits.chars }); }
    const named = subjects?.length ? new Set(subjects.map(keyOf)) : null;
    let queued = 0;
    for (const card of store.list(projectId)) {
      if ((card.state === "listed" && !(named && card.can_organize)) || card.state === "missing" || card.excluded) continue;
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

  /** Whether there is a text model to organize with now. */
  modelReady(): boolean { return this.options.writer() !== null; }

  /** Stop this deleted project's queued and running work before its owner clears the records. */
  removeProject(projectId: string): void {
    this.removed.add(projectId);
    this.again.delete(projectId);
    this.controllers.get(projectId)?.abort();
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const controller of this.controllers.values()) controller.abort();
    await Promise.allSettled([...this.running.values()]);
  }

  private retention(projectId: string, piece: KnowledgePiece | KnowledgeCardRecord): Promise<SearchRetentionResult> {
    return this.options.retention?.({ project_id: projectId, provider_id: piece.provider_id, subject: piece.subject,
      ...(piece.retention ? { retention: piece.retention } : {}) }) ?? Promise.resolve({ state: piece.retention ? "unavailable" : "unsupported" });
  }

  private unboundRetention(projectId: string, piece: KnowledgePiece | KnowledgeCardRecord,
    classify: UnboundRetentionClassifier): SearchRetentionResult {
    try {
      const state = requireSynchronous(classify({ project_id: projectId, provider_id: piece.provider_id, subject: piece.subject }));
      return { state: state === "unsupported" ? "unsupported" : "unavailable" };
    } catch { return { state: "unavailable" }; }
  }

  private async organizePending(projectId: string, signal: AbortSignal): Promise<void> {
    const writer = this.options.writer();
    if (!writer) return;
    // A piece kept from agents waits: its text goes to no model until the person lets agents have it again.
    for (const queued of this.options.store.list(projectId).filter(card => card.state === "pending" && !card.excluded)) {
      if (signal.aborted) return;
      const piece = (await this.options.catalog(projectId)).find(item => keyOf(item.subject) === keyOf(queued.subject));
      if (signal.aborted) return;
      let waiting = this.options.store.get(projectId, queued.subject);
      if (!waiting || waiting.excluded || waiting.state !== "pending" || !piece || piece.revision !== waiting.revision || bare(piece)) continue;
      const state = await this.retention(projectId, waiting);
      if (state.state !== "active" && state.state !== "unsupported") continue;
      if (state.state === "active" && state.retained) {
        const reconciled = cardSeen(waiting, { ...piece, restoration: state.retained });
        if (!sameFields(waiting, reconciled)) this.options.store.put(reconciled);
        waiting = reconciled;
        if (waiting.state !== "pending") continue;
      }
      const authorized = await this.options.authorize?.(projectId, piece, waiting);
      if (this.options.authorize && !authorized) continue;
      const input = draftInput(piece);
      const quota = this.quota(projectId);
      if (quota.used_pieces + 1 > quota.limit_pieces || quota.used_chars + input.text.length > quota.limit_chars) {
        // Stop for the person: every card still waiting says so, and nothing more goes to the model today.
        for (const card of this.options.store.list(projectId)) if (card.state === "pending" && !card.excluded) this.options.store.put({ ...card, state: "over_quota" });
        return;
      }
      authorized?.assertCurrent();
      this.options.store.addUsage(projectId, this.day(), { pieces: 1, chars: input.text.length });
      const control = authorized ? { beforeDispatch: () => authorized.beforeDispatch(), afterResult: async () => {
        if (!await authorized.current()) throw new Error("资料的原授权或正文已经变化");
      } } : undefined;
      const outcome = await writer(input, signal, control).then(draft => ({ draft }), (error: unknown) => ({ error }));
      if (signal.aborted) return;
      // The piece may have changed, or the person queued it again, while the model wrote: then this draft is for nothing.
      if (authorized && !await authorized.current()) continue;
      const now = this.options.store.get(projectId, waiting.subject);
      if (!now || now.revision !== waiting.revision || now.state !== "pending" || now.excluded
        || !sameFields(now.edited, waiting.edited) || now.title !== waiting.title || now.brief !== waiting.brief
        || !sameFields(now.keywords, waiting.keywords) || !sameFields(now.retention, waiting.retention)) continue;
      this.options.store.put("draft" in outcome ? cardOrganized(now, input, outcome.draft, this.clock().toISOString())
        : { ...now, state: "failed", error: (outcome.error instanceof Error ? outcome.error.message : String(outcome.error)).slice(0, ERROR_CHARS) });
    }
  }

  private limits() { return this.options.quota ?? DEFAULT_KNOWLEDGE_QUOTA; }
  private clock(): Date { return this.options.clock?.() ?? new Date(); }
  /** The day the allowance counts, on this computer's calendar (the person's day, not UTC's). */
  private day(): string { const at = this.clock(); return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`; }
}
