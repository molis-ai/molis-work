/** Read-only projections of the immutable raw report. Never changes labels, retries failures or calls a model. */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { PrologueExecutionReceipt } from "@molis-ai/molis-work-service-agent-host";
import type { SequenceRow } from "./sequence-replay.mjs";

interface Observation {
  phase?: string; error?: string | null; stopReason?: string | null; recallFailure?: string | null;
  answer?: string | null; usage?: AgentRunView["usage"] | null;
  backend?: { calls: number; entries: number }; recallLatencyMs?: number | null; firstVisibleResponseMs?: number | null;
  runtimePackedInjected?: readonly unknown[];
  source?: { text: string; evidence: string; allowedFacts: readonly string[]; forbiddenFacts: readonly string[] };
  outputs?: readonly { value: string; structured: unknown }[];
  outcome?: { ran?: boolean; reason?: string; formation?: { outcome: string }; learned: readonly { outcome: string; text: string; reason: string }[] } | null;
  executions?: readonly PrologueExecutionReceipt[];
  ledgerProjection?: { candidates: readonly unknown[]; changes: readonly unknown[]; revisions: readonly unknown[] };
  labels?: { request: { query?: string }; approval: string; answerRubric: string };
  finalMemory?: { tokens: number | null; basis: string; messages: readonly unknown[] };
}
type Row = Omit<SequenceRow, "observation" | "arm"> & { arm: "B0" | "B1" | "B2" } & { observation: Observation | null };
interface RawReport {
  stage: string; schema: string; attempts: number; model: string; recordedAt: string; rows: readonly Row[];
  source?: unknown; limitations?: readonly string[]; fixtureRequests?: readonly { endpoint: string; bytes: number }[];
}
type Coverage = "reported" | "estimated" | "partial-estimated" | "partial" | "unknown";
type Direction = "input" | "cached_input" | "output" | "cache_creation";
interface Bucket { tokens: number | null; observations: number }
type Cost = Record<Direction, Record<Coverage, Bucket>>;
const directionCost = (): Record<Coverage, Bucket> => ({ reported: { tokens: 0, observations: 0 }, estimated: { tokens: 0, observations: 0 },
  "partial-estimated": { tokens: 0, observations: 0 }, partial: { tokens: 0, observations: 0 }, unknown: { tokens: null, observations: 0 } });
const emptyCost = (): Cost => ({ input: directionCost(), output: directionCost(), cached_input: directionCost(), cache_creation: directionCost() });

function add(cost: Cost, direction: Direction, tokens: number | undefined, coverage: Coverage | undefined) {
  const status = typeof tokens === "number" && coverage ? coverage : "unknown";
  const bucket = cost[direction][status]; bucket.observations += 1;
  if (status !== "unknown" && tokens !== undefined) bucket.tokens = (bucket.tokens ?? 0) + tokens;
}

export function summarizeMemoryReport(report: RawReport) {
  const groups = new Map<string, { events: number; attempts: number; failures: number; observedNoCallFormation: number; costs: Cost; finalMemoryEstimatedTokens: number; finalMemoryUnknownEvents: number; multiAttemptEvents: number }>();
  const layers = new Map<string, { events: number; failures: number; memoryByArm: Record<string, { formationOutcomes: Record<string, number>; injectedMessages: number; finalMemoryEstimatedTokens: number }> }>();
  for (const row of report.rows) {
    const key = `${row.arm}/${row.window}`, observation = row.observation;
    const group = groups.get(key) ?? { events: 0, attempts: 0, failures: 0, observedNoCallFormation: 0, costs: emptyCost(), finalMemoryEstimatedTokens: 0, finalMemoryUnknownEvents: 0, multiAttemptEvents: 0 };
    groups.set(key, group); group.events += 1;
    const attempts = row.attemptRange.endExclusive - row.attemptRange.startInclusive;
    group.attempts += attempts; if (attempts > 1) group.multiAttemptEvents += 1;
    if (row.status !== "observed") group.failures += 1;
    const layer = layers.get(row.layer) ?? { events: 0, failures: 0, memoryByArm: {} };
    layers.set(row.layer, layer); layer.events += 1; if (row.status !== "observed") layer.failures += 1;
    const arm = layer.memoryByArm[row.arm] ??= { formationOutcomes: {}, injectedMessages: 0, finalMemoryEstimatedTokens: 0 };
    if (row.event.startsWith("source")) {
      if (attempts === 0 && (observation?.outcome?.ran === false || observation?.outcome?.formation?.outcome === "skipped")) group.observedNoCallFormation += 1;
      const usage = observation?.executions?.flatMap(execution => execution.usage) ?? [];
      for (const receipt of usage) {
        add(group.costs, "input", receipt.input.tokens, receipt.input.source);
        add(group.costs, "output", receipt.output.tokens, receipt.output.source);
        add(group.costs, "cached_input", receipt.cacheRead.tokens, receipt.cacheRead.source);
        add(group.costs, "cache_creation", receipt.cacheWrite.tokens, receipt.cacheWrite.source);
      }
      if (attempts > 0 && !usage.length) for (const direction of ["input", "output", "cached_input", "cache_creation"] as const) add(group.costs, direction, undefined, "unknown");
      for (const learned of observation?.outcome?.learned ?? []) arm.formationOutcomes[learned.outcome] = (arm.formationOutcomes[learned.outcome] ?? 0) + 1;
    } else {
      for (const direction of ["input", "output", "cached_input", "cache_creation"] as const) add(group.costs, direction, observation?.usage?.tokens[direction], observation?.usage?.coverage?.[direction]);
      const memory = observation?.finalMemory;
      if (memory?.tokens === null || memory?.tokens === undefined) group.finalMemoryUnknownEvents += 1;
      else group.finalMemoryEstimatedTokens += memory.tokens;
      if (memory) { arm.injectedMessages += memory.messages.length; arm.finalMemoryEstimatedTokens += memory.tokens ?? 0; }
    }
  }
  return {
    sourceSchema: report.schema, source: report.source ?? null, limitations: report.limitations ?? [],
    stage: report.stage, model: report.model, attempts: report.attempts, events: report.rows.length,
    fixtureSetup: report.fixtureRequests ? { calls: report.fixtureRequests.length, requestBytes: report.fixtureRequests.reduce((sum, request) => sum + request.bytes, 0), provider: "loopback-scripted", paidCalls: 0 } : null,
    status: Object.fromEntries(["observed", "failed", "not-run"].map(status => [status, report.rows.filter(row => row.status === status).length])),
    costsByArmAndWindow: Object.fromEntries(groups), layers: Object.fromEntries(layers),
    failures: report.rows.filter(row => row.status !== "observed").map(row => ({ sequence: row.sequence, repeat: row.repeat, arm: row.arm, event: row.event,
      reason: row.error ?? row.observation?.error ?? row.observation?.stopReason ?? row.observation?.phase ?? row.status, attemptRange: row.attemptRange })),
    semantics: "Costs are separated by coverage. Unknown buckets count missing observations, never assert zero token cost. Estimated memory messages are not added to Provider usage. USD remains unknown. Outcomes are actual product results, not quality verdicts.",
  };
}

