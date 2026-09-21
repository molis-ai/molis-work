import type {
  AttentionEntryRecord,
} from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import {
  buildInboxUiEntries,
  type InboxSubjectRef,
  type InboxUiModel,
  type InboxUiPrimitives,
  type InboxUiSurface,
} from "@molis-ai/molis-work-plugin-inbox";
import { icon } from "@molis-ai/molis-work-design-system";
import { renderInboxContribution } from "./ui-composition.js";
import type { MolisWorkWebView } from "./page-view.js";

export function createWorkbenchInboxProjectionRenderer(primitives: {
  L(text: string, values?: Record<string, string | number>): string;
  dateTimeLocale(): string;
}) {
  const { L, dateTimeLocale } = primitives;

  function buildInboxNativePluginModel(view: MolisWorkWebView): InboxUiModel {
    const records = view.feed.inbox_entries.map((entry) => ({
      ...entry,
      project_id: entry.board_id,
      suggested_behavior_ids: entry.suggested_behavior_ids ?? [],
    }));
    return {
      route_prefix: view.route_prefix,
      entries: buildInboxUiEntries(records, (entry) => resolveSubject(entry, view, L), L),
      filter: "active",
      primitives: inboxUiPrimitives,
    };
  }

  function renderInboxNativePluginSurface(view: MolisWorkWebView, surface: InboxUiSurface): string {
    return renderInboxContribution(surface, buildInboxNativePluginModel(view));
  }

  const inboxUiPrimitives: InboxUiPrimitives = {
    escape: escapeHtml,
    icon,
    text: L,
    formatDate(value) {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return new Intl.DateTimeFormat(dateTimeLocale(), {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    },
  };

  return { buildInboxNativePluginModel, renderInboxNativePluginSurface };
}

function resolveSubject(
  entry: AttentionEntryRecord,
  view: MolisWorkWebView,
  L: (text: string, values?: Record<string, string | number>) => string,
): InboxSubjectRef {
  if (entry.subject_type === "feed_item") {
    const item = view.feed.feed_items.find((candidate) => candidate.item_id === entry.subject_id) ?? null;
    return {
      available: Boolean(item),
      title: item?.title || L("原 Feed Item 已不可用"),
      source_label: item?.source_label || item?.source_kind || "Feed",
      open: item ? { kind: "feed", item_id: item.item_id } : null,
    };
  }
  if (entry.subject_type === "source_fault") {
    const source = view.feed.sources.find((candidate) => candidate.source_id === entry.subject_id) ?? null;
    return {
      available: Boolean(source),
      title: source ? L("来源「{source}」需要处理", { source: source.name }) : L("原来源已不可用"),
      source_label: source?.name || L("其他来源"),
      open: source ? { kind: "source", source_id: source.source_id } : null,
    };
  }
  const goal = [...view.goals, ...view.archived_goals, ...view.trashed_goals]
    .find((candidate) => candidate.goal.goal_id === entry.subject_id) ?? null;
  return {
    available: Boolean(goal),
    title: goal?.goal.title || L("原 Goal 已不可用"),
    source_label: "Molis Work",
    open: goal ? { kind: "goal", href: `${view.route_prefix}/goals/${encodeURIComponent(goal.goal.goal_id)}` } : null,
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
