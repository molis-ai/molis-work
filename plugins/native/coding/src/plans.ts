import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { requestText } from "./continuation.js";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentTextMaterialContent, type AgentRunView, type AgentTextMaterial } from "@molis-ai/molis-work-contracts/services/agent-host";
import { CODING_PLAN_TYPE } from "./artifacts.js";

export interface CodingPlanContent {
  title: string;
  steps: Array<{ title: string; acceptance: string }>;
  blockers: string;
  change_reason: string;
}
export interface CodingPlanDraft {
  revision: number;
  content: CodingPlanContent;
  source: { session_id: string; run_id: string; task: string; workspace_path: string };
  confirmed: ArtifactReference | null;
}
export function parseCodingPlan(value: unknown): CodingPlanContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("计划格式无效");
  const entry = value as Record<string, unknown>;
  const text = (value: unknown, label: string, max: number, optional = false): string => {
    if (typeof value !== "string" || value.length > max || !optional && !value.trim()) throw new Error(`${label}无效或过长`);
    return value.trim();
  };
  if (!Array.isArray(entry.steps) || !entry.steps.length || entry.steps.length > 20) throw new Error("计划需包含 1–20 个有序步骤");
  const content = { title: text(entry.title, "计划标题", 200), steps: entry.steps.map((step: unknown) => {
    if (!step || typeof step !== "object" || Array.isArray(step)) throw new Error("计划步骤无效");
    const one = step as Record<string, unknown>;
    return { title: text(one.title, "步骤", 1000), acceptance: text(one.acceptance, "完成条件", 1000) };
  }), blockers: text(entry.blockers ?? "", "阻塞", 2000, true), change_reason: text(entry.change_reason ?? "", "变更说明", 2000, true) };
  if (JSON.stringify(content).length > 12_000) throw new Error("计划正文超过 12,000 字符，请保留具体步骤与完成条件");
  return content;
}
export function parseCodingPlanAnswer(answer: string): CodingPlanContent {
  // Providers may prepend commentary. A single explicit JSON block is still
  // unambiguous; two competing blocks must never silently choose one.
  const blocks = [...answer.matchAll(/^```(?:json)?[^\S\n]*\n([\s\S]*?)\n```[^\S\n]*$/gim)];
  if (blocks.length > 1) throw new Error("回答包含多个计划版本，请明确保留一个提案");
  // A single complete JSON object on its own final lines may follow prose.
  // No braces are permitted in the prefix, and JSON.parse still rejects a
  // second object or trailing commentary rather than selecting one silently.
  const trimmed = answer.trim();
  const raw = blocks.length === 1 ? blocks[0]![1]! : trimmed.match(/^[^{}]*\n(\{[\s\S]*\})$/)?.[1] ?? trimmed;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("模型没有返回有效计划，原回答仍保留。请补充要求让它重新规划。"); }
  return parseCodingPlan(parsed);
}
export function planFromRun(sessionId: string, run: AgentRunView): Omit<CodingPlanDraft, "revision" | "confirmed"> {
  if (run.phase !== "completed" || run.frozen.role_id !== "planner") throw new Error("请等待规划轮次完成，再查看提案");
  const answer = run.turns.filter(turn => turn.kind === "assistant").at(-1)?.text.trim() ?? "";
  const task = run.turns.filter(turn => turn.kind === "user" && !turn.steer).map(turn => requestText(turn.text)).join("\n\n");
  return { content: parseCodingPlanAnswer(answer), source: { session_id: sessionId, run_id: run.ref.run_id, task, workspace_path: run.frozen.directory.canonical_path } };
}
export function planReference(sessionId: string, revision: number): ArtifactReference {
  return { artifact_id: `coding-plan:${sessionId}:${revision}`, version: 1 };
}
export function confirmedPlan(context: PluginStartContext, sessionId: string, revision: number) {
  const reference = planReference(sessionId, revision), record = context.services!.artifacts.read(reference);
  if (!record || record.artifact_type_id !== CODING_PLAN_TYPE || record.schema_version !== 1
    || record.producer_plugin_id !== context.plugin_id || record.producer_binding_signature !== "official-coding-binding"
    || record.board_id !== context.board_id || record.content_kind !== "inline" || record.availability !== "available"
    || record.lifecycle_state !== "active") throw new Error("确认计划不可读，请重新查看原计划");
  const plan = record.payload as unknown as CodingPlanDraft;
  if (plan?.revision !== revision || plan.source?.session_id !== sessionId || !plan.source?.run_id
    || typeof plan.source.task !== "string" || typeof plan.source.workspace_path !== "string") throw new Error("计划来源与当前会话不一致");
  const content = parseCodingPlan(plan.content);
  if (content.blockers) throw new Error("计划仍有未解决阻塞");
  return { ...plan, content, confirmed: reference };
}
export function planMaterial(plan: CodingPlanDraft): AgentTextMaterial {
  if (!plan.confirmed) throw new Error("请先确认这个计划版本");
  const ref = plan.confirmed;
  const material = { material_id: `${ref.artifact_id}@${ref.version}`, source_artifact_id: ref.artifact_id,
    source_version: ref.version, title: `确认计划 / ${plan.content.title} / 修订 ${plan.revision}`,
    text: `以下是用户确认的固定计划。按有序步骤核对实际完成条件；如发现阻塞或需要实质变更，说明证据并等待调整计划，不自行扩大范围。确认不批准任何文件修改或命令，不代表步骤已完成；执行、检查与用户验收分别报告。\n\n${JSON.stringify({ revision: plan.revision, ...plan.content }, null, 2)}` };
  agentTextMaterialContent(material);
  return material;
}
