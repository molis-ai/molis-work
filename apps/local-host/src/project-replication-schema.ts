import { artifactReplicationJournalSql, processItemReplicationJournalSql } from '@molis-ai/molis-work-module-artifacts';
import { privateValueReplicationJournalSql } from '@molis-ai/molis-work-plugin-runtime';
import { builtinSyncBindings } from './builtin-sync.js';
import { replicaSchemaSql, replicaMarkSql, replicaMarkRowsSql } from '@molis-ai/molis-work-storage';

const journal = (namespace: string) => replicaSchemaSql(namespace)
  + `\nINSERT INTO ${namespace}_replica_state(id,device) VALUES(1,lower(hex(randomblob(16))));`;
const mark = (namespace: string) => (key: string) => replicaMarkSql(key).replace(/\breplica_/gu, namespace + '_replica_');

/**
 * Process items replicate through the adopted journal (specs/batch-06-shared-tools/current-version-adoption.md): a fixed, trusted
 * prefix, never one built from a remote id. The original `process_items` journal stays as it was, kept as recovery evidence; its
 * triggers keep their names and now mark the adopted journal, so a library's structure tells which of the two it is.
 */
export const ADOPTED_PROCESS_ITEMS_JOURNAL = 'process_items_adopted';
export const ADOPTED_PROCESS_ITEMS_JOURNAL_SQL = journal(ADOPTED_PROCESS_ITEMS_JOURNAL);
export const ADOPTED_PROCESS_ITEMS_TRIGGERS_SQL = processItemReplicationJournalSql(mark(ADOPTED_PROCESS_ITEMS_JOURNAL));
/** The triggers every project library had before adoption: only the explicit adoption program reads this, to recognize the exact old layout. */
export const ORIGINAL_PROCESS_ITEMS_TRIGGERS_SQL = processItemReplicationJournalSql(mark('process_items'));

const studio = () => builtinSyncBindings().flatMap(({binding}) => binding.scope === 'project-private-values'
  ? [journal(binding.namespace), privateValueReplicationJournalSql(binding.owner({}), sql => replicaMarkRowsSql(sql, binding.namespace))] : []);

/** Platform owners and the explicitly approved Studio exception form the current project baseline, before any mutation. */
export const PROJECT_REPLICATION_SCHEMA_SQL = [
  journal('artifacts'), journal('process_items'), ADOPTED_PROCESS_ITEMS_JOURNAL_SQL,
  artifactReplicationJournalSql(mark('artifacts')),
  ADOPTED_PROCESS_ITEMS_TRIGGERS_SQL,
  // Studio remains the approved build-time owner (user 2026-10-21/23; BL-377), with its journal in the same complete baseline.
  ...studio(),
].join('\n');

/** The same statements as every project library had them before adoption, for the adoption program's exact old-layout check only. */
export const ORIGINAL_PROJECT_REPLICATION_SCHEMA_SQL = [
  journal('artifacts'), journal('process_items'),
  artifactReplicationJournalSql(mark('artifacts')),
  ORIGINAL_PROCESS_ITEMS_TRIGGERS_SQL,
  ...studio(),
].join('\n');
