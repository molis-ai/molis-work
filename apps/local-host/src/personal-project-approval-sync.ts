import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { partitionedReplica, syncNamespace, type SyncRegistration, type SyncSelection } from "@molis-ai/molis-work-module-sync-replication";
import { ACCEPTANCE_JOURNAL, acceptanceReplica } from "@molis-ai/molis-work-module-acceptance";
import { PROJECT_GUIDANCE_JOURNAL, projectGuidanceReplica } from "@molis-ai/molis-work-module-projects";
import { PROJECT_APPROVALS_JOURNAL, projectApprovalReplica } from "@molis-ai/molis-work-service-project-approvals";
import type { ReplicaDatabase, SqliteReplica } from "@molis-ai/molis-work-storage";
import { createSyncJsonContent } from "@molis-ai/molis-work-plugin-sdk";
import { readDatabaseSpace } from "@molis-ai/molis-work-storage";
import { LocalProjectDatabase } from "./project-database.js";
import { PLATFORM_SYNC_COLLECTIONS, projectApprovalSyncSelection, type PlatformSyncCollection } from "./platform-sync-catalog.js";
import type { SyncCatalogReader } from "./personal-runtime-sync-authority.js";
import { projectSyncCatalog } from "./project-sync-catalog.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

type Selected = () => { revision: number; selections: readonly SyncSelection[] };

/** Rules and immutable decision history have their own opt-in user selection, independent of the Goals installation. */
export function createProjectApprovalSyncRegistration(home: string, spaceId: string, check: () => void, withCatalog: LocalWebCatalogRunner,
  readCatalog: SyncCatalogReader | undefined, selected: Selected): SyncRegistration {
  return projectPlatformSyncRegistration({ owner: "project-approvals", journal: PROJECT_APPROVALS_JOURNAL, replica: projectApprovalReplica,
    denied: "项目审批同步授权或原项目已变化", locate: project => "/settings/authorizations?view=project-rules&project=" + encodeURIComponent(project) },
  home, spaceId, check, withCatalog, readCatalog, selected);
}

/** A project's guidance (contract-design §9) has its own opt-in selection, whichever plugins the project enables. */
export function createProjectGuidanceSyncRegistration(home: string, spaceId: string, check: () => void, withCatalog: LocalWebCatalogRunner,
  readCatalog: SyncCatalogReader | undefined, selected: Selected): SyncRegistration {
  return projectPlatformSyncRegistration({ owner: "project-guidance", journal: PROJECT_GUIDANCE_JOURNAL, replica: projectGuidanceReplica,
    denied: "项目长期说明同步授权或原项目已变化", locate: project => "/projects/" + encodeURIComponent(project) + "/settings/guidance" },
  home, spaceId, check, withCatalog, readCatalog, selected);
}

/**
 * A project's requirements and acceptance (contract-design §10.5): one key per subject, its own opt-in selection, and the approvals
 * collection selected with it, since a decision made through the trusted-decision entry counts only once its record has come too.
 */
export function createAcceptanceSyncRegistration(home: string, spaceId: string, check: () => void, withCatalog: LocalWebCatalogRunner,
  readCatalog: SyncCatalogReader | undefined, selected: Selected): SyncRegistration {
  return projectPlatformSyncRegistration({ owner: "acceptance", journal: ACCEPTANCE_JOURNAL, replica: acceptanceReplica, keyLength: 5, dependencies: [projectApprovalSyncSelection],
    denied: "要求与认可同步授权或原项目已变化", locate: project => "/projects/" + encodeURIComponent(project) },
  home, spaceId, check, withCatalog, readCatalog, selected);
}

/**
 * One platform collection kept in each project's library under the person's selection of it: one key per project
 * (`[project, journal, project]`), or, with `keyLength`, one per object of a project (`[project, journal, …]`).
 */
