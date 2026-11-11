/**
 * BL-1072 性能门 B 路的薄入口（`specs/prologue-memory-strategy/spec.md`「性能门 B 路」第 3、5 条）。只测量，不改产品代码。
 *
 * 同一份文件跑两臂：`--root` 指向该臂自己的干净工作树，`--arm` 只是标签（B1 或 B2）。评测环境与任务入口从
 * `--root` 动态加载，所以每臂用的是它自己的生产代码、SDK 与评测工具；本文件只依赖 Node 内置模块和一份两臂相同的
 * 测试替身（结束复盘的「没有发现」答复）。
 *
 * 模型是进程内的零成本替身：替换 `fetch`，只接受声明的端点，记录每个请求到达的 `performance.now()`，回一段固定的
 * SSE 文本；不走网络、不付费。Context 组装耗时 = 调用任务入口前一刻 → 这一轮自己的第一个模型请求到达。
 *
 * 运行时把 TMPDIR 设成真实路径（macOS 的 /var 是到 /private/var 的链接，B2 的存储拒绝带链接的路径）；四个时段的
 * runtime 含 tmpdir，比较时必须相同。
 *
 * 两臂召回的位置不同：B1 在 forRun 配方里一次挑好（工具字段 recallLatencyMs），B2 在 SDK 任务召回里取（retrievals 的
 * elapsed_ms，配方本身另记 recipeLatencyMs）。recipeMs 两臂都有，taskRecallMs 只有 B2；两项都只报告。
 *
 * 用法：
 *   tsx paired-latency.mts --root <臂工作树> --arm B1|B2 --slot <1-4> --out <新报告>
 *   tsx paired-latency.mts --cache-cliff --root <B2 工作树> --out <新报告>
 *   tsx paired-latency.mts --compare <slot1> <slot2> <slot3> <slot4> --out <新报告>
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, loadavg, tmpdir, totalmem } from "node:os";
import { basename, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { endingReviewReply } from "../../tests/fixtures/ending-review.js";

/** Frozen before measurement (spec 第 3 条：1000 条，3 副本 ×（1 首读 + 9 暖读））。造数与规模工具 scale.mts 相同。 */
export const PAIRED_LATENCY_PLAN = Object.freeze({
  size: 1000,
  replicas: 3,
  warmReads: 9,
  query: "项目安装依赖和运行检查的约定是什么",
  task: { id: "paired-latency", scene: "coding", project: "project-a" },
  kinds: ["preference", "convention", "fact", "experience"],
  distribution: "four current kinds; half personal, one quarter project-a, one quarter project-b (same rule as scale.mts)",
  order: ["B1", "B2", "B2", "B1"],
  gate: { warmMedianMs: 30, warmP95Ms: 50, firstMs: 100 },
  statistic: "pooled per arm over its two slots; warm = all reads with index > 0; P95 = nearest rank ceil(0.95n); first = median of first reads; increase = B2 - B1",
  observed: "run completed; no recall failure; every SDK retrieval ready (B2 needs at least one); memory reached the round's request; exactly one round request; otherwise failed",
  /** Arm identity is pinned, not taken from the label: B1 frozen tool tree and SDK, B2 the current SDK on any other head. */
  arms: {
    B1: { head: "5e47ed2bc369c8c0123c651b4e2a70fa0e1f2665", sdkCommit: "753dbae8359e56a74397d030af4d18abf402d5b5" },
    B2: { sdkCommit: "1128126de14e9209152f7dc36d152991fb933aea" },
  },
});
const CLIFF_SIZE = 2000;
const ENDPOINT = "https://1.1.1.1/v1/messages";
const MODEL = { protocol: "anthropic-compatible", endpoint: ENDPOINT, model: "paired-latency-loopback", credential_ref: "paired-latency" };
type Arm = "B1" | "B2";
/** The fields read from either arm's own task result (B1 tool 5e47ed2bc, B2 current tool); nothing else is relied on. */
interface TaskRow {
  phase?: string; error?: string | null; recallFailure?: string | null;
  retrievals?: Array<{ outcome?: string; cost?: { elapsed_ms?: number } }> | null;
  recipeLatencyMs?: number | null; recallLatencyMs?: number | null; selected?: unknown[];
  runtimeContextReferences?: unknown[]; runtimePackedInjected?: unknown[];
}

