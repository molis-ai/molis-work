import { feedErrors } from "@molis-ai/molis-work-contracts/modules/feed";
import type { HomePluginDatabaseDeclaration, PluginDatabaseReader, PluginDatabaseTransaction } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * Feed's Home reference ledger (specs/repository-anti-corruption/slices/feed-inbox-home-reference-ledger.md §3.2).
 *
 * Evidence bodies live in the Home, content-addressed, so one body can be held by sources of several projects. The ledger says which
 * (project, source) holds which body, and nothing else: no content, and no way to read another project's library. It is a superset of what is
 * really referenced: a body is held before it is written and released only after its source's rows are gone, so a crash can leave a row too
 * many (a body kept longer) and never one too few (a body that something still points at, deleted).
 *
 * Rows rather than counts keep both directions idempotent: a hold is `INSERT OR IGNORE`, a release is a delete by holder, and a replay
 * after a crash cannot miscount.
 */
const FEED_CONTENT_LEDGER_SCHEMA = `
  CREATE TABLE feed_content_holds (
    content_ref TEXT NOT NULL,
    project_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    PRIMARY KEY (content_ref, project_id, source_id)
  );
  CREATE INDEX feed_content_holds_by_holder ON feed_content_holds (project_id, source_id);
  CREATE TABLE feed_content_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;
/** The Home library the Feed's Home half is given (`services.database`). */
export const FEED_HOME_DATABASE: HomePluginDatabaseDeclaration = { store_name: "feed-content", version: 1,
  read_permission: "feed:read", write_permission: "feed:write", schema: FEED_CONTENT_LEDGER_SCHEMA };

/** The only bodies this ledger counts: what the Home's evidence store names. A reference to anything else (a research note) is not its. */
const BODY_REF = /^molis-work-feed\/sha256\/[0-9a-f]{64}$/u;
const COMPLETE = "complete_since";
/** Most references one call may name, so a hold or release is one bounded write. */
export const FEED_CONTENT_LEDGER_BATCH = 5_000;

/** The evidence store as the ledger needs it: delete what nothing refers to. The store cannot see who holds a body, so the ledger answers. */
export interface FeedEvidenceCollector {
  collect(input: { candidates: Iterable<string>; isReferenced(contentRef: string): boolean }): { deleted: string[]; kept: string[] };
}

export interface FeedContentLedgerStore {
  readonly read: PluginDatabaseReader;
  /** One synchronous write transaction that takes the library's write lock first (`BEGIN IMMEDIATE`) and rolls back on any throw. */
  write<T>(beforeEffect: () => Promise<void>, body: (transaction: PluginDatabaseTransaction) => T): Promise<T>;
}

export interface FeedContentHolder { project_id: string; source_id: string }
export interface FeedContentRelease { bodies_deleted: number; bodies_kept: number; complete: boolean }
export interface FeedContentReclaim extends FeedContentRelease { holds_released: number }

const bodies = (refs: readonly string[], what: string): string[] => {
  if (!Array.isArray(refs) || refs.length > FEED_CONTENT_LEDGER_BATCH) throw feedErrors.request_invalid(what + "一次最多 " + FEED_CONTENT_LEDGER_BATCH + " 份正文");
  return [...new Set(refs.filter((ref): ref is string => typeof ref === "string" && BODY_REF.test(ref)))];
};

export function createFeedContentLedger(store: FeedContentLedgerStore, evidence: FeedEvidenceCollector) {
  const marked = (reader: PluginDatabaseReader) => reader.get("SELECT value FROM feed_content_meta WHERE key = ?", [COMPLETE]) !== null;
  return {
    /** Whether the ledger is known to hold every reference there already was (written once by a new Home, or by the maintenance that read every project). */
    isComplete: () => marked(store.read),
    markComplete: (beforeEffect: () => Promise<void>, at: string) => store.write(beforeEffect, tx => {
      tx.run("INSERT OR IGNORE INTO feed_content_meta (key, value) VALUES (?, ?)", [COMPLETE, at]);
    }),
    /** Record that this source holds these bodies. Done before the bodies are written, and only after it returns may a write go ahead. */
    hold: async (beforeEffect: () => Promise<void>, holder: FeedContentHolder, contentRefs: readonly string[]) => {
      const refs = bodies(contentRefs, "登记");
      return store.write(beforeEffect, tx => {
        for (const ref of refs) tx.run("INSERT OR IGNORE INTO feed_content_holds (content_ref, project_id, source_id) VALUES (?, ?, ?)", [ref, holder.project_id, holder.source_id]);
        return { held: refs.length };
      });
    },
    /**
     * Takes back the holds a pull left behind: a pull holds every body before it writes it, so a pull that failed, was cancelled or lost its
     * authority (or a crash) can leave this source holding bodies none of its rows point at. The caller names exactly those and vouches that
     * none of its rows refers to them, under the source's sync lease so that no pull of the source is writing at the time. Only this source's
     * hold on each goes, then each one nobody else holds is deleted, in one transaction like a release. Without the completeness mark nothing goes.
     */
    reclaim: async (beforeEffect: () => Promise<void>, holder: FeedContentHolder, unreferenced: readonly string[]): Promise<FeedContentReclaim> => {
      const refs = bodies(unreferenced, "收回");
      return store.write(beforeEffect, tx => {
        if (!marked(tx)) return { holds_released: 0, bodies_deleted: 0, bodies_kept: refs.length, complete: false };
        let released = 0;
        for (const ref of refs) released += Number(tx.run("DELETE FROM feed_content_holds WHERE content_ref = ? AND project_id = ? AND source_id = ?", [ref, holder.project_id, holder.source_id]).changes);
        const { deleted, kept } = evidence.collect({ candidates: refs, isReferenced: ref => tx.get("SELECT 1 AS held FROM feed_content_holds WHERE content_ref = ? LIMIT 1", [ref]) !== null });
        return { holds_released: released, bodies_deleted: deleted.length, bodies_kept: kept.length, complete: true };
      });
    },
    /**
     * The source's rows go, then each candidate nobody else holds. The files are deleted inside the write transaction, before it commits:
     * a hold waits for the same lock, so it sees either the rows and the file intact or the file gone (and writes it again), never a
     * file about to be deleted. A transaction that fails part way restores the rows; a file already deleted was nobody's.
     * Without the completeness mark the ledger cannot say "nobody", so nothing is deleted.
     */
    release: async (beforeEffect: () => Promise<void>, holder: FeedContentHolder, candidates: readonly string[]): Promise<FeedContentRelease> => {
      const refs = bodies(candidates, "释放");
      return store.write(beforeEffect, tx => {
        if (!marked(tx)) return { bodies_deleted: 0, bodies_kept: refs.length, complete: false };
        tx.run("DELETE FROM feed_content_holds WHERE project_id = ? AND source_id = ?", [holder.project_id, holder.source_id]);
        const { deleted, kept } = evidence.collect({ candidates: refs, isReferenced: ref => tx.get("SELECT 1 AS held FROM feed_content_holds WHERE content_ref = ? LIMIT 1", [ref]) !== null });
        return { bodies_deleted: deleted.length, bodies_kept: kept.length, complete: true };
      });
    },
  };
}
export type FeedContentLedger = ReturnType<typeof createFeedContentLedger>;
