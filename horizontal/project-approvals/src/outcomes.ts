import { createHash } from "node:crypto";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginSyncCollection, SyncApprovalOutcomeDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-sync";
import type { ProjectReplicaRow, ProjectReplicaRows } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";

/** The result a person's applied decision left, as the platform reads it from what the owner declared (44B). */
export interface ApprovalOutcome {
  readonly kind: string;
  readonly id: string;
  readonly digest: string;
}

type Reader = { prepare(sql: string): { all(...params: string[]): unknown[] } };
type Facts = Readonly<Record<string, ProjectReplicaRows>>;

const invalid = () => new ActionError("actions.conflict", "同步的插件结果与原平台决定不一致");
const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** The declared columns of an outcome's table, without the section's sequence fields: those differ between copies of one history. */
function stableColumns(collection: PluginSyncCollection, declaration: SyncApprovalOutcomeDeclaration): readonly string[] {
  const section = collection.sections?.business.find(row => row.id === declaration.section);
  const table = section?.tables.find(row => row.name === declaration.table);
  if (!section || !table) throw invalid();
  return table.columns.filter(column => !section.sequenceFields.includes(column));
}

function outcomeOf(kind: string, declaration: SyncApprovalOutcomeDeclaration, columns: readonly string[], rows: readonly ProjectReplicaRow[]): ApprovalOutcome {
  const subject = rows[0]?.[declaration.subject_column];
  if (typeof subject !== "string" || !subject || rows.some(row => row[declaration.subject_column] !== subject)) throw invalid();
  const stable = rows.map(row => Object.fromEntries(columns.map(column => [column, row[column] ?? null])))
    .sort((a, b) => { const left = canonicalJsonText(a)!, right = canonicalJsonText(b)!; return left < right ? -1 : Number(left > right); });
  return { kind, id: subject, digest: "sha256:" + createHash("sha256").update(canonicalJsonText(["approval-outcome", 1, kind, stable])!).digest("hex") };
}

/** The collection of a Manifest's sync declaration that says where its approved decisions leave their results, if any. */
export function approvalOutcomeCollection(collections: readonly PluginSyncCollection[] | undefined): PluginSyncCollection | null {
  return collections?.find(collection => collection.approval_outcomes?.length) ?? null;
}

/**
 * One decision's result, read from the owner's library in the transaction that applied it: the rows of the declared table that name this
 * decision, or null when there are none. A subject kind the collection declares nothing for, or rows that name another subject, are refused.
 */
export function readApprovalOutcome(db: Reader, collection: PluginSyncCollection, project: string, decision: string, subject: { readonly kind: string; readonly id: string }): ApprovalOutcome | null {
  const declaration = collection.approval_outcomes?.find(row => row.subject_kind === subject.kind);
  if (!declaration) throw invalid();
  const columns = stableColumns(collection, declaration);
  const rows = db.prepare(`SELECT ${columns.map(quoted).join(", ")} FROM ${quoted(declaration.table)} WHERE "project_id" = ? AND ${quoted(declaration.decision_column)} = ?`)
    .all(project, decision) as ProjectReplicaRow[];
  if (!rows.length) return null;
  const outcome = outcomeOf(subject.kind, declaration, columns, rows);
  if (outcome.id !== subject.id) throw invalid();
  return outcome;
}

/** Every decision's result in synced facts, by decision id; one decision has one result. */
export function approvalOutcomesFromFacts(collection: PluginSyncCollection, facts: Facts): Map<string, ApprovalOutcome> {
  const outcomes = new Map<string, ApprovalOutcome>();
  for (const declaration of collection.approval_outcomes ?? []) {
    const columns = stableColumns(collection, declaration), byDecision = new Map<string, ProjectReplicaRow[]>();
    for (const row of facts[declaration.section]?.[declaration.table] ?? []) {
      const id = row[declaration.decision_column];
      if (typeof id !== "string" || !id) throw invalid();
      const group = byDecision.get(id);
      if (group) group.push(row); else byDecision.set(id, [row]);
    }
    for (const [id, rows] of byDecision) {
      if (outcomes.has(id)) throw invalid();
      outcomes.set(id, outcomeOf(declaration.subject_kind, declaration, columns, rows));
    }
  }
  return outcomes;
}

/** A later snapshot may leave out a decision only with its subject: while the subject is there, every decision applied to it stays. */
export function assertApprovalOutcomeHistory(collection: PluginSyncCollection, previous: ReadonlyMap<string, ApprovalOutcome>,
  incoming: ReadonlyMap<string, ApprovalOutcome>, facts: Facts): void {
  const present = new Map((collection.approval_outcomes ?? []).map(declaration => [declaration.subject_kind,
    new Set((facts[declaration.subjects.section]?.[declaration.subjects.table] ?? []).map(row => row[declaration.subjects.column]))]));
  for (const [decision, outcome] of previous) {
    const subjects = present.get(outcome.kind);
    if (!subjects) throw invalid();
    if (subjects.has(outcome.id) && !incoming.has(decision)) throw invalid();
  }
}
