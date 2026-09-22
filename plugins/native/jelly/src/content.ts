import { createHash, randomUUID } from "node:crypto";
import type { JellyBlock, JellyCommand, JellyInspiration, JellyNote, JellyPlan, JellyRelation, JellyWorkspace } from "@molis-ai/molis-work-contracts/modules/jelly";
import { makeJellyItem, jellyOccurrences, jellySchedulesOverlap } from "./calendar.js";
import { jellyAssert } from "./error.js";
import { makeJellyMaterialSnapshot, validateJellyMaterialSnapshot, validateJellyStructuredDigest, renderJellyDigestMarkdown, type JellyMaterialExtraction } from "./material.js";
import { validateJellySchedule } from "./calendar-validation.js";
import { jellyMarkdownToBlocks, jellyHtmlToBlocks } from "./markdown.js";

export const jellyHash = (value: string): string => createHash("sha256").update(value).digest("hex");
export function jellySourceHash(state: JellyWorkspace, sourceType: "note" | "inspiration" | "text", sourceId: string | null, sourceText = ""): string {
  if (sourceType === "note") return jellyHash(JSON.stringify(noteById(state, sourceId).blocks));
  if (sourceType === "inspiration") { const i = inspirationById(state, sourceId); return jellyHash(i.raw_text + "\n" + (i.url ?? "")); }
  return jellyHash(sourceText);
}
function noteById(state: JellyWorkspace, id: unknown): JellyNote { const n = state.notes.find(n => n.id === id); jellyAssert(n, "笔记不存在", "jelly.not_found", 404); return n; }
function inspirationById(state: JellyWorkspace, id: unknown): JellyInspiration { const i = state.inspirations.find(n => n.id === id); jellyAssert(i, "灵感不存在", "jelly.not_found", 404); return i; }
function record(value: unknown): Record<string, unknown> { jellyAssert(value && typeof value === "object" && !Array.isArray(value), "命令内容必须是对象"); return value as Record<string, unknown>; }
function string(value: unknown, fallback = ""): string { if (value == null) return fallback; jellyAssert(typeof value === "string", "内容必须是文本"); return value; }
function category(state: JellyWorkspace, id: unknown): string { const result = id === undefined ? "uncategorized" : string(id); jellyAssert(state.categories.some(c => c.id === result), "分类不存在"); return result; }
function touch(note: JellyNote, now: string): void { note.updated_at = now; note.revision++; }
function blocks(value: unknown): JellyBlock[] {
  jellyAssert(Array.isArray(value), "区块必须是数组");
  return value.map(v => { const b = record(v); return { ...b, id: string(b.id) || randomUUID(), kind: b.kind ?? "paragraph", text: string(b.text), indent: b.indent ?? 0, completed_at: b.completed_at ?? null, completion_description: string(b.completion_description) } as JellyBlock; });
}
function createNote(state: JellyWorkspace, input: Record<string, unknown>, now: string): JellyNote {
  const note: JellyNote = { id: randomUUID(), title: string(input.title, "新笔记"), category_id: category(state, input.category_id), blocks: input.blocks ? blocks(input.blocks) : input.html !== undefined ? jellyHtmlToBlocks(string(input.html)) : jellyMarkdownToBlocks(string(input.markdown), [], now), pinned: false, archived_at: null, revision: 0, created_at: now, updated_at: now };
  state.notes.push(note); return note;
}
function taskBlock(state: JellyWorkspace, command: JellyCommand): { note: JellyNote; block: JellyBlock } {
  const note = noteById(state, command.note_id), block = note.blocks.find(b => b.id === command.block_id); jellyAssert(block?.kind === "task", "任务区块不存在"); jellyAssert(!note.archived_at, "请先恢复笔记"); return { note, block };
}
function synchronizeNoteTasks(state: JellyWorkspace, note: JellyNote, now: string): void {
  for (const link of state.task_links.filter(l => l.note_id === note.id)) {
    const block = note.blocks.find(b => b.id === link.block_id); jellyAssert(block?.kind === "task", "先取消该任务的日历关联，再删除或转换任务区块", "jelly.linked_task", 409);
    const item = state.items.find(i => i.id === link.item_id)!; jellyAssert(block.text.trim(), "已排期任务的标题不能为空"); item.title = block.text.trim(); item.completed_at = block.completed_at; item.completion_description = block.completion_description; item.updated_at = now;
  }
}
function scheduleTask(state: JellyWorkspace, command: JellyCommand, now: string): void {
  const { note, block } = taskBlock(state, command), schedule = record(command.schedule);
  const link = state.task_links.find(l => l.note_id === note.id && l.block_id === block.id);
  if (link) {
    const item = state.items.find(i => i.id === link.item_id)!;
    Object.assign(item, schedule, { title: block.text.trim(), category_id: category(state, command.category_id ?? item.category_id), priority: command.priority ?? item.priority, updated_at: now });
  } else {
    const item = makeJellyItem({ ...schedule, title: block.text.trim(), category_id: category(state, command.category_id ?? note.category_id), priority: command.priority as any ?? "none", completed_at: block.completed_at, completion_description: block.completion_description }, now);
    state.items.push(item); state.task_links.push({ item_id: item.id, note_id: note.id, block_id: block.id }); state.relations.push({ owner_id: item.id, original_date: null, note_id: note.id, role: "primary" });
  }
}
function relation(state: JellyWorkspace, command: JellyCommand): void {
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
export function applyJellyContentCommand(state: JellyWorkspace, command: JellyCommand, now: string): boolean {
  switch (command.type) {
    case "note.create": createNote(state, command, now); return true;
    case "note.import": {
      const note = noteById(state, command.id);
      jellyAssert(command.format === "markdown" || command.format === "html", "笔记导入格式无效");
      jellyAssert(command.mode === "append" || command.mode === "replace", "笔记导入方式无效");
      jellyAssert(command.expected_note_revision === undefined || command.expected_note_revision === note.revision, "笔记已在其他窗口修改，请重新载入", "jelly.conflict", 409);
      const previous = command.mode === "replace" ? note.blocks : [];
      const imported = command.format === "markdown" ? jellyMarkdownToBlocks(string(command.source), previous, now) : jellyHtmlToBlocks(string(command.source), previous);
      note.blocks = command.mode === "append" ? [...note.blocks, ...imported] : imported;
      synchronizeNoteTasks(state, note, now); touch(note, now); return true;
    }
    case "note.update": {
      const note = noteById(state, command.id), patch = record(command.patch);
      jellyAssert(command.expected_note_revision === undefined || command.expected_note_revision === note.revision, "笔记已在其他窗口修改，请重新载入", "jelly.conflict", 409);
      if (patch.title !== undefined) note.title = string(patch.title);
      if (patch.category_id !== undefined) note.category_id = category(state, patch.category_id);
      if (patch.pinned !== undefined) { jellyAssert(typeof patch.pinned === "boolean", "置顶值无效"); note.pinned = patch.pinned; }
      if (patch.blocks !== undefined) note.blocks = blocks(patch.blocks);
      else if (patch.markdown !== undefined) note.blocks = jellyMarkdownToBlocks(string(patch.markdown), note.blocks, now);
      else if (patch.html !== undefined) note.blocks = jellyHtmlToBlocks(string(patch.html), note.blocks);
      synchronizeNoteTasks(state, note, now); touch(note, now); return true;
    }
    case "note.archive": case "note.restore": case "note.pin": { const n = noteById(state, command.id); if (command.type === "note.pin") { jellyAssert(command.pinned === undefined || typeof command.pinned === "boolean", "置顶值无效"); n.pinned = command.pinned === undefined ? !n.pinned : command.pinned; } else n.archived_at = command.type === "note.archive" ? now : null; touch(n, now); return true; }
    case "note.delete": {
      const n = noteById(state, command.id); jellyAssert(n.archived_at, "请先归档，再永久删除笔记");
      state.notes = state.notes.filter(x => x.id !== n.id); state.relations = state.relations.filter(r => r.note_id !== n.id); state.task_links = state.task_links.filter(l => l.note_id !== n.id);
      for (const o of state.relation_overrides ?? []) { if (o.primary === n.id) o.primary = "clear"; o.added_reference_ids = o.added_reference_ids.filter(id => id !== n.id); o.removed_reference_ids = o.removed_reference_ids.filter(id => id !== n.id); }
      for (const i of state.inspirations) { if (i.note_id === n.id) i.note_id = null; if (i.digest) i.digest.written_note_ids = i.digest.written_note_ids.filter(id => id !== n.id); } return true;
    }
    case "inspiration.create": {
      const kind = command.input_kind ?? (command.url ? "url" : command.file_name ? "file" : "text"); jellyAssert(["text", "url", "file"].includes(string(kind)), "灵感类型无效");
      const inspiration: JellyInspiration = { id: randomUUID(), input_kind: kind as JellyInspiration["input_kind"], title: string(command.title, string(command.raw_text).slice(0, 80) || string(command.url) || string(command.file_name) || "新灵感"), raw_text: string(command.raw_text), url: command.url == null ? null : string(command.url), file_name: command.file_name == null ? null : string(command.file_name), category_id: category(state, command.category_id), archived_at: null, note_id: null, digest: null, created_at: now, updated_at: now };
      state.inspirations.push(inspiration);
      if (command.material !== undefined) applyJellyContentCommand(state, { type: "inspiration.update", id: inspiration.id, patch: { material: command.material } }, now);
      return true;
    }
    case "inspiration.update": {
      const i = inspirationById(state, command.id), patch = record(command.patch);
      const sourceChanged = (["raw_text", "url", "file_name"] as const).some(key => patch[key] !== undefined && patch[key] !== i[key]);
      jellyAssert(!sourceChanged || !i.note_id, "已转为笔记的灵感原始内容已锁定；可以修改标题、分类或更新摘要", "jelly.source_locked", 409);
      for (const k of ["title", "raw_text"] as const) if (patch[k] !== undefined) i[k] = string(patch[k]);
      for (const k of ["url", "file_name"] as const) if (patch[k] !== undefined) i[k] = patch[k] === null ? null : string(patch[k]);
      if (patch.category_id !== undefined) i.category_id = category(state, patch.category_id);
      if (sourceChanged) { delete i.material; i.digest = null; }
      const sourceHash = jellySourceHash(state, "inspiration", i.id);
      if (patch.material !== undefined) {
        if (patch.material === null) { delete i.material; i.digest = null; }
        else {
          const material = record(patch.material);
          const snapshot = material.blocks !== undefined ? validateJellyMaterialSnapshot(material) : makeJellyMaterialSnapshot(sourceHash, material as unknown as JellyMaterialExtraction);
          jellyAssert(snapshot.source_hash === sourceHash, "素材与原文来源不一致，请重新读取", "jelly.source_changed", 409);
          if (i.digest && i.digest.snapshot?.content_fingerprint !== snapshot.content_fingerprint) i.digest = null;
          i.material = snapshot;
        }
      }
      if (patch.digest !== undefined) {
        const d = record(patch.digest); jellyAssert(d.source_hash === sourceHash, "素材已变更，请重新生成摘要", "jelly.source_changed", 409);
        jellyAssert(d.snapshot && d.structured, "新摘要必须携带素材快照与逐条来源证据");
        const snapshot = validateJellyMaterialSnapshot(d.snapshot); jellyAssert(snapshot.source_hash === sourceHash, "摘要素材来源已变更", "jelly.source_changed", 409);
        jellyAssert(!i.material || i.material.content_fingerprint === snapshot.content_fingerprint, "整理期间素材快照已变更，请基于最新素材重新生成摘要", "jelly.source_changed", 409);
        const structured = validateJellyStructuredDigest(d.structured, snapshot), summary = renderJellyDigestMarkdown(structured, snapshot);
        const identical = i.digest?.snapshot?.content_fingerprint === snapshot.content_fingerprint && JSON.stringify(i.digest.structured) === JSON.stringify(structured);
        i.material = snapshot; i.digest = { source_hash: sourceHash, source_text: snapshot.blocks.map(block => block.text).join("\n\n"), summary, snapshot, structured, created_at: now, written_note_ids: identical ? [...i.digest!.written_note_ids] : [] };
      }
      i.updated_at = now; return true;
    }
    case "inspiration.delete": {
      const i = inspirationById(state, command.id); jellyAssert(i.archived_at, "请先归档，再永久删除灵感");
      state.inspirations = state.inspirations.filter(entry => entry.id !== i.id); return true;
    }
    case "inspiration.archive": case "inspiration.restore": { const i = inspirationById(state, command.id); i.archived_at = command.type === "inspiration.archive" ? now : null; i.updated_at = now; return true; }
    case "inspiration.convert": {
      const i = inspirationById(state, command.id); if (i.note_id && state.notes.some(n => n.id === i.note_id)) return true;
      const n = createNote(state, { title: i.title, category_id: i.category_id, markdown: [i.raw_text, i.url ? `来源：${i.url}` : "", i.file_name ? `附件：${i.file_name}` : ""].filter(Boolean).join("\n\n") }, now); i.note_id = n.id; i.updated_at = now; return true;
    }
    case "inspiration.digest_write": {
      const i = inspirationById(state, command.id), digest = i.digest; jellyAssert(digest, "请先生成摘要"); jellyAssert(digest.source_hash === jellySourceHash(state, "inspiration", i.id), "素材已变更，请重新生成摘要", "jelly.source_changed", 409);
      const targetId = command.note_id ?? i.note_id ?? digest.written_note_ids[0];
      if (targetId && digest.written_note_ids.includes(string(targetId))) return true;
      const n = targetId ? noteById(state, targetId) : createNote(state, { title: i.title, category_id: i.category_id }, now);
      n.blocks.push(...jellyMarkdownToBlocks(`## 素材摘要\n${digest.summary}\n\n来源：${i.url ?? i.file_name ?? i.title}\n\n> ${digest.source_text.replace(/\n/g, "\n> ")}`, [], now)); touch(n, now); digest.written_note_ids.push(n.id); i.note_id ??= n.id; i.updated_at = now; return true;
    }
    case "relation.attach": case "relation.detach": relation(state, command); return true;
    case "relation.reset": {
      const owner = string(command.owner_id), date = string(command.original_date);
      jellyAssert(date && state.series.some(series => series.id === owner), "请指定重复事项及实例日期");
      state.relation_overrides = (state.relation_overrides ?? []).filter(override => !(override.owner_id === owner && override.original_date === date));
      state.relations = state.relations.filter(entry => !(entry.owner_id === owner && entry.original_date === date)); return true;
    }
    case "item.notes_to_note": {
      const ownerId = string(command.owner_id), date = command.original_date == null ? null : string(command.original_date);
      const item = state.items.find(item => item.id === ownerId), series = state.series.find(series => series.id === ownerId), owner = item ?? series;
      jellyAssert(owner, "日历事项不存在"); jellyAssert(command.mode === "new" || command.mode === "append", "迁移方式无效");
      if (date) jellyAssert(series && !series.exceptions[date]?.deleted, "重复实例不存在");
      const text = date && series ? series.exceptions[date]?.patch?.notes ?? series.notes : owner.notes;
      jellyAssert(typeof text === "string" && text.trim(), "该事项没有待迁移的随记");
      const note = command.mode === "append" ? noteById(state, command.note_id) : createNote(state, { title: owner.title, category_id: owner.category_id, blocks: [] }, now);
      jellyAssert(!note.archived_at, "请先恢复目标笔记"); note.blocks.push(...jellyMarkdownToBlocks(text, [], now)); touch(note, now);
      relation(state, { type: "relation.attach", owner_id: ownerId, original_date: date, note_id: note.id, role: "primary" });
      if (date && series) series.exceptions[date] = { patch: { ...(series.exceptions[date]?.patch ?? {}), notes: "" } };
      else owner.notes = "";
      owner.updated_at = now; return true;
    }
    case "task.schedule": scheduleTask(state, command, now); return true;
    case "task.complete": { const { note, block } = taskBlock(state, command); jellyAssert(typeof command.completed === "boolean", "完成状态无效"); block.completed_at = command.completed ? now : null; block.completion_description = command.completed ? string(command.completion_description, block.completion_description) : ""; synchronizeNoteTasks(state, note, now); touch(note, now); return true; }
    case "task.unlink": { const { note, block } = taskBlock(state, command); state.task_links = state.task_links.filter(l => !(l.note_id === note.id && l.block_id === block.id)); return true; }
    case "plan.apply": {
      const plan = record(command.plan) as unknown as JellyPlan; jellyAssert(typeof plan.id === "string" && plan.id.length > 0 && Array.isArray(plan.actions), "拆解提案无效");
      if (state.applied_plan_ids.includes(plan.id)) return true;
      jellyAssert(["note", "inspiration", "text"].includes(plan.source_type), "提案来源无效");
      jellyAssert(plan.source_hash === jellySourceHash(state, plan.source_type, plan.source_id, plan.source_text), "原文已变更，请重新生成提案", "jelly.source_changed", 409);
      const selected = command.selected_action_ids === undefined ? plan.actions.map(a => a.id) : command.selected_action_ids; jellyAssert(Array.isArray(selected) && selected.every(id => typeof id === "string"), "选择的任务无效"); jellyAssert(selected.length > 0 && new Set(selected).size === selected.length, "至少选择一项任务，不能重复");
      jellyAssert(selected.every(id => plan.actions.some(a => a.id === id)) && new Set(plan.actions.map(a => a.id)).size === plan.actions.length, "提案任务 ID 无效");
      const actions = plan.actions.filter(a => selected.includes(a.id));
      const proposed: import("@molis-ai/molis-work-contracts/modules/jelly").JellySchedule[] = [];
      for (const action of actions) {
        jellyAssert(typeof action.title === "string" && action.title.trim() && typeof action.notes === "string" && ["none", "P0", "P1", "P2"].includes(action.priority), "提案任务内容无效"); category(state, action.category_id);
        jellyAssert(action.duration_minutes === undefined || [15, 30, 45, 60, 90].includes(action.duration_minutes), "任务预计时长无效");
        if (action.schedule) {
          validateJellySchedule(action.schedule);
          const conflict = jellyOccurrences(state, action.schedule.start_date, action.schedule.end_date).find(item => jellySchedulesOverlap(item, action.schedule!));
          jellyAssert(!conflict, `时间已被「${conflict?.title ?? "其他事项"}」占用，请调整排期`, "jelly.schedule_conflict", 409);
          jellyAssert(!proposed.some(schedule => jellySchedulesOverlap(schedule, action.schedule!)), "提案中的任务排期重叠，请调整排期", "jelly.schedule_conflict", 409); proposed.push(action.schedule);
        }
      }
      let insertionAfter: string | undefined;
      if (plan.selection !== undefined) {
        jellyAssert(plan.source_type === "note" && plan.source_id, "只有笔记支持正文选区");
        const selection = record(plan.selection), ids = selection.block_ids; const source = noteById(state, plan.source_id);
        jellyAssert(Array.isArray(ids) && ids.length > 0 && new Set(ids).size === ids.length && ids.every(id => typeof id === "string"), "选区块 ID 无效");
        const indices = ids.map(id => source.blocks.findIndex(block => block.id === id));
        jellyAssert(indices.every((index, offset) => index >= 0 && (offset === 0 || index === indices[offset - 1]! + 1)), "选区已变化，请重新选择连续正文", "jelly.source_changed", 409);
        jellyAssert(typeof selection.text === "string" && selection.text.trim() && source.blocks.slice(indices[0], indices.at(-1)! + 1).map(block => block.text).join("\n").includes(selection.text) && plan.source_text === selection.text, "选区原文不一致，请重新生成提案", "jelly.source_changed", 409);
        jellyAssert(command.note_id === undefined || command.note_id === source.id, "选区提案必须写回原笔记"); insertionAfter = ids.at(-1) as string;
      }
      const target = command.note_id ?? (plan.source_type === "note" ? plan.source_id : null);
      const n = target ? noteById(state, target) : createNote(state, { title: plan.title || "行动计划", markdown: plan.source_text }, now); jellyAssert(!n.archived_at, "请先恢复目标笔记");
      for (const action of actions) {
        jellyAssert(typeof action.title === "string" && action.title.trim(), "任务标题不能为空"); category(state, action.category_id);
        const block: JellyBlock = { id: randomUUID(), kind: "task", text: action.title.trim(), indent: 0, completed_at: null, completion_description: "" };
        const added = [block]; if (action.notes) added.push({ id: randomUUID(), kind: "paragraph", text: string(action.notes), indent: 0, completed_at: null, completion_description: "" });
        if (insertionAfter) { const index = n.blocks.findIndex(existing => existing.id === insertionAfter); n.blocks.splice(index + 1, 0, ...added); insertionAfter = added.at(-1)!.id; } else n.blocks.push(...added);
        if (action.schedule) scheduleTask(state, { type: "task.schedule", note_id: n.id, block_id: block.id, schedule: action.schedule, category_id: action.category_id, priority: action.priority }, now);
      }
      touch(n, now); if (plan.source_type === "inspiration") inspirationById(state, plan.source_id).note_id ??= n.id;
      state.applied_plan_ids.push(plan.id); return true;
    }
    default: return false;
  }
}

/** Validate content independently of storage; imported and recovered state uses the same gate. */
export function validateJellyContent(state: JellyWorkspace): void {
  const unique = (values: string[], label: string) => jellyAssert(values.every(x => typeof x === "string" && x.length > 0) && new Set(values).size === values.length, `${label} ID 重复或为空`);
  const time = (value: unknown, nullable = false) => (nullable && value === null) || (typeof value === "string" && Number.isFinite(Date.parse(value)));
  const maybeText = (value: unknown) => value === null || typeof value === "string";
  unique(state.notes.map(n => n.id), "笔记"); unique(state.inspirations.map(i => i.id), "灵感"); unique(state.applied_plan_ids, "提案");
  for (const n of state.notes) {
    jellyAssert(typeof n.title === "string" && typeof n.pinned === "boolean" && Number.isSafeInteger(n.revision) && n.revision >= 0, "笔记数据无效");
    jellyAssert(time(n.created_at) && time(n.updated_at) && time(n.archived_at, true), "笔记时间戳无效");
    category(state, n.category_id); jellyAssert(Array.isArray(n.blocks), "笔记区块无效"); unique(n.blocks.map(b => b.id), "区块");
    for (const b of n.blocks) {
      jellyAssert(["paragraph", "heading1", "heading2", "heading3", "bullet", "numbered", "task", "quote", "code", "divider", "link"].includes(b.kind) && typeof b.text === "string" && Number.isInteger(b.indent) && b.indent >= 0 && b.indent <= 8 && typeof b.completion_description === "string", "区块内容无效");
      jellyAssert(b.completed_at === null || (b.kind === "task" && time(b.completed_at)), "任务完成时间无效");
      jellyAssert(b.language === undefined || typeof b.language === "string", "代码语言无效");
      if (b.inline_spans !== undefined) {
        jellyAssert(Array.isArray(b.inline_spans), "内联格式无效");
        for (const span of b.inline_spans) jellyAssert(span && typeof span.text === "string" && Array.isArray(span.marks) && new Set(span.marks).size === span.marks.length && span.marks.every(mark => ["bold", "italic", "code"].includes(mark)) && (span.link_url === undefined || typeof span.link_url === "string"), "内联格式内容无效");
      }
    }
  }
  for (const i of state.inspirations) {
    category(state, i.category_id); jellyAssert(["text", "url", "file"].includes(i.input_kind) && typeof i.title === "string" && typeof i.raw_text === "string", "灵感内容无效");
    jellyAssert(maybeText(i.url) && maybeText(i.file_name), "灵感来源无效");
    jellyAssert(time(i.created_at) && time(i.updated_at) && time(i.archived_at, true), "灵感时间戳无效");
    jellyAssert(i.note_id === null || state.notes.some(n => n.id === i.note_id), "灵感关联笔记不存在");
    jellyAssert(i.digest === null || (i.digest && typeof i.digest === "object" && !Array.isArray(i.digest)), "摘要数据无效");
    if (i.material !== undefined) { const snapshot = validateJellyMaterialSnapshot(i.material); jellyAssert(snapshot.source_hash === jellySourceHash(state, "inspiration", i.id), "素材来源与灵感不一致"); }
    if (i.digest) {
      if (i.digest.snapshot !== undefined) { const snapshot = validateJellyMaterialSnapshot(i.digest.snapshot); jellyAssert(snapshot.source_hash === i.digest.source_hash, "摘要素材来源不一致"); }
      if (i.digest.structured !== undefined) { jellyAssert(i.digest.snapshot, "摘要缺少素材证据"); validateJellyStructuredDigest(i.digest.structured, i.digest.snapshot); jellyAssert(i.digest.summary === renderJellyDigestMarkdown(i.digest.structured, i.digest.snapshot), "摘要正文与结构化证据不一致"); }
      jellyAssert(typeof i.digest.summary === "string" && typeof i.digest.source_text === "string" && typeof i.digest.source_hash === "string" && /^[a-f0-9]{64}$/.test(i.digest.source_hash) && time(i.digest.created_at) && Array.isArray(i.digest.written_note_ids), "摘要数据无效");
      unique(i.digest.written_note_ids, "摘要笔记"); jellyAssert(i.digest.written_note_ids.every(id => state.notes.some(n => n.id === id)), "摘要关联笔记不存在");
    }
  }
  if (state.imported_sources !== undefined) {
    jellyAssert(Array.isArray(state.imported_sources), "原始导入包无效"); unique(state.imported_sources.map(s => s.sha256), "原始导入包");
    for (const s of state.imported_sources) jellyAssert(/^[a-f0-9]{64}$/.test(s.sha256) && Number.isSafeInteger(s.schema_version) && s.schema_version > 0 && time(s.imported_at) && s.source && typeof s.source === "object", "原始导入包内容无效");
  }
}
