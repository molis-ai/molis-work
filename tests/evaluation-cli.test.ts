import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TSX_BIN = resolve(ROOT, "node_modules", ".bin", "tsx");
const CLI_SCRIPT = resolve(ROOT, "scripts", "run-evaluation.mts");

interface CliExecutionResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runEvalCli(args: readonly string[], envOverrides: Record<string, string | undefined> = {}): Promise<CliExecutionResult> {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, val] of Object.entries(envOverrides)) {
    if (val === undefined) delete childEnv[key];
    else childEnv[key] = val;
  }
  return new Promise((resolvePromise, reject) => {
    const child = spawn(TSX_BIN, [CLI_SCRIPT, ...args], {
      cwd: ROOT,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => outChunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk: Buffer) => errChunks.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      resolvePromise({
        code,
        stdout: Buffer.concat(outChunks).toString("utf8"),
        stderr: Buffer.concat(errChunks).toString("utf8"),
      });
    });
  });
}

test("BL-328 S-evaluation-isolation: evaluation CLI refuses real ~/.molis-work and subdirectories before touching disk", async () => {
  const realHome = join(homedir(), ".molis-work");
  const exact = await runEvalCli(["--home", realHome]);
  assert.equal(exact.code, 2);
  assert.match(exact.stderr, /REFUSED:/u);

  const nested = await runEvalCli(["--home", join(realHome, "scratch-eval-child")]);
  assert.equal(nested.code, 2);
  assert.match(nested.stderr, /REFUSED:/u);
  assert.equal(existsSync(join(realHome, "scratch-eval-child")), false);

  const envLiveNoKey = await runEvalCli(["--mode", "live"], {
    MOLIS_WORK_HOME: realHome,
    GEMINI_API_KEY: undefined,
    MOLIS_EVAL_API_KEY: undefined,
  });
  assert.equal(envLiveNoKey.code, 2);
  assert.match(envLiveNoKey.stderr, /REFUSED:/u);
});

test(
  "BL-328 PWA-51 PWA-52 PWA-53 PWA-54 PWA-55 PWA-56 OCL-12 OCL-13 OCL-14 OCL-17: stand-in mode verifies reproducibility across isolated Homes and deletes scratch Home",
  { timeout: 120_000 },
  async (t) => {
    const outDir = mkdtempSync(join(tmpdir(), "eval-cli-out-"));
    const explicitScratch = join(outDir, "custom-scratch-home");
    const jsonPath = join(outDir, "report.json");
    t.after(() => rmSync(outDir, { recursive: true, force: true }));

    // 1. Explicit scratch Home is created, evaluated, and automatically deleted on exit.
    const single = await runEvalCli(["--mode", "stand-in", "--home", explicitScratch, "--json", jsonPath]);
    assert.equal(single.code, 0, single.stderr || single.stdout);
    assert.equal(existsSync(explicitScratch), false, "scratch Home must be deleted on exit when --keep-home is not set");

    const parsed = JSON.parse(readFileSync(jsonPath, "utf8")) as {
      mode: string;
      model_id: string;
      all_expectations_matched: boolean;
      replay_isolated_from_real_audit: boolean;
      blocked_external_effects_count: number;
      human_review_applied_without_mutation: boolean;
      home_cleaned_up: boolean;
      cases: Array<{ sample_id: string; observed_verdict: string; matched_expectation: boolean }>;
      replay_comparison: { verdict_transition: string; improved_stages: string[] };
      metrics: {
        validation: { sample_count: number; verdict_counts: { passed: number; failed: number; unknown: number } };
        tuning: { sample_count: number };
      };
      reproducibility_digest: string;
    };
    assert.equal(parsed.mode, "stand-in");
    assert.equal(parsed.model_id, "gemini-2.5-flash");
    assert.equal(parsed.all_expectations_matched, true);
    assert.equal(parsed.replay_isolated_from_real_audit, true);
    assert.equal(parsed.blocked_external_effects_count, 2);
    assert.equal(parsed.human_review_applied_without_mutation, true);
    assert.equal(parsed.home_cleaned_up, true);
    assert.equal(parsed.replay_comparison.verdict_transition, "failed->passed");
    assert.equal(parsed.replay_comparison.improved_stages.includes("materials"), true);
    assert.equal(parsed.metrics.validation.sample_count, 7);
    assert.equal(parsed.metrics.validation.verdict_counts.passed, 5);
    assert.equal(parsed.metrics.validation.verdict_counts.unknown, 2);
    assert.equal(parsed.metrics.tuning.sample_count, 2);

    // 2. `--verify-reproducible` runs across 2 fresh isolated Homes and yields identical digests.
    const reproJson = join(outDir, "repro.json");
    const repro = await runEvalCli(["--mode", "stand-in", "--verify-reproducible", "--json", reproJson]);
    assert.equal(repro.code, 0, repro.stderr || repro.stdout);
    assert.match(repro.stdout, /Reproducibility check across 2 isolated Homes: IDENTICAL/u);
    const reproParsed = JSON.parse(readFileSync(reproJson, "utf8")) as {
      reproducibility_verified: boolean;
      reproducibility_digest: string;
      second_reproducibility_digest: string;
    };
    assert.equal(reproParsed.reproducibility_verified, true);
    assert.equal(reproParsed.reproducibility_digest, reproParsed.second_reproducibility_digest);
    assert.equal(reproParsed.reproducibility_digest, parsed.reproducibility_digest);
  },
);

