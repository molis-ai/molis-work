import type { FeedSourceRecord } from "./projection.js";

/**
 * The key a source goes by in the Home's integration registry (PG-046): `github` and `gmail` sources are their own integration, and
 * a `connector` source is the directory connector it was made from (`kind`). A source that reads no account (`public_source`,
 * `manual`) has none. This is the one place a source row is read for the registry; the registry itself takes only the key.
 */
export function integrationKeyOf(source: Pick<FeedSourceRecord, "sync_kind" | "kind">): string | null {
  if (source.sync_kind === "github" || source.sync_kind === "gmail") return source.sync_kind;
  return source.sync_kind === "connector" ? source.kind : null;
}
