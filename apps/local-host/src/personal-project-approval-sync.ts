import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { partitionedReplica, syncNamespace, type SyncRegistration, type SyncSelection } from "@molis-ai/molis-work-module-sync-replication";
import { PROJECT_APPROVALS_JOURNAL, projectApprovalReplica } from "@molis-ai/molis-work-service-project-approvals";
import { createSyncJsonContent } from "@molis-ai/molis-work-plugin-sdk";
import { readDatabaseSpace } from "@molis-ai/molis-work-storage";
import { LocalProjectDatabase } from "./project-database.js";
import { PLATFORM_SYNC_COLLECTIONS } from "./platform-sync-catalog.js";
import type { SyncCatalogReader } from "./personal-runtime-sync-authority.js";
import { projectSyncCatalog } from "./project-sync-catalog.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

const denied = () => new ActionError("actions.forbidden", "项目审批同步授权或原项目已变化");

/** Rules and immutable decision history have their own opt-in user selection, independent of the Goals installation. */
export function createProjectApprovalSyncRegistration(home: string, spaceId: string, check: () => void, withCatalog: LocalWebCatalogRunner,
  readCatalog: SyncCatalogReader | undefined, selected: () => { revision: number; selections: readonly SyncSelection[] }): SyncRegistration {
  const { selection, title } = PLATFORM_SYNC_COLLECTIONS.find(row => row.owner === "project-approvals")!;
  const namespace = syncNamespace(selection);
  const catalog = () => {
    check();
    if (!readCatalog) throw denied();
    return readCatalog(source => new Map(projectSyncCatalog(source).map(project => [project.project_id, project])));
  };
  const keyProject = (key: string) => {
    let found: unknown;
    try { found = JSON.parse(key); } catch { throw denied(); }
    if (!Array.isArray(found) || found.length !== 3 || typeof found[0] !== "string" || found[0] !== found[2] || found[1] !== PROJECT_APPROVALS_JOURNAL) throw denied();
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
    locate: key => "/settings/authorizations?view=project-rules&project=" + encodeURIComponent(keyProject(key)),
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
            return operation(projectApprovalReplica(store.replicationDatabase, id, spaceId, authorize));
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
