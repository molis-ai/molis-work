import { onEventAppended } from "@molis-ai/molis-work-storage";

/**
 * That something a page shows as waiting on the person may have changed (specs/work-line WLN-27; user decision 2026-11-15): the
 * page's one subscription (`GET /api/attention/events`) says so, and the page reads `GET /api/attention` once again. Nothing is
 * polled. A change is said when a project's journal gains an event (Host modules and plugins' journal writes), a plugin's project
 * library commits a transaction (its own tables: sessions, items, tasks), the Assistant's store changes a work or a notice, or the
 * runtime asks to start a continuation (a wait is over). The word carries nothing: the read that follows is the caller's own, with
 * its own authority, so saying "changed" too often costs one read and says nothing it may not know.
 *
 * `null` is a change that belongs to no one project (the Assistant's store, which holds personal and project works): every page hears it.
 */
type Listener = () => void;
const PROJECTS = new Map<string, Set<Listener>>(), HOME = new Set<Listener>();
const pending = new Set<string | null>();
const EACH = new Set<(projectId: string | null) => void>();
let scheduled = false;

const flush = () => {
  scheduled = false;
  const changed = [...pending]; pending.clear();
  const told = new Set<Listener>();
  const tell = (listeners: Iterable<Listener>) => { for (const listener of listeners) if (!told.has(listener)) { told.add(listener); try { listener(); } catch { /* one page's fault stays its own */ } } };
  for (const projectId of changed) {
    if (projectId === null) { for (const listeners of PROJECTS.values()) tell(listeners); }
    else tell(PROJECTS.get(projectId) ?? []);
    tell(HOME);
    for (const listener of EACH) try { listener(projectId); } catch { /* the same */ }
  }
};

/** Something under `projectId` (or under no one project, `null`) may have changed; said once per turn of the event loop, after the write's own commit. */
export function attentionChanged(projectId: string | null): void {
  pending.add(projectId);
  if (!scheduled) { scheduled = true; setImmediate(flush); }
}

/**
 * Hear the changes a page shows: a project page those of its project (and of no one project), the Home page (`projectId` null)
 * those of every project, since it lists the background tasks of every open one. The returned function stops it.
 */
export function onAttentionChange(projectId: string | null, listener: Listener): () => void {
  const listeners = projectId === null ? HOME : PROJECTS.get(projectId) ?? new Set<Listener>();
  if (projectId !== null) PROJECTS.set(projectId, listeners);
  listeners.add(listener);
  return () => { listeners.delete(listener); if (projectId !== null && !listeners.size && PROJECTS.get(projectId) === listeners) PROJECTS.delete(projectId); };
}

/**
 * Hear which project changed, once a turn for each (`null`: the Assistant's own store): for the Host's own looks that read only
 * where something changed (the Assistant's reports on tasks no conversation started), not for pages.
 */
export function onAttentionChangeOf(listener: (projectId: string | null) => void): () => void {
  EACH.add(listener);
  return () => { EACH.delete(listener); };
}

onEventAppended(projectId => attentionChanged(projectId));
