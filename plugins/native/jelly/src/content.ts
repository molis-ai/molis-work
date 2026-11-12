import { createHash, randomUUID } from "node:crypto";
import type { JellyBlock, JellyCommand, JellyItem, JellyNote, JellyPlan, JellyRelation, JellyWorkspace } from "./contract.js";
import { makeJellyItem, jellyOccurrences, jellySchedulesOverlap } from "./calendar.js";
import { jellyAssert, jellyErrors } from "./error.js";
import { validateJellySchedule, validateJellyWorkspace } from "./calendar-validation.js";
import { jellyMarkdownToBlocks, jellyHtmlToBlocks } from "./markdown.js";
import { validateJellyContent } from "./content-validation.js";
import { JellyWorkspaceEdit } from "./workspace-edit.js";
export { validateJellyContent } from "./content-validation.js";

export const jellyHash = (value: string): string => createHash("sha256").update(value).digest("hex");
export function jellySourceHash(state: JellyWorkspace, sourceType: "note" | "text", sourceId: string | null, sourceText = ""): string {
  if (sourceType === "note") return jellyHash(JSON.stringify(noteById(state, sourceId).blocks));
  return jellyHash(sourceText);
}
function noteById(state: JellyWorkspace, id: unknown): JellyNote { const n = state.notes.find(n => n.id === id); jellyAssert(n, "笔记不存在", jellyErrors.not_found); return n; }
function record(value: unknown): Record<string, unknown> { jellyAssert(value && typeof value === "object" && !Array.isArray(value), "命令内容必须是对象"); return value as Record<string, unknown>; }
function string(value: unknown, fallback = ""): string { if (value == null) return fallback; jellyAssert(typeof value === "string", "内容必须是文本"); return value; }
function category(state: JellyWorkspace, id: unknown): string { const result = id === undefined ? "uncategorized" : string(id); jellyAssert(state.categories.some(c => c.id === result), "分类不存在"); return result; }
function priorityOf(value: unknown, fallback: JellyItem["priority"] = "none"): JellyItem["priority"] {
  if (value === undefined || value === null) return fallback;
  if (value === "P0" || value === "P1" || value === "P2" || value === "none") return value;
  jellyAssert(false, "优先级无效");
}
function touch(note: JellyNote, now: string, edit: JellyWorkspaceEdit): void {
  note.updated_at = now;
  note.revision++;
  edit.notes.add(note);
}
function blocks(value: unknown): JellyBlock[] {
  jellyAssert(Array.isArray(value), "区块必须是数组");
  return value.map(v => { const b = record(v); return { ...b, id: string(b.id) || randomUUID(), kind: b.kind ?? "paragraph", text: string(b.text), indent: b.indent ?? 0, completed_at: b.completed_at ?? null, completion_description: string(b.completion_description) } as JellyBlock; });
}
function createNote(state: JellyWorkspace, input: Record<string, unknown>, now: string, edit: JellyWorkspaceEdit): JellyNote {
  const note: JellyNote = { id: input.id === undefined ? randomUUID() : string(input.id), title: string(input.title, "新笔记"), category_id: category(state, input.category_id), blocks: input.blocks ? blocks(input.blocks) : input.html !== undefined ? jellyHtmlToBlocks(string(input.html)) : jellyMarkdownToBlocks(string(input.markdown), [], now), pinned: false, archived_at: null, revision: 0, created_at: now, updated_at: now };
  state.notes.push(note);
  edit.notes.add(note);
  return note;
}
function taskBlock(state: JellyWorkspace, command: JellyCommand): { note: JellyNote; block: JellyBlock } {
  const note = noteById(state, command.note_id), block = note.blocks.find(b => b.id === command.block_id); jellyAssert(block?.kind === "task", "任务区块不存在"); jellyAssert(!note.archived_at, "请先恢复笔记"); return { note, block };
}
function synchronizeNoteTasks(state: JellyWorkspace, note: JellyNote, now: string, edit: JellyWorkspaceEdit): void {
  for (const link of state.task_links.filter(l => l.note_id === note.id)) {
    const block = note.blocks.find(b => b.id === link.block_id); jellyAssert(block?.kind === "task", "先取消该任务的日历关联，再删除或转换任务区块", jellyErrors.linked_task);
    const item = state.items.find(i => i.id === link.item_id)!; jellyAssert(block.text.trim(), "已排期任务的标题不能为空"); item.title = block.text.trim(); item.completed_at = block.completed_at; item.completion_description = block.completion_description; item.updated_at = now;
    edit.items.add(item);
  }
}
function scheduleTask(state: JellyWorkspace, command: JellyCommand, now: string, edit: JellyWorkspaceEdit): void {
  const { note, block } = taskBlock(state, command), schedule = record(command.schedule);
  const link = state.task_links.find(l => l.note_id === note.id && l.block_id === block.id);
  if (link) {
    const item = state.items.find(i => i.id === link.item_id)!;
    Object.assign(item, schedule, { title: block.text.trim(), category_id: category(state, command.category_id ?? item.category_id), priority: priorityOf(command.priority, item.priority), updated_at: now });
    edit.items.add(item);
    if (item.id !== link.item_id) edit.relations = true;
  } else {
    const item = makeJellyItem({ ...schedule, title: block.text.trim(), category_id: category(state, command.category_id ?? note.category_id), priority: priorityOf(command.priority), completed_at: block.completed_at, completion_description: block.completion_description }, now);
    state.items.push(item);
    state.task_links.push({ item_id: item.id, note_id: note.id, block_id: block.id });
    state.relations.push({ owner_id: item.id, original_date: null, note_id: note.id, role: "primary" });
    edit.items.add(item);
    edit.relations = true;
  }
  edit.taskLinks = true;
}
function relation(state: JellyWorkspace, command: JellyCommand, edit: JellyWorkspaceEdit): void {
  edit.relations = true;
  const ownerId = string(command.owner_id), date = command.original_date == null ? null : string(command.original_date), note = noteById(state, command.note_id), role = command.role ?? "reference";
  jellyAssert(role === "primary" || role === "reference", "关联角色无效");
  jellyAssert(state.items.some(i => i.id === ownerId) || state.series.some(s => s.id === ownerId), "事项不存在");
  if (date !== null) {
    jellyAssert(state.series.some(s => s.id === ownerId), "只有重复事项可以指定实例日期");
    jellyAssert(jellyOccurrences(state, date, date).some(o => o.series_id === ownerId && o.original_date === date) || state.series.some(s => s.id === ownerId && !!s.exceptions[date]), "重复实例不存在");
    const overrides = state.relation_overrides ??= [];
    let override = overrides.find(o => o.owner_id === ownerId && o.original_date === date);
    if (!override) { override = { owner_id: ownerId, original_date: date, primary: "inherit", added_reference_ids: [], removed_reference_ids: [] }; overrides.push(override); }
    const baseline = state.relations.find(r => r.owner_id === ownerId && r.original_date === null && r.role === "primary")?.note_id;
    if (command.type === "relation.attach") {
      if (role === "primary") { override.primary = note.id; override.added_reference_ids = override.added_reference_ids.filter(id => id !== note.id); }
      else { jellyAssert((override.primary === "inherit" ? baseline : override.primary) !== note.id, "主笔记不能重复作为参考笔记"); if (!override.added_reference_ids.includes(note.id)) override.added_reference_ids.push(note.id); override.removed_reference_ids = override.removed_reference_ids.filter(id => id !== note.id); }
    } else {
      if ((override.primary === "inherit" ? baseline : override.primary) === note.id && (!command.role || role === "primary")) override.primary = "clear";
      override.added_reference_ids = override.added_reference_ids.filter(id => id !== note.id);
      if (!override.removed_reference_ids.includes(note.id)) override.removed_reference_ids.push(note.id);
    }
    return;
  }
  const same = (r: JellyRelation) => r.owner_id === ownerId && r.original_date === date;
  if (command.type === "relation.detach") { state.relations = state.relations.filter(r => !(same(r) && r.note_id === note.id && (!command.role || r.role === role))); return; }
  if (role === "primary") state.relations = state.relations.filter(r => !(same(r) && (r.role === "primary" || r.note_id === note.id)));
  else jellyAssert(!state.relations.some(r => same(r) && r.role === "primary" && r.note_id === note.id), "主笔记不能重复作为参考笔记");
  if (!state.relations.some(r => same(r) && r.note_id === note.id && r.role === role)) state.relations.push({ owner_id: ownerId, original_date: date, note_id: note.id, role });
}
/** As for calendar commands, publish only after the command has succeeded. */
export function applyJellyContentCommand(state: JellyWorkspace, command: JellyCommand, now: string): boolean {
  const next = structuredClone(state);
  if (!editJellyContentCommand(next, command, now, new JellyWorkspaceEdit())) return false;
  validateJellyWorkspace(next);
  validateJellyContent(next);
  Object.assign(state, next);
  return true;
}

