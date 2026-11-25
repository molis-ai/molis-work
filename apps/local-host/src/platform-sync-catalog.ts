import { CHARACTER_PLUGIN_ID, CHARACTER_PUBLISHER_SIGNATURE } from "@molis-ai/molis-work-contracts/modules/characters";
import { modulesProjectsContract } from "@molis-ai/molis-work-contracts/modules/projects";
import type { SyncSelection } from "@molis-ai/molis-work-module-sync-replication";

/** Platform-owned stores retain their consent identities without impersonating Runtime plugins. */
export interface PlatformSyncCollection {
  readonly selection: SyncSelection;
  readonly title: string;
  readonly owner: "artifacts" | "characters" | "project-approvals" | "project-guidance" | "acceptance"
    | 'appearance' | 'surfaces' | 'prompt-overrides' | 'blueprints' | 'judgment-rules' | 'person-settings' | 'attention';
  readonly store: "library" | "process" | "characters" | "approvals" | "guidance" | "acceptance"
    | 'appearance' | 'surfaces' | 'prompt-overrides' | 'blueprints' | 'judgment-rules' | 'person-settings' | 'attention';
}
export const projectApprovalSyncSelection = { plugin_id: "system.project-approvals", publisher_id: "molis",
  publisher_signature: "official-project-approvals-binding", collection_id: "approvals",
  schema_version: /* @version sync.collection.platform.approvals */ 1 } satisfies SyncSelection;
/** The person's waiting list ("等你") and its history: the platform's own project collection, whichever plugin shows it (44B). */
export const attentionSyncSelection = { plugin_id: "system.attention", publisher_id: "molis", publisher_signature: "official-attention-binding",
  collection_id: "attention", schema_version: /* @version sync.collection.platform.attention */ 1 } satisfies SyncSelection;
function personalConfiguration(owner: 'appearance' | 'surfaces' | 'prompt-overrides' | 'blueprints' | 'judgment-rules' | 'person-settings',
  id: string, title: string, version: number): PlatformSyncCollection {
  return { owner, store: owner, title, selection: { plugin_id: 'system.' + owner, publisher_id: 'molis',
    publisher_signature: 'official-' + owner + '-binding', collection_id: id, schema_version: version } };
}
export const PLATFORM_SYNC_COLLECTIONS: readonly PlatformSyncCollection[] = [
  { owner: "artifacts", store: "library", title: "成果及固定版本", selection: { plugin_id: "system.artifacts", publisher_id: "molis", publisher_signature: "official-artifacts-binding", collection_id: "versions", schema_version: /* @version sync.collection.platform.versions */ 1 } },
  { owner: "artifacts", store: "process", title: "过程材料与固定版本", selection: { plugin_id: "system.artifacts", publisher_id: "molis", publisher_signature: "official-artifacts-binding", collection_id: "process_items", schema_version: /* @version sync.collection.platform.process_items */ 1 } },
  { owner: "characters", store: "characters", title: "角色草稿", selection: { plugin_id: CHARACTER_PLUGIN_ID, publisher_id: "molis", publisher_signature: CHARACTER_PUBLISHER_SIGNATURE, collection_id: "drafts", schema_version: /* @version sync.collection.platform.drafts */ 1 } },
  { owner: "project-approvals", store: "approvals", title: "项目审批记录与规则", selection: projectApprovalSyncSelection },
  // A project's guidance (contract-design §9): Goals carried it in `project_goals` until batch 44.
  { owner: "project-guidance", store: "guidance", title: "项目长期说明", selection: { plugin_id: "system.project-guidance", publisher_id: "molis",
    publisher_signature: "official-project-guidance-binding", collection_id: "guidance", schema_version: /* @version sync.collection.platform.guidance */ 1 } },
  // The platform's requirements and acceptance (contract-design §10.5): Goals carried a Goal's requirements in `project_goals` until batch 44.
  // It needs the approvals collection too: a decision made through the trusted-decision entry counts only once its record is here.
  { owner: "acceptance", store: "acceptance", title: "要求与认可", selection: { plugin_id: "system.acceptance", publisher_id: "molis",
    publisher_signature: "official-acceptance-binding", collection_id: "acceptance", schema_version: /* @version sync.collection.platform.acceptance */ 1 } },
  personalConfiguration('appearance', 'appearance', '外观偏好', /* @version sync.collection.platform.appearance */ 1),
  personalConfiguration('surfaces', 'surfaces', '呈现组合与布局', /* @version sync.collection.platform.surfaces */ 1),
  personalConfiguration('prompt-overrides', 'prompt_overrides', '我的提示词改写', /* @version sync.collection.platform.prompt_overrides */ 1),
  personalConfiguration('blueprints', 'blueprints', '个人蓝图草稿', /* @version sync.collection.platform.blueprints */ 1),
  personalConfiguration('judgment-rules', 'judgment_rules', '个人判断规则', /* @version sync.collection.platform.judgment_rules */ 1),
  personalConfiguration('person-settings', 'person_settings', '插件里随本人走的偏好', /* @version sync.collection.platform.person_settings */ 1),
  { owner: 'attention', store: 'attention', title: '注意事项与处理历史', selection: attentionSyncSelection },
];

/** Authoritative grouping of sync collections: platform-owned stores and project catalog vs plugin collections. */
export function isPlatformSyncSelection(selection: SyncSelection): boolean {
  if (selection.plugin_id === modulesProjectsContract.contractId && selection.collection_id === "projects") {
    return true;
  }
  return PLATFORM_SYNC_COLLECTIONS.some(
    entry => entry.selection.plugin_id === selection.plugin_id && entry.selection.collection_id === selection.collection_id,
  );
}
