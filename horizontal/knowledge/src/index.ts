import {
  ActionError,
  isSearchEntriesSource,
  isSubjectReader,
  resolveActionSubject,
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
  KNOWLEDGE_LIST_MAX,
  KNOWLEDGE_PROVIDER_ID,
  KNOWLEDGE_TEXT_MAX_CHARS,
  KNOWLEDGE_READ_DEFAULT_CHARS,
  KNOWLEDGE_READ_MAX_CHARS,
  knowledgeActions,
  type KnowledgeCard,
  type KnowledgeCardRecord,
  type KnowledgeCardStorePort,
  type KnowledgeGlobRequest,
  type KnowledgeGlobResponse,
  type KnowledgeGrepRequest,
  type KnowledgeGrepResponse,
  type KnowledgeListRequest,
  type KnowledgeListResponse,
  type KnowledgeOutline,
  type KnowledgeOutlineRequest,
  type KnowledgeReadRequest,
  type KnowledgeReadResponse,
  type KnowledgeSearchRequest,
  type KnowledgeSearchResponse,
} from "@molis-ai/molis-work-contracts/services/knowledge";
import { searchSourceKey, type SearchQueryRequest, type SearchQueryResponse } from "@molis-ai/molis-work-contracts/services/search";
import { WORKSPACE_FILE_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { knowledgeErrors } from "./errors.js";
import { afterLines, grepLines, lineAt, lineStarts, outlineOf, rangeOf } from "./text.js";
import { KnowledgeWorkspace } from "./workspace.js";
import { RoundBudget } from "./budget.js";

export { knowledgeErrors, type KnowledgeErrorCode } from "./errors.js";
export { grepLines, lineAt, lineStarts, outlineOf, rangeOf, PLAIN_SECTION_CHARS } from "./text.js";
export { KnowledgeOrganizer, knowledgeCatalog, DEFAULT_KNOWLEDGE_QUOTA, ORGANIZE_TEXT_CHARS, OUTLINE_MIN_CHARS, cardFor, cardOrganized, cardSeen, draftInput,
  type KnowledgeDraft, type KnowledgeDraftInput, type KnowledgeOrganizerOptions, type KnowledgePiece, type KnowledgeWriter } from "./organize.js";
export { KnowledgeCards } from "./manage.js";
export { pathPattern, nameMatches, type PathPattern } from "./glob.js";
export { RoundBudget } from "./budget.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-service-knowledge",
  packagePath: "horizontal/knowledge",
  kind: "horizontal",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/services/knowledge",
  migrationGoals: ["goal-reorg-f2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["knowledge.recall.v1"],
} as const;
export type MolisWorkPackageDescriptor = typeof packageDescriptor;

/**
 * One caller's way into its project: the client of that project and the caller's own trusted context. `beforeEffect` is the
 * handler's own check that the call is still current, run right before a receipt is written (a cancelled or revoked read leaves
 * none); without it receipts are written as the call returns.
 */
/**
 * Who asks (`caller`: the project, the round's fill, the receipt) and, when it differs, whose authority the sources are read
 * with (`reader`): a Plugin holding `knowledge:read` reads the project's knowledge as indexing does, with the project owner's.
 */
export interface KnowledgeAccess { client: ActionClient; caller: ActionCallContext; reader?: ActionCallContext; beforeEffect?: () => Promise<void> }
/** The authority sources are read and searched with. */
export const knowledgeReader = (access: KnowledgeAccess): ActionCallContext => access.reader ?? access.caller;
export interface KnowledgeServiceOptions {
  /** The system search, asked with the same access; it answers only from sources the caller may read. */
  search(access: KnowledgeAccess, input: SearchQueryRequest): Promise<SearchQueryResponse>;
  /** The cards organizing wrote and the person edited (spec §5), and the receipts of what was read. */
  cards: KnowledgeCardStorePort;
  budget?: RoundBudget;
  clock?: () => Date;
}

const DEFAULT_CARDS = 10;
const HINT_CHARS = 160;
const DEFAULT_GREP_LIMIT = 30;
const DEFAULT_LIST = 30;
const REASON_CHARS = 200;
const sameSubject = (a: ActionSubject, b: ActionSubject) => a.kind === b.kind && a.id === b.id;
const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, REASON_CHARS);

/**
 * Whether a caller may be shown a card, by the rule the system search applies to its index (system-search §5): the source
 * that lists the piece is in the caller's directory now, and when the card was written from the piece's text, the caller can
 * also read that kind from its owner.
 */