function reviewMarkdown(report: RawReport, input: string) {
  const sections = [`# ${report.schema === "molis-memory-sequence-baseline-v1" ? "B0/B1 历史基线" : "B0/B2 当前观测"}审查视图\n\n这是原始报告 ${input} 的可重建派生视图，原报告保持不变。全部输入为合成材料；不含凭据。任务与形成质量等待独立逐项审查，工程运行成功不等于质量通过。\n\n记录时间：${report.recordedAt}；实际网络尝试：${report.attempts}。\n\n\`source\` 只调用现役提炼函数，不覆盖 UI 工作结束与后台队列整条触发旅程。读取延迟与首个非空 assistant 视图是 Host 观察，不是最终 App 首屏实操。`];
  if (report.fixtureRequests) sections.push(`来源准备另计：${report.fixtureRequests.length} 次本机脚本 HTTP；不属于被评估 Provider 的 attempt，也不代表生产形成免费。`);
  if (report.limitations?.length) sections.push(report.limitations.map(limit => `- ${limit}`).join("\n"));
  for (const sequence of new Set(report.rows.map(row => row.sequence))) {
    sections.push(`\n## ${sequence}`);
    for (const row of report.rows.filter(item => item.sequence === sequence)) {
      const observation = row.observation;
      sections.push(`\n### 第 ${row.repeat + 1} 次 / ${row.arm} / ${row.event}\n\n状态：${row.status}；请求区间：[${row.attemptRange.startInclusive}, ${row.attemptRange.endExclusive})；事件 ${row.durationMs?.toFixed(1) ?? "unknown"} ms。`);
      if (row.status !== "observed") sections.push(`失败：${row.error ?? observation?.error ?? observation?.stopReason ?? observation?.phase ?? row.status}`);
      if (row.event.startsWith("source")) {
        sections.push(`原始来源：${observation?.source?.text ?? "unknown"}\n\n独立来源标签：${JSON.stringify(observation?.source ?? null)}\n\n实际提炼输出与门结果：\n\n\`\`\`json\n${JSON.stringify({ outputs: observation?.outputs?.map(output => output.structured ?? output.value) ?? null, outcome: observation?.outcome ?? null }, null, 2)}\n\`\`\`\n\n只读候选投影：\n\n\`\`\`json\n${JSON.stringify(observation?.ledgerProjection?.candidates ?? null, null, 2)}\n\`\`\``);
      } else {
        sections.push(`任务：${observation?.labels?.request.query ?? "unknown"}\n\n批准前提：${observation?.labels?.approval ?? "unknown"}；独立审查标准：${observation?.labels?.answerRubric ?? "unknown"}。\n\n最终发出记忆完整消息估计：${observation?.finalMemory?.tokens ?? "unknown"} token（conservative-estimate）；召回故障：${observation?.recallFailure ?? "无"}。\n\n最终/部分回答：\n\n~~~~text\n${observation?.answer ?? "unknown"}\n~~~~\n\n用量（原口径，不把未知当零）：\n\n\`\`\`json\n${JSON.stringify(observation?.usage ?? null, null, 2)}\n\`\`\``);
      }
    }
  }
  return sections.join("\n") + "\n";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  if (!input) throw new Error("用法：report.mts <原始报告.json> [不存在的审查视图.md]");
  const report: RawReport = JSON.parse(await readFile(input, "utf8"));
  if (report.stage !== "completed" || !["molis-memory-sequence-baseline-v1", "molis-memory-sequence-b2-v2"].includes(report.schema)) throw new Error("只汇总已完成保存的序列报告；失败事件仍保留");
  console.log(JSON.stringify(summarizeMemoryReport(report), null, 2));
  if (output) await writeFile(output, reviewMarkdown(report, input), { flag: "wx" });
}
