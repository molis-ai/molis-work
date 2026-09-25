import { SHELF_TEXT_MATERIAL_TYPE, parseShelfTextMaterial } from "@molis-ai/molis-work-contracts/modules/shelf";
import type { ArtifactReference, ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { compareTexts, DIFF_CHANGESET_TYPE, GIT_RESULT_TYPE, FILE_SNAPSHOT_TYPE, FILE_TEXT_SELECTION_TYPE, parseChangeSet, parseGitResult, parseFileSnapshot, parseFileTextSelection, selectionCitationLabel } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentTextMaterialContent, type AgentTextMaterial } from "@molis-ai/molis-work-contracts/services/agent-host";
import { CODING_PLAN_TYPE } from "./artifacts.js";
import { codingReportPreview } from "./report.js";
import { codingChangeSetPreview } from "./changeset.js";

/**
 * A file change as unified-diff text: the stored diff when there is one, otherwise derived from the original review's
 * before and after text, with three lines of context around each change.
 */
export function fileDiff(file: { diff: string; review?: { before_text: string | null; after_text: string } }): string {
  if (file.diff.trim() || !file.review) return file.diff;
  const ops = compareTexts(file.review.before_text ?? "", file.review.after_text).ops, keep = new Set<number>();
  ops.forEach((op, index) => { if (op.kind !== "equal") for (let near = Math.max(0, index - 3); near <= Math.min(ops.length - 1, index + 3); near++) keep.add(near); });
  const lines: string[] = [];
  ops.forEach((op, index) => {
    if (!keep.has(index)) { if (lines.at(-1) !== "…") lines.push("…"); return; }
    lines.push((op.kind === "insert" ? "+ " : op.kind === "delete" ? "- " : "  ") + op.line.text);
  });
  return lines.join("\n");
}

/** Names a session for a reference's provenance; unknown when the session is gone. */
export type SessionTitle = (sessionId: string) => string | undefined;
const sessionLabel = (title: SessionTitle | undefined, sessionId: string) => `会话「${title?.(sessionId) ?? "已不存在的会话"}」`;
const REFERENCE_NOTE = "只读引用固定版本：它记录的是那一轮当时的情况，不代表当前工作区，也不授权任何操作；需要当前内容请重新读取。";

export const CODING_MATERIAL_PORTS = ["materials", "before", "after", "selection", "git-changeset", "git-result"] as const;
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
function materialFrom(record: ArtifactVersionRecord | null, sessionTitle?: SessionTitle): AgentTextMaterial {
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
  } else if (codingReportPreview(record)) {
    // A fixed output of a Coding session, cited from this or another session.
    const report = codingReportPreview(record)!;
    title = `${sessionLabel(sessionTitle, report.session_id)} / 报告 / ${report.title}`;
    text = `这是${sessionLabel(sessionTitle, report.session_id)}一轮执行的固定报告（${report.saved_at}）。${REFERENCE_NOTE}\n\n${report.body_markdown}`;
  } else if (codingChangeSetPreview(record)) {
    const saved = codingChangeSetPreview(record)!, change = saved.change;
    title = `${sessionLabel(sessionTitle, saved.session_id)} / 固定变更 / ${saved.title}`;
    text = [`这是${sessionLabel(sessionTitle, saved.session_id)}一轮的固定变更（${saved.saved_at}，${change.applied ? "当时已写入那一轮的工作区" : "当时尚未写入磁盘"}）。${REFERENCE_NOTE}`,
      ...change.files.map(file => `\n### ${file.path}（${{ added: "新增", modified: "修改", deleted: "删除" }[file.kind]}，+${file.added_lines} / −${file.removed_lines}${file.review ? `，审查${{ applied: "已写入", failed: "写入失败", unknown: "结果未知", "not-applied": "未写入" }[file.review.execution]}` : ""}）\n${fileDiff(file)}`)].join("\n");
  } else if (record.artifact_type_id === CODING_PLAN_TYPE) {
    const plan = record.payload as { revision?: number; source?: { session_id?: string }; content?: { title?: string } } | null;
    if (record.producer_plugin_id !== "io.molis.work.coding" || record.producer_binding_signature !== "official-coding-binding" || !plan?.source?.session_id || typeof plan.content?.title !== "string") throw new Error("计划来源不一致");
    title = `${sessionLabel(sessionTitle, plan.source.session_id)} / 确认计划 / ${plan.content.title}`;
    text = `这是${sessionLabel(sessionTitle, plan.source.session_id)}确认过的计划（修订 ${plan.revision}）。它不是本会话的计划，不按它自动执行步骤。${REFERENCE_NOTE}\n\n${JSON.stringify(plan.content, null, 2)}`;
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
function readMaterial(context: PluginStartContext, reference: ArtifactReference, sessionTitle?: SessionTitle): AgentTextMaterial {
  try { return materialFrom(context.services!.artifacts.read(reference), sessionTitle); }
  catch (error) {
    if ((error as { code?: string }).code === "plugin_artifact_incompatible") throw new Error("材料已归档、不可用或类型不兼容，请移除后重新选择");
    throw error;
  }
}
export function resolveMaterials(context: PluginStartContext, refs: ArtifactReference[], sessionTitle?: SessionTitle): AgentTextMaterial[] {
  return refs.map(ref => readMaterial(context, ref, sessionTitle));
}
/**
 * What can be attached to the next round: inputs, Shelf materials, and the fixed outputs of this project's Coding
 * sessions (reports, fixed changes, confirmed plans), each read at its fixed version and labelled with its session.
 */
export function materialChoices(context: PluginStartContext, selected: ArtifactReference[], projectMaterials: ArtifactReference[] = [],
  sessionOutputs: ReadonlyArray<{ reference: ArtifactReference; session_id: string }> = [], sessionTitle?: SessionTitle, currentSession?: string) {
  const candidates = new Map<string, { reference: ArtifactReference; source: string }>();
  for (const port of CODING_MATERIAL_PORTS) {
    const ref = context.services?.inputs?.reference(port);
    if (ref) candidates.set(`${ref.artifact_id}@${ref.version}`, { reference: ref, source: { materials: "Shelf 材料输入", before: "对比前", after: "对比后", selection: "选区", "git-changeset": "Git 固定差异", "git-result": "Git 操作结果" }[port] });
  }
  for (const ref of projectMaterials) if (!candidates.has(`${ref.artifact_id}@${ref.version}`)) candidates.set(`${ref.artifact_id}@${ref.version}`, { reference: ref, source: "Shelf 项目材料" });
  for (const output of sessionOutputs) if (!candidates.has(`${output.reference.artifact_id}@${output.reference.version}`))
    candidates.set(`${output.reference.artifact_id}@${output.reference.version}`, { reference: output.reference, source: output.session_id === currentSession ? "本会话的固定成果" : "其他会话的固定成果" });
  for (const ref of selected) if (!candidates.has(`${ref.artifact_id}@${ref.version}`)) candidates.set(`${ref.artifact_id}@${ref.version}`, { reference: ref, source: "已选固定版本" });
  return [...candidates.values()].map(({ reference, source }) => {
    try {
      const material = readMaterial(context, reference, sessionTitle);
      return { reference, source, title: material.title, text: material.text, error: null };
    } catch (error) { return { reference, source, title: "不可用材料", text: null, error: error instanceof Error ? error.message : "材料不可读" }; }
  });
}
