import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectCopyOwner } from "@molis-ai/molis-work-contracts/services/placement";
import { previewProjectCopy, executeProjectCopy, type ProjectCopyPreviewView, type ProjectCopyReceipt, type ProjectCopySource } from "@molis-ai/molis-work-service-placement";
import { readStorageSpace } from "@molis-ai/molis-work-storage";
import { openProjectCopyJournal } from "./project-copy-journal.js";
import { PERSONAL_SPACE_PROJECT_ID } from "./personal-space.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

const errors = defineErrorCodes("host", { copy_space_invalid: "forbidden", copy_project_invalid: "invalid" });

export interface CopyableLocalProject {
  readonly project_id: string;
  readonly display_name: string;
  readonly plugins: readonly string[];
}

export interface LocalProjectsCopyContext {
  readonly sourceHome: string;
  readonly targetHome: string;
  readonly targetSpaceId: string;
  readonly actorId: string;
  readonly sourceWithCatalog: LocalWebCatalogRunner;
  readonly targetWithCatalog: LocalWebCatalogRunner;
  readonly extraSources?: () => Promise<{ sources: readonly ProjectCopySource[]; close(): void }>;
  readonly extraTarget?: (ownerId: string, check: () => void) => { owner: ProjectCopyOwner; close(): void } | null;
  authorize(): void;
}

export interface LocalProjectsCopyPreviewResult {
  readonly preview: ProjectCopyPreviewView;
  readonly targetSpaceId: string;
  readonly projects: readonly CopyableLocalProject[];
}

export interface LocalProjectsCopyExecuteResult {
  readonly receipt: ProjectCopyReceipt;
  readonly status: "local_ready_pending_sync";
}

function assertSpaces(sourceHome: string, targetHome: string, targetSpaceId: string, authorize: () => void) {
  authorize();
  const source = readStorageSpace(sourceHome);
  const target = readStorageSpace(targetHome);
  if (!source || source.kind !== "local") throw errors.copy_space_invalid("复制来源必须是本地空间");
  if (!target || target.kind !== "personal" || target.spaceId !== targetSpaceId) {
    throw errors.copy_space_invalid("目标账号或个人空间已变化，请重新预览后确认");
  }
  return { source, target };
}

/** Read-only listing of non-personal local projects eligible for explicit copy into the personal space. */
export async function listCopyableLocalProjects(
  sourceHome: string,
  sourceWithCatalog: LocalWebCatalogRunner,
  authorize: () => void,
): Promise<readonly CopyableLocalProject[]> {
  authorize();
  const source = readStorageSpace(sourceHome);
  if (!source || source.kind !== "local") throw errors.copy_space_invalid("复制来源必须是本地空间");
  return sourceWithCatalog({ homeDirectory: sourceHome }, catalog => {
    authorize();
    return catalog
      .listProjects()
      .filter(project => project.project_id !== PERSONAL_SPACE_PROJECT_ID && !catalog.recycle.isRecycled(project.project_id))
      .map(project => ({
        project_id: project.project_id,
        display_name: project.display_name,
        plugins: catalog.listProjectPlugins(project.project_id),
      }))
      .sort((a, b) => a.project_id.localeCompare(b.project_id));
  });
}

