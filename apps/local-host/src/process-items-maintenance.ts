import pathUtil from "node:path";
import { realpathSync } from "node:fs";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { listProcessItemsRecoveries, processItemsSyncFailureKeys, type PersonalSync, type ProcessItemsTakeoverOutcome, type SyncCutoverView } from "@molis-ai/molis-work-module-sync-replication";
import { readStorageSpace, type StorageOwner } from "@molis-ai/molis-work-storage";
import { projectDatabases } from "./platform-upgrade-stores.js";
import { adoptionPending, adoptProjectDatabase, inspectProjectAdoption, processItemsNeverSynced, retireFilesConsents, type ProjectAdoptionReport } from "./process-items-adoption.js";
import { captureProcessItemsRecovery, processItemKey, verifyProcessItemsRecovery } from "./process-items-recovery.js";

/**
 * The person's process-item steps in sync settings (specs/batch-06-shared-tools/sync-cutover.md steps 2–5, user 2026-11-12 layout):
 * cut over once from any device, keep this Home's unsent lines in a recovery file, adopt this Home's libraries and join the adopted
 * stream, then take the kept lines over. Each local step runs while no sync round can, and a library is adopted only while its project
 * is closed and held closed.
 */
export interface ProcessItemsMaintenancePorts {
  readonly home: string;
  /** The storage owner this Host holds for the Home. */
  owner(): StorageOwner;
  /** Close the project's runtime and keep any new operation on it out while `work` runs. */
  holdProject<T>(projectId: string, work: () => T): Promise<T>;
  /** Project names as the catalog shows them. */
  names(): Promise<ReadonlyMap<string, string>>;
  /** Clock for the consents taken back; injected for tests. */
  now?(): string;
}

export interface ProcessItemsProjectView {
  readonly project_id: string;
  readonly name: string;
  readonly layout: ProjectAdoptionReport["layout"];
  /** Lines, outputs, bindings and values adoption would still move. */
  readonly pending: number;
  /** Lines sync has not settled: they need a recovery file before this library is adopted. */
  readonly unsettled: readonly string[];
  /** What stops adoption that no recovery file can keep. */
  readonly refused: readonly string[];
}

export interface ProcessItemsCaptureView {
  readonly captureId: string;
  readonly items: readonly { readonly key: string; readonly project_id: string; readonly name: string; readonly artifact_id: string; readonly versions: number | null }[];
}

export interface ProcessItemsMaintenanceView {
  readonly cutover: SyncCutoverView | null;
  /** This Home moves the adopted stream. */
  readonly adopted: boolean;
  readonly projects: readonly ProcessItemsProjectView[];
  /** The newest recovery file of this cutover that still checks against this Home. */
  readonly capture: ProcessItemsCaptureView | null;
}

const waitingFor = (message: string) => new ActionError("actions.conflict", message);
const complete = (cutover: SyncCutoverView | null) => {
  if (cutover?.phase !== "complete") throw waitingFor("过程项同步切换尚未完成，请先完成第一步");
  return cutover;
};

