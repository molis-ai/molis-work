import type { IntegrationProviderItem, IntegrationProviderSyncResult } from "@molis-ai/molis-work-contracts/platform/plugin";
type ConnectorIngestItem = IntegrationProviderItem;
type ConnectorSyncSuccess = Extract<IntegrationProviderSyncResult, { ok: true }>;

export const FIXTURE_MAIL: ConnectorIngestItem[] = [
  {
    externalId: "gmail-msg-a1",
    title: "Investor update - Q3 metrics",
    summary: "Please review the attached deck before Thursday call",
    body: "Hi - could you draft a short reply confirming attendance?",
    kind: "message",
    priority: "high",
    tags: ["gmail", "investor"],
    author: "partner@example.com",
  },
  {
    externalId: "gmail-msg-b2",
    title: "CI failure notification",
    summary: "relay main branch build failed on ubuntu-latest",
    kind: "notification",
    priority: "medium",
    tags: ["gmail", "ci"],
    author: "notifications@github.com",
  },
];

export function fixtureSuccess(items: ConnectorIngestItem[]): ConnectorSyncSuccess {
  return {
    ok: true,
    mode: "fixture",
    items: items.slice(0),
    cursor: {
      historyId: "fixture-complete",
      mode: "fixture",
    },
  };
}
