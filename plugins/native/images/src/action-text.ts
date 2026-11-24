import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginPermissionDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

const PERMISSION_REASONS: Readonly<Record<string, { readonly reason: string; readonly key: string }>> = {
  "images:connections:read": { reason: "查看已保存的生图服务配置与当前连接状态（不读取密钥）", key: "images.permission.images-connections-read.reason" },
  "images:connections:write": { reason: "新建、修改或删除生图服务配置", key: "images.permission.images-connections-write.reason" },
  "images:read": { reason: "查看当前项目的生图任务、记录与已生成的图片", key: "images.permission.images-read.reason" },
  "images:generate": { reason: "发起新的图片生成任务或停止这台电脑上的等待", key: "images.permission.images-generate.reason" },
  "model:invoke": { reason: "在你明确发起生成时调用所选的图片生成服务", key: "images.permission.model-invoke.reason" },
  "images:files:write": { reason: "在这台电脑上保存和删除已生成的图片文件", key: "images.permission.images-files-write.reason" },
  "images:delete": { reason: "删除已完成、失败或已取消的生图记录与图片", key: "images.permission.images-delete.reason" },
  "storage:private": { reason: "在这台电脑上保存生图服务配置、项目生成记录与图片文件", key: "images.permission.storage-private.reason" },
  "actions:delegate": { reason: "把选中的图片保存到项目里支持接收文件的其他插件", key: "images.permission.actions-delegate.reason" },
};

const ACTION_TEXT: Readonly<Record<string, readonly [string, string]>> = {
  "images.connection.usages": ["images.cap.connection-usages.title", "images.cap.connection-usages.description"],
  "images.connections.list": ["images.cap.connections-list.title", "images.cap.connections-list.description"],
  "images.connections.save": ["images.cap.connections-save.title", "images.cap.connections-save.description"],
  "images.connections.delete": ["images.cap.connections-delete.title", "images.cap.connections-delete.description"],
  "images.jobs.list": ["images.cap.jobs-list.title", "images.cap.jobs-list.description"],
  "images.jobs.get": ["images.cap.jobs-get.title", "images.cap.jobs-get.description"],
  "images.jobs.start": ["images.cap.jobs-start.title", "images.cap.jobs-start.description"],
  "images.jobs.cancel": ["images.cap.jobs-cancel.title", "images.cap.jobs-cancel.description"],
  "images.jobs.delete": ["images.cap.jobs-delete.title", "images.cap.jobs-delete.description"],
  "images.images.read": ["images.cap.images-read.title", "images.cap.images-read.description"],
  "images.images.save_copy": ["images.cap.images-save-copy.title", "images.cap.images-save-copy.description"],
  "images.background.tasks": ["images.cap.background-tasks.title", "images.cap.background-tasks.description"],
  "images.search.entries": ["images.cap.search-entries.title", "images.cap.search-entries.description"],
  "images.subject.read": ["images.cap.subject-read.title", "images.cap.subject-read.description"],
  "images.files.entries": ["images.cap.files-entries.title", "images.cap.files-entries.description"],
  "images.files.content": ["images.cap.files-content.title", "images.cap.files-content.description"],
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

