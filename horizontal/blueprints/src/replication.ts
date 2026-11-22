import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import { inspectBlueprint } from '@molis-ai/molis-work-plugin-sdk';
import { personalConfigRecord, personalConfigJournal, personalConfigReplica, type ReplicaDatabase } from '@molis-ai/molis-work-storage';
import type { Blueprint } from '@molis-ai/molis-work-contracts/platform/blueprints';

const namespace = 'personal_blueprints';
export const blueprintConfigJournal = personalConfigJournal(namespace, 'blueprint_drafts', row => `${row}.draft_id`, row => `${row}.project_id IS NULL`);
const invalid = () => new ActionError('actions.input_invalid', '个人蓝图的同步内容无效');
const validId = (id: string) => /^[a-zA-Z0-9_.-]{1,200}$/u.test(id);

function portable(value: unknown) {
  const draft = personalConfigRecord(value, ['locale', 'blueprint']);
  if (typeof draft.locale !== 'string' || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(draft.locale)
    || !draft.blueprint || typeof draft.blueprint !== 'object' || inspectBlueprint(draft.blueprint as Blueprint, { source: 'draft' }).length) throw invalid();
  return { locale: draft.locale, blueprint: draft.blueprint };
}

export function blueprintConfigReplica(db: ReplicaDatabase, actor: string, spaceId: string, authorize: () => void) {
  return personalConfigReplica(db, namespace, { spaceId, authorize }, {
    maximumBytes: 256 * 1024,
    key(id) { if (!validId(id)) throw invalid(); },
    read(id) {
      const row = db.prepare('SELECT locale,blueprint_json FROM blueprint_drafts WHERE draft_id=? AND actor_id=? AND project_id IS NULL').get(id, actor);
      return row ? portable({ locale: row.locale, blueprint: JSON.parse(String(row.blueprint_json)) }) : null;
    },
    apply(id, data) {
      const existing = db.prepare('SELECT actor_id,project_id,revision FROM blueprint_drafts WHERE draft_id=?').get(id);
      if (existing && (existing.actor_id !== actor || existing.project_id !== null)) throw new ActionError('actions.forbidden', '蓝图属于另一范围');
      if (data === null) {
        db.prepare('DELETE FROM blueprint_drafts WHERE draft_id=? AND actor_id=? AND project_id IS NULL').run(id, actor);
        return;
      }
      const draft = portable(data);
      const revision = Number(existing?.revision ?? 0) + 1;
      if (!Number.isSafeInteger(revision)) throw invalid();
      db.prepare(`INSERT INTO blueprint_drafts(draft_id,actor_id,project_id,revision,locale,blueprint_json) VALUES(?,?,NULL,?,?,?)
        ON CONFLICT(draft_id) DO UPDATE SET revision=excluded.revision,locale=excluded.locale,blueprint_json=excluded.blueprint_json`)
        .run(id, actor, revision, draft.locale, JSON.stringify(draft.blueprint));
    },
  });
}
