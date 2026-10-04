import { ActionError, type ActionExecutionContext, type ActionDefinition, type ActionHandlerBinding, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { FeedApplication } from "./application.js";
import { FeedStoreError } from "./application-errors.js";
import type { ConnectorAuthStatus } from "./connector-account-ports.js";
import type { FeedItemRecord, FeedSnapshot } from "./projection.js";

const empty = { type: "object", properties: {}, additionalProperties: false };
const item = { type: "object", required: ["item_id", "revision", "materials", "title"] };
const rows = (required: string[]) => ({ type: "array", items: { type: "object", required } });
function define<I, O>(id: string, title: string, description: string, input: ActionSchema, output: ActionSchema): ActionDefinition<I, O> {
  return { capability_id: id, version: 1, operation: "query", action: { title, description, kind: "query", scope: "project",
    // This is the existing local panel projection, including source configuration and receipt metadata.
    // Shared content consumers use feed.content.list/read, which expose their narrower content contract.
    audiences: ["user"], permissions: ["feed:read"], subject_kinds: ["feed_item"], input_schema: input, output_schema: output } };
}

export type FeedDirectorySnapshot = Omit<FeedSnapshot, "inbox_entries">;
const linkedContext = define<{ goal_id: string; item_id?: string }, { source_context: string } | null>("feed.goals.context", "读取 Goal 关联材料",
  "只读取 Context Ledger 中仍与指定 Goal 关联的 Feed 原文；不能通过材料 ID 注入未关联内容",
  { ...empty, properties: { goal_id: { type: "string", minLength: 1 }, item_id: { type: "string", minLength: 1 } }, required: ["goal_id"] },
  { anyOf: [{ type: "object", properties: { source_context: { type: "string" } }, required: ["source_context"], additionalProperties: false }, { type: "null" }] });

export const feedQueryActions = {
  linkedContext: { ...linkedContext, action: { ...linkedContext.action, permissions: ["feed:read", "goals:read"],
    required_actions: [{ capability_id: "goals.contract.read", version: 1, provider_id: "io.molis.work.goals" }] } },
  snapshot: define<{ include_contents?: boolean }, FeedDirectorySnapshot>("feed.snapshot", "读取 Feed 面板",
    "读取当前项目的来源、消息与拉取记录；默认省略正文，Inbox 事项由 Inbox 自己授权读取",
    { ...empty, properties: { include_contents: { type: "boolean" } } },
    { type: "object", properties: { sources: rows(["source_id"]), feed_items: { type: "array", items: item },
      runs: rows(["run_id"]), out_rules: rows(["rule_id"]) },
    required: ["sources", "feed_items", "runs", "out_rules"], additionalProperties: false }),
  item: define<{ item_id: string }, { item: FeedItemRecord }>("feed.items.get", "读取 Feed 消息",
    "读取一条消息的当前内容，包含仍可读取的原始材料正文",
    { ...empty, properties: { item_id: { type: "string", minLength: 1, maxLength: 200 } }, required: ["item_id"] },
    { type: "object", properties: { item }, required: ["item"], additionalProperties: false }),
  connections: define<Record<string, never>, ConnectorAuthStatus>("feed.connections.status", "Feed 连接状态",
    "读取 Feed 本机账号的连接状态，不包含令牌", empty,
    { type: "object", required: ["github", "gmail", "github_client_id_configured", "gmail_oauth_configured", "gmail_redirect_uri"] }),
} as const;

export function createFeedQueryHandlers(feed: FeedApplication, boardId: string, ports: {
  hydrate(item: FeedItemRecord): FeedItemRecord;
  authStatus(): ConnectorAuthStatus;
  linkedContext(input: { goal_id: string; item_id?: string }, caller: ActionExecutionContext): Promise<{ source_context: string } | null>;
}): ActionHandlerBinding[] {
  const bind = <I, O>(definition: ActionDefinition<I, O>, run: (input: I, caller: ActionExecutionContext) => O | Promise<O>): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version,
    handle: async (caller, input) => {
      try { return await run(input as I, caller); }
      catch (error) { throw error instanceof FeedStoreError ? new ActionError(error.code, error.message) : error; }
    },
  });
  return [
    bind(feedQueryActions.linkedContext, (input, caller) => ports.linkedContext(input, caller)),
    bind(feedQueryActions.snapshot, input => {
      const { inbox_entries: _inbox, ...snapshot } = feed.snapshot(boardId);
      return { ...snapshot, feed_items: snapshot.feed_items.map(item => ({ ...(input.include_contents ? ports.hydrate(item)
        : { ...item, body: null, materials: item.materials.map(material => ({ ...material, content: undefined })) }), suggested_behavior_ids: [] })) };
    }),
    bind(feedQueryActions.item, input => ({ item: ports.hydrate(feed.getFeedItem(boardId, input.item_id)) })),
    bind(feedQueryActions.connections, () => ports.authStatus()),
  ];
}
