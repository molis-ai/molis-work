import { ActionError, bindActionHandler, type ActionCallContext, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import { bindPresentationValuesHandler, definePresentationOverviewAction, definePresentationValuesAction, PRESENTATION_LIMITS,
  type PresentationDeclaration, type PresentationValueItem } from "@molis-ai/molis-work-contracts/platform/presentation";
import { actionErrorKind } from "@molis-ai/molis-work-plugin-sdk";
import type { InboxActionPorts } from "./actions.js";
import { briefsOf, inboxOrigin, sameInboxEntry, type InboxContentPorts } from "./content-actions.js";

const values = definePresentationValuesAction("inbox.presentation.values", /* @version action.inbox.presentation.values */ 1, ["inbox_entry"], "Inbox 事项显示字段", ["inbox:read"]);
const overview = definePresentationOverviewAction("inbox.presentation.overview", /* @version action.inbox.presentation.overview */ 1, "Inbox 首页概况", ["inbox:read"]);
export const inboxPresentationActions = [values, overview];

export const inboxPresentation = {
  objects: [{
    kind: "inbox_entry",
    fields: [{ key: "title", role: "title" }, { key: "status", role: "status" }, { key: "updated_at", role: "updated_at" },
      { key: "origin", role: "origin" }, { key: "summary", role: "summary" }, { key: "judgment", role: "judgment" }],
    status: { field: "status", map: { open: { ring: "waiting" }, in_progress: { ring: "running" } } },
    forms: { chip: { fields: ["title"] }, row: { fields: ["title", "status", "updated_at", "origin"] },
      card: { fields: ["title", "status", "updated_at", "origin", "summary", "judgment"] }, peek: { fields: ["title", "status", "updated_at", "origin", "summary", "judgment"] } },
    text: { lines: ["title", "status", "updated_at", "origin", "summary", "judgment"] },
  }],
  overview: { capability_id: overview.capability_id, version: overview.version },
} as const satisfies PresentationDeclaration;

export const INBOX_PRESENTATION_MESSAGES = {
  "inbox.presentation.empty": { zh: "没有待处理的事项", en: "No pending items" },
  "inbox.presentation.summary": { zh: "最近更新的待处理事项", en: "Recently updated pending items" },
  "inbox.presentation.judgment": { zh: "有下一步建议", en: "Next step available" },
  "inbox.presentation.manual": { zh: "手动加入", en: "Added manually" },
  "inbox.presentation.source_rule": { zh: "来源规则加入", en: "Added by a source rule" },
  "inbox.presentation.goal_decision": { zh: "目标待决定", en: "Goal decision pending" },
  "inbox.presentation.source_fault": { zh: "来源故障", en: "Source problem" },
  "inbox.presentation.artifact_out_failed": { zh: "成果发出失败", en: "Delivery failed" },
} as const;

type ContentEntry = ReturnType<InboxContentPorts["entry"]>;
const isOpen = (entry: ContentEntry) => entry.status === "open" || entry.status === "in_progress";
const originUnavailable = (error: unknown) => {
  const kind = actionErrorKind(error);
  return kind === "forbidden" || kind === "not_found" || error instanceof ActionError && error.code === "actions.dependency_missing";
};
const noItem = (subject: ActionSubject, state: "forbidden" | "deleted"): PresentationValueItem => ({ subject, revision: "0", state });
const entryAt = (ports: InboxContentPorts, id: string): ContentEntry | undefined => {
  try { return ports.entry(id); }
  catch (error) {
    if (error instanceof ActionError && error.code === "inbox.entry_not_found") return undefined;
    throw error;
  }
};

async function visibleEntries(ports: InboxContentPorts, caller: ActionCallContext, entries: readonly ContentEntry[],
  recommendations?: InboxActionPorts["recommendations"]) {
  const [briefs, suggested] = await Promise.all([
    briefsOf(ports, caller, entries).catch(error => {
      if (!originUnavailable(error)) throw error;
      return { items: new Map(), sources: new Map() } satisfies Awaited<ReturnType<typeof briefsOf>>;
    }),
    recommendations?.(caller, new Set(entries.map(entry => entry.entry_id))).catch(error => {
      if (!originUnavailable(error)) throw error;
      return { judgments: [] };
    }),
  ]);
  const results = await Promise.all(entries.map(async entry => {
    const origin = inboxOrigin(entry);
    const item = origin.kind === "feed_item" ? briefs.items.get(origin.id) : undefined;
    const source = origin.kind === "source" ? briefs.sources.get(origin.id) : undefined;
    const goal = origin.kind === "goal" ? await ports.readSubject?.(origin, caller).catch(error => {
      if (originUnavailable(error)) return undefined;
      throw error;
    }) : undefined;
    if (!item && !source && !goal || item?.disposition === "archived") return undefined;
    const judgment = suggested?.judgments.some(record => record.subject.id === entry.entry_id && record.outcome === "ok" && (record.recommended_actions?.length || record.suggested_behavior_ids.length) > 0);
    return { entry, title: item?.title ?? source?.name ?? goal?.title, origin: item?.source_label ?? source?.name, judgment };
  }));
  await caller.validate_permissions?.(["inbox:read"]);
  caller.assert_authority_current?.();
  caller.signal?.throwIfAborted();
  return results.flatMap(result => {
    if (!result) return [];
    const current = entryAt(ports, result.entry.entry_id);
    return current && isOpen(current) && sameInboxEntry(current, result.entry) ? [result] : [];
  });
}

export function createInboxPresentationHandlers(ports: InboxContentPorts, recommendations?: InboxActionPorts["recommendations"]) {
  return [
    bindPresentationValuesHandler(values, async (input, caller) => {
      const subjects = input.subjects.filter(subject => subject.kind === "inbox_entry");
      const entries = subjects.flatMap(subject => { const entry = entryAt(ports, subject.id); return entry && isOpen(entry) ? [entry] : []; });
      const readable = new Map((await visibleEntries(ports, caller, entries, input.fields.includes("judgment") ? recommendations : undefined))
        .map(result => [result.entry.entry_id, result]));
      return { items: subjects.map((subject): PresentationValueItem => {
        const found = readable.get(subject.id);
        if (!found) return noItem(subject, entries.some(entry => entry.entry_id === subject.id) ? "forbidden" : "deleted");
        const { entry, title, origin, judgment } = found;
        return { subject, revision: String(entry.revision), state: "ok", values: { title, status: entry.status, updated_at: entry.updated_at,
          ...(origin ? { origin } : {}), summary: { key: `inbox.presentation.${entry.reason}` },
          ...(judgment ? { judgment: { label: { key: "inbox.presentation.judgment" } } } : {}) } };
      }) };
    }),
    bindActionHandler(overview, async (_input, caller) => {
      const entries = ports.entries().filter(isOpen).sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.entry_id.localeCompare(b.entry_id));
      const readable = (await visibleEntries(ports, caller, entries)).slice(0, PRESENTATION_LIMITS.overview_subjects);
      return { summary: { key: readable.length ? "inbox.presentation.summary" : "inbox.presentation.empty" },
        subjects: readable.map(({ entry }) => ({ kind: "inbox_entry", id: entry.entry_id })), start: [] };
    }),
  ];
}
