import { openProjectVersionStores } from './project-version-stores.js';
import {projectSyncCatalog} from './project-sync-catalog.js';
import {
  createArtifactReplication, createProcessItemReplication, validateArtifactReplication, validateProcessItemReplication, createArtifactSyncContent,
} from '@molis-ai/molis-work-module-artifacts';
import { createSyncConflictState, createSyncJsonContent } from '@molis-ai/molis-work-plugin-sdk';
import type { AggregateReplicaContext } from '@molis-ai/molis-work-contracts/platform/plugin-registration';
import { defineErrorCodes, objectLink } from '@molis-ai/molis-work-contracts/platform/actions';
import { createSqliteReplica, namespacedReplicaDatabase, ensureStorageSpace, readDatabaseSpace } from '@molis-ai/molis-work-storage';
import { partitionedReplica, type SyncRegistration, syncNamespace } from '@molis-ai/molis-work-module-sync-replication';
import { PLATFORM_SYNC_COLLECTIONS } from './platform-sync-catalog.js';
import { LocalProjectDatabase } from './project-database.js';
import { SYSTEM_MATERIALS_SOURCE } from '@molis-ai/molis-work-contracts/platform/project-materials';
import type { PortableProcessItem } from '@molis-ai/molis-work-module-artifacts';
import type { LocalWebCatalogRunner } from './web-project-settings.js';

const errors = defineErrorCodes('host', { version_sync_scope: 'forbidden', version_sync_invalid: 'invalid', version_sync_unavailable: 'unavailable' });
const fixedVersionBindings = () => PLATFORM_SYNC_COLLECTIONS.filter(row => row.owner === 'artifacts');
type FixedVersionBinding = ReturnType<typeof fixedVersionBindings>[number];
type ResolveReference = NonNullable<AggregateReplicaContext['hasReference']>;
function libraryBinding(): FixedVersionBinding {
  const matches = fixedVersionBindings().filter(row => row.store === 'library');
  if (matches.length !== 1) throw errors.version_sync_invalid('成果固定版本同步目录必须只有一个 owner');
  return matches[0]!;
}
export const artifactSyncSelection = libraryBinding().selection;

const SYSTEM_TYPES = new Set(SYSTEM_MATERIALS_SOURCE.process_items.map(type => `${type.artifact_type_id}@${type.schema_version}`));
const SYSTEM_PRODUCER = { plugin_id: SYSTEM_MATERIALS_SOURCE.plugin_id, signature: SYSTEM_MATERIALS_SOURCE.signature };
/** Nothing may claim the platform materials source with a mismatched signature or an undeclared type. */
function assertSystemMaterialsProducer(item: PortableProcessItem): void {
  const identity = item.identity;
  const exact = (plugin: string, signature: string) => plugin === SYSTEM_PRODUCER.plugin_id && signature === SYSTEM_PRODUCER.signature;
  const claims = (plugin: string, signature: string) => plugin === SYSTEM_PRODUCER.plugin_id || signature === SYSTEM_PRODUCER.signature;
  if (claims(identity.producer_plugin_id, identity.producer_binding_signature)) {
    if (!exact(identity.producer_plugin_id, identity.producer_binding_signature) || item.versions.some(version =>
      !exact(version.producer_plugin_id, version.producer_binding_signature) || !SYSTEM_TYPES.has(`${version.artifact_type_id}@${version.schema_version}`))) {
      throw errors.version_sync_invalid('过程项冒用平台资料来源，原件已保留');
    }
  } else if (item.versions.some(version => claims(version.producer_plugin_id, version.producer_binding_signature))) {
    throw errors.version_sync_invalid('过程项冒用平台资料来源，原件已保留');
  }
}

/** Both fixed stores come from the same plugin catalog, with different journals and explicit opt-in collections. */
export function createPersonalFixedVersionBindings(home: string, spaceId: string, userId: string, check: () => void, withCatalog: LocalWebCatalogRunner, resolveReference?: ResolveReference) {
  const bindings = fixedVersionBindings().map(binding => ({
    store: binding.store,
    ...createVersionRegistration(home, spaceId, userId, check, withCatalog, binding, resolveReference),
  }));
  const artifacts = bindings.find(binding => binding.store === 'library');
  if (!artifacts) throw errors.version_sync_invalid('成果同步 owner 未登记');
  return { artifacts, registrations: bindings.map(binding => binding.registration) };
}
/** Existing library entrypoint retained for trusted consumers; process items never pass through this library store. */
export function createPersonalArtifactRegistration(home: string, spaceId: string, userId: string, check: () => void, withCatalog: LocalWebCatalogRunner) {
  return createVersionRegistration(home, spaceId, userId, check, withCatalog, libraryBinding());
}

