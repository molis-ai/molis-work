import {
  ActionError,
  SUBJECT_RETENTION_REQUEST_TYPE,
  SUBJECT_RETENTION_TYPE,
  isSearchEntriesSource,
  isSubjectReader,
  retainActionAuthority,
  type ActionCallContext,
  type ActionClient,
  type ActionSubject,
  type ActionSubjectContext,
  type ActionView,
} from "@molis-ai/molis-work-contracts/platform/actions";
import {
  KNOWLEDGE_GREP_MAX_FILES,
  KNOWLEDGE_GREP_MAX_SUBJECTS,
  KNOWLEDGE_CATALOG_RELATED,
  KNOWLEDGE_CATALOG_WHOLE_PIECES,
  KNOWLEDGE_LIST_MAX,
  KNOWLEDGE_PROVIDER_ID,
  KNOWLEDGE_READ_DEFAULT_CHARS,
  KNOWLEDGE_READ_MAX_CHARS,
  knowledgeActions,
  knowledgeCatalogWhole,
  type KnowledgeCard,
  type KnowledgeCardRecord,
  type KnowledgeRetentionIdentity,
  type KnowledgeCardStorePort,
  type KnowledgeGlobRequest,
  type KnowledgeGlobResponse,
  type KnowledgeGrepRequest,
  type KnowledgeGrepResponse,
  type KnowledgeListEntry,
  type KnowledgeListRequest,
  type KnowledgeMatchLayer,
  type KnowledgeListResponse,
  type KnowledgeOutline,
  type KnowledgeOutlineRequest,
  type KnowledgeLocateRequest,
  type KnowledgeLocateResponse,
  type KnowledgePieceName,
  type KnowledgeReadRequest,
  type KnowledgeReadResponse,
  type KnowledgeSearchRequest,
  type KnowledgeSearchResponse,
} from "@molis-ai/molis-work-contracts/services/knowledge";
import { searchSourceKey, type SearchQueryRequest, type SearchQueryResponse, type SearchRetentionResult } from "@molis-ai/molis-work-contracts/services/search";
import { WORKSPACE_FILE_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { readKnowledgeSubject, type KnowledgeSourceRead } from "./source-read.js";
import { locateSections, type KnowledgeLocator } from "./locate.js";
import { knowledgeErrors } from "./errors.js";
import { afterLines, grepLines, lineAt, lineStarts, outlineOf, rangeOf } from "./text.js";
import { KnowledgeWorkspace } from "./workspace.js";
import { RoundBudget, roundOf } from "./budget.js";
import { RELATED_POOL, relatedCards, relatedFirst } from "./related.js";
import { knowledgeRef, namedSubject, namedSubjects } from "./refs.js";

export { knowledgeErrors, type KnowledgeErrorCode } from "./errors.js";
export { grepLines, lineAt, lineStarts, outlineOf, rangeOf, PLAIN_SECTION_CHARS } from "./text.js";
export { KnowledgeOrganizer, knowledgeCatalog, knowledgeCutPieces, DEFAULT_KNOWLEDGE_QUOTA, ORGANIZE_TEXT_CHARS, OUTLINE_MIN_CHARS, cardFor, cardOrganized, cardSeen, draftInput,
  type KnowledgeDraft, type KnowledgeDraftInput, type KnowledgeOrganizerOptions, type KnowledgePiece, type KnowledgeWriter, type KnowledgeWriterControl } from "./organize.js";
export { KnowledgeCards } from "./manage.js";
export { pathPattern, nameMatches, type PathPattern } from "./glob.js";
export { RoundBudget } from "./budget.js";
export { knowledgeRef, namedSubject, namedSubjects } from "./refs.js";
export { locateSections, type KnowledgeLocateDraft, type KnowledgeLocateDraftInput, type KnowledgeLocator } from "./locate.js";

/**
 * One caller's way into its project: the client of that project and the caller's own trusted context. `beforeEffect` is the
 * handler's own check that the call is still current, run right before a receipt is written (a cancelled or revoked read leaves
 * none); without it receipts are written as the call returns.
 */
/**
 * Who asks (`caller`: the project, the round's fill, the receipt), whose authority sources are read with when it differs
 * (`reader`: a Plugin holding `knowledge:read` reads the project's knowledge as indexing does, with the project owner's),
 * and whose authority workspace files are read with (`workspace`: always the caller, S-41).
 */
export interface KnowledgeAccess { client: ActionClient; caller: ActionCallContext; reader?: ActionCallContext; workspace?: ActionCallContext; beforeEffect?: () => Promise<void> }
/** The authority sources are read and searched with. */
export const knowledgeReader = (access: KnowledgeAccess): ActionCallContext => access.reader ?? access.caller;
export interface KnowledgeServiceOptions {
  /** The system search, asked with the same access; it answers only from sources the caller may read. */
  search(access: KnowledgeAccess, input: SearchQueryRequest): Promise<SearchQueryResponse>;
  /** The cards organizing wrote and the person edited (spec §5), and the receipts of what was read. */
  cards: KnowledgeCardStorePort;
  /** The Host reconciles cards before searching, so an unbound hit cannot outlive its indexed source binding. */
  requireCard?: boolean;
  retention?(access: KnowledgeAccess, identity: KnowledgeRetentionIdentity, views?: readonly ActionView[]): Promise<SearchRetentionResult>;
  /**
   * Pieces whose text the search index holds only the start of: a grep over the whole project reads them as well, since a word
   * past what the index holds would otherwise never make its piece a candidate (PMAT-32).
   */
  cut?(projectId: string): readonly ActionSubject[];
  /** The project's indexed pieces that hold some of the words of a question, best first (the loose ranking of §6.4). */
  related?(projectId: string, query: string, limit: number, snippets?: boolean): ReadonlyArray<ActionSubject & { snippet?: string }>;
  budget?: RoundBudget;
  clock?: () => Date;
}

/** An ephemeral guard for the actual cards placed in a model's input; never serialized as Knowledge data. */
export interface KnowledgeDispatchGuard { beforeDispatch?(views: readonly ActionView[]): Promise<void> }

const DEFAULT_CARDS = 10;
const HINT_CHARS = 160;
const DEFAULT_GREP_LIMIT = 30;
const DEFAULT_LIST = 30;
const REASON_CHARS = 200;
const sameSubject = (a: ActionSubject, b: ActionSubject) => a.kind === b.kind && a.id === b.id;
const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, REASON_CHARS);
/** How an owner refuses a subject it does not have: no reader for the kind, an id it cannot parse, or another object. */
const UNKNOWN_SUBJECT_CODES = new Set(["actions.subject_unavailable", "actions.input_invalid", "actions.subject_mismatch"]);
/** A card search found only by the card's own words, or only by some of the words: what organizing wrote stands in for the hit. */
const readingCard = (card: KnowledgeCardRecord): KnowledgeCardRecord => (card.adoption && card.state !== "ready" || card.retention?.restoration_operation_id && (card.state === "listed" || card.organized_revision === null))
  ? { ...card, brief: card.edited.includes("brief") ? card.brief : "", keywords: card.edited.includes("keywords") ? card.keywords : [], outline: [] } : card;
