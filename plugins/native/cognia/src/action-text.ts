import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginPermissionDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

const PERMISSION_REASONS: Readonly<Record<string, { readonly reason: string; readonly key: string }>> = {
  "cognia:read": { reason: "读取和搜索你已导入的 Cognia 知识库资料、固定版本与审阅草稿", key: "cognia.permission.cognia-read.reason" },
  "cognia:write": { reason: "导入、新建、修改或删除 Cognia 知识库中的领域、来源、资料和草稿", key: "cognia.permission.cognia-write.reason" },
  "directory:read": { reason: "只读扫描你明确授权的本地文件夹，用于预览和导入知识资料", key: "cognia.permission.directory-read.reason" },
  "model:invoke": { reason: "调用已配置的文字模型，根据选定资料整理知识或回答问题", key: "cognia.permission.model-invoke.reason" },
  "storage:private": { reason: "在本地保存你的 Cognia 知识库资料、固定版本和审阅草稿", key: "cognia.permission.storage-private.reason" },
};

const ACTION_TEXT: Readonly<Record<string, readonly [string, string]>> = {
  "cognia.workspace.get": ["cognia.cap.workspace-get.title", "cognia.cap.workspace-get.description"],
  "cognia.material.search": ["cognia.cap.material-search.title", "cognia.cap.material-search.description"],
  "cognia.material.get": ["cognia.cap.material-get.title", "cognia.cap.material-get.description"],
  "cognia.material.download": ["cognia.cap.material-download.title", "cognia.cap.material-download.description"],
  "cognia.domain.create": ["cognia.cap.domain-create.title", "cognia.cap.domain-create.description"],
  "cognia.domain.update": ["cognia.cap.domain-update.title", "cognia.cap.domain-update.description"],
  "cognia.domain.delete": ["cognia.cap.domain-delete.title", "cognia.cap.domain-delete.description"],
  "cognia.source.update": ["cognia.cap.source-update.title", "cognia.cap.source-update.description"],
  "cognia.source.delete": ["cognia.cap.source-delete.title", "cognia.cap.source-delete.description"],
  "cognia.material.create": ["cognia.cap.material-create.title", "cognia.cap.material-create.description"],
  "cognia.material.update": ["cognia.cap.material-update.title", "cognia.cap.material-update.description"],
  "cognia.material.delete": ["cognia.cap.material-delete.title", "cognia.cap.material-delete.description"],
  "cognia.import.preview": ["cognia.cap.import-preview.title", "cognia.cap.import-preview.description"],
  "cognia.directory.scan": ["cognia.cap.directory-scan.title", "cognia.cap.directory-scan.description"],
  "cognia.import.directory_preview": ["cognia.cap.import-directory-preview.title", "cognia.cap.import-directory-preview.description"],
  "cognia.import.commit": ["cognia.cap.import-commit.title", "cognia.cap.import-commit.description"],
  "cognia.import.cancel": ["cognia.cap.import-cancel.title", "cognia.cap.import-cancel.description"],
  "cognia.knowledge.synthesize": ["cognia.cap.knowledge-synthesize.title", "cognia.cap.knowledge-synthesize.description"],
  "cognia.knowledge.query": ["cognia.cap.knowledge-query.title", "cognia.cap.knowledge-query.description"],
  "cognia.draft.get": ["cognia.cap.draft-get.title", "cognia.cap.draft-get.description"],
  "cognia.draft.save": ["cognia.cap.draft-save.title", "cognia.cap.draft-save.description"],
  "cognia.draft.archive": ["cognia.cap.draft-archive.title", "cognia.cap.draft-archive.description"],
  "cognia.search.entries": ["cognia.cap.search-entries.title", "cognia.cap.search-entries.description"],
  "cognia.subject.read": ["cognia.cap.subject-read.title", "cognia.cap.subject-read.description"],
  "cognia.files.entries": ["cognia.cap.files-entries.title", "cognia.cap.files-entries.description"],
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

