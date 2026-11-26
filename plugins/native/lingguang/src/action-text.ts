import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginPermissionDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

const PERMISSION_REASONS: Readonly<Record<string, { readonly reason: string; readonly key: string }>> = {
  "lingguang:read": { reason: "读取当前项目的灵光内容、关联信息与对话历史", key: "lingguang.permission.lingguang-read.reason" },
  "lingguang:write": { reason: "新增、修改、移动、复制或丢弃当前项目的灵光，并保存对话记录", key: "lingguang.permission.lingguang-write.reason" },
  "model:invoke": { reason: "调用已配置的文字模型，围绕所选灵光生成对话回复", key: "lingguang.permission.model-invoke.reason" },
  "materials:read": { reason: "从你上传的文件、图片或音视频中提取文字内容", key: "lingguang.permission.materials-read.reason" },
  "materials:fetch": { reason: "读取你提供的公开网页、视频字幕或播客音频中的文字", key: "lingguang.permission.materials-fetch.reason" },
  "storage:private": { reason: "在本地保存你的灵光记录与对话历史", key: "lingguang.permission.storage-private.reason" },
};

const ACTION_TEXT: Readonly<Record<string, readonly [string, string]>> = {
  "lingguang.list": ["lingguang.cap.list.title", "lingguang.cap.list.description"],
  "lingguang.get": ["lingguang.cap.get.title", "lingguang.cap.get.description"],
  "lingguang.create": ["lingguang.cap.create.title", "lingguang.cap.create.description"],
  "lingguang.update": ["lingguang.cap.update.title", "lingguang.cap.update.description"],
  "lingguang.discard": ["lingguang.cap.discard.title", "lingguang.cap.discard.description"],
  "lingguang.revert": ["lingguang.cap.revert.title", "lingguang.cap.revert.description"],
  "lingguang.conversation.open": ["lingguang.cap.conversation-open.title", "lingguang.cap.conversation-open.description"],
  "lingguang.conversation.get": ["lingguang.cap.conversation-get.title", "lingguang.cap.conversation-get.description"],
  "lingguang.conversation.message": ["lingguang.cap.conversation-message.title", "lingguang.cap.conversation-message.description"],
  "lingguang.search.entries": ["lingguang.cap.search-entries.title", "lingguang.cap.search-entries.description"],
  "lingguang.subject.read": ["lingguang.cap.subject-read.title", "lingguang.cap.subject-read.description"],
  "lingguang.placement.export": ["lingguang.cap.placement-export.title", "lingguang.cap.placement-export.description"],
  "lingguang.placement.put": ["lingguang.cap.placement-put.title", "lingguang.cap.placement-put.description"],
  "lingguang.placement.remove": ["lingguang.cap.placement-remove.title", "lingguang.cap.placement-remove.description"],
  "lingguang.material.read": ["lingguang.cap.material-read.title", "lingguang.cap.material-read.description"],
  "lingguang.source.read": ["lingguang.cap.source-read.title", "lingguang.cap.source-read.description"],
  "lingguang.fragment.offers": ["lingguang.cap.fragment-offers.title", "lingguang.cap.fragment-offers.description"],
  "lingguang.content.list": ["lingguang.cap.content-list.title", "lingguang.cap.content-list.description"],
  "lingguang.content.read": ["lingguang.cap.content-read.title", "lingguang.cap.content-read.description"],
  "lingguang.content.receive": ["lingguang.cap.content-receive.title", "lingguang.cap.content-receive.description"],
  "lingguang.content.create": ["lingguang.cap.content-create.title", "lingguang.cap.content-create.description"],
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

