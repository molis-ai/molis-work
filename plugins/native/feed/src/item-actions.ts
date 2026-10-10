import { FEED_PLUGIN_ID } from "./identity.js";
import { retainActionAuthority, ActionError, defineSubjectOffersAction, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding, type ActionReference, type ActionSchema, type SubjectActionOffer } from "@molis-ai/molis-work-contracts/platform/actions";
import { FeedDomainError } from "@molis-ai/molis-work-contracts/modules/feed";
import type { FeedApplication } from "./application.js";
import { FeedStoreError } from "./application-errors.js";
import type { FeedGoalPromotionInput, promoteFeedItemToGoal } from "./goal-promotion.js";
import type { FeedItemRecord } from "./projection.js";

const id = { type: "string", minLength: 1, maxLength: 200 };
const revision = { type: "integer", minimum: 1 };
const item = { type: "object", properties: { item_id: { type: "string" }, revision: { type: "integer" }, disposition: { type: "string" } }, required: ["item_id", "revision"] };
const itemResult: ActionSchema = { type: "object", properties: { item }, required: ["item"] };
const closed = (properties: Record<string, unknown>, required: string[]): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
/** Promotion writes through these Goals actions, so it is unavailable wherever they are: a project without Goals cannot promote. */
const GOALS_ACTIONS_FOR_PROMOTION: ActionReference[] = ["goals.directory.read", "goals.create", "goals.inputs.confirm"]
  .map(capability_id => ({ capability_id, version: 1, provider_id: "io.molis.work.goals" }));
/** What an item action declares beyond the common shape: that it may run beside the queue, the actions it depends on, and that its records are a Session's (as Goals' own commands are). */
interface ItemActionExtras { scheduling?: "concurrent"; required_actions?: ActionReference[]; authorship?: "session" }
function define<Input, Output>(suffix: string, title: string, description: string, input: ActionSchema, output: ActionSchema, permissions: string[], extras: ItemActionExtras = {}): ActionDefinition<Input, Output> {
  return { capability_id: `feed.items.${suffix}`, version: 1, operation: "command", action: { title, description, kind: "operation", scope: "project", ...extras,
    audiences: ["user", "agent", "workflow", "mcp"], permissions,
    subject_kinds: ["feed_item"], input_schema: input, output_schema: output } };
}

export interface FeedItemResult { item: FeedItemRecord }
export interface FeedPromoteResult { item: FeedItemRecord; goal_id: string; created: boolean; runtime_autofill: boolean }
/** Each command acts on the revision the caller read; a changed item is refused rather than overwritten. */
export const feedItemActions = {
  offers: defineSubjectOffersAction("feed.items.offers", ["feed_item"], "Feed 可用动作", ["feed:read"], [
    { offer_id: "feed.inbox", title: "加入 Inbox", action: { capability_id: "feed.items.inbox", version: 1 } },
    { offer_id: "feed.save", title: "保存为资料", action: { capability_id: "feed.items.disposition", version: 1 } },
    { offer_id: "feed.promote", title: "升格为 Goal", action: { capability_id: "feed.items.promote", version: 1 } },
    { offer_id: "feed.archive", title: "忽略", action: { capability_id: "feed.items.disposition", version: 1 } },
    { offer_id: "feed.restore", title: "恢复到 Feed", action: { capability_id: "feed.items.restore", version: 1 } },
  ]),
  read: define<{ item_id: string }, FeedItemResult>("read", "标为已读", "把一条 Feed 消息标为已读；不改变它的去向", closed({ item_id: id }, ["item_id"]), itemResult, ["feed:read", "feed:write"]),
  inbox: define<{ item_id: string; expected_revision: number }, FeedItemResult>("inbox", "加入 Inbox", "按读取到的版本把这条消息加入 Inbox，并按当前 Inbox 规则判断下一步",
    closed({ item_id: id, expected_revision: revision }, ["item_id", "expected_revision"]), itemResult, ["feed:read", "feed:write", "inbox:write"], { scheduling: "concurrent" }),
  disposition: define<{ item_id: string; disposition: "saved" | "archived"; expected_revision: number }, FeedItemResult>("disposition", "保存或忽略", "按读取到的版本把消息保存为资料（saved）或忽略（archived）",
    closed({ item_id: id, disposition: { enum: ["saved", "archived"] }, expected_revision: revision }, ["item_id", "disposition", "expected_revision"]), itemResult, ["feed:read", "feed:write"]),
  restore: define<{ item_id: string; expected_revision: number }, FeedItemResult>("restore", "恢复到 Feed", "把已忽略或已处理的消息放回 Feed",
    closed({ item_id: id, expected_revision: revision }, ["item_id", "expected_revision"]), itemResult, ["feed:read", "feed:write"]),
  promote: define<{ item_id: string; expected_revision: number; start_processing?: boolean }, FeedPromoteResult>("promote", "升格为 Goal", "为这条消息新建 Goal 并把它记为这个 Goal 的输入（用户升格记为已确认，助理、Agent、工作流和外部工具升格只记为待确认，等用户认可）；已关联且仍有效的 Goal 会直接复用。以调用者自己的权限调用 Goals 的 goals.directory.read、goals.create、goals.inputs.confirm，持精确动作授权的客户端要同时授权这三个动作；Goal 记在 Runtime 会话名下，经 MCP 调用须有稳定 Session",
    closed({ item_id: id, expected_revision: revision, start_processing: { type: "boolean" } }, ["item_id", "expected_revision"]),
    { type: "object", properties: { item, goal_id: { type: "string" }, created: { type: "boolean" }, runtime_autofill: { type: "boolean" } }, required: ["item", "goal_id", "created", "runtime_autofill"] },
    ["feed:read", "feed:write", "goals:read", "goals:write"], { required_actions: GOALS_ACTIONS_FOR_PROMOTION, authorship: "session" }),
} as const;
export const FEED_ITEM_ACTIONS: readonly ActionDefinition[] = Object.values(feedItemActions);