const cardHit = (original: KnowledgeCardRecord, matched: KnowledgeMatchLayer): KnowledgeCard => { const card = readingCard(original); return ({ subject: card.subject, ref: knowledgeRef(card.subject), revision: card.revision, title: card.title,
  plugin_id: card.plugin_id, plugin_title: card.plugin_title, updated_at: card.updated_at, matched, hint: card.brief.slice(0, HINT_CHARS), brief: card.brief || null, keywords: card.keywords, open: card.open }); };

/** A card as `list` shows it: no text, and section notes only when organized from this revision. */
const entryOf = (original: KnowledgeCardRecord): KnowledgeListEntry => { const card = readingCard(original); return ({ subject: card.subject, ref: knowledgeRef(card.subject), revision: card.revision, title: card.title, plugin_id: card.plugin_id,
  plugin_title: card.plugin_title, updated_at: card.updated_at, brief: card.brief || null, keywords: card.keywords, sections: card.organized_revision === card.revision ? card.outline.length : 0, open: card.open }); };

/**
 * Whether a caller may be shown a card, by the rule the system search applies to its index (system-search §5): the source
 * that lists the piece is in the caller's directory now, and when the card was written from the piece's text, the caller can
 * also read that kind from its owner.
 */
function visibility(views: readonly ActionView[], projectId: string | null): (card: KnowledgeCardRecord) => boolean {
  const listed = new Map<string, Set<string>>(), readable = new Map<string, Set<string>>();
  for (const view of views) {
    if (!view.availability.available) continue;
    if (isSearchEntriesSource(view.action) && view.action.search_source?.kinds.length) {
      const project_id = view.provider.project_id ?? (view.action.scope === "project" ? projectId : null);
      listed.set(searchSourceKey({ project_id, provider_id: view.provider.provider_id, capability_id: view.capability_id, version: view.version }),
        new Set(view.action.search_source.kinds.map(entry => entry.kind)));
    }
    if (isSubjectReader(view.action)) {
      const kinds = readable.get(view.provider.provider_id) ?? new Set<string>();
      for (const kind of view.action.subject_kinds) kinds.add(kind);
      readable.set(view.provider.provider_id, kinds);
    }
  }
  return card => (!card.adoption || views.some(view => view.provider.provider_id === card.provider_id && view.availability.available
    && view.provider.plugin_installation_generation === card.adoption!.generation)) && !views.some(view => view.provider.provider_id === card.provider_id
    && view.action.input_type === SUBJECT_RETENTION_REQUEST_TYPE && view.action.output_type === SUBJECT_RETENTION_TYPE
    && view.action.subject_kinds.includes(card.subject.kind) && (!card.retention?.generation || !view.availability.available
      || view.provider.plugin_installation_generation !== card.retention.generation))
    && !!listed.get(card.source_key)?.has(card.subject.kind) && (card.content_policy === "summary" || !!readable.get(card.provider_id)?.has(card.subject.kind));
}

