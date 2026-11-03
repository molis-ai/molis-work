import { assistantErrors, whenThere } from "./assistant-errors.js";
import type { WorkExecutor } from "./assistant-executor.js";
import { identity } from "./assistant-relations.js";
import type { AssistantStore, StoredWork } from "./assistant-store.js";

/** The store as these steps use it: a work, its relations, and its executor once the session is known. */
type SessionStore = Pick<AssistantStore, "get" | "update" | "relations">;

/** A work carried by a plugin whose session is known: the executor's own session the work is related to. */
export type SessionWork = StoredWork & { executor: { kind: "plugin"; session_id: string } };

/** The work (not archived) that already carries an executor's session, if any. */
function sessionHolder(store: SessionStore, actorId: string, projectId: string | null, session: { kind: string; id: string }, except?: string): StoredWork | null {
  for (const row of store.relations.forObject(projectId, session)) {
    if (row.relation !== "session" || row.work_id === except) continue;
    const work = whenThere(() => store.get(actorId, row.work_id)); // Gone holds nothing; a store that cannot be read is not a free session.
    if (work && !work.archived) return work;
  }
  return null;
}

/**
 * A new work that continues a session the person started on the executor's own page: the same session, so both entries show
 * one conversation. The session must exist in this project; a session another work already carries stays with it.
 */
export async function adoptSession(store: SessionStore, actorId: string, work: StoredWork, executor: WorkExecutor, sessionId: string): Promise<StoredWork> {
  if (work.executor.kind !== "plugin") throw assistantErrors.invalid("只有交给执行方插件的新工作可以接着一个已有的会话");
  const { provider } = executor;
  await executor.read(sessionId, 1);
  const holder = sessionHolder(store, actorId, identity(work).project_id, { kind: provider.session_kind, id: sessionId }, work.work_id);
  if (holder) throw assistantErrors.conflict(`这个会话已属于工作「${holder.title}」，请切换到那项工作继续`);
  const adopted = store.update(actorId, work.work_id, null, { executor: { ...work.executor, session_id: sessionId } });
  store.relations.link(identity(adopted), "session", { kind: provider.session_kind, id: sessionId, revision: null }, `接着用户在「${provider.title}」里开始的会话`);
  return adopted;
}

/** The executor's new session for a plugin-carried work that has none yet, linked to the work; opened in `mode` when one is given. */
export async function openSession(store: SessionStore, actorId: string, work: StoredWork, executor: WorkExecutor, mode?: string): Promise<SessionWork> {
  if (work.executor.kind !== "plugin") throw assistantErrors.invalid("这项工作不由执行方插件承担");
  const sessionId = await executor.createSession(work.title, mode);
  const opened = store.update(actorId, work.work_id, null, { executor: { ...work.executor, session_id: sessionId } });
  store.relations.link(identity(opened), "session", { kind: executor.provider.session_kind, id: sessionId, revision: null }, `「${executor.provider.title}」的会话承接这项工作`);
  return opened as SessionWork;
}
