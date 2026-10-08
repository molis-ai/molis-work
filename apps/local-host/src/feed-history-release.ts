import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  LocalSqliteStorage, createEvidenceContentStore, createLazyFileSecretStore, resolveMolisWorkHome, resolveProjectDatabaseFile,
  type EvidenceContentStore, type SqliteDatabase,
} from "@molis-ai/molis-work-storage";
import { receiptContentRefs, type FeedSourceHistory } from "@molis-ai/molis-work-plugin-feed";
import { forgetIntelligenceOperations } from "./search-intelligence-client.js";

/**
 * Deletes what a source's local history left outside the project database. The evidence store belongs to the whole
 * Home and is content-addressed, so a body can be held by an Item of another source, by a pull of another source, or by
 * another project; it goes only when every holder has been read and none refers to it.
 */
export function createFeedHistoryRelease(db: SqliteDatabase): FeedSourceHistory {
  let content: EvidenceContentStore | undefined;
  return {
    release(input) {
      if (input.content_refs.length === 0 && input.operation_ids.length === 0) return { bodies_deleted: 0, bodies_kept: 0, records_deleted: 0, complete: true };
      // The pulls are gone from the project database, so their search records belong to nothing.
      let records = 0;
      let complete = true;
      try {
        records = forgetIntelligenceOperations(db, input.operation_ids);
      } catch {
        complete = false;
      }
      const held = homeContentReferences(db);
      if (!held) return { bodies_deleted: 0, bodies_kept: input.content_refs.length, records_deleted: records, complete: false };
      // A deletion binds the Home it is made in; unlocking credentials is not needed to remove a file.
      content ??= createEvidenceContentStore({ secretStore: createLazyFileSecretStore() });
      const { deleted, kept } = content.collect({ candidates: input.content_refs, isReferenced: (ref) => held.has(ref) });
      return { bodies_deleted: deleted.length, bodies_kept: kept.length, records_deleted: records, complete };
    },
  };
}

/**
 * Every evidence body something in the Home still points at: Feed materials and the bodies named on pull receipts (the
 * search record of a pull holds them too), in this project and in every other project database of the Home. Null when
 * any of them cannot be read, because then nothing can be proven unreferenced.
 */
export function homeContentReferences(db: SqliteDatabase): Set<string> | null {
  const refs = new Set<string>();
  try {
    addContentReferences(db, refs);
    for (const file of projectDatabaseFiles()) {
      const other = new LocalSqliteStorage(file, { readonly: true });
      try {
        addContentReferences(other.db, refs);
      } finally {
        other.close();
      }
    }
  } catch {
    return null;
  }
  return refs;
}

function projectDatabaseFiles(): string[] {
  const projects = path.join(resolveMolisWorkHome(), "projects");
  if (!existsSync(projects)) return [];
  return readdirSync(projects).map((name) => resolveProjectDatabaseFile(path.join(projects, name))).filter((file) => existsSync(file));
}

function addContentReferences(db: Pick<SqliteDatabase, "prepare">, into: Set<string>): void {
  const hasTable = (name: string) => db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
  if (hasTable("feed_materials")) {
    for (const row of db.prepare("SELECT DISTINCT content_ref FROM feed_materials WHERE content_ref IS NOT NULL").all() as Array<{ content_ref: string }>) {
      into.add(row.content_ref);
    }
  }
  if (hasTable("feed_source_runs")) {
    for (const row of db.prepare("SELECT receipt_json FROM feed_source_runs WHERE receipt_json IS NOT NULL").all() as Array<{ receipt_json: string }>) {
      for (const ref of receiptContentRefs(JSON.parse(row.receipt_json))) into.add(ref);
    }
  }
}
