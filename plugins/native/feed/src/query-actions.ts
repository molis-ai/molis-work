import { defineConnectorUsagesAction } from "@molis-ai/molis-work-contracts/services/connector-host";
import { feedSourceActions } from "./source-actions.js";
import { FEED_PLUGIN_ID } from "./identity.js";
import { type ActionExecutionContext, type ActionDefinition, type ActionHandlerBinding, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { FeedApplication } from "./application.js";
import type { ConnectorAuthStatus } from "./connector-auth-status.js";
import type { AttentionEntryRecord } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { FeedRuleJudgmentSelection } from "./rule-actions.js";
import type { FeedItemRecord, FeedSnapshot, FeedSourceCatalogView } from "./projection.js";
import type { FeedHydrate } from "./item-hydration.js";

const empty = { type: "object", properties: {}, additionalProperties: false };
const item = { type: "object", required: ["item_id", "revision", "materials", "title"] };
const rows = (required: string[]) => ({ type: "array", items: { type: "object", required } });
function define<I, O>(id: string, title: string, description: string, input: ActionSchema, output: ActionSchema, permissions: readonly string[] = ["feed:read"]): ActionDefinition<I, O> {
  return { capability_id: id, version: 1, operation: "query", action: { title, description, kind: "query", scope: "project",
    // This is the existing local panel projection, including source configuration and receipt metadata.
    // Shared content consumers use feed.content.list/read, which expose their narrower content contract.
    audiences: ["user"], permissions: [...permissions], subject_kinds: ["feed_item"], input_schema: input, output_schema: output } };
}

export type FeedDirectorySnapshot = Omit<FeedSnapshot, "inbox_entries">;
/** Data for Feed's own stage; Inbox's attention facts arrive through its public read. */
export interface FeedStageData {
  readonly snapshot: FeedDirectorySnapshot;
  readonly source_catalog: readonly FeedSourceCatalogView[];
  readonly connector_auth: ConnectorAuthStatus;
  readonly inbox_entries: readonly AttentionEntryRecord[];
}
export interface FeedReaderData {
  readonly item: FeedItemRecord;
  readonly inbox_active: boolean;
  readonly promote_available: boolean;
}
export const FEED_STAGE_INBOX_READ = { capability_id: "inbox.list", version: 1, provider_id: "io.molis.work.inbox" } as const;
const snapshotSchema = { type: "object", properties: { sources: rows(["source_id"]), feed_items: { type: "array", items: item },
  runs: rows(["run_id"]), out_rules: rows(["rule_id"]) }, required: ["sources", "feed_items", "runs", "out_rules"], additionalProperties: false };
const connectionsSchema = { type: "object", properties: {
  github: { type: "object", properties: { bound: { type: "boolean" } }, required: ["bound"] },
  gmail: { type: "object", properties: { bound: { type: "boolean" } }, required: ["bound"] } }, required: ["github", "gmail"] };

const linkedContext = define<{ goal_id: string; item_id?: string }, { source_context: string } | null>("feed.goals.context", "读取 Goal 关联材料",
  "只读取 Context Ledger 中仍与指定 Goal 关联的 Feed 原文；不能通过材料 ID 注入未关联内容",
  { ...empty, properties: { goal_id: { type: "string", minLength: 1 }, item_id: { type: "string", minLength: 1 } }, required: ["goal_id"] },
  { anyOf: [{ type: "object", properties: { source_context: { type: "string" } }, required: ["source_context"], additionalProperties: false }, { type: "null" }] });

export const feedQueryActions = {
  stage: define<Record<string, never>, FeedStageData>("feed.stage.read", "读取 Feed 舞台", "读取本实例的来源目录、消息、捕捉建议、连接与 Inbox 活跃事实", empty,
    { type: "object", properties: { snapshot: snapshotSchema, source_catalog: rows(["id", "name", "feed_url", "category", "category_label", "limitations"]),
      connector_auth: connectionsSchema, inbox_entries: rows(["entry_id", "subject_type", "subject_id", "status"]) },
      required: ["snapshot", "source_catalog", "connector_auth", "inbox_entries"], additionalProperties: false },
    ["feed:read", "inbox:read", "evidence:read", "sources:pull_feed", "sources:pull_connector"]),
  reader: define<{ object_id: string }, FeedReaderData>("feed.items.reader", "读取 Feed 阅读器", "读取一条消息的正文、有效捕捉建议及当前可用的处置",
    { ...empty, properties: { object_id: { type: "string", minLength: 1, maxLength: 200 } }, required: ["object_id"] },
    { type: "object", properties: { item, inbox_active: { type: "boolean" }, promote_available: { type: "boolean" } },
      required: ["item", "inbox_active", "promote_available"], additionalProperties: false }, ["feed:read", "inbox:read", "evidence:read"]),
  connectionUsages: defineConnectorUsagesAction("feed.connection.usages", "Feed 来源使用的连接", ["feed:read"], "project"),
  linkedContext: { ...linkedContext, action: { ...linkedContext.action, permissions: ["feed:read", "goals:read"],
    required_actions: [{ capability_id: "goals.contract.read", version: 2, provider_id: "io.molis.work.goals" }] } },
  snapshot: define<{ include_contents?: boolean }, FeedDirectorySnapshot>("feed.snapshot", "读取 Feed 面板",
    "读取当前项目的来源、消息与拉取记录；默认省略正文，Inbox 事项由 Inbox 自己授权读取",
    { ...empty, properties: { include_contents: { type: "boolean" } } },
    snapshotSchema),
  item: define<{ item_id: string }, { item: FeedItemRecord }>("feed.items.get", "读取 Feed 消息",
    "读取一条消息的当前内容，包含仍可读取的原始材料正文",
    { ...empty, properties: { item_id: { type: "string", minLength: 1, maxLength: 200 } }, required: ["item_id"] },
    { type: "object", properties: { item }, required: ["item"], additionalProperties: false }),
  connections: define<Record<string, never>, ConnectorAuthStatus>("feed.connections.status", "Feed 连接状态",
    "读取本机是否已连上 GitHub、Gmail 账号，不包含令牌", empty,
    connectionsSchema),
} as const;

export function createFeedQueryHandlers(feed: FeedApplication, projectId: string, ports: {
  hydrate: FeedHydrate;
  stage: {
    sourceCatalog(): readonly FeedSourceCatalogView[];
    recommendations: FeedRuleJudgmentSelection["recommendations"];
    inboxEntries(caller: ActionExecutionContext): Promise<readonly AttentionEntryRecord[]>;
    promoteAvailable(caller: ActionExecutionContext): Promise<boolean>;
  };
  authStatus(): ConnectorAuthStatus | Promise<ConnectorAuthStatus>;
  linkedContext(input: { goal_id: string; item_id?: string }, caller: ActionExecutionContext): Promise<{ source_context: string } | null>;
}): ActionHandlerBinding[] {
  const bind = <I, O>(definition: ActionDefinition<I, O>, run: (input: I, caller: ActionExecutionContext) => O | Promise<O>): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version,
    handle: (caller, input) => run(input as I, caller),
  });
  const snapshot = async (contents = false): Promise<FeedDirectorySnapshot> => {
    const { inbox_entries: _inbox, ...current } = feed.snapshot(projectId);
    return { ...current, feed_items: await Promise.all(current.feed_items.map(async entry => ({ ...(contents ? await ports.hydrate(entry)
      : { ...entry, body: null, materials: entry.materials.map(material => ({ ...material, content: undefined })) }), suggested_behavior_ids: [] }))) };
  };
  return [
    bind(feedQueryActions.stage, async (_input, caller) => {
      const source_catalog = ports.stage.sourceCatalog();
      const [current, connector_auth, { recommendations }, inbox_entries] = await Promise.all([
        snapshot(), ports.authStatus(), ports.stage.recommendations(caller), ports.stage.inboxEntries(caller),
      ]);
      await caller.beforeEffect();
      const suggested = new Map(recommendations.map(row => [row.item_id, row.suggested_behavior_ids]));
      return { snapshot: { ...current, feed_items: current.feed_items.map(entry => ({ ...entry, suggested_behavior_ids: suggested.get(entry.item_id) ?? [] })) },
        source_catalog, connector_auth, inbox_entries };
    }),
    bind(feedQueryActions.reader, async (input, caller) => {
      const [item, { recommendations }, entries, promote_available] = await Promise.all([
        ports.hydrate(feed.getFeedItem(projectId, input.object_id)), ports.stage.recommendations(caller), ports.stage.inboxEntries(caller), ports.stage.promoteAvailable(caller),
      ]);
      await caller.beforeEffect();
      return { item: { ...item, suggested_behavior_ids: recommendations.find(row => row.item_id === item.item_id)?.suggested_behavior_ids ?? [] },
        inbox_active: entries.some(entry => entry.subject_type === "feed_item" && entry.subject_id === item.item_id && (entry.status === "open" || entry.status === "in_progress")), promote_available };
    }),
    bind(feedQueryActions.connectionUsages, input => ({ usages: feed.snapshot(projectId).sources.filter(source => source.config.connection_id === input.connection_id).map(source => ({
      usage_id: source.source_id, title: source.name, detail: source.status === "disconnected" ? "来源账号已断开" : "拉取后按当前捕捉规则处理消息", enabled: source.enabled && source.status !== "disconnected",
      actions: [{ action: { capability_id: feedSourceActions.sync.capability_id, version: feedSourceActions.sync.version, provider_id: FEED_PLUGIN_ID }, input: { source_id: source.source_id } }],
    })) })),
    bind(feedQueryActions.linkedContext, (input, caller) => ports.linkedContext(input, caller)),
    bind(feedQueryActions.snapshot, input => snapshot(input.include_contents)),
    bind(feedQueryActions.item, async input => ({ item: await ports.hydrate(feed.getFeedItem(projectId, input.item_id)) })),
    bind(feedQueryActions.connections, () => ports.authStatus()),
  ];
}
