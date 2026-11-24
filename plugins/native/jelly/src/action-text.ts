import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginPermissionDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

const PERMISSION_REASONS: Readonly<Record<string, { readonly reason: string; readonly key: string }>> = {
  "storage:private": { reason: "在本地保存你的 Jelly 日历、笔记和撤销恢复记录", key: "jelly.permission.storage-private.reason" },
  "jelly:read": { reason: "读取你的 Jelly 日历事项、分类、笔记和进展统计", key: "jelly.permission.jelly-read.reason" },
  "jelly:write": { reason: "新建、修改、移动、归档或删除你的 Jelly 日历事项、分类和笔记", key: "jelly.permission.jelly-write.reason" },
  "model:invoke": { reason: "调用你选定的文字模型，把原文或笔记拆解为待采纳的行动计划", key: "jelly.permission.model-invoke.reason" },
  "jelly:settings": { reason: "查看或修改 Jelly 的拆解模型选择与模型连接设置（不读取密钥）", key: "jelly.permission.jelly-settings.reason" },
};

const ACTION_TEXT: Readonly<Record<string, readonly [string, string]>> = {
  "jelly.item.create": ["jelly.cap.item-create.title", "jelly.cap.item-create.description"],
  "jelly.item.update": ["jelly.cap.item-update.title", "jelly.cap.item-update.description"],
  "jelly.item.complete": ["jelly.cap.item-complete.title", "jelly.cap.item-complete.description"],
  "jelly.item.delete": ["jelly.cap.item-delete.title", "jelly.cap.item-delete.description"],
  "jelly.item.move": ["jelly.cap.item-move.title", "jelly.cap.item-move.description"],
  "jelly.item.move_many": ["jelly.cap.item-move-many.title", "jelly.cap.item-move-many.description"],
  "jelly.item.reorder": ["jelly.cap.item-reorder.title", "jelly.cap.item-reorder.description"],
  "jelly.series.create": ["jelly.cap.series-create.title", "jelly.cap.series-create.description"],
  "jelly.series.update": ["jelly.cap.series-update.title", "jelly.cap.series-update.description"],
  "jelly.series.delete": ["jelly.cap.series-delete.title", "jelly.cap.series-delete.description"],
  "jelly.series.complete": ["jelly.cap.series-complete.title", "jelly.cap.series-complete.description"],
  "jelly.category.create": ["jelly.cap.category-create.title", "jelly.cap.category-create.description"],
  "jelly.category.update": ["jelly.cap.category-update.title", "jelly.cap.category-update.description"],
  "jelly.category.delete": ["jelly.cap.category-delete.title", "jelly.cap.category-delete.description"],
  "jelly.category.reorder": ["jelly.cap.category-reorder.title", "jelly.cap.category-reorder.description"],
  "jelly.note.create": ["jelly.cap.note-create.title", "jelly.cap.note-create.description"],
  "jelly.note.import": ["jelly.cap.note-import.title", "jelly.cap.note-import.description"],
  "jelly.note.update": ["jelly.cap.note-update.title", "jelly.cap.note-update.description"],
  "jelly.note.archive": ["jelly.cap.note-archive.title", "jelly.cap.note-archive.description"],
  "jelly.note.restore": ["jelly.cap.note-restore.title", "jelly.cap.note-restore.description"],
  "jelly.note.pin": ["jelly.cap.note-pin.title", "jelly.cap.note-pin.description"],
  "jelly.note.delete": ["jelly.cap.note-delete.title", "jelly.cap.note-delete.description"],
  "jelly.relation.attach": ["jelly.cap.relation-attach.title", "jelly.cap.relation-attach.description"],
  "jelly.relation.detach": ["jelly.cap.relation-detach.title", "jelly.cap.relation-detach.description"],
  "jelly.relation.reset": ["jelly.cap.relation-reset.title", "jelly.cap.relation-reset.description"],
  "jelly.item.notes_to_note": ["jelly.cap.item-notes-to-note.title", "jelly.cap.item-notes-to-note.description"],
  "jelly.task.schedule": ["jelly.cap.task-schedule.title", "jelly.cap.task-schedule.description"],
  "jelly.task.complete": ["jelly.cap.task-complete.title", "jelly.cap.task-complete.description"],
  "jelly.task.unlink": ["jelly.cap.task-unlink.title", "jelly.cap.task-unlink.description"],
  "jelly.plan.apply": ["jelly.cap.plan-apply.title", "jelly.cap.plan-apply.description"],
  "jelly.undo": ["jelly.cap.undo.title", "jelly.cap.undo.description"],
  "jelly.redo": ["jelly.cap.redo.title", "jelly.cap.redo.description"],
  "jelly.workspace.import": ["jelly.cap.workspace-import.title", "jelly.cap.workspace-import.description"],
  "jelly.workspace.get": ["jelly.cap.workspace-get.title", "jelly.cap.workspace-get.description"],
  "jelly.workspace.export": ["jelly.cap.workspace-export.title", "jelly.cap.workspace-export.description"],
  "jelly.calendar.list": ["jelly.cap.calendar-list.title", "jelly.cap.calendar-list.description"],
  "jelly.calendar.progress": ["jelly.cap.calendar-progress.title", "jelly.cap.calendar-progress.description"],
  "jelly.item.get": ["jelly.cap.item-get.title", "jelly.cap.item-get.description"],
  "jelly.category.list": ["jelly.cap.category-list.title", "jelly.cap.category-list.description"],
  "jelly.search": ["jelly.cap.search.title", "jelly.cap.search.description"],
  "jelly.note.export": ["jelly.cap.note-export.title", "jelly.cap.note-export.description"],
  "jelly.workspace.import_preview": ["jelly.cap.workspace-import-preview.title", "jelly.cap.workspace-import-preview.description"],
  "jelly.note.delete_preview": ["jelly.cap.note-delete-preview.title", "jelly.cap.note-delete-preview.description"],
  "jelly.plan.manual": ["jelly.cap.plan-manual.title", "jelly.cap.plan-manual.description"],
  "jelly.plan.generate": ["jelly.cap.plan-generate.title", "jelly.cap.plan-generate.description"],
  "jelly.search.entries": ["jelly.cap.search-entries.title", "jelly.cap.search-entries.description"],
  "jelly.item.subject.read": ["jelly.cap.item-subject-read.title", "jelly.cap.item-subject-read.description"],
  "jelly.note.subject.read": ["jelly.cap.note-subject-read.title", "jelly.cap.note-subject-read.description"],
  "jelly.model.settings": ["jelly.cap.model-settings.title", "jelly.cap.model-settings.description"],
  "jelly.model.configure": ["jelly.cap.model-configure.title", "jelly.cap.model-configure.description"],
  "jelly.preferences.read": ["jelly.cap.preferences-read.title", "jelly.cap.preferences-read.description"],
  "jelly.preferences.write": ["jelly.cap.preferences-write.title", "jelly.cap.preferences-write.description"],
  "jelly.content.list": ["jelly.cap.content-list.title", "jelly.cap.content-list.description"],
  "jelly.content.read": ["jelly.cap.content-read.title", "jelly.cap.content-read.description"],
  "jelly.content.receive": ["jelly.cap.content-receive.title", "jelly.cap.content-receive.description"],
};

export function localizePermission(item: PluginPermissionDeclaration): PluginPermissionDeclaration {
  const entry = PERMISSION_REASONS[item.permission];
  if (!entry) return item;
  return {
    ...item,
    reason: entry.reason,
    reason_text: { key: entry.key },
  };
}

export function localizeAction(definition: ActionDefinition): ActionDefinition {
  const pair = ACTION_TEXT[definition.capability_id];
  if (!pair) return definition;
  return {
    ...definition,
    action: {
      ...definition.action,
      title_text: { key: pair[0] },
      description_text: { key: pair[1] },
    },
  };
}

