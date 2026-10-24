import { writeFile, rm } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MEMORY_KINDS, type MemoryPrefs } from "@molis-ai/molis-work-contracts/services/memory";
import { evaluationPerson } from "./originals.mjs";
import { currentEvaluationSource, memoryEvaluationB2Preflight } from "./baseline.mjs";
import { memoryEvaluationEnvironment, type EvaluationArm } from "./replay.mjs";

/** Frozen before measurement. Synthetic volumes, not a distribution observed in any real Home. */
export const MEMORY_SCALE_PLAN = Object.freeze({
  sizes: [10, 100, 1000] as const,
  replicas: 3,
  repeatedReads: 9,
  query: "项目安装依赖和运行检查的约定是什么",
  caller: evaluationPerson("project-a", "coding"),
  distribution: "four current kinds; half personal, one quarter project-a, one quarter project-b (rounding for small libraries)",
  queryDensity: "all entries contain the query topic: dense-match synthetic stress, not representative relevance",
});
type Environment = Awaited<ReturnType<typeof memoryEvaluationEnvironment>>;
const person = (project_id: string | null) => evaluationPerson(project_id, "coding");
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

export async function observeScaleRecall(env: Environment, index: number) {
  const before = env.observations.length;
  const started = performance.now();
  let result: Awaited<ReturnType<Environment["memory"]["recall"]>> | null = null, error: string | null = null;
  try { result = await env.memory.recall(MEMORY_SCALE_PLAN.caller, { query: MEMORY_SCALE_PLAN.query }); }
  catch (failure) { error = errorText(failure); }
  const latencyMs = performance.now() - started;
  const calls = env.observations.slice(before);
  return {
    index, phase: index === 0 ? "first-recall-after-runtime-reopen" : "repeated-recall",
    status: error ? "failed" : "observed", error, latencyMs, state: result?.state ?? null,
    selected: result?.items.length ?? null, receiptId: result?.receipt_id ?? null,
    listCalls: calls.length, listEntriesReturned: calls.reduce((sum, call) => sum + (call.entries ?? 0), 0),
    failedListCalls: calls.filter(call => call.status === "failed").length, calls,
    underlyingStorageScans: null,
  };
}
type ScopePrefs = { project: string | null; prefs: MemoryPrefs };

async function seedScaleHome(size: number) {
  const env = await memoryEvaluationEnvironment(undefined, { seeds: [] });
  const started = performance.now();
  const ids = new Set<string>();
  const distribution: Record<string, number> = {};
  try {
    for (let index = 0; index < size; index++) {
      const scope = index % 2 === 0 ? "personal" : "project";
      const project = scope === "personal" ? null : Math.floor(index / 8) % 2 === 0 ? "project-a" : "project-b";
      const kind = MEMORY_KINDS[Math.floor(index / 2) % MEMORY_KINDS.length]!;
      const written = await env.memory.write(person(project), { scope, kind,
        text: `合成记录${String(index).padStart(4, "0")}：项目安装依赖和运行检查时，记录编号${index}的约定供本次规模测量。` });
      if (!written.memory || ids.has(written.memory.memory_id)) throw new Error(`合成库写入没有产生独立记录：${index} (${written.outcome})`);
      ids.add(written.memory.memory_id);
      const key = `${project ?? "personal"}/${kind}`;
      distribution[key] = (distribution[key] ?? 0) + 1;
    }
    const prefs = [null, "project-a", "project-b"].map(project => ({ project, prefs: env.memory.prefs(person(project), project ? "project" : "personal").prefs }));
    await env.close(false);
    return { home: env.home, size: ids.size, distribution, seedDurationMs: performance.now() - started, prefs };
  } catch (error) { await env.close(); throw error; }
}

async function measureScaleArm(home: string, arm: EvaluationArm, prefs: ScopePrefs[]) {
  let env: Environment | undefined;
  const samples: Array<Awaited<ReturnType<typeof observeScaleRecall>>> = [];
  try {
    env = await memoryEvaluationEnvironment(undefined, { seeds: [], homeDirectory: home });
    // Restore the original effective B2 preferences; a preceding B0 must not change the next arm.
    for (const item of prefs) env.memory.savePrefs(person(item.project), item.project ? "project" : "personal", item.prefs);
    await env.prepare(arm);
    if (!env.adapter.memory) throw new Error("SDK memory capability unavailable");
    for (let index = 0; index <= MEMORY_SCALE_PLAN.repeatedReads; index++) samples.push(await observeScaleRecall(env, index));
    return { arm, status: samples.some(sample => sample.status === "failed") ? "failed" : "observed", error: null, samples };
  } catch (error) { return { arm, status: "failed", error: errorText(error), samples }; }
  finally { await env?.close(false); }
}

