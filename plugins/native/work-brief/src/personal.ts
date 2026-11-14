import { bindActionHandler, type ActionExecutionContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { workBriefErrors } from "./error.js";
import { workBriefPersonalActions, type PersonalItem, type PersonalView } from "./actions.js";
import { compareBriefBodies, briefSubjectKey, sourceTurn, type AttentionItem, type BriefBody, type BriefVersion } from "./model.js";
import { readBriefSources, readBriefSubjects, type BriefDirectory } from "./reading.js";
import type { BriefStore } from "./store.js";

/** What the Home half needs: the one library (no project scope), one transaction per write, the caller's Home directory. */
export interface PersonalPorts {
  read<T>(run: (store: BriefStore) => T): T;
  write<T>(caller: ActionExecutionContext, run: (store: BriefStore) => T): Promise<T>;
  directory(): BriefDirectory;
  now(): string;
  newId(prefix: string): string;
}

/**
 * The personal brief: what waits for the person across their projects' briefs (Work Brief's own rows, only of the projects the Host
 * says this person reaches) and what the Home-level plugins showed at the last refresh. A project's objects are never read from
 * here: the Home path cannot call a project's actions, and this does not go around that.
 */
function personalView(store: BriefStore, caller: ActionExecutionContext): PersonalView {
  const reach = caller.readable_project_ids, items: PersonalItem[] = [];
  for (const brief of store.homesOf(reach ?? [])) {
    const version = store.version(brief);
    if (!version) continue;
    const dealt = new Set(store.marks(brief.brief_id).filter(mark => mark.state !== "failed").map(mark => mark.option_id));
    const place = { label: "project" as const, project_id: brief.project_id, brief_id: brief.brief_id };
    for (const item of version.attention) items.push({ ...place, kind: "attention", text: item.why, subject: item.subject, owner_plugin_id: item.owner_plugin_id, ...(item.blocked ? { blocked: true as const } : {}) });
    for (const option of version.next) if (!dealt.has(option.option_id)) items.push({ ...place, kind: "next", text: option.text, why: option.why, ...(option.subject ? { subject: option.subject } : {}) });
  }
  const own = store.personal(caller.actor_id), version = own && store.version(own);
  const names = new Map(version?.sources.map(row => [row.plugin_id, row.name]));
  for (const item of version?.attention ?? []) items.push({ label: "personal", kind: "source", text: item.why, subject: item.subject, owner_plugin_id: item.owner_plugin_id,
    ...(names.has(item.owner_plugin_id) ? { owner_name: names.get(item.owner_plugin_id)! } : {}) });
  return { as_of: version?.as_of ?? null, version: own?.current_version ?? 0, items, sources: version?.sources ?? [], projects_complete: reach !== undefined };
}

export function createPersonalHandlers(ports: PersonalPorts): ActionHandlerBinding[] {
  return [
    bindActionHandler(workBriefPersonalActions.get, (_input, caller) => ports.read(store => personalView(store, caller))),
    bindActionHandler(workBriefPersonalActions.refresh, async (_input, caller) => {
      const at = ports.now(), directory = ports.directory(), views = await directory.discover();
      const before = ports.read(store => { const brief = store.personal(caller.actor_id); return { brief, current: brief && store.version(brief) as BriefVersion | null }; });
      const rows = await readBriefSources(directory, views, before.current?.sources ?? [], at);
      // Each object a Home-level source shows, by the title its owner gives this person now; one that cannot be read is left out, not guessed.
      const reads = await readBriefSubjects(directory, views, rows.flatMap(row => row.subjects));
      const attention = rows.flatMap(row => row.subjects.flatMap((subject): AttentionItem[] => {
        const now = reads.get(briefSubjectKey(subject));
        return now?.state === "ok" ? [{ item_id: briefSubjectKey(subject), subject, owner_plugin_id: row.plugin_id, why: now.context.title }] : [];
      }));
      const was = new Map(before.current?.sources.map(row => [row.plugin_id, row]));
      const body: BriefBody = { sources: rows.map(row => ({ ...row, turn: sourceTurn(row, [], was.get(row.plugin_id)) })), claims: [], attention, next: [] };
      const titles = (list: readonly AttentionItem[] | undefined) => JSON.stringify(list?.map(item => [item.item_id, item.why]) ?? []);
      const changes = compareBriefBodies(before.current, body);
      if (before.brief && before.current && !changes.length && titles(before.current.attention) === titles(attention))
        return { ...ports.read(store => personalView(store, caller)), changed: false, changes };
      return ports.write(caller, store => {
        const existing = store.personal(caller.actor_id);
        if ((existing?.revision ?? 0) !== (before.brief?.revision ?? 0)) throw workBriefErrors.conflict("个人简报刚被别处更新，请重新读取后再试");
        store.append(existing ?? store.create({ brief_id: ports.newId("brief"), scope: "personal", title: "", actor_id: caller.actor_id }, at), existing?.revision ?? 1, body, { kind: "person" }, at);
        return { ...personalView(store, caller), changed: true, changes };
      });
    }),
  ];
}
