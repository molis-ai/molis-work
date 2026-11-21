import { objectSchema } from "@molis-ai/molis-work-plugin-sdk";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ActionError, bindActionHandler, defineErrorCodes, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { PluginModelClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { AttentionEntryRecord } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { FeedApplication } from "./application.js";
import { FEED_INFORMATION_PLAN } from "./prompts.js";
import { FEED_STAGE_INBOX_READ } from "./query-actions.js";

export const feedInformationPlanErrors = defineErrorCodes("feed", { plan_reply_invalid: "upstream" });

/** At most `max` whole characters: a two-unit character is never cut in half. */
const wholeCharacters = (text: string, max: number) => [...text.slice(0, 2 * max)].slice(0, max).join("");

/** The data the prompt describes stays bounded: at most this many sources, recent items and open Inbox entries. */
const SOURCE_LIMIT = 20, ITEM_LIMIT = 20, INBOX_LIMIT = 20;
const ACTIVE = new Set(["open", "in_progress"]);
const text = { type: "string" };

interface PlanInput { prompt: string; selected_item_id?: string }
export type FeedInformationPlanAction =
  | { kind: "configure_filter"; source_id: string; sample_item_id: string; name: string; instructions: string }
  | { kind: "draft_pages"; entry_ids: string[]; title: string; instructions: string };
export interface FeedInformationPlan {
  message: string;
  action: FeedInformationPlanAction | null;
  context: { project_id: string; items: number; inbox: number };
}

/**
 * One confirmable proposal over this project's Feed and Inbox: a filtering rule for a source, or writing requirements for Inbox
 * entries (BL-b44-information-plan-to-feed). It only proposes; the page runs the confirmed action through Feed's and the
 * receiving plugin's own actions. It was the Host's `information.plan` (`system.information`), which named Feed's and Inbox's
 * actions and took Feed's shapes; Feed owns those shapes, so the plan is Feed's. Inbox is read through its public action.
 */
export const feedInformationPlanAction: ActionDefinition<PlanInput, FeedInformationPlan> = {
  capability_id: "feed.information.plan", version: /* @version action.feed.information.plan */ 1, operation: "query", action: {
    title: "起草信息处理方案", description: "根据当前项目的 Feed 与 Inbox 提出筛选或写作方案；不会执行方案中的操作",
    kind: "query", scope: "project", scheduling: "concurrent", execution: { cost: "metered" }, audiences: ["user"], permissions: ["feed:read", "inbox:read", "model:invoke"], subject_kinds: [],
    required_actions: [FEED_STAGE_INBOX_READ],
    input_schema: { type: "object", properties: { prompt: { type: "string", minLength: 1, maxLength: 4000 }, selected_item_id: { type: "string", maxLength: 200 } }, required: ["prompt"], additionalProperties: false },
    output_schema: objectSchema({ message: text, action: { anyOf: [{ type: "null" },
      objectSchema({ kind: { const: "configure_filter" }, source_id: text, sample_item_id: text, name: text, instructions: text }),
      objectSchema({ kind: { const: "draft_pages" }, entry_ids: { type: "array", items: text }, title: text, instructions: text }),
    ] }, context: objectSchema({ project_id: text, items: { type: "integer", minimum: 0 }, inbox: { type: "integer", minimum: 0 } }) }),
  },
};

export interface FeedInformationPlanPorts {
  readonly model: PluginModelClient | undefined;
  /** Inbox's entries of this project, read through its public action as the caller. */
  inboxEntries(caller: ActionExecutionContext): Promise<readonly AttentionEntryRecord[]>;
}

const replyInvalid = (key: string) => feedInformationPlanErrors.plan_reply_invalid(uiText.text(key));

/** What the plan reads of this project: its sources, its most recent items, Inbox's entries, and an item's title by id. */
export interface FeedInformationPlanState {
  readonly sources: ReadonlyArray<{ readonly source_id: string; readonly name: string; readonly enabled: boolean }>;
  readonly items: ReadonlyArray<{ readonly item_id: string; readonly source_id?: string | null; readonly title: string; readonly summary?: string | null }>;
  readonly inbox_entries: readonly Pick<AttentionEntryRecord, "entry_id" | "subject_type" | "subject_id" | "status">[];
  /** An open entry's item may be older than the recent ones; one that is gone has no title. */
  titleOf(itemId: string): string | undefined;
}

/**
 * The person's request and this project's state, bounded, as the data after Feed's registered instruction: at most 20 enabled
 * sources, 20 recent items and 20 open Inbox entries, with titles and source names cut to 200 whole characters (a cut never keeps half
 * of a two-unit character) and summaries to 1,000.
 */
export function feedInformationPlanContext(state: FeedInformationPlanState, projectId: string, input: PlanInput) {
  const recent = state.items.slice(0, ITEM_LIMIT);
  const open = state.inbox_entries.filter(entry => entry.subject_type === "feed_item" && ACTIVE.has(entry.status)).slice(0, INBOX_LIMIT);
  const titleOf = (itemId: string) => recent.find(item => item.item_id === itemId)?.title ?? state.titleOf(itemId) ?? "";
  const items = recent.map(item => ({ id: item.item_id, source_id: item.source_id ?? "", title: wholeCharacters(item.title, 200), summary: (item.summary ?? "").slice(0, 1000) }));
  const inbox = open.map(entry => ({ entry_id: entry.entry_id, item_id: entry.subject_id, title: wholeCharacters(titleOf(entry.subject_id), 200) }));
  return { project_id: projectId, selected_item_id: items.some(item => item.id === input.selected_item_id) ? input.selected_item_id : null,
    sources: state.sources.filter(source => source.enabled).slice(0, SOURCE_LIMIT).map(source => ({ source_id: source.source_id, name: wholeCharacters(source.name, 200) })), items, inbox };
}

/** The instruction's data: the bounded state, then the person's words. */
export const feedInformationPlanData = (context: ReturnType<typeof feedInformationPlanContext>, prompt: string): string =>
  [`当前范围：${JSON.stringify(context)}`, `用户请求：${prompt}`].join("\n\n");

/** The model's answer, held to what this project has: a source and sample that are here, Inbox entries that are open now. */
export function checkedFeedInformationPlan(reply: unknown, context: ReturnType<typeof feedInformationPlanContext>): FeedInformationPlan {
  const summary = { project_id: context.project_id, items: context.items.length, inbox: context.inbox.length };
  if (reply === null || typeof reply !== "object" || Array.isArray(reply)) throw replyInvalid("feed.information-plan.reply-invalid");
  const parsed = reply as { message?: unknown; action?: Record<string, unknown> | null };
  const message = typeof parsed.message === "string" ? parsed.message.slice(0, 4000) : uiText.text("feed.information-plan.check-before-running");
  const action = parsed.action;
  if (action == null) return { message, action: null, context: summary };
  const field = (key: string, max: number) => {
    const value = action[key];
    if (typeof value !== "string" || !value.trim() || value.length > max) throw replyInvalid("feed.information-plan.reply-incomplete");
    return value.trim();
  };
  if (action.kind === "configure_filter") {
    const source_id = field("source_id", 128), sample_item_id = field("sample_item_id", 128);
    if (!context.sources.some(source => source.source_id === source_id) || !context.items.some(item => item.id === sample_item_id && item.source_id === source_id)) {
      throw replyInvalid("feed.information-plan.source-not-here");
    }
    return { message: uiText.text("feed.information-plan.rule-ready"), action: { kind: "configure_filter", source_id, sample_item_id, name: field("name", 80), instructions: field("instructions", 4000) }, context: summary };
  }
  if (action.kind === "draft_pages") {
    const entry_ids = Array.isArray(action.entry_ids) ? [...new Set(action.entry_ids)] : [];
    if (!entry_ids.length || !entry_ids.every(id => typeof id === "string" && context.inbox.some(entry => entry.entry_id === id))) throw replyInvalid("feed.information-plan.entries-not-here");
    return { message: uiText.text("feed.information-plan.writing-ready"), action: { kind: "draft_pages", entry_ids: entry_ids as string[], title: field("title", 80), instructions: field("instructions", 4000) }, context: summary };
  }
  throw replyInvalid("feed.information-plan.unsupported");
}

export function createFeedInformationPlanHandler(feed: FeedApplication, projectId: string, ports: FeedInformationPlanPorts): ActionHandlerBinding {
  return bindActionHandler(feedInformationPlanAction, async (input, caller) => {
    const model = ports.model, state = model?.availability();
    if (!model || !state?.available) throw new ActionError("actions.connection_required", state && !state.available ? state.reason : uiText.text("feed.information-plan.connect-text-model"));
    const prompt = input.prompt.trim();
    if (!prompt) throw new ActionError("actions.input_invalid", uiText.text("feed.information-plan.prompt-required"));
    const inbox_entries = await ports.inboxEntries(caller);
    const page = (extra: { limit: number; item_id?: string }) => feed.reads.page(projectId, { offset: 0, sort: "newest", status: "all", unread: false, ...extra });
    const context = feedInformationPlanContext({ sources: feed.sources.list(projectId), items: page({ limit: ITEM_LIMIT }), inbox_entries,
      titleOf: item_id => page({ limit: 1, item_id })[0]?.title }, projectId, { ...input, prompt });
    const reply = await model.complete(instructed(FEED_INFORMATION_PLAN, feedInformationPlanData(context, prompt)), { output: "json", signal: caller.signal });
    await caller.beforeEffect();
    reply.validateResult();
    return checkedFeedInformationPlan(reply.value, context);
  }, { availability: () => ports.model?.availability() ?? { available: false, code: "actions.connection_required", reason: uiText.text("feed.information-plan.connect-text-model") } });
}
