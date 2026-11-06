import { checkedSyncSections, validateSyncSections } from "./sync-sections-validation.js";
import { isDeepStrictEqual } from 'node:util';
import { syncAggregateDeclaration } from '@molis-ai/molis-work-plugin-sdk';
import { validateSyncTracking } from './sync-tracking-validation.js';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { PluginSyncClient, SyncAggregateDefinition } from '@molis-ai/molis-work-contracts/platform/plugin-sync';

/** Supplied by the verified library owner, never by a plugin. The owner installs journals as part of the current baseline. */
export interface PluginSyncServicePort extends PluginSyncClient {
  readonly manifest: PluginManifest;
  readonly tables: ReadonlyMap<string, ReadonlySet<string>>;
  assertActive(): void;
}
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/u;
function denied(): never { throw new ActionError('actions.input_invalid', '同步声明超出当前插件的数据归属'); }

/** The same admission for built-in and independently installed Runtime plugins. No SQL string or connection crosses this boundary. */
export function createPluginSyncService(port: PluginSyncServicePort): PluginSyncClient {
  const prepare = (collectionId: string, definitions: readonly SyncAggregateDefinition[]): readonly SyncAggregateDefinition[] => {
    port.assertActive();
    if (!port.manifest.sync?.collections.some(row => row.id === collectionId) || !Array.isArray(definitions) || !definitions.length) denied();
    const declared = port.manifest.sync!.collections.find(row => row.id === collectionId)!;
    if (!isDeepStrictEqual(declared.aggregates, syncAggregateDeclaration(definitions))) denied();
    const result = validateSyncAggregates(definitions, port.tables);
    port.assertActive();
    return result;
  };
  const prepareCollection = (collectionId: string, definition: import('@molis-ai/molis-work-contracts/platform/plugin-sync').PluginSyncCollectionDefinition) => {
    port.assertActive();
    const declared = port.manifest.sync?.collections.find(row => row.id === collectionId);
    if (!declared || !definition || typeof definition.create !== 'function' || !isDeepStrictEqual(declared.tracking, definition.tracking)) denied();
    if (definition.copy && (!definition.copy.kind.startsWith(port.manifest.plugin_id + ':') || ['keys','key','validate','references','fork','equivalent'].some(method => typeof Reflect.get(definition.copy!,method) !== 'function'))) denied();
    return Object.freeze({...definition, tracking:validateSyncTracking(definition.tracking,port.tables), ...(definition.copy ? {copy:Object.freeze({...definition.copy})} : {})});
  };
  return {
    sections(collectionId, definition) {
      port.assertActive();
      const checked=checkedSyncSections(port.manifest,collectionId,definition,port.tables);
      port.assertActive();
      return port.sections(collectionId,checked);
    },
    collectionCopy(collectionId, definition, direction) {
      if (direction !== 'source' && direction !== 'target') denied();
      return port.collectionCopy(collectionId, prepareCollection(collectionId, definition), direction);
    },
    collection(collectionId, definition) {
      return port.collection(collectionId, prepareCollection(collectionId, definition));
    },
    retain(collectionId, transaction, key, value) {
      port.assertActive();
      if (!port.manifest.sync?.collections.some(row => row.id === collectionId) || typeof key !== 'string' || !key || key.length > 4096) denied();
      port.retain(collectionId, transaction, key, value);
      port.assertActive();
    },
    aggregate(collection, definitions) { return port.aggregate(collection, prepare(collection, definitions)); },
    copy(collection, definitions, direction) {
      if (direction !== 'source' && direction !== 'target') denied();
      return port.copy(collection, prepare(collection, definitions), direction);
    },
  };
}

/** Validate the complete declared baseline before a physical library is opened. */
export function assertPluginSyncDeclarations(manifest: PluginManifest, tables: ReadonlyMap<string, ReadonlySet<string>>): void {
  for (const collection of manifest.sync?.collections ?? []) {
    if (collection.tracking) validateSyncTracking(collection.tracking, tables);
    if (collection.aggregates) validateSyncAggregates(collection.aggregates.map(row => ({...row, validate() {}})), tables);
    if (collection.sections) validateSyncSections(manifest, collection.sections, tables);
    if (collection.aggregates && (collection.tracking || collection.sections)) denied();
  }
}

function validateSyncAggregates(definitions: readonly SyncAggregateDefinition[], tables: ReadonlyMap<string, ReadonlySet<string>>): readonly SyncAggregateDefinition[] {
    const kinds = new Set<string>();
    const columns = (table: string, names: readonly string[]) => {
      if (!identifier.test(table) || !tables.has(table)) denied();
      const allowed = tables.get(table)!;
      if (!Array.isArray(names) || names.some(name => !identifier.test(name) || !allowed.has(name))) denied();
    };
    const result = definitions.map(definition => {
      if (!definition || !identifier.test(definition.kind) || kinds.has(definition.kind) || typeof definition.validate !== 'function' || !Array.isArray(definition.children)) denied();
      kinds.add(definition.kind);
      columns(definition.table, ['id', 'project_id', ...definition.columns, ...[definition.versionColumn, definition.timestampVersionColumn, definition.busyColumn].filter((value): value is string => value !== undefined)]);
      const children = definition.children.map(child => {
        columns(child.table, [child.parent, ...child.columns, ...child.identityColumns ?? []]);
        for (const item of child.orderBy.split(',')) {
          const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s+(?:ASC|DESC))?\s*$/iu.exec(item);
          if (!match) denied();
          if (match[1] !== 'rowid') columns(child.table, [match[1]!]);
        }
        return Object.freeze({...child, columns: Object.freeze([...child.columns]), ...(child.identityColumns ? {identityColumns: Object.freeze([...child.identityColumns])} : {})});
      });
      return Object.freeze({...definition, columns: Object.freeze([...definition.columns]), children: Object.freeze(children), ...(definition.copy ? {copy: Object.freeze({...definition.copy})} : {})});
    });
    return Object.freeze(result);
}