const pad = (index: number) => String(index).padStart(4, "0");
export function pairedLatencySeeds(size: number = PAIRED_LATENCY_PLAN.size) {
  return Array.from({ length: size }, (_, index) => {
    const scope = index % 2 === 0 ? "personal" : "project";
    const project = scope === "personal" ? null : Math.floor(index / 8) % 2 === 0 ? "project-a" : "project-b";
    const kind = PAIRED_LATENCY_PLAN.kinds[Math.floor(index / 2) % PAIRED_LATENCY_PLAN.kinds.length]!;
    const text = `合成记录${pad(index)}：项目安装依赖和运行检查时，记录编号${index}的约定供本次规模测量。`;
    return { id: `scale-${pad(index)}`, source: { id: `u-coding-scale-${pad(index)}`, speaker: "user" as const, text }, project, request: { scope, kind, text } };
  });
}
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
export const planFingerprint = () => sha256(JSON.stringify({ plan: PAIRED_LATENCY_PLAN, seeds: pairedLatencySeeds() }));

function sse(text: string): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: MODEL.model, content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

interface Arrival { at: number; kind: "round" | "ending-review"; bytes: number }
/** Zero-cost in-process model: refuses any other target, never forwards, records arrival before answering. */
function loopbackModel() {
  const original = globalThis.fetch, arrivals: Arrival[] = [], refused: string[] = [];
  globalThis.fetch = async (input, init) => {
    const at = performance.now();
    const url = input instanceof Request ? input.url : String(input);
    if (url !== ENDPOINT) { refused.push(url); throw new Error("薄入口拒绝未声明的网络目标"); }
    const raw = typeof init?.body === "string" ? init.body : init?.body instanceof Uint8Array ? new TextDecoder().decode(init.body)
      : input instanceof Request ? await input.clone().text() : "";
    const review = endingReviewReply(raw);
    arrivals.push({ at, kind: review === undefined ? "round" : "ending-review", bytes: Buffer.byteLength(raw) });
    return sse(review ?? "好的。");
  };
  return { arrivals, refused, restore() { globalThis.fetch = original; } };
}

/**
 * Provenance of one arm's tree. Refused before anything is measured when the tree is dirty, the head or the declared SDK is not
 * the pinned one, or the arm's own preflight (build records, installed SDK, vendored provenance) does not pass.
 */
async function armSource(root: string, arm: Arm) {
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const dirty = git("status", "--porcelain", "--untracked-files=all");
  if (dirty) throw new Error(`臂工作树不干净，未测量：\n${dirty}`);
  const head = git("rev-parse", "HEAD");
  const declared: string = JSON.parse(readFileSync(join(root, "horizontal/agent-host/package.json"), "utf8")).dependencies["@prologue/sdk"];
  const provenance: { source?: { commit?: string } } = JSON.parse(readFileSync(join(root, "vendor/prologue-sdk", `${basename(declared.slice("file:".length))}.provenance.json`), "utf8"));
  const sdkCommit = provenance.source?.commit ?? null, pins = PAIRED_LATENCY_PLAN.arms;
  if (sdkCommit !== pins[arm].sdkCommit) throw new Error(`${arm} 声明的 SDK 来源是 ${sdkCommit}，不是钉住的 ${pins[arm].sdkCommit}；未测量`);
  if (arm === "B1" ? head !== pins.B1.head : head === pins.B1.head) throw new Error(`${arm} 的提交 ${head} 与钉住的臂身份不符；未测量`);
  const baseline = await load(root, "baseline.mts");
  const preflight = arm === "B1" ? baseline.memoryEvaluationPreflight(root) : baseline.memoryEvaluationB2Preflight(root);
  if (!(arm === "B1" ? preflight.matchesFrozenBaseline : preflight.ready)) throw new Error(`${arm} 自己的预检未通过，未测量：${JSON.stringify(preflight)}`);
  return { root, head, declaredSdk: declared, sdkCommit, preflight };
}
function runtime() {
  return { node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model ?? null, cpus: cpus().length, memoryBytes: totalmem(), tmpdir: tmpdir() };
}
const entry = () => ({ path: "scripts/memory-evaluation/paired-latency.mts", sha256: sha256(readFileSync(fileURLToPath(import.meta.url), "utf8")) });
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const load = async (root: string, file: string) => import(pathToFileURL(join(root, "scripts/memory-evaluation", file)).href);
/** The machine's own calendar day and zone at the start, so "same day" is the local day the slots began on. */
const localStart = () => ({ startedAt: new Date().toISOString(), localDate: new Date().toLocaleDateString("sv-SE"), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });

