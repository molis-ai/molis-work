import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginPermissionDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

const PERMISSION_REASONS: Readonly<Record<string, { readonly reason: string; readonly key: string }>> = {
  "pages:read": { reason: "读取当前项目的文档与文件夹", key: "pages.permission.pages-read.reason" },
  "pages:write": { reason: "在当前项目中新建、编辑、整理或删除文档与文件夹", key: "pages.permission.pages-write.reason" },
  "materials:read": { reason: "读取导入的文件与材料内容，用于预览、导入或基于固定版本新建文档", key: "pages.permission.materials-read.reason" },
  "model:invoke": { reason: "在你明确触发 AI 写作或整理材料时调用已配置的文字模型", key: "pages.permission.model-invoke.reason" },
  "storage:private": { reason: "在这台电脑上保存当前项目的文档、文件夹与编辑记录", key: "pages.permission.storage-private.reason" },
  "artifact:write": { reason: "把文档保存为成果库里的固定版本", key: "pages.permission.artifact-write.reason" },
  "artifact:read": { reason: "读取已固定的文档版本，用于版本编号、恢复或对比改动", key: "pages.permission.artifact-read.reason" },
  "goals:read": { reason: "项目启用 Goals 时，读取目标列表以选择文档所属的目标", key: "pages.permission.goals-read.reason" },
};

const ACTION_TEXT: Readonly<Record<string, readonly [string, string]>> = {
  "pages.comments.list": ["pages.cap.comments-list.title", "pages.cap.comments-list.description"],
  "pages.comments.append": ["pages.cap.comments-append.title", "pages.cap.comments-append.description"],
  "pages.comments.context": ["pages.cap.comments-context.title", "pages.cap.comments-context.description"],
  "pages.comments.reply": ["pages.cap.comments-reply.title", "pages.cap.comments-reply.description"],
  "pages.landing.insert": ["pages.cap.landing-insert.title", "pages.cap.landing-insert.description"],
  "pages.landing.replace": ["pages.cap.landing-replace.title", "pages.cap.landing-replace.description"],
  "pages.landing.quote": ["pages.cap.landing-quote.title", "pages.cap.landing-quote.description"],
  "pages.presentation.values": ["pages.cap.presentation-values.title", "pages.cap.presentation-values.description"],
  "pages.subject.read": ["pages.cap.subject-read.title", "pages.cap.subject-read.description"],
  "pages.fragment.offers": ["pages.cap.fragment-offers.title", "pages.cap.fragment-offers.description"],
  "pages.intake.offers": ["pages.cap.intake-offers.title", "pages.cap.intake-offers.description"],
  "pages.search.entries": ["pages.cap.search-entries.title", "pages.cap.search-entries.description"],
  "pages.files.entries": ["pages.cap.files-entries.title", "pages.cap.files-entries.description"],
  "pages.files.content": ["pages.cap.files-content.title", "pages.cap.files-content.description"],
  "pages.artifacts.preview": ["pages.cap.artifacts-preview.title", "pages.cap.artifacts-preview.description"],
  "pages.artifacts.pin": ["pages.cap.artifacts-pin.title", "pages.cap.artifacts-pin.description"],
  "pages.artifacts.compare": ["pages.cap.artifacts-compare.title", "pages.cap.artifacts-compare.description"],
  "pages.artifacts.diff": ["pages.cap.artifacts-diff.title", "pages.cap.artifacts-diff.description"],
  "pages.artifacts.continue": ["pages.cap.artifacts-continue.title", "pages.cap.artifacts-continue.description"],
  "pages.artifacts.referrers": ["pages.cap.artifacts-referrers.title", "pages.cap.artifacts-referrers.description"],
  "pages.placement.export": ["pages.cap.placement-export.title", "pages.cap.placement-export.description"],
  "pages.placement.put": ["pages.cap.placement-put.title", "pages.cap.placement-put.description"],
  "pages.placement.remove": ["pages.cap.placement-remove.title", "pages.cap.placement-remove.description"],
  "pages.list": ["pages.cap.list.title", "pages.cap.list.description"],
  "pages.templates": ["pages.cap.templates.title", "pages.cap.templates.description"],
  "pages.get": ["pages.cap.get.title", "pages.cap.get.description"],
  "pages.create": ["pages.cap.create.title", "pages.cap.create.description"],
  "pages.discard": ["pages.cap.discard.title", "pages.cap.discard.description"],
  "pages.update": ["pages.cap.update.title", "pages.cap.update.description"],
  "pages.revert": ["pages.cap.revert.title", "pages.cap.revert.description"],
  "pages.delete": ["pages.cap.delete.title", "pages.cap.delete.description"],
  "pages.folders.create": ["pages.cap.folders-create.title", "pages.cap.folders-create.description"],
  "pages.folders.update": ["pages.cap.folders-update.title", "pages.cap.folders-update.description"],
  "pages.folders.delete": ["pages.cap.folders-delete.title", "pages.cap.folders-delete.description"],
  "pages.import.preview": ["pages.cap.import-preview.title", "pages.cap.import-preview.description"],
  "pages.import": ["pages.cap.import.title", "pages.cap.import.description"],
  "pages.documents.import": ["pages.cap.documents-import.title", "pages.cap.documents-import.description"],
  "pages.documents.body_from_markdown": ["pages.cap.documents-body-from-markdown.title", "pages.cap.documents-body-from-markdown.description"],
  "pages.generations.list": ["pages.cap.generations-list.title", "pages.cap.generations-list.description"],
  "pages.generations.get": ["pages.cap.generations-get.title", "pages.cap.generations-get.description"],
  "pages.generate": ["pages.cap.generate.title", "pages.cap.generate.description"],
  "pages.ai": ["pages.cap.ai.title", "pages.cap.ai.description"],
  "pages.promote": ["pages.cap.promote.title", "pages.cap.promote.description"],
  "pages.extract": ["pages.cap.extract.title", "pages.cap.extract.description"],
  "pages.onboarding.documents": ["pages.cap.onboarding-documents.title", "pages.cap.onboarding-documents.description"],
  "pages.content.list": ["pages.cap.content-list.title", "pages.cap.content-list.description"],
  "pages.content.read": ["pages.cap.content-read.title", "pages.cap.content-read.description"],
  "pages.content.receive": ["pages.cap.content-receive.title", "pages.cap.content-receive.description"],
  "pages.content.create": ["pages.cap.content-create.title", "pages.cap.content-create.description"],
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