function createProjectMetadataCopyOwner(
  byProject: ReadonlyMap<string, CopyableLocalProject>,
  sourceSpaceId: string,
  targetSpaceId: string,
  authorize: () => void,
): ProjectCopySource {
  const ownerId = "io.molis.work.module.projects.v1";
  const kind = `${ownerId}:project`;
  const owner: ProjectCopyOwner = {
    kinds: Object.freeze([kind]),
    read(reference) {
      authorize();
      if (reference.kind !== kind || reference.projectId === null) return null;
      const project = byProject.get(reference.id);
      if (!project || project.project_id !== reference.projectId) return null;
      return { key: JSON.stringify([project.project_id, "project"]), value: { spaceId: sourceSpaceId, project } };
    },
    snapshot(projectId) {
      authorize();
      const project = byProject.get(projectId);
      if (!project) throw errors.copy_project_invalid("所选本地项目不存在或已回收");
      return [{ key: JSON.stringify([project.project_id, "project"]), value: { spaceId: sourceSpaceId, project } }];
    },
    references() {
      authorize();
      return [];
    },
    fork(asset, identity) {
      authorize();
      const raw = asset.value as { project: CopyableLocalProject };
      return {
        key: JSON.stringify([identity.targetProjectId, "project"]),
        value: {
          spaceId: targetSpaceId,
          project: { project_id: identity.targetProjectId, display_name: identity.targetTitle, plugins: [...raw.project.plugins] },
        },
      };
    },
    apply() {
      // Target catalog staging & publishing are handled atomically by prepareProject/publishProject.
      authorize();
    },
  };
  return { ownerId, owner };
}

/**
 * Preview copying one or more local-space projects into the authenticated personal space.
 * Never modifies the local source or target Home, never touches sync policy or device switches.
 */
export async function previewLocalProjectsCopy(
  context: LocalProjectsCopyContext,
  projectIds: readonly string[],
): Promise<LocalProjectsCopyPreviewResult> {
  const { source } = assertSpaces(context.sourceHome, context.targetHome, context.targetSpaceId, context.authorize);
  if (!Array.isArray(projectIds) || projectIds.length === 0 || projectIds.length > 100) {
    throw errors.copy_project_invalid("请至少选择一个本地项目");
  }
  const all = await listCopyableLocalProjects(context.sourceHome, context.sourceWithCatalog, context.authorize);
  const byId = new Map(all.map(item => [item.project_id, item]));
  const selected: CopyableLocalProject[] = [];
  for (const id of new Set(projectIds)) {
    const project = byId.get(id);
    if (!project) throw errors.copy_project_invalid(`本地项目不可复制或不存在: ${id}`);
    selected.push(project);
  }
  const extra = context.extraSources ? await context.extraSources() : { sources: [], close() {} };
  try {
    const metaSource = createProjectMetadataCopyOwner(byId, source.spaceId, context.targetSpaceId, context.authorize);
    const sources: ProjectCopySource[] = [metaSource, ...extra.sources.filter(item => item.ownerId !== metaSource.ownerId)];
    const preview = previewProjectCopy({
      sourceSpaceId: source.spaceId,
      projectIds: selected.map(item => item.project_id),
      sources,
      authorize: () => assertSpaces(context.sourceHome, context.targetHome, context.targetSpaceId, context.authorize),
    });
    return { preview: preview.view, targetSpaceId: context.targetSpaceId, projects: selected };
  } finally {
    extra.close();
  }
}

/**
 * Execute an explicitly confirmed local-to-personal multi-project copy with hidden staging,
 * atomic catalog publishing, idempotent operation receipts, and strict offline/full-quota support.
 */