async function measureArm(root: string, arm: Arm, slot: number) {
  const clock = localStart();
  const source = await armSource(root, arm);
  const loadAtStart = loadavg();
  const { memoryEvaluationEnvironment } = await load(root, "replay.mts");
  const { runMemoryEvaluationTask } = await load(root, "model-replay.mts");
  const { task, query } = PAIRED_LATENCY_PLAN;
  const item = { ...task, purpose: "BL-1072 成对时延（薄入口）", request: { query }, required: [], allowed: [] };
  const seeds = pairedLatencySeeds();
  const replicas = [];
  for (let replica = 0; replica < PAIRED_LATENCY_PLAN.replicas; replica++) {
    const samples = [];
    let home: string | undefined, error: string | null = null, seededCount: number | null = null;
    try {
      const seeded = await memoryEvaluationEnvironment(undefined, { seeds });
      home = seeded.home; seededCount = seeded.ids.size;
      await seeded.close(false);
      if (seededCount !== PAIRED_LATENCY_PLAN.size) throw new Error(`造数条数不符：${seededCount}`);
      const model = loopbackModel();
      let env: { prepare(arm: Arm): Promise<void>; close(removeHome?: boolean): Promise<void> } | undefined;
      try {
        env = await memoryEvaluationEnvironment({ modelConfiguration: async () => MODEL, resolveCredential: () => "paired-latency-loopback-only" }, { seeds: [], homeDirectory: home });
        await env!.prepare(arm);
        for (let index = 0; index <= PAIRED_LATENCY_PLAN.warmReads; index++) {
          const before = model.arrivals.length;
          const started = performance.now();
          let row: TaskRow | null = null, failure: string | null = null;
          try { row = await runMemoryEvaluationTask(env, arm, item); } catch (caught) { failure = errorText(caught); }
          const ended = performance.now();
          const arrivals = model.arrivals.slice(before);
          const rounds = arrivals.filter(arrival => arrival.kind === "round"), firstRound = rounds[0];
          const retrievals = row?.retrievals ?? [];
          const references = row?.runtimeContextReferences ?? row?.runtimePackedInjected ?? [];
          const retrievalsReady = retrievals.every(item => item.outcome === "ready") && (arm === "B1" || retrievals.length > 0);
          // A degraded round carries no memory and would look faster; it is a failure, never an observed sample.
          const problem = failure || row?.error || (row?.phase !== "completed" ? `运行结束于 ${row?.phase ?? "unknown"}` : null)
            || (row?.recallFailure ? `召回失败：${row.recallFailure}` : null) || (retrievalsReady ? null : "SDK 任务召回没有全部 ready")
            || (references.length ? null : "记忆没有进入这一轮的请求") || (rounds.length === 1 ? null : `这一轮发出 ${rounds.length} 个模型请求（应为 1）`);
          const elapsed = retrievals.map(item => item.cost?.elapsed_ms);
          samples.push({ index, phase: index === 0 ? "first-after-runtime-reopen" : "warm", status: problem ? "failed" : "observed",
            error: problem || null, runPhase: row?.phase ?? null, retrievalOutcomes: retrievals.map(item => item.outcome ?? null),
            contextAssemblyMs: firstRound ? firstRound.at - started : null,
            // Absent is unknown, never zero: one retrieval without its own time makes the sum unknown.
            taskRecallMs: retrievals.length && elapsed.every(value => typeof value === "number") ? elapsed.reduce((sum, value) => sum! + value!, 0)! : null,
            taskRecallCalls: retrievals.length, recipeMs: row?.recipeLatencyMs ?? row?.recallLatencyMs ?? null, roundTripMs: ended - started,
            requests: arrivals.map(arrival => ({ kind: arrival.kind, offsetMs: arrival.at - started, bytes: arrival.bytes })),
            selected: row?.selected?.length ?? null, contextReferences: references.length });
        }
      } finally { model.restore(); await env?.close(false); if (model.refused.length) error = `拒绝了未声明的网络目标：${model.refused.join(", ")}`; }
    } catch (caught) { error = errorText(caught); }
    finally { if (home) execFileSync("rm", ["-rf", home]); }
    replicas.push({ replica, seededCount, error, samples });
  }
  const failed = replicas.some(row => row.error || row.samples.length !== PAIRED_LATENCY_PLAN.warmReads + 1 || row.samples.some(sample => sample.status !== "observed"));
  return { schema: "molis-memory-paired-latency-v1", ...clock, recordedAt: new Date().toISOString(), slot, arm, status: failed ? "failed" : "observed",
    entry: entry(), planFingerprint: planFingerprint(), plan: PAIRED_LATENCY_PLAN, source, runtime: runtime(), load: { start: loadAtStart, end: loadavg() }, modelCalls: 0, model: "in-process zero-cost stand-in", replicas };
}