export interface FeedItemActionPorts {
  inboxActive(itemId: string): boolean;
  /** Wired by the Host with the Goals actions; absent where the project has no Goal service. */
  promote?(input: FeedGoalPromotionInput, caller: ActionExecutionContext): ReturnType<typeof promoteFeedItemToGoal>;
  /** Whether the promotion can run for this caller now (the Goals actions it writes through are there and granted); the offer follows it. */
  promoteAvailable?(caller: ActionCallContext): Promise<boolean>;
}

/** Store refusals keep their own code so every caller sees the same reason; the Workbench route maps them back to its statuses. */
function asActionError(error: unknown): unknown {
  return error instanceof FeedStoreError || error instanceof FeedDomainError ? new ActionError(error.code, error.message) : error;
}

export function createFeedItemHandlers(feed: FeedApplication, board: string, ports: FeedItemActionPorts): ActionHandlerBinding[] {
  const bind = <Input, Output>(definition: ActionDefinition<Input, Output>, handle: (input: Input, caller: ActionExecutionContext) => Output | Promise<Output>, enabled = true): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version,
    availability: () => enabled ? { available: true } : { available: false, code: "actions.connection_required", reason: "此项目尚未接通 Goal 服务" },
    handle: async (caller, input) => { try { return await handle(input as Input, caller); } catch (error) { throw asActionError(error); } },
  });
  const ref = (definition: ActionDefinition) => ({ capability_id: definition.capability_id, version: definition.version });
  return [
    bind(feedItemActions.offers, async (input, caller) => {
      if (input.subject.kind !== "feed_item") throw new ActionError("actions.subject_mismatch", "此查询只接受 Feed 消息");
      let current: FeedItemRecord;
      try { current = feed.getFeedItem(board, input.subject.id); } catch { throw new ActionError("actions.subject_unavailable", "Feed 消息已不存在"); }
      const at = { item_id: current.item_id, expected_revision: current.revision };
      if (current.disposition === "archived") return { offers: [{ offer_id: "feed.restore", title: "恢复到 Feed", action: ref(feedItemActions.restore), input: at }] };
      const offers: SubjectActionOffer[] = [];
      if (!ports.inboxActive(current.item_id)) offers.push({ offer_id: "feed.inbox", title: "加入 Inbox", action: ref(feedItemActions.inbox), input: at });
      if (current.disposition !== "saved") offers.push({ offer_id: "feed.save", title: "保存为资料", action: ref(feedItemActions.disposition), input: { ...at, disposition: "saved" } });
      // The entry follows the action behind it: where Goals cannot be written through for this caller, promotion is not offered.
      if (!current.linked_goal_id && ports.promote && await ports.promoteAvailable?.(caller) !== false) offers.push({ offer_id: "feed.promote", title: "升格为 Goal", action: ref(feedItemActions.promote), input: at });
      offers.push({ offer_id: "feed.archive", title: "忽略", action: ref(feedItemActions.disposition), input: { ...at, disposition: "archived" } });
      return { offers };
    }),
    bind(feedItemActions.read, input => ({ item: feed.markRead(board, input.item_id) })),
    bind(feedItemActions.inbox, async (input, caller) => {
      const item = feed.addToInbox(board, input.item_id, input.expected_revision);
      // Admission starts the Inbox next-step judgment with this caller's authority, as the Workbench route always did. The
      // action runs beside the project's queue while the model answers, so it judges the entry it admitted and no other's.
      const entry = feed.listInboxEntries(board).find(entry => entry.subject_type === "feed_item" && entry.subject_id === item.item_id && (entry.status === "open" || entry.status === "in_progress"));
      if (entry) await feed.flushPendingInboxJudgments(retainActionAuthority(caller, { ...feedItemActions.inbox, provider_id: FEED_PLUGIN_ID }), [entry.entry_id]);
      return { item };
    }),
    bind(feedItemActions.disposition, input => ({ item: feed.setDisposition(board, input.item_id, input.disposition, input.expected_revision) })),
    bind(feedItemActions.restore, input => ({ item: feed.restoreToFeed(board, input.item_id, input.expected_revision) })),
    bind(feedItemActions.promote, async (input, caller) => {
      const { item, goal_id, created, runtime_autofill } = await ports.promote!({ projectId: board, routePrefix: "", itemId: input.item_id,
        startProcessing: input.start_processing === true, expectedRevision: input.expected_revision }, caller);
      return { item, goal_id, created, runtime_autofill };
    }, !!ports.promote),
  ];
}