/**
 * Project knowledge (specs/project-knowledge): finds pieces through the system search and reads them from their owners, always
 * with the caller's own authority. It keeps no content: a card is a pointer, and every read goes to the owner's subject reader.
 */
export class KnowledgeService {
  private readonly workspace = new KnowledgeWorkspace();
  private readonly budget: RoundBudget;

  constructor(private readonly options: KnowledgeServiceOptions) {
    this.budget = options.budget ?? new RoundBudget();
  }

  async search(access: KnowledgeAccess, input: KnowledgeSearchRequest): Promise<KnowledgeSearchResponse> {
    const project = this.project(access);
    const limit = Math.min(30, Math.max(1, input.limit ?? DEFAULT_CARDS));
    const found = await this.options.search(access, { query: input.query, scope: "project", limit,
      ...(input.kinds?.length ? { kinds: input.kinds } : {}), ...(input.plugins?.length ? { plugins: input.plugins } : {}) });
    const cards: KnowledgeCard[] = [];
    const originals = new Map<KnowledgeCard, KnowledgeCardRecord>();
    for (const hit of found.hits) {
      if (hit.project_id !== project) continue;
      const stored = this.stored(project, hit.subject, hit.plugin_id);
      if (stored?.excluded || this.options.requireCard && !stored || stored && (stored.provider_id !== hit.source.provider_id
        || stored.source_key !== searchSourceKey({ project_id: project, ...hit.source }))) continue;
      const summary = stored && readingCard(stored);
      const card: KnowledgeCard = { subject: hit.subject, ref: knowledgeRef(hit.subject), revision: stored?.revision ?? hit.revision, title: stored?.title || hit.title, plugin_id: hit.plugin_id, plugin_title: hit.plugin_title,
        updated_at: hit.updated_at, matched: hit.locator.field, hint: hit.snippet.slice(0, HINT_CHARS), brief: summary?.brief || null, keywords: summary?.keywords ?? [], open: hit.open };
      cards.push(card);
      if (stored) originals.set(card, stored);
    }
    // What only a card's own words match (its brief, keywords, section notes), for a caller who may see the piece.
    const more = this.options.cards.search(project, input.query, limit * 2).map(match => this.options.cards.get(project, match.subject))
      .filter((card): card is KnowledgeCardRecord => !!card && !card.excluded && card.state !== "missing" && !cards.some(item => sameSubject(item.subject, card.subject))
        && (!input.kinds?.length || input.kinds.includes(card.subject.kind)) && (!input.plugins?.length || input.plugins.includes(card.plugin_id)));
    const visible = await this.visible(access);
    for (let i = cards.length - 1; i >= 0; i--) {
      const original = originals.get(cards[i]!);
      if (original ? !visible(original) : this.options.requireCard) cards.splice(i, 1);
    }
    if (cards.length >= limit) return { status: found.status, cards };
    for (const card of more.filter(visible).slice(0, limit - cards.length)) cards.push(cardHit(card, "card"));
    // Too few hold every word (a whole question rarely does): those that hold some of them, marked so (§6.4).
    const shown = this.listed(project, visible).filter(card => !cards.some(item => sameSubject(item.subject, card.subject))
      && (!input.kinds?.length || input.kinds.includes(card.subject.kind)) && (!input.plugins?.length || input.plugins.includes(card.plugin_id)));
    // An agent is shown each one's brief, so what it quotes it reads first (§5); the person sees where most of the words meet in
    // its text, when the index has that text, to tell which piece to open.
    const person = access.caller.audience === "user", ranked = this.options.related?.(project, input.query, RELATED_POOL, person) ?? [];
    const near = new Map(ranked.map(item => [`${item.kind}\u0000${item.id}`, item.snippet ?? ""]));
    for (const card of relatedCards(shown, [ranked, this.options.cards.related(project, input.query, RELATED_POOL)]).slice(0, limit - cards.length)) {
      const hit = cardHit(card, "related"), snippet = near.get(`${card.subject.kind}\u0000${card.subject.id}`);
      cards.push(snippet ? { ...hit, hint: snippet.slice(0, HINT_CHARS) } : hit);
    }
    return { status: found.status, cards };
  }

