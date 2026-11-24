import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginPermissionDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

const PERMISSION_REASONS: Readonly<Record<string, { readonly reason: string; readonly key: string }>> = {
  "storage:private": { reason: "在这台电脑上保存当前项目的数据表与历史版本", key: "dataset.permission.storage-private.reason" },
  "artifact:write": { reason: "把数据表保存为成果库里的固定版本", key: "dataset.permission.artifact-write.reason" },
  "artifact:read": { reason: "读取已固定的数据表版本，用于版本编号或恢复未完成的保存", key: "dataset.permission.artifact-read.reason" },
  "dataset:read": { reason: "查看当前项目的数据表、列、行与历史版本", key: "dataset.permission.dataset-read.reason" },
  "dataset:write": { reason: "新建、编辑、导入、删除数据表，以及保存或恢复历史版本", key: "dataset.permission.dataset-write.reason" },
  "model:invoke": { reason: "在你明确触发 AI 拟列名时调用已配置的文字模型", key: "dataset.permission.model-invoke.reason" },
};

const ACTION_TEXT: Readonly<Record<string, readonly [string, string]>> = {
  "dataset.artifacts.preview": ["dataset.cap.artifacts-preview.title", "dataset.cap.artifacts-preview.description"],
  "dataset.artifacts.pin": ["dataset.cap.artifacts-pin.title", "dataset.cap.artifacts-pin.description"],
  "dataset.artifacts.compare": ["dataset.cap.artifacts-compare.title", "dataset.cap.artifacts-compare.description"],
  "dataset.artifacts.continue": ["dataset.cap.artifacts-continue.title", "dataset.cap.artifacts-continue.description"],
  "dataset.list": ["dataset.cap.list.title", "dataset.cap.list.description"],
  "dataset.get": ["dataset.cap.get.title", "dataset.cap.get.description"],
  "dataset.create": ["dataset.cap.create.title", "dataset.cap.create.description"],
  "dataset.update": ["dataset.cap.update.title", "dataset.cap.update.description"],
  "dataset.delete": ["dataset.cap.delete.title", "dataset.cap.delete.description"],
  "dataset.columns.add": ["dataset.cap.columns-add.title", "dataset.cap.columns-add.description"],
  "dataset.columns.ai": ["dataset.cap.columns-ai.title", "dataset.cap.columns-ai.description"],
  "dataset.import": ["dataset.cap.import.title", "dataset.cap.import.description"],
  "dataset.export": ["dataset.cap.export.title", "dataset.cap.export.description"],
  "dataset.versions": ["dataset.cap.versions.title", "dataset.cap.versions.description"],
  "dataset.snapshot": ["dataset.cap.snapshot.title", "dataset.cap.snapshot.description"],
  "dataset.rollback": ["dataset.cap.rollback.title", "dataset.cap.rollback.description"],
  "dataset.promote": ["dataset.cap.promote.title", "dataset.cap.promote.description"],
  "dataset.search.entries": ["dataset.cap.search-entries.title", "dataset.cap.search-entries.description"],
  "dataset.subject.read": ["dataset.cap.subject-read.title", "dataset.cap.subject-read.description"],
  "dataset.files.entries": ["dataset.cap.files-entries.title", "dataset.cap.files-entries.description"],
  "dataset.files.content": ["dataset.cap.files-content.title", "dataset.cap.files-content.description"],
  "dataset.placement.move": ["dataset.cap.placement-move.title", "dataset.cap.placement-move.description"],
  "dataset.placement.copy": ["dataset.cap.placement-copy.title", "dataset.cap.placement-copy.description"],
  "dataset.content.list": ["dataset.cap.content-list.title", "dataset.cap.content-list.description"],
  "dataset.content.read": ["dataset.cap.content-read.title", "dataset.cap.content-read.description"],
  "dataset.content.receive": ["dataset.cap.content-receive.title", "dataset.cap.content-receive.description"],
  "dataset.content.create": ["dataset.cap.content-create.title", "dataset.cap.content-create.description"],
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