/** Spec 第 5 条：B2 的 2000 条显式召回，只记录暖读有没有掉成每次冷读，不挡门。 */
async function measureCacheCliff(root: string) {
  const clock = localStart();
  const source = await armSource(root, "B2");
  const { measureMemoryScaleReplica } = await load(root, "scale.mts");
  const rows = [], failures = [];
  for (let replica = 0; replica < PAIRED_LATENCY_PLAN.replicas; replica++) {
    try { rows.push(await measureMemoryScaleReplica(CLIFF_SIZE, replica)); } catch (caught) { failures.push({ replica, error: errorText(caught) }); }
  }
  const failed = failures.length > 0 || rows.some(row => row.arms.some((item: { status: string }) => item.status === "failed"));
  return { schema: "molis-memory-cache-cliff-v1", ...clock, recordedAt: new Date().toISOString(), status: failed ? "failed" : "observed", size: CLIFF_SIZE, measurement: "MemoryService explicit recall via the arm's own scale.mts; report only",
    entry: entry(), source, runtime: runtime(), modelCalls: 0, rows, failures };
}

export function latencySummary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, minMs: sorted[0] ?? null, medianMs: sorted[Math.floor(sorted.length / 2)] ?? null,
    p95Ms: sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1]! : null, maxMs: sorted.at(-1) ?? null };
}
type SlotReport = Awaited<ReturnType<typeof measureArm>>;

