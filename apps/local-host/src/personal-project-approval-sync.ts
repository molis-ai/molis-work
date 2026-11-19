import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { partitionedReplica, syncNamespace, type SyncRegistration, type SyncSelection } from "@molis-ai/molis-work-module-sync-replication";
import { PROJECT_GUIDANCE_JOURNAL, projectGuidanceReplica } from "@molis-ai/molis-work-module-projects";
import { PROJECT_APPROVALS_JOURNAL, projectApprovalReplica } from "@molis-ai/molis-work-service-project-approvals";
import type { ReplicaDatabase, SqliteReplica } from "@molis-ai/molis-work-storage";
import { createSyncJsonContent } from "@molis-ai/molis-work-plugin-sdk";
import { readDatabaseSpace } from "@molis-ai/molis-work-storage";
import { LocalProjectDatabase } from "./project-database.js";
import { PLATFORM_SYNC_COLLECTIONS, type PlatformSyncCollection } from "./platform-sync-catalog.js";
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

/** One platform collection kept in each project's library, one key per project, under the person's selection of it. */
function projectPlatformSyncRegistration(owner: {
  readonly owner: PlatformSyncCollection["owner"]; readonly journal: string; readonly denied: string; locate(projectId: string): string;
  replica(db: ReplicaDatabase, projectId: string, spaceId: string, authorize: () => void): SqliteReplica;
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
    if (!Array.isArray(found) || found.length !== 3 || typeof found[0] !== "string" || found[0] !== found[2] || found[1] !== owner.journal) throw denied();
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
    selection, title,
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
          try {
            if (readDatabaseSpace(store.db)?.spaceId !== spaceId) throw denied();
            return operation(owner.replica(store.replicationDatabase, id, spaceId, authorize));
          } finally { store.close(); }
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
