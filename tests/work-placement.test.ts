import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { inflateRawSync } from "node:zlib";

import { ActionService } from "@molis-ai/molis-work-kernel";
import {
  ActionError, bindHomeObjectMoveHandler, bindObjectCopyHandler, bindObjectMoveHandler, bindWorkflowContentHandlers, defineObjectCopyAction, defineObjectMoveAction,
  defineSubjectContextAction, defineWorkflowContentActions, inspectActionDeclarations, subjectContext, type ActionCallContext,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { createContextLedger, type ContextLedgerDatabase } from "@molis-ai/molis-work-module-context-ledger";
import { PlacementService, PLACEMENT_LEDGER_ACCESS } from "@molis-ai/molis-work-service-placement";
import { pagesManifest, openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { pptManifest, openPptStore, buildPptx, slidesFromMarkdown } from "@molis-ai/molis-work-plugin-ppt";
import { formManifest, openFormStore, formFillPageHtml, formResultsCsv, FORM_ANSWER_FORMAT, questionsFromText } from "@molis-ai/molis-work-plugin-form";
import { datasetManifest, openDatasetStore, parseCsv } from "@molis-ai/molis-work-plugin-dataset";
import { lingguangManifest, openLingguangStore } from "@molis-ai/molis-work-plugin-lingguang";
import { createGoalsInputActionHandlers, goalsInputActions } from "../plugins/native/goals/src/input-actions.js";
import { SearchService } from "@molis-ai/molis-work-service-search";
import { openTextSearchIndex } from "@molis-ai/molis-work-storage";
import { bindSearchEntriesHandler, defineSearchEntriesAction } from "@molis-ai/molis-work-contracts/platform/actions";

/** The entries of a zip in stored order, read from local file headers (what Office and fflate write). */
function unzipSync(bytes: Uint8Array): Record<string, Buffer> {
  const buffer = Buffer.from(bytes), files: Record<string, Buffer> = {};
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8), size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26), extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString("utf8", offset + 30, offset + 30 + nameLength);
    const start = offset + 30 + nameLength + extraLength, data = buffer.subarray(start, start + size);
    files[name] = method === 8 ? inflateRawSync(data) : Buffer.from(data);
    offset = start + size;
  }
  return files;
}
const strFromU8 = (value: Buffer) => value.toString("utf8");

/* ---------- A small plugin whose notes live in project partitions, like Pages or PPT ---------- */
interface Note { id: string; project: string; title: string; body: string; version: number }
const reader = defineSubjectContextAction("notes.subject.read", "note", "笔记", ["notes:read"]);
const mover = defineObjectMoveAction("notes.placement.move", ["note"], "笔记", ["notes:write"]);
const copier = defineObjectCopyAction("notes.placement.copy", ["note"], "笔记", ["notes:write"]);
const station = defineWorkflowContentActions({ id: "notes", title: "笔记", icon: "note", create: true, read_permissions: ["notes:read"], write_permissions: ["notes:write"] });
const homeReader = defineSubjectContextAction("clips.subject.read", "clip", "剪藏", ["notes:read"], "home");

function notesPlugin(actions: ActionService, notes: Map<string, Note>, projects: readonly string[]) {
  const copies = new Map<string, string>();
  const get = (id: string, project: string | null) => {
    const note = notes.get(id);
    if (!note || note.project !== project) throw new ActionError("notes.not_found", "笔记不存在");
    return note;
  };
  for (const project of projects) {
    actions.registerProvider({ provider: { provider_id: "notes", plugin_id: "notes", title: "笔记", kind: "plugin", project_id: project },
      definitions: [reader, mover, copier, ...Object.values(station)],
      handlers: [
        { ...reader, handle: (caller, input) => { const note = get((input as { subject_id: string }).subject_id, caller.project_id);
          return subjectContext({ subject: { kind: "note", id: note.id }, revision: String(note.version), title: note.title, content: note.body, goal_ids: [], session_id: null, open: { surface: "notes", id: note.id } }); } },
        bindObjectMoveHandler(mover, input => { const note = get(input.subject.id, input.from_project_id); note.project = input.to_project_id; note.version += 1;
          return { subject: input.subject, project_id: note.project, revision: String(note.version) }; }),
        bindObjectCopyHandler(copier, input => {
          const prior = copies.get(input.request_id);
          if (!prior) { const source = get(input.subject.id, input.from_project_id); const id = "copy-" + (copies.size + 1);
            notes.set(id, { ...source, id, project: input.to_project_id, version: 1 }); copies.set(input.request_id, id); }
          const id = copies.get(input.request_id)!;
          return { subject: { kind: "note", id }, project_id: input.to_project_id, revision: "1" };
        }),
        ...bindWorkflowContentHandlers(station, {
          list: caller => [...notes.values()].filter(note => note.project === caller.project_id).map(note => ({ item_id: note.id, title: note.title, caption: "", at: null })),
          read: ({ item_id }, caller) => { const note = get(item_id, caller.project_id); return { title: note.title, body: note.body }; },
          receive: ({ payload, context }, caller) => { const id = "received-" + context.instance_id; if (!notes.has(id)) notes.set(id, { id, project: caller.project_id!, title: payload.title, body: payload.body, version: 1 });
            return { plugin: "notes", item_id: id, title: payload.title }; },
          create: ({ title }, caller) => { const id = "new-" + (notes.size + 1); notes.set(id, { id, project: caller.project_id!, title, body: "", version: 1 }); return { plugin: "notes", item_id: id, title }; },
        }),
      ] });
  }
}

