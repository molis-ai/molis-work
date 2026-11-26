import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginPermissionDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

const PERMISSION_REASONS: Readonly<Record<string, { readonly reason: string; readonly key: string }>> = {
  "ppt:read": { reason: "查看当前项目的演示稿、幻灯片与配色设置", key: "ppt.permission.ppt-read.reason" },
  "ppt:write": { reason: "新建、编辑、删除演示稿，以及按大纲生成或替换幻灯片", key: "ppt.permission.ppt-write.reason" },
  "model:invoke": { reason: "在你明确触发 AI 整理大纲时调用已配置的文字模型", key: "ppt.permission.model-invoke.reason" },
  "actions:delegate": { reason: "从项目里已安装的文档插件读取文字来生成大纲", key: "ppt.permission.actions-delegate.reason" },
  "storage:private": { reason: "在这台电脑上保存当前项目的演示稿", key: "ppt.permission.storage-private.reason" },
  "artifact:write": { reason: "把演示稿保存为成果库里的固定版本", key: "ppt.permission.artifact-write.reason" },
  "artifact:read": { reason: "读取已固定的演示稿版本，用于版本编号或恢复未完成的保存", key: "ppt.permission.artifact-read.reason" },
};

const ACTION_TEXT: Readonly<Record<string, readonly [string, string]>> = {
  "ppt.artifacts.preview": ["ppt.cap.artifacts-preview.title", "ppt.cap.artifacts-preview.description"],
  "ppt.artifacts.pin": ["ppt.cap.artifacts-pin.title", "ppt.cap.artifacts-pin.description"],
  "ppt.artifacts.compare": ["ppt.cap.artifacts-compare.title", "ppt.cap.artifacts-compare.description"],
  "ppt.artifacts.continue": ["ppt.cap.artifacts-continue.title", "ppt.cap.artifacts-continue.description"],
  "ppt.list": ["ppt.cap.list.title", "ppt.cap.list.description"],
  "ppt.get": ["ppt.cap.get.title", "ppt.cap.get.description"],
  "ppt.create": ["ppt.cap.create.title", "ppt.cap.create.description"],
  "ppt.update": ["ppt.cap.update.title", "ppt.cap.update.description"],
  "ppt.delete": ["ppt.cap.delete.title", "ppt.cap.delete.description"],
  "ppt.export": ["ppt.cap.export.title", "ppt.cap.export.description"],
  "ppt.promote": ["ppt.cap.promote.title", "ppt.cap.promote.description"],
  "ppt.pptx": ["ppt.cap.pptx.title", "ppt.cap.pptx.description"],
  "ppt.outline": ["ppt.cap.outline.title", "ppt.cap.outline.description"],
  "ppt.outline_ai": ["ppt.cap.outline-ai.title", "ppt.cap.outline-ai.description"],
  "ppt.outline_pages": ["ppt.cap.outline-pages.title", "ppt.cap.outline-pages.description"],
  "ppt.placement.export": ["ppt.cap.placement-export.title", "ppt.cap.placement-export.description"],
  "ppt.placement.put": ["ppt.cap.placement-put.title", "ppt.cap.placement-put.description"],
  "ppt.placement.remove": ["ppt.cap.placement-remove.title", "ppt.cap.placement-remove.description"],
  "ppt.search.entries": ["ppt.cap.search-entries.title", "ppt.cap.search-entries.description"],
  "ppt.files.entries": ["ppt.cap.files-entries.title", "ppt.cap.files-entries.description"],
  "ppt.subject.read": ["ppt.cap.subject-read.title", "ppt.cap.subject-read.description"],
  "ppt.content.list": ["ppt.cap.content-list.title", "ppt.cap.content-list.description"],
  "ppt.content.read": ["ppt.cap.content-read.title", "ppt.cap.content-read.description"],
  "ppt.content.receive": ["ppt.cap.content-receive.title", "ppt.cap.content-receive.description"],
  "ppt.content.create": ["ppt.cap.content-create.title", "ppt.cap.content-create.description"],
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

