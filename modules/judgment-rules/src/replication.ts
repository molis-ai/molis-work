import { isDeepStrictEqual } from 'node:util';
import type { DatabaseSync } from 'node:sqlite';
import { FUNCTIONS_DEFAULT_MODEL, type JudgmentRuleActionMap, type JudgmentRuleCriteria } from '@molis-ai/molis-work-contracts/modules/functions';
import { personalConfigRecord, personalConfigJournal, personalConfigReplica } from '@molis-ai/molis-work-storage';
import { assertFunctionKey, functionsErrors, isPinnedJevModel } from './keys.js';
import { FIRST_PUBLISHED_RULE_REVISION, assertPrimitive, assertSceneReference, normalizeActionMap, normalizeCriteria, normalizeDraftInstructions, normalizeName, normalizeSceneId, normalizeSceneMap, normalizeSubjectKinds } from './record-rules.js';
import { buildRecord, insert } from './record-rows.js';

const namespace = 'personal_judgment_rules';
export const judgmentConfigJournal = personalConfigJournal(namespace, 'functions', row => `${row}.id`, row => `${row}.id NOT LIKE 'declared:%'`);
const invalid = () => functionsErrors.invalid('判断规则的同步定义无效');
const fields = ['name', 'function_key', 'primitive', 'status', 'version', 'model', 'instructions', 'criteria', 'scene_id', 'scene_version',
  'scene_provider_id', 'subject_kinds', 'scene_map', 'action_map', 'created_at', 'published_at'] as const;
const validId = (value: string) => /^[A-Za-z0-9_.-]{1,160}$/u.test(value);
const date = (value: unknown): value is string => typeof value === 'string' && value.length <= 32 && Number.isFinite(Date.parse(value));

function parseJsonField(value: unknown): unknown {
  try { return JSON.parse(String(value)); } catch { throw invalid(); }
}

function rowToDefinition(row: Record<string, unknown>) {
  const { criteria_json, subject_kinds_json, scene_map_json, action_map_json, ...values } = row;
  return definition({ ...values, criteria: parseJsonField(criteria_json), subject_kinds: parseJsonField(subject_kinds_json),
    scene_map: parseJsonField(scene_map_json), action_map: parseJsonField(action_map_json) });
}

function definition(input: unknown) {
  const row = personalConfigRecord(input, fields);
  if (typeof row.name !== 'string' || typeof row.function_key !== 'string' || typeof row.primitive !== 'string'
    || (row.status !== 'draft' && row.status !== 'published') || typeof row.model !== 'string' || typeof row.instructions !== 'string'
    || !(row.scene_id === null || typeof row.scene_id === 'string') || !(row.scene_provider_id === null || typeof row.scene_provider_id === 'string')
    || !(row.scene_version === null || Number.isSafeInteger(row.scene_version) && Number(row.scene_version) > 0)
    || !date(row.created_at) || !(row.published_at === null || date(row.published_at))) throw invalid();
  const published = row.status === 'published';
  const validVersion = published ? row.version === FIRST_PUBLISHED_RULE_REVISION : row.version === null;
  const validModel = row.model === FUNCTIONS_DEFAULT_MODEL || isPinnedJevModel(row.model);
  if (!validVersion || published !== (row.published_at !== null) || !validModel || (published && !row.instructions.trim())) throw invalid();
  const primitive = assertPrimitive(row.primitive);
  const sceneId = normalizeSceneId(row.scene_id, primitive);
  const criteria = normalizeCriteria(primitive, row.criteria as JudgmentRuleCriteria, published);
  const subjectKinds = normalizeSubjectKinds(row.subject_kinds);
  const sceneMap = normalizeSceneMap(row.scene_map, primitive, criteria, sceneId);
  const actionMap = normalizeActionMap(row.action_map as JudgmentRuleActionMap, sceneId, primitive, criteria);
  const sceneVersion = row.scene_version as number | null;
  assertSceneReference(sceneId, sceneVersion, row.scene_provider_id);
  const result = {
    name: normalizeName(row.name), function_key: assertFunctionKey(row.function_key), primitive,
    status: row.status, version: row.version as number | null, model: row.model, instructions: normalizeDraftInstructions(row.instructions), criteria,
    scene_id: sceneId, scene_version: sceneVersion, scene_provider_id: row.scene_provider_id, subject_kinds: subjectKinds,
    scene_map: sceneMap, action_map: actionMap, created_at: row.created_at, published_at: row.published_at,
  } as const;
  if (!isDeepStrictEqual(result, row)) throw invalid();
  return result;
}

