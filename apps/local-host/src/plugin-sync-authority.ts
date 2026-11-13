import { AsyncLocalStorage } from 'node:async_hooks';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { AggregateReplicaContext } from '@molis-ai/molis-work-contracts/platform/plugin-registration';
import type { PluginSyncIdentity } from '@molis-ai/molis-work-contracts/platform/plugin-sync';

export interface PluginSyncCollectionIdentity extends PluginSyncIdentity { readonly collection_id: string; readonly schema_version: number }

/** Authority belongs to a synchronization/copy operation, never to a plugin's start or saved configuration. */
export interface PluginSyncAuthority {
  readonly home: string;
  readonly context: AggregateReplicaContext;
  assertCollection(identity: PluginSyncCollectionIdentity): void;
}
interface AuthorityScope { readonly authority: PluginSyncAuthority; live: boolean }
const current = new AsyncLocalStorage<AuthorityScope>();

export function withPluginSyncAuthority<T>(authority: PluginSyncAuthority, run: () => T): T;
export function withPluginSyncAuthority(authority: PluginSyncAuthority, run: () => unknown): unknown {
  authority.context.authorize();
  const scope: AuthorityScope = { authority, live: true };
  return current.run(scope, () => {
    try {
      const result = run();
      const then = result !== null && (typeof result === 'object' || typeof result === 'function') ? Reflect.get(result, 'then') : undefined;
      if (typeof then === 'function') {
        // Assimilate once inside this operation, including foreign thenables and throwing getters.
        return Promise.resolve({ then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
          Reflect.apply(then, result, [resolve, reject]);
        } }).finally(() => { scope.live = false; });
      }
      scope.live = false;
      return result;
    } catch (error) {
      scope.live = false;
      throw error;
    }
  });
}

/** One Home whether a caller holds its path or its real path (an artifact-row library opens the real path; macOS temp folders are symlinks). */
function sameHome(held: string, used: string): boolean {
  return resolve(held) === resolve(used) || realpathSync(held) === realpathSync(used);
}

/** Called again for every adapter operation; a retained adapter grants no account or collection authority. */
export function pluginSyncAuthority(home: string, identity: PluginSyncCollectionIdentity): AggregateReplicaContext {
  const scope = current.getStore();
  if (!scope?.live || !sameHome(scope.authority.home, home)) {
    throw new ActionError('actions.forbidden', '同步内容只能在当前已授权的同步或复制操作中访问');
  }
  const { authority } = scope;
  authority.context.authorize();
  authority.assertCollection(identity);
  const authorize = () => {
    if (!scope.live || current.getStore() !== scope) throw new ActionError('actions.forbidden', '同步授权作用域已结束');
    authority.context.authorize();
    authority.assertCollection(identity);
  };
  const lookup = <T>(read: () => T): T => { authorize(); const value = read(); authorize(); return value; };
  return {
    spaceId: authority.context.spaceId, authorize,
    // This pure token calculation has no owner access; only the lookup capabilities carry authority.
    ...(authority.context.conflictState ? { conflictState: authority.context.conflictState } : {}),
    project: id => lookup(() => authority.context.project(id)),
    canUploadProject: id => lookup(() => authority.context.canUploadProject(id)),
    hasArtifact: (projectId, id, version) => lookup(() => authority.context.hasArtifact(projectId, id, version)),
    ...(authority.context.hasReference ? { hasReference: (projectId: string, reference: Parameters<NonNullable<AggregateReplicaContext['hasReference']>>[1]) => lookup(() => authority.context.hasReference!(projectId, reference)) } : {}),
  };
}
