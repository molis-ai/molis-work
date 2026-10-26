import type { TodoEditableField, TodoItem, TodoLinkKind, TodoRelation, TodoSource } from "./contract.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { isTodoDate, isTodoInstant, isTodoTime } from "./dates.js";
import { todoErrors } from "./error.js";
import { invalid, text } from "./store-support.js";
import type { TodoAccess, TodoCreateInput, TodoFields } from "./store-types.js";

export const EDITABLE: readonly TodoEditableField[] = ["title", "notes", "due_date", "due_time", "planned_date", "remind_at", "placement", "important", "waiting"];
export const LINK_KINDS: readonly TodoLinkKind[] = ["goal", "material", "todo", "outcome", "work"];
export const RELATIONS: readonly TodoRelation[] = ["blocked_by", "blocks", "split_from", "merged", "related"];
export const SOURCE_KINDS: readonly TodoSource["kind"][] = ["manual", "material", "assistant", "onboarding", "inbox", "lingguang"];

type NormalizedFields = Partial<Omit<TodoItem, "project_id">> & { project_id?: string | null };

export function normalizeFields(patch: TodoFields, current: TodoItem | null, access: TodoAccess): NormalizedFields {
  const out: { -readonly [K in keyof NormalizedFields]: NormalizedFields[K] } = {};
  if (patch.title !== undefined) {
    const title = String(patch.title).replace(/\s+/gu, " ").trim();
    if (!title || title.length > 200) throw invalid("标题须为 1 到 200 个字");
    out.title = title;
  }
  if (patch.notes !== undefined) {
    if (String(patch.notes).length > 10_000) throw invalid("说明最多 10000 字");
    out.notes = String(patch.notes);
  }
  for (const field of ["due_date", "planned_date"] as const) {
    const value = patch[field];
    if (value === undefined) continue;
    if (value !== null && !isTodoDate(value)) throw invalid(field === "due_date" ? "截止日期无效" : "计划日期无效");
    out[field] = value;
  }
  if (patch.due_time !== undefined) {
    if (patch.due_time !== null && !isTodoTime(patch.due_time)) throw invalid("截止时间要写成 HH:MM");
    out.due_time = patch.due_time;
  }
  if (patch.due_date === null && patch.due_time === undefined && current?.due_time) out.due_time = null;
  if (patch.remind_at !== undefined) {
    if (patch.remind_at !== null && !isTodoInstant(patch.remind_at)) throw invalid("提醒时间要带时区，例如 2026-10-02T09:00:00+08:00");
    out.remind_at = patch.remind_at === null ? null : new Date(patch.remind_at).toISOString();
  }
  if (patch.important !== undefined) {
    if (typeof patch.important !== "boolean") throw invalid("重要标记无效");
    if (access.actor !== "user" && patch.important !== (current?.important ?? false)) throw todoErrors.forbidden("重要标记只能由你自己设置");
    out.important = patch.important;
  }
  if (patch.waiting !== undefined) {
    if (patch.waiting === null) out.waiting = null;
    else {
      const who = String(patch.waiting.who ?? "").trim(), what = String(patch.waiting.what ?? "").trim();
      const follow = patch.waiting.follow_up_on ?? null;
      if (who.length > 80 || what.length > 200) throw invalid("等待对象最多 80 字，等待内容最多 200 字");
      if (follow !== null && !isTodoDate(follow)) throw invalid("跟进日期无效");
      out.waiting = { who, what, follow_up_on: follow };
    }
  }
  if (patch.placement !== undefined) {
    if (patch.placement === "project") {
      if (!access.projectId) throw new ActionError("actions.project_required", "要放进项目，请在那个项目里操作");
      // "Into the project" means the project the caller is in; other projects are not addressable by id.
      // A todo already in some project stays there, so resending the same placement never moves it silently.
      out.placement = "project";
      out.project_id = current?.placement === "project" && current.project_id ? current.project_id : access.projectId;
    } else if (patch.placement === "personal" || patch.placement === "unassigned") {
      out.placement = patch.placement;
      out.project_id = null;
    } else throw invalid("归属无效");
  }
  return out;
}

export const stripProject = (fields: NormalizedFields): Partial<TodoItem> => {
  const { project_id: _ignored, ...rest } = fields;
  return rest;
};

export function normalizeSources(input: TodoCreateInput["sources"], access: TodoAccess, at: string): TodoSource[] {
  const manual: TodoSource = { source_id: crypto.randomUUID(), kind: access.actor === "assistant" ? "assistant" : "manual",
    title: access.actor === "assistant" ? "助理按你的要求创建" : "你手动记下", excerpt: "", reason: "", subject: null, open: null, added_at: at };
  if (!input?.length) return [manual];
  if (input.length > 20) throw invalid("来源最多 20 项");
  return input.map(source => {
    if (!SOURCE_KINDS.includes(source.kind)) throw invalid("来源种类无效");
    const title = String(source.title ?? "").trim();
    if (!title || title.length > 200) throw invalid("来源要有 1 到 200 字的名称");
    const excerpt = String(source.excerpt ?? ""), reason = String(source.reason ?? "");
    if (excerpt.length > 2000 || reason.length > 500) throw invalid("依据最多 2000 字，形成原因最多 500 字");
    const subject = source.subject ? { kind: String(source.subject.kind), id: String(source.subject.id) } : null;
    if (subject && (!text(subject.kind, 80) || !text(subject.id, 200))) throw invalid("来源对象无效");
    return { source_id: crypto.randomUUID(), kind: source.kind, title, excerpt, reason, subject, open: normalizeOpen(source.open), added_at: at };
  });
}

export function normalizeOpen(value: { surface: string; id: string } | null | undefined): { surface: string; id: string } | null {
  if (!value) return null;
  if (!/^[a-z0-9_-]{1,40}$/u.test(String(value.surface)) || !text(value.id, 200)) throw invalid("打开位置无效");
  return { surface: value.surface, id: value.id };
}
