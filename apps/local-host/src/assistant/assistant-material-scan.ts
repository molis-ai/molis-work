import { isSubjectReader, HOME_EVENTS_INPUT_TYPE, HOME_EVENTS_OUTPUT_TYPE, type ActionSubjectContext, type ActionView, type HomeEventCollection } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PersonActions } from "./assistant-coding.js";
import { identity } from "./assistant-relations.js";
import type { AssistantStore, StoredWork } from "./assistant-store.js";

/** Notices older than this are no longer news: resolved quietly rather than shown late. A look for new material goes no further back. */
export const NOTICE_TTL_MS = 48 * 60 * 60 * 1000;

/** One project in a look for new material: how far the look got there. */
export interface ScanLook { project_id: string; works: number; capabilities?: number; sources?: number; goals?: number; events?: number; problem?: string }

/** A step of a background look that takes too long is given up (as a failure), so it never holds up the next look. */
export function withinTime<T>(step: Promise<T>, ms = 20_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([step, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("读取超时")), ms); })]).finally(() => clearTimeout(timer));
}

/** What one look needs: the person's store, their own actions in a work's scope, and where to record how far it got in each project. */
export interface ScanEnvironment {
  store: AssistantStore;
  actorId: string;
  now: Date;
  scopeActions?: (work: StoredWork) => Promise<PersonActions>;
  looks: ScanLook[];
}

/**
 * One look for new items elsewhere that share a Goal with a live work (read from the items' owners, never guessed):
 * the notices it raises, counted. The first look only learns what is already there.
 */
export async function scanNewMaterialOnce(env: ScanEnvironment): Promise<number> {
  const { store, actorId, scopeActions, looks } = env;
  const now = env.now;
  // Items are dated by their source, so one may turn up after its date: what matters is whether it was seen before.
  // The first look only learns what is already there; nothing older than a notice's life is considered.
  const known = store.setting(actorId, "material_seen");
  const seen = new Set<string>(known ? JSON.parse(known) as string[] : []), firstLook = known === null;
  const from = new Date(now.getTime() - NOTICE_TTL_MS);
  const week = now.getTime() - 7 * 24 * 3600_000;
  const works = store.list(actorId).filter(work => !work.archived && work.project_ref && !work.delegated_by && Date.parse(work.updated_at) >= week).slice(0, 12);
  const byProject = new Map<string, StoredWork[]>();
  for (const work of works) byProject.set(work.project_ref!.project_id, [...byProject.get(work.project_ref!.project_id) ?? [], work]);
  let raised = 0;
  for (const [projectId, group] of byProject) {
    let actions: PersonActions | null = null;
    const looked: ScanLook = { project_id: projectId, works: group.length };
    looks.push(looked);
    try { actions = await withinTime(scopeActions?.(group[0]!) ?? Promise.resolve(null)); } catch (error) { actions = null; looked.problem = error instanceof Error ? error.message : String(error); }
    if (!actions) continue;
    const views = await withinTime(actions.discover()).catch((error: unknown) => { looked.problem = error instanceof Error ? error.message : String(error); return [] as ActionView[]; });
    const providers = views.filter(view => view.action.input_type === HOME_EVENTS_INPUT_TYPE && view.action.output_type === HOME_EVENTS_OUTPUT_TYPE && view.availability.available);
    looked.capabilities = views.length; looked.sources = providers.length;
    const readers = views.filter(view => isSubjectReader(view.action) && view.availability.available);
    const read = async (subject: { kind: string; id: string }): Promise<ActionSubjectContext | null> => {
      const reader = readers.find(view => view.action.subject_kinds.includes(subject.kind));
      if (!reader) return null;
      try { return await withinTime(actions!.invoke({ capability_id: reader.capability_id, version: reader.version, provider_id: reader.provider.provider_id }, { subject_id: subject.id })) as ActionSubjectContext; }
      catch { return null; }
    };
    // What each live work is about: the Goals of the objects it relates to.
    const goals = new Map<string, Set<string>>();
    for (const work of group) {
      const ids = new Set<string>();
      for (const relation of store.relations.forWork(identity(work)).slice(-20)) {
        if (relation.object.kind === "goal") { ids.add(relation.object.id); continue; }
        for (const goal of (await read(relation.object))?.goal_ids ?? []) ids.add(goal);
      }
      if (ids.size) goals.set(work.work_id, ids);
    }
    looked.goals = [...goals.values()].reduce((sum, ids) => sum + ids.size, 0);
    if (!goals.size && !firstLook) continue;
    looked.events = 0;
    const window = { from: from.toISOString(), to: new Date(now.getTime() + 1).toISOString(), now: now.toISOString() };
    for (const provider of providers) {
      let collection: HomeEventCollection;
      try { collection = await withinTime(actions.invoke({ capability_id: provider.capability_id, version: provider.version, provider_id: provider.provider.provider_id }, window)) as HomeEventCollection; }
      catch { continue; }
      // New items (occurred) and newly open attention items (active); standing status lines (today) are not material.
      for (const event of collection.events.filter(item => item.placement === "occurred" || item.placement === "active").slice(0, 100)) {
        looked.events = (looked.events ?? 0) + 1;
        const key = `${projectId}:${provider.capability_id}:${event.event_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (firstLook) continue;
        // What the Assistant made itself is not news to the work that made it.
        if (store.relations.forObject(projectId, event.subject).some(row => row.relation === "result")) continue;
        const context = event.subject.kind === "goal" ? null : await read(event.subject);
        const eventGoals = event.subject.kind === "goal" ? [event.subject.id] : context?.goal_ids ?? [];
        for (const [workId, ids] of goals) {
          const shared = eventGoals.find(goal => ids.has(goal));
          if (!shared) continue;
          const work = group.find(item => item.work_id === workId)!;
          const goalTitle = (await read({ kind: "goal", id: shared }))?.title || "相关目标";
          const stored = store.raiseNotice(actorId, { kind: "material", work_id: work.work_id, work_title: work.title,
            text: `${collection.source.title} 有新内容「${event.title.slice(0, 60)}」，和这项工作的目标「${goalTitle.slice(0, 40)}」有关` }, `material:${work.work_id}:${event.event_id}`);
          if (stored) raised += 1;
        }
      }
    }
  }
  store.setSetting(actorId, "material_seen", JSON.stringify([...seen].slice(-2000)));
  return raised;
}
