import assert from "node:assert/strict";
import test from "node:test";

import { createFeedSourceSyncLease } from "@molis-ai/molis-work-plugin-feed";

/**
 * FI-6 (specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md §3.6): the claim on a source is Feed's own, kept in the
 * instance. The end-to-end case — a second sync of a source that is mid-pull is refused through the services — is `feed-sync-concurrency.test.ts`.
 */
test("RAC-512: a source being pulled cannot be pulled again until the pull lets go", () => {
  const lease = createFeedSourceSyncLease();
  const release = lease("project-a", "source-1");
  assert.throws(() => lease("project-a", "source-1"), { code: "feed.source_sync_interrupted" });
  release();
  lease("project-a", "source-1")();
});

test("RAC-512: the same source id in another project is another claim, and so is another source of the same project", () => {
  const lease = createFeedSourceSyncLease();
  const releases = [lease("project-a", "source-1"), lease("project-b", "source-1"), lease("project-a", "source-2")];
  for (const release of releases) release();
});

test("RAC-512: a release that runs twice does not free the claim of the pull that came after it", () => {
  const lease = createFeedSourceSyncLease();
  const first = lease("project-a", "source-1");
  first();
  const second = lease("project-a", "source-1");
  first();
  assert.throws(() => lease("project-a", "source-1"), { code: "feed.source_sync_interrupted" });
  second();
  lease("project-a", "source-1")();
});

test("RAC-512: an instance's claims are its own: a replaced instance starts with none", () => {
  const old = createFeedSourceSyncLease();
  old("project-a", "source-1");
  createFeedSourceSyncLease()("project-a", "source-1")();
});
