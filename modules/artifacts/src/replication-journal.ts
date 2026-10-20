import { ARTIFACT_TABLES, PROCESS_ITEM_TABLES, type ArtifactsSqliteDatabase, type VersionStoreTables } from './repository.js';

/** Technical journal operations are injected; the owner chooses its business tables and stable key. */
export function installArtifactReplicationJournal(db: ArtifactsSqliteDatabase, mark: (keyExpression: string) => string, seed: (projectId: string, artifactId: string) => void): void {
  installVersionJournal(db, ARTIFACT_TABLES, 'artifacts', 'artifact', mark, seed);
}
export function installProcessItemReplicationJournal(db: ArtifactsSqliteDatabase, mark: (keyExpression: string) => string, seed: (projectId: string, artifactId: string) => void): void {
  installVersionJournal(db, PROCESS_ITEM_TABLES, 'process_items', 'process_item', mark, seed);
}
function installVersionJournal(db: ArtifactsSqliteDatabase, tables: VersionStoreTables, namespace: string, kind: string,
  mark: (keyExpression: string) => string, seed: (projectId: string, artifactId: string) => void): void {
  db.transaction(() => {
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?").get(namespace + '_sync_identity_insert')) return;
    for (const row of db.prepare('SELECT project_id,artifact_id FROM ' + tables.identities + ' ORDER BY artifact_id').all() as { project_id: string; artifact_id: string }[]) seed(row.project_id, row.artifact_id);
    for (const [table, label] of [[tables.identities, 'identity'], [tables.versions, 'version']]) {
      for (const operation of ['INSERT', 'UPDATE', 'DELETE']) {
        const row = operation === 'DELETE' ? 'OLD' : 'NEW';
        const project = table === tables.identities ? row + '.project_id' : '(SELECT project_id FROM ' + tables.identities + ' WHERE artifact_id=' + row + '.artifact_id)';
        // Cascading parent deletion is represented by the identity tombstone, not a child with a missing project.
        const when = table === tables.identities ? '' : ' WHEN ' + project + ' IS NOT NULL';
        db.exec('CREATE TRIGGER ' + namespace + '_sync_' + label + '_' + operation.toLowerCase()
          + ' AFTER ' + operation + ' ON ' + table + when + ' BEGIN ' + mark("json_array(" + project + ",'" + kind + "'," + row + '.artifact_id)') + ' END;');
      }
    }
  }).immediate();
}