  /**
   * Brings this project's sources in the search index current, the way a search does (a search is the only door into the
   * index's catch-up, and SearchService may not grow). The management page and the side panel ask it before listing cards, so a
   * project nobody has searched yet still shows its pieces. The word asked is not used: only the catch-up matters.
   */
  async catchUp(access: KnowledgeAccess): Promise<{ listing: boolean }> {
    this.project(access);
    const found = await this.options.search(access, { query: "资料", scope: "project", limit: 1 });
    // The search waits only so long; a source it has not listed yet is still being listed, and its pieces come after.
    return { listing: found.sources.some(source => source.state === "indexing") };
  }

  /**
   * What the project holds, newest first, as cards the caller may see (the rule search applies); pieces kept from agents are not
   * listed. The way an agent looks around before it searches, as `ls` is before `grep`. No original text, so no receipts.
   */
  async list(access: KnowledgeAccess, input: KnowledgeListRequest, listing = false): Promise<KnowledgeListResponse> {
    const project = this.project(access);
    const seen = this.listed(project, await this.visible(access));
    const sources = new Map<string, { plugin_id: string; plugin_title: string; count: number }>();
    for (const card of seen) {
      const source = sources.get(card.plugin_id) ?? { plugin_id: card.plugin_id, plugin_title: card.plugin_title, count: 0 };
      source.count += 1;
      sources.set(card.plugin_id, source);
    }
    const kept = seen.filter(card => (!input.plugins?.length || input.plugins.includes(card.plugin_id)) && (!input.kinds?.length || input.kinds.includes(card.subject.kind)));
    const all = relatedFirst(kept, input.related_to ? this.related(project, kept, input.related_to) : []);
    const offset = input.offset ?? 0, limit = Math.min(KNOWLEDGE_LIST_MAX, input.limit ?? DEFAULT_LIST);
    return { total: all.length, sources: [...sources.values()], listing, pieces: all.slice(offset, offset + limit).map(entryOf) };
  }

  /**
   * A round's catalog of the project's knowledge for a caller whose directory is `views` (§6.4): the whole of it when it is small,
   * otherwise the pieces most related to the round's words. Cards only; `total` says how many there are in all.
   */
  async catalog(projectId: string, views: readonly ActionView[], words: string, access?: KnowledgeAccess): Promise<{ total: number; whole: boolean; pieces: KnowledgeListEntry[] } & KnowledgeDispatchGuard> {
    const shown = this.listed(projectId, access ? await this.visible(access, views) : card => !card.retention && visibility(views, projectId)(card));
    const newest = relatedFirst(shown, []).slice(0, KNOWLEDGE_CATALOG_WHOLE_PIECES).map(entryOf);
    if (knowledgeCatalogWhole({ pieces: newest, total: shown.length })) return { total: shown.length, whole: true, pieces: newest, ...this.dispatchGuard(projectId, shown, access) };
    const picked = relatedFirst(shown, this.related(projectId, shown, words)).slice(0, KNOWLEDGE_CATALOG_RELATED);
    return { total: shown.length, whole: false, pieces: picked.map(entryOf), ...this.dispatchGuard(projectId, picked, access) };
  }

  /**
   * How many pieces `list` would show a caller whose directory is `views`, by source: a round starts knowing there is something
   * here to look in (PMAT-33). Counts only, no titles or text.
   */
  async tally(projectId: string, views: readonly ActionView[], access?: KnowledgeAccess): Promise<{ total: number; sources: Array<{ plugin_title: string; count: number }> } & KnowledgeDispatchGuard> {
    const counts = new Map<string, number>();
    const shown = this.listed(projectId, access ? await this.visible(access, views) : card => !card.retention && visibility(views, projectId)(card));
    for (const card of shown) counts.set(card.plugin_title, (counts.get(card.plugin_title) ?? 0) + 1);
    return { total: [...counts.values()].reduce((sum, count) => sum + count, 0), sources: [...counts].map(([plugin_title, count]) => ({ plugin_title, count })), ...this.dispatchGuard(projectId, shown, access) };
  }

  async outline(access: KnowledgeAccess, input: KnowledgeOutlineRequest): Promise<KnowledgeOutline> {
    return (await this.preparedOutline(access, input)).tree;
  }

  async locate(access: KnowledgeAccess, input: KnowledgeLocateRequest, locator: KnowledgeLocator | null): Promise<KnowledgeLocateResponse> {
    return locateSections({ question: input.question, subjects: this.named(access, input.subjects) },
      subject => this.preparedOutline(access, { subject }, knowledgeActions.locate), locator, access.beforeEffect, access.caller.signal);
  }

