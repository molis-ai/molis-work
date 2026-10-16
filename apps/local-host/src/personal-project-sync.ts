import { replicaError } from './project-replication-errors.js';
import { ensureStorageSpace } from '@molis-ai/molis-work-storage';
import { partitionedReplica, syncNamespace, type SyncRegistration } from '@molis-ai/molis-work-module-sync-replication';
import type { SyncSelection } from '@molis-ai/molis-work-module-sync-replication';
import { availableProjectPluginIds } from '@molis-ai/molis-work-app-workbench';
import { LocalProjectDatabase } from './project-database.js';
import { createProjectGoalReplica } from './project-replication.js';
import { createScheduleTaskReplica } from '@molis-ai/molis-work-plugin-schedule';
import { createFeedRuleReplica } from '@molis-ai/molis-work-plugin-feed';
import type { LocalWebCatalogRunner } from './web-project-settings.js';

export function createPersonalGoalRegistration(home: string, spaceId: string, userId: string, check: () => void, withCatalog: LocalWebCatalogRunner, selection: SyncSelection): SyncRegistration {
  const space = ensureStorageSpace(home);
  if (space.kind !== 'personal' || space.spaceId !== spaceId || space.ownerUserId !== userId) throw replicaError('replica_scope_mismatch');
  let projects = new Map<string, { title: string; path: string; enabled: boolean }>();
  const projectId = (key: string): string => {
    const value: unknown = JSON.parse(key);
    if (!Array.isArray(value) || value.length !== 3 || value[1] !== 'project_goals' || value[0] !== value[2] || typeof value[0] !== 'string') throw replicaError('replica_key_invalid');
    return value[0];
  };
  return {
    selection, title: '目标、关系与工作记录',
    async refresh() {
      check(); projects = await withCatalog({ homeDirectory: home }, c => new Map(c.listProjects().map(p => [p.project_id, { title: p.display_name, path: p.database_path, enabled: availableProjectPluginIds(c.listProjectPlugins(p.project_id)).has('goals') }]))); check();
    },
    withReplica(run) {
      return run(partitionedReplica({ home, namespace: syncNamespace(selection), authorize: check,
        partitions: () => [...projects].filter(([, p]) => p.enabled).map(([id]) => id), partition: projectId,
        withPartition(id, operation) {
          check(); const project = projects.get(id);
          if (!project?.enabled) throw replicaError('replica_project_unavailable');
          const store = new LocalProjectDatabase(project.path);
          try { return operation(createProjectGoalReplica(store.db, { spaceId, projectId: id, title: project.title, authorize: check })); }
          finally { store.close(); }
        },
      }));
    },
    async prepare(event) {
      check(); const id = projectId(event.key);
      const value = event.value as { format?: unknown; spaceId?: unknown; project?: { id?: unknown; title?: unknown } } | null;
      if (value?.format !== 1 || value.spaceId !== spaceId || value.project?.id !== id || typeof value.project.title !== 'string' || !value.project.title.trim() || value.project.title.length > 120) throw replicaError('replica_project_invalid');
      await withCatalog({ homeDirectory: home }, async catalog => {
        check(); if (catalog.listProjects().some(p => p.project_id === id)) return;
        await catalog.ensureSyncedProject({ project_id: id, display_name: value.project!.title as string, actor_id: userId }, check); check();
      }); check();
    },
  };
}