test(
  "BL-328: live mode defaults to Gemini series, skips cleanly without key, and redacts inline GEMINI_API_KEY in live runs",
  { timeout: 120_000 },
  async (t) => {
    const skipRes = await runEvalCli(["--mode", "live"], {
      GEMINI_API_KEY: undefined,
      MOLIS_EVAL_API_KEY: undefined,
    });
    assert.equal(skipRes.code, 0);
    assert.match(skipRes.stdout, /SKIP:/u);

    const reqRes = await runEvalCli(["--mode", "live", "--require-live"], {
      GEMINI_API_KEY: undefined,
      MOLIS_EVAL_API_KEY: undefined,
    });
    assert.equal(reqRes.code, 2);
    assert.match(reqRes.stderr, /REFUSED:/u);

    // Local OpenAI-chat-completions stub verifying Gemini-series default model & Authorization Bearer wiring + secret redaction.
    const observedAuthHeaders: string[] = [];
    const observedModels: string[] = [];
    const observedPaths: string[] = [];
    const server = createServer((req, res) => {
      observedPaths.push(req.url ?? "");
      if (typeof req.headers.authorization === "string") {
        observedAuthHeaders.push(req.headers.authorization);
      }
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(Buffer.from(c)));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { model?: string; stream?: boolean };
        if (body.model) observedModels.push(body.model);
        const replyText = "Gemini 评测确认：样本留存豁免清理且隔离回放阻断外部副作用。";
        if (body.stream) {
          res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
          const c1 = JSON.stringify({
            id: "gemini-live-stub",
            object: "chat.completion.chunk",
            model: body.model ?? "gemini-2.5-flash",
            choices: [{ index: 0, delta: { role: "assistant", content: replyText }, finish_reason: null }],
          });
          const c2 = JSON.stringify({
            id: "gemini-live-stub",
            object: "chat.completion.chunk",
            model: body.model ?? "gemini-2.5-flash",
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            usage: { prompt_tokens: 30, completion_tokens: 18, total_tokens: 48 },
          });
          res.end(`data: ${c1}\n\ndata: ${c2}\n\ndata: [DONE]\n\n`);
          return;
        }
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            id: "gemini-live-stub",
            object: "chat.completion",
            model: body.model ?? "gemini-2.5-flash",
            choices: [{ index: 0, message: { role: "assistant", content: replyText }, finish_reason: "stop" }],
            usage: { prompt_tokens: 30, completion_tokens: 18, total_tokens: 48 },
          }),
        );
      });
    });
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const addr = server.address();
    assert.ok(addr && typeof addr !== "string");
    const outDir = mkdtempSync(join(tmpdir(), "eval-live-stub-"));
    t.after(async () => {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
      rmSync(outDir, { recursive: true, force: true });
    });

    const runtimeProbeMarker = `gemini-dummy-probe-${randomUUID()}`;
    const outJson = join(outDir, "live-report.json");
    const liveRun = await runEvalCli(
      ["--mode", "live", "--base-url", `http://127.0.0.1:${addr.port}/v1beta/openai`, "--require-live", "--json", outJson],
      { GEMINI_API_KEY: runtimeProbeMarker },
    );
    assert.equal(liveRun.code, 0, liveRun.stderr || liveRun.stdout);
    assert.equal(observedModels.every((m) => m === "gemini-2.5-flash"), true);
    assert.equal(observedPaths.every((p) => p === "/v1beta/openai/chat/completions"), true);
    assert.equal(observedAuthHeaders.includes(`Bearer ${runtimeProbeMarker}`), true);
    assert.equal(liveRun.stdout.includes(runtimeProbeMarker), false);
    assert.equal(readFileSync(outJson, "utf8").includes(runtimeProbeMarker), false);
  },
);
