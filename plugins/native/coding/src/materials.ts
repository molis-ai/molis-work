import { SHELF_TEXT_MATERIAL_TYPE, parseShelfTextMaterial } from "@molis-ai/molis-work-contracts/modules/shelf";
import type { ArtifactReference, ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { DIFF_CHANGESET_TYPE, GIT_RESULT_TYPE, FILE_SNAPSHOT_TYPE, FILE_TEXT_SELECTION_TYPE, parseChangeSet, parseGitResult, parseFileSnapshot, parseFileTextSelection, selectionCitationLabel } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentTextMaterialContent, type AgentTextMaterial } from "@molis-ai/molis-work-contracts/services/agent-host";

export const CODING_MATERIAL_PORTS = ["before", "after", "selection", "git-changeset", "git-result"] as const;
export function materialSelection(value: unknown): ArtifactReference[] {
  if (!Array.isArray(value) || value.length > 30) throw new Error("材料选择无效，每轮最多 30 份");
  const refs = value.map(item => {
    if (!item || typeof item !== "object" || typeof item.artifact_id !== "string" || !item.artifact_id.trim()
      || item.artifact_id.length > 200 || !Number.isSafeInteger(item.version) || item.version < 1) throw new Error("材料版本无效");
    return { artifact_id: item.artifact_id as string, version: item.version as number };
  });
  if (new Set(refs.map(ref => `${ref.artifact_id}@${ref.version}`)).size !== refs.length) throw new Error("材料选择重复");
  return refs;
}
export function savedMaterials(context: PluginStartContext, sessionId: string): ArtifactReference[] {
  const value = context.services?.storage?.get(`materials:${sessionId}`);
  return typeof value === "string" ? materialSelection(JSON.parse(value)) : [];
}
function materialFrom(record: ArtifactVersionRecord | null): AgentTextMaterial {
  if (!record || record.availability !== "available" || record.lifecycle_state !== "active") throw new Error("材料已归档或不可读，请移除或重新选择");
  if (record.schema_version !== 1 || record.content_kind !== "inline") throw new Error("材料没有可读取的固定正文");
  let title: string, text: string;
  if (record.artifact_type_id === SHELF_TEXT_MATERIAL_TYPE) {
    if (record.producer_plugin_id !== "io.molis.work.shelf" || record.producer_binding_signature !== "official-shelf-binding") throw new Error("Shelf 材料来源不一致");
    const snapshot = parseShelfTextMaterial(record.payload);
    if (record.artifact_id !== "shelf-material:" + record.board_id + ":" + snapshot.source.item_id) throw new Error("Shelf 材料身份不一致");
    title = `Shelf / ${snapshot.title}`;
    text = snapshot.text;
  } else if (record.artifact_type_id === DIFF_CHANGESET_TYPE) {
    const change = parseChangeSet(record.payload);
    title = `固定差异 / ${change.workspace.name} / ${change.path.join("/")}`;
    text = ["这是读取时的固定差异，不代表当前磁盘或暂存区，也不授权应用或重试。",
      `工作区：${change.workspace.name}（${change.workspace.workspace_id}）`, `路径：${change.path.join("/")}`,
      `来源：${JSON.stringify(change.source)}`,
      ...(change.git ? [`文件模式：${change.git.before_mode ?? "不存在"} → ${change.git.after_mode ?? "不存在"}`,
        ...(change.git.previous_path ? [`原路径：${change.git.previous_path.join("/")}`] : [])] : []),
      `\n变更前（${change.before_exists ? "存在" : "不存在"}）：\n${change.before}`,
      `\n变更后（${change.after_exists ? "存在" : "不存在"}）：\n${change.after}`].join("\n");
  } else if (record.artifact_type_id === GIT_RESULT_TYPE) {
    const result = parseGitResult(record.payload);
    title = `Git 结果 / ${result.summary}`;
    // Keep extension fields (including original failure/reconciliation provenance) in the data resource.
    // They are quoted source data, never permissions, role instructions or a new execution receipt.
    text = `${result.summary}\n\n这是已保存的历史操作记录，不代表当前工作区状态，也不授权重试或标记 Goal 验收。\n原记录（固定版本）：\n${JSON.stringify(record.payload, null, 2)}`;
  } else {
    const selection = record.artifact_type_id === FILE_TEXT_SELECTION_TYPE;
    if (!selection && record.artifact_type_id !== FILE_SNAPSHOT_TYPE) throw new Error("这份材料不是可读取的文件、差异或 Git 结果");
    const snapshot = selection ? parseFileTextSelection(record.payload) : parseFileSnapshot(record.payload);
    title = `${snapshot.workspace.name} / ${selection ? selectionCitationLabel(parseFileTextSelection(record.payload)) : snapshot.path.join("/")}`;
    text = snapshot.text;
  }
  const material = { material_id: `${record.artifact_id}@${record.version}`, title, text,
    source_artifact_id: record.artifact_id, source_version: record.version };
  // Same envelope and bound as the model-facing adapter; never truncate a selected source.
  agentTextMaterialContent(material);
  return material;
}
function readMaterial(context: PluginStartContext, reference: ArtifactReference): AgentTextMaterial {
  try { return materialFrom(context.services!.artifacts.read(reference)); }
  catch (error) {
    if ((error as { code?: string }).code === "plugin_artifact_incompatible") throw new Error("材料已归档、不可用或类型不兼容，请移除后重新选择");
    throw error;
  }
}
export function resolveMaterials(context: PluginStartContext, refs: ArtifactReference[]): AgentTextMaterial[] {
  return refs.map(ref => readMaterial(context, ref));
}
export function materialChoices(context: PluginStartContext, selected: ArtifactReference[], projectMaterials: ArtifactReference[] = []) {
  const candidates = new Map<string, { reference: ArtifactReference; source: string }>();
  for (const port of CODING_MATERIAL_PORTS) {
    const ref = context.services?.inputs?.reference(port);
    if (ref) candidates.set(`${ref.artifact_id}@${ref.version}`, { reference: ref, source: { before: "对比前", after: "对比后", selection: "选区", "git-changeset": "Git 固定差异", "git-result": "Git 操作结果" }[port] });
  }
  for (const ref of projectMaterials) candidates.set(`${ref.artifact_id}@${ref.version}`, { reference: ref, source: "Shelf 项目材料" });
  for (const ref of selected) if (!candidates.has(`${ref.artifact_id}@${ref.version}`)) candidates.set(`${ref.artifact_id}@${ref.version}`, { reference: ref, source: "已选固定版本" });
  return [...candidates.values()].map(({ reference, source }) => {
    try {
      const material = readMaterial(context, reference);
      return { reference, source, title: material.title, text: material.text, error: null };
    } catch (error) { return { reference, source, title: "不可用材料", text: null, error: error instanceof Error ? error.message : "材料不可读" }; }
  });
}
