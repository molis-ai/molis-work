import { ledgerDatabase, type LedgerConnection } from "../context-ledger-database.js";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import type { ContextAccess, ContextEdge, ObjectRef, ContextEdgePurgeIdentity } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { ASSISTANT_RELATIONS, type AssistantContextSnapshot, type AssistantMaterial, type AssistantRelation, type AssistantScope } from "@molis-ai/molis-work-contracts/services/assistant";

/** The Home SQLite handle, as the storage package opens it (the App boundary does not import `node:sqlite`). */
type DatabaseSync = LedgerConnection;

/** The Assistant writes its relations as itself, in its own partition of its own database. */
const ACCESS: ContextAccess = { actor_id: "module:assistant", scope: { kind: "personal", id: "assistant" } };
const RELATION_OF = new Map<string, AssistantRelation>(Object.entries(ASSISTANT_RELATIONS).map(([relation, type]) => [type, relation as AssistantRelation]));
/** How a work's objects read: where it started, what it was given, who carries it, what it produced. */
const RANK: Record<AssistantRelation, number> = { origin: 0, material: 1, session: 2, result: 3 };

/** A work, as the source of its relations. */
interface WorkIdentity { work_id: string; project_id: string | null }

/** A work as the source of its relations: its project namespace, or none for personal work. */
export function identity(work: { work_id: string; scope: AssistantScope }): WorkIdentity {
  return { work_id: work.work_id, project_id: work.scope.kind === "project" ? work.scope.project_id : null };
}

/** A version as a relation keeps it: none when the object has no version. */
export function revisionOf(version: string | number | undefined): string | null {
  return version === undefined || version === null || version === "" ? null : String(version);
}

/** What a Send started from and brought along: the work keeps a relation to each, read from its owner later. */
export function linkSent(relations: AssistantRelations, work: { work_id: string; scope: AssistantScope }, materials: AssistantMaterial[], context: AssistantContextSnapshot | null): void {
  const id = identity(work);
  try {
    if (context?.object) relations.link(id, "origin", { kind: context.object.kind, id: context.object.id, revision: revisionOf(context.object.version) }, "工作从这个对象开始");
    for (const material of materials) {
      if (!material.object) continue;
      relations.link(id, "material", { kind: material.object.kind, id: material.object.id, revision: material.draft ? null : revisionOf(material.object.version) },
        material.explicit ? "用户把它加入这一轮" : "用户保留了当前页面的这个对象");
    }
  } catch { /* A relation that fails to record never stops the person's Send. */ }
}

/** An object a relation points to: a Plugin's object by its subject kind, in the work's project. */
interface RelatedObject { kind: string; id: string; revision: string | null }

interface WorkRelation {
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
    // Its tables are part of the Assistant store's baseline (ASSISTANT_STORE_BASELINE).
    this.ledger = createContextLedger(ledgerDatabase(db), { initializeSchema: false,
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

  preparePurge(work: WorkIdentity): ContextEdgePurgeIdentity[] { return this.ledger.retention.prepare(ACCESS, this.workRef(work)); }
  clearPurge(work: WorkIdentity, selected: readonly ContextEdgePurgeIdentity[], current: () => void): void {
    this.ledger.retention.clear(ACCESS, this.workRef(work), selected, current);
  }
  verifyPurge(work: WorkIdentity, selected: readonly ContextEdgePurgeIdentity[]): void {
    this.ledger.retention.verifyOriginal(ACCESS, this.workRef(work), selected);
  }

  private view(edge: ContextEdge): WorkRelation | null {
    const relation = RELATION_OF.get(edge.type);
    if (!relation || !edge.target.object_type) return null;
    const revision = edge.target.version !== null ? String(edge.target.version) : edge.target.revision ?? null;
    return { relation, object: { kind: edge.target.object_type, id: edge.target.id, revision }, recorded_at: edge.recorded_at, cause: edge.cause };
  }
}