function createVersionRegistration(home: string, spaceId: string, userId: string, check: () => void, withCatalog: LocalWebCatalogRunner, declared: FixedVersionBinding, resolveReference?: ResolveReference) {
  check();
  const space = ensureStorageSpace(home), library = declared.store === 'library';
  if (space.kind !== 'personal' || space.spaceId !== spaceId || space.ownerUserId !== userId) throw errors.version_sync_scope('固定版本同步空间不匹配');
  const kind = library ? 'artifact' : 'process_item', journal = library ? 'artifacts' : 'process_items';
  const namespace = syncNamespace(declared.selection);
  let projects = new Map<string, { title: string; path: string; enabled: boolean }>();
  const decode = (key: string): [string, string, string] => {
    const value: unknown = JSON.parse(key);
    if (!Array.isArray(value) || value.length !== 3 || value[1] !== kind || !value.every(part => typeof part === 'string' && part.length > 0 && part.length <= 200)) throw errors.version_sync_invalid('固定版本同步标识无效');
    return value as [string, string, string];
  };
  const withProject = <T>(id: string, run: (store: LocalProjectDatabase, project: NonNullable<ReturnType<typeof projects.get>>) => T, requireLibrary = true): T => {
    check();
    const project = projects.get(id);
    if (!project || requireLibrary && !project.enabled) throw errors.version_sync_unavailable('项目或成果插件暂不可用');
    const store = new LocalProjectDatabase(project.path);
    try {
      if (readDatabaseSpace(store.db)?.spaceId !== spaceId) throw errors.version_sync_scope('固定版本数据库不属于当前空间');
      check(); return run(store, project);
    } finally { store.close(); }
  };
  const replicaOf = (store: LocalProjectDatabase, project: NonNullable<ReturnType<typeof projects.get>>, id: string) => {
    const context = { spaceId, projectId: id, authorize: check };
    const events = { appendEvent: (event: Parameters<typeof store.appendEvent>[0]) => store.appendEvent(event), eventCursor: (projectId: string) => store.eventCursor(projectId) };
    const owner = library ? createArtifactReplication(store.db, context, events) : createProcessItemReplication(store.db, context, events);
    return createSqliteReplica(namespacedReplicaDatabase(store.replicationDatabase, journal), {
      authorize: check, conflictState: createSyncConflictState,
      read(key) { const [projectId, , artifactId] = decode(key); if (projectId !== id) throw errors.version_sync_invalid('固定版本项目不匹配'); const artifact = owner.read(artifactId); return artifact ? { project: { id, title: project.title }, artifact } : null; },
      apply(key, value) {
        const [projectId, , artifactId] = decode(key);
        const payload = value as { project?: { id?: unknown; title?: unknown }; artifact?: { identity?: { artifact_id?: unknown } } } | null;
        if (projectId !== id || !payload || Object.keys(payload).length !== 2 || payload.project?.id !== id || typeof payload.project.title !== 'string'
          || payload.project.title.length > 120 || Object.keys(payload.project).length !== 2 || payload.artifact?.identity?.artifact_id !== artifactId) throw errors.version_sync_invalid('固定版本同步内容或项目无效');
        if (!library) assertSystemMaterialsProducer(validateProcessItemReplication(payload.artifact, context));
        owner.apply(payload.artifact);
      },
    });
  };
  const registration: SyncRegistration = {
    locate:key=>objectLink(decode(key)[0]!,{surface:'artifacts',id:decode(key)[2]!}),selection: declared.selection, dependencies: [], title: declared.title,
    content: library ? createArtifactSyncContent(spaceId) : createSyncJsonContent({ spaceId, authorize: check }),
    async refresh() {
      check();
      projects = await withCatalog({ homeDirectory: home }, catalog => new Map(projectSyncCatalog(catalog).map(project => [
        project.project_id, { title: project.display_name, path: project.database_path, enabled: !project.recycled },
      ])));
      check();
    },
    withReplica(run) {
      return run(partitionedReplica({
        home, namespace, authorize: check,
        partitions: () => [...projects].filter(([, project]) => project.enabled).map(([id]) => id),
        partition: key => decode(key)[0], projectPartition:id=>id, projectPartitions:()=>[...projects.keys()],projectAbsent:id=>!projects.has(id),
        withPartition(id, operation,passive) {
          return withProject(id, (store, project) => operation(replicaOf(store, project, id)),!passive);
        },
      }));
    },
    async prepare(event) {
      check(); const [id] = decode(event.key);
      const value = event.value as { project?: { id?: unknown; title?: unknown }; artifact?: unknown } | null;
      if (!value?.project || value.project.id !== id || typeof value.project.title !== 'string' || !value.project.title.trim() || value.project.title.length > 120) throw errors.version_sync_invalid('固定版本项目定位无效');
      if (Object.keys(value).length !== 2 || Object.keys(value.project).length !== 2) throw errors.version_sync_invalid('固定版本项目字段无效');
      const validated = (library ? validateArtifactReplication : validateProcessItemReplication)(value.artifact, {spaceId,projectId:id,authorize:check});
      if (validated.identity.artifact_id !== decode(event.key)[2]) throw errors.version_sync_invalid('固定版本身份不匹配');
      if (!library) assertSystemMaterialsProducer(validated as PortableProcessItem);
      await withCatalog({ homeDirectory: home }, async catalog => {
        check(); if (catalog.listProjects().some(project => project.project_id === id)) return;
        await catalog.ensureSyncedProject({ project_id: id, display_name: value.project!.title as string, actor_id: userId }, check);
        check();
      }); check();
    },
  };
  return {
    registration,
    hasReference(projectId: string, reference: { owner: 'goals' | 'artifacts'; assetId: string; version?: number }): boolean {
      check(); const project = projects.get(projectId);
      if (!project || reference.owner === 'artifacts' && !project.enabled) return false;
      if(reference.owner!=='artifacts'){const found=resolveReference?.(projectId,reference)??false;check();return found;}
      return withProject(projectId, store => reference.version !== undefined && !!openProjectVersionStores(store).artifacts.query.getArtifactVersion(projectId,{artifact_id:reference.assetId,version:reference.version}));
    },
  };
}
