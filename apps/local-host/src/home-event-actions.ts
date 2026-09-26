import { isDeepStrictEqual } from "node:util";
import { ActionError, assertHomeEventWindow, ACTION_REFERENCE_SCHEMA, HOME_EVENTS_INPUT_TYPE, HOME_EVENTS_OUTPUT_TYPE, HOME_EVENT_WINDOW_SCHEMA, HOME_EVENT_SCHEMA, HOME_EVENT_SOURCE_SCHEMA, HOME_OPEN_TARGET_SCHEMA,
  type ActionCallContext, type ActionClient, type ActionDefinition, type ActionHandlerBinding, type ActionReference, type HomeEventView, type HomeEventCollection, type HomeEventWindow, type HomeOpenTarget } from "@molis-ai/molis-work-contracts/platform/actions";

export type { HomeEventView } from "@molis-ai/molis-work-contracts/platform/actions";
export interface HomeEventsResult { events: HomeEventView[]; issues: string[] }
export interface HomeEventOpenInput { window: HomeEventWindow; source: ActionReference; event_id: string; target: HomeOpenTarget }
const metadata = { scope: "project" as const, scheduling: "concurrent" as const, audiences: ["user", "agent", "workflow", "mcp"] as const, permissions: ["home:read"], subject_kinds: [] };
const eventSchema = { ...HOME_EVENT_SCHEMA, properties: { ...HOME_EVENT_SCHEMA.properties, id: { type: "string" }, source: ACTION_REFERENCE_SCHEMA, origin: HOME_EVENT_SOURCE_SCHEMA, suggested_behavior_ids: { type: "array", items: { type: "string" } } }, required: [...HOME_EVENT_SCHEMA.required, "id", "source", "origin", "suggested_behavior_ids"] };
export const homeEventActions = {
  events: { capability_id: "home.events.read", version: 1, operation: "query", action: { ...metadata, title: "首页事项", description: "从已授权插件查询当前窗口的事项，保留各自对象与提供方身份。", kind: "query", input_schema: HOME_EVENT_WINDOW_SCHEMA,
    output_schema: { type: "object", properties: { events: { type: "array", items: eventSchema }, issues: { type: "array", items: { type: "string" } } }, required: ["events", "issues"], additionalProperties: false } } } as ActionDefinition<HomeEventWindow, HomeEventsResult>,
  openEvent: { capability_id: "home.events.open", version: 1, operation: "query", action: { ...metadata, title: "打开首页事项", description: "重新读取原提供方并核对显示的目标，返回可由界面打开的当前对象或分组；不修改业务数据。", kind: "query",
    input_schema: { type: "object", properties: { window: HOME_EVENT_WINDOW_SCHEMA, source: ACTION_REFERENCE_SCHEMA, event_id: { type: "string", minLength: 1 }, target: HOME_OPEN_TARGET_SCHEMA }, required: ["window", "source", "event_id", "target"], additionalProperties: false },
    output_schema: { type: "object", properties: { target: HOME_OPEN_TARGET_SCHEMA }, required: ["target"], additionalProperties: false } } } as ActionDefinition<HomeEventOpenInput, { target: HomeOpenTarget }>,
};
const same = (a: ActionReference, b: ActionReference) => a.capability_id === b.capability_id && a.version === b.version && a.provider_id === b.provider_id;
export function createHomeEventHandlers(client: ActionClient, recommendations: ActionReference): ActionHandlerBinding[] {
  const collect = async (caller: ActionCallContext, window: HomeEventWindow, pinned?: ActionReference): Promise<HomeEventsResult> => {
    assertHomeEventWindow(window);
    const directory = await client.discover(caller);
    const sources = directory.filter(view => view.action.input_type === HOME_EVENTS_INPUT_TYPE && view.action.output_type === HOME_EVENTS_OUTPUT_TYPE
      && (!pinned || same(pinned, { ...view, provider_id: view.provider.provider_id })));
    if (pinned && sources.length !== 1) throw new ActionError("actions.event_source_changed", "原事项提供方已不可访问，请重新读取首页");
    const events: HomeEventView[] = [], issues: string[] = [];
    for (const source of sources) {
      if (!source.availability.available) {
        if (pinned) throw new ActionError(source.availability.code, source.availability.reason);
        issues.push(source.action.title + "：" + source.availability.reason); continue;
      }
      const reference = { capability_id: source.capability_id, version: source.version, provider_id: source.provider.provider_id };
      try {
        const result = await client.invoke(caller, reference, window) as HomeEventCollection;
        const ids = new Set<string>();
        for (const event of result.events) {
          if (ids.has(event.event_id) || !source.action.subject_kinds.includes(event.subject.kind)) throw new ActionError("actions.event_invalid", "插件事项身份重复或超出已声明的对象类型");
          ids.add(event.event_id);
        }
        events.push(...result.events.map(event => ({ ...event, id: JSON.stringify([reference.provider_id, reference.capability_id, event.event_id]), source: reference, origin: result.source, suggested_behavior_ids: [] })));
      } catch (error) {
        if (pinned) throw error;
        issues.push(source.action.title + "：" + (error instanceof ActionError ? error.message : "暂时无法读取事项"));
      }
    }
    if (!pinned && directory.some(view => view.capability_id === recommendations.capability_id && view.version === recommendations.version && view.availability.available)) {
      try {
        const result = await client.invoke(caller, recommendations, {}) as { judgments: Array<{ subject: { kind: string; id: string }; suggested_behavior_ids: string[] }> };
        const bySubject = new Map(result.judgments.map(record => [JSON.stringify([record.subject.kind, record.subject.id]), record.suggested_behavior_ids]));
        for (const event of events) event.suggested_behavior_ids = bySubject.get(JSON.stringify([event.subject.kind, event.subject.id])) ?? [];
      } catch { /* Recommendations are optional; a failed judgment never hides the original event. */ }
    }
    const current = await client.discover(caller);
    const withdrawn = sources.filter(source => !current.some(view => view.capability_id === source.capability_id && view.version === source.version && view.provider.provider_id === source.provider.provider_id && view.availability.available));
    if (pinned && withdrawn.length) throw new ActionError("actions.event_source_changed", "事项提供方在读取期间已失效");
    for (const source of withdrawn) if (!issues.some(issue => issue.startsWith(source.action.title + "："))) issues.push(source.action.title + "：提供方已失效");
    return { events: events.filter(event => !withdrawn.some(source => same(event.source, { ...source, provider_id: source.provider.provider_id }))), issues };
  };
  return [
    { ...homeEventActions.events, handle: (caller, input) => collect(caller, input as HomeEventWindow) },
    { ...homeEventActions.openEvent, handle: async (caller, value) => {
      const input = value as HomeEventOpenInput;
      const event = (await collect(caller, input.window, input.source)).events.find(event => event.event_id === input.event_id);
      if (!event?.open || !isDeepStrictEqual(event.open, input.target)) throw new ActionError("actions.event_changed", "事项或打开目标已变化，请重新读取后选择");
      await caller.validate_authority?.(input.source);
      if (!(await client.discover(caller)).some(view => same(input.source, { ...view, provider_id: view.provider.provider_id }) && view.availability.available)) {
        throw new ActionError("actions.event_source_changed", "原事项提供方已失效，请重新读取首页");
      }
      return { target: event.open };
    } },
  ];
}
