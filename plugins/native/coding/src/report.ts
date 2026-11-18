import { codingReportStepsMarkdown, type CodingReportSteps } from "./report-steps.js";
import { codingReportInputsMarkdown } from "./report-inputs.js";
import { requestText } from "./continuation.js";
import { activeLeafSteps } from "./recovery-parts.js";
import type { ArtifactReference, FixedVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { PluginArtifactClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { AgentCommandOutput, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingUsageSummary } from "./usage.js";
import { codingGoalVersionLabel } from "./goal-versions.js";
import { codingText } from "./words.js";
import { CODING_REPORT_TYPE, type CodingReport } from "./artifacts.js";

import { codingChangeSetReference } from "./changeset.js";

export interface CodingExecutionReport extends CodingReport {
  steps?: CodingReportSteps;
  goal?: { goal_id: string; title: string; agreement_version: number; goal_event_cursor: number; reference: ArtifactReference } | null;
  goal_source_error?: { references: ArtifactReference[]; reason: string };
  source: { session_id: string; runtime_id: string; runtime_session_id: string };
  state: AgentRunView["phase"];
  ended_at: string | null;
  task: string;
  model_answer: string;
  frozen: Omit<AgentRunView["frozen"], "directory">;
  usage: AgentRunView["usage"];
  commands: Array<{ call_id: string; output: AgentCommandOutput | null }>;
}

/** Read only a genuine fixed Coding report; its source identity must agree with the exact Artifact. */
export function codingReportPreview(artifact: FixedVersionRecord | null) {
  if (!artifact || artifact.artifact_type_id !== CODING_REPORT_TYPE || artifact.schema_version !== /* @version type.coding.report */ 1
    || artifact.producer_plugin_id !== "io.molis.work.coding" || artifact.producer_binding_signature !== "official-coding-binding"
    || artifact.content_kind !== "inline" || artifact.availability !== "available") return null;
  const report = artifact.payload as unknown as Partial<CodingExecutionReport> | null;
  if (!report || typeof report.title !== "string" || typeof report.body_markdown !== "string"
    || typeof report.run_id !== "string" || !report.run_id || typeof report.source?.session_id !== "string" || !report.source.session_id) return null;
  const reference = codingReportReference(report.source.session_id, report.run_id);
  if (reference.artifact_id !== artifact.artifact_id || reference.version !== artifact.version) return null;
  return { title: report.title, body_markdown: report.body_markdown, run_id: report.run_id,
    session_id: report.source.session_id, reference, saved_at: artifact.created_at,
    archived: artifact.lifecycle_state === "archived" };
}

/** Stable identity makes a lost save response retryable without a second index. */
export function codingReportReference(sessionId: string, runId: string): ArtifactReference {
  return { artifact_id: `coding-report:${encodeURIComponent(sessionId)}:${encodeURIComponent(runId)}`, version: 1 };
}

/**
 * The report as a 成果 (artifact-positioning A1): it pins a session at one finished round, and traces to the
 * round's change set when one was kept; the change set itself stays a Coding process item.
 */
export function codingReportPublication(report: { title: string }, sessionId: string, runId: string, artifacts: Pick<PluginArtifactClient, "read">) {
  const changeSet = codingChangeSetReference(sessionId, runId);
  return { metadata: { title: report.title, session_id: sessionId, run_id: runId },
    origin: { kind: "pinned" as const, subject: { kind: "coding_session", id: sessionId }, revision: runId },
    title: report.title, media_type: "application/json", trace: artifacts.read(changeSet) ? [changeSet] : [] };
}

export function readCodingExecutionReport(artifacts: PluginArtifactClient, sessionId: string, runId: string) {
  const reference = codingReportReference(sessionId, runId);
  const artifact = artifacts.read(reference);
  if (!artifact) return null;
  const report = artifact.payload as unknown as CodingExecutionReport | null;
  if (artifact.artifact_type_id !== CODING_REPORT_TYPE || artifact.schema_version !== /* @version type.coding.report */ 1
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
  steps?: CodingReportSteps;
  goal?: CodingExecutionReport["goal"];
  goal_source_error?: CodingExecutionReport["goal_source_error"];
}): CodingExecutionReport {
  const { run } = input;
  if (!["completed", "failed", "stopped", "cancelled"].includes(run.phase)) {
    throw new Error("这一轮尚未结束或仍需核对结果，暂不能保存报告");
  }
  const phase = { completed: "本轮结束", failed: "执行失败", stopped: "已停止", cancelled: "已取消" };
  const task = run.turns.filter(turn => turn.kind === "user" && !turn.steer).map(turn => requestText(turn.text)).join("\n\n");
  const modelAnswer = run.turns.filter(turn => turn.kind === "assistant").map(turn => turn.text).join("\n\n");
  const supplemental = codingReportInputsMarkdown(run, literal);
  const commandEvidence = input.commands.map(({ call_id, output }) => {
    if (!output) return `命令 ${call_id}：回执无法读取，结果未知。`;
    const state = output.timed_out ? "超时" : output.cancelled ? "已取消" : output.exit_code === null ? "退出状态未知" : `退出码 ${output.exit_code}`;
    return `${state}${output.truncated ? "；输出已截断" : ""}\n${literal(output.command)}\n标准输出\n${literal(output.stdout)}\n标准错误\n${literal(output.stderr)}`;
  }).join("\n\n");
  // Model reasoning is not evidence of anything done, so the report's activity lists only operations.
  const activity = run.activity.filter(item => item.name !== "reasoning").map(item => `${item.name} · ${item.target} · ${
    item.state === "completed" ? "已返回（不等于任务通过）" : item.state === "failed" ? "失败" : "结果未知，未收到结束回执"
  }`).join("\n");
  const changedFiles = [...new Set(run.activity.filter(item => ["edit", "write"].includes(item.name) && item.state === "completed" && item.target).map(item => item.target))];
  let lastEditAt = -1, lastPassAt = -1;
  const cmdMap = new Map(input.commands.map(entry => [entry.call_id, entry.output]));
  run.activity.forEach((item, idx) => {
    if (["edit", "write"].includes(item.name) && item.state === "completed") lastEditAt = idx;
    if (item.name === "run-command" || item.name === "start-command") {
      const out = cmdMap.get(item.call_id);
      if (out && !out.timed_out && !out.cancelled && out.exit_code === 0) lastPassAt = idx;
    }
  });
  const staleCheck = lastEditAt >= 0 && lastPassAt >= 0 && lastEditAt > lastPassAt;
  const unknownCmdCount = input.commands.filter(({ output }) => !output || (!output.timed_out && !output.cancelled && output.exit_code === null)).length;
  const failedCmdCount = input.commands.filter(({ output }) => Boolean(output && (output.timed_out || (output.exit_code !== null && output.exit_code !== 0)))).length;
  const passedCmdCount = input.commands.filter(({ output }) => Boolean(output && !output.timed_out && !output.cancelled && output.exit_code === 0)).length;
  const openSteps = activeLeafSteps(run.step_board?.nodes ?? []).filter(node => node.unknown_outcome || !["succeeded", "cancelled"].includes(node.state));
  const deliveredSummary = changedFiles.length
    ? `本轮已写入 ${changedFiles.length} 个文件：${changedFiles.slice(0, 12).join(codingText("coding.list.joiner"))}${changedFiles.length > 12 ? ` 等 ${changedFiles.length} 个` : ""}。`
    : "本轮没有写入工作区文件。";
  const verifiedSummary = input.commands.length === 0
    ? "本轮未记录验证命令（无验证证据，不等于检查通过）。"
    : [
        `共记录 ${input.commands.length} 条命令：通过 ${passedCmdCount} 条，失败 ${failedCmdCount} 条，结果未知 ${unknownCmdCount} 条。`,
        staleCheck ? "注意：最后一次通过的检查之后又改动过文件，旧检查不算对最终改动的验证。" : "",
        unknownCmdCount > 0 ? "含退出状态未知的命令，结果待核对，不视作验证通过。" : "",
      ].filter(Boolean).join(" ");
  const remainingSummary = [
    openSteps.length ? `计划尚余 ${openSteps.length} 步未完成（${openSteps.slice(0, 6).map(n => n.title ?? n.id).join(codingText("coding.list.joiner"))}）。` : "",
    run.awaiting_input.length ? `遗留 ${run.awaiting_input.length} 个待回答问题。` : "",
    unknownCmdCount > 0 ? `${unknownCmdCount} 条命令结果待核对。` : "",
    run.phase !== "completed" ? `本轮以「${phase[run.phase as keyof typeof phase]}」结束，原任务可能尚未收尾。` : "",
  ].filter(Boolean).join(" ") || "当前记录中无未结计划步骤或遗留提问（仍以人工审阅为准）。";
  const lastCheckpoint = run.turn_changes?.at(-1)?.files?.at(-1)?.checkpoint_id;
  const whereSummary = [
    run.frozen.directories?.execution.kind === "worktree" ? `运行位置：独立工作树 ${run.frozen.directories.execution.worktree_id}。` : "运行位置：项目当前授权输出目录。",
    changedFiles.length ? `工作区含本轮 ${changedFiles.length} 个改动文件${lastCheckpoint ? `（最近检查点 ${lastCheckpoint}）` : ""}，尚未自动提交 Git。` : "工作区无本轮文件改动。",
  ].join(" ");
  const usage = codingUsageSummary(run.usage, codingText);
  const { directory: _directory, ...frozen } = run.frozen;
  return {
    title: `${input.title} · 执行报告`, run_id: run.ref.run_id,
    source: { session_id: input.session_id, runtime_id: input.runtime_id, runtime_session_id: run.ref.session_id },
    ...(input.steps ? { steps: structuredClone(input.steps) } : {}),
    state: run.phase, ended_at: run.ended_at, task, model_answer: modelAnswer,
    ...(input.goal ? { goal: structuredClone(input.goal) } : {}),
    ...(input.goal_source_error ? { goal_source_error: structuredClone(input.goal_source_error) } : {}),
    frozen: structuredClone(frozen), usage: structuredClone(run.usage), commands: structuredClone(input.commands),
    body_markdown: [
      `## 执行状态\n${phase[run.phase as keyof typeof phase]}。运行结束不代表需求完成或用户验收。\n结束时间：${run.ended_at ?? "未记录，不推断原结束时刻"}。${run.stop_reason ? `\n${literal(run.stop_reason)}` : ""}`,
      `## 交付了什么\n${deliveredSummary}`,
      `## 怎么验证的\n${verifiedSummary}`,
      `## 没做完的\n${remainingSummary}`,
      `## 代码停在哪\n${whereSummary}`,
      `## 本轮任务\n${task || "任务正文未保存，不能补造。"}`,
      ...(input.steps ? [codingReportStepsMarkdown(run, input.steps, literal)] : []),
      ...(input.goal_source_error ? [`## 目标来源暂不可读\n本轮回答和执行证据仍已保留。无法确认原目标归属，不使用会话后来选择的目标替代，也不能据此回写 Goal 进展。\n${literal(`${input.goal_source_error.reason}\n原固定来源：${input.goal_source_error.references.map(ref => `${ref.artifact_id} v${ref.version}`).join("、")}`)}`] : []),
      ...(input.goal ? [`## 本轮关联目标\n${literal(`${input.goal.title}\n目标：${input.goal.goal_id}\n${codingGoalVersionLabel(input.goal, codingText)} · 目标事件 ${input.goal.goal_event_cursor}\n固定来源：${input.goal.reference.artifact_id} v${input.goal.reference.version}`)}\n这是开始本轮时固定的目标，不随会话改关联；本报告不代表目标验收。`] : []),
      ...(supplemental ? [supplemental] : []),
      ...(run.awaiting_input.length ? [`## 遗留问题\n${run.awaiting_input.map(question => `${literal(question.prompt)}\n${question.unavailable_reason || "本轮已结束，问题不可再回答；不能据此推断已收到正式回答。"}`).join("\n\n")}`] : []),
      `## 模型答复\n以下是模型的表述；检查证据另列，不自动据此判定通过。\n\n${modelAnswer || "没有已保存的模型答复。"}`,
      `## 命令与检查证据\n${commandEvidence || (run.command_outputs === undefined ? "运行时未提供命令索引，不能推断未执行。" : "本轮没有已记录的命令回执；这不等于检查通过。")}`,
      `## 工具活动\n${activity ? literal(activity) : "没有已记录的工具活动。"}`,
      `## 本轮 Character\n${frozen.character ? literal(`${frozen.character.title} · ${roleVersionLabel(frozen.character.version)}\n保存时间：${frozen.character.saved_at}\n内置工具：${frozen.host_tools?.join("、") || "不使用内置工具"}\n\n${frozen.character.instructions}`) : "未使用 Character；沿用调用方角色。"}`,
      ...(frozen.subagent_workspaces?.length ? [`## 本轮独立目录\n${literal(frozen.subagent_workspaces.map(item => item.directory.canonical_path).join("\n"))}\n目录按本轮授权固定；子任务结果须在原子任务记录中核对，不代表已经整合到主工作区。`] : []),
      `## 本轮配置\n${literal(`模型：${frozen.model_id}\n角色：${frozen.role_id} · v${frozen.role_version}\n提示：${frozen.prompts.map(p => `${p.layer}: ${p.prompt_id} v${p.version}`).join("、")}\n方法：${frozen.skills.map(s => `${s.name} v${s.ref.version}`).join("、") || "未选择"}\nMCP：${frozen.mcp_tools.map(t => `${t.server}/${t.tool} ${t.version} 配置 ${t.configuration_version}`).join("、") || "未选择"}\nMCP 资料：${(frozen.mcp_sources ?? []).map(s => `${s.server} 配置 ${s.configuration_version}`).join("、") || "未选择"}\n材料：${frozen.text_materials.map(m => m.source_artifact_id === undefined ? m.title || m.material_id : `${m.title ?? m.source_artifact_id} v${m.source_version} (${m.source_artifact_id})`).join("、") || "未选择"}`)}`,
      `## 用量\n${usage}${!run.usage.compaction && run.activity.some(item => item.name === "上下文整理") ? "\n仅包含主执行请求；上下文整理的额外用量尚未计入。" : ""}`,
      "## 保存边界\n报告记录这一轮已有证据，不包含工作区当前差异的固定版本，不撤销先前操作，也不替代 Goal 验收。",
    ].join("\n\n"),
  };
}

/** A fixed role version as people read it: an original's 「第 n 版」, a member's own version and the original's it builds on. */
function roleVersionLabel(version: import("@molis-ai/molis-work-contracts/modules/characters").CharacterRoleVersionRef): string {
  return version.kind === "personal" ? `第 ${version.version} 版` : `本项目第 ${version.member_version} 版 · 原件第 ${version.original.version} 版`;
}