  private async preparedOutline(access: KnowledgeAccess, input: KnowledgeOutlineRequest, origin: { capability_id: string; version: number } = knowledgeActions.outline) {
    const read = await this.owner(access, namedSubject(this.options.cards, this.project(access), input.subject), origin);
    const { context } = read;
    const card = this.stored(access.caller.project_id!, context.subject);
    // Section notes are for this very text only: a card organized from another revision says nothing about it.
    const notes = new Map(card?.organized_revision === context.revision ? readingCard(card).outline.map(note => [note.anchor, note.summary]) : []);
    const tree: KnowledgeOutline = { subject: context.subject, revision: context.revision, title: context.title, length: context.content.length, owner_truncated: context.truncated,
      sections: outlineOf(context.content).map(({ anchor, title, level, parent, start, line, length }) => ({ anchor, title, level, parent, start, line, length, summary: notes.get(anchor) ?? null })) };
    await read.assertCurrent();
    return { tree, assertCurrent: read.assertCurrent };
  }

  async read(access: KnowledgeAccess, input: KnowledgeReadRequest): Promise<KnowledgeReadResponse> {
    if (input.line !== undefined && (input.anchor !== undefined || input.offset !== undefined)) throw knowledgeErrors.invalid("按行读（line）时不再给 anchor 或 offset");
    const read = await this.owner(access, namedSubject(this.options.cards, this.project(access), input.subject), knowledgeActions.read);
    const { context } = read;
    const lines = lineStarts(context.content);
    if (input.line !== undefined && input.line > lines.length) throw knowledgeErrors.invalid(`这份资料现在只有 ${lines.length} 行`, { line: input.line, total_lines: lines.length, revision: context.revision });
    const range = input.line !== undefined ? { start: lines[input.line - 1]!, end: context.content.length } : rangeOf(context.content, input.anchor);
    if (!range) throw knowledgeErrors.anchor_unknown("这份资料现在没有这个分节，先用 knowledge.outline 重新看它的结构", { anchor: input.anchor ?? null, revision: context.revision });
    const start = range.start + (input.offset ?? 0);
    if (start > range.end) throw knowledgeErrors.invalid("读取位置超出了这一段的长度", { offset: input.offset ?? 0, length: range.end - range.start });
    await access.beforeEffect?.();
    await read.assertCurrent();
    const round = roundOf(access.caller), left = this.budget.left(round), asked = Math.min(KNOWLEDGE_READ_MAX_CHARS, input.max_chars ?? KNOWLEDGE_READ_DEFAULT_CHARS);
    const until = input.max_lines === undefined ? range.end : Math.min(range.end, afterLines(lines, start, input.max_lines, context.content.length));
    const end = Math.min(until, start + Math.min(asked, left ?? asked));
    const text = context.content.slice(start, end);
    this.receipt(access, [{ context, via: "read", chars: text.length }]);
    this.budget.spend(round, text.length);
    const startLine = lineAt(lines, start);
    return { subject: context.subject, ref: knowledgeRef(context.subject, "allow"), revision: context.revision, title: context.title, layer: "original", text, start, end,
      start_line: startLine, end_line: end > start ? lineAt(lines, end - 1) : startLine, total_lines: lines.length,
      remaining: until - end, owner_truncated: context.truncated, round_chars_left: left === null ? null : left - text.length };
  }

