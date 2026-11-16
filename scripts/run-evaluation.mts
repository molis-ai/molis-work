/**
 * Minimal isolated-Home evaluation runner (post-anticorruption roadmap Batch 30, #batch-30-item-1, BL-328).
 *
 *   pnpm eval:run                                   run the canonical end-to-end suite in a fresh scratch Home against a local scripted model
 *   pnpm eval:run --verify-reproducible             run twice in two fresh scratch Homes and assert identical verdicts, stages, unknowns & metrics
 *   pnpm eval:run --mode live                       run against Gemini series (`gemini-2.5-flash` by default; skips cleanly without GEMINI_API_KEY)
 *   pnpm eval:run --mode live --model gemini-2.5-pro --require-live --json <out.json>
 *
 * Safety invariants:
 *   - Strictly refuses `~/.molis-work`, any directory inside it, or any directory containing it (exit 2 before touching disk).
 *   - Always enforces `MOLIS_WORK_SECRET_BACKEND=file` inside the isolated Home; never reads macOS Keychain or copies real Home files.
 *   - Inline API keys (`GEMINI_API_KEY` or `MOLIS_EVAL_API_KEY`) are written only to the scratch Home's file secret store, scrubbed from
 *     reports, and deleted with the scratch Home on exit (unless `--keep-home` is explicitly requested on a non-product scratch directory).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ModelApiFormat } from "@molis-ai/molis-work-contracts/modules/model-providers";
import {
  EvaluationCliUsageError,
  assertEnvEvaluationHomeSafe,
  assertIsolatedScratchHome,
  redactEvaluationValue,
  withIsolatedEvaluationHome,
} from "./evaluation/home-guard.mjs";
import { runCanonicalEvaluationInHome, type EvaluationSuiteReport } from "./evaluation/runner.mjs";
import {
  DEFAULT_GEMINI_API_FORMAT,
  DEFAULT_GEMINI_BASE_URL,
  DEFAULT_GEMINI_MODEL_ID,
} from "./evaluation/stand-in-server.mjs";

const USAGE = [
  "usage:",
  "  pnpm eval:run [--mode stand-in|live] [--verify-reproducible] [--home <scratch-dir>] [--keep-home]",
  `                [--model <id>] [--base-url <url>] [--api-format openai-chat-completions|anthropic-messages]`,
  "                [--require-live] [--json <file>]",
  `defaults: --mode stand-in, --model ${DEFAULT_GEMINI_MODEL_ID}, --base-url ${DEFAULT_GEMINI_BASE_URL}, --api-format ${DEFAULT_GEMINI_API_FORMAT}`,
  "exit codes: 0 passed (or live skipped without key), 1 evaluation expectation or reproducibility mismatch, 2 invalid usage / refused Home.",
].join("\n");

interface ParsedCliOptions {
  readonly mode: "stand-in" | "live";
  readonly verifyReproducible: boolean;
  readonly requestedHome?: string;
  readonly keepHome: boolean;
  readonly modelId: string;
  readonly baseUrl: string;
  readonly apiFormat: ModelApiFormat;
  readonly requireLive: boolean;
  readonly jsonFile?: string;
  readonly help: boolean;
}

const VALUE_FLAGS = new Set(["mode", "home", "model", "base-url", "api-format", "json"]);
const BOOLEAN_FLAGS = new Set(["verify-reproducible", "keep-home", "require-live", "help"]);

function parseCliArgs(argv: readonly string[]): ParsedCliOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "-h" || arg === "--help") {
      flags.add("help");
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new EvaluationCliUsageError(`未知位置参数：${arg}`);
    }
    const name = arg.slice(2);
    if (BOOLEAN_FLAGS.has(name)) {
      flags.add(name);
      continue;
    }
    if (!VALUE_FLAGS.has(name)) {
      throw new EvaluationCliUsageError(`未知选项：--${name}`);
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new EvaluationCliUsageError(`选项 --${name} 需要参数值`);
    }
    if (values.has(name)) {
      throw new EvaluationCliUsageError(`选项 --${name} 不能重复指定`);
    }
    values.set(name, next);
    i += 1;
  }

  const modeRaw = values.get("mode") ?? "stand-in";
  if (modeRaw !== "stand-in" && modeRaw !== "live") {
    throw new EvaluationCliUsageError(`--mode 只接受 stand-in 或 live（收到：${modeRaw}）`);
  }
  const formatRaw = values.get("api-format") ?? DEFAULT_GEMINI_API_FORMAT;
  if (formatRaw !== "openai-chat-completions" && formatRaw !== "anthropic-messages") {
    throw new EvaluationCliUsageError(`--api-format 只接受 openai-chat-completions 或 anthropic-messages（收到：${formatRaw}）`);
  }
  if (flags.has("verify-reproducible") && values.has("home")) {
    throw new EvaluationCliUsageError("--verify-reproducible 需要在两个独立临时目录运行，不能同时固定单个 --home");
  }

  return {
    mode: modeRaw,
    verifyReproducible: flags.has("verify-reproducible"),
    ...(values.get("home") ? { requestedHome: values.get("home")! } : {}),
    keepHome: flags.has("keep-home"),
    modelId: values.get("model")?.trim() || DEFAULT_GEMINI_MODEL_ID,
    baseUrl: values.get("base-url")?.trim() || DEFAULT_GEMINI_BASE_URL,
    apiFormat: formatRaw,
    requireLive: flags.has("require-live"),
    ...(values.get("json") ? { jsonFile: resolve(values.get("json")!) } : {}),
    help: flags.has("help"),
  };
}

function renderHumanReport(report: EvaluationSuiteReport, extraNote?: string): string {
  const lines: string[] = [
    `Evaluation mode=${report.mode} model=${report.model_id} format=${report.api_format}`,
    `Digest: ${report.reproducibility_digest}`,
    `All expectations matched: ${String(report.all_expectations_matched)} | Replay isolated: ${String(report.replay_isolated_from_real_audit)} | Blocked external side effects: ${String(report.blocked_external_effects_count)} | Human review immutable: ${String(report.human_review_applied_without_mutation)}`,
    "Cases:",
  ];
  for (const item of report.cases) {
    const status = item.matched_expectation ? "OK" : "MISMATCH";
    const unknowns = item.unknown_reasons.length > 0 ? ` unknown=[${item.unknown_reasons.join(",")}]` : "";
    const stages = item.failed_stages.length > 0 ? ` failed_stages=[${item.failed_stages.join(",")}]` : "";
    lines.push(
      `  [${status}] ${item.sample_id} (${item.purpose}) expected=${item.expected_verdict} observed=${item.observed_verdict} records=${String(item.matched_record_count)} pointers=${String(item.evidence_pointer_count)}${stages}${unknowns}`,
    );
  }
  lines.push(
    `Replay comparison: ${report.replay_comparison.verdict_transition} improved=[${report.replay_comparison.improved_stages.join(",")}] regressed=[${report.replay_comparison.regressed_stages.join(",")}]`,
  );
  const v = report.metrics.validation;
  const t = report.metrics.tuning;
  lines.push(
    `Metrics (validation): total=${String(v.sample_count)} passed=${String(v.verdict_counts.passed)} failed=${String(v.verdict_counts.failed)} unknown=${String(v.verdict_counts.unknown)}`,
    `Metrics (tuning):     total=${String(t.sample_count)} passed=${String(t.verdict_counts.passed)} failed=${String(t.verdict_counts.failed)} unknown=${String(t.verdict_counts.unknown)}`,
  );
  if (extraNote) lines.push(extraNote);
  return lines.join("\n") + "\n";
}

async function executeCli(argv: readonly string[]): Promise<number> {
  const options = parseCliArgs(argv);
  if (options.help) {
    process.stdout.write(USAGE + "\n");
    return 0;
  }

  assertEnvEvaluationHomeSafe(options.requestedHome);
  if (options.requestedHome) {
    assertIsolatedScratchHome(options.requestedHome);
  }

  const inlineApiKey = process.env.GEMINI_API_KEY?.trim() || process.env.MOLIS_EVAL_API_KEY?.trim() || "";
  if (options.mode === "live" && !inlineApiKey) {
    if (options.requireLive) {
      process.stderr.write("REFUSED: --mode live --require-live 需要提供 GEMINI_API_KEY 或 MOLIS_EVAL_API_KEY。\n");
      return 2;
    }
    process.stdout.write(
      "SKIP: 未检测到 GEMINI_API_KEY 或 MOLIS_EVAL_API_KEY，跳过在线 Gemini 模型调用；可用默认 stand-in 模式验证完整评测链路。\n",
    );
    return 0;
  }

  const modelConfig = {
    mode: options.mode,
    modelId: options.modelId,
    baseUrl: options.baseUrl,
    apiFormat: options.apiFormat,
    ...(inlineApiKey ? { apiKey: inlineApiKey } : {}),
  } as const;

  const first = await withIsolatedEvaluationHome(
    { ...(options.requestedHome ? { requestedHome: options.requestedHome } : {}), keepHome: options.keepHome },
    (home) => runCanonicalEvaluationInHome(home, modelConfig),
  );
  const redactedFirst = redactEvaluationValue(first.result, {
    home: first.home,
    secrets: inlineApiKey ? [inlineApiKey] : [],
  });

  let reproducibleVerified: boolean | undefined;
  let secondDigest: string | undefined;
  if (options.verifyReproducible) {
    const second = await withIsolatedEvaluationHome({ keepHome: false }, (home) =>
      runCanonicalEvaluationInHome(home, modelConfig),
    );
    secondDigest = second.result.reproducibility_digest;
    reproducibleVerified = first.result.reproducibility_digest === secondDigest;
  }

  const note = options.verifyReproducible
    ? `Reproducibility check across 2 isolated Homes: ${reproducibleVerified ? "IDENTICAL" : `MISMATCH (${secondDigest ?? ""})`}`
    : first.kept
      ? `Scratch Home retained at: ${first.home}`
      : "Scratch Home cleaned up.";
  process.stdout.write(renderHumanReport(redactedFirst, note));

  if (options.jsonFile) {
    mkdirSync(dirname(options.jsonFile), { recursive: true });
    const payload = {
      ...redactedFirst,
      home_cleaned_up: !first.kept,
      ...(reproducibleVerified !== undefined
        ? { reproducibility_verified: reproducibleVerified, second_reproducibility_digest: secondDigest }
        : {}),
    };
    writeFileSync(options.jsonFile, JSON.stringify(payload, null, 2) + "\n", "utf8");
  }

  if (!redactedFirst.all_expectations_matched) return 1;
  if (reproducibleVerified === false) return 1;
  return 0;
}

try {
  process.exitCode = await executeCli(process.argv.slice(2));
} catch (error) {
  if (error instanceof EvaluationCliUsageError) {
    process.stderr.write(`${error.message}\n${USAGE}\n`);
    process.exitCode = 2;
  } else {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