function ledgerDatabase(db: DatabaseSync): ContextLedgerDatabase {
  const run = <T>(operation: () => T): T => {
    if (db.isTransaction) return operation();
    db.exec("BEGIN IMMEDIATE");
    try { const value = operation(); db.exec("COMMIT"); return value; } catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  return { exec: sql => db.exec(sql), prepare: sql => db.prepare(sql) as never, transaction: <T>(operation: () => T) => Object.assign(() => run(operation), { immediate: () => run(operation) }) };
}

const owner = (project_id: string | null): ActionCallContext => ({ actor_id: "web-user", project_id, audience: "user", permissions: ["notes:read", "notes:write", "goals:read", "goals:write"] });

function fixture(projects = ["personal", "q4", "interview"]) {
  const actions = new ActionService();
  const notes = new Map<string, Note>();
  notesPlugin(actions, notes, projects);
  let clips = new Map<string, string>([["clip-1", "竞品定价表"]]);
  actions.registerProvider({ provider: { provider_id: "clips", plugin_id: "clips", title: "剪藏", kind: "plugin" }, definitions: [homeReader],
    handlers: [{ ...homeReader, handle: (_caller, input) => { const id = (input as { subject_id: string }).subject_id; const title = clips.get(id);
      if (!title) throw new ActionError("clips.not_found", "已删除"); return subjectContext({ subject: { kind: "clip", id }, revision: "1", title, content: title, goal_ids: [], session_id: null, open: { surface: "clips", id } }); } }] });
  const db = new DatabaseSync(":memory:");
  const ledger = createContextLedger(ledgerDatabase(db), { authorize: access => access.actor_id === PLACEMENT_LEDGER_ACCESS.actor_id });
  const titles = new Map<string, string>();
  const removed = new Set<string>();
  const service = new PlacementService({
    ledger,
    spaces: async () => projects.filter(id => !removed.has(id)).map(id => ({ project_id: id, title: id === "personal" ? "个人空间" : id === "q4" ? "Q4 新版发布" : "客户访谈计划", kind: id === "personal" ? "personal" as const : "project" as const })),
    scope: async projectId => { if (projectId && removed.has(projectId)) throw new ActionError("placement.project_missing", "找不到这个项目"); return { client: actions, caller: owner(projectId) }; },
    titles: { get: (kind, id) => titles.get(kind + ":" + id) ?? null, set: (kind, id, title) => { titles.set(kind + ":" + id, title); } },
  });
  return { actions, notes, service, removeProject: (id: string) => removed.add(id), deleteClip: (id: string) => { clips = new Map([...clips].filter(([key]) => key !== id)); } };
}

test("placement protocol: shipped plugins declare move and copy for the person only", () => {
  for (const manifest of [pagesManifest, pptManifest, formManifest, datasetManifest, lingguangManifest]) {
    assert.deepEqual(inspectActionDeclarations(manifest.actions!, undefined), [], manifest.plugin_id);
    const placement = manifest.actions!.filter(definition => definition.action.input_type?.startsWith("molis.placement."));
    assert.equal(placement.length, 2, manifest.plugin_id);
    for (const definition of placement) assert.deepEqual(definition.action.audiences, ["user"]);
  }
  // Letting an agent move things would change who can read them without the person deciding.
  assert.match(inspectActionDeclarations([{ ...mover, action: { ...mover.action, audiences: ["user", "agent"] } }], undefined).join(), /放置协议/);
  // Copies stay in partitions; only a mover may be Home-scoped (for plugins that keep their objects at Home).
  assert.match(inspectActionDeclarations([{ ...copier, action: { ...copier.action, scope: "home" } }], undefined).join(), /放置协议/);
});

test("describe says where an object is and who can see it; deleted and unreadable stay different", async () => {
  const f = fixture();
  f.notes.set("n1", { id: "n1", project: "personal", title: "上线前检查清单", body: "回滚预案", version: 1 });
  const personal = await f.service.describe({ kind: "note", id: "n1", project_id: "personal" });
  assert.equal(personal.state, "ok");
  assert.deepEqual([personal.location?.title, personal.location?.access], ["个人空间", "private"]);
  assert.deepEqual(personal.can, { move: true, copy: true, use_in_project: true });
  assert.deepEqual(personal.open, { project_id: "personal", surface: "notes", id: "n1" });
  const home = await f.service.describe({ kind: "clip", id: "clip-1", project_id: null });
  // Home-level plugins answer any project granted them, so their content is not “only you”.
  assert.deepEqual([home.location?.title, home.location?.access, home.location?.access_label], ["个人空间", "home", "只有你和获授权的助理"]);
  assert.equal(home.can.move, false, "Home-level content is always personal");
  f.notes.delete("n1");
  const gone = await f.service.describe({ kind: "note", id: "n1", project_id: "personal" });
  assert.deepEqual([gone.state, gone.reason, gone.title], ["missing", "原对象已删除", "上线前检查清单"]);
  f.removeProject("q4");
  const closed = await f.service.describe({ kind: "note", id: "n2", project_id: "q4" });
  assert.equal(closed.state, "missing");
  assert.equal(closed.reason, "所在的项目已删除");
});

test("using a personal object in two projects is a relation, not a copy; removing one relation and deleting the original are both honest", async () => {
  const f = fixture();
  const clip = { kind: "clip", id: "clip-1", project_id: null };
  const a = await f.service.link(clip, "q4");
  await f.service.link(clip, "interview");
  await f.service.link(clip, "q4"); // repeating records nothing new
  assert.deepEqual((await f.service.related("q4")).map(item => [item.title, item.state, item.location?.title]), [["竞品定价表", "ok", "个人空间"]]);
  const described = await f.service.describe(clip);
  assert.deepEqual(described.associations.filter(link => link.type === "used_in").map(link => link.label).sort(), ["用于 项目「Q4 新版发布」", "用于 项目「客户访谈计划」"]);
  await assert.rejects(f.service.link(clip, "personal"), /找不到这个项目/);
  assert.deepEqual(await f.service.unlink(a.key), { removed: true });
  assert.equal((await f.service.related("q4")).length, 0);
  assert.equal((await f.service.related("interview")).length, 1, "the other project still uses it");
  f.deleteClip("clip-1");
  assert.deepEqual((await f.service.related("interview")).map(item => [item.title, item.state, item.reason]), [["竞品定价表", "missing", "原对象已删除"]]);
  await assert.rejects(f.service.unlink(JSON.stringify(["somebody-elses", "x"])), /插件自己管理/);
});

test("moving keeps the identity: old references find the new place, relations stay, the relation into the new project folds away", async () => {
  const f = fixture();
  f.notes.set("n1", { id: "n1", project: "personal", title: "检查清单", body: "灰度 5%", version: 1 });
  const old = { kind: "note", id: "n1", project_id: "personal" };
  await f.service.link(old, "q4");
  await f.service.link(old, "interview");
  const moved = await f.service.move(old, "q4");
  assert.deepEqual(moved.object, { kind: "note", id: "n1", project_id: "q4" });
  assert.equal(moved.location.title, "项目「Q4 新版发布」");
  assert.equal(f.notes.get("n1")!.project, "q4", "the owner moved its own row");
  const after = await f.service.describe(old);
  assert.equal(after.state, "ok");
  assert.equal(after.moved_from?.title, "个人空间");
  assert.deepEqual(after.associations.filter(link => link.type === "used_in").map(link => link.label), ["用于 项目「客户访谈计划」"]);
  assert.deepEqual(f.service.locate(old), { object: { kind: "note", id: "n1", project_id: "q4" }, moved: true });
  assert.deepEqual((await f.service.related("interview")).map(item => item.location?.title), ["项目「Q4 新版发布」"]);
  await assert.rejects(f.service.move(old, "q4"), /已经在这个位置/);
  await assert.rejects(f.service.move({ kind: "clip", id: "clip-1", project_id: null }, "q4"), /只放在个人空间/);
});

test("copying makes an independent object that remembers where it came from; converting records its source both ways", async () => {
  const f = fixture();
  f.notes.set("n1", { id: "n1", project: "q4", title: "访谈提纲", body: "问题一\n问题二", version: 1 });
  const source = { kind: "note", id: "n1", project_id: "q4" };
  const copy = await f.service.copy(source, "personal", "req-1");
  const again = await f.service.copy(source, "personal", "req-1");
  assert.deepEqual(again.object, copy.object, "the same request returns the same copy");
  const copied = await f.service.describe(copy.object);
  assert.deepEqual(copied.associations.map(link => link.label), ["复制自《访谈提纲》 · 项目「Q4 新版发布」"]);
  f.notes.get(copy.object.id)!.title = "访谈提纲（我的版本）";
  assert.equal(f.notes.get("n1")!.title, "访谈提纲", "the original is untouched");
  const converted = await f.service.convert({ source, to: { station: "notes" }, to_project_id: "q4", request_id: "c-1", payload: { title: "访谈要点", body: "要点" } });
  assert.equal(converted.object.kind, "note");
  assert.equal(converted.location.title, "项目「Q4 新版发布」");
  const from = await f.service.describe(converted.object);
  assert.ok(from.associations.some(link => link.type === "derived_from" && link.label === "来自《访谈提纲》 · 笔记 · 项目「Q4 新版发布」"));
  const into = await f.service.describe(source);
  // A conversion names what the other end is, so a document and a Goal made from one note read apart.
  assert.ok(into.associations.some(link => link.type === "derived_into" && link.label === "已转成《访谈要点》 · 笔记 · 项目「Q4 新版发布」"));
  const made = await f.service.create({ station: "notes", project_id: "personal", title: "空白笔记", request_id: "r" });
  assert.deepEqual([made.object.project_id, made.location.title, made.goal_key], ["personal", "个人空间", null]);
});

test("Goals keeps a Goal's materials: bind once, list both ways, release keeps history", () => {
  const records: import("@molis-ai/molis-work-contracts/modules/goals").GoalInputBindingRecord[] = [];
  const inputs = { list: () => records, register: (record: typeof records[number]) => { records.push(record); },
    deactivate: (_board: string, id: string) => { const row = records.find(item => item.binding_id === id); if (!row || row.state === "inactive") return false; (row as { state: string }).state = "inactive"; return true; } };
  const handlers = new Map(createGoalsInputActionHandlers("b", inputs, id => id === "g1").map(handler => [handler.capability_id, handler]));
  const caller = { ...owner("q4"), actor_id: "web-user" } as never;
  const bound = handlers.get(goalsInputActions.bind.capability_id)!.handle(caller, { goal_id: "g1", subject: { kind: "presentation", id: "d1" }, title: "Q4 发布评审" }) as { binding: { binding_id: string }; replayed: boolean };
  assert.equal(bound.replayed, false);
  const repeat = handlers.get(goalsInputActions.bind.capability_id)!.handle(caller, { goal_id: "g1", subject: { kind: "presentation", id: "d1" }, title: "Q4 发布评审" }) as { replayed: boolean };
  assert.equal(repeat.replayed, true);
  assert.throws(() => handlers.get(goalsInputActions.bind.capability_id)!.handle(caller, { goal_id: "missing", subject: { kind: "presentation", id: "d1" }, title: "x" }), /找不到这个目标/);
  const listed = handlers.get(goalsInputActions.list.capability_id)!.handle(caller, { subject: { kind: "presentation", id: "d1" } }) as { bindings: unknown[] };
  assert.equal(listed.bindings.length, 1);
  assert.deepEqual(handlers.get(goalsInputActions.release.capability_id)!.handle(caller, { goal_id: "g1", binding_id: bound.binding.binding_id }), { released: true });
  assert.equal((handlers.get(goalsInputActions.list.capability_id)!.handle(caller, {}) as { bindings: unknown[] }).bindings.length, 0);
  assert.equal(records.length, 1, "the receipt stays as history");
});

test("an object keeps showing the Goals it serves after it moves out of their project, and a Home item shows its Goal too", async () => {
  const f = fixture();
  const goalReader = defineSubjectContextAction("goals.subject.read", "goal", "目标", ["goals:read"]);
  const records = new Map<string, import("@molis-ai/molis-work-contracts/modules/goals").GoalInputBindingRecord[]>();
  for (const project of ["personal", "q4"]) {
    const rows: import("@molis-ai/molis-work-contracts/modules/goals").GoalInputBindingRecord[] = [];
    records.set(project, rows);
    const inputs = { list: () => rows, register: (record: typeof rows[number]) => { rows.push(record); },
      deactivate: (_board: string, id: string) => { const row = rows.find(item => item.binding_id === id); if (!row || row.state === "inactive") return false; (row as { state: string }).state = "inactive"; return true; } };
    f.actions.registerProvider({ provider: { provider_id: "goals", plugin_id: "goals", title: "Goals", kind: "plugin", project_id: project },
      definitions: [...Object.values(goalsInputActions), goalReader],
      handlers: [...createGoalsInputActionHandlers(project, inputs, id => id === project + "-goal"),
        { ...goalReader, handle: (_caller, input) => { const id = (input as { subject_id: string }).subject_id;
          if (id !== project + "-goal") throw new ActionError("goals.not_found", "目标不存在");
          return subjectContext({ subject: { kind: "goal", id }, revision: "1", title: project === "q4" ? "Q4 发布评审" : "整理访谈", content: "", goal_ids: [id], session_id: null, open: { surface: "goals", id } }); } }] });
  }
  f.notes.set("n1", { id: "n1", project: "q4", title: "发布说明", body: "", version: 1 });
  await f.service.bindGoal({ kind: "note", id: "n1", project_id: "q4" }, "q4", "q4-goal");
  await f.service.bindGoal({ kind: "note", id: "n1", project_id: "q4" }, "personal", "personal-goal");
  await f.service.move({ kind: "note", id: "n1", project_id: "q4" }, "personal");
  const moved = await f.service.describe({ kind: "note", id: "n1", project_id: "q4" });
  const goals = moved.associations.filter(item => item.type === "goal");
  assert.deepEqual(goals.map(item => item.label).sort(), ["Goal「Q4 发布评审」 · 项目「Q4 新版发布」", "Goal「整理访谈」"]);
  assert.ok(goals.every(item => item.removable));
  // A Home item (like a Shelf file) is never in a project, yet the Goal it serves is still shown on it.
  await f.service.bindGoal({ kind: "clip", id: "clip-1", project_id: null }, "q4", "q4-goal");
  const clip = await f.service.describe({ kind: "clip", id: "clip-1", project_id: null });
  assert.deepEqual(clip.associations.map(item => item.type).sort(), ["goal", "used_in"]);
  // Releasing from the object side releases in the Goal's own project.
  const q4 = goals.find(item => item.label.includes("Q4"))!;
  assert.deepEqual(await f.service.unlink(q4.key!), { removed: true });
  const after = await f.service.describe({ kind: "note", id: "n1", project_id: "personal" });
  assert.deepEqual(after.associations.filter(item => item.type === "goal").map(item => item.label), ["Goal「整理访谈」"]);
  // A Goal is not a Goal's material of itself.
  const goal = await f.service.describe({ kind: "goal", id: "q4-goal", project_id: "q4" });
  assert.deepEqual([goal.state, goal.associations.filter(item => item.type === "goal").length, goal.open?.surface], ["ok", 0, "goals"]);
});

test("the Goals page shows a newly bound material without waiting for the next journal event", async () => {
  const { cachedMolisWorkWebView } = await import("../apps/local-host/src/web-view.js");
  const binding = { binding_id: "b1", goal_id: "g1", input_name: "发布说明", source_type: "plugin_object", source_ref: '["pages_document","d1"]',
    snapshot_digest: null, state: "confirmed", reason: "", created_by: "web-user", created_at: "2026-09-28T00:00:00.000Z" };
  let bindings: typeof binding[] = [];
  const collection = () => ({ snapshot: { cursor: 7, board: { board_id: "b", title: "B", active_goal_id: null } }, active_goal_id: null, goals: [], archived_goals: [], trashed_goals: [],
    counts: {}, coverage: [], input_bindings: bindings, policy_bindings: [], events: [] });
  const actions = { discover: async () => [], invoke: async (definition: { capability_id: string }) => {
    if (definition.capability_id === "goals.collection.read") return collection();
    throw new ActionError("actions.not_found", "not here");
  } } as never;
  const cache = new Map();
  const options = { databasePath: "/tmp/placement-cache.db", boardId: "b" } as never;
  assert.equal((await cachedMolisWorkWebView(cache as never, {} as never, options, actions)).input_bindings.length, 0);
  bindings = [binding];
  // Same journal cursor: binding a material writes no Goal event.
  assert.equal((await cachedMolisWorkWebView(cache as never, {} as never, options, actions)).input_bindings.length, 1);
});

test("plugin stores move with the same id, copy independently and receive handed-over content once", async t => {
  const home = await mkdtemp(join(tmpdir(), "work-placement-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const pages = openPagesStore(home);
  const page = pages.create({ project_id: "personal", title: "上线前检查清单" });
  const moved = pages.relocate(page.id, "personal", "q4");
  // A move is not an edit: same id, same version and time, so work that recorded this version still matches.
  assert.deepEqual([moved.id, moved.project_id, moved.version, moved.updated_at], [page.id, "q4", page.version, page.updated_at]);
  assert.throws(() => pages.get(page.id, "personal"), /找不到/);
  const pageCopy = pages.duplicate(page.id, "q4", "personal", "r1");
  assert.equal(pages.duplicate(page.id, "q4", "personal", "r1").id, pageCopy.id);
  assert.notEqual(pageCopy.id, page.id);
  pages.close();

  const ppt = openPptStore(home);
  const deck = ppt.create({ project_id: "personal", title: "评审" });
  const movedDeck = ppt.relocate(deck.id, "personal", "q4");
  assert.deepEqual([movedDeck.project_id, movedDeck.version], ["q4", deck.version]);
  const deckCopy = ppt.duplicate(deck.id, "q4", "personal", "c1");
  assert.equal(ppt.duplicate(deck.id, "q4", "personal", "c1").id, deckCopy.id);
  const outline = slidesFromMarkdown("# Q4 新版发布评审\n\n## 做成了什么\n- 计费重构\n- 团队空间 Beta\n> 数字来自周报\n\n## 风险\n- 价格变化", "备用标题");
  assert.equal(outline.title, "Q4 新版发布评审");
  assert.deepEqual(outline.slides.map(slide => [slide.title, slide.bullets, slide.notes]), [["做成了什么", ["计费重构", "团队空间 Beta"], "数字来自周报"], ["风险", ["价格变化"], ""]]);
  const received = ppt.receive("q4", "delivery-1", outline.title, outline.slides);
  assert.equal(ppt.receive("q4", "delivery-1", outline.title, outline.slides).id, received.id, "one delivery makes one deck");
  ppt.close();

  const datasets = openDatasetStore(home);
  const table = datasets.receiveCsv("personal", "d-1", "答卷", "提交时间,整体满意度\n2026-09-28,4\n2026-09-28,5");
  assert.deepEqual([table.columns.length, table.rows.length], [2, 2]);
  assert.equal(datasets.receiveCsv("personal", "d-1", "答卷", "x").id, table.id);
  const movedTable = datasets.relocate(table.id, "personal", "q4");
  assert.deepEqual([movedTable.project_id, movedTable.version], ["q4", table.version]);
  datasets.close();

  const sparks = openLingguangStore(home);
  const alone = sparks.create({ project_id: "q4", title: "把发布说明做成演示" });
  const shared = sparks.create({ project_id: "q4", title: "另一个想法" });
  sparks.openConversation([alone.id, shared.id], "q4");
  assert.throws(() => sparks.relocate(alone.id, "q4", "personal"), /同一场头脑风暴/);
  const single = sparks.create({ project_id: "q4", title: "独自一条" });
  sparks.openConversation([single.id], "q4");
  const beforeMove = sparks.get(single.id, "q4");
  const movedSpark = sparks.relocate(single.id, "q4", "personal");
  assert.deepEqual([movedSpark.project_id, movedSpark.updated_at], ["personal", beforeMove.updated_at], "a spark keeps its time: its revision is its content");
  sparks.close();
});

test("a plugin that keeps its objects at Home moves them through its own Home-scoped mover", async () => {
  // A home mover is allowed; a home copier is not (copies stay in partitions).
  const homeMover = defineObjectMoveAction("todos.placement.move", ["todo_item"], "待办", ["notes:write"], "home");
  assert.deepEqual(inspectActionDeclarations([homeMover], undefined), []);
  assert.match(inspectActionDeclarations([{ ...copier, action: { ...copier.action, scope: "home" } }], undefined).join(), /放置协议/);
  const f = fixture();
  const todoReader = defineSubjectContextAction("todos.subject.read", "todo_item", "待办", ["notes:read"], "home");
  const todos = new Map([["t1", { title: "发布后回访五位用户", belongs: "personal" }]]);
  const calls: string[] = [];
  f.actions.registerProvider({ provider: { provider_id: "todos", plugin_id: "todos", title: "待办", kind: "plugin" }, definitions: [todoReader, homeMover],
    // Like Todo: a project's todos are not visible from outside that project.
    handlers: [{ ...todoReader, handle: (caller, input) => { const id = (input as { subject_id: string }).subject_id; const todo = todos.get(id);
      if (!todo || todo.belongs !== "personal" && caller.project_id !== todo.belongs) throw new ActionError("todos.not_found", "待办不存在");
      return subjectContext({ subject: { kind: "todo_item", id }, revision: todo.belongs, title: todo.title, content: "", goal_ids: [], session_id: null, open: { surface: "todo", id },
        project_id: todo.belongs === "personal" ? null : todo.belongs }); } },
      bindHomeObjectMoveHandler(homeMover, (input, caller) => { const found = todos.get(input.subject.id)!;
        if (found.belongs !== "personal" && caller.project_id !== found.belongs) throw new ActionError("todos.not_found", "待办不存在");
        calls.push(input.to_project_id); found.belongs = input.to_project_id;
        return { subject: input.subject, project_id: input.to_project_id, revision: input.to_project_id }; })] });
  const todo = { kind: "todo_item", id: "t1", project_id: null };
  const before = await f.service.describe(todo);
  assert.deepEqual([before.location?.title, before.can.move, before.can.copy], ["个人空间", true, false]);
  await f.service.link(todo, "q4");
  const moved = await f.service.move(todo, "q4");
  assert.deepEqual(calls, ["q4"], "the plugin changes where it belongs; the object stays at Home");
  assert.deepEqual([moved.object.project_id, moved.location.title, moved.location.access], [null, "项目「Q4 新版发布」", "home"]);
  const after = await f.service.describe(todo);
  assert.deepEqual(after.associations.filter(item => item.type === "used_in"), [], "used in the project it now belongs to says nothing more");
  // Its reader says where it belongs now; where it was is remembered.
  assert.deepEqual([after.location?.title, after.location?.access, after.moved_from?.title], ["项目「Q4 新版发布」", "home", "个人空间"]);
  assert.deepEqual(moved.open, { project_id: "q4", surface: "todo", id: "t1" }, "opened in the project it now belongs to");
  await assert.rejects(f.service.move(todo, "q4"), { code: "placement.same_location" });
  await assert.rejects(f.service.link(todo, "q4"), { code: "placement.already_here" });
  // Read and moved again from where it belongs now, although the plugin hides it outside that project.
  assert.equal(after.state, "ok");
  const back = await f.service.move(todo, "personal");
  assert.deepEqual([calls.at(-1), back.location.title, (await f.service.describe(todo)).moved_from?.title], ["personal", "个人空间", "项目「Q4 新版发布」"]);
  // Home content without a mover (a clip) still cannot be moved.
  await assert.rejects(f.service.move({ kind: "clip", id: "clip-1", project_id: null }, "q4"), { code: "placement.not_movable" });
});

test("the person finds what is in their personal space from any project; a project's agents do not", async t => {
  const home = await mkdtemp(join(tmpdir(), "placement-search-"));
  const index = openTextSearchIndex({ homeDirectory: home });
  const actions = new ActionService();
  const entries = defineSearchEntriesAction("notes.search.entries", [{ kind: "note", title: "笔记", surface: "notes" }], "笔记", ["notes:read"]);
  const notes = new Map([["n-personal", { project: "personal", title: "上线前检查清单", body: "回滚预案与值班表" }], ["n-q4", { project: "q4", title: "发布说明", body: "新版亮点" }]]);
  for (const project of ["personal", "q4"]) {
    actions.registerProvider({ provider: { provider_id: "notes", plugin_id: "notes", title: "笔记", kind: "plugin", project_id: project }, definitions: [entries, reader],
      handlers: [bindSearchEntriesHandler(entries, () => [...notes].filter(([, note]) => note.project === project).map(([id, note]) => ({ subject: { kind: "note", id }, revision: "1",
        title: note.title, summary: "", updated_at: null, content: "context" as const, open: { surface: "notes", id } }))),
        { ...reader, handle: (_caller, input) => { const id = (input as { subject_id: string }).subject_id; const note = notes.get(id);
          if (!note || note.project !== project) throw new ActionError("notes.not_found", "笔记不存在");
          return subjectContext({ subject: { kind: "note", id }, revision: "1", title: note.title, content: note.body, goal_ids: [], session_id: null, open: { surface: "notes", id } }); } }] });
  }
  const search = new SearchService({ index, budgetMs: 5_000, personalSpace: "personal", indexer: async project_id => ({ client: actions, caller: owner(project_id) }) });
  t.after(async () => { await search.close(); index.close(); await rm(home, { recursive: true, force: true }); });
  const person = { client: actions, caller: { ...owner("q4"), permissions: [...owner("q4").permissions, "search:read"] } };
  const found = await search.query(person, { query: "回滚预案", scope: "personal" });
  assert.deepEqual(found.hits.map(hit => [hit.title, hit.project_id]), [["上线前检查清单", "personal"]]);
  assert.deepEqual((await search.query(person, { query: "回滚预案", scope: "project" })).hits, [], "not part of this project");
  const opened = await search.open(person, { hit_id: found.hits[0]!.hit_id });
  assert.deepEqual([opened.state, opened.state === "ok" ? opened.open : null], ["ok", { surface: "notes", id: "n-personal" }]);
  // An agent working in the project stays inside it: the personal space is only you.
  const agent = { client: actions, caller: { ...person.caller, actor_id: "agent:q4", audience: "agent" as const } };
  assert.deepEqual((await search.query(agent, { query: "回滚预案" })).hits, []);
  assert.equal((await search.open(agent, { hit_id: found.hits[0]!.hit_id })).state, "unavailable");
  // Inside the personal space, its content is simply personal.
  const inside = { client: actions, caller: { ...person.caller, project_id: "personal" } };
  assert.deepEqual((await search.query(inside, { query: "回滚预案", scope: "personal" })).hits.map(hit => hit.title), ["上线前检查清单"]);
});

test("a CSV that a spreadsheet (or our own export) saved with a byte-order mark keeps its first column name", () => {
  assert.deepEqual(parseCsv("\ufeff名称,数量\r\n苹果,3\r\n").columns.map(column => column.name), ["名称", "数量"]);
});

test("a deck exports as a real PowerPoint package: one slide part per page, notes, colours, escaped text", () => {
  const bytes = buildPptx({ title: "Q4 <评审> & 决定", description: "", color_primary: "#5e6ad2", color_background: "#fcfcfb", color_text: "#292a2e", updated_at: "2026-09-28T12:00:00.000Z",
    slides: [{ id: "a", title: "做成了什么", bullets: ["计费重构 & 对账", "<移动端>"], notes: "数字来自周报", order: 1 }, { id: "b", title: "", bullets: [], notes: "", order: 2 }] });
  const files = unzipSync(bytes);
  const names = Object.keys(files);
  assert.equal(names[0], "[Content_Types].xml", "Office expects the content types first");
  assert.deepEqual(names.filter(name => /^ppt\/slides\/slide\d+\.xml$/u.test(name)).sort(), ["ppt/slides/slide1.xml", "ppt/slides/slide2.xml"]);
  const slide = strFromU8(files["ppt/slides/slide1.xml"]!);
  assert.match(slide, /计费重构 &amp; 对账/);
  assert.match(slide, /&lt;移动端&gt;/);
  assert.match(slide, /srgbClr val="5E6AD2"/);
  assert.match(strFromU8(files["ppt/notesSlides/notesSlide1.xml"]!), /数字来自周报/);
  assert.match(strFromU8(files["docProps/core.xml"]!), /Q4 &lt;评审&gt; &amp; 决定/);
  assert.deepEqual(buildPptx({ title: "t", description: "", color_primary: "#000000", color_background: "#ffffff", color_text: "#000000", updated_at: "2026-09-28T12:00:00.000Z", slides: [{ id: "a", title: "x", bullets: [], notes: "", order: 1 }] }),
    buildPptx({ title: "t", description: "", color_primary: "#000000", color_background: "#ffffff", color_text: "#000000", updated_at: "2026-09-28T12:00:00.000Z", slides: [{ id: "a", title: "x", bullets: [], notes: "", order: 1 }] }), "the same deck gives the same bytes");
});

test("a form collects on this computer and through answer files, honestly", async t => {
  const home = await mkdtemp(join(tmpdir(), "work-placement-form-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const forms = openFormStore(home);
  let form = forms.create({ project_id: "personal", title: "Beta </script> 满意度" });
  form = forms.update(form.id, { questions: questionsFromText("1. 最常用的功能\n- 最希望改进的地方"), expected_version: form.version }, "personal");
  assert.deepEqual(form.questions.map(question => question.title), ["最常用的功能", "最希望改进的地方"]);
  const [q1, q2] = form.questions;
  assert.throws(() => forms.submit(form.id, { [q1!.id]: "团队空间" }, "personal", { source: "fill" }), /还没有开始收集/);
  form = forms.publish(form.id, "personal", form.version);
  forms.submit(form.id, { [q1!.id]: "团队空间", [q2!.id]: "权限分级" }, "personal", { source: "fill", requestId: "fill-1" });
  const answer = (answerId: string, value: string) => JSON.stringify({ format: FORM_ANSWER_FORMAT, form_id: form.id, form_version: form.version, answer_id: answerId,
    submitted_at: "2026-09-29T05:01:13.389Z", questions: form.questions, answers: { [q1!.id]: value, [q2!.id]: "" } });
  const result = forms.importAnswers(form.id, [{ name: "王敏.json", content: answer("80286b63-0b52-4a4b-94c6-3f36410fbdbb", "移动端") },
    { name: "王敏(1).json", content: answer("80286b63-0b52-4a4b-94c6-3f36410fbdbb", "移动端") },
    { name: "别的问卷.json", content: answer("11111111-2222-3333-4444-555555555555", "x").replace(form.id, "another-form") },
    { name: "坏文件.json", content: "not json" }], "personal");
  assert.deepEqual([result.imported, result.skipped], [1, 1]);
  assert.deepEqual(result.rejected.map(item => item.reason), ["这份答卷属于另一份问卷", "文件内容无法读取"]);
  form = forms.closeCollection(form.id, "personal", form.version);
  assert.equal(form.status, "closed");
  assert.throws(() => forms.submit(form.id, { [q1!.id]: "团队空间" }, "personal", { source: "fill" }), /已停止收集/);
  const submissions = forms.listSubmissions(form.id, "personal");
  assert.deepEqual(submissions.map(item => item.source).sort(), ["file", "fill"]);
  const csv = formResultsCsv(form, submissions);
  assert.ok(csv.startsWith("﻿提交时间,来源,最常用的功能,最希望改进的地方"));
  assert.match(csv, /答卷文件,移动端/);
  const page = formFillPageHtml(form);
  assert.ok(!page.includes("Beta </script> 满意度\","), "the title cannot end the data script");
  assert.match(page, /\\u003c\/script>/u);
  assert.match(page, /这个页面不会上传任何内容/);
  const formBefore = forms.get(form.id, "personal");
  const moved = forms.relocate(form.id, "personal", "q4");
  assert.equal(moved.version, formBefore.version, "a move is not an edit");
  assert.equal(forms.listSubmissions(moved.id, "q4").length, 2, "answers go with the form");
  forms.close();
});
