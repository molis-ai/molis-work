import { ActionError, bindFileEntriesHandler, bindSearchEntriesHandler, defineFileEntriesAction, defineSearchEntriesAction,
  type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginPrivateStorage } from "@molis-ai/molis-work-contracts/platform/plugin";

export const PROBE_READ = "probe:read", PROBE_WRITE = "probe:write";
export const PROBE_SUBJECT_KIND = "probe_note";
export const PROBE_KEEP_JOB = "probe-keep";
const SURFACE = "probe", NOTES_KEY = "notes";

export interface ProbeNote { id: string; title: string; created_at: string; updated_at: string }

const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const text = { type: "string" }, id = { type: "string", minLength: 1, maxLength: 64 };
const note = object({ id, title: text, created_at: text, updated_at: text });
const base = { scope: "project" as const, audiences: ["user", "agent", "workflow", "mcp", "plugin"] as const, subject_kinds: [PROBE_SUBJECT_KIND] };

export const probeActions = {
  list: { capability_id: "probe.notes.list", version: 1, operation: "query", action: { ...base, kind: "query",
    title: "读探针笔记", description: "列出这个项目里探针记下的笔记", permissions: [PROBE_READ],
    input_schema: object({}), output_schema: object({ notes: { type: "array", items: note } }) } } as ActionDefinition<Record<string, never>, { notes: ProbeNote[] }>,
  create: { capability_id: "probe.notes.create", version: 1, operation: "command", action: { ...base, kind: "operation", effect: "write",
    title: "记一条探针笔记", description: "记下一条笔记；可以撤销", permissions: [PROBE_WRITE],
    input_schema: object({ title: { type: "string", minLength: 1, maxLength: 200 } }), output_schema: object({ note }),
    undo: { capability_id: "probe.notes.remove", version: 1, input: { id: "note.id", expected_updated_at: "note.updated_at" } } } } as ActionDefinition<{ title: string }, { note: ProbeNote }>,
  remove: { capability_id: "probe.notes.remove", version: 1, operation: "command", action: { ...base, kind: "operation", effect: "write",
    title: "删掉探针笔记", description: "删掉一条笔记；它在记下之后改过就不删", permissions: [PROBE_WRITE],
    input_schema: object({ id, expected_updated_at: text }), output_schema: object({ ok: { const: true } }) } } as ActionDefinition<{ id: string; expected_updated_at: string }, { ok: true }>,
  search: defineSearchEntriesAction("probe.search.entries", [{ kind: PROBE_SUBJECT_KIND, title: "探针笔记", surface: SURFACE }], "探针笔记", [PROBE_READ]),
  files: defineFileEntriesAction("probe.files.entries", [{ kind: PROBE_SUBJECT_KIND, title: "探针笔记", surface: SURFACE }], "探针笔记", [PROBE_READ]),
};
export const PROBE_ACTIONS: readonly ActionDefinition[] = Object.values(probeActions) as ActionDefinition[];

/** The notes of one project, kept as one JSON value in the installation's private storage (each project has its own instance). */
export function probeActionHandlers(storage: PluginPrivateStorage): ActionHandlerBinding[] {
  const read = (): ProbeNote[] => JSON.parse(storage.get(NOTES_KEY) ?? "[]") as ProbeNote[];
  const write = async (caller: ActionExecutionContext, notes: ProbeNote[]) => { await caller.beforeEffect(); storage.set(NOTES_KEY, JSON.stringify(notes)); };
  const project = (caller: ActionCallContext) => { if (!caller.project_id) throw new ActionError("actions.project_required", "请选择项目"); return caller.project_id; };
  return [
    { ...probeActions.list, handle: caller => { project(caller); return { notes: read() }; } },
    { ...probeActions.create, handle: async (caller, input) => {
      project(caller);
      const now = new Date().toISOString(), created: ProbeNote = { id: crypto.randomUUID(), title: (input as { title: string }).title, created_at: now, updated_at: now };
      await write(caller, [...read(), created]);
      return { note: created };
    } },
    { ...probeActions.remove, handle: async (caller, input) => {
      project(caller);
      const { id: noteId, expected_updated_at } = input as { id: string; expected_updated_at: string }, notes = read();
      const found = notes.find(item => item.id === noteId);
      if (!found) throw new ActionError("actions.not_found", "这条笔记已不在");
      if (found.updated_at !== expected_updated_at) throw new ActionError("actions.conflict", "这条笔记记下之后改过");
      await write(caller, notes.filter(item => item.id !== noteId));
      return { ok: true as const };
    } },
    bindSearchEntriesHandler(probeActions.search, caller => { project(caller); return read().map(item => ({ subject: { kind: PROBE_SUBJECT_KIND, id: item.id },
      revision: item.updated_at, title: item.title, summary: "", updated_at: item.updated_at, content: "summary" as const, open: { surface: SURFACE, id: item.id } })); }),
    bindFileEntriesHandler(probeActions.files, caller => { project(caller); return read().map(item => ({ subject: { kind: PROBE_SUBJECT_KIND, id: item.id },
      revision: item.updated_at, title: `${item.title}.txt`, folder: [], media_type: "text/plain", size: null, updated_at: item.updated_at, open: { surface: SURFACE, id: item.id } })); }),
  ];
}
