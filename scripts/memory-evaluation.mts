/** --preflight/--out 不调模型。live B2 模式须单独获批，沿冻结方法和上限；历史 B1 只能用冻结工具。 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { memoryEvaluationB2Preflight } from "./memory-evaluation/baseline.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.includes("B1") || args.includes("--live-baseline") || args.includes("--live-calibration")) throw new Error("当前工具拒绝 B1：使用冻结工具 5e47ed2bc 与生产 f6b2ff4，在历史工作树通过原 preflight 后复跑；不可用当前 SDK 贴旧标签");
if (args[0] === "--b2") args.shift();
else if (!args[0]?.startsWith("--live-b2")) throw new Error("当前入口必须显式 --b2；付费回放必须另行确认预算");
const preflight = memoryEvaluationB2Preflight(root);
if (args.length === 1 && args[0] === "--preflight") console.log(JSON.stringify(preflight, null, 2));
else if ((args.length === 2 && args[0] === "--out" && args[1]) || (args.length === 3 && ["--live-b2-calibration", "--live-b2"].includes(args[0]!) && args[1] === "--out" && args[2])) {
  if (!preflight.ready) throw new Error("B2 预检未通过：生产或观测工具 dirty / 构建 stale / 实际 SDK 不一致；由统筹收束后再运行");
  if (!preflight.dependencies.installed || !preflight.dependencies.memoryBuilt || !preflight.dependencies.hostBuilt) throw new Error("依赖或构建缺失；由统筹安排安装和 build 后重试");
  if (args[0] === "--live-b2") {
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
      if (last.event === "task2" || last.status !== "observed") console.log(`B2 进度：${last.sequence}/${last.repeat}/${last.arm}/${last.event} ${last.status}；累计 ${progress.attempts} 次网络 attempt。`);
    });
    await writeFile(output, `${JSON.stringify({ preflight, stage: "completed", ...report }, null, 2)}\n`);
    console.log(`当前 B2 已记录：${report.attempts} 次网络 attempt，${report.rows.length} 条事件；质量等待独立复核。`);
    if (report.rows.some(row => row.status !== "observed")) process.exitCode = 1;
  } else if (args[0] === "--live-b2-calibration") {
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
} else throw new Error("用法：memory-evaluation.mts --b2 --preflight | --b2 --out | [--live-b2-calibration|--live-b2] --out <不存在的输出文件>");