export async function executeLocalProjectsCopy(
  context: LocalProjectsCopyContext,
  input: { projectIds: readonly string[]; fingerprint: string; operationId: string },
): Promise<LocalProjectsCopyExecuteResult> {
  const checkSpaces = () => assertSpaces(context.sourceHome, context.targetHome, context.targetSpaceId, context.authorize);
  const { source } = checkSpaces();
  if (typeof input.operationId !== "string" || !input.operationId.trim() || input.operationId.length > 160) {
    throw errors.copy_project_invalid("缺少有效的复制操作标识");
  }
  if (typeof input.fingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(input.fingerprint)) {
    throw errors.copy_project_invalid("请先预览并确认当前复制内容");
  }
  const all = await listCopyableLocalProjects(context.sourceHome, context.sourceWithCatalog, checkSpaces);
  const byId = new Map(all.map(item => [item.project_id, item]));
  const selected = [...new Set(input.projectIds)].map(id => {
    const project = byId.get(id);
    if (!project) throw errors.copy_project_invalid(`本地项目不可复制或不存在: ${id}`);
    return project;
  });
  if (!selected.length) throw errors.copy_project_invalid("请至少选择一个本地项目");
  const extra = context.extraSources ? await context.extraSources() : { sources: [], close() {} };
  try {
    const metaSource = createProjectMetadataCopyOwner(byId, source.spaceId, context.targetSpaceId, checkSpaces);
    const sources: ProjectCopySource[] = [metaSource, ...extra.sources.filter(item => item.ownerId !== metaSource.ownerId)];
    const preview = previewProjectCopy({
      sourceSpaceId: source.spaceId,
      projectIds: selected.map(item => item.project_id),
      sources,
      authorize: checkSpaces,
    });
    // Ensure the target personal Home baseline is initialized before creating placement/project-copies.json.
    await context.targetWithCatalog({ homeDirectory: context.targetHome }, () => { checkSpaces(); });
    const journal = openProjectCopyJournal(context.targetHome, context.targetSpaceId, checkSpaces);
    const receipt = await executeProjectCopy({
      operationId: input.operationId,
      sourceSpaceId: source.spaceId,
      targetSpaceId: context.targetSpaceId,
      projects: selected.map(project => ({ id: project.project_id, title: project.display_name })),
      fingerprint: input.fingerprint,
      preview,
      sources,
      journal,
      authorize: checkSpaces,
      target(ownerId, check) {
        if (ownerId === metaSource.ownerId) {
          return { owner: metaSource.owner, close() {} };
        }
        const resolved = context.extraTarget?.(ownerId, check);
        if (!resolved) throw new ActionError("actions.unavailable", `目标空间尚未接入复制所有者: ${ownerId}`);
        return resolved;
      },
      async prepareProject(project, check) {
        check();
        const sourceProject = byId.get(project.sourceId);
        await context.targetWithCatalog({ homeDirectory: context.targetHome }, async catalog => {
          check();
          // Stage hidden via catalog recycle state so incomplete copies never appear in listProjects().
          const alreadyExists = catalog.listProjects().some(item => item.project_id === project.targetId);
          if (!alreadyExists && !catalog.recycle.isRecycled(project.targetId)) {
            await catalog.ensureSyncedProject({ project_id: project.targetId, display_name: project.title, actor_id: context.actorId }, check);
            for (const pluginId of sourceProject?.plugins ?? []) {
              if (!catalog.listProjectPlugins(project.targetId).includes(pluginId)) {
                try { catalog.addProjectPlugin({ project_id: project.targetId, plugin_id: pluginId, actor_id: context.actorId }); } catch { /* Missing plugin stays portable without auto-installing. */ }
              }
            }
            const observed = catalog.recycle.inspect(project.targetId);
            await catalog.commit(() => catalog.recycle.change({
              project_id: project.targetId,
              recycled: true,
              confirmed: true,
              actor_id: context.actorId,
              operation_id: `copy-stage:${input.operationId}:${project.targetId}`,
              expected_state: observed.state,
            }, check));
          }
        });
        check();
      },
      async publishProject(project, check) {
        check();
        await context.targetWithCatalog({ homeDirectory: context.targetHome }, async catalog => {
          check();
          if (catalog.recycle.isRecycled(project.targetId)) {
            const observed = catalog.recycle.inspect(project.targetId);
            await catalog.commit(() => catalog.recycle.change({
              project_id: project.targetId,
              recycled: false,
              confirmed: true,
              actor_id: context.actorId,
              operation_id: `copy-publish:${input.operationId}:${project.targetId}`,
              expected_state: observed.state,
            }, check));
          }
        });
        check();
      },
    });
    return { receipt, status: "local_ready_pending_sync" };
  } finally {
    extra.close();
  }
}
