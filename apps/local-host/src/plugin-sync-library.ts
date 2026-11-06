import { createPluginSectionsBinding } from './plugin-sync-sections.js';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { PluginSyncClient, PluginSyncBusinessDatabase, SyncAggregateDefinition } from '@molis-ai/molis-work-contracts/platform/plugin-sync';
import type { ReplicaDatabase } from '@molis-ai/molis-work-contracts/platform/plugin-registration';
import type { SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { createPluginSyncService } from '@molis-ai/molis-work-plugin-runtime';
import { createAggregateReplica, createAggregateCopy, createSqliteReplica, createCollectionCopy, readDatabaseSpace } from '@molis-ai/molis-work-storage';
import { pluginSyncAuthority } from './plugin-sync-authority.js';

/** Trusted verified-library owner. Its database accessor includes the collection's platform journal namespace. */
export interface PluginSyncLibraryPort {
  readonly home: string;
  readonly manifest: PluginManifest;
  readonly tables: ReadonlyMap<string, ReadonlySet<string>>;
  assertActive(): void;
  authorize(permission: string): void;
  readonly readPermission: string;
  readonly writePermission: string;
  database(collectionId: string): ReplicaDatabase;
  businessDatabase(authorize: () => void): PluginSyncBusinessDatabase;
  actorId(): string;
  projectId(): string;
  retain(collectionId: string, transaction: import('@molis-ai/molis-work-contracts/platform/plugin').PluginDatabaseTransaction, key: string, value: unknown): void;
}

/** Retaining this service or an adapter never retains a login lease. Every operation reads its current authority scope. */
export function pluginSyncLibrary(port: PluginSyncLibraryPort): PluginSyncClient {
  const use = <T>(collectionId: string, run: (db: ReplicaDatabase, context: ReturnType<typeof pluginSyncAuthority>) => T, write = false): T => {
    port.assertActive();
    const collection = port.manifest.sync?.collections.find(row => row.id === collectionId);
    if (!collection) throw new ActionError('actions.forbidden', '当前插件未声明这个同步集合');
    const context = pluginSyncAuthority(port.home, { plugin_id: port.manifest.plugin_id,
      publisher_id: port.manifest.publisher.publisher_id, publisher_signature: port.manifest.publisher.signature,
      collection_id: collection.id, schema_version: collection.schema_version });
    const authorize = context.authorize;
    context.authorize = () => { port.assertActive(); port.authorize(port.readPermission); if (write) port.authorize(port.writePermission); authorize(); port.assertActive(); };
    context.authorize();
    const db = port.database(collectionId);
    if (readDatabaseSpace(db)?.spaceId !== context.spaceId) throw new ActionError('actions.forbidden', '同步操作与当前库的空间归属不符');
    const result = run(db, context);
    context.authorize();
    return result;
  };
  const adapter = (collectionId: string, create: (db: ReplicaDatabase, context: ReturnType<typeof pluginSyncAuthority>) => SyncReplicaAdapter): SyncReplicaAdapter => {
    const call = <T>(run: (adapter: SyncReplicaAdapter) => T, write = false): T => use(collectionId, (db, context) => run(create(db, context)), write);
    return {
      authorizeKey:(key,value)=>call(a=>{if(!a.authorizeKey)throw new ActionError('actions.forbidden','同步主人尚未声明标识授权');a.authorizeKey(key,value);}),
      next: options => call(a => a.next(options)), acknowledge: (key, operation, revision) => call(a => a.acknowledge(key, operation, revision)),
      receive: (event, options) => call(a => a.receive(event, options), true), cursor: () => call(a => a.cursor()), counts: () => call(a => a.counts()),
      conflicts: () => call(a => a.conflicts()), resolve: (key, choice, revision, state) => call(a => a.resolve(key, choice, revision, state), true),
      retryWaiting: () => call(a => a.retryWaiting!(), true), hasProjectChanges: project => call(a => a.hasProjectChanges!(project)),
      inspectConflict: key => call(a => a.inspectConflict!(key)), recoveries: () => call(a => a.recoveries!()),
      inspectRecovery: id => call(a => a.inspectRecovery!(id)), restoreRecovery: (id, choice, revision) => call(a => a.restoreRecovery!(id, choice, revision), true),
    };
  };
  const businessReader = (authorize: () => void) => {
    const business = port.businessDatabase(authorize);
    return Object.freeze({prepare(sql: string) { const statement = business.prepare(sql); return Object.freeze({get: statement.get, all: statement.all}); }});
  };
  const dependencies = (definitions: readonly SyncAggregateDefinition[], authorize: () => void): readonly SyncAggregateDefinition[] => definitions.map<SyncAggregateDefinition>(definition => ({...definition,
    ...(definition.dependencies ? {dependencies: (value, context, projectId) => definition.dependencies!(value, context, projectId, businessReader(authorize))} : {}),
  }));
  const aggregate = (collectionId: string, definitions: readonly SyncAggregateDefinition[]) => adapter(collectionId, (db, context) => createAggregateReplica(db, dependencies(definitions, context.authorize), context));
  return createPluginSyncService({ ...port, aggregate, sections(collectionId, definition) { return createPluginSectionsBinding(port, collectionId, definition, adapter); }, collection(collectionId, definition) {
    return adapter(collectionId, (db, context) => {
      const owner = definition.create(port.businessDatabase(context.authorize), { ...context, actorId: port.actorId() });
      return createSqliteReplica(db, { ...owner, authorize: context.authorize, conflictState: context.conflictState });
    });
  }, collectionCopy(collectionId, definition, direction) {
    const strategy = definition.copy;
    if (!strategy) throw new ActionError('actions.input_invalid', '此集合没有声明本机复制内容');
    const call = <T>(run: (owner: ReturnType<typeof createCollectionCopy>) => T, write = false): T => use(collectionId, (db, context) => {
      const owner = definition.create(port.businessDatabase(context.authorize), {...context, actorId: port.actorId()});
      return run(createCollectionCopy(db, businessReader(context.authorize), owner, strategy, {...context, direction}));
    }, write);
    return {kinds: [strategy.kind], read: reference => call(owner => owner.read(reference)), snapshot: project => call(owner => owner.snapshot(project)),
      references: asset => call(owner => owner.references(asset)), fork: (asset, identity) => call(owner => owner.fork(asset, identity)), apply: asset => call(owner => owner.apply(asset), true)};
  }, copy(collectionId, definitions, direction) {
    const call = <T>(run: (owner: ReturnType<typeof createAggregateCopy>) => T, write = false): T => use(collectionId, (db, context) => run(createAggregateCopy(db, dependencies(definitions, context.authorize), {...context, direction})), write);
    return {
      kinds: definitions.flatMap(definition => definition.copy ? [definition.copy.kind] : []),
      read: reference => call(owner => owner.read(reference)), snapshot: project => call(owner => owner.snapshot(project)),
      references: asset => call(owner => owner.references(asset)), fork: (asset, identity) => call(owner => owner.fork(asset, identity)),
      apply: asset => call(owner => owner.apply(asset), true),
    };
  } });
}

/** A dual-library plugin still reaches each collection through its declared library owner. */
export function combinePluginSyncLibraries(manifest: PluginManifest, home?: PluginSyncClient, project?: PluginSyncClient): PluginSyncClient | undefined {
  if (!home && !project) return undefined;
  const select = (id: string) => {
    const collection = manifest.sync?.collections.find(row => row.id === id);
    const scope = collection?.database ?? (manifest.databases?.home && !manifest.databases?.project ? 'home' : manifest.databases?.project && !manifest.databases?.home ? 'project' : undefined);
    const client = scope === 'home' ? home : scope === 'project' ? project : undefined;
    if (!collection || !client) throw new ActionError('actions.forbidden', '当前实例没有这个同步集合所属的库');
    return client;
  };
  return Object.freeze({
    sections: (id, definition) => select(id).sections(id, definition),
    collection: (id, definition) => select(id).collection(id, definition),
    collectionCopy: (id, definition, direction) => select(id).collectionCopy(id, definition, direction),
    aggregate: (id, definitions) => select(id).aggregate(id, definitions),
    copy: (id, definitions, direction) => select(id).copy(id, definitions, direction),
    retain: (id, transaction, key, value) => select(id).retain(id, transaction, key, value),
  } satisfies PluginSyncClient);
}