/** Apply to a store-owned working state. The caller checks the edit before publishing it. */
export function editJellyContentCommand(state: JellyWorkspace, command: JellyCommand, now: string, edit: JellyWorkspaceEdit): boolean {
  switch (command.type) {
    case "note.create": createNote(state, command, now, edit); return true;
    case "note.import": {
      const note = noteById(state, command.id);
      jellyAssert(command.expected_note_revision === undefined || command.expected_note_revision === note.revision, "笔记已在其他窗口修改，请重新载入", jellyErrors.conflict);
      const previous = command.mode === "replace" ? note.blocks : [];
      const imported = command.format === "markdown" ? jellyMarkdownToBlocks(string(command.source), previous, now) : jellyHtmlToBlocks(string(command.source), previous);
      note.blocks = command.mode === "append" ? [...note.blocks, ...imported] : imported;
      synchronizeNoteTasks(state, note, now, edit); touch(note, now, edit); return true;
    }
    case "note.update": {
      const note = noteById(state, command.id), patch = record(command.patch);
      jellyAssert(command.expected_note_revision === undefined || command.expected_note_revision === note.revision, "笔记已在其他窗口修改，请重新载入", jellyErrors.conflict);
      if (patch.title !== undefined) note.title = string(patch.title);
      if (patch.category_id !== undefined) note.category_id = category(state, patch.category_id);
      if (patch.pinned !== undefined) { jellyAssert(typeof patch.pinned === "boolean", "置顶值无效"); note.pinned = patch.pinned; }
      if (patch.blocks !== undefined) note.blocks = blocks(patch.blocks);
      else if (patch.markdown !== undefined) note.blocks = jellyMarkdownToBlocks(string(patch.markdown), note.blocks, now);
      else if (patch.html !== undefined) note.blocks = jellyHtmlToBlocks(string(patch.html), note.blocks);
      synchronizeNoteTasks(state, note, now, edit); touch(note, now, edit); return true;
    }
    case "note.archive": case "note.restore": case "note.pin": { const n = noteById(state, command.id); if (command.type === "note.pin") { jellyAssert(command.pinned === undefined || typeof command.pinned === "boolean", "置顶值无效"); n.pinned = command.pinned === undefined ? !n.pinned : command.pinned; } else n.archived_at = command.type === "note.archive" ? now : null; touch(n, now, edit); return true; }
    case "note.delete": {
      const n = noteById(state, command.id); jellyAssert(n.archived_at, "请先归档，再永久删除笔记");
      state.notes = state.notes.filter(x => x.id !== n.id); state.relations = state.relations.filter(r => r.note_id !== n.id); state.task_links = state.task_links.filter(l => l.note_id !== n.id);
      for (const o of state.relation_overrides ?? []) { if (o.primary === n.id) o.primary = "clear"; o.added_reference_ids = o.added_reference_ids.filter(id => id !== n.id); o.removed_reference_ids = o.removed_reference_ids.filter(id => id !== n.id); }
      return true;
    }
    case "relation.attach": case "relation.detach": relation(state, command, edit); return true;
    case "relation.reset": {
      const owner = string(command.owner_id), date = string(command.original_date);
      jellyAssert(date && state.series.some(series => series.id === owner), "请指定重复事项及实例日期");
      state.relation_overrides = (state.relation_overrides ?? []).filter(override => !(override.owner_id === owner && override.original_date === date));
      state.relations = state.relations.filter(entry => !(entry.owner_id === owner && entry.original_date === date)); return true;
    }
    case "item.notes_to_note": {
      const ownerId = string(command.owner_id), date = command.original_date == null ? null : string(command.original_date);
      const item = state.items.find(item => item.id === ownerId), series = state.series.find(series => series.id === ownerId), owner = item ?? series;
      jellyAssert(owner, "日历事项不存在");
      if (date) jellyAssert(series && !series.exceptions[date]?.deleted, "重复实例不存在");
      const text = date && series ? series.exceptions[date]?.patch?.notes ?? series.notes : owner.notes;
      jellyAssert(typeof text === "string" && text.trim(), "该事项没有待迁移的随记");
      const note = command.mode === "append" ? noteById(state, command.note_id) : createNote(state, { title: owner.title, category_id: owner.category_id, blocks: [] }, now, edit);
      jellyAssert(!note.archived_at, "请先恢复目标笔记"); note.blocks.push(...jellyMarkdownToBlocks(text, [], now)); touch(note, now, edit);
      relation(state, { type: "relation.attach", owner_id: ownerId, original_date: date, note_id: note.id, role: "primary" }, edit);
      if (date && series) series.exceptions[date] = { patch: { ...(series.exceptions[date]?.patch ?? {}), notes: "" } };
      else owner.notes = "";
      owner.updated_at = now;
      if (series) edit.series.add(series);
      if (item) edit.items.add(item);
      return true;
    }
    case "task.schedule": scheduleTask(state, command, now, edit); return true;
    case "task.complete": { const { note, block } = taskBlock(state, command); block.completed_at = command.completed ? now : null; block.completion_description = command.completed ? string(command.completion_description, block.completion_description) : ""; synchronizeNoteTasks(state, note, now, edit); touch(note, now, edit); return true; }
    case "task.unlink": { const { note, block } = taskBlock(state, command); state.task_links = state.task_links.filter(l => !(l.note_id === note.id && l.block_id === block.id)); return true; }
    case "plan.apply": {
      const plan = record(command.plan) as unknown as JellyPlan;
      if (state.applied_plan_ids.includes(plan.id)) return true;
      jellyAssert(plan.source_hash === jellySourceHash(state, plan.source_type, plan.source_id, plan.source_text), "原文已变更，请重新生成提案", jellyErrors.source_changed);
      const selected = command.selected_action_ids === undefined ? plan.actions.map(a => a.id) : command.selected_action_ids; jellyAssert(Array.isArray(selected) && selected.every(id => typeof id === "string"), "选择的任务无效"); jellyAssert(selected.length > 0 && new Set(selected).size === selected.length, "至少选择一项任务，不能重复");
      jellyAssert(selected.every(id => plan.actions.some(a => a.id === id)) && new Set(plan.actions.map(a => a.id)).size === plan.actions.length, "提案任务 ID 无效");
      const actions = plan.actions.filter(a => selected.includes(a.id));
      const proposed: import("./contract.js").JellySchedule[] = [];
      for (const action of actions) {
        jellyAssert(action.title.trim(), "提案任务内容无效"); category(state, action.category_id);
        if (action.schedule) {
          validateJellySchedule(action.schedule);
          const conflict = jellyOccurrences(state, action.schedule.start_date, action.schedule.end_date).find(item => jellySchedulesOverlap(item, action.schedule!));
          jellyAssert(!conflict, `时间已被「${conflict?.title ?? "其他事项"}」占用，请调整排期`, jellyErrors.schedule_conflict);
          jellyAssert(!proposed.some(schedule => jellySchedulesOverlap(schedule, action.schedule!)), "提案中的任务排期重叠，请调整排期", jellyErrors.schedule_conflict); proposed.push(action.schedule);
        }
      }
      let insertionAfter: string | undefined;
      if (plan.selection !== undefined) {
        jellyAssert(plan.source_type === "note" && plan.source_id, "只有笔记支持正文选区");
        const selection = record(plan.selection), ids = selection.block_ids; const source = noteById(state, plan.source_id);
        jellyAssert(Array.isArray(ids) && ids.length > 0 && new Set(ids).size === ids.length && ids.every(id => typeof id === "string"), "选区块 ID 无效");
        const indices = ids.map(id => source.blocks.findIndex(block => block.id === id));
        jellyAssert(indices.every((index, offset) => index >= 0 && (offset === 0 || index === indices[offset - 1]! + 1)), "选区已变化，请重新选择连续正文", jellyErrors.source_changed);
        jellyAssert(typeof selection.text === "string" && selection.text.trim() && source.blocks.slice(indices[0], indices.at(-1)! + 1).map(block => block.text).join("\n").includes(selection.text) && plan.source_text === selection.text, "选区原文不一致，请重新生成提案", jellyErrors.source_changed);
        jellyAssert(command.note_id === undefined || command.note_id === source.id, "选区提案必须写回原笔记"); insertionAfter = ids.at(-1) as string;
      }
      const target = command.note_id ?? (plan.source_type === "note" ? plan.source_id : null);
      const n = target ? noteById(state, target) : createNote(state, { title: plan.title || "行动计划", markdown: plan.source_text }, now, edit); jellyAssert(!n.archived_at, "请先恢复目标笔记");
      for (const action of actions) {
        category(state, action.category_id);
        const block: JellyBlock = { id: randomUUID(), kind: "task", text: action.title.trim(), indent: 0, completed_at: null, completion_description: "" };
        const added = [block]; if (action.notes) added.push({ id: randomUUID(), kind: "paragraph", text: string(action.notes), indent: 0, completed_at: null, completion_description: "" });
        if (insertionAfter) { const index = n.blocks.findIndex(existing => existing.id === insertionAfter); n.blocks.splice(index + 1, 0, ...added); insertionAfter = added.at(-1)!.id; } else n.blocks.push(...added);
        if (action.schedule) scheduleTask(state, { type: "task.schedule", note_id: n.id, block_id: block.id, schedule: action.schedule, category_id: action.category_id, priority: action.priority }, now, edit);
      }
      touch(n, now, edit);
      jellyAssert(typeof plan.id === "string" && plan.id.length > 0, "提案 ID 重复或为空");
      state.applied_plan_ids.push(plan.id); return true;
    }
    default: return false;
  }
}
