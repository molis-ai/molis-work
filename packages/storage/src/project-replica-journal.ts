import { replicaError } from './project-replica-errors.js';
import type { ProjectReplicaDefinition, ProjectReplicaRow } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type { ReplicaDatabase } from './replica.js';
import { mapReplicaSequences } from './replica-sequences.js';

const eventColumns = ['event_id', 'project_id', 'actor_id', 'type', 'object_type', 'object_id', 'reason', 'payload_json', 'at'];
const receiptColumns = ['project_id', 'actor_id', 'operation', 'idempotency_key', 'request_hash', 'outcome_json', 'created_at'];

/** Storage owns Journal and receipts. The business owners supply exact families and operations. */
export function createProjectReplicaJournal(db: ReplicaDatabase, projectId: string, definitions: readonly ProjectReplicaDefinition[]) {
  const types = definitions.flatMap(d => d.journalTypes), operations = definitions.flatMap(d => d.receiptOperations);
  const fields = [...new Set(definitions.flatMap(d => d.sequenceFields))];
  const condition = types.map(() => 'type LIKE ?').join(' OR ');
  const receiptCondition = `operation IN (${operations.map(() => '?').join(',')})`;
  const source = (): ProjectReplicaRow[] => db.prepare(`SELECT seq,${eventColumns.join(',')} FROM events WHERE project_id=? AND (${condition}) ORDER BY seq`).all(projectId, ...types);
  const read = () => {
    const events = source();
    const encode = (value: unknown): string => {
      if (!Number.isSafeInteger(value) || Number(value) < 0) throw replicaError('replica_sequence_invalid');
      const anchor = [...events].reverse().find(row => Number(row.seq) <= Number(value));
      return anchor ? `@event:${anchor.event_id}` : '@start';
    };
    const rows = events.map(({ seq: _seq, ...row }) => row);
    const receipts = db.prepare(`SELECT ${receiptColumns.join(',')} FROM idempotency_records WHERE project_id=? AND ${receiptCondition} ORDER BY actor_id,operation,idempotency_key`).all(projectId, ...operations);
    return { value: mapReplicaSequences({ events: rows, receipts }, fields, encode), encode };
  };
  const validate = (value: unknown): { events: ProjectReplicaRow[]; receipts: ProjectReplicaRow[] } => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2) invalid();
    const wire = value as Record<string, unknown>;
    const events = parseList(wire.events, eventColumns, projectId), receipts = parseList(wire.receipts, receiptColumns, projectId);
    const seen = new Set<string>();
    for (const row of events) {
      if (!types.some(pattern => like(String(row.type), pattern))) invalid();
      const id = String(row.event_id);
      if (seen.has(id)) invalid(); seen.add(id);
      const existing = db.prepare('SELECT project_id,type FROM events WHERE event_id=?').get(id);
      if (existing && (existing.project_id !== projectId || !types.some(pattern => like(String(existing.type), pattern)))) invalid();
    }
    const receiptsSeen = new Set<string>();
    for (const row of receipts) {
      if (!operations.includes(String(row.operation))) invalid();
      const key = JSON.stringify([row.actor_id, row.operation, row.idempotency_key]);
      if (receiptsSeen.has(key)) invalid(); receiptsSeen.add(key);
    }
    return { events, receipts };
  };
  return {
    read, validate,
    installJournal(mark: (expression: string) => string) {
      const name = 'project_goal_journal_sync';
      if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?").get(name)) return;
      const filter = types.map(pattern => `NEW.type LIKE '${pattern.replaceAll("'", "''")}'`).join(' OR ');
      db.exec(`CREATE TRIGGER ${name} AFTER INSERT ON events WHEN NEW.type<>'board.created' AND (${filter}) BEGIN ${mark("json_array(NEW.project_id,'project_goals',NEW.project_id)")} END`);
    },
    apply(value: unknown) {
      const { events, receipts } = validate(value);
      db.prepare(`DELETE FROM events WHERE project_id=? AND (${condition})`).run(projectId, ...types);
      db.prepare(`DELETE FROM idempotency_records WHERE project_id=? AND ${receiptCondition}`).run(projectId, ...operations);
      const ids = new Map<string, number>();
      // Fresh target sequences preserve source order even when old copies had interleaved local histories.
      for (const row of events) {
        db.prepare(`INSERT INTO events (${eventColumns.join(',')}) VALUES (${eventColumns.map(() => '?').join(',')})`).run(...eventColumns.map(c => row[c]));
        ids.set(String(row.event_id), Number(db.prepare('SELECT seq FROM events WHERE event_id=?').get(row.event_id).seq));
      }
      const decode = (value: unknown): number => {
        if (value === '@start') return 0;
        if (typeof value !== 'string' || !value.startsWith('@event:') || !ids.has(value.slice(7))) throw replicaError('replica_sequence_missing');
        return ids.get(value.slice(7))!;
      };
      for (const row of events) {
        const decoded = mapReplicaSequences(row, fields, decode) as ProjectReplicaRow;
        db.prepare('UPDATE events SET payload_json=? WHERE event_id=?').run(decoded.payload_json, row.event_id);
      }
      for (const row of receipts) {
        const decoded = mapReplicaSequences(row, fields, decode) as ProjectReplicaRow;
        db.prepare(`INSERT INTO idempotency_records (${receiptColumns.join(',')}) VALUES (${receiptColumns.map(() => '?').join(',')})`).run(...receiptColumns.map(c => decoded[c]));
      }
      return decode;
    },
  };
}

function parseList(value: unknown, columns: readonly string[], projectId: string): ProjectReplicaRow[] {
  if (!Array.isArray(value) || value.length > 10000) invalid();
  return value.map(input => {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== columns.length || columns.some(c => !Object.hasOwn(input, c))) invalid();
    const row = input as ProjectReplicaRow;
    if (row.project_id !== projectId || Object.values(row).some(v => typeof v !== 'string') || columns.some(c => c !== 'reason' && !row[c])) invalid();
    for (const column of columns.filter(c => c.endsWith('_json'))) JSON.parse(String(row[column]));
    return { ...row };
  });
}
function like(value: string, pattern: string): boolean { return new RegExp('^' + pattern.replaceAll('.', '\\.').replaceAll('%', '.*') + '$').test(value); }
function invalid(): never { throw replicaError('replica_journal_invalid'); }
