import { existsSync } from "node:fs";
import { join } from "node:path";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryLedgerPort, MemoryOwnerRelation } from "@molis-ai/molis-work-contracts/services/memory";
import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { ProjectsModule } from "@molis-ai/molis-work-module-projects";
import { characterOwner, memoryErrors } from "@molis-ai/molis-work-service-memory";
import { assertCurrentCatalog, assertOwnedCatalog } from "../catalog-schema.js";
import { decodeProjectDeletionRecovery, type ProjectDeletionRecovery } from "../project-deletion-recovery.js";
import { assistantMemoryRelations, type AssistantMemoryRelation } from "../assistant/assistant-memory-relations.js";

const invalid = () => memoryErrors.conflict("保留的记忆归属不完整或互相矛盾，不能确认清除覆盖");
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

type CoverageRelation = Omit<MemoryOwnerRelation, "subject"> & { readonly subject?: string | null };
export interface MemoryOwnerCoverageFacts {
  readonly projects: readonly { readonly project_id: string }[];
  readonly deletions: readonly { readonly project_id: string; readonly recovery: ProjectDeletionRecovery }[];
  /** Adoption snapshots carry ownership only. An absent subject remains unknown, never a guessed Character. */
  readonly owners: readonly CoverageRelation[];
  readonly assistant: readonly AssistantMemoryRelation[];
}
export interface MemoryOwnerCoverage {
  knownScopes: Array<{ scope: "user" | "project" | "character"; owner: string }>;
  forProject(projectId: string): Array<{ scope: "project" | "character"; owner: string }>;
}

/** MEM-40-FRAME-06: one pure join for online reads and cold owner-decoded facts; it grants no mutation. */
export function collectMemoryOwnerCoverage(input: MemoryOwnerCoverageFacts): MemoryOwnerCoverage {
  const relations = new Map<string, CoverageRelation>();
  const add = (row: CoverageRelation) => {
    if (!text(row.owner) || !(row.subject === undefined || row.subject === null || text(row.subject))) throw invalid();
    if (row.scope === "personal") {
      if (row.owner !== LOCAL_PERSON_ACTOR_ID || row.project_id !== null || row.subject != null) throw invalid();
    } else if (row.scope === "project") {
      if (!text(row.project_id) || row.owner !== row.project_id || row.subject != null) throw invalid();
    } else if (row.scope === "character") {
      if (!text(row.project_id) || !/^pc-[a-f0-9]{40}$/.test(row.owner)
        || row.subject != null && row.owner !== characterOwner(row.project_id, row.subject)) throw invalid();
    } else throw invalid();
    const key = JSON.stringify([row.scope, row.owner]), previous = relations.get(key);
    if (previous && (previous.project_id !== row.project_id
      || previous.subject != null && row.subject != null && previous.subject !== row.subject)) throw invalid();
    relations.set(key, { ...row, subject: previous?.subject ?? row.subject });
  };
  const project = (id: string) => add({ scope: "project", owner: id, project_id: id, subject: null });
  add({ scope: "personal", owner: LOCAL_PERSON_ACTOR_ID, project_id: null, subject: null });
  for (const row of input.projects) project(row.project_id);
  for (const { project_id, recovery: plan } of input.deletions) {
    if (plan.project_id !== project_id) throw invalid();
    project(project_id);
    if (plan.kind === "runtime") {
      if (plan.memory.actor_id !== LOCAL_PERSON_ACTOR_ID || plan.memory.project_id !== project_id) throw invalid();
      for (const scope of plan.memory.scopes) add({ scope: scope.scope, owner: scope.owner,
        project_id: scope.scope === "personal" ? null : project_id });
    }
  }
  for (const row of input.owners) { add(row); if (row.project_id !== null) project(row.project_id); }
  for (const row of input.assistant) {
    if (!text(row.project_id) || !text(row.subject)) throw invalid();
    add({ ...row, scope: "character", owner: characterOwner(row.project_id, row.subject) }); project(row.project_id);
  }
  const ordered = [...relations.values()].sort((a, b) => JSON.stringify([a.scope, a.owner]).localeCompare(JSON.stringify([b.scope, b.owner])));
  return {
    knownScopes: ordered.map(row => ({ scope: row.scope === "personal" ? "user" : row.scope, owner: row.owner })),
    forProject(projectId) {
      if (!text(projectId) || !relations.has(JSON.stringify(["project", projectId]))) throw invalid();
      return ordered.filter((row): row is CoverageRelation & { scope: "project" | "character" } => row.scope !== "personal" && row.project_id === projectId)
        .map(row => ({ scope: row.scope, owner: row.owner }));
    },
  };
}

/** Internal App owner projection. Both selections come from one join and must be re-read before completion. */
export function readMemoryOwnerCoverage(input: { homeDirectory: string; ledger: Pick<MemoryLedgerPort, "ownerRelations">; projectId: string }): {
  knownScopes: Array<{ scope: "user" | "project" | "character"; owner: string }>;
  scopes: Array<{ scope: "project" | "character"; owner: string }>;
} {
  if (!text(input.projectId)) throw invalid();
  const currentProjects: Array<{ project_id: string }> = [], deletions: Array<{ project_id: string; recovery: ProjectDeletionRecovery }> = [];
  const filename = join(input.homeDirectory, "projects", "catalog.db");
  if (existsSync(filename)) {
    const storage = new LocalSqliteStorage(filename, { readonly: true });
    try {
      assertOwnedCatalog(storage, filename); assertCurrentCatalog(storage, filename);
      const projects = new ProjectsModule({ db: storage.db, plugins: { has: () => false, companions: () => [] } });
      for (const row of projects.query.listProjects()) currentProjects.push({ project_id: row.project_id });
      for (const receipt of projects.query.listProjectDeletions()) {
        const record = projects.lifecycle.getDeletion(receipt.deletion_id);
        const plan = decodeProjectDeletionRecovery(record.recovery_plan, record.project_id, record.deletion_id);
        deletions.push({ project_id: record.project_id, recovery: plan });
      }
    } finally { storage.close(); }
  }
  const coverage = collectMemoryOwnerCoverage({ projects: currentProjects, deletions, owners: input.ledger.ownerRelations(), assistant: assistantMemoryRelations(input.homeDirectory) });
  return { knownScopes: coverage.knownScopes, scopes: coverage.forProject(input.projectId) };
}
