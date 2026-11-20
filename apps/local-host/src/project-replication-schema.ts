import { artifactReplicationJournalSql, processItemReplicationJournalSql } from '@molis-ai/molis-work-module-artifacts';
import { privateValueReplicationJournalSql } from '@molis-ai/molis-work-plugin-runtime';
import { builtinSyncBindings } from './builtin-sync.js';
import { replicaSchemaSql, replicaMarkSql, replicaMarkRowsSql } from '@molis-ai/molis-work-storage';

const journal = (namespace: string) => replicaSchemaSql(namespace)
  + `\nINSERT INTO ${namespace}_replica_state(id,device) VALUES(1,lower(hex(randomblob(16))));`;
const mark = (namespace: string) => (key: string) => replicaMarkSql(key).replace(/\breplica_/gu, namespace + '_replica_');

const PROCESS_ITEMS_TRIGGERS_SQL = processItemReplicationJournalSql(mark('process_items'));

const studio = () => builtinSyncBindings().flatMap(({binding}) => binding.scope === 'project-private-values'
  ? [journal(binding.namespace), privateValueReplicationJournalSql(binding.owner({}), sql => replicaMarkRowsSql(sql, binding.namespace))] : []);

/** Platform owners and the explicitly approved Studio exception form the current project baseline, before any mutation. */
export const PROJECT_REPLICATION_SCHEMA_SQL = [
  journal('artifacts'), journal('process_items'),
  artifactReplicationJournalSql(mark('artifacts')),
  PROCESS_ITEMS_TRIGGERS_SQL,
  // Studio remains the approved build-time owner (user 2026-10-21/23; BL-377), with its journal in the same complete baseline.
  ...studio(),
].join('\n');