function visibility(views: readonly ActionView[], caller: KnowledgeAccess["caller"]): (card: KnowledgeCardRecord) => boolean {
  const listed = new Map<string, Set<string>>(), readable = new Map<string, Set<string>>();
  for (const view of views) {
    if (!view.availability.available) continue;
    if (isSearchEntriesSource(view.action) && view.action.search_source?.kinds.length) {
      const project_id = view.provider.project_id ?? (view.action.scope === "project" ? caller.project_id : null);
      listed.set(searchSourceKey({ project_id, provider_id: view.provider.provider_id, capability_id: view.capability_id, version: view.version }),
        new Set(view.action.search_source.kinds.map(entry => entry.kind)));
    }
    if (isSubjectReader(view.action)) {
      const kinds = readable.get(view.provider.provider_id) ?? new Set<string>();
      for (const kind of view.action.subject_kinds) kinds.add(kind);
      readable.set(view.provider.provider_id, kinds);
    }
  }
  return card => !!listed.get(card.source_key)?.has(card.subject.kind) && (card.content_policy === "summary" || !!readable.get(card.provider_id)?.has(card.subject.kind));
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
    for (const hit of found.hits) {
      if (hit.project_id !== project) continue;
      const stored = this.stored(project, hit.subject, hit.plugin_id);
      if (stored?.excluded) continue;
      cards.push({ subject: hit.subject, revision: hit.revision, title: stored?.title || hit.title, plugin_id: hit.plugin_id, plugin_title: hit.plugin_title,
        updated_at: hit.updated_at, matched: hit.locator.field, hint: hit.snippet.slice(0, HINT_CHARS), brief: stored?.brief || null, keywords: stored?.keywords ?? [], open: hit.open });
    }
    // What only a card's own words match (its brief, keywords, section notes), for a caller who may see the piece.
    const more = this.options.cards.search(project, input.query, limit * 2).map(match => this.options.cards.get(project, match.subject))
      .filter((card): card is KnowledgeCardRecord => !!card && !card.excluded && card.state !== "missing" && !cards.some(item => sameSubject(item.subject, card.subject))
        && (!input.kinds?.length || input.kinds.includes(card.subject.kind)) && (!input.plugins?.length || input.plugins.includes(card.plugin_id)));
    if (more.length && cards.length < limit) {
      const visible = visibility(await access.client.discover(knowledgeReader(access)), knowledgeReader(access));
      for (const card of more.filter(visible).slice(0, limit - cards.length)) {
        cards.push({ subject: card.subject, revision: card.revision, title: card.title, plugin_id: card.plugin_id, plugin_title: card.plugin_title, updated_at: card.updated_at,
          matched: "card", hint: card.brief.slice(0, HINT_CHARS), brief: card.brief || null, keywords: card.keywords, open: card.open });
      }
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
    const visible = visibility(await access.client.discover(knowledgeReader(access)), knowledgeReader(access));
    const seen = this.options.cards.list(project).filter(card => !card.excluded && card.state !== "missing" && visible(card));
    const sources = new Map<string, { plugin_id: string; plugin_title: string; count: number }>();
    for (const card of seen) {
      const source = sources.get(card.plugin_id) ?? { plugin_id: card.plugin_id, plugin_title: card.plugin_title, count: 0 };
      source.count += 1;
      sources.set(card.plugin_id, source);
    }
    const all = seen.filter(card => (!input.plugins?.length || input.plugins.includes(card.plugin_id)) && (!input.kinds?.length || input.kinds.includes(card.subject.kind)))
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
    const offset = input.offset ?? 0, limit = Math.min(KNOWLEDGE_LIST_MAX, input.limit ?? DEFAULT_LIST);
    return { total: all.length, sources: [...sources.values()], listing, pieces: all.slice(offset, offset + limit).map(card => ({ subject: card.subject, revision: card.revision,
      title: card.title, plugin_id: card.plugin_id, plugin_title: card.plugin_title, updated_at: card.updated_at, brief: card.brief || null, keywords: card.keywords,
      sections: card.organized_revision === card.revision ? card.outline.length : 0, open: card.open })) };
  }

  async outline(access: KnowledgeAccess, input: KnowledgeOutlineRequest): Promise<KnowledgeOutline> {
    const context = await this.owner(access, input.subject, knowledgeActions.outline);
    const card = this.stored(access.caller.project_id!, context.subject);
    // Section notes are for this very text only: a card organized from another revision says nothing about it.
    const notes = new Map(card?.organized_revision === context.revision ? card.outline.map(note => [note.anchor, note.summary]) : []);
    return { subject: context.subject, revision: context.revision, title: context.title, length: context.content.length, owner_truncated: context.truncated,
      sections: outlineOf(context.content).map(({ anchor, title, level, parent, start, line, length }) => ({ anchor, title, level, parent, start, line, length, summary: notes.get(anchor) ?? null })) };
  }

  async read(access: KnowledgeAccess, input: KnowledgeReadRequest): Promise<KnowledgeReadResponse> {
    if (input.line !== undefined && (input.anchor !== undefined || input.offset !== undefined)) throw knowledgeErrors.invalid("按行读（line）时不再给 anchor 或 offset");
    const context = await this.owner(access, input.subject, knowledgeActions.read);
    const lines = lineStarts(context.content);
    if (input.line !== undefined && input.line > lines.length) throw knowledgeErrors.invalid(`这份资料现在只有 ${lines.length} 行`, { line: input.line, total_lines: lines.length, revision: context.revision });
    const range = input.line !== undefined ? { start: lines[input.line - 1]!, end: context.content.length } : rangeOf(context.content, input.anchor);
    if (!range) throw knowledgeErrors.anchor_unknown("这份资料现在没有这个分节，先用 knowledge.outline 重新看它的结构", { anchor: input.anchor ?? null, revision: context.revision });
    const start = range.start + (input.offset ?? 0);
    if (start > range.end) throw knowledgeErrors.invalid("读取位置超出了这一段的长度", { offset: input.offset ?? 0, length: range.end - range.start });
    const round = access.caller.call_id, left = this.budget.left(round), asked = Math.min(KNOWLEDGE_READ_MAX_CHARS, input.max_chars ?? KNOWLEDGE_READ_DEFAULT_CHARS);
    const until = input.max_lines === undefined ? range.end : Math.min(range.end, afterLines(lines, start, input.max_lines, context.content.length));
    const end = Math.min(until, start + Math.min(asked, left ?? asked));
    const text = context.content.slice(start, end);
    await this.receipt(access, [{ context, via: "read", chars: text.length }]);
    this.budget.spend(round, text.length);
    const startLine = lineAt(lines, start);
    return { subject: context.subject, revision: context.revision, title: context.title, layer: "original", text, start, end,
      start_line: startLine, end_line: end > start ? lineAt(lines, end - 1) : startLine, total_lines: lines.length,
      remaining: until - end, owner_truncated: context.truncated, round_chars_left: left === null ? null : left - text.length };
  }

  async grep(access: KnowledgeAccess, input: KnowledgeGrepRequest): Promise<KnowledgeGrepResponse> {
    const project = this.project(access);
    const named = input.subjects ?? [];
    if (named.length > KNOWLEDGE_GREP_MAX_SUBJECTS) throw knowledgeErrors.invalid(`一次最多查 ${KNOWLEDGE_GREP_MAX_SUBJECTS} 份资料`);
    const patterns = [input.pattern, ...input.alternatives ?? []].map(pattern => pattern.trim()).filter(Boolean);
    if (!patterns.length || !input.pattern.trim()) throw knowledgeErrors.invalid("请给出要查找的文字");
    const catalog = !named.length && !input.glob, lines = input.output !== "subjects";
    const result: Omit<KnowledgeGrepResponse, "round_chars_left"> = { matches: [], found: [], searched: 0, catalog, more: false, unread: [] };
    const found = input.glob ? await this.workspace.glob(access, { pattern: input.glob, ...(input.workspace_id ? { workspace_id: input.workspace_id } : {}), limit: KNOWLEDGE_GREP_MAX_FILES }, knowledgeActions.grep, KNOWLEDGE_GREP_MAX_FILES) : null;
    if (found) {
      result.more = found.more;
      for (const folder of found.unread) result.unread.push({ subject: { kind: WORKSPACE_FILE_SUBJECT_KIND, id: `${folder.workspace_id}:${folder.path}` }, reason: folder.reason });
    }
    const picked = catalog ? await this.candidates(access, project, patterns) : null;
    result.more ||= !!picked?.more;
    const all = [...named, ...found?.files.map(file => file.subject) ?? [], ...picked?.subjects ?? []];
    const subjects = all.filter((subject, index) => all.findIndex(other => sameSubject(other, subject)) === index);
    const read = await Promise.all(subjects.map(subject => this.owner(access, subject, knowledgeActions.grep).then(context => ({ context }), (error: unknown) => ({ error }))));
    let left = input.limit ?? DEFAULT_GREP_LIMIT;
    // Lines found are original text: they count toward the round's fill, and the rest is left with `more`. Counts are not text.
    const round = access.caller.call_id, fill = lines ? this.budget.left(round) : null;
    let chars = 0;
    const given: Array<{ context: ActionSubjectContext; via: "grep"; chars: number }> = [];
    read.forEach((outcome, index) => {
      if ("error" in outcome) { result.unread.push({ subject: subjects[index]!, reason: reasonOf(outcome.error) }); return; }
      result.searched += 1;
      const { hits, more, count } = grepLines(outcome.context.content, patterns, input.context_lines ?? 1, lines ? Math.max(0, left) : 0);
      if (count) result.found.push({ subject: outcome.context.subject, revision: outcome.context.revision, title: outcome.context.title, lines: count });
      if (!lines) return;
      result.more ||= more;
      let taken = 0;
      for (const hit of hits) {
        const size = [hit.text, ...hit.before, ...hit.after].join("\n").length;
        if (fill !== null && chars + size > fill) { result.more = true; break; }
        chars += size; taken += size; left -= 1;
        result.matches.push({ subject: outcome.context.subject, revision: outcome.context.revision, ...hit });
      }
      given.push({ context: outcome.context, via: "grep", chars: taken });
    });
    result.found.sort((a, b) => b.lines - a.lines);
    await this.receipt(access, given);
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
    return { subjects, more };
  }

  /** Files in the project's linked folders by path pattern, read with the caller's own grant to the folders (K0b). */
  async glob(access: KnowledgeAccess, input: KnowledgeGlobRequest): Promise<KnowledgeGlobResponse> {
    this.project(access);
    return this.workspace.glob(access, input, knowledgeActions.glob);
  }

  /** Who got original text of which piece, written once the call is still current right before it (PMAT-12). */
  private async receipt(access: KnowledgeAccess, reads: Array<{ context: ActionSubjectContext; via: "read" | "grep"; chars: number }>): Promise<void> {
    const given = reads.filter(item => item.chars > 0);
    if (!given.length) return;
    await access.beforeEffect?.();
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

  /** The caller's own project; knowledge has no personal or cross-project scope. */
  private project(access: KnowledgeAccess): string {
    if (!access.caller.project_id) throw knowledgeErrors.scope("项目资料只能在项目里读取");
    return access.caller.project_id;
  }

  /**
   * The piece as its owner has it now for this caller; an owner's refusal keeps its own code. A reader that takes `offset` is
   * read page by page up to `KNOWLEDGE_TEXT_MAX_CHARS`, all pages from one revision; one that does not gives its first page.
   */
  private async owner(access: KnowledgeAccess, subject: ActionSubject, origin: { capability_id: string; version: number }): Promise<ActionSubjectContext> {
    const project = this.project(access);
    if (subject.kind === WORKSPACE_FILE_SUBJECT_KIND) return this.workspace.file(access, subject, origin);
    if (this.stored(project, subject)?.excluded) throw knowledgeErrors.excluded("这份资料被设为不给 Agent 用；要用它，请在项目资料里取消这个设置");
    const caller = retainActionAuthority(knowledgeReader(access), { capability_id: origin.capability_id, version: origin.version, provider_id: KNOWLEDGE_PROVIDER_ID });
    try {
      const { context, reader } = await resolveActionSubject(access.client, caller, subject);
      let content = context.content, page = context;
      while (page.truncated && page.length !== undefined && content.length < Math.min(page.length, KNOWLEDGE_TEXT_MAX_CHARS)) {
        page = await access.client.invoke(caller, reader, { subject_id: subject.id, offset: content.length }) as ActionSubjectContext;
        if (page.revision !== context.revision || page.offset !== content.length || !page.content) throw knowledgeErrors.unreadable("这份资料在读取时变了，请重试");
        content += page.content;
      }
      content = content.slice(0, KNOWLEDGE_TEXT_MAX_CHARS);
      return { ...context, content, truncated: content.length < (page.length ?? content.length) || (page.length === undefined && context.truncated) };
    } catch (error) {
      if (error instanceof ActionError) throw error;
      throw knowledgeErrors.unreadable(`这份资料现在读不到：${reasonOf(error)}`);
    }
  }
}