/** Pre-registered comparison: refuses mismatched plans, entries, runtimes or order instead of comparing them. */
export function comparePairedLatency(slots: SlotReport[]) {
  const problems: string[] = [];
  if (slots.length !== 4) problems.push(`需要 4 个时段报告，收到 ${slots.length}`);
  slots.forEach((slot, index) => {
    if (slot.slot !== index + 1) problems.push(`第 ${index + 1} 份报告是时段 ${slot.slot}`);
    if (slot.arm !== PAIRED_LATENCY_PLAN.order[index]) problems.push(`时段 ${index + 1} 应为 ${PAIRED_LATENCY_PLAN.order[index]}，实为 ${slot.arm}`);
    if (slot.status !== "observed") problems.push(`时段 ${index + 1} 有失败`);
  });
  for (const key of ["planFingerprint", "entry", "runtime"] as const)
    if (new Set(slots.map(slot => JSON.stringify(slot[key]))).size > 1) problems.push(`四个时段的 ${key} 不一致`);
  if (new Set(slots.map(slot => `${slot.localDate} ${slot.timeZone}`)).size > 1) problems.push("四个时段不是在本机同一天开始的");
  for (const arm of ["B1", "B2"] as const) {
    const armSlots = slots.filter(slot => slot.arm === arm);
    if (new Set(armSlots.map(slot => slot.source.head)).size > 1) problems.push(`${arm} 两个时段的提交不同`);
    if (armSlots.some(slot => slot.source.sdkCommit !== PAIRED_LATENCY_PLAN.arms[arm].sdkCommit)) problems.push(`${arm} 的 SDK 来源不是钉住的`);
  }
  if (slots.some(slot => (slot.arm === "B1") !== (slot.source.head === PAIRED_LATENCY_PLAN.arms.B1.head))) problems.push("有时段的提交与它的臂标签不符");
  const pick = (arm: Arm, warm: boolean, field: "contextAssemblyMs" | "taskRecallMs" | "recipeMs") => slots.filter(slot => slot.arm === arm)
    .flatMap(slot => slot.replicas.flatMap(row => row.samples)).filter(sample => sample.status === "observed" && (sample.index > 0) === warm)
    .flatMap(sample => sample[field] === null ? [] : [sample[field]!]);
  const arms = Object.fromEntries((["B1", "B2"] as const).map(arm => [arm, Object.fromEntries((["contextAssemblyMs", "taskRecallMs", "recipeMs"] as const)
    .map(field => [field, { first: latencySummary(pick(arm, false, field)), warm: latencySummary(pick(arm, true, field)) }]))]));
  const context = (arm: Arm) => arms[arm]!.contextAssemblyMs!;
  const diff = (a: number | null, b: number | null) => a === null || b === null ? null : b - a;
  const increase = { warmMedianMs: diff(context("B1").warm.medianMs, context("B2").warm.medianMs),
    warmP95Ms: diff(context("B1").warm.p95Ms, context("B2").warm.p95Ms), firstMs: diff(context("B1").first.medianMs, context("B2").first.medianMs) };
  const limits = PAIRED_LATENCY_PLAN.gate;
  const passed = !problems.length && (Object.keys(limits) as Array<keyof typeof limits>).every(key => increase[key] !== null && increase[key]! <= limits[key]);
  return { schema: "molis-memory-paired-latency-comparison-v1", recordedAt: new Date().toISOString(), problems, verdict: problems.length ? "not-comparable" : passed ? "passed" : "failed",
    gate: limits, increase, arms, reportOnly: ["taskRecallMs", "recipeMs"], note: "t0 includes creating a new session for every round, in both arms",
    slots: slots.map(slot => ({ slot: slot.slot, arm: slot.arm, head: slot.source.head, sdkCommit: slot.source.sdkCommit, startedAt: slot.startedAt, recordedAt: slot.recordedAt })) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name: string) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
  const out = option("--out");
  if (!out) throw new Error("缺少 --out <新报告>");
  // Claim the report path first: an existing path refuses before measuring, and a killed run leaves this started stub behind.
  writeFileSync(out, `${JSON.stringify({ status: "started", args, startedAt: new Date().toISOString() })}\n`, { flag: "wx" });
  let report: object;
  try {
  if (args[0] === "--compare") report = comparePairedLatency(args.slice(1, 5).map(path => JSON.parse(readFileSync(path, "utf8"))));
  else if (args[0] === "--cache-cliff") report = await measureCacheCliff(resolve(option("--root") ?? ""));
  else {
    const arm = option("--arm"), slot = Number(option("--slot")), root = option("--root");
    if ((arm !== "B1" && arm !== "B2") || !root || !(slot >= 1 && slot <= 4)) throw new Error("用法：--root <臂工作树> --arm B1|B2 --slot <1-4> --out <新报告>");
    if (PAIRED_LATENCY_PLAN.order[slot - 1] !== arm) throw new Error(`时段 ${slot} 按冻结顺序应为 ${PAIRED_LATENCY_PLAN.order[slot - 1]}`);
    report = await measureArm(resolve(root), arm, slot);
  }
  } catch (error) {
    // A refusal or crash is recorded in place of the stub; it is never a silent rerun.
    writeFileSync(out, `${JSON.stringify({ status: "failed", args, error: errorText(error), recordedAt: new Date().toISOString() }, null, 2)}\n`);
    throw error;
  }
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  const status = (report as { status?: string; verdict?: string }).status ?? (report as { verdict?: string }).verdict;
  if (status === "failed" || status === "not-comparable") process.exitCode = 1;
  console.log(`已记录：${out}（${status ?? "report-only"}）；模型调用 0`);
}
