import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ActionService } from "@molis-ai/molis-work-kernel";
import {
  ActionError,
  bindSearchEntriesHandler,
  defineSearchEntriesAction,
  defineSubjectContextAction,
  subjectContext,
  type ActionCallContext,
  type SearchEntry,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { openTextSearchIndex } from "@molis-ai/molis-work-storage";
import { SearchService } from "@molis-ai/molis-work-service-search";

/**
 * Two owners of objects a question may ask for (Goals in projects a and b, Pages in a), each with a search source and a
 * subject reader, behind a real action service and search index (specs/ai-interaction-experience H3).
 */
export type Doc = { id: string; title: string; body: string; version: number; refuse?: boolean };
const goalReader = defineSubjectContextAction("goals.subject.read", "goal", "Goal", ["goals:read"]);
const goalEntries = defineSearchEntriesAction("goals.search.entries", [{ kind: "goal", title: "Goal", surface: "goals" }], "Goal", ["goals:read"]);
const pageReader = defineSubjectContextAction("pages.subject.read", "page", "文档", ["pages:read"]);
const pageEntries = defineSearchEntriesAction("pages.search.entries", [{ kind: "page", title: "文档", surface: "pages" }], "文档", ["pages:read"]);

/** `paged`: the reader reads past its first page from the `offset` it is given, as a long-text owner does (project-knowledge §4.4). */
function owner(rows: Map<string, Doc>, kind: string, reader: typeof goalReader, entries: typeof goalEntries, paged = false) {
  return {
    definitions: [entries, reader],
    handlers: [
      bindSearchEntriesHandler(entries, () => [...rows.values()].map((row): SearchEntry => ({ subject: { kind, id: row.id }, revision: String(row.version), title: row.title,
        summary: "", updated_at: null, content: "context", open: { surface: `${kind}s`, id: row.id } }))),
      { ...reader, handle: (_caller: ActionCallContext, input: unknown) => {
        const row = rows.get((input as { subject_id: string }).subject_id);
        if (!row) throw new ActionError("actions.subject_unavailable", "已删除");
        if (row.refuse) throw new ActionError(`${kind}s.locked`, "已锁定");
        return subjectContext({ subject: { kind, id: row.id }, revision: String(row.version), title: row.title, content: row.body, goal_ids: [] },
          paged ? input as { offset?: number } : undefined);
      } },
    ],
  };
}

export const person = (project_id: string, permissions = ["goals:read", "pages:read", "search:read"]): ActionCallContext =>
  ({ actor_id: "web-user", project_id, audience: "user", permissions });

export async function referenceOwners(t: import("node:test").TestContext) {
  const home = await mkdtemp(join(tmpdir(), "search-references-"));
  const actions = new ActionService();
  const index = openTextSearchIndex({ homeDirectory: home });
  const search = new SearchService({ index, freshMs: 60_000, budgetMs: 5_000, refreshDelayMs: 5,
    indexer: async project_id => ({ client: actions, caller: person(project_id ?? "") }) });
  t.after(async () => { await search.close(); index.close(); await rm(home, { recursive: true, force: true }); });
  const goals = new Map<string, Doc>([
    ["g1", { id: "g1", title: "内部试用上线", body: "十月内部试用", version: 3 }],
    ["g2", { id: "g2", title: "试用反馈整理", body: "收集试用反馈", version: 1 }],
    ["g3", { id: "g3", title: "锁定的试用目标", body: "试用", version: 1, refuse: true }],
  ]);
  const pages = new Map<string, Doc>([["p1", { id: "p1", title: "试用说明", body: "试用手册", version: 1 }]]);
  actions.registerProvider({ provider: { provider_id: "goals", plugin_id: "goals", title: "Goals", kind: "plugin", project_id: "a" }, ...owner(goals, "goal", goalReader, goalEntries) });
  actions.registerProvider({ provider: { provider_id: "pages", plugin_id: "pages", title: "Pages", kind: "plugin", project_id: "a" }, ...owner(pages, "page", pageReader, pageEntries, true) });
  const other = new Map<string, Doc>([["gb", { id: "gb", title: "B 项目的试用", body: "试用", version: 1 }]]);
  actions.registerProvider({ provider: { provider_id: "goals", plugin_id: "goals", title: "Goals", kind: "plugin", project_id: "b" }, ...owner(other, "goal", goalReader, goalEntries) });
  return { home, index, actions, search, goals, pages, access: (caller: ActionCallContext) => ({ client: actions, caller }) };
}
