import type { HomeEventView, HomeEventWindow } from "@molis-ai/molis-work-contracts/platform/actions";
export interface HomeFlowInput { now: Date; locale?: string; events: readonly HomeEventView[] }
export interface HomeFlowEvent extends HomeEventView { day: string; when: string; at: number; kind: "me" | "org"; plugin: string; icon: string; lead: string; text: string }
export interface HomeFlowDay { id: string; n: number; week: string; w: string; today: boolean }
export interface HomeFlowSummary { sum: string; lead: string; me: number; org: number }
export interface HomeFlowLabels { todayEmpty: string; empty: string; todaySum: string; daySum: string; attentionLead: string; emptyLead: string }

/** Pure date/presentation factory, serialized into the client after TypeScript compilation. */
export function createHomeFlow() {
  function civilKey(date: Date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }
  function clockLabel(date: Date) { return String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0"); }
  function buildHomeDays(now: Date, locale?: string): HomeFlowDay[] {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + index - 3);
      return { id: civilKey(date), n: date.getDate(), week: new Intl.DateTimeFormat(locale || "zh-CN", { weekday: "long" }).format(date),
        w: new Intl.DateTimeFormat(locale || "zh-CN", { weekday: "narrow" }).format(date), today: index === 3 };
    });
  }
  function buildHomeWindow(now: Date): HomeEventWindow {
    return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3).toISOString(),
      to: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4).toISOString(), now: now.toISOString() };
  }
  function projectHomeEvents(input: HomeFlowInput): HomeFlowEvent[] {
    const days = new Set(buildHomeDays(input.now, input.locale).map(day => day.id)), today = civilKey(input.now);
    return input.events.flatMap(event => {
      const date = new Date(event.occurred_at);
      if (!Number.isFinite(date.getTime())) return [];
      const occurredDay = civilKey(date);
      const day = event.placement === "today" || (event.placement === "active" && !days.has(occurredDay)) ? today : occurredDay;
      if (!days.has(day)) return [];
      return [{ ...event, day, when: clockLabel(date), at: date.getTime(), kind: event.category === "organization" ? "org" as const : "me" as const,
        plugin: event.origin.surface, icon: event.origin.icon, lead: event.summary, text: event.content }];
    }).sort((left, right) => left.at - right.at || left.id.localeCompare(right.id));
  }
  function eventsOnDay(events: readonly HomeFlowEvent[], dayId: string) { return events.filter(event => event.day === dayId); }
  function summarizeDay(day: HomeFlowDay, events: readonly HomeFlowEvent[], labels: HomeFlowLabels): HomeFlowSummary {
    const me = events.filter(event => event.kind === "me").length, org = events.filter(event => event.kind === "org").length;
    return { sum: events.length ? (day.today ? labels.todaySum : labels.daySum).replace("{n}", String(events.length)) : day.today ? labels.todayEmpty : labels.empty,
      lead: !events.length ? labels.emptyLead : events.some(event => event.needs_attention) ? labels.attentionLead : events.slice(0, 2).map(event => event.title).join("；"), me, org };
  }
  return { civilKey, clockLabel, buildHomeDays, buildHomeWindow, projectHomeEvents, eventsOnDay, summarizeDay };
}
const homeFlow = createHomeFlow();
export const { civilKey, clockLabel, buildHomeDays, buildHomeWindow, projectHomeEvents, eventsOnDay, summarizeDay } = homeFlow;
