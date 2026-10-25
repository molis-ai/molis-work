import { codingArtifacts } from "./artifacts.js";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { CONTINUATION_MARKER, originalTask, requestText } from "./continuation.js";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentTextMaterialContent, type AgentRunView, type AgentTextMaterial } from "@molis-ai/molis-work-contracts/services/agent-host";
import { CODING_PLAN_TYPE } from "./artifacts.js";
import { parseCodingPlan, parseCodingPlanAnswer, type CodingPlanContent } from "./plan-content.js";

export interface CodingPlanDraft {
  revision: number;
  content: CodingPlanContent;
  source: { session_id: string; run_id: string; task: string; workspace_path: string };
  confirmed: ArtifactReference | null;
}
/**
 * The task a plan serves. A plan worked out over several planning rounds belongs to the request that started them;
 * what was said in later planning rounds is kept as notes, named as such: nothing checked that the plan took each one up
 * (specs/ai-input-receipts G14). A resumed round adds nothing of its own. `chain` runs oldest first and ends with the
 * round the proposal came from.
 */
export function planTask(chain: readonly AgentRunView[]): string {
  const [root, ...later] = chain;
  const asked = (run: AgentRunView) => run.turns.filter(turn => turn.kind === "user" && !turn.steer).map(turn => requestText(turn.text).trim()).filter(Boolean);
  const first = asked(root!)[0]?.startsWith(CONTINUATION_MARKER) ? [originalTask(root!).trim()] : asked(root!);
  const notes = later.flatMap(asked).filter(text => !text.startsWith(CONTINUATION_MARKER));
  return first.join("\n\n") + (notes.length ? "\n\n规划时补充的意见（没有逐条核对是否已写进计划；以确认的计划为准）：\n" + notes.map(text => "- " + text).join("\n") : "");
}
export function planFromRun(sessionId: string, run: AgentRunView, earlier: readonly AgentRunView[] = []): Omit<CodingPlanDraft, "revision" | "confirmed"> {
  if (run.phase !== "completed" || run.frozen.role_id !== "planner") throw new Error("请等待规划轮次完成，再查看提案");
  if (!run.frozen.directory) throw new Error("代码计划需要原授权工作区");
  const answer = run.turns.filter(turn => turn.kind === "assistant").at(-1)?.text.trim() ?? "";
  return { content: parseCodingPlanAnswer(answer), source: { session_id: sessionId, run_id: run.ref.run_id, task: planTask([...earlier, run]), workspace_path: run.frozen.directory.canonical_path } };
}
export function planReference(sessionId: string, revision: number): ArtifactReference {
  return { artifact_id: `coding-plan:${sessionId}:${revision}`, version: 1 };
}
export function confirmedPlan(context: PluginStartContext, sessionId: string, revision: number) {
  const reference = planReference(sessionId, revision), record = codingArtifacts(context).read(reference);
  if (!record || record.artifact_type_id !== CODING_PLAN_TYPE || record.schema_version !== 1
    || record.producer_plugin_id !== context.plugin_id || record.producer_binding_signature !== "official-coding-binding"
    || record.project_id !== context.project_id || record.content_kind !== "inline" || record.availability !== "available"
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
    text: `以下是用户确认的固定计划。按有序步骤核对实际完成条件；如发现阻塞或需要实质变更，说明证据并等待调整计划，不自行扩大范围。确认不批准任何文件修改或命令，不代表步骤已完成；执行、检查与用户验收分别报告。${plan.content.steps.some(step => step.after) ? "步骤里的 after 是它等待的更早步骤编号：没写就等上一步，[] 表示不等任何步骤。" : ""}\n\n${JSON.stringify({ revision: plan.revision, ...plan.content }, null, 2)}` };
  agentTextMaterialContent(material);
  return material;
}
