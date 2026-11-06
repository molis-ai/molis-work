import { sectionsPlatformPrelude, sectionsPlatformSchema } from './plugin-sync-sections.js';
import { createHash } from 'node:crypto';
import type { PluginManifest, PluginDatabaseDeclaration } from '@molis-ai/molis-work-contracts/platform/plugin';
import { assertPluginSyncDeclarations, type PluginProjectDatabaseRecord } from '@molis-ai/molis-work-plugin-runtime';
import { describeSqliteBaseline, sqliteBaselineTriggers, assertSqliteBaselineTriggers, replicaSchemaSql, compileSyncTrackingSql, compileAggregateTrackingSql, type ReplicaDatabase } from '@molis-ai/molis-work-storage';

/** Stable across activations, isolated by verified publisher, plugin, collection and format. */
export function pluginSyncNamespace(manifest: PluginManifest, collectionId: string): string {
  const collection = manifest.sync?.collections.find(row => row.id === collectionId);
  if (!collection) throw new Error('SYNC_COLLECTION_NOT_DECLARED');
  return 'sync_' + createHash('sha256').update(JSON.stringify([manifest.plugin_id, manifest.publisher.publisher_id,
    manifest.publisher.signature, collectionId, collection.schema_version])).digest('hex').slice(0, 28);
}

/** A collection is admitted against exactly one declared physical library; two-library plugins must name it. */
export function pluginSyncLibraryManifest(manifest: PluginManifest, declaration: PluginDatabaseDeclaration): PluginManifest {
  const home = manifest.databases?.home, project = manifest.databases?.project;
  const matches = (candidate: PluginDatabaseDeclaration | undefined) => candidate?.store_name === declaration.store_name && candidate.version === declaration.version && candidate.schema === declaration.schema;
  const database = declaration === home ? 'home' : declaration === project ? 'project'
    : matches(home) && !matches(project) ? 'home' : matches(project) && !matches(home) ? 'project' : undefined;
  if (!database) throw new Error('SYNC_LIBRARY_NOT_DECLARED');
  const collections = (manifest.sync?.collections ?? []).filter(collection => {
    if (!collection.database && home && project) throw new Error('SYNC_COLLECTION_LIBRARY_REQUIRED');
    return (collection.database ?? database) === database;
  });
  return {...manifest, ...(manifest.sync ? {sync: {...manifest.sync, collections}} : {})};
}

/** Platform technical tables are part of the whole current library baseline, never created by an adapter. */
export function pluginSyncDatabaseDeclaration<T extends PluginDatabaseDeclaration>(manifest: PluginManifest, declaration: T): T {
  manifest = pluginSyncLibraryManifest(manifest, declaration);
  assertPluginSyncDeclarations(manifest, pluginSyncBusinessTables(declaration));
  const businessObjects = Object.entries(describeSqliteBaseline(declaration).tables).flatMap(([table, shape]) => [table, ...shape.indexes.map(index => index.name)]);
  businessObjects.push(...sqliteBaselineTriggers(declaration.schema).keys());
  const technical = (manifest.sync?.collections ?? []).map(collection => {
    const namespace = pluginSyncNamespace(manifest, collection.id);
    if (businessObjects.some(name => name.toLowerCase().startsWith(namespace + '_'))) throw new Error('SYNC_TECHNICAL_NAME_RESERVED');
    return replicaSchemaSql(namespace) + `
CREATE TABLE ${namespace}_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE ${namespace}_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
INSERT INTO ${namespace}_context(id,project_id) VALUES(1,NULL);
INSERT INTO ${namespace}_replica_state(id,device) VALUES(1,lower(hex(randomblob(16))));` + '\n' + compileSyncTrackingSql(collection.tracking ?? [], namespace) + '\n' + compileAggregateTrackingSql(collection.aggregates ?? [], namespace) + '\n' + sectionsPlatformSchema(manifest, collection.id, namespace);
  }).join('\n');
  return technical ? { ...declaration, schema: declaration.schema + '\n' + technical } : declaration;
}

const shapes = new Map<string, ReturnType<typeof describeSqliteBaseline>>();
export function pluginSyncBusinessTables(declaration: PluginDatabaseDeclaration): ReadonlyMap<string, ReadonlySet<string>> {
  const cacheKey = createHash('sha256').update(declaration.schema).digest('hex');
  let shape = shapes.get(cacheKey);
  if (!shape) { shape = describeSqliteBaseline(declaration); shapes.set(cacheKey, shape); }
  return new Map(Object.entries(shape.tables).filter(([name]) => name !== 'molis_storage_space' && !name.includes('replica_') && name !== 'aggregate_editor_versions')
    .map(([name, table]) => [name, new Set(table.columns.map(column => column.name))]));
}

/** Normal plugin SQL never receives the technical tables, including through a guessed name. */
export function pluginSyncBusinessRecord(manifest: PluginManifest, declaration: PluginDatabaseDeclaration): PluginProjectDatabaseRecord {
  return { plugin_id: manifest.plugin_id, publisher_signature: manifest.publisher.signature, store_name: declaration.store_name,
    version: declaration.version, created_at: '', objects: [...pluginSyncBusinessTables(declaration).keys()] };
}

export function pluginSyncDatabase(db: ReplicaDatabase, namespace: string): ReplicaDatabase {
  const sql = (value: string) => value.replace(/\breplica_/gu, namespace + '_replica_')
    .replace(/\baggregate_editor_versions\b/gu, namespace + '_aggregate_editor_versions');
  return { exec: text => db.exec(sql(text)), prepare: text => db.prepare(sql(text)) };
}

/** Compare compiled triggers to the actual baseline before registering their narrowly scoped SQL effects. */
export function pluginSyncTriggers(db: ReplicaDatabase, declaration: PluginDatabaseDeclaration, manifest: PluginManifest, businessSchema: string): ReadonlyMap<string, string> {
  const business = sqliteBaselineTriggers(businessSchema);
  const triggers = new Map([...sqliteBaselineTriggers(declaration.schema, sectionsPlatformPrelude(manifest))].filter(([name]) => !business.has(name)));
  assertSqliteBaselineTriggers(db, triggers);
  return triggers;
}

/** The project belongs to the open library, never to a plugin argument or incoming envelope. */
export function bindPluginSyncProject(db: ReplicaDatabase, manifest: PluginManifest, projectId?: string): void {
  for (const collection of manifest.sync?.collections ?? []) {
    const namespace = pluginSyncNamespace(manifest, collection.id);
    const row = db.prepare(`SELECT project_id FROM ${namespace}_context WHERE id=1`).get();
    if (!row) throw new Error('SYNC_LIBRARY_CONTEXT_MISSING');
    if (row.project_id !== null && row.project_id !== (projectId ?? null)) throw new Error('SYNC_LIBRARY_PROJECT_MISMATCH');
    if (projectId && row.project_id === null) db.prepare(`UPDATE ${namespace}_context SET project_id=? WHERE id=1 AND project_id IS NULL`).run(projectId);
    if (!db.prepare(`SELECT device FROM ${namespace}_replica_state WHERE id=1`).get()) throw new Error('SYNC_LIBRARY_STATE_MISSING');
  }
}
