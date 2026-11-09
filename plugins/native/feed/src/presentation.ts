import { ActionError, bindActionHandler, PERSONAL_SPACE_PROJECT_ID, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import { bindPresentationValuesHandler, definePresentationOverviewAction, definePresentationValuesAction, PRESENTATION_LIMITS,
  type PresentationDeclaration, type PresentationHeldIn, type PresentationValueItem } from "@molis-ai/molis-work-contracts/platform/presentation";
import { sourceDeletedAt, type SourceQuery, type SourceRecord } from "./contract/sources.js";
import { feedPresentationRecords } from "./store/presentation.js";

const values = definePresentationValuesAction("feed.presentation.values", /* @version action.feed.presentation.values */ 1, ["feed_item", "source"], "Feed 显示字段", ["feed:read"]);
const overview = definePresentationOverviewAction("feed.presentation.overview", /* @version action.feed.presentation.overview */ 1, "Feed 首页概况", ["feed:read"]);
export const feedPresentationActions = [values, overview];

const fields = [{ key: "title", role: "title" }, { key: "status", role: "status" }, { key: "updated_at", role: "updated_at" },
  { key: "origin", role: "origin" }, { key: "held_in", role: "held_in" }] as const;
const forms = { row: { fields: ["title", "status", "updated_at", "origin", "held_in"] } } as const;
export const feedPresentation = {
  objects: [
    { kind: "feed_item", fields, forms, status: { field: "status", map: { read: { ring: "read" }, unread: { ring: "unread" } } } },
    { kind: "source", fields, forms, status: { field: "status", map: { active: { ring: "connected" }, paused: { ring: "paused" },
      error: { ring: "failed", attention: "failed" }, disconnected: { ring: "disconnected" } } } },
  ],
  overview: { capability_id: overview.capability_id, version: overview.version, note: { key: "feed.presentation.note" } },
} as const satisfies PresentationDeclaration;

export const FEED_PRESENTATION_MESSAGES = {
  "feed.presentation.empty": { zh: "还没有收到资料", en: "No materials yet" },
  "feed.presentation.summary": { zh: "近期收到的资料和来源状态", en: "Recent materials and source status" },
  "feed.presentation.note": { zh: "同步来的资料不算你接下的工作。", en: "Synced material does not count as work you took on." },
} as const;

const heldIn = (source: SourceRecord): PresentationHeldIn => source.project_id === PERSONAL_SPACE_PROJECT_ID ? "personal" : "project";
const gone = (subject: ActionSubject): PresentationValueItem => ({ subject, revision: "0", state: "deleted" });

export function createFeedPresentationHandlers(projectId: string, items: ReturnType<typeof feedPresentationRecords>, sources: SourceQuery) {
  const currentSource = (id: string) => {
    try {
      const source = sources.get(projectId, id);
      return source.project_id === projectId && !sourceDeletedAt(source) ? source : undefined;
    } catch (error) {
      if (error instanceof ActionError && error.code === "sources.not_found") return undefined;
      throw error;
    }
  };
  return [
    bindPresentationValuesHandler(values, input => {
      const readSources = new Map<string, SourceRecord | undefined>();
      const sourceAt = (id: string) => {
        if (!readSources.has(id)) readSources.set(id, currentSource(id));
        return readSources.get(id);
      };
      return { items: input.subjects.flatMap((subject): PresentationValueItem[] => {
        if (subject.kind === "source") {
          const source = sourceAt(subject.id);
          return [source ? { subject, revision: source.updated_at, state: "ok",
            values: { title: source.name, status: source.status, updated_at: source.updated_at, held_in: heldIn(source) } } : gone(subject)];
        }
        if (subject.kind !== "feed_item") return [];
        const item = items.item(subject.id);
        if (!item) return [gone(subject)];
        const source = item.source_id && (input.fields.includes("held_in") || input.fields.includes("origin")) ? sourceAt(item.source_id) : undefined;
        return [{ subject, revision: source ? `${item.revision}:${source.updated_at}` : String(item.revision), state: "ok",
          values: { title: item.title, status: item.read_at ? "read" : "unread", updated_at: item.updated_at, origin: source?.name ?? item.source_label,
            ...(source ? { held_in: heldIn(source) } : {}) } }];
      }) };
    }),
    bindActionHandler(overview, () => {
      const limit = PRESENTATION_LIMITS.overview_subjects;
      const faults = sources.list(projectId).filter(source => source.status === "error" || source.status === "disconnected")
        .slice(0, limit).map(source => ({ kind: "source", id: source.source_id }));
      const subjects = [...faults, ...items.recent(limit - faults.length).map(item => ({ kind: "feed_item", id: item.item_id }))];
      return { summary: { key: subjects.length ? "feed.presentation.summary" : "feed.presentation.empty" }, subjects, start: [] };
    }),
  ];
}
