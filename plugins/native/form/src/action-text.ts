import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginPermissionDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

const PERMISSION_REASONS: Readonly<Record<string, { readonly reason: string; readonly key: string }>> = {
  "storage:private": { reason: "在这台电脑上保存当前项目的问卷与答卷", key: "form.permission.storage-private.reason" },
  "artifact:write": { reason: "把问卷保存为成果库里的固定版本", key: "form.permission.artifact-write.reason" },
  "artifact:read": { reason: "读取已固定的问卷版本，用于版本编号或恢复未完成的保存", key: "form.permission.artifact-read.reason" },
  "form:read": { reason: "查看当前项目的问卷、题目设置与已收集的答卷", key: "form.permission.form-read.reason" },
  "form:write": { reason: "新建、编辑、删除问卷，以及开始或停止收集答卷", key: "form.permission.form-write.reason" },
  "model:invoke": { reason: "在你明确触发 AI 生成题目时调用已配置的文字模型", key: "form.permission.model-invoke.reason" },
  "form:submit": { reason: "向当前项目的问卷提交答卷或导入答卷文件", key: "form.permission.form-submit.reason" },
};

const ACTION_TEXT: Readonly<Record<string, readonly [string, string]>> = {
  "form.artifacts.preview": ["form.cap.artifacts-preview.title", "form.cap.artifacts-preview.description"],
  "form.artifacts.pin": ["form.cap.artifacts-pin.title", "form.cap.artifacts-pin.description"],
  "form.artifacts.compare": ["form.cap.artifacts-compare.title", "form.cap.artifacts-compare.description"],
  "form.artifacts.continue": ["form.cap.artifacts-continue.title", "form.cap.artifacts-continue.description"],
  "form.list": ["form.cap.list.title", "form.cap.list.description"],
  "form.get": ["form.cap.get.title", "form.cap.get.description"],
  "form.create": ["form.cap.create.title", "form.cap.create.description"],
  "form.update": ["form.cap.update.title", "form.cap.update.description"],
  "form.publish": ["form.cap.publish.title", "form.cap.publish.description"],
  "form.delete": ["form.cap.delete.title", "form.cap.delete.description"],
  "form.questions.add": ["form.cap.questions-add.title", "form.cap.questions-add.description"],
  "form.questions.draft": ["form.cap.questions-draft.title", "form.cap.questions-draft.description"],
  "form.submit": ["form.cap.submit.title", "form.cap.submit.description"],
  "form.results": ["form.cap.results.title", "form.cap.results.description"],
  "form.promote": ["form.cap.promote.title", "form.cap.promote.description"],
  "form.close": ["form.cap.close.title", "form.cap.close.description"],
  "form.answers.import": ["form.cap.answers-import.title", "form.cap.answers-import.description"],
  "form.results.csv": ["form.cap.results-csv.title", "form.cap.results-csv.description"],
  "form.fillpage": ["form.cap.fillpage.title", "form.cap.fillpage.description"],
  "form.placement.move": ["form.cap.placement-move.title", "form.cap.placement-move.description"],
  "form.placement.copy": ["form.cap.placement-copy.title", "form.cap.placement-copy.description"],
  "form.search.entries": ["form.cap.search-entries.title", "form.cap.search-entries.description"],
  "form.subject.read": ["form.cap.subject-read.title", "form.cap.subject-read.description"],
  "form.content.list": ["form.cap.content-list.title", "form.cap.content-list.description"],
  "form.content.read": ["form.cap.content-read.title", "form.cap.content-read.description"],
  "form.content.receive": ["form.cap.content-receive.title", "form.cap.content-receive.description"],
  "form.content.create": ["form.cap.content-create.title", "form.cap.content-create.description"],
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