  async grep(access: KnowledgeAccess, input: KnowledgeGrepRequest, prepareReferences?: (subjects: readonly ActionSubject[]) => Promise<void>): Promise<KnowledgeGrepResponse> {
    const project = this.project(access);
    const named = namedSubjects(this.options.cards, project, input.subjects);
    if (named.length > KNOWLEDGE_GREP_MAX_SUBJECTS) throw knowledgeErrors.invalid(`一次最多查 ${KNOWLEDGE_GREP_MAX_SUBJECTS} 份资料`);
    const patterns = [input.pattern, ...input.alternatives ?? []].map(pattern => pattern.trim()).filter(Boolean);
    if (!patterns.length || !input.pattern.trim()) throw knowledgeErrors.invalid("请给出要查找的文字");
    const catalog = !named.length && !input.glob, lines = input.output !== "subjects", single = named.length === 1 && !input.glob;
    if (input.from_line !== undefined && !single) throw knowledgeErrors.invalid("from_line 只用于 subjects 只点名一份资料、不带 glob 时（照抄上次给的 next_line）");
    const result: Omit<KnowledgeGrepResponse, "round_chars_left"> = { matches: [], found: [], searched: 0, catalog, more: false, next_line: null, unread: [] };
    const found = input.glob ? await this.workspace.glob(access, { pattern: input.glob, ...(input.workspace_id ? { workspace_id: input.workspace_id } : {}), limit: KNOWLEDGE_GREP_MAX_FILES }, knowledgeActions.grep, KNOWLEDGE_GREP_MAX_FILES) : null;
    if (found) {
      result.more = found.more;
      for (const folder of found.unread) result.unread.push({ subject: { kind: WORKSPACE_FILE_SUBJECT_KIND, id: `${folder.workspace_id}:${folder.path}` }, reason: folder.reason });
    }
    const picked = catalog ? await this.candidates(access, project, patterns) : null;
    result.more ||= !!picked?.more;
    const all = [...named, ...found?.files.map(file => file.subject) ?? [], ...picked?.subjects ?? []];
    const subjects = all.filter((subject, index) => all.findIndex(other => sameSubject(other, subject)) === index);
    const read = await Promise.all(subjects.map(subject => this.owner(access, subject, knowledgeActions.grep).then(read => read, (error: unknown) => ({ error }))));
    let left = input.limit ?? DEFAULT_GREP_LIMIT;
    // Reference bookkeeping completes inside this read, before its original authority is checked and receipts are written.
    await prepareReferences?.(read.flatMap(outcome => "context" in outcome ? [outcome.context.subject] : []));
    // Lines found are original text: they count toward the round's fill, and the rest is left with `more`. Counts are not text.
    await access.beforeEffect?.();
    for (let index = 0; index < read.length; index++) {
      const outcome = read[index]!;
      if ("context" in outcome) try { await outcome.assertCurrent(); }
      catch (error) { read[index] = { error }; }
    }
    const round = roundOf(access.caller), fill = lines ? this.budget.left(round) : null;
    let chars = 0;
    const given: Array<{ context: ActionSubjectContext; via: "grep"; chars: number }> = [];
    read.forEach((outcome, index) => {
      if ("error" in outcome) { result.unread.push({ subject: subjects[index]!, reason: reasonOf(outcome.error) }); return; }
      result.searched += 1;
      const { hits, more, count } = grepLines(outcome.context.content, patterns, input.context_lines ?? 1, lines ? Math.max(0, left) : 0, input.from_line);
      if (count) result.found.push({ subject: outcome.context.subject, ref: knowledgeRef(outcome.context.subject, "allow"), revision: outcome.context.revision, title: outcome.context.title, lines: count });
      if (!lines) return;
      result.more ||= more;
      let taken = 0;
      for (const hit of hits) {
        const size = [hit.text, ...hit.before, ...hit.after].join("\n").length;
        if (fill !== null && chars + size > fill) { result.more = true; result.next_line = single ? hit.line : null; break; }
        chars += size; taken += size; left -= 1;
        result.matches.push({ subject: outcome.context.subject, ref: knowledgeRef(outcome.context.subject, "allow"), revision: outcome.context.revision, ...hit });
      }
      if (single && more && result.next_line === null) result.next_line = (hits.at(-1)?.line ?? (input.from_line ?? 1) - 1) + 1;
      given.push({ context: outcome.context, via: "grep", chars: taken });
    });
    result.found.sort((a, b) => b.lines - a.lines);
    this.receipt(access, given);
    this.budget.spend(round, chars);
    const roundLeft = lines ? fill : this.budget.left(round);
    return { ...result, round_chars_left: roundLeft === null ? null : roundLeft - chars };
  }

  /**
   * The pieces a grep over the whole project reads: those whose indexed text the system search finds for any of the wordings,
   * in its order, up to what one grep reads. Pieces kept from agents are left out rather than reported unreadable.
   */
  private async candidates(access: KnowledgeAccess, project: string, patterns: readonly string[]): Promise<{ subjects: ActionSubject[]; more: boolean }> {
    const subjects: ActionSubject[] = [];
    let more = false;
    for (const query of patterns) {
      const found = await this.options.search(access, { query, scope: "project", limit: KNOWLEDGE_GREP_MAX_SUBJECTS });
      for (const hit of found.hits) {
        if (hit.project_id !== project || this.stored(project, hit.subject, hit.plugin_id)?.excluded || subjects.some(subject => sameSubject(subject, hit.subject))) continue;
        if (subjects.length === KNOWLEDGE_GREP_MAX_SUBJECTS) { more = true; break; }
        subjects.push(hit.subject);
      }
      more ||= found.hits.length === KNOWLEDGE_GREP_MAX_SUBJECTS;
    }
    const cut = (this.options.cut?.(project) ?? []).filter(subject => !subjects.some(other => sameSubject(other, subject)));
    if (cut.length) {
      const visible = await this.visible(access);
      for (const card of this.listed(project, visible).filter(card => cut.some(subject => sameSubject(subject, card.subject)))) {
        if (subjects.length === KNOWLEDGE_GREP_MAX_SUBJECTS) { more = true; break; }
        subjects.push(card.subject);
      }
    }
    return { subjects, more };
  }

