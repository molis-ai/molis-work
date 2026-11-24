import type { ActionSubject, OpenTarget } from "@molis-ai/molis-work-contracts/platform/actions";
import type { Mainline, MainlineCounts, MainlineGroup, MainlineItemSource } from "@molis-ai/molis-work-contracts/services/mainline";
import { t as uiText } from "./mainline-ui.js";

export interface MainlineResolvedItem {
  readonly item_id: string;
  readonly state: "ok" | "missing" | "denied";
  readonly title: string;
  readonly light: boolean;
  readonly source: ActionSubject | null;
  readonly presentation?: { readonly markup: string; readonly done: boolean };
  readonly plugin_title: string | null;
  readonly open: OpenTarget | null;
}

export interface MainlineSourceView extends MainlineItemSource {
  readonly label: string;
}

export interface MainlineViewResponse {
  readonly mainline: Mainline;
  readonly sources: readonly MainlineSourceView[];
  readonly counts: MainlineCounts;
  readonly resolved: Readonly<Record<string, MainlineResolvedItem>>;
  readonly task_items: Readonly<Record<string, { readonly item_id: string; readonly name: string }>>;
}

export interface MainlineContentEntryView {
  readonly subject: ActionSubject;
  readonly origin: "held" | "related" | "association";
  readonly removable: boolean;
  readonly state: "ok" | "missing" | "denied";
  readonly title: string;
  readonly kind_label: string;
  readonly presentation?: { readonly markup: string; readonly done: boolean };
  readonly plugin_title: string | null;
  readonly open: { readonly surface: string; readonly id: string; readonly title: string } | null;
}

export interface WorkItemSummary {
  readonly item_id: string;
  readonly name: string;
  readonly state: "ok" | "missing" | "denied";
  readonly group_id: string | null;
  readonly completed: boolean;
  readonly waiting: number;
  readonly running: number;
  readonly source: ActionSubject | null;
  readonly light: boolean;
}

export interface WorkItemChangedDetail {
  readonly item_id: string | null;
  readonly item_name: string | null;
  readonly previous_id: string | null;
  readonly first_entry: boolean;
  readonly source: ActionSubject | null;
  readonly other_waiting: number;
  readonly revision: string;
  readonly sources: readonly MainlineSourceView[];
  readonly items: readonly WorkItemSummary[];
  readonly task_items: Readonly<Record<string, { readonly item_id: string; readonly name: string }>>;
}

export function groupDisplayName(group: MainlineGroup): string {
  if (group.name) return group.name;
  if (group.default === "now") return uiText.text("workbench.mainline.group-now");
  if (group.default === "next") return uiText.text("workbench.mainline.group-next");
  if (group.default === "waiting") return uiText.text("workbench.mainline.group-waiting");
  return group.group_id;
}

export function itemDisplayTitle(resolved: MainlineResolvedItem | undefined, fallbackName?: string): string {
  if (resolved?.state === "missing") return uiText.text("workbench.mainline.item-missing");
  if (resolved?.state === "denied") return uiText.text("workbench.mainline.item-denied");
  return resolved?.title || fallbackName || "";
}

export function otherItemsWaitingCount(view: MainlineViewResponse, currentId: string | null): number {
  if (!currentId) return 0;
  let total = 0;
  for (const group of view.mainline.groups) {
    for (const entry of group.items) {
      if (entry.item_id === currentId) continue;
      total += view.counts.items[entry.item_id]?.waiting ?? 0;
    }
  }
  return total;
}

export function buildWorkItemSummaries(view: MainlineViewResponse): WorkItemSummary[] {
  const groupOf = new Map<string, string>();
  for (const group of view.mainline.groups) {
    for (const entry of group.items) groupOf.set(entry.item_id, group.group_id);
  }
  const doneSet = new Set(view.mainline.completed);
  return view.mainline.items.map((item) => {
    const res = view.resolved[item.item_id];
    const counts = view.counts.items[item.item_id] ?? { waiting: 0, running: 0 };
    return {
      item_id: item.item_id,
      name: itemDisplayTitle(res, item.name),
      state: res?.state ?? "ok",
      group_id: groupOf.get(item.item_id) ?? null,
      completed: doneSet.has(item.item_id) || Boolean(res?.presentation?.done),
      waiting: counts.waiting,
      running: counts.running,
      source: item.source ?? null,
      light: !item.source,
    };
  });
}