export function projectPlatformSyncRegistration(owner: {
  readonly owner: PlatformSyncCollection["owner"]; readonly journal: string; readonly denied: string; locate(projectId: string): string;
  readonly keyLength?: number; readonly dependencies?: readonly SyncSelection[];
  readonly onMutated?: (projectId: string) => void;
  replica(db: ReplicaDatabase, projectId: string, spaceId: string, authorize: () => void, title: string): SqliteReplica;
}, home: string, spaceId: string, check: () => void, withCatalog: LocalWebCatalogRunner, readCatalog: SyncCatalogReader | undefined,
  selected: Selected): SyncRegistration {
  const denied = () => new ActionError("actions.forbidden", owner.denied);
  const { selection, title } = PLATFORM_SYNC_COLLECTIONS.find(row => row.owner === owner.owner)!;
  const namespace = syncNamespace(selection);
  const catalog = () => {
    check();
    if (!readCatalog) throw denied();
    return readCatalog(source => new Map(projectSyncCatalog(source).map(project => [project.project_id, project])));
  };
  const keyProject = (key: string) => {
    let found: unknown;
    try { found = JSON.parse(key); } catch { throw denied(); }
    if (!Array.isArray(found) || typeof found[0] !== "string" || found[1] !== owner.journal) throw denied();
    if (owner.keyLength === undefined ? found.length !== 3 || found[0] !== found[2] : found.length !== owner.keyLength || !found.slice(2).every(part => typeof part === "string" && part)) throw denied();
    return found[0];
  };
  const requireSelected = (revision: number) => {
    check();
    const current = selected();
    if (current.revision !== revision || !current.selections.some(row => syncNamespace(row) === namespace)) throw denied();
  };
  const project = (id: string, passive = false) => {
    const row = catalog().get(id);
    if (!row || !passive && row.recycled) throw denied();
    return row;
  };
  return {
    selection, title, ...(owner.dependencies ? { dependencies: owner.dependencies } : {}),
    content: createSyncJsonContent({ spaceId, authorize: () => requireSelected(selected().revision) }),
    locate: key => owner.locate(keyProject(key)),
    async refresh() { check(); await withCatalog({ homeDirectory: home }, () => undefined); check(); },
    withReplica(run) {
      check();
      const revision = selected().revision;
      return run(partitionedReplica({
        home, namespace, authorize: check, partition: keyProject, projectPartition: id => id,
        projectPartitions: () => [...catalog().keys()], projectAbsent: id => !catalog().has(id),
        partitions: () => [...catalog()].filter(([, row]) => !row.recycled).map(([id]) => id),
        withPartition(id, operation, passive) {
          const before = project(id, passive);
          const authorize = () => {
            check();
            if (!passive) requireSelected(revision);
            if (project(id, passive).database_path !== before.database_path) throw denied();
          };
          authorize();
          const store = new LocalProjectDatabase(before.database_path, { existingOnly: true });
          let mutated = false;
          let result: ReturnType<typeof operation>;
          try {
            if (readDatabaseSpace(store.db)?.spaceId !== spaceId) throw denied();
            const base = owner.replica(store.replicationDatabase, id, spaceId, authorize, before.display_name);
            const tracked: SqliteReplica = owner.onMutated ? {
              ...base,
              receive(event, options) {
                base.receive(event, options);
                mutated = true;
              },
              resolve(key, choice, expectedRevision, expectedState) {
                base.resolve(key, choice, expectedRevision, expectedState);
                mutated = true;
              },
              ...(base.restoreRecovery ? {
                restoreRecovery(recoveryId, choice, expectedRevision) {
                  base.restoreRecovery!(recoveryId, choice, expectedRevision);
                  mutated = true;
                },
              } : {}),
            } : base;
            result = operation(tracked);
          } finally { store.close(); }
          if (mutated) owner.onMutated?.(id);
          return result;
        },
      }));
    },
    async prepare(event) {
      const revision = selected().revision;
      requireSelected(revision);
      project(keyProject(event.key));
      requireSelected(revision);
    },
  };
}
