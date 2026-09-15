import type { FeedSourceSchedule, InboxEntryReason } from "@molis-ai/molis-work-plugin-feed";

export interface ProviderContractFixture {
  provider: "github" | "gmail" | "rss";
  source: {
    source_id: string;
    sync_kind: "github" | "gmail" | "public_source";
    external_id: string;
    schedule: FeedSourceSchedule;
  };
  cursor_before: unknown;
  cursor_after: unknown;
  creates_attention: false | { reason: InboxEntryReason };
  message: {
    title: string;
    summary: string;
    body: string;
  };
}

/**
 * Sanitized, provider-independent fixtures for adapter and migration contracts.
 * They contain no credentials or real account data and are safe to serialize in tests.
 */
export const PROVIDER_CONTRACT_FIXTURES: readonly ProviderContractFixture[] = [
  {
    provider: "github",
    source: {
      source_id: "fixture-source-github",
      sync_kind: "github",
      external_id: "issue:418",
      schedule: { mode: "manual" },
    },
    cursor_before: { since: "2026-08-29T00:00:00.000Z" },
    cursor_after: { since: "2026-08-30T00:00:00.000Z" },
    creates_attention: { reason: "source_rule" },
    message: {
      title: "PR #418 needs review",
      summary: "A review request from a connected repository.",
      body: "Untrusted GitHub body fixture.",
    },
  },
  {
    provider: "gmail",
    source: {
      source_id: "fixture-source-gmail",
      sync_kind: "gmail",
      external_id: "message:18c0ffee",
      schedule: { mode: "manual" },
    },
    cursor_before: { historyId: "100" },
    cursor_after: { historyId: "101" },
    creates_attention: { reason: "source_rule" },
    message: {
      title: "Please confirm the launch checklist",
      summary: "A read-only Gmail message fixture.",
      body: "Untrusted Gmail body fixture.",
    },
  },
  {
    provider: "rss",
    source: {
      source_id: "fixture-source-rss",
      sync_kind: "public_source",
      external_id: "https://example.com/posts/contract",
      schedule: { mode: "interval", enabled: true, interval_minutes: 60, next_pull_at: null },
    },
    cursor_before: {},
    cursor_after: { last_seen_at: "2026-08-30T00:00:00.000Z" },
    creates_attention: false,
    message: {
      title: "A public RSS update",
      summary: "A public feed fixture that remains in Feed by default.",
      body: "Untrusted RSS body fixture.",
    },
  },
] as const;
