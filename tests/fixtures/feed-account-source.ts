import { DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { GMAIL_DEFAULT_SCOPE } from "@molis-ai/molis-work-integration-gmail/scope";
import type { FeedSourceRecord } from "@molis-ai/molis-work-plugin-feed";

/** An account Source as Feed keeps one; tests choose its connection and status. */
export function accountSourceRecord(kind: "github" | "gmail", overrides: Partial<FeedSourceRecord> = {}): FeedSourceRecord {
  const at = "2026-08-30T09:00:00.000Z";
  return {
    project_id: DEMO_PROJECT_ID, source_id: `${kind}-account`, kind, definition_id: kind, sync_kind: kind,
    name: kind === "github" ? "GitHub" : "Gmail", description: "", status: "disconnected", enabled: true, item_count: 0,
    origin: "molis_work", config: kind === "gmail" ? { scope: GMAIL_DEFAULT_SCOPE } : {}, schedule: { mode: "manual" }, cursor: {},
    credential_ref: null, account_label: null, last_sync_at: null, last_outcome: null, last_error_code: null,
    imported_at: at, updated_at: at, ...overrides,
  };
}