export async function measureMemoryScaleReplica(size: number, replica: number) {
  const seeded = await seedScaleHome(size);
  try {
    const arms = [];
    const order: EvaluationArm[] = replica % 2 === 0 ? ["B0", "B2"] : ["B2", "B0"];
    for (const arm of order) arms.push(await measureScaleArm(seeded.home, arm, seeded.prefs));
    return { size, replica, actualSize: seeded.size, distribution: seeded.distribution, seedDurationMs: seeded.seedDurationMs, order, arms };
  } finally { await rm(seeded.home, { recursive: true, force: true }); }
}

function latencySummary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, minMs: sorted[0] ?? null, medianMs: sorted[Math.floor(sorted.length / 2)] ?? null,
    p95Ms: sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null, maxMs: sorted.at(-1) ?? null };
}

export async function measureMemoryScale() {
  const rows: Array<Awaited<ReturnType<typeof measureMemoryScaleReplica>>> = [];
  const failures: Array<{ size: number; replica: number; error: string }> = [];
  for (const size of MEMORY_SCALE_PLAN.sizes) for (let replica = 0; replica < MEMORY_SCALE_PLAN.replicas; replica++) {
    try { rows.push(await measureMemoryScaleReplica(size, replica)); }
    catch (error) { failures.push({ size, replica, error: errorText(error) }); }
  }
  const summaries = MEMORY_SCALE_PLAN.sizes.flatMap(size => (["B0", "B2"] as const).map(arm => {
    const samples = rows.filter(row => row.size === size).flatMap(row => row.arms.filter(item => item.arm === arm).flatMap(item => item.samples));
    const observed = samples.filter(sample => sample.status === "observed");
    return { size, arm, errors: samples.length - observed.length, first: latencySummary(observed.filter(sample => sample.index === 0).map(sample => sample.latencyMs)),
      repeated: latencySummary(observed.filter(sample => sample.index > 0).map(sample => sample.latencyMs)),
      replicaRepeated: rows.filter(row => row.size === size).map(row => ({ replica: row.replica, ...latencySummary(row.arms.filter(item => item.arm === arm).flatMap(item => item.samples.filter(sample => sample.index > 0 && sample.status === "observed").map(sample => sample.latencyMs))) })) };
  }));
  return { schema: "molis-memory-scale-v2", recordedAt: new Date().toISOString(), source: currentEvaluationSource(), measurement: "MemoryService explicit recall (not SDK task recall)", plan: MEMORY_SCALE_PLAN,
    runtime: { node: process.version, platform: process.platform, arch: process.arch }, modelCalls: 0,
    limitations: ["合成规模假设，不是任何真实Home的统计；不测语义质量", "首次读取在新Runtime重新打开后测量，包含该路径的hydrate；不宣称操作系统文件缓存冷启动", "计时包含生产recall和账本回执，不含Runtime启动、造数、配置；不等同最终Agent Context延迟", "使用当前可信本人管理读身份保留四类完整规模分布；当前授权链不同于旧B1，不能归因全部延迟差为检索实现", "保留原显式召回5ms阈值；未测新SDK task召回时延，不以该值替代", "list调用/返回量可观察；底层存储扫描量unknown，不能互相替代", "3个独立副本的本机波动不能建立跨设备稳定SLA；新SDK旧配方归因对照未执行"],
    rows, failures, summaries };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, ...args] = process.argv.slice(2);
  if (mode !== "--b2") throw new Error("usage: scale.mts --b2 --out <new report path>");
  if (args.length !== 2 || args[0] !== "--out") throw new Error("usage: scale.mts --b2 --out <new report path>");
  const preflight = memoryEvaluationB2Preflight(fileURLToPath(new URL("../../", import.meta.url)));
  if (!preflight.ready) throw new Error("当前 B2 构建/安装/dirty 状态未通过预检；未测量");
  const report = { preflight, ...await measureMemoryScale() };
  await writeFile(args[1]!, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  if (report.failures.length || report.rows.some(row => row.arms.some(arm => arm.status === "failed"))) process.exitCode = 1;
  console.log(`规模测量已记录：${report.rows.length}个副本，模型调用0；报告${args[1]}`);
}
