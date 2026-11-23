import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import { PRESENTATION_FORM_KINDS, PRESENTATION_LIMITS, SURFACE_SLOT_KINDS } from '@molis-ai/molis-work-contracts/platform/presentation';
import type { ReplicaDatabase } from '@molis-ai/molis-work-contracts/platform/plugin-registration';
import { isRecord } from '@molis-ai/molis-work-plugin-sdk';
import type { SQLInputValue } from 'node:sqlite';

export const SURFACE_CONFIG_JOURNAL = 'surface_corrections';
export function surfaceConfigJournal(project: { id: string; exists: string }) {
  return { table: 'surface_corrections', key: () => `json_array(${project.id},'${SURFACE_CONFIG_JOURNAL}',${project.id})`,
    eligible: () => project.exists };
}

const fields = ['slot_key', 'subject_kind', 'subject_id', 'correction', 'form', 'position', 'revision', 'recorded_at'] as const;
const columns = fields.join(',');
const invalid = () => new ActionError('actions.input_invalid', '呈现组合的同步内容无效');
const identifier = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 200;

function correction(input: unknown) {
  if (!isRecord(input) || Object.keys(input).length !== fields.length || fields.some(field => !Object.hasOwn(input, field))) throw invalid();
  const row = input;
  const slot: unknown = typeof row.slot_key === 'string' ? JSON.parse(row.slot_key) : null;
  if (!Array.isArray(slot) || slot.length !== 3 || !(SURFACE_SLOT_KINDS as readonly unknown[]).includes(slot[0])
    || (slot[0] === 'plugin-slot' ? !identifier(slot[1]) || !identifier(slot[2]) : slot[1] !== null || slot[2] !== null)
    || JSON.stringify(slot) !== row.slot_key || !Number.isSafeInteger(row.revision) || Number(row.revision) < 1
    || typeof row.recorded_at !== 'string' || !Number.isFinite(Date.parse(row.recorded_at))) throw invalid();
  const hasSubject = identifier(row.subject_kind) && identifier(row.subject_id);
  if (!hasSubject && (row.subject_kind !== '' || row.subject_id !== '')) throw invalid();
  if (row.correction === 'form' && (PRESENTATION_FORM_KINDS as readonly unknown[]).includes(row.form) && row.position === null) return row;
  if (row.correction === 'pin' && hasSubject && row.form === null && Number.isInteger(row.position)
    && Number(row.position) >= 0 && Number(row.position) < PRESENTATION_LIMITS.values_subjects) return row;
  if ((row.correction === 'reset' || row.correction === 'remove' && hasSubject) && row.form === null && row.position === null) return row;
  throw invalid();
}

export function surfaceConfigOwner(db: ReplicaDatabase, projectId: string, actor: string) {
  const expected = JSON.stringify([projectId, SURFACE_CONFIG_JOURNAL, projectId]);
  return {
    maximumBytes: 256 * 1024,
    key(key: string) { if (key !== expected) throw invalid(); },
    belongsToProject: (key: string, project: string) => key === expected && project === projectId,
    read() {
      const rows = db.prepare(`SELECT ${columns} FROM surface_corrections WHERE actor_id=? ORDER BY slot_key,revision`).all(actor);
      return rows.length ? rows.map(correction) : null;
    },
    apply(_key: string, data: unknown) {
      if (data !== null && (!Array.isArray(data) || data.length > 2000)) throw invalid();
      const rows = (data ?? []).map(correction);
      const revisions = new Set<string>();
      const identities = new Set<string>();
      for (const row of rows) {
        const revision = JSON.stringify([row.slot_key, row.revision]);
        const id = JSON.stringify([row.slot_key, row.subject_kind, row.subject_id, row.correction]);
        if (revisions.has(revision) || identities.has(id)) throw invalid();
        revisions.add(revision);
        identities.add(id);
      }
      const current = new Map(db.prepare('SELECT slot_key, MAX(revision) AS revision FROM surface_corrections WHERE actor_id=? GROUP BY slot_key')
        .all(actor).map(row => [row.slot_key, Number(row.revision)]));
      db.prepare('DELETE FROM surface_corrections WHERE actor_id=?').run(actor);
      const insert = db.prepare(`INSERT INTO surface_corrections (actor_id,${columns}) VALUES (?,?,?,?,?,?,?,?,?)`);
      for (const row of rows) {
        const revision = Number(row.revision) + (current.get(row.slot_key as string) ?? 0);
        if (!Number.isSafeInteger(revision)) throw invalid();
        insert.run(actor, ...fields.map(field => field === 'revision' ? revision : row[field] as SQLInputValue));
      }
    },
  };
}
