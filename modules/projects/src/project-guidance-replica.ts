import { createHash } from "node:crypto";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { PROJECT_GUIDANCE_ENTRY_MAX_CHARS, PROJECT_GUIDANCE_KINDS } from "@molis-ai/molis-work-contracts/modules/project-guidance";
import type { ProjectReplicaRow } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import { canonicalJsonText, createSyncConflictState, isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { createSqliteReplica, namespacedReplicaDatabase, replicaMarkSql, replicaSchemaSql, type ReplicaDatabase } from "@molis-ai/molis-work-storage";

/*
 * A project's guidance between one person's devices (specs/plugin-equal-standing/contract-design.md §9): the platform's own collection,
 * one key per project. Revisions never change once written; an entry moves only to a higher revision, so two devices that changed the
 * same entry to the same revision with different words is a conflict, and the local copy stays.
 */

export const PROJECT_GUIDANCE_JOURNAL = "project_guidance";

/**
 * Whether `value` holds at most `limit` characters (code points): one character may take two UTF-16 units, so a string of more than
 * `limit * 2` units is over the limit whatever it holds and only a shorter one is spread (as Goals counted it before batch 44).
 */
export function withinCharacters(value: string, limit: number): boolean {
  return value.length <= limit * 2 && [...value].length <= limit;
}
const mark = (row: "NEW" | "OLD") => replicaMarkSql(`json_array(${row}.project_id,'project_guidance',${row}.project_id)`, undefined, PROJECT_GUIDANCE_JOURNAL);

/** The collection's transport tables and the marks that queue a project's key whenever its guidance changes. */
export const PROJECT_GUIDANCE_REPLICA_SQL = `
${replicaSchemaSql(PROJECT_GUIDANCE_JOURNAL)}
INSERT INTO project_guidance_replica_state(id,device) VALUES(1,lower(hex(randomblob(16))));
CREATE TRIGGER project_guidance_entries_insert AFTER INSERT ON guidance_entries BEGIN ${mark("NEW")} END;
CREATE TRIGGER project_guidance_entries_update AFTER UPDATE ON guidance_entries BEGIN ${mark("NEW")} END;
CREATE TRIGGER project_guidance_revisions_insert AFTER INSERT ON guidance_revisions BEGIN ${mark("NEW")} END;
`;

type GuidanceRow = ProjectReplicaRow & { project_id: string };
const ENTRY_COLUMNS = ["guidance_id", "project_id", "position", "revision", "active", "kind", "content", "content_hash", "source_refs_json",
  "created_by", "confirmation_summary", "reason", "created_at", "updated_by", "updated_at"] as const;
const REVISION_COLUMNS = ["revision_id", "guidance_id", "project_id", "revision", "kind", "content", "content_hash", "source_refs_json", "active",
  "changed_by", "change_kind", "confirmation_summary", "reason", "created_at"] as const;
/** What an entry keeps from its creation; the rest follows its revision. */
const ENTRY_FIXED = ["guidance_id", "project_id", "position", "created_by", "created_at"] as const;
const CHANGE_KINDS = ["created", "edited", "deactivated", "restored"];

const invalid = () => new ActionError("actions.input_invalid", "项目长期说明的同步内容与原项目不符");
const collision = () => new ActionError("actions.conflict", "同一条项目长期说明的同一修订有不同内容，原件已保留");
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const positive = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 1;
const canonical = (value: unknown) => canonicalJsonText(value, "null");
const fields = (value: Record<string, unknown>, columns: readonly string[]) =>
  Object.keys(value).length === columns.length && columns.every(column => Object.hasOwn(value, column));

function validContent(row: GuidanceRow): boolean {
  let refs: unknown;
  try { refs = JSON.parse(String(row.source_refs_json)); } catch { return false; }
  return (PROJECT_GUIDANCE_KINDS as readonly unknown[]).includes(row.kind) && text(row.content)
    && withinCharacters(row.content, PROJECT_GUIDANCE_ENTRY_MAX_CHARS)
    && row.content_hash === createHash("sha256").update(row.content).digest("hex")
    && Array.isArray(refs) && refs.every(ref => typeof ref === "string") && [0, 1].includes(row.active as number)
    && typeof row.reason === "string" && typeof row.confirmation_summary === "string" && positive(row.revision);
}

function rows(input: unknown, projectId: string, columns: readonly string[], valid: (row: GuidanceRow) => boolean): GuidanceRow[] {
  if (!Array.isArray(input)) throw invalid();
  return input.map((value: unknown) => {
    if (!isRecord(value) || !fields(value, columns) || value.project_id !== projectId
      || !Object.values(value).every(cell => cell === null || typeof cell === "string" || typeof cell === "number" && Number.isFinite(cell))) throw invalid();
    const row = value as GuidanceRow;
    if (!validContent(row) || !valid(row)) throw invalid();
    return row;
  });
}

/** Reads one project's guidance and merges another device's without rewriting a revision or stepping an entry back. */
export function projectGuidanceReplica(db: ReplicaDatabase, projectId: string, spaceId: string, authorize: () => void) {
  const key = JSON.stringify([projectId, PROJECT_GUIDANCE_JOURNAL, projectId]);
  const scoped = (input: string) => { authorize(); if (input !== key) throw invalid(); };
  const read = () => ({
    space_id: spaceId, project_id: projectId,
    entries: db.prepare("SELECT * FROM guidance_entries WHERE project_id=? ORDER BY position, guidance_id").all(projectId),
    revisions: db.prepare("SELECT * FROM guidance_revisions WHERE project_id=? ORDER BY guidance_id, revision").all(projectId),
  });
  function mergeEntries(incoming: readonly GuidanceRow[]) {
    const current = db.prepare("SELECT * FROM guidance_entries WHERE guidance_id=?");
    const insert = db.prepare(`INSERT INTO guidance_entries (${ENTRY_COLUMNS.join(",")}) VALUES (${ENTRY_COLUMNS.map(() => "?").join(",")})`);
    const moving = ENTRY_COLUMNS.filter(column => !(ENTRY_FIXED as readonly string[]).includes(column));
    const update = db.prepare(`UPDATE guidance_entries SET ${moving.map(column => column + "=?").join(",")} WHERE project_id=? AND guidance_id=?`);
    for (const row of incoming) {
      const existing = current.get(row.guidance_id!);
      try {
        if (!existing) { insert.run(...ENTRY_COLUMNS.map(column => row[column]!)); continue; }
        if (ENTRY_FIXED.some(column => row[column] !== existing[column])) throw collision();
        if (row.revision === existing.revision && canonical(existing) !== canonical(row)) throw collision();
        if (Number(row.revision) > Number(existing.revision)) update.run(...moving.map(column => row[column]!), projectId, row.guidance_id!);
      } catch (error) { if (error instanceof ActionError) throw error; throw collision(); }
    }
  }
  function mergeRevisions(incoming: readonly GuidanceRow[]) {
    const current = db.prepare("SELECT * FROM guidance_revisions WHERE revision_id=?");
    const insert = db.prepare(`INSERT INTO guidance_revisions (${REVISION_COLUMNS.join(",")}) VALUES (${REVISION_COLUMNS.map(() => "?").join(",")})`);
    for (const row of incoming) {
      const existing = current.get(row.revision_id!);
      try {
        if (!existing) insert.run(...REVISION_COLUMNS.map(column => row[column]!));
        else if (canonical(existing) !== canonical(row)) throw collision();
      } catch (error) { if (error instanceof ActionError) throw error; throw collision(); }
    }
  }
  return createSqliteReplica(namespacedReplicaDatabase(db, PROJECT_GUIDANCE_JOURNAL), {
    authorize, authorizeKey: scoped, conflictState: createSyncConflictState, belongsToProject: (candidate, id) => candidate === key && id === projectId,
    read(candidate) {
      scoped(candidate);
      const facts = read();
      return facts.entries.length || facts.revisions.length ? facts : null;
    },
    apply(candidate, input) {
      scoped(candidate);
      if (!isRecord(input) || !fields(input, ["space_id", "project_id", "entries", "revisions"])
        || input.space_id !== spaceId || input.project_id !== projectId) throw invalid();
      const entries = rows(input.entries, projectId, ENTRY_COLUMNS, row => text(row.guidance_id) && Number.isSafeInteger(row.position)
        && text(row.created_by) && text(row.created_at) && text(row.updated_by) && text(row.updated_at));
      const revisions = rows(input.revisions, projectId, REVISION_COLUMNS, row => text(row.revision_id) && text(row.guidance_id)
        && text(row.changed_by) && CHANGE_KINDS.includes(String(row.change_kind)) && text(row.created_at));
      if (new Set(entries.map(row => row.guidance_id)).size !== entries.length
        || new Set(revisions.map(row => row.revision_id)).size !== revisions.length) throw invalid();
      mergeEntries(entries);
      mergeRevisions(revisions);
      authorize();
    },
  });
}