  /** Files in the project's linked folders by path pattern, read with the caller's own grant to the folders (K0b). */
  async glob(access: KnowledgeAccess, input: KnowledgeGlobRequest): Promise<KnowledgeGlobResponse> {
    this.project(access);
    return this.workspace.glob(access, input, knowledgeActions.glob);
  }

  /** Who got original text of which piece, written once the call is still current right before it (PMAT-12). */
  private receipt(access: KnowledgeAccess, reads: Array<{ context: ActionSubjectContext; via: "read" | "grep"; chars: number }>): void {
    const given = reads.filter(item => item.chars > 0);
    const { caller } = access, at = (this.options.clock?.() ?? new Date()).toISOString();
    for (const { context, via, chars } of given) {
      this.options.cards.addReceipt({ project_id: caller.project_id!, at, subject: context.subject, revision: context.revision, via, chars, actor_id: caller.actor_id,
        agent: caller.audit_actor_id ?? null, audience: caller.audience, call_id: caller.call_id ?? null, runtime_session_id: caller.runtime_session_id ?? null });
    }
  }

  /** The piece's card, when there is one for that owner. */
  private stored(project: string, subject: ActionSubject, pluginId?: string): KnowledgeCardRecord | null {
    const card = this.options.cards.get(project, subject);
    return card && (pluginId === undefined || card.plugin_id === pluginId) ? card : null;
  }

  /** The rule a caller may be shown a card by, from the directory of the authority it reads with. */
  async visible(access: KnowledgeAccess, original?: readonly ActionView[]): Promise<(card: KnowledgeCardRecord) => boolean> {
    const reader = knowledgeReader(access), views = await access.client.discover(reader);
    const allowed = visibility(views, reader.project_id ?? null);
    const before = original ? visibility(original, reader.project_id ?? null) : allowed;
    const shown = new Set<string>();
    for (const card of this.options.cards.list(this.project(access))) {
      if (!allowed(card) || !before(card)) continue;
      const state = await this.retention(access, card, views);
      if (state.state === "active" || state.state === "unsupported") shown.add(JSON.stringify(card));
      if (state.state === "deleted" && JSON.stringify(this.options.cards.get(card.project_id, card.subject)) === JSON.stringify(card))
        this.options.cards.remove(card.project_id, card.subject);
    }
    reader.signal?.throwIfAborted();
    reader.assert_authority_current?.();
    return card => shown.has(JSON.stringify(card))
      && JSON.stringify(this.options.cards.get(card.project_id, card.subject)) === JSON.stringify(card);
  }

  private async retention(access: KnowledgeAccess, card: KnowledgeRetentionIdentity, views?: readonly ActionView[]): Promise<SearchRetentionResult> {
    if (this.options.retention) return this.options.retention(access, { project_id: card.project_id, provider_id: card.provider_id, subject: card.subject,
      ...(card.retention ? { retention: card.retention } : {}), ...(card.adoption ? { adoption: card.adoption } : {}) }, views);
    const directory = views ?? await access.client.discover(knowledgeReader(access));
    const declared = directory.some(view => view.provider.provider_id === card.provider_id && view.action.input_type === SUBJECT_RETENTION_REQUEST_TYPE
      && view.action.output_type === SUBJECT_RETENTION_TYPE && view.action.subject_kinds.includes(card.subject.kind));
    return { state: card.retention || card.adoption || declared ? "unavailable" : "unsupported" };
  }

  /** The pieces a call names by subject or ref, in the caller's own project (none: refused before anything is read). */
  named(access: KnowledgeAccess, names: readonly KnowledgePieceName[]): ActionSubject[] {
    return namedSubjects(this.options.cards, this.project(access), names);
  }

  private dispatchGuard(project: string, cards: readonly KnowledgeCardRecord[], access?: KnowledgeAccess): KnowledgeDispatchGuard {
    if (!access || !cards.length) return {};
    const original = cards.map(card => ({ card, text: JSON.stringify(entryOf(card)) }));
    return { beforeDispatch: async views => {
      if (!views.some(view => view.availability.available && view.provider.provider_id === KNOWLEDGE_PROVIDER_ID
        && view.capability_id === knowledgeActions.list.capability_id)) throw knowledgeErrors.unreadable("本轮的资料目录权限已收回");
      const allowed = visibility(views, project);
      for (const { card, text } of original) {
        const current = this.options.cards.get(project, card.subject);
        if (!current || current.excluded || !allowed(current) || current.provider_id !== card.provider_id || current.source_key !== card.source_key
          || current.retention?.generation !== card.retention?.generation || JSON.stringify(entryOf(current)) !== text)
          throw knowledgeErrors.unreadable("本轮带入的资料已经变化，未发给模型");
        const state = await this.retention(access, card);
        if (state.state !== "active" && state.state !== "unsupported") throw knowledgeErrors.unreadable("本轮带入的资料已归档或当前不可读取");
      }
      knowledgeReader(access).signal?.throwIfAborted();
      knowledgeReader(access).assert_authority_current?.();
    } };
  }