export function judgmentConfigReplica(db: DatabaseSync, spaceId: string, authorize: () => void) {
  return personalConfigReplica(db, namespace, { spaceId, authorize }, {
    maximumBytes: 96 * 1024,
    key(id) { if (!validId(id)) throw invalid(); },
    read(id) {
      const row = db.prepare(`SELECT name,function_key,primitive,status,version,model,instructions,criteria_json,scene_id,scene_version,scene_provider_id,
        subject_kinds_json,scene_map_json,action_map_json,created_at,published_at FROM functions WHERE id=?`).get(id) as Record<string, unknown> | undefined;
      if (!row) return null;
      return rowToDefinition(row);
    },
    apply(id, data) {
      const row = db.prepare(`SELECT id,name,function_key,primitive,status,version,model,instructions,criteria_json,scene_id,scene_version,scene_provider_id,
        subject_kinds_json,scene_map_json,action_map_json,created_at,published_at,updated_at,config_hash,last_preview_json FROM functions WHERE id=?`).get(id) as Record<string, unknown> | undefined;
      if (data === null) {
        if (row?.status === 'published') throw functionsErrors.published_immutable('已发布的函数不能删除');
        db.prepare('DELETE FROM functions WHERE id=?').run(id);
        return;
      }
      const incoming = definition(data);
      if (row?.status === 'published') {
        if (incoming.status !== 'published') throw functionsErrors.published_immutable('已发布的函数不能降级为草稿');
        const { id: _id, updated_at: _u, config_hash: _c, last_preview_json: _p, ...existingColumns } = row;
        if (!isDeepStrictEqual(rowToDefinition(existingColumns), incoming)) {
          throw functionsErrors.published_immutable('已发布的函数不能再改配置');
        }
        return;
      }
      const keyOwner = db.prepare('SELECT id FROM functions WHERE function_key=? AND id<>?').get(incoming.function_key, id);
      if (keyOwner) throw functionsErrors.key_conflict('函数 key 已被占用');
      const record = buildRecord({ ...incoming, id,
        updated_at: new Date(Math.max(Date.now(), Date.parse(String(row?.updated_at ?? incoming.created_at)) + 1)).toISOString(),
        last_preview: null, samples: [], });
      if (!row) {
        insert(db, record);
        return;
      }
      db.prepare(`UPDATE functions SET name=?,function_key=?,primitive=?,status=?,version=?,model=?,instructions=?,criteria_json=?,
        scene_id=?,scene_version=?,scene_provider_id=?,subject_kinds_json=?,scene_map_json=?,action_map_json=?,
        config_hash=?,last_preview_json=?,published_at=?,created_at=?,updated_at=? WHERE id=?`).run(
          record.name, record.function_key, record.primitive, record.status, record.version, record.model, record.instructions,
          JSON.stringify(record.criteria), record.scene_id, record.scene_version ?? null, record.scene_provider_id ?? null,
          JSON.stringify(record.subject_kinds), JSON.stringify(record.scene_map), JSON.stringify(record.action_map),
          record.config_hash, record.config_hash === row.config_hash && typeof row.last_preview_json === 'string' ? row.last_preview_json : null, record.published_at,
          record.created_at, record.updated_at, id);
    },
  });
}
