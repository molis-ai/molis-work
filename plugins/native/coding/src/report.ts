import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { PluginArtifactClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { AgentCommandOutput, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingUsageSummary } from "./usage.js";
import { CODING_REPORT_TYPE, type CodingReport } from "./artifacts.js";

export interface CodingExecutionReport extends CodingReport {
  source: { session_id: string; runtime_id: string; runtime_session_id: string };
  state: AgentRunView["phase"];
  ended_at: string | null;
  task: string;
  model_answer: string;
  frozen: Omit<AgentRunView["frozen"], "directory">;
  usage: AgentRunView["usage"];
  commands: Array<{ call_id: string; output: AgentCommandOutput | null }>;
}

/** Stable identity makes a lost save response retryable without a second index. */
export function codingReportReference(sessionId: string, runId: string): ArtifactReference {
  return { artifact_id: `coding-report:${encodeURIComponent(sessionId)}:${encodeURIComponent(runId)}`, version: 1 };
}

export function readCodingExecutionReport(artifacts: PluginArtifactClient, sessionId: string, runId: string) {
  const reference = codingReportReference(sessionId, runId);
  const artifact = artifacts.read(reference);
  if (!artifact) return null;
  const report = artifact.payload as unknown as CodingExecutionReport | null;
  if (artifact.artifact_type_id !== CODING_REPORT_TYPE || artifact.schema_version !== 1
    || !report || report.source?.session_id !== sessionId || report.run_id !== runId
    || typeof report.body_markdown !== "string" || typeof report.title !== "string") {
    throw new Error("保存的报告与当前会话或执行不匹配，不能替换成另一轮结果");
  }
  return { report, reference, saved_at: artifact.created_at };
}

function literal(value: string): string {
  const fences = value.match(/`+/g) ?? [];
  const fence = "`".repeat(Math.max(3, ...fences.map(item => item.length + 1)));
  return `${fence}\n${value}\n${fence}`;
}

export function createCodingExecutionReport(input: {
  session_id: string; runtime_id: string; title: string; run: AgentRunView;
  commands: CodingExecutionReport["commands"];
}): CodingExecutionReport {
  const { run } = input;
  if (!["completed", "failed", "stopped", "cancelled"].includes(run.phase)) {
    throw new Error("这一轮尚未结束或仍需核对结果，暂不能保存报告");
  }
  const phase = { completed: "本轮结束", failed: "执行失败", stopped: "已停止", cancelled: "已取消" };
  const task = run.turns.filter(turn => turn.kind === "user" && !turn.steer).map(turn => turn.text).join("\n\n");
  const modelAnswer = run.turns.filter(turn => turn.kind === "assistant").map(turn => turn.text).join("\n\n");
  const supplemental = run.turns.filter(turn => turn.steer).map(turn =>
    `${turn.steer!.state === "applied" ? "已加入后续上下文" : "已收到，未确认应用"}\n${literal(turn.text)}`).join("\n\n");
  const commandEvidence = input.commands.map(({ call_id, output }) => {
    if (!output) return `命令 ${call_id}：回执无法读取，结果未知。`;
    const state = output.timed_out ? "超时" : output.cancelled ? "已取消" : output.exit_code === null ? "退出状态未知" : `退出码 ${output.exit_code}`;
    return `${state}${output.truncated ? "；输出已截断" : ""}\n${literal(output.command)}\n标准输出\n${literal(output.stdout)}\n标准错误\n${literal(output.stderr)}`;
  }).join("\n\n");
  const activity = run.activity.map(item => `${item.name} · ${item.target} · ${
    item.state === "completed" ? "已返回（不等于任务通过）" : item.state === "failed" ? "失败" : "结果未知，未收到结束回执"
  }`).join("\n");
  const usage = codingUsageSummary(run.usage);
  const { directory: _directory, ...frozen } = run.frozen;
  return {
    title: `${input.title} · 执行报告`, run_id: run.ref.run_id,
    source: { session_id: input.session_id, runtime_id: input.runtime_id, runtime_session_id: run.ref.session_id },
    state: run.phase, ended_at: run.ended_at, task, model_answer: modelAnswer,
    frozen: structuredClone(frozen), usage: structuredClone(run.usage), commands: structuredClone(input.commands),
    body_markdown: [
      `## 执行状态\n${phase[run.phase as keyof typeof phase]}。运行结束不代表需求完成或用户验收。\n结束时间：${run.ended_at ?? "未记录，不推断原结束时刻"}。${run.stop_reason ? `\n${literal(run.stop_reason)}` : ""}`,
      `## 本轮任务\n${task || "任务正文未保存，不能补造。"}`,
      ...(supplemental ? [`## 补充要求\n应用表示进入上下文，不证明模型遵循，也不代替问题回答。\n\n${supplemental}`] : []),
      ...(run.awaiting_input.length ? [`## 遗留问题\n${run.awaiting_input.map(question => `${literal(question.prompt)}\n${question.unavailable_reason || "本轮已结束，问题不可再回答；不能据此推断已收到正式回答。"}`).join("\n\n")}`] : []),
      `## 模型答复\n以下是模型的表述；检查证据另列，不自动据此判定通过。\n\n${modelAnswer || "没有已保存的模型答复。"}`,
      `## 命令与检查证据\n${commandEvidence || (run.command_outputs === undefined ? "运行时未提供命令索引，不能推断未执行。" : "本轮没有已记录的命令回执；这不等于检查通过。")}`,
      `## 工具活动\n${activity ? literal(activity) : "没有已记录的工具活动。"}`,
      `## 本轮配置\n${literal(`模型：${frozen.model_id}\n角色：${frozen.role_id} · v${frozen.role_version}\n提示：${frozen.prompts.map(p => `${p.layer}: ${p.prompt_id} v${p.version}`).join("、")}\n方法：${frozen.skills.map(s => `${s.name} v${s.version}`).join("、") || "未选择"}\nMCP：${frozen.mcp_tools.map(t => `${t.server}/${t.tool} ${t.version} 配置 ${t.configuration_version ?? "未记录"}`).join("、") || "未选择"}\nMCP 资料：${(frozen.mcp_sources ?? []).map(s => `${s.server} 配置 ${s.configuration_version}`).join("、") || "未选择"}\n材料：${frozen.text_materials.map(m => `${m.source_artifact_id} v${m.source_version}`).join("、") || "未选择"}`)}`,
      `## 用量\n${usage}${!run.usage.compaction && run.activity.some(item => item.name === "上下文整理") ? "\n仅包含主执行请求；上下文整理的额外用量尚未计入。" : ""}`,
      "## 保存边界\n报告记录这一轮已有证据，不包含工作区当前差异的固定版本，不撤销先前操作，也不替代 Goal 验收。",
    ].join("\n\n"),
  };
}
