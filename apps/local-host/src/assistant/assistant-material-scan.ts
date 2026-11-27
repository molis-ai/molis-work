import { LOOKBACK_DEFAULT, lookbackHours } from "./assistant-setting-values.js";
import { assistantWords } from "./assistant-saved-text.js";
import { findSubjectReader, WORK_EVENTS_INPUT_TYPE, WORK_EVENTS_OUTPUT_TYPE, type ActionSubjectContext, type ActionView, type WorkEventCollection } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PersonActions } from "./assistant-executor.js";
import type { WorkIdentity } from "./assistant-relations.js";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import { repeatingFailure } from "../host-log.js";

/** Notices older than this are no longer news: resolved quietly rather than shown late. */
export const NOTICE_TTL_MS = 48 * 60 * 60 * 1000;

/** A source of new items that fails every look, by project and capability: written when it starts failing, and again only once it has answered since. */
const materialSourceFailures = repeatingFailure("assistant", "material_source_failed");

/** One project in a look for new material: how far the look got there. */
export interface ScanLook { project_id: string; works: number; capabilities?: number; sources?: number; goals?: number; events?: number; problem?: string }

/** A step of a background look that takes too long is given up (as a failure), so it never holds up the next look. */
export function withinTime<T>(step: Promise<T>, ms = 20_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([step, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("读取超时")), ms); })]).finally(() => clearTimeout(timer));
}

/**
 * What one look needs: the parts of the person's store it reads and writes, how a work is named in its relations, their own
 * actions in a work's scope, and where to record how far it got in each project.
 */
interface ScanEnvironment {
  store: Pick<AssistantStore, "setting" | "setSetting" | "list" | "raiseNotice" | "relations">;
  identity: (work: StoredWork) => WorkIdentity;
  actorId: string;
  now: Date;
  scopeActions?: (work: StoredWork) => Promise<PersonActions>;
  looks: ScanLook[];
}

/**
 * One look for new items elsewhere that share what a live work is about (a Goal, any plugin's object others attach to; read from the
 * items' owners, never guessed):
 * the notices it raises, counted. The first look only learns what is already there.
 */
export async function scanNewMaterialOnce(env: ScanEnvironment): Promise<number> {
  const { store, actorId, scopeActions, looks, identity } = env;
  const now = env.now;
  // Items are dated by their source, so one may turn up after its date: what matters is whether it was seen before.
  // The first look only learns what is already there. The source window is independent of notice expiry.
  const known = store.setting(actorId, "material_seen");
  const seen = new Set<string>(known ? JSON.parse(known) as string[] : []), firstLook = known === null;
  const savedRange = store.setting(actorId, "lookback");
  const hours = lookbackHours(savedRange === null ? LOOKBACK_DEFAULT : JSON.parse(savedRange));
  const from = new Date(now.getTime() - hours * 3_600_000);
  // Keep the existing inventory of recently active works. A longer look can also reach works active further back.
  const workSince = Math.min(now.getTime() - 7 * 24 * 3_600_000, from.getTime());
  const works = store.list(actorId).filter(work => !work.archived && work.project_ref && !work.delegated_by && Date.parse(work.updated_at) >= workSince).slice(0, 12);
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
    const providers = views.filter(view => view.action.input_type === WORK_EVENTS_INPUT_TYPE && view.action.output_type === WORK_EVENTS_OUTPUT_TYPE && view.availability.available);
    looked.capabilities = views.length; looked.sources = providers.length;
    const read = async (subject: { kind: string; id: string }): Promise<ActionSubjectContext | null> => {
      const lookup = findSubjectReader(views, subject.kind);
      if (lookup.found !== "one") return null;
      const reader = lookup.view;
      try {
        return await withinTime(actions!.invoke({ capability_id: reader.capability_id, version: reader.version, provider_id: reader.provider.provider_id }, { subject_id: subject.id })) as ActionSubjectContext;
      } catch {
        return null;
      }
    };
    // What each live work is about: the objects other objects attach to (a Goal: any kind an owner declares as the other end of a
    // relation placement keeps, `placement_relation`) among the objects it relates to, and the ones their owners attach them to.
    const targets = new Set(views.flatMap(({ action }) => action.placement_relation?.role === "list" && action.placement_relation.target ? [action.placement_relation.target.kind] : []));
    const subjectKey = (subject: { kind: string; id: string }) => JSON.stringify([subject.kind, subject.id]);
    const aboutOf = (subject: { kind: string; id: string }, context: ActionSubjectContext | null) =>
      [...(targets.has(subject.kind) ? [subjectKey(subject)] : []), ...(context?.attached_to ?? []).map(subjectKey)];
    const goals = new Map<string, Set<string>>();
    for (const work of group) {
      const ids = new Set<string>();
      for (const relation of store.relations.forWork(identity(work)).slice(-20)) {
        for (const key of aboutOf(relation.object, targets.has(relation.object.kind) ? null : await read(relation.object))) ids.add(key);
      }
      if (ids.size) goals.set(work.work_id, ids);
    }
    looked.goals = [...goals.values()].reduce((sum, ids) => sum + ids.size, 0);
    if (!goals.size && !firstLook) continue;
    looked.events = 0;
    const window = { from: from.toISOString(), to: new Date(now.getTime() + 1).toISOString(), now: now.toISOString() };
    for (const provider of providers) {
      let collection: WorkEventCollection;
      try { collection = await withinTime(actions.invoke({ capability_id: provider.capability_id, version: provider.version, provider_id: provider.provider.provider_id }, window)) as WorkEventCollection; }
      catch (error) { materialSourceFailures.failed(`${projectId}:${provider.capability_id}`, error, { project_id: projectId, capability_id: provider.capability_id }); continue; }
      materialSourceFailures.worked(`${projectId}:${provider.capability_id}`);
      // New items (occurred) and newly open attention items (active); standing status lines (today) are not material.
      for (const event of collection.events.filter(item => item.placement === "occurred" || item.placement === "active").slice(0, 100)) {
        looked.events = (looked.events ?? 0) + 1;
        const key = `${projectId}:${provider.capability_id}:${event.event_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (firstLook) continue;
        // What the Assistant made itself is not news to the work that made it.
        if (store.relations.forObject(projectId, event.subject).some(row => row.relation === "result")) continue;
        const eventGoals = aboutOf(event.subject, targets.has(event.subject.kind) ? null : await read(event.subject));
        for (const [workId, ids] of goals) {
          const shared = eventGoals.find(goal => ids.has(goal));
          if (!shared) continue;
          const work = group.find(item => item.work_id === workId)!;
          const [kind, id] = JSON.parse(shared) as [string, string];
          const goal = (await read({ kind, id }))?.title, words = { source: collection.source.title, item: event.title };
          const stored = store.raiseNotice(actorId, { kind: "material", work_id: work.work_id, work_title: work.title,
            text: goal ? assistantWords("workbench.assistant-notice.material", { ...words, goal })
              : assistantWords("workbench.assistant-notice.material-untitled", words) }, `material:${work.work_id}:${event.event_id}`);
          if (stored) raised += 1;
        }
      }
    }
  }
  store.setSetting(actorId, "material_seen", JSON.stringify([...seen].slice(-2000)));
  return raised;
}
