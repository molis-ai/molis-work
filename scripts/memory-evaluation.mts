/** --preflight/--out 不调模型。live 模式只执行统筹已批准的 MiniMax 校准/冻结基线预算。 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { memoryEvaluationPreflight } from "./memory-evaluation/baseline.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const preflight = memoryEvaluationPreflight(root);
if (args.length === 1 && args[0] === "--preflight") console.log(JSON.stringify(preflight, null, 2));
else if ((args.length === 2 && args[0] === "--out" && args[1]) || (args.length === 3 && ["--live-calibration", "--live-baseline"].includes(args[0]!) && args[1] === "--out" && args[2])) {
  if (!preflight.matchesFrozenBaseline) throw new Error("生产代码或 SDK 已偏离冻结 B1；请在原基线工作树测量，不把新策略冒充旧基线");
  if (!preflight.dependencies.installed || !preflight.dependencies.memoryBuilt || !preflight.dependencies.hostBuilt) throw new Error("依赖或构建缺失；由统筹安排安装和 build 后重试");
  if (args[0] === "--live-baseline") {
    const credential = process.env.MINIMAX_API_KEY;
    if (!credential) throw new Error("需要 appkey exec minimax 临时注入；不读取或复制真实 Home 凭据");
    const { replayMemorySequences } = await import("./memory-evaluation/sequence-replay.mjs");
    const { MEMORY_SEQUENCE_PROTOCOL, MEMORY_EVALUATION_SEQUENCES } = await import("../tests/fixtures/memory-evaluation-sequences.js");
    const output = args[2]!;
    const frozen = { preflight, protocol: MEMORY_SEQUENCE_PROTOCOL, sequences: MEMORY_EVALUATION_SEQUENCES };
    await writeFile(output, `${JSON.stringify({ ...frozen, stage: "running", attempts: 0, requests: [], rows: [] }, null, 2)}\n`, { flag: "wx" });
    const report = await replayMemorySequences({ protocol: "anthropic-compatible", endpoint: "https://api.minimaxi.com/anthropic/v1/messages", model: "MiniMax-M3", credential_ref: "evaluation:minimax" }, credential, async progress => {
      await writeFile(output, `${JSON.stringify({ ...frozen, stage: "running", ...progress }, null, 2)}\n`);
      const last = progress.rows.at(-1)!;
      if (last.event === "task2" || last.status !== "observed") console.log(`基线进度：${last.sequence}/${last.repeat}/${last.arm}/${last.event} ${last.status}；累计 ${progress.attempts} 次网络 attempt。`);
    });
    await writeFile(output, `${JSON.stringify({ preflight, stage: "completed", ...report }, null, 2)}\n`);
    console.log(`冻结基线已记录：${report.attempts} 次网络 attempt，${report.rows.length} 条事件；质量等待独立复核。`);
    if (report.rows.some(row => row.status !== "observed")) process.exitCode = 1;
  } else if (args[0] === "--live-calibration") {
    if (!process.env.MINIMAX_API_KEY) throw new Error("需要 appkey exec minimax 临时注入；不读取或复制真实 Home 凭据");
    const { replayMemoryModelCalibration } = await import("./memory-evaluation/model-replay.mjs");
    const output = args[2]!;
    // Reserve the report before dispatch; each completed/failed row survives a later interrupted run.
    await writeFile(output, `${JSON.stringify({ preflight, stage: "running", attempts: 0, requests: [], rows: [] }, null, 2)}\n`, { flag: "wx" });
    const report = { preflight, ...await replayMemoryModelCalibration({ protocol: "anthropic-compatible", endpoint: "https://api.minimaxi.com/anthropic/v1/messages", model: "MiniMax-M3", credential_ref: "evaluation:minimax" }, () => process.env.MINIMAX_API_KEY ?? null, async progress => {
      await writeFile(output, `${JSON.stringify({ preflight, stage: "running", ...progress }, null, 2)}\n`);
      const last = progress.rows.at(-1)!;
      console.log(`校准进度：${last.arm}/${last.case} ${last.phase}；累计 ${progress.attempts} 次网络 attempt。`);
    }) };
    await writeFile(output, `${JSON.stringify({ stage: "completed", ...report }, null, 2)}\n`);
    console.log(`校准批已记录：${report.attempts} 次网络 attempt，${report.rows.filter(row => row.phase === "completed").length} 个完成结果；未证明稳定收益。`);
    if (report.rows.some(row => row.phase !== "completed")) process.exitCode = 1;
  } else {
    const { replayMemoryEvaluation } = await import("./memory-evaluation/replay.mjs");
    const report = { preflight, ...await replayMemoryEvaluation() };
    await writeFile(args[1]!, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    console.log(`已记录 ${report.rows.length} 个成对观测；付费调用 0。最终 Context、任务质量和 token 收益未验证。`);
    if (report.rows.some(row => row.status === "failed")) process.exitCode = 1;
  }
} else throw new Error("用法：memory-evaluation.mts --preflight | [--live-calibration|--live-baseline] --out <不存在的输出文件>");
