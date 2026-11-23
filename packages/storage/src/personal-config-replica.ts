import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import { createSyncConflictState, isRecord } from '@molis-ai/molis-work-plugin-sdk';
import { createSqliteReplica, namespacedReplicaDatabase, replicaMarkRowsSql, replicaMarkSql, replicaSchemaSql, type ReplicaDatabase } from './replica.js';

const invalid = () => new ActionError('actions.input_invalid', '个人配置的同步内容无效，原内容已保留');
const secretName = /(?:^|[_ .-])(?:password|passwd|secrets?|tokens?|credentials?|api[_ -]?keys?|private[_ -]?keys?|authorization|keychain)(?:$|[_ .-])/iu;
const secretValue = /-----BEGIN [^-\r\n]*PRIVATE KEY-----|\b(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|(?:gh[pousr]_|github_pat_|sk-(?:proj-)?)[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{35}|AKIA[A-Z0-9]{16}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b|\b(?:password|passwd|secret|token|credentials?|api[_ -]?key|private[_ -]?key)["']?\s*[:=]\s*["']?[^\s"',;}]{4,}/iu;
const physicalPath = /(?:^|[\s="'`([,:])(?:file:\/\/|~[\\/]|[a-z]:[\\/]|\\\\|\/(?!\/)[^\s/]+(?:\/[^\s]*|(?=$|[\s"'`,)])))/iu;

/** The owner checks the DTO's meaning. This common guard also rejects unsafe text in otherwise valid fields. */
export function assertPortableConfig(value: unknown, maximumBytes: number): void {
  let nodes = 0;
  const inspect = (item: unknown, depth: number): void => {
    if (++nodes > 20_000 || depth > 24) throw invalid();
    if (typeof item === 'string') {
      if (Buffer.byteLength(item) > maximumBytes || physicalPath.test(item) || secretValue.test(item)) throw invalid();
      return;
    }
    if (item === null || typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item)) return;
    if (Array.isArray(item)) {
      for (const element of item) inspect(element, depth + 1);
      return;
    }
    if (!isRecord(item)) throw invalid();
    for (const [key, nested] of Object.entries(item)) {
      const normalized = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z])([A-Z][a-z])/g, '$1_$2');
      if (secretName.test(normalized)) throw invalid();
      inspect(key, depth + 1);
      inspect(nested, depth + 1);
    }
  };
  inspect(value, 0);
  if (Buffer.byteLength(JSON.stringify(value)) > maximumBytes) throw new ActionError('actions.input_invalid', '个人配置超过同步体积上限，原内容已保留');
}

export function personalConfigRecord(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!isRecord(value) || Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field))) throw invalid();
  return value;
}

/** Static SQL supplied by the same owner that declares the business table. The seed runs only in the explicit upgrade. */
export function personalConfigJournal(namespace: string, table: string, key: (row: string) => string, eligible: (row: string) => string = () => '1=1') {
  const seed = replicaMarkRowsSql(`SELECT DISTINCT ${key('saved')} AS key FROM ${table} AS saved WHERE ${eligible('saved')}`, namespace);
  const schema = replicaSchemaSql(namespace) + `\nINSERT INTO ${namespace}_replica_state(id,device) VALUES(1,lower(hex(randomblob(16))));\n`
    + (['INSERT', 'UPDATE', 'DELETE'] as const).map(change => {
      const row = change === 'DELETE' ? 'OLD' : 'NEW';
      return `CREATE TRIGGER ${namespace}_${change.toLowerCase()} AFTER ${change} ON ${table} BEGIN ${replicaMarkSql(key(row), eligible(row), namespace)} END;`;
    }).join('\n');
  return { schema, upgrade: schema + '\n' + seed };
}

export function personalConfigReplica(db: ReplicaDatabase, namespace: string, context: { spaceId: string; authorize(): void }, owner: {
  maximumBytes: number;
  key(key: string): void;
  read(key: string): unknown | null;
  apply(key: string, data: unknown | null): void;
  belongsToProject?(key: string, project: string): boolean;
}) {
  const unseal = (value: unknown) => {
    if (value === null) return null;
    assertPortableConfig(value, owner.maximumBytes);
    const row = personalConfigRecord(value, ['space_id', 'data']);
    if (row.space_id !== context.spaceId || row.data === null) throw new ActionError('actions.forbidden', '个人配置不属于当前空间');
    return row.data;
  };
  return createSqliteReplica(namespacedReplicaDatabase(db, namespace), {
    authorize: context.authorize, conflictState: createSyncConflictState,
    authorizeKey(key, value) {
      owner.key(key);
      if (value !== undefined) unseal(value);
    },
    belongsToProject: owner.belongsToProject ?? (() => false),
    read(key) {
      const data = owner.read(key);
      const value = data === null ? null : { space_id: context.spaceId, data };
      unseal(value);
      return value;
    },
    apply(key, value) { owner.apply(key, unseal(value)); },
  });
}
