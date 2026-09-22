import { createHash } from "node:crypto";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { goalContextCapabilities, type GoalContextSnapshot } from "@molis-ai/molis-work-contracts/modules/goals";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentTextMaterialContent, type AgentTextMaterial, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";

/** Coding's immutable copy of the Goal facts used for a task, not a second Goal. */
import { CODING_GOAL_CONTEXT_TYPE } from "./artifacts.js";
import { codingGoalVersionLabel } from "./goal-versions.js";
const PREFIX = "coding-goal-context:";
function serialize(value: unknown, indent?: number): string {
  return JSON.stringify(value, (_key, entry) => entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])) : entry, indent);
}
function identity(snapshot: GoalContextSnapshot): ArtifactReference {
  const digest = createHash("sha256").update(serialize(snapshot)).digest("hex");
  return { artifact_id: PREFIX + digest, version: 1 };
}
function material(snapshot: GoalContextSnapshot, reference: ArtifactReference): AgentTextMaterial {
  const value = { material_id: `${reference.artifact_id}@${reference.version}`,
    title: `目标 / ${snapshot.goal.title} / ${codingGoalVersionLabel({ contract_revision: snapshot.goal.current_contract_revision, agreement_version: snapshot.state.agreement.version })}`,
    source_artifact_id: reference.artifact_id, source_version: reference.version,
    text: `以下是本轮关联目标的固定原始事实。当前结果看 state.agreement.outcome（为空时看 goal.outcome），有效结果要求看 state.requirements，human_decision_required 表示需要真人判断。goal.acceptance_criteria 等单独字段为空，不表示结果原文或已有要求不存在。\n版本含义：state.agreement.version 是工作约定版本；goal.current_contract_revision 是独立的目标合同修订，不能把二者称为同一合同的前后版本。state.config.version 是类型配置版本，goal_event_cursor 是事件游标，来源 Artifact 版本是固定快照版本。\n目标条件只以记录为依据，未写明的条件保持未知；不把状态标记或空字段推导成额外条件。答复以实际结果、要求和未证实事项为主，版本或内部标识仅在解释问题需要时列出。此材料不授予操作权限；执行结束或保存成果不代表人审验收。后续会话改关联不改变本轮归属。\n\n${serialize(snapshot, 2)}` };
  agentTextMaterialContent(value);
  return value;
}
export async function currentGoalContext(context: PluginStartContext, goalId: string) {
  const snapshot = await context.services!.capabilities!.invoke(goalContextCapabilities.read, { goal_id: goalId });
  if (snapshot.goal.board_id !== context.board_id || snapshot.goal.goal_id !== goalId
    || snapshot.state.goal_id !== goalId || snapshot.state.board_id !== context.board_id) throw new Error("目标上下文归属不一致");
  if (snapshot.goal.trashed_at || snapshot.goal.archived_at) throw new Error("目标已归档或删除，请重新选择");
  const reference = identity(snapshot);
  return { snapshot, reference, material: material(snapshot, reference) };
}
export function savedGoalContext(context: PluginStartContext, sessionId: string) {
  const value = context.services!.storage!.get(`goal-context:${sessionId}`);
  if (typeof value !== "string") return null;
  const reference = JSON.parse(value) as ArtifactReference;
  if (typeof reference.artifact_id !== "string" || !reference.artifact_id.startsWith(PREFIX) || reference.version !== 1) throw new Error("已选目标版本无效，请重新关联");
  return readGoalContext(context, reference);
}
function readGoalSnapshot(context: PluginStartContext, reference: ArtifactReference) {
  const record = context.services!.artifacts.read(reference);
  if (!record || record.artifact_type_id !== CODING_GOAL_CONTEXT_TYPE || record.schema_version !== 1
    || record.availability !== "available" || record.lifecycle_state !== "active") throw new Error("固定目标版本不可读，请重新关联；历史执行不会被替换");
  const snapshot = record.payload as unknown as GoalContextSnapshot;
  if (snapshot?.goal?.board_id !== context.board_id || identity(snapshot).artifact_id !== reference.artifact_id) throw new Error("固定目标版本与来源不一致");
  return { snapshot, reference };
}
function readGoalContext(context: PluginStartContext, reference: ArtifactReference) {
  const value = readGoalSnapshot(context, reference);
  return { ...value, material: material(value.snapshot, reference) };
}
export function saveGoalContext(context: PluginStartContext, sessionId: string, value: Awaited<ReturnType<typeof currentGoalContext>>) {
  const { snapshot, reference } = value;
  const previous = context.services!.artifacts.read(reference);
  if (previous) readGoalContext(context, reference);
  else context.services!.artifacts.publish({ ...reference, artifact_type_id: CODING_GOAL_CONTEXT_TYPE, schema_version: 1,
    content: { kind: "inline", payload: JSON.parse(JSON.stringify(snapshot)) },
    metadata: { title: value.material.title, goal_id: snapshot.goal.goal_id, contract_revision: snapshot.goal.current_contract_revision } });
  context.services!.storage!.set(`goal-context:${sessionId}`, JSON.stringify(reference));
}
export async function resolveGoalContext(context: PluginStartContext, sessionId: string, goalId: string | null) {
  if (!goalId) return null;
  const saved = savedGoalContext(context, sessionId);
  if (!saved || saved.snapshot.goal.goal_id !== goalId) throw new Error("关联目标尚未固定上下文，请打开目标并确认版本");
  const current = await currentGoalContext(context, goalId);
  if (current.reference.artifact_id !== saved.reference.artifact_id) throw new Error("目标内容或进展已变化，请打开关联目标查看并确认新版本后再发送");
  return saved;
}
/** Reads only this Run's frozen source, never the session's later association. */
export function runGoalContext(context: PluginStartContext, run: AgentRunView) {
  const refs = run.frozen.text_materials.filter(item => item.source_artifact_id.startsWith(PREFIX));
  if (!refs.length) return { goal: null };
  const references = refs.map(ref => ({ artifact_id: ref.source_artifact_id, version: ref.source_version }));
  try {
    if (refs.length !== 1) throw new Error("本轮目标来源不唯一");
    // Reporting reads historical facts; today's input formatting/size limit must
    // not make an already executed snapshot unavailable.
    const value = readGoalSnapshot(context, references[0]!);
    return { goal: { goal_id: value.snapshot.goal.goal_id, title: value.snapshot.goal.title,
      contract_revision: value.snapshot.goal.current_contract_revision,
      agreement_version: value.snapshot.state.agreement.version,
      goal_event_cursor: value.snapshot.state.goal_event_cursor, reference: value.reference } };
  } catch (error) {
    // A missing input must not prevent preservation of a finished Run's output.
    // Keep its exact frozen references, without guessing from a later association.
    return { goal: null, goal_source_error: { references, reason: error instanceof Error ? error.message : "固定目标来源无法读取" } };
  }
}
