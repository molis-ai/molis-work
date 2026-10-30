import { retainActionAuthority, ActionError, type ActionAudience, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { FeedApplication } from "./application.js";
import { admitToInbox, isIgnored } from "./inbox-admission.js";
import type { FeedSourceRecord } from "./projection.js";
import type { FeedHydrate } from "./item-hydration.js";

/**
 * What the Inbox plugin asks of Feed (FI-6, specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md §1.2.6): Feed's own facts
 * — whether an item may enter the Inbox, the readable material of an item, the names an entry is shown under, and admitting an item —
 * behind public actions, so the Inbox needs no Feed code and no Feed table. Inbox declares them in its Manifest and calls them through
 * `services.actions`; the platform adds nothing for them.
 */
const id = { type: "string", minLength: 1, maxLength: 200 };
const ids = { type: "array", items: id, maxItems: 200 };
const closed = (properties: Record<string, unknown>, required: string[]): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
/** Reads reach whoever Inbox's own actions reach (a plugin calling reaches an agent action); the admitting command is the person's own add-to-Inbox and the workflow's hand-in, as delegated: a plugin run for the person reaches only what the person's own catalog lists, so a workflow-only audience would never be reachable from Inbox. */
const READERS: readonly ActionAudience[] = ["user", "agent", "workflow", "mcp"];

export interface FeedAdmission { item_id: string; admissible: boolean; reason: "ignored" | null }
export interface FeedMaterial { item_id: string; revision: number; title: string; body: string; url: string | null; source_label: string | null; provenance: unknown[] }
/** What a judgment of an Inbox entry reads of its item: the text the person would read, with the retained materials' own text. */
export interface FeedContent { item_id: string; revision: number; title: string; summary: string | null; body: string | null; materials: Array<{ content: string | null; preview: string | null }> }
export interface FeedBriefs {
  items: Array<{ item_id: string; title: string; source_label: string | null; source_kind: string | null; summary: string; disposition: string }>;
  sources: Array<{ source_id: string; name: string }>;
}
export interface FeedAdmitted { entry_id: string; status: string; revision: number; created: boolean }

function read<Input, Output>(capability_id: string, title: string, description: string, input: ActionSchema, output: ActionSchema, subjects: string[] = ["feed_item"]): ActionDefinition<Input, Output> {
  return { capability_id, version: 1, operation: "query", action: { title, description, kind: "query", scope: "project",
    audiences: [...READERS], permissions: ["feed:read"], subject_kinds: subjects, input_schema: input, output_schema: output } };
}

function command<Input, Output>(capability_id: string, title: string, description: string, input: ActionSchema, output: ActionSchema): ActionDefinition<Input, Output> {
  return { capability_id, version: 1, operation: "command", action: { title, description, kind: "operation", scope: "project", scheduling: "concurrent",
    audiences: ["user", "workflow"], permissions: ["feed:read", "feed:write", "inbox:write"], subject_kinds: ["feed_item"], input_schema: input, output_schema: output } };
}

export const feedInboxActions = {
  admission: read<{ item_id: string }, FeedAdmission>("feed.items.admission", "能否进入 Inbox",
    "回答一条 Feed 消息现在能不能进入或重新进入 Inbox：已忽略的消息要先恢复，不能被加入或重开",
    closed({ item_id: id }, ["item_id"]),
    closed({ item_id: { type: "string" }, admissible: { type: "boolean" }, reason: { type: ["string", "null"] } }, ["item_id", "admissible", "reason"])),
  material: read<{ item_id: string }, FeedMaterial>("feed.items.material", "读取可整理的材料",
    "读取一条消息当前可读的原文：来源仍然有效、消息没有被忽略，检查期间消息和来源没有变化，并有正文",
    closed({ item_id: id }, ["item_id"]),
    closed({ item_id: { type: "string" }, revision: { type: "integer" }, title: { type: "string" }, body: { type: "string" }, url: { type: ["string", "null"] },
      source_label: { type: ["string", "null"] }, provenance: { type: "array" } }, ["item_id", "revision", "title", "body", "url", "source_label", "provenance"])),
  content: read<{ item_id: string }, FeedContent>("feed.items.content", "读取消息的内容",
    "读取一条消息的标题、摘要、正文与留存材料的文字，供 Inbox 判断下一步；不检查来源是否仍可用，也不要求有正文",
    closed({ item_id: id }, ["item_id"]),
    closed({ item_id: { type: "string" }, revision: { type: "integer" }, title: { type: "string" }, summary: { type: ["string", "null"] }, body: { type: ["string", "null"] },
      materials: { type: "array", items: { type: "object", properties: { content: { type: ["string", "null"] }, preview: { type: ["string", "null"] } }, required: ["content", "preview"] } } },
      ["item_id", "revision", "title", "summary", "body", "materials"])),
  briefs: read<{ item_ids?: string[]; source_ids?: string[] }, FeedBriefs>("feed.briefs.read", "读取消息与来源的简介",
    "按编号读取消息的标题、来源名与摘要，以及来源的名称，用于给 Inbox 事项命名；找不到的编号不返回，不含正文",
    closed({ item_ids: ids, source_ids: ids }, []),
    closed({ items: { type: "array" }, sources: { type: "array" } }, ["items", "sources"]), ["feed_item", "source"]),
  admit: command<{ item_id: string }, FeedAdmitted>("feed.items.admit", "加入 Inbox",
    "把一条消息加入 Inbox（已处理过的重新打开），并按当前 Inbox 规则判断下一步；由 Inbox 替工作流交接材料时调用",
    closed({ item_id: id }, ["item_id"]),
    closed({ entry_id: { type: "string" }, status: { type: "string" }, revision: { type: "integer" }, created: { type: "boolean" } }, ["entry_id", "status", "revision", "created"])),
} as const;
export const FEED_INBOX_ACTIONS: readonly ActionDefinition[] = Object.values(feedInboxActions);

export interface FeedInboxActionPorts {
  /** The bodies of retained materials, decrypted. */
  hydrate: FeedHydrate;
  /** Whether the source's connection can still be used, as its owner checks it. */
  authorize(source: FeedSourceRecord): Promise<{ authorized: boolean; reason?: string }>;
}

/** Who added an entry that was handed in, from the trusted audience of the call and never from its input: a workflow's handoff is `workflow`, a person's act `web_user`. */
const addedByOf = (audience: ActionAudience): string => audience === "user" ? "web_user" : audience;

const notFound = (error: unknown): boolean => error instanceof ActionError && (error.code === "feed.item_not_found" || error.code === "feed.source_not_found");
const found = <T>(read: () => T): T[] => {
  try { return [read()]; } catch (error) { if (notFound(error)) return []; throw error; }
};
const sourceState = (source: FeedSourceRecord): string => JSON.stringify([source.config, source.status, source.enabled, source.credential_ref]);

export function createFeedInboxHandlers(feed: FeedApplication, board: string, ports: FeedInboxActionPorts): ActionHandlerBinding[] {
  const bind = <Input, Output>(definition: ActionDefinition<Input, Output>, handle: (input: Input, caller: ActionExecutionContext) => Output | Promise<Output>): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version, handle: (caller, input) => handle(input as Input, caller),
  });
  return [
    bind(feedInboxActions.admission, ({ item_id }) => {
      const item = feed.getFeedItem(board, item_id);
      const admissible = !isIgnored(item);
      return { item_id: item.item_id, admissible, reason: admissible ? null : "ignored" };
    }),
    bind(feedInboxActions.material, async ({ item_id }, caller) => {
      caller.signal?.throwIfAborted();
      const original = feed.getFeedItem(board, item_id);
      if (isIgnored(original) || !original.source_id) throw new ActionError("actions.subject_unavailable", "原材料已归档或移除");
      const source = feed.sources.get(board, original.source_id);
      const authorization = await ports.authorize(source);
      if (!authorization.authorized) throw new ActionError("actions.source_unavailable", authorization.reason ?? "原材料来源已不可用");
      const current = feed.getFeedItem(board, item_id), latest = feed.sources.get(board, original.source_id);
      if (current.revision !== original.revision || sourceState(latest) !== sourceState(source)) throw new ActionError("actions.offer_changed", "检查期间原材料或来源已变化，请重新载入");
      caller.signal?.throwIfAborted();
      const item = await ports.hydrate(current);
      const body = item.body || item.materials.map(material => material.content || material.preview).join("\n\n") || item.summary;
      if (!body.trim()) throw new ActionError("actions.subject_unavailable", "所选材料没有可读取的正文");
      return { item_id: item.item_id, revision: item.revision, title: item.title, body, url: item.url ?? null, source_label: item.source_label ?? null,
        provenance: item.materials.map(material => material.provenance) };
    }),
    bind(feedInboxActions.content, async ({ item_id }) => {
      const item = await ports.hydrate(feed.getFeedItem(board, item_id));
      return { item_id: item.item_id, revision: item.revision, title: item.title, summary: item.summary ?? null, body: item.body ?? null,
        materials: item.materials.map(material => ({ content: material.content ?? null, preview: material.preview ?? null })) };
    }),
    bind(feedInboxActions.briefs, ({ item_ids = [], source_ids = [] }) => ({
      items: item_ids.flatMap(itemId => found(() => feed.getFeedItem(board, itemId))).map(item => ({ item_id: item.item_id, title: item.title,
        source_label: item.source_label ?? null, source_kind: item.source_kind ?? null, summary: item.summary ?? "", disposition: item.disposition })),
      sources: source_ids.flatMap(sourceId => found(() => feed.sources.get(board, sourceId))).map(source => ({ source_id: source.source_id, name: source.name })),
    })),
    bind(feedInboxActions.admit, async ({ item_id }, caller) => {
      const { entry, created } = admitToInbox(feed, board, item_id, addedByOf(caller.delegated_audience ?? caller.audience));
      // Admission starts the Inbox next-step judgment with the handing-in caller's authority, and judges only the entry it admitted: the
      // action runs beside the project's queue while the model answers.
      await feed.flushPendingInboxJudgments(retainActionAuthority(caller, feedInboxActions.admit), [entry.entry_id]);
      return { entry_id: entry.entry_id, status: entry.status, revision: entry.revision, created };
    }),
  ];
}
