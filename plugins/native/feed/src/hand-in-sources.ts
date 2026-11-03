import type { ActionAudience } from "@molis-ai/molis-work-contracts/platform/actions";
import type { FeedApplication } from "./application.js";
import type { FeedSourceRecord } from "./projection.js";

/** Where Feed keeps what is handed to it: a workflow's handoffs, and everything else that is put in (a person through placement or a
 * floating bar, an assistant, MCP). The caller's audience decides which, never the input; neither is a source someone follows, so
 * neither is offered to system search. */
const HAND_IN_SOURCES = {
  workflow: { id: "workflow-handoffs", kind: "workflow", name: "工作流程", description: "工作流程交给 Feed 或 Inbox 的内容" },
  other: { id: "hand-ins", kind: "hand_in", name: "放进来的内容", description: "经放置、浮条、助理或 MCP 放进 Feed 或 Inbox 的内容" },
} as const;

const handInFor = (audience: ActionAudience) => audience === "workflow" ? HAND_IN_SOURCES.workflow : HAND_IN_SOURCES.other;

/** Whether a source only holds what was handed over (kept out of system search). */
export function isHandInSource(sourceId: string): boolean {
  return sourceId === HAND_IN_SOURCES.workflow.id || sourceId === HAND_IN_SOURCES.other.id;
}

/** The source a delivery from this audience is filed under, made on the first delivery. */
export function handInSourceFor(feed: FeedApplication, projectId: string, audience: ActionAudience, now: string): FeedSourceRecord {
  const hand = handInFor(audience);
  return feed.snapshot(projectId).sources.find(source => source.source_id === hand.id) ?? feed.sources.upsert({
    project_id: projectId, source_id: hand.id, kind: hand.kind, definition_id: null, sync_kind: "manual",
    name: hand.name, description: hand.description, status: "active", enabled: true, origin: "molis_work",
    config: {}, schedule: { mode: "manual" }, credential_ref: null, account_label: null, last_sync_at: null,
    last_outcome: null, last_error_code: null, imported_at: now, updated_at: now, item_count: 0, cursor: null,
  });
}
