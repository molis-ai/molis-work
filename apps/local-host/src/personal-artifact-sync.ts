import { openProjectVersionStores } from './project-version-stores.js';
import {projectSyncCatalog} from './project-sync-catalog.js';
import {
  createArtifactReplication, createProcessItemReplication, validateArtifactReplication, validateProcessItemReplication, createArtifactSyncContent,
  reassignPortableProcessItem,
} from '@molis-ai/molis-work-module-artifacts';
import { createSyncConflictState, createSyncJsonContent } from '@molis-ai/molis-work-plugin-sdk';
import type { SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { defineErrorCodes } from '@molis-ai/molis-work-contracts/platform/actions';
import { createSqliteReplica, namespacedReplicaDatabase, ensureStorageSpace, queueReplicaChange, readDatabaseSpace } from '@molis-ai/molis-work-storage';
import { partitionedReplica, syncCutoverLane, type ProcessItemsTakeoverOutcome, type SyncRegistration, syncNamespace } from '@molis-ai/molis-work-module-sync-replication';
import { verifyProcessItemsRecovery } from './process-items-recovery.js';
import { PLATFORM_SYNC_COLLECTIONS } from './platform-sync-catalog.js';
import { LocalProjectDatabase } from './project-database.js';
import { readBackProcessItem } from './process-items-readback.js';
import { ADOPTED_PROCESS_ITEMS_JOURNAL } from './project-replication-schema.js';
import { FILES_PRODUCER, SYSTEM_PRODUCER } from './process-items-adoption.js';
import { SYSTEM_MATERIALS_SOURCE } from '@molis-ai/molis-work-contracts/platform/project-materials';
import type { PortableProcessItem } from '@molis-ai/molis-work-module-artifacts';
import type { LocalWebCatalogRunner } from './web-project-settings.js';

const errors = defineErrorCodes('host', { version_sync_scope: 'forbidden', version_sync_invalid: 'invalid', version_sync_unavailable: 'unavailable' });
const fixedVersionBindings = () => PLATFORM_SYNC_COLLECTIONS.filter(row => row.owner === 'artifacts');
type FixedVersionBinding = ReturnType<typeof fixedVersionBindings>[number];
function libraryBinding(): FixedVersionBinding {
  const matches = fixedVersionBindings().filter(row => row.store === 'library');
  if (matches.length !== 1) throw errors.version_sync_invalid('成果固定版本同步目录必须只有一个 owner');
  return matches[0]!;
}
export const artifactSyncSelection = libraryBinding().selection;

const SYSTEM_TYPES = new Set(SYSTEM_MATERIALS_SOURCE.process_items.map(type => `${type.artifact_type_id}@${type.schema_version}`));
/**
 * The adopted stream carries no retired Files line, and nothing may claim the platform materials source with a type it does not write
 * (sync-cutover.md「Home 采用顺序」4): refused before any project is created or any row is written.
 */
function assertAdoptedProducer(item: PortableProcessItem): void {
  const identity = item.identity;
  const exact = (plugin: string, signature: string, producer: { plugin_id: string; signature: string }) => plugin === producer.plugin_id && signature === producer.signature;
  const claims = (plugin: string, signature: string) => plugin === SYSTEM_MATERIALS_SOURCE.plugin_id || signature === SYSTEM_MATERIALS_SOURCE.signature;
  if (identity.producer_plugin_id === FILES_PRODUCER.plugin_id || item.versions.some(version => version.producer_plugin_id === FILES_PRODUCER.plugin_id)) throw errors.version_sync_invalid('已退役的文件插件过程项不再接收，原件已保留');
  if (claims(identity.producer_plugin_id, identity.producer_binding_signature)) {
    if (!exact(identity.producer_plugin_id, identity.producer_binding_signature, SYSTEM_PRODUCER) || item.versions.some(version =>
      !exact(version.producer_plugin_id, version.producer_binding_signature, SYSTEM_PRODUCER) || !SYSTEM_TYPES.has(`${version.artifact_type_id}@${version.schema_version}`))) {
      throw errors.version_sync_invalid('过程项冒用平台资料来源，原件已保留');
    }
  } else if (item.versions.some(version => claims(version.producer_plugin_id, version.producer_binding_signature))) {
    throw errors.version_sync_invalid('过程项冒用平台资料来源，原件已保留');
  }
}

/** Both fixed stores come from the same plugin catalog, with different journals and explicit opt-in collections. */
export function createPersonalFixedVersionBindings(home: string, spaceId: string, userId: string, check: () => void, withCatalog: LocalWebCatalogRunner, hasGoal?: (projectId:string,goalId:string)=>boolean) {
  const bindings = fixedVersionBindings().map(binding => ({
    store: binding.store,
    ...createVersionRegistration(home, spaceId, userId, check, withCatalog, binding, hasGoal),
  }));
  const artifacts = bindings.find(binding => binding.store === 'library');
  if (!artifacts) throw errors.version_sync_invalid('成果同步 owner 未登记');
  return { artifacts, registrations: bindings.map(binding => binding.registration) };
}
/** Existing library entrypoint retained for trusted consumers; process items never pass through this library store. */
export function createPersonalArtifactRegistration(home: string, spaceId: string, userId: string, check: () => void, withCatalog: LocalWebCatalogRunner) {
  return createVersionRegistration(home, spaceId, userId, check, withCatalog, libraryBinding());
}

/**
 * The owner's adoption of one old-stream process item for the sync cutover (sync-cutover.md, plan/item): the retired Files line moves to
 * the platform materials source by the same rule as the project library, then the current owner writes and reads it back in a scratch
 * library, and what it reads is what the plan freezes. Deterministic for the same input; refuses rather than guesses.
 */
function adoptProcessItem(spaceId: string, check: () => void, projectId: string, artifactId: string, value: unknown): unknown {
  const payload = value as { project?: { id?: unknown; title?: unknown }; artifact?: unknown } | null;
  if (!payload || Object.keys(payload).length !== 2 || !payload.project || payload.project.id !== projectId || typeof payload.project.title !== 'string'
    || Object.keys(payload.project).length !== 2) throw errors.version_sync_invalid('过程项旧流内容无效，原件已保留');
  const context = { spaceId, projectId, authorize: check };
  const moved = reassignPortableProcessItem(validateProcessItemReplication(payload.artifact, context), FILES_PRODUCER, SYSTEM_PRODUCER, SYSTEM_MATERIALS_SOURCE.process_items);
  if (moved.identity.artifact_id !== artifactId) throw errors.version_sync_invalid('过程项身份不匹配，原件已保留');
  assertAdoptedProducer(moved);
  const read = readBackProcessItem(spaceId, check, projectId, moved);
  if (!read) throw errors.version_sync_invalid('过程项转换后读不回，原件已保留');
  return { project: { id: projectId, title: payload.project.title }, artifact: read };
}

function createVersionRegistration(home: string, spaceId: string, userId: string, check: () => void, withCatalog: LocalWebCatalogRunner, declared: FixedVersionBinding, hasGoal?: (projectId:string,goalId:string)=>boolean) {
  check();
  const space = ensureStorageSpace(home), library = declared.store === 'library';
  if (space.kind !== 'personal' || space.spaceId !== spaceId || space.ownerUserId !== userId) throw errors.version_sync_scope('固定版本同步空间不匹配');
  // Process items replicate only through the adopted journal, under the lane the engine binds once the account's cutover is complete
  // (specs/batch-06-shared-tools/current-version-adoption.md BSH-14-A/C); the original `process_items` journal is recovery evidence only.
  const kind = library ? 'artifact' : 'process_item', journal = library ? 'artifacts' : ADOPTED_PROCESS_ITEMS_JOURNAL;
  let lane: string | null = library ? syncNamespace(declared.selection) : null;
  const streamLane = () => { if (lane === null) throw errors.version_sync_unavailable('过程项同步需要先完成采用，原件已保留'); return lane; };
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
  /** The owner's replica of one project over one journal: the adopted (or library) journal when moving, either one when inspecting. */
  const replicaOf = (store: LocalProjectDatabase, project: NonNullable<ReturnType<typeof projects.get>>, id: string, over: string) => {
    const context = { spaceId, projectId: id, authorize: check };
    const events = { appendEvent: (event: Parameters<typeof store.appendEvent>[0]) => store.appendEvent(event), eventCursor: (projectId: string) => store.eventCursor(projectId) };
    const owner = library ? createArtifactReplication(store.db, context, events) : createProcessItemReplication(store.db, context, events);
    return createSqliteReplica(namespacedReplicaDatabase(store.replicationDatabase, over), {
      authorize: check, conflictState: createSyncConflictState,
      read(key) { const [projectId, , artifactId] = decode(key); if (projectId !== id) throw errors.version_sync_invalid('固定版本项目不匹配'); const artifact = owner.read(artifactId); return artifact ? { project: { id, title: project.title }, artifact } : null; },
      apply(key, value) {
        const [projectId, , artifactId] = decode(key);
        const payload = value as { project?: { id?: unknown; title?: unknown }; artifact?: { identity?: { artifact_id?: unknown } } } | null;
        if (projectId !== id || !payload || Object.keys(payload).length !== 2 || payload.project?.id !== id || typeof payload.project.title !== 'string'
          || payload.project.title.length > 120 || Object.keys(payload.project).length !== 2 || payload.artifact?.identity?.artifact_id !== artifactId) throw errors.version_sync_invalid('固定版本同步内容或项目无效');
        if (!library) assertAdoptedProducer(validateProcessItemReplication(payload.artifact, context));
        owner.apply(payload.artifact);
      },
    });
  };
  /**
   * Before this Home adopts the cutover nothing moves, but a project's own changes are still known: what either process-item journal
   * holds for it counts as unsent, so a project deletion never passes over local lines. Every moving operation is refused.
   */
  const inspection = (): SyncReplicaAdapter => {
    const refuse = (): never => { throw errors.version_sync_unavailable('过程项同步需要先完成采用，原件已保留'); };
    return {
      cursor: refuse, next: refuse, receive: refuse, acknowledge: refuse, resolve: refuse, counts: () => ({ pending: 0, conflicts: 0 }), conflicts: () => [],
      hasProjectChanges(projectId) {
        check(); if (!projects.has(projectId)) return false;
        return withProject(projectId, (store, project) => ['process_items', journal].some(over => { const counts = replicaOf(store, project, projectId, over).counts(); return counts.pending > 0 || counts.conflicts > 0; }), false);
      },
    };
  };
  const registration: SyncRegistration = {
    locate:key=>'/projects/'+encodeURIComponent(decode(key)[0])+'/?openPlugin='+'artifacts'+'&openItem='+encodeURIComponent(decode(key)[2]),selection: declared.selection, dependencies: [], title: declared.title,
    content: library ? createArtifactSyncContent(spaceId) : createSyncJsonContent({ spaceId, authorize: check }),
    async refresh() {
      check();
      projects = await withCatalog({ homeDirectory: home }, catalog => new Map(projectSyncCatalog(catalog).map(project => [
        project.project_id, { title: project.display_name, path: project.database_path, enabled: !project.recycled },
      ])));
      check();
    },
    ...(library ? {} : {
      bindLane(value: string | null) { lane = value; },
      adopt(key: string, value: unknown) { check(); const [projectId, , artifactId] = decode(key); return adoptProcessItem(spaceId, check, projectId, artifactId, value); },
      takeOver(captureId: string, keys?: readonly string[]): ProcessItemsTakeoverOutcome[] {
        check();
        // The person's takeover (sync-cutover.md step 5): only from a recovery file of this Home and this cutover, checked against it now.
        const recovery = verifyProcessItemsRecovery({ home, captureId });
        if (recovery.header.spaceId !== spaceId || lane !== syncCutoverLane(spaceId, recovery.header.cutoverId)) throw errors.version_sync_scope('恢复件不属于本机采用的这次过程项切换，原件已保留');
        const captured = new Set(recovery.projects.flatMap(project => project.graphs.map(graph => graph.key)));
        if (keys?.some(key => !captured.has(key))) throw errors.version_sync_invalid('只能接管恢复件里保全的过程项，原件已保留');
        const wanted = keys ? new Set(keys) : captured;
        return recovery.projects.flatMap(project => {
          const lines = project.graphs.map(graph => graph.key).filter(key => wanted.has(key));
          if (!lines.length) return [];
          if (!projects.has(project.projectId)) return lines.map(key => ({ key, outcome: 'kept' as const }));
          return withProject(project.projectId, store => {
            const db = namespacedReplicaDatabase(store.replicationDatabase, journal), context = { spaceId, projectId: project.projectId, authorize: check };
            const owner = createProcessItemReplication(store.db, context, { appendEvent: event => store.appendEvent(event), eventCursor: id => store.eventCursor(id) });
            const has = (table: string, key: string) => !!db.prepare(`SELECT 1 FROM replica_${table} WHERE key=?`).get(key);
            return lines.map(key => {
              // A line the adopted stream holds as a conflict goes through that conflict; one it already received has nothing left to move.
              if (has('conflicts', key)) return { key, outcome: 'conflict' as const };
              if (has('changes', key) || has('outbox', key)) return { key, outcome: 'queued' as const };
              if (has('heads', key)) return { key, outcome: 'same' as const };
              // A line the stream never had is a new write of this Home's own graph; a line that no longer exists here is kept as it was.
              if (!owner.read(decode(key)[2])) return { key, outcome: 'kept' as const };
              queueReplicaChange(db, key); check();
              return { key, outcome: 'queued' as const };
            });
          }, false);
        });
      },
    }),
    withReplica(run) {
      if (!library && lane === null) return run(inspection());
      return run(partitionedReplica({
        home, namespace: streamLane(), authorize: check,
        partitions: () => [...projects].filter(([, project]) => project.enabled).map(([id]) => id),
        partition: key => decode(key)[0], projectPartition:id=>id, projectPartitions:()=>[...projects.keys()],projectAbsent:id=>!projects.has(id),
        withPartition(id, operation,passive) {
          return withProject(id, (store, project) => operation(replicaOf(store, project, id, journal)),!passive);
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
      if (!library) assertAdoptedProducer(validated as PortableProcessItem);
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
      if(reference.owner==='goals'){const found=hasGoal?.(projectId,reference.assetId)??false;check();return found;}
      return withProject(projectId, store => reference.version !== undefined && !!openProjectVersionStores(store).artifacts.query.getArtifactVersion(projectId,{artifact_id:reference.assetId,version:reference.version}), reference.owner === 'artifacts');
    },
  };
}