export function processItemsMaintenance(sync: Pick<PersonalSync, "processItems">, ports: ProcessItemsMaintenancePorts) {
  const home = () => realpathSync(ports.home);
  const libraries = () => {
    const root = home(), space = readStorageSpace(root);
    if (!space) throw new ActionError("actions.missing", "这个 Home 还没有账号空间");
    return projectDatabases(root, space).map(relative => ({ projectId: pathUtil.basename(pathUtil.dirname(relative)), path: pathUtil.join(root, relative) }));
  };
  const inspect = () => {
    const failures = processItemsSyncFailureKeys(home()), neverSynced = processItemsNeverSynced(home());
    return libraries().map(library => ({ ...library, report: inspectProjectAdoption(library.path, { failures: failures.filter(key => processItemKey(key).projectId === library.projectId), neverSynced }) }));
  };
  /** The newest recovery file of this cutover that this Home still matches; a file that no longer checks is passed over, never used. */
  const verified = (cutoverId: string | null) => {
    for (const captureId of listProcessItemsRecoveries(home())) {
      try {
        const recovery = verifyProcessItemsRecovery({ home: home(), captureId });
        if (cutoverId === null || recovery.header.cutoverId === cutoverId) return recovery;
      } catch { /* A file this Home no longer matches is kept as it is and not offered: a newer capture replaces it. */ }
    }
    return null;
  };
  const cutoverId = (cutover: SyncCutoverView | null) => cutover && "cutoverId" in cutover ? cutover.cutoverId : null;

  return {
    async status(): Promise<ProcessItemsMaintenanceView> {
      const { cutover, adopted } = await sync.processItems.status();
      const names = await ports.names(), name = (projectId: string) => names.get(projectId) ?? projectId;
      const projects = inspect().map(({ projectId, report }) => {
        const open = new Set(report.unsettled);
        return { project_id: projectId, name: name(projectId), layout: report.layout,
          pending: report.items + report.outputs + report.bindings + report.private_values + report.positions,
          unsettled: [...report.unsettled], refused: report.refused.filter(reason => !open.has(reason)) };
      });
      const recovery = cutover?.phase === "complete" ? verified(cutoverId(cutover)) : null;
      const capture = recovery && {
        captureId: recovery.header.captureId,
        items: recovery.projects.flatMap(project => project.graphs.map(({ key, graph }) => {
          const versions = graph && typeof graph === "object" && Array.isArray((graph as { versions?: unknown }).versions) ? (graph as { versions: unknown[] }).versions.length : null;
          return { key, project_id: project.projectId, name: name(project.projectId), artifact_id: processItemKey(key).artifactId, versions };
        })),
      };
      return { cutover, adopted, projects, capture };
    },
    /** Step 1, once for the account from any device. */
    cutOver: () => sync.processItems.cutOver(),
    /** Step 2: keep this Home's unsent lines, while no round runs; null when nothing is unsettled. */
    capture: () => sync.processItems.maintain(cutover => captureProcessItemsRecovery({ home: home(), owner: ports.owner(), cutoverId: complete(cutover).cutoverId })),
    /**
     * Step 3: adopt each library that still has something to move, each while its project is held closed, with the recovery file that
     * keeps its unsettled lines; then, only if none was refused, join the adopted stream and take Files' own consents back.
     */
    async adopt(): Promise<{ readonly projects: readonly ProjectAdoptionReport[]; readonly adopted: boolean }> {
      const { cutover, reports } = await sync.processItems.maintain(async observed => {
        const cutover = complete(observed), recovery = verified(cutover.cutoverId)?.header.captureId;
        const reports: ProjectAdoptionReport[] = [];
        for (const { projectId, report } of inspect()) {
          const waiting = report.layout !== "current" || adoptionPending(report) || report.refused.length;
          if (!waiting) continue;
          reports.push(await ports.holdProject(projectId, () => adoptProjectDatabase({ home: home(), owner: ports.owner(), projectId,
            backupDirectory: pathUtil.join(home(), "sync", "process-items-adoption-backups"), ...(recovery ? { recovery } : {}) })));
        }
        return { cutover, reports };
      });
      if (reports.some(report => report.state === "refused")) return { projects: reports, adopted: false };
      await sync.processItems.adopt(cutover.cutoverId);
      retireFilesConsents({ home: home(), owner: ports.owner(), at: ports.now?.() ?? new Date().toISOString() });
      return { projects: reports, adopted: true };
    },
    /** Step 4: take the kept lines over on the adopted stream; each line's outcome is the person's to see. */
    async takeOver(): Promise<readonly ProcessItemsTakeoverOutcome[]> {
      const { cutover } = await sync.processItems.status();
      const recovery = verified(cutoverId(complete(cutover)));
      if (!recovery) throw waitingFor("这台设备没有可接管的保全过程项");
      return sync.processItems.takeOver(recovery.header.captureId);
    },
  };
}
export type ProcessItemsMaintenance = ReturnType<typeof processItemsMaintenance>;
