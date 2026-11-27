import { ACCEPTANCE_EVIDENCE_MAX } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { canonicalJsonText, createSyncConflictState, isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { createSqliteReplica, namespacedReplicaDatabase, type ReplicaDatabase } from "@molis-ai/molis-work-storage";
import { ACCEPTANCE_JOURNAL } from "./schema.js";

/*
 * The platform's requirements and acceptance between one person's devices (contract-design §10.5): one key per subject. Requirements and
 * deliveries move only forward: another device's copy that extends this one adds its tail, one this copy extends changes nothing, and two
 * that each went on is a conflict, kept local until the person picks a side. Checks and decisions are a union, each landing only where the
 * requirement version and delivery it names are already here. Nothing here re-runs a trusted decision: a synced decision counts once its
 * record is in this library too (the project approvals collection travels with this one).
 */

type Cell = string | number | null;
type Row = Record<string, Cell>;
const REQUIREMENT = ["requirement_id", "version", "statement", "expected", "part", "requires_person", "withdrawn", "position", "by_person", "actor_id", "created_at"] as const;
const DELIVERY = ["round", "version", "summary", "touches_json", "made_in_session", "made_in_run", "actor_id", "delivered_at"] as const;
const CHECK = ["check_id", "clock", "requirement_id", "requirement_version", "round", "kind", "verdict", "tier", "gap", "checked_version", "method", "observed", "evidence_json",
  "reporter_session", "actor_id", "reported_at"] as const;
const DECISION = ["decision_id", "clock", "requirement_id", "requirement_version", "stands_round", "version", "decision", "note", "origin", "origin_ref", "actor_id", "decided_at"] as const;
const TABLES = { requirements: REQUIREMENT, deliveries: DELIVERY, checks: CHECK, decisions: DECISION } as const;
type Table = keyof typeof TABLES;
const ORDER: Record<Table, string> = { requirements: "seq", deliveries: "round", checks: "clock, check_id", decisions: "clock, decision_id, requirement_id" };

const invalid = () => new ActionError("actions.input_invalid", "要求与认可的同步内容与原项目不符");
const collision = () => new ActionError("actions.conflict", "两台设备各自改了同一件工作的要求或交付，原件已保留");
const same = (a: unknown, b: unknown) => canonicalJsonText(a, "null") === canonicalJsonText(b, "null");
const pick = (row: Record<string, unknown>, columns: readonly string[]): Row => Object.fromEntries(columns.map(column => [column, (row[column] ?? null) as Cell]));

/** The key of one subject in one project: [project, journal, provider, kind, id], as the schema's marks write it. */
export function acceptanceSyncKey(projectId: string, subject: { provider_id: string; subject: { kind: string; id: string } }): string {
  return JSON.stringify([projectId, ACCEPTANCE_JOURNAL, subject.provider_id, subject.subject.kind, subject.subject.id]);
}

const CHECK_KINDS = new Set(["engineering", "hands_on"]);
const CHECK_VERDICTS = new Set(["supports", "contradicts"]);
const CHECK_TIERS = new Set(["self_reported", "peer_reviewed", "machine_checked"]);
const CHECK_GAPS = new Set(["evidence_missing", "evidence_stale", "wrong_object", "evidence_unreadable", "check_failed"]);
const DECISIONS = new Set(["accepted", "returned"]);

const nonEmptyText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const positiveInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1;
const bitFlag = (value: unknown): boolean => value === 0 || value === 1;

function parseJson(raw: unknown): unknown {
  if (typeof raw !== "string") throw invalid();
  try { return JSON.parse(raw); } catch { throw invalid(); }
}

function validateEvidenceRef(ref: unknown): "artifact_version" | "command_receipt" {
  if (!isRecord(ref)) throw invalid();
  const keys = Object.keys(ref);
  if (ref.kind === "artifact_version") {
    if (keys.length !== 3 || !nonEmptyText(ref.artifact_id) || !positiveInt(ref.version)) throw invalid();
    return "artifact_version";
  }
  if (ref.kind === "command_receipt") {
    if (keys.length !== 3 || !nonEmptyText(ref.run_id) || !nonEmptyText(ref.call_id)) throw invalid();
    return "command_receipt";
  }
  throw invalid();
}

/** Rejects tampered or malformed acceptance rows before they can enter SQLite or crash `store.rows()` JSON parsing (S-acceptance-evidence-tier, EVD-43). */
function validateRow(table: Table, row: Row): void {
  if (table === "requirements") {
    if (!nonEmptyText(row.requirement_id) || !positiveInt(row.version) || !nonEmptyText(row.statement)
      || !(row.expected === null || typeof row.expected === "string") || !(row.part === null || typeof row.part === "string")
      || !bitFlag(row.requires_person) || !bitFlag(row.withdrawn) || !(typeof row.position === "number" && Number.isInteger(row.position) && row.position >= 0)
      || !bitFlag(row.by_person) || !nonEmptyText(row.actor_id) || !nonEmptyText(row.created_at)) throw invalid();
    return;
  }
  if (table === "deliveries") {
    if (!positiveInt(row.round) || !nonEmptyText(row.version) || !(row.summary === null || typeof row.summary === "string")
      || !(row.made_in_session === null || nonEmptyText(row.made_in_session)) || !(row.made_in_run === null || nonEmptyText(row.made_in_run))
      || !nonEmptyText(row.actor_id) || !nonEmptyText(row.delivered_at)) throw invalid();
    if (row.touches_json !== null) {
      const touches = parseJson(row.touches_json);
      if (!Array.isArray(touches) || !touches.every(nonEmptyText)) throw invalid();
    }
    return;
  }
  if (table === "checks") {
    if (!nonEmptyText(row.check_id) || !positiveInt(row.clock) || !nonEmptyText(row.requirement_id)
      || !positiveInt(row.requirement_version) || !positiveInt(row.round)
      || typeof row.kind !== "string" || !CHECK_KINDS.has(row.kind)
      || typeof row.verdict !== "string" || !CHECK_VERDICTS.has(row.verdict)
      || typeof row.tier !== "string" || !CHECK_TIERS.has(row.tier)
      || !(row.gap === null || (typeof row.gap === "string" && CHECK_GAPS.has(row.gap)))
      || !nonEmptyText(row.checked_version) || !nonEmptyText(row.method) || !nonEmptyText(row.observed)
      || !(row.reporter_session === null || nonEmptyText(row.reporter_session))
      || !nonEmptyText(row.actor_id) || !nonEmptyText(row.reported_at)) throw invalid();
    const evidence = parseJson(row.evidence_json);
    if (!Array.isArray(evidence) || evidence.length > ACCEPTANCE_EVIDENCE_MAX) throw invalid();
    const kinds = evidence.map(validateEvidenceRef);
    if (row.tier !== "self_reported") {
      if (row.gap !== null || !nonEmptyText(row.reporter_session) || kinds.length === 0) throw invalid();
      if (row.tier === "machine_checked" && !kinds.includes("command_receipt")) throw invalid();
      if (row.tier === "peer_reviewed" && (kinds.includes("command_receipt") || !kinds.includes("artifact_version"))) throw invalid();
    }
    return;
  }
  if (!nonEmptyText(row.decision_id) || !positiveInt(row.clock) || !nonEmptyText(row.requirement_id)
    || !positiveInt(row.requirement_version) || !positiveInt(row.stands_round) || !nonEmptyText(row.version)
    || typeof row.decision !== "string" || !DECISIONS.has(row.decision)
    || !(row.note === null || typeof row.note === "string")
    || (row.decision === "returned" && !nonEmptyText(row.note))
    || !nonEmptyText(row.origin) || !nonEmptyText(row.origin_ref) || !nonEmptyText(row.actor_id) || !nonEmptyText(row.decided_at)) throw invalid();
}

function rowsOf(table: Table, input: unknown, columns: readonly string[]): Row[] {
  if (!Array.isArray(input)) throw invalid();
  return input.map(value => {
    if (!isRecord(value) || Object.keys(value).length !== columns.length || !columns.every(column => Object.hasOwn(value, column))
      || !Object.values(value).every(cell => cell === null || typeof cell === "string" || typeof cell === "number" && Number.isFinite(cell))) throw invalid();
    const row = value as Row;
    validateRow(table, row);
    return row;
  });
}

/** Reads one project's subjects and merges another device's without rewriting a log, except when the person takes the other copy. */
export function acceptanceReplica(db: ReplicaDatabase, projectId: string, spaceId: string, authorize: () => void) {
  const decode = (key: string) => {
    let parts: unknown;
    try { parts = JSON.parse(key); } catch { throw invalid(); }
    if (!Array.isArray(parts) || parts.length !== 5 || parts[0] !== projectId || parts[1] !== ACCEPTANCE_JOURNAL || !parts.slice(2).every(part => typeof part === "string" && part)) throw invalid();
    return { provider_id: parts[2] as string, kind: parts[3] as string, id: parts[4] as string };
  };
  const subjectNo = (key: string, create: string | null): number | null => {
    const subject = decode(key);
    const find = () => db.prepare("SELECT subject_no FROM acceptance_subjects WHERE project_id=? AND provider_id=? AND subject_kind=? AND subject_id=?").get(projectId, subject.provider_id, subject.kind, subject.id);
    const found = find();
    if (found) return Number(found.subject_no);
    if (create === null) return null;
    db.prepare("INSERT INTO acceptance_subjects (project_id, provider_id, subject_kind, subject_id, created_at) VALUES (?,?,?,?,?)").run(projectId, subject.provider_id, subject.kind, subject.id, create);
    return Number(find()!.subject_no);
  };
  const local = (no: number, table: Table) => db.prepare(`SELECT * FROM acceptance_${table} WHERE subject_no=? ORDER BY ${ORDER[table]}`).all(no).map(row => pick(row, TABLES[table]));
  const insert = (no: number, table: Table, row: Row) => {
    const columns = TABLES[table];
    db.prepare(`INSERT INTO acceptance_${table} (subject_no, ${columns.join(",")}) VALUES (?, ${columns.map(() => "?").join(",")})`).run(no, ...columns.map(column => row[column]!));
  };
  const read = (key: string) => {
    const no = subjectNo(key, null);
    if (no === null) return null;
    const created = db.prepare("SELECT created_at FROM acceptance_subjects WHERE subject_no=?").get(no)!.created_at;
    return { space_id: spaceId, project_id: projectId, created_at: created,
      requirements: local(no, "requirements"), deliveries: local(no, "deliveries"), checks: local(no, "checks"), decisions: local(no, "decisions") };
  };
  const parse = (input: unknown) => {
    if (!isRecord(input) || Object.keys(input).length !== 7 || input.space_id !== spaceId || input.project_id !== projectId || typeof input.created_at !== "string") throw invalid();
    return { created_at: input.created_at, ...Object.fromEntries((Object.keys(TABLES) as Table[]).map(table => [table, rowsOf(table, input[table], TABLES[table])])) as Record<Table, Row[]> };
  };
  /** Requirements and deliveries: one copy must be the other's beginning. */
  const forward = (no: number, table: "requirements" | "deliveries", incoming: Row[]) => {
    const mine = local(no, table), shared = Math.min(mine.length, incoming.length);
    for (let index = 0; index < shared; index += 1) if (!same(mine[index], incoming[index])) throw collision();
    for (const row of incoming.slice(mine.length)) insert(no, table, row);
  };
  /** Checks and decisions: every one this copy lacks, as long as what it names is here. */
  const union = (no: number, table: "checks" | "decisions", incoming: Row[], identity: (row: Row) => string) => {
    const mine = new Map(local(no, table).map(row => [identity(row), row]));
    const requirements = new Set(local(no, "requirements").map(row => `${row.requirement_id}\u0000${row.version}`));
    const rounds = new Set(local(no, "deliveries").map(row => Number(row.round)));
    for (const row of incoming) {
      const existing = mine.get(identity(row));
      if (existing) { if (!same(existing, row)) throw collision(); continue; }
      const round = Number(table === "checks" ? row.round : row.stands_round);
      if (!requirements.has(`${row.requirement_id}\u0000${row.requirement_version}`) || !rounds.has(round)) throw collision();
      insert(no, table, row);
    }
  };
  const merge = (key: string, input: unknown) => {
    const value = parse(input), no = subjectNo(key, value.created_at)!;
    forward(no, "requirements", value.requirements);
    forward(no, "deliveries", value.deliveries);
    union(no, "checks", value.checks, row => String(row.check_id));
    union(no, "decisions", value.decisions, row => `${row.decision_id}\u0000${row.requirement_id}`);
  };
  const scoped = (key: string) => { authorize(); decode(key); };
  return createSqliteReplica(namespacedReplicaDatabase(db, ACCEPTANCE_JOURNAL), {
    // Checks and decisions are a union and requirements and deliveries only move forward, so a copy that meets a local change not yet
    // sent is merged; `merge` refuses (a conflict) only where both devices went on with the requirements or deliveries (§10.5).
    authorize, authorizeKey: scoped, conflictState: createSyncConflictState, mergesConcurrent: true,
    belongsToProject: (candidate, id) => { try { return id === projectId && decode(candidate) !== null; } catch { return false; } },
    read(key) { scoped(key); return read(key); },
    apply(key, input) { scoped(key); merge(key, input); authorize(); },
    // The person took the other device's copy (§10.5): the logs give way only inside this marker, which nothing else writes.
    replace(key, input) {
      scoped(key);
      const value = parse(input), no = subjectNo(key, value.created_at)!;
      const requirements = new Set(value.requirements.map(row => `${row.requirement_id}\u0000${row.version}`));
      const rounds = new Set(value.deliveries.map(row => Number(row.round)));
      for (const row of value.checks) {
        if (!requirements.has(`${row.requirement_id}\u0000${row.requirement_version}`) || !rounds.has(Number(row.round))) throw invalid();
      }
      for (const row of value.decisions) {
        if (!requirements.has(`${row.requirement_id}\u0000${row.requirement_version}`) || !rounds.has(Number(row.stands_round))) throw invalid();
      }
      db.exec("INSERT INTO acceptance_sync_resolving (marker) VALUES (1)");
      try {
        for (const table of Object.keys(TABLES) as Table[]) db.prepare(`DELETE FROM acceptance_${table} WHERE subject_no=?`).run(no);
        for (const table of Object.keys(TABLES) as Table[]) for (const row of value[table]) insert(no, table, row);
      } finally { db.exec("DELETE FROM acceptance_sync_resolving"); }
      authorize();
    },
  });
}
