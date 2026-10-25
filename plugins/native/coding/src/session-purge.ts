import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { CodingSessionPurgeSelection } from "@molis-ai/molis-work-contracts/modules/coding";
import type { PluginDatabaseReader, PluginDatabaseTransaction, PluginSqlRow } from "@molis-ai/molis-work-contracts/platform/plugin";
import { CODING_PLUGIN_ID } from "./manifest.js";

/** Key semantics belong to Coding; storage statements stay with PluginRuntime. */
export interface CodingPrivatePurgeKeys {
  keys(): string[];
  clear(keys: readonly string[]): void;
  verifyAbsent(keys: readonly string[]): void;
}
const SESSION_KEYS = ["actions", "configuration", "mcp-sources", "mcp", "methods", "character", "character-skills", "question-drafts",
  "draft", "budget", "materials", "compact-next", "digest-usage", "last-start", "goal-context", "priority", "cards"] as const;
const conflict = () => new ActionError("actions.conflict", "Coding 会话原件归属或原选择已变化");
const ownedKey = (key: string, id: string) => SESSION_KEYS.some(prefix => key === `${prefix}:${id}`)
  || key.startsWith(`step-verdict:${id}:`) || key.startsWith(`subagent-verdict:${id}:`);
const allKeys = (selection: CodingSessionPurgeSelection) => [...selection.sessions, ...selection.waits].flatMap(item => [...item.keys]);
function identity(row: PluginSqlRow, selection: Pick<CodingSessionPurgeSelection, "session" | "owner">) {
  if (row.project_id !== selection.owner.project_id || row.runtime_id !== selection.session.runtime_id
    || row.runtime_session_id !== selection.session.session_id || typeof row.session_id !== "string" || !row.session_id
    || typeof row.created_at !== "string" || !row.created_at) throw conflict();
  return { session_id: row.session_id, created_at: row.created_at };
}
function validate(selection: CodingSessionPurgeSelection): void {
  if (selection.owner.plugin_id !== CODING_PLUGIN_ID || typeof selection.session.runtime_id !== "string" || !selection.session.runtime_id || !selection.installation_generation
    || new Set(selection.sessions.map(item => item.session_id)).size !== selection.sessions.length
    || new Set(selection.waits.map(item => item.wait_id)).size !== selection.waits.length
    || selection.sessions.some(item => !item.session_id || !item.created_at || item.keys.some(key => !ownedKey(key, item.session_id)))
    || selection.waits.some(item => !item.wait_id || item.keys.some(key => key !== `wake-note:${item.wait_id}` && key !== `queued:${item.wait_id}`))
    || new Set(allKeys(selection)).size !== allKeys(selection).length) throw conflict();
}

/** Read only. Every actual key is fixed before the SDK destroys wait-to-Session ownership. */
export function prepareCodingSessionPurge(db: PluginDatabaseReader, input: Omit<CodingSessionPurgeSelection, "sessions" | "waits">,
  keys: readonly string[], waitIds: readonly string[]): CodingSessionPurgeSelection {
  const selected: CodingSessionPurgeSelection = { ...structuredClone(input), sessions: db.all(
    "SELECT * FROM coding_sessions WHERE project_id = ? AND runtime_id = ? AND runtime_session_id = ? ORDER BY session_id",
    [input.owner.project_id, input.session.runtime_id, input.session.session_id]).map(row => {
      const original = identity(row, input);
      return { ...original, keys: keys.filter(key => ownedKey(key, original.session_id)).sort() };
    }), waits: [...waitIds].sort().map(wait_id => ({ wait_id, keys: keys.filter(key => key === `wake-note:${wait_id}` || key === `queued:${wait_id}`).sort() })) };
  validate(selected); return selected;
}

/** Called inside the Host's one project transaction; all bindings are checked before the first delete. */
export function clearCodingSessionPurge(tx: PluginDatabaseTransaction, selection: CodingSessionPurgeSelection,
  storage: CodingPrivatePurgeKeys, current: () => void): void {
  validate(selection); current();
  const keys = storage.keys();
  for (const original of selection.sessions) {
    const row = tx.get("SELECT * FROM coding_sessions WHERE project_id = ? AND session_id = ?", [selection.owner.project_id, original.session_id]);
    if (row && identity(row, selection).created_at !== original.created_at) throw conflict();
    if (keys.filter(key => ownedKey(key, original.session_id)).some(key => !original.keys.includes(key))) throw conflict();
  }
  const remaining = prepareCodingSessionPurge(tx, selection, keys, selection.waits.map(wait => wait.wait_id));
  if (remaining.sessions.some(row => !selection.sessions.some(original => original.session_id === row.session_id && original.created_at === row.created_at))
    || remaining.waits.some(wait => wait.keys.some(key => !selection.waits.find(original => original.wait_id === wait.wait_id)!.keys.includes(key)))) throw conflict();
  storage.clear(allKeys(selection));
  for (const original of selection.sessions) {
    current(); tx.run("DELETE FROM coding_plan_drafts WHERE project_id = ? AND session_id = ?", [selection.owner.project_id, original.session_id]);
    current(); tx.run("DELETE FROM coding_sessions WHERE project_id = ? AND session_id = ?", [selection.owner.project_id, original.session_id]);
  }
  current(); verifyCodingSessionPurge(tx, selection, storage);
}

/** Only the original set is inspected. Later objects are never selected or mutated by verification. */
export function verifyCodingSessionPurge(db: PluginDatabaseReader, selection: CodingSessionPurgeSelection, storage: CodingPrivatePurgeKeys): void {
  validate(selection);
  for (const original of selection.sessions) {
    if (db.get("SELECT session_id FROM coding_sessions WHERE project_id = ? AND session_id = ?", [selection.owner.project_id, original.session_id])
      || db.get("SELECT session_id FROM coding_plan_drafts WHERE project_id = ? AND session_id = ?", [selection.owner.project_id, original.session_id])) throw conflict();
  }
  storage.verifyAbsent(allKeys(selection));
}