/** Schedule is partitioned by project DB; imported tasks remain paused on the receiving device. */
export function createPersonalScheduleRegistration(home: string, spaceId: string, userId: string, check: () => void, withCatalog: LocalWebCatalogRunner, selection: SyncSelection): SyncRegistration {
  const space = ensureStorageSpace(home);
  if (space.kind !== 'personal' || space.spaceId !== spaceId || space.ownerUserId !== userId) throw replicaError('replica_scope_mismatch');
  let projects = new Map<string, { title: string; path: string; enabled: boolean }>();
  const projectId = (key: string): string => {
    const value: unknown = JSON.parse(key);
    if (!Array.isArray(value) || value.length !== 3 || value[1] !== 'schedule_task' || typeof value[0] !== 'string' || typeof value[2] !== 'string') throw replicaError('replica_key_invalid');
    return value[0];
  };
  return {
    selection, title: '定时对话任务',
    async refresh() {
      check(); projects = await withCatalog({ homeDirectory: home }, c => new Map(c.listProjects().map(p => [p.project_id, { title: p.display_name, path: p.database_path, enabled: availableProjectPluginIds(c.listProjectPlugins(p.project_id)).has('schedule') }]))); check();
    },
    withReplica(run) {
      return run(partitionedReplica({ home, namespace: syncNamespace(selection), authorize: check,
        partitions: () => [...projects].filter(([, p]) => p.enabled).map(([id]) => id), partition: projectId,
        withPartition(id, operation) {
          check(); const project = projects.get(id);
          if (!project?.enabled) throw replicaError('replica_project_unavailable');
          const store = new LocalProjectDatabase(project.path);
          try { return operation(createScheduleTaskReplica(store.db, { spaceId, projectId: id, title: project.title, authorize: check })); }
          finally { store.close(); }
        },
      }));
    },
    async prepare(event) {
      check(); const id = projectId(event.key);
      if (event.value === null) return;
      const value = event.value as { format?: unknown; spaceId?: unknown; project?: { id?: unknown; title?: unknown } };
      if (value?.format !== 1 || value.spaceId !== spaceId || value.project?.id !== id || typeof value.project.title !== 'string' || !value.project.title.trim() || value.project.title.length > 120) throw replicaError('replica_project_invalid');
      await withCatalog({ homeDirectory: home }, async catalog => {
        check();
        const existing = catalog.listProjects().find(p => p.project_id === id);
        const project = existing ?? await catalog.ensureSyncedProject({ project_id: id, display_name: value.project!.title as string, actor_id: userId }, check);
        check();
        if (!availableProjectPluginIds(catalog.listProjectPlugins(id)).has('schedule')) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: 'schedule', actor_id: userId });
      }); check();
    },
  };
}

/** Capture rules are project-local; restored rules wait for an explicit local enable. */
export function createPersonalFeedRuleRegistration(home: string, spaceId: string, userId: string, check: () => void, withCatalog: LocalWebCatalogRunner, selection: SyncSelection): SyncRegistration {
  const space = ensureStorageSpace(home);
  if (space.kind !== 'personal' || space.spaceId !== spaceId || space.ownerUserId !== userId) throw replicaError('replica_scope_mismatch');
  let projects = new Map<string, { title: string; path: string; enabled: boolean }>();
  const projectId = (key: string): string => {
    const value: unknown = JSON.parse(key);
    if (!Array.isArray(value) || value.length !== 3 || value[1] !== 'feed_rule' || typeof value[0] !== 'string' || typeof value[2] !== 'string') throw replicaError('replica_key_invalid');
    return value[0];
  };
  return {
    selection, title: '消息捕捉规则',
    async refresh() {
      check(); projects = await withCatalog({ homeDirectory: home }, c => new Map(c.listProjects().map(p => [p.project_id, { title: p.display_name, path: p.database_path, enabled: availableProjectPluginIds(c.listProjectPlugins(p.project_id)).has('feed') }]))); check();
    },
    withReplica(run) {
      return run(partitionedReplica({ home, namespace: syncNamespace(selection), authorize: check,
        partitions: () => [...projects].filter(([, p]) => p.enabled).map(([id]) => id), partition: projectId,
        withPartition(id, operation) {
          check(); const project = projects.get(id);
          if (!project?.enabled) throw replicaError('replica_project_unavailable');
          const store = new LocalProjectDatabase(project.path);
          try { return operation(createFeedRuleReplica(store.db, { spaceId, projectId: id, title: project.title, authorize: check })); }
          finally { store.close(); }
        },
      }));
    },
    async prepare(event) {
      check(); const id = projectId(event.key);
      if (event.value === null) return;
      const value = event.value as { format?: unknown; spaceId?: unknown; project?: { id?: unknown; title?: unknown } };
      if (value?.format !== 1 || value.spaceId !== spaceId || value.project?.id !== id || typeof value.project.title !== 'string' || !value.project.title.trim() || value.project.title.length > 120) throw replicaError('replica_project_invalid');
      await withCatalog({ homeDirectory: home }, async catalog => {
        check();
        const existing = catalog.listProjects().find(p => p.project_id === id);
        const project = existing ?? await catalog.ensureSyncedProject({ project_id: id, display_name: value.project!.title as string, actor_id: userId }, check);
        check();
        if (!availableProjectPluginIds(catalog.listProjectPlugins(id)).has('feed')) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: 'feed', actor_id: userId });
      }); check();
    },
  };
}
