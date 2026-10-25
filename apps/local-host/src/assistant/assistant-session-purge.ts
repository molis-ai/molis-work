import { isDeepStrictEqual } from "node:util";
import type { LedgerConnection } from "../context-ledger-database.js";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PLUGIN_ID, ASSISTANT_PERSONAL_OWNER, type AssistantSessionPurgeSelection } from "@molis-ai/molis-work-contracts/services/assistant";
import { assistantErrors } from "./assistant-errors.js";
import { AssistantRelations } from "./assistant-relations.js";
import { clearAssistantWorkRows, verifyAssistantWorkRowsAbsent } from "./assistant-project-purge.js";

type Database = LedgerConnection;
type Binding = Pick<AssistantSessionPurgeSelection, "session" | "owner">;
type Original = AssistantSessionPurgeSelection["works"][number];
const conflict = () => assistantErrors.conflict("助理原会话归属或工作选择已变化，保留原决定核对");
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** This is the raw persistence boundary. Only ownership fields leave it; no Work body or fallback decoding. */
function readBody(row: unknown): Record<string, unknown> {
  if (!object(row)) throw conflict();
  let body: unknown;
  try { body = JSON.parse(String(row.body)); } catch { throw conflict(); }
  if (!object(body) || body.work_id !== row.work_id || body.actor_id !== row.actor_id || body.revision !== row.revision
    || typeof body.work_id !== "string" || !body.work_id || !Number.isSafeInteger(body.revision) || Number(body.revision) < 1) throw conflict();
  return body;
}
function original(body: Record<string, unknown>, binding: Binding): Omit<Original, "relations"> {
  if (body.actor_id !== binding.owner.actor_id || body.session_id !== binding.session.session_id || typeof body.work_id !== "string"
    || typeof body.created_at !== "string" || !body.created_at || !object(body.scope)) throw conflict();
  const project = body.project_ref === undefined ? ASSISTANT_PERSONAL_OWNER
    : object(body.project_ref) && typeof body.project_ref.project_id === "string" ? body.project_ref.project_id : undefined;
  const namespace = body.scope.kind === "project" && typeof body.scope.project_id === "string" ? body.scope.project_id
    : body.scope.kind === "personal" ? null : undefined;
  if (project !== binding.owner.project_id || namespace === undefined || namespace !== null && namespace !== project) throw conflict();
  return { work_id: body.work_id, actor_id: binding.owner.actor_id, project_id: namespace, revision: Number(body.revision), created_at: body.created_at };
}
function validate(binding: Binding): void {
  if (binding.session.runtime_id !== "prologue" || !binding.session.session_id || binding.owner.plugin_id !== ASSISTANT_PLUGIN_ID
    || binding.owner.install_id !== ASSISTANT_INSTALL_ID || !binding.owner.actor_id || !binding.owner.project_id) throw conflict();
}
function rows(db: Database, binding: Binding) {
  // Inspect the actor's identities before selecting, so broken JSON is not silently classified as another Session.
  return db.prepare("SELECT work_id, actor_id, revision, body FROM assistant_works WHERE actor_id = ? ORDER BY work_id").all(binding.owner.actor_id)
    .map(readBody).filter(body => body.session_id === binding.session.session_id);
}

export function prepareAssistantSessionPurge(db: Database | undefined, binding: Binding): AssistantSessionPurgeSelection {
  validate(binding);
  const base = { session: structuredClone(binding.session), owner: structuredClone(binding.owner) };
  if (!db) return { ...base, works: [] };
  const relations = new AssistantRelations(db);
  return { ...base, works: rows(db, binding).map(row => {
    const work = original(row, binding); return { ...work, relations: relations.preparePurge(work) };
  }) };
}

/** The Host supplies one transaction for relations, all own child rows, and the Work anchor last. */
export function clearAssistantSessionPurge(db: Database | undefined, selection: AssistantSessionPurgeSelection, current: () => void): void {
  validate(selection); current();
  if (!db) return;
  if (new Set(selection.works.map(work => work.work_id)).size !== selection.works.length) throw conflict();
  const relations = new AssistantRelations(db);
  const currentWorks = rows(db, selection).map(row => original(row, selection));
  if (currentWorks.some(work => !selection.works.some(({ relations: _relations, ...selected }) => isDeepStrictEqual(work, selected)))) throw conflict();
  for (const selected of selection.works) {
    const row = db.prepare("SELECT work_id, actor_id, revision, body FROM assistant_works WHERE work_id = ?").get(selected.work_id);
    if (row) {
      const { relations: _relations, ...identity } = selected;
      if (!isDeepStrictEqual(original(readBody(row), selection), identity)) throw conflict();
    }
  }
  // Check every relation group before deleting any aggregate; changes roll back together under the same connection.
  for (const work of selection.works) { current(); relations.clearPurge(work, work.relations, current); }
  for (const work of selection.works) { current(); clearAssistantWorkRows(db, work.work_id, current); }
  current(); verifyAssistantSessionPurge(db, selection);
}

export function verifyAssistantSessionPurge(db: Database | undefined, selection: AssistantSessionPurgeSelection): void {
  validate(selection); if (!db) return;
  const relations = new AssistantRelations(db);
  for (const work of selection.works) { verifyAssistantWorkRowsAbsent(db, work.work_id); relations.verifyPurge(work, work.relations); }
}
