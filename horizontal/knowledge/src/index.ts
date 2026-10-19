import {
  ActionError,
  resolveActionSubject,
  retainActionAuthority,
  type ActionCallContext,
  type ActionClient,
  type ActionSubject,
  type ActionSubjectContext,
} from "@molis-ai/molis-work-contracts/platform/actions";
import {
  KNOWLEDGE_GREP_MAX_SUBJECTS,
  KNOWLEDGE_PROVIDER_ID,
  KNOWLEDGE_READ_DEFAULT_CHARS,
  KNOWLEDGE_READ_MAX_CHARS,
  knowledgeActions,
  type KnowledgeCard,
  type KnowledgeGrepRequest,
  type KnowledgeGrepResponse,
  type KnowledgeOutline,
  type KnowledgeOutlineRequest,
  type KnowledgeReadRequest,
  type KnowledgeReadResponse,
  type KnowledgeSearchRequest,
  type KnowledgeSearchResponse,
} from "@molis-ai/molis-work-contracts/services/knowledge";
import type { SearchQueryRequest, SearchQueryResponse } from "@molis-ai/molis-work-contracts/services/search";
import { knowledgeErrors } from "./errors.js";
import { grepLines, outlineOf, rangeOf } from "./text.js";

export { knowledgeErrors, type KnowledgeErrorCode } from "./errors.js";
export { grepLines, outlineOf, rangeOf, PLAIN_SECTION_CHARS } from "./text.js";

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

/** One caller's way into its project: the client of that project and the caller's own trusted context. */
export interface KnowledgeAccess { client: ActionClient; caller: ActionCallContext }
export interface KnowledgeServiceOptions {
  /** The system search, asked with the same access; it answers only from sources the caller may read. */
  search(access: KnowledgeAccess, input: SearchQueryRequest): Promise<SearchQueryResponse>;
}

const DEFAULT_CARDS = 10;
const HINT_CHARS = 160;
const DEFAULT_GREP_LIMIT = 30;
const REASON_CHARS = 200;
const sameSubject = (a: ActionSubject, b: ActionSubject) => a.kind === b.kind && a.id === b.id;
const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, REASON_CHARS);

/**
 * Project knowledge (specs/project-knowledge): finds pieces through the system search and reads them from their owners, always
 * with the caller's own authority. It keeps no content: a card is a pointer, and every read goes to the owner's subject reader.
 */
export class KnowledgeService {
  constructor(private readonly options: KnowledgeServiceOptions) {}

  async search(access: KnowledgeAccess, input: KnowledgeSearchRequest): Promise<KnowledgeSearchResponse> {
    const project = this.project(access);
    const limit = Math.min(30, Math.max(1, input.limit ?? DEFAULT_CARDS));
    const found = await this.options.search(access, { query: input.query, scope: "project", limit,
      ...(input.kinds?.length ? { kinds: input.kinds } : {}), ...(input.plugins?.length ? { plugins: input.plugins } : {}) });
    const cards: KnowledgeCard[] = found.hits.filter(hit => hit.project_id === project).map(hit => ({ subject: hit.subject, revision: hit.revision, title: hit.title,
      plugin_id: hit.plugin_id, plugin_title: hit.plugin_title, updated_at: hit.updated_at, matched: hit.locator.field, hint: hit.snippet.slice(0, HINT_CHARS), open: hit.open }));
    return { status: found.status, cards };
  }

  async outline(access: KnowledgeAccess, input: KnowledgeOutlineRequest): Promise<KnowledgeOutline> {
    const context = await this.owner(access, input.subject, knowledgeActions.outline);
    return { subject: context.subject, revision: context.revision, title: context.title, length: context.content.length, owner_truncated: context.truncated,
      sections: outlineOf(context.content) };
  }

  async read(access: KnowledgeAccess, input: KnowledgeReadRequest): Promise<KnowledgeReadResponse> {
    const context = await this.owner(access, input.subject, knowledgeActions.read);
    const range = rangeOf(context.content, input.anchor);
    if (!range) throw knowledgeErrors.anchor_unknown("这份资料现在没有这个分节，先用 knowledge.outline 重新看它的结构", { anchor: input.anchor ?? null, revision: context.revision });
    const start = range.start + (input.offset ?? 0);
    if (start > range.end) throw knowledgeErrors.invalid("读取位置超出了这一段的长度", { offset: input.offset ?? 0, length: range.end - range.start });
    const end = Math.min(range.end, start + Math.min(KNOWLEDGE_READ_MAX_CHARS, input.max_chars ?? KNOWLEDGE_READ_DEFAULT_CHARS));
    return { subject: context.subject, revision: context.revision, title: context.title, layer: "original", text: context.content.slice(start, end),
      start, end, remaining: range.end - end, owner_truncated: context.truncated };
  }

  async grep(access: KnowledgeAccess, input: KnowledgeGrepRequest): Promise<KnowledgeGrepResponse> {
    this.project(access);
    const subjects = input.subjects.filter((subject, index) => input.subjects.findIndex(other => sameSubject(other, subject)) === index);
    if (subjects.length > KNOWLEDGE_GREP_MAX_SUBJECTS) throw knowledgeErrors.invalid(`一次最多查 ${KNOWLEDGE_GREP_MAX_SUBJECTS} 份资料`);
    const pattern = input.pattern.trim();
    if (!pattern) throw knowledgeErrors.invalid("请给出要查找的文字");
    const read = await Promise.all(subjects.map(subject => this.owner(access, subject, knowledgeActions.grep).then(context => ({ context }), (error: unknown) => ({ error }))));
    const result: KnowledgeGrepResponse = { matches: [], more: false, unread: [] };
    let left = input.limit ?? DEFAULT_GREP_LIMIT;
    read.forEach((outcome, index) => {
      if ("error" in outcome) { result.unread.push({ subject: subjects[index]!, reason: reasonOf(outcome.error) }); return; }
      const { hits, more } = grepLines(outcome.context.content, pattern, input.context_lines ?? 1, Math.max(0, left));
      left -= hits.length;
      result.more ||= more;
      for (const hit of hits) result.matches.push({ subject: outcome.context.subject, revision: outcome.context.revision, ...hit });
    });
    return result;
  }

  /** The caller's own project; knowledge has no personal or cross-project scope. */
  private project(access: KnowledgeAccess): string {
    if (!access.caller.project_id) throw knowledgeErrors.scope("项目资料只能在项目里读取");
    return access.caller.project_id;
  }

  /** The piece as its owner has it now for this caller; an owner's refusal keeps its own code. */
  private async owner(access: KnowledgeAccess, subject: ActionSubject, origin: { capability_id: string; version: number }): Promise<ActionSubjectContext> {
    this.project(access);
    const caller = retainActionAuthority(access.caller, { capability_id: origin.capability_id, version: origin.version, provider_id: KNOWLEDGE_PROVIDER_ID });
    try {
      const { context } = await resolveActionSubject(access.client, caller, subject);
      return context;
    } catch (error) {
      if (error instanceof ActionError) throw error;
      throw knowledgeErrors.unreadable(`这份资料现在读不到：${reasonOf(error)}`);
    }
  }
}
