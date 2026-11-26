import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginPermissionDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

const PERMISSION_REASONS: Readonly<Record<string, { readonly reason: string; readonly key: string }>> = {
  "storage:private": { reason: "在本地保存你的 Jelly 日程、分类和随手记", key: "jelly.permission.storage-private.reason" },
  "jelly:read": { reason: "读取你的 Jelly 日程、分类和随手记", key: "jelly.permission.jelly-read.reason" },
  "jelly:write": { reason: "新建、修改或删除你的 Jelly 日程、分类和随手记", key: "jelly.permission.jelly-write.reason" },
};

const ACTION_TEXT: Readonly<Record<string, readonly [string, string]>> = {
  "jelly.calendar.list": ["jelly.cap.calendar-list.title", "jelly.cap.calendar-list.description"],
  "jelly.item.get": ["jelly.cap.item-get.title", "jelly.cap.item-get.description"],
  "jelly.note.list": ["jelly.cap.note-list.title", "jelly.cap.note-list.description"],
  "jelly.note.get": ["jelly.cap.note-get.title", "jelly.cap.note-get.description"],
  "jelly.item.create": ["jelly.cap.item-create.title", "jelly.cap.item-create.description"],
  "jelly.item.update": ["jelly.cap.item-update.title", "jelly.cap.item-update.description"],
  "jelly.item.delete": ["jelly.cap.item-delete.title", "jelly.cap.item-delete.description"],
  "jelly.series.create": ["jelly.cap.series-create.title", "jelly.cap.series-create.description"],
  "jelly.series.update": ["jelly.cap.series-update.title", "jelly.cap.series-update.description"],
  "jelly.series.delete": ["jelly.cap.series-delete.title", "jelly.cap.series-delete.description"],
  "jelly.category.save": ["jelly.cap.category-save.title", "jelly.cap.category-save.description"],
  "jelly.category.delete": ["jelly.cap.category-delete.title", "jelly.cap.category-delete.description"],
  "jelly.note.save": ["jelly.cap.note-save.title", "jelly.cap.note-save.description"],
  "jelly.note.delete": ["jelly.cap.note-delete.title", "jelly.cap.note-delete.description"],
  "jelly.restore": ["jelly.cap.restore.title", "jelly.cap.restore.description"],
  "jelly.search.entries": ["jelly.cap.search-entries.title", "jelly.cap.search-entries.description"],
  "jelly.item.subject.read": ["jelly.cap.item-subject-read.title", "jelly.cap.item-subject-read.description"],
  "jelly.note.subject.read": ["jelly.cap.note-subject-read.title", "jelly.cap.note-subject-read.description"],
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

