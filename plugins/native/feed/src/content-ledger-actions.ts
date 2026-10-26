import { ActionError, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import { FEED_PLUGIN_ID } from "./identity.js";
import { FEED_CONTENT_LEDGER_BATCH, type FeedContentLedger, type FeedContentReclaim, type FeedContentRelease } from "./content-ledger.js";

/**
 * The things Feed's project instances ask of its Home half (specs/repository-anti-corruption/slices/feed-inbox-home-reference-ledger.md
 * §3.2). They are not for a person, a workflow, an Agent or another plugin: only a Feed project instance, and only for its own project and
 * the sources it names. The project and the caller come from the call, never from the input.
 */
const closed = (properties: Record<string, unknown>, required: string[]): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const refs = { type: "array", maxItems: FEED_CONTENT_LEDGER_BATCH, items: { type: "string", maxLength: 200 } };

export const feedContentLedgerActions = {
  hold: { capability_id: "feed.content.hold", version: 1, operation: "command", action: {
    title: "登记 Feed 来源持有的正文", description: "写正文之前，登记这个项目的这个来源持有哪些证据正文；只由 Feed 自己的项目实例调用",
    kind: "operation", scope: "home", audiences: ["plugin"], permissions: ["feed:write"], subject_kinds: [],
    input_schema: closed({ source_id: { type: "string", minLength: 1, maxLength: 200 }, content_refs: refs }, ["source_id", "content_refs"]),
    output_schema: closed({ held: { type: "integer" } }, ["held"]),
  } } satisfies ActionDefinition<{ source_id: string; content_refs: string[] }, { held: number }>,
  release: { capability_id: "feed.content.release", version: 1, operation: "command", action: {
    title: "释放 Feed 来源持有的正文", description: "来源的行从项目库删除之后，释放它持有的证据正文：删除没有别的来源或项目持有的；只由 Feed 自己的项目实例调用",
    kind: "operation", scope: "home", audiences: ["plugin"], permissions: ["feed:write"], subject_kinds: [],
    input_schema: closed({ source_id: { type: "string", minLength: 1, maxLength: 200 }, candidates: refs }, ["source_id", "candidates"]),
    output_schema: closed({ bodies_deleted: { type: "integer" }, bodies_kept: { type: "integer" }, complete: { type: "boolean" } }, ["bodies_deleted", "bodies_kept", "complete"]),
  } } satisfies ActionDefinition<{ source_id: string; candidates: string[] }, FeedContentRelease>,
  reclaim: { capability_id: "feed.content.reclaim", version: 1, operation: "command", action: {
    title: "收回 Feed 来源多登记的正文", description: "一次取数失败、被取消或中断后，收回这个来源登记了、但它的行并不引用的证据正文：只收回它自己的登记，再删除没有别的来源或项目持有的；只由 Feed 自己的项目实例调用",
    kind: "operation", scope: "home", audiences: ["plugin"], permissions: ["feed:write"], subject_kinds: [],
    input_schema: closed({ source_id: { type: "string", minLength: 1, maxLength: 200 }, unreferenced: refs }, ["source_id", "unreferenced"]),
    output_schema: closed({ holds_released: { type: "integer" }, bodies_deleted: { type: "integer" }, bodies_kept: { type: "integer" }, complete: { type: "boolean" } }, ["holds_released", "bodies_deleted", "bodies_kept", "complete"]),
  } } satisfies ActionDefinition<{ source_id: string; unreferenced: string[] }, FeedContentReclaim>,
} as const;
export const FEED_CONTENT_LEDGER_ACTIONS: readonly ActionDefinition[] = Object.values(feedContentLedgerActions);

/** Feed's project instance, as the host names it on a call: the plugin audience, with the plugin id the host recorded (never one the call says). */
function holderOf(caller: ActionExecutionContext): string {
  if (caller.audience !== "plugin" || caller.calling_plugin_id !== FEED_PLUGIN_ID || !caller.project_id) {
    throw new ActionError("actions.forbidden", "只有 Feed 自己的项目实例能登记、释放或收回正文");
  }
  return caller.project_id;
}

export function createFeedContentLedgerHandlers(ledger: FeedContentLedger): ActionHandlerBinding[] {
  const { hold, release, reclaim } = feedContentLedgerActions;
  return [
    { capability_id: hold.capability_id, version: hold.version, handle: async (caller, raw) => {
      const project_id = holderOf(caller), input = raw as { source_id: string; content_refs: string[] };
      return ledger.hold(() => caller.beforeEffect(), { project_id, source_id: input.source_id }, input.content_refs);
    } },
    { capability_id: release.capability_id, version: release.version, handle: async (caller, raw) => {
      const project_id = holderOf(caller), input = raw as { source_id: string; candidates: string[] };
      return ledger.release(() => caller.beforeEffect(), { project_id, source_id: input.source_id }, input.candidates);
    } },
    { capability_id: reclaim.capability_id, version: reclaim.version, handle: async (caller, raw) => {
      const project_id = holderOf(caller), input = raw as { source_id: string; unreferenced: string[] };
      return ledger.reclaim(() => caller.beforeEffect(), { project_id, source_id: input.source_id }, input.unreferenced);
    } },
  ];
}