  /** Those of `shown` that hold some of the words, by the indexed text and the cards' own words together. */
  private related(project: string, shown: readonly KnowledgeCardRecord[], words: string): KnowledgeCardRecord[] {
    return relatedCards(shown, [this.options.related?.(project, words, RELATED_POOL) ?? [], this.options.cards.related(project, words, RELATED_POOL)]);
  }

  /** The project's pieces as `list` shows them: not kept from agents, still in the catalog, and visible to the caller. */
  private listed(project: string, visible: (card: KnowledgeCardRecord) => boolean): KnowledgeCardRecord[] {
    return this.options.cards.list(project).filter(card => !card.excluded && card.state !== "missing" && visible(card));
  }

  /** The caller's own project; knowledge has no personal or cross-project scope. */
  private project(access: KnowledgeAccess): string {
    if (!access.caller.project_id) throw knowledgeErrors.scope("项目资料只能在项目里读取");
    return access.caller.project_id;
  }

  /** Whether a reader of this kind is offered to the caller, so a refusal is about the id and not about the kind. */
  private async readable(caller: ActionCallContext, access: KnowledgeAccess, subject: ActionSubject): Promise<boolean> {
    let views: readonly ActionView[];
    try { views = await access.client.discover(caller); } catch { return false; }
    return views.some(view => isSubjectReader(view.action) && view.action.subject_kinds.includes(subject.kind) && view.availability.available);
  }

  /**
   * The piece as its owner has it now for this caller; an owner's refusal keeps its own code. A reader that takes `offset` is
   * read page by page up to `KNOWLEDGE_TEXT_MAX_CHARS`, all pages from one revision; one that does not gives its first page.
   */
  private async owner(access: KnowledgeAccess, subject: ActionSubject, origin: { capability_id: string; version: number }): Promise<KnowledgeSourceRead> {
    const project = this.project(access);
    if (subject.kind === WORKSPACE_FILE_SUBJECT_KIND) {
      const context = await this.workspace.file(access, subject, origin);
      return { context, assertCurrent: async () => {
        const current = await this.workspace.file(access, subject, origin);
        if (current.revision !== context.revision) throw knowledgeErrors.unreadable("文件已经变化，请重新读取");
      } };
    }
    const known = this.stored(project, subject);
    if (known?.excluded) throw knowledgeErrors.excluded("这份资料被设为不给 Agent 用；要用它，请在项目资料里取消这个设置");
    const caller = retainActionAuthority(knowledgeReader(access), { capability_id: origin.capability_id, version: origin.version, provider_id: KNOWLEDGE_PROVIDER_ID });
    try {
      if (known) {
        const state = await this.retention(access, known);
        if (state.state === "deleted" && JSON.stringify(this.stored(project, subject)) === JSON.stringify(known)) this.options.cards.remove(project, known.subject);
        if (state.state !== "active" && state.state !== "unsupported") throw knowledgeErrors.unreadable("这份资料已归档或当前不可读取");
      }
      return await readKnowledgeSubject({ client: access.client, caller, project, subject, known, currentCard: () => this.stored(project, subject),
        retention: (identity, views) => this.retention(access, identity, views) });
    } catch (error) {
      // A subject no card knows, of a kind this caller may read, that its owner does not take is not a piece here: most often
      // one written differently from how it was given. Said as that, so the caller does not take the owner's refusal of the id
      // for a fault in its other arguments. A kind the caller may not read keeps the directory's own refusal (S-41).
      if (!known && error instanceof ActionError && UNKNOWN_SUBJECT_CODES.has(error.code) && await this.readable(caller, access, subject)) {
        throw knowledgeErrors.unknown(`项目资料里没有这一份。subject 最好直接写 ref（目录、knowledge.list、search、grep 给的 k 开头的编号）；写对象就要原样照抄那里给的：kind 与整串 id 不改写、不截取（这次收到 kind ${JSON.stringify(subject.kind.slice(0, 40))}，id ${JSON.stringify(subject.id.slice(0, 80))}）`);
      }
      if (error instanceof ActionError) throw error;
      throw knowledgeErrors.unreadable(`这份资料现在读不到：${reasonOf(error)}`);
    }
  }
}
