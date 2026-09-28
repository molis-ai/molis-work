import type { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { createContextLedger, type ContextLedgerDatabase } from "@molis-ai/molis-work-module-context-ledger";
import type { ContextAccess, ContextEdge, ObjectRef } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { ASSISTANT_RELATIONS, type AssistantRelation } from "@molis-ai/molis-work-contracts/services/assistant";

/** The Home SQLite handle, as the storage package opens it (the App boundary does not import `node:sqlite`). */
type DatabaseSync = ReturnType<typeof openHomeSqliteDatabase>;

/** The Assistant writes its relations as itself, in its own partition of its own database. */
const ACCESS: ContextAccess = { actor_id: "module:assistant", scope: { kind: "personal", id: "assistant" } };
const RELATION_OF = new Map<string, AssistantRelation>(Object.entries(ASSISTANT_RELATIONS).map(([relation, type]) => [type, relation as AssistantRelation]));
/** How a work's objects read: where it started, what it was given, who carries it, what it produced. */
const RANK: Record<AssistantRelation, number> = { origin: 0, material: 1, session: 2, result: 3 };

/** `node:sqlite` in the shape the Ledger's repository expects: one immediate transaction, joined when already inside one. */
function ledgerDatabase(db: DatabaseSync): ContextLedgerDatabase {
  const run = <T>(operation: () => T): T => {
    if (db.isTransaction) return operation();
    db.exec("BEGIN IMMEDIATE");
    try { const value = operation(); db.exec("COMMIT"); return value; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  return {
    exec: sql => db.exec(sql),
    prepare: sql => db.prepare(sql) as unknown as ReturnType<ContextLedgerDatabase["prepare"]>,
    transaction: <T>(operation: () => T) => Object.assign(() => run(operation), { immediate: () => run(operation) }),
  };
}

/** A work, as the source of its relations. */
export interface WorkIdentity { work_id: string; project_id: string | null }

/** An object a relation points to: a Plugin's object by its subject kind, in the work's project. */
export interface RelatedObject { kind: string; id: string; revision: string | null }

export interface WorkRelation {
  relation: AssistantRelation;
  object: RelatedObject;
  recorded_at: string;
  cause: string;
}

/**
 * What a work started from, used, produced and handed to, as Context Ledger edges. The Assistant is the semantic
 * owner: it picks the keys and relation types. Objects stay with their owners; an edge holds the reference and the
 * revision at the time. A later revision of the same relation is a new revision of the same edge, so its history
 * shows each version the work produced.
 */
export class AssistantRelations {
  private readonly ledger;

  constructor(db: DatabaseSync, now?: () => Date) {
    this.ledger = createContextLedger(ledgerDatabase(db), {
      authorize: access => access.actor_id === ACCESS.actor_id && access.scope.kind === ACCESS.scope.kind && access.scope.id === ACCESS.scope.id,
      ...(now ? { now } : {}),
    });
  }

  private workRef(work: WorkIdentity): ObjectRef {
    return { module: "assistant", id: work.work_id, version: null, scope: ACCESS.scope, project_id: work.project_id, object_type: "work" };
  }

  private objectRef(work: WorkIdentity, object: RelatedObject): ObjectRef {
    const counter = object.revision !== null && /^[1-9]\d{0,14}$/.test(object.revision) ? Number(object.revision) : null;
    return { module: "plugins", id: object.id, version: counter, ...(object.revision !== null && counter === null ? { revision: object.revision } : {}),
      scope: ACCESS.scope, project_id: work.project_id, object_type: object.kind };
  }

  private key(work: WorkIdentity, relation: AssistantRelation, object: Pick<RelatedObject, "kind" | "id">): string {
    return JSON.stringify([work.work_id, relation, object.kind, object.id]);
  }

  /** Record (or move to a newer revision) one relation. Repeating the same one records nothing new. */
  link(work: WorkIdentity, relation: AssistantRelation, object: RelatedObject, cause: string): void {
    this.ledger.commands.put(ACCESS, { key: this.key(work, relation, object), type: ASSISTANT_RELATIONS[relation],
      source: this.workRef(work), target: this.objectRef(work, object), cause });
  }

  unlink(work: WorkIdentity, relation: AssistantRelation, object: Pick<RelatedObject, "kind" | "id">, cause: string): void {
    this.ledger.commands.remove(ACCESS, this.key(work, relation, object), cause);
  }

  /** Every current relation of one work: by kind of relation, then oldest first. */
  forWork(work: WorkIdentity): WorkRelation[] {
    return this.ledger.query.list(ACCESS, { source: this.workRef(work) }).map(edge => this.view(edge)).filter((row): row is WorkRelation => row !== null)
      .sort((a, b) => RANK[a.relation] - RANK[b.relation] || a.recorded_at.localeCompare(b.recorded_at));
  }

  /** The works that relate to one object in a project, whatever the revision they recorded. */
  forObject(projectId: string | null, object: Pick<RelatedObject, "kind" | "id">): Array<WorkRelation & { work_id: string }> {
    return this.ledger.query.list(ACCESS).filter(edge => edge.source.module === "assistant" && edge.target.module === "plugins"
      && edge.target.object_type === object.kind && edge.target.id === object.id && (edge.target.project_id ?? null) === projectId)
      .map(edge => { const row = this.view(edge); return row ? { ...row, work_id: edge.source.id } : null; })
      .filter((row): row is WorkRelation & { work_id: string } => row !== null);
  }

  private view(edge: ContextEdge): WorkRelation | null {
    const relation = RELATION_OF.get(edge.type);
    if (!relation || !edge.target.object_type) return null;
    const revision = edge.target.version !== null ? String(edge.target.version) : edge.target.revision ?? null;
    return { relation, object: { kind: edge.target.object_type, id: edge.target.id, revision }, recorded_at: edge.recorded_at, cause: edge.cause };
  }
}
