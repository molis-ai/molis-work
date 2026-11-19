import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { molisWorkHostProjectReference, MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { ActionError, defineItemCreateAction, defineItemNextAction, defineItemRelatedAction, defineSubjectContextAction, type ActionExecutionContext, type ActionSubject,
  type WorkItemNextStep } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { definePresentationValuesAction, type PresentationDeclaration } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { type BackgroundPlugin } from "./home-background-plugin.js";
import { startProjectPlugins } from "./plugin-callers.js";

/*
 * A plugin the Host has never heard of that makes its notes work items (specs/work-mainline/contract-design.md §4): it declares `item`
 * on `note` with all three parts, the way an installed third-party plugin would, and keeps everything in memory so a test can see what
 * the mainline asked of it. `memo` is a kind it can be read by but declares no item source for. Nothing here names the mainline.
 */

export const NOTES_PLUGIN_ID = "io.molis.work.example.notes";
const READ = "notes:read", WRITE = "notes:write";

export interface Note { id: string; title: string; status: "open" | "review" | "done"; due_at?: string; happened_at?: string }

export function notesPlugin() {
  const state = {
    notes: new Map<string, Note>(), memos: new Set<string>(),
    /** The request ids it was asked to make a note under, in order; a repeated id gives the same note. */
    creates: [] as Array<{ request_id: string; name: string; audience: string }>, made: new Map<string, string>(),
    related: new Map<string, ActionSubject[]>(), next: new Map<string, WorkItemNextStep | null>(), nextCalls: 0, valuesCalls: 0,
    /** Set to make the next 「建成」 fail after the note is made: a cancel or a lost answer on the way back. */
    failAfterCreate: false,
    /** Hold the reply after the source has written so another action can change the arrangement. */
    afterCreate: undefined as (() => Promise<void>) | undefined,
  };
  const reader = defineSubjectContextAction("notes.subject.read", 1, "note", "笔记", [READ]);
  const memoReader = defineSubjectContextAction("notes.memo.read", 1, "memo", "便签", [READ]);
  const values = definePresentationValuesAction("notes.presentation.values", 1, ["note"], "笔记显示字段", [READ]);
  const create = defineItemCreateAction("notes.items.create", 1, { kind: "note", title: "建成笔记", description: "新建一条笔记。", permissions: [WRITE] });
  const related = defineItemRelatedAction("notes.items.related", 1, { kind: "note", title: "笔记的相关", description: "读取和笔记相关的对象。", permissions: [READ] });
  const next = defineItemNextAction("notes.items.next", 1, { kind: "note", title: "笔记的下一步", description: "读取笔记的下一步。", permissions: [READ] });
  const presentation = { objects: [{
    kind: "note",
    fields: [{ key: "title", role: "title" }, { key: "status", role: "status" }, { key: "due_at", role: "due_at" }, { key: "happened_at", role: "happened_at" }],
    status: { field: "status", map: { open: { ring: "running" }, review: { ring: "answer", attention: "needs_acceptance" }, done: { ring: "done" } } },
    forms: { chip: { fields: ["title"] }, row: { fields: ["title", "status"] } },
    item: { create: "notes.items.create@1", related: "notes.items.related@1", next: "notes.items.next@1" },
  }] } as const satisfies PresentationDeclaration;
  const definition: PluginDefinition = { manifest: { schema_version: 1, host_api_version: 1, plugin_id: NOTES_PLUGIN_ID, version: "1.0.0", name: "notes", kind: "app",
    publisher: { publisher_id: "example", signature: "notes" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: READ, required: true, reason: "读笔记" }, { permission: WRITE, required: true, reason: "写笔记" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    actions: [reader, memoReader, values, create, related, next], presentation },
  async start() {
    const note = (id: string) => { const found = state.notes.get(id); if (!found) throw new ActionError("notes.missing", "没有这条笔记", { kind: "not_found" }); return found; };
    return { kind: "app", views: [], actions: [
      { ...reader, handle: (_caller: ActionExecutionContext, input: unknown) => {
        const found = note((input as { subject_id: string }).subject_id);
        return { subject: { kind: "note", id: found.id }, revision: "1", title: found.title, content: `正文：${found.title}`, truncated: false };
      } },
      { ...memoReader, handle: (_caller: ActionExecutionContext, input: unknown) => {
        const id = (input as { subject_id: string }).subject_id;
        if (!state.memos.has(id)) throw new ActionError("notes.missing", "没有这条便签", { kind: "not_found" });
        return { subject: { kind: "memo", id }, revision: "1", title: `便签 ${id}`, content: "", truncated: false };
      } },
      { ...values, handle: (_caller: ActionExecutionContext, input: unknown) => {
        state.valuesCalls++;
        const { subjects } = input as { subjects: ActionSubject[] };
        return { items: subjects.map(subject => {
          const found = state.notes.get(subject.id);
          if (!found) return { subject, revision: "0", state: "deleted" };
          return { subject, revision: "1", state: "ok", values: { title: found.title, status: found.status, ...(found.due_at ? { due_at: found.due_at } : {}),
            ...(found.happened_at ? { happened_at: found.happened_at } : {}) } };
        }) };
      } },
      { ...create, handle: async (caller: ActionExecutionContext, input: unknown) => {
        const { name, request_id } = input as { name: string; request_id: string };
        state.creates.push({ request_id, name, audience: caller.audience });
        let id = state.made.get(request_id);
        if (!id) { id = `note-${state.made.size + 1}`; state.made.set(request_id, id); state.notes.set(id, { id, title: name, status: "open" }); }
        if (state.failAfterCreate) { state.failAfterCreate = false; throw new ActionError("notes.lost", "回答在路上丢了", { kind: "unavailable" }); }
        if (state.afterCreate) await state.afterCreate();
        return { subject: { kind: "note", id } };
      } },
      { ...related, handle: (_caller: ActionExecutionContext, input: unknown) => ({ subjects: state.related.get((input as { subject: ActionSubject }).subject.id) ?? [] }) },
      { ...next, handle: (_caller: ActionExecutionContext, input: unknown) => {
        state.nextCalls++;
        return { items: (input as { subjects: ActionSubject[] }).subjects.map(subject => ({ subject, next: state.next.get(subject.id) ?? null })) };
      } },
    ] };
  } };
  return { definition, state };
}

export type NotesPlugin = ReturnType<typeof notesPlugin>;

/** Projects under one Host with the notes plugin and, when given, the background-task plugin; every project opened. */
export async function mainlineRig(t: TestContext, plugins: { notes: NotesPlugin; background?: BackgroundPlugin }, names: readonly string[]) {
  const home = await mkdtemp(join(tmpdir(), "mainline-items-"));
  const references = new Map<string, LocalHostProjectReference>();
  for (const name of names) {
    const project = await withCatalog({ homeDirectory: home }, projects => projects.createProject({ display_name: name, actor_id: "user" }));
    references.set(name, molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path }));
  }
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null,
    pluginFixtures: { project: [plugins.notes.definition, ...(plugins.background ? [plugins.background.definition] : [])] } });
  host.configurePersonalPlanning(home, withCatalog);
  t.after(async () => { try { await host.close(); } finally { await rm(home, { recursive: true, force: true }); } });
  for (const reference of references.values()) await startProjectPlugins(host, reference);
  return { host, home, project: (name: string) => references.get(name)! };
}
