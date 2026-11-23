import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import { AGENT_PROMPT_MAX_CHARS, type AgentPromptView, type PromptOverridesFile } from '@molis-ai/molis-work-contracts/services/agent-definitions';
import { personalConfigRecord, personalConfigJournal, personalConfigReplica, type ReplicaDatabase } from '@molis-ai/molis-work-storage';
import type { AgentDefinitions } from './agent-definitions.js';

const namespace = 'personal_prompt_overrides';
const formatVersion = /* @version format.agent-definitions.prompt-overrides */ 1;
export const promptConfigJournal = personalConfigJournal(namespace, 'prompt_overrides', row => `${row}.key`);
const invalid = () => new ActionError('actions.input_invalid', '提示词改写的同步内容无效');

function readKey(key: string): [string, string] {
  const parts = key.split('/');
  if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u.test(part))) throw invalid();
  return [parts[0]!, parts[1]!];
}

function portable(value: unknown, key: string) {
  const file = personalConfigRecord(value, ['format', 'format_version', 'exported_at', 'overrides']);
  if (file.format !== 'molis.prompt-overrides' || file.format_version !== formatVersion || typeof file.exported_at !== 'string'
    || file.exported_at.length > 64 || !Number.isFinite(Date.parse(file.exported_at))
    || !Array.isArray(file.overrides) || file.overrides.length !== 1) throw invalid();
  const row = personalConfigRecord(file.overrides[0], ['owner_id', 'prompt_id', 'title', 'base_version', 'body']);
  const [owner, prompt] = readKey(key);
  if (row.owner_id !== owner || row.prompt_id !== prompt || typeof row.title !== 'string' || row.title.length > 200
    || typeof row.body !== 'string' || !row.body.trim() || row.body.length > AGENT_PROMPT_MAX_CHARS
    || typeof row.base_version !== 'number' || !Number.isSafeInteger(row.base_version) || row.base_version < 1) throw invalid();
  return { body: row.body, baseVersion: row.base_version };
}

export function promptOverrideConfigReplica(db: ReplicaDatabase, actor: string, spaceId: string, authorize: () => void, definitions: AgentDefinitions) {
  const view = (key: string): AgentPromptView => {
    const [owner, prompt] = readKey(key);
    if (!definitions.hasPrompt(owner, prompt)) throw new ActionError('actions.unavailable', '当前设备尚未登记这段提示词', { details: { sync_waiting: true } });
    return definitions.prompt(key);
  };
  return personalConfigReplica(db, namespace, { spaceId, authorize }, {
    maximumBytes: 384 * 1024,
    key: readKey,
    read(key) {
      const saved = db.prepare('SELECT base_version,body,updated_at FROM prompt_overrides WHERE key=? AND actor_id=?').get(key, actor);
      if (!saved) return null;
      const prompt = view(key);
      const value: PromptOverridesFile = { format: 'molis.prompt-overrides', format_version: formatVersion, exported_at: String(saved.updated_at),
        overrides: [{ owner_id: prompt.owner_id, prompt_id: prompt.prompt_id, title: prompt.title, base_version: Number(saved.base_version), body: String(saved.body) }] };
      portable(value, key);
      return value;
    },
    apply(key, value) {
      const existing = db.prepare('SELECT actor_id FROM prompt_overrides WHERE key=?').get(key);
      if (existing && existing.actor_id !== actor) throw new ActionError('actions.forbidden', '提示词改写不属于当前账号');
      if (value === null && !existing) return;
      const prompt = view(key);
      const incoming = value === null ? null : portable(value, key);
      if (incoming && incoming.baseVersion !== prompt.default_version) throw new ActionError('actions.conflict', '提示词的默认版本已变化');
      const revision = Number(db.prepare('SELECT MAX(revision) AS revision FROM prompt_history WHERE key=?').get(key)?.revision ?? 0) + 1;
      if (!Number.isSafeInteger(revision)) throw invalid();
      const at = new Date().toISOString();
      const ref = prompt.default_ref ? JSON.stringify(prompt.default_ref) : null;
      if (incoming) {
        db.prepare(`INSERT INTO prompt_overrides(key,revision,base_version,body,updated_at,actor_id,default_ref) VALUES (?,?,?,?,?,?,?)
          ON CONFLICT(key) DO UPDATE SET revision=excluded.revision,base_version=excluded.base_version,body=excluded.body,updated_at=excluded.updated_at,default_ref=excluded.default_ref`)
          .run(key, revision, incoming.baseVersion, incoming.body, at, actor, ref);
      } else db.prepare('DELETE FROM prompt_overrides WHERE key=? AND actor_id=?').run(key, actor);
      db.prepare('INSERT INTO prompt_history(key,revision,action,body,base_version,at,actor_id,default_ref) VALUES (?,?,?,?,?,?,?,?)')
        .run(key, revision, incoming ? 'save' : 'reset', incoming?.body ?? null, prompt.default_version, at, actor, ref);
    },
  });
}
