import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOrder, readPackages, inputDigests, staleReason } from "../build-workspace.mjs";
import { vendoredProvenanceProblems } from "../gates/vendored-provenance.mjs";

export const MEMORY_BASELINE = {
  toolingCommit: "5e47ed2bc369c8c0123c651b4e2a70fa0e1f2665",
  molisCommit: "f6b2ff4bfba4f7ceb5aeaf95495a5e41fe85ea10",
  sdkCommit: "753dbae8359e56a74397d030af4d18abf402d5b5",
  sdkArtifact: "prologue-sdk-0.0.0-rc.1-attachment-order.tgz",
  policy: "当前生产 MemoryService，保留现有有效 prefs（默认 auto=true）",
  attribution: "B2 若同时升级 SDK，须增加同一新 SDK + 旧配方的升级对照；不能将上游性能/安全修复全归于新 memory 策略",
} as const;

// Only these C0 documents and Q0 instruments may differ from the frozen production tree.
// Markdown is not generally exempt: prompts and Skills can change production behavior.
const evaluationPaths = new Set([
  "docs/horizontal/memory.md", "horizontal/memory/README.md", "specs/README.md",
  "specs/prologue-memory-strategy/spec.md", "specs/prologue-memory-strategy/baseline-2026-10-22.json",
  "scripts/memory-evaluation.mts", "scripts/memory-evaluation/baseline.mts", "scripts/memory-evaluation/replay.mts",
  "scripts/memory-evaluation/model-replay.mts", "scripts/memory-evaluation/sequence-replay.mts",
  "scripts/memory-evaluation/request-observation.mts", "scripts/memory-evaluation/report.mts", "scripts/memory-evaluation/scale.mts",
  "tests/fixtures/memory-evaluation-corpus.ts", "tests/fixtures/memory-evaluation-sequences.ts",
  "tests/memory-evaluation.test.ts", "tests/memory-evaluation-sequence.test.ts", "tests/memory-evaluation-scale.test.ts",
  "tests/memory-evaluation-baseline.test.ts",
]);

/** Compare the complete production tree, including commits, staged/unstaged changes and untracked files. */
export function memoryEvaluationSourceEvidence(root: string, baselineCommit: string = MEMORY_BASELINE.molisCommit) {
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 });
  const changed = git("diff", "--name-only", "-z", baselineCommit, "--").split("\0").filter(Boolean);
  const untracked = git("ls-files", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean);
  const paths = [...new Set([...changed, ...untracked])].sort();
  return { molisCommit: git("rev-parse", "HEAD").trim(), comparisonBase: baselineCommit,
    evaluationChanges: paths.filter(file => evaluationPaths.has(file)), productChanges: paths.filter(file => !evaluationPaths.has(file)) };
}

function installedSdkMatches(root: string, artifact = MEMORY_BASELINE.sdkArtifact as string) {
  const link = join(root, "horizontal/agent-host/node_modules/@prologue/sdk");
  if (!existsSync(link)) return { matches: false, location: null };
  const location = realpathSync(link);
  const temporary = mkdtempSync(join(tmpdir(), "molis-evaluation-sdk-"));
  try {
    execFileSync("tar", ["-xf", join(root, "vendor/prologue-sdk", artifact), "-C", temporary], { stdio: "pipe" });
    try { execFileSync("diff", ["-qr", join(temporary, "package"), location], { stdio: "pipe" }); }
    catch { return { matches: false, location: relative(root, location) }; }
    return { matches: true, location: relative(root, location) };
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

function buildEvidence(root: string) {
  // build-workspace closes over its import.meta.url root; it cannot attest a different checkout.
  if (realpathSync(root) !== realpathSync(fileURLToPath(new URL("../../", import.meta.url)))) throw new Error("Preflight must run the tool located in the inspected worktree");
  const recordsPath = join(root, "node_modules/.cache/molis-work-build/records.json");
  if (!existsSync(recordsPath)) return { checked: false, stale: ["没有本工作树构建记录"] };
  const records: Record<string, { input: string; output: string }> = JSON.parse(readFileSync(recordsPath, "utf8"));
  const order = buildOrder(readPackages());
  const files = execFileSync("git", ["ls-files", "-z", "-co", "--exclude-standard"], { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 }).split("\0").filter(Boolean);
  const digests = inputDigests(order, files);
  const stale: string[] = [];
  for (const entry of order) {
    const reason = staleReason(entry, digests.get(entry.name), records[entry.name]);
    if (reason) stale.push(`${entry.name}: ${reason}`);
  }
  return { checked: true, stale };
}

/** 仅读当前工作树和包来源；不打开真实 Home、不解析凭据、不发模型请求。 */
export function memoryEvaluationPreflight(root: string) {
  const provenancePath = join(root, "vendor/prologue-sdk", `${MEMORY_BASELINE.sdkArtifact}.provenance.json`);
  const provenance: { source?: { commit?: string }; artifact?: { file?: string } } = JSON.parse(readFileSync(provenancePath, "utf8"));
  const source = memoryEvaluationSourceEvidence(root);
  const build = buildEvidence(root);
  const installedSdk = installedSdkMatches(root);
  const provenanceProblems = vendoredProvenanceProblems(root);
  return {
    baseline: MEMORY_BASELINE,
    current: { ...source, sdkCommit: provenance.source?.commit ?? null, sdkArtifact: provenance.artifact?.file ?? null, installedSdk, provenanceProblems, build },
    matchesFrozenBaseline: source.productChanges.length === 0 && provenance.source?.commit === MEMORY_BASELINE.sdkCommit && installedSdk.matches && !provenanceProblems.length && build.checked && !build.stale.length,
    dependencies: { installed: existsSync(join(root, "node_modules")), memoryBuilt: existsSync(join(root, "horizontal/memory/dist/index.js")), hostBuilt: existsSync(join(root, "apps/local-host/dist/index.js")) },
    model: { status: "not-probed", allowedProvider: "MiniMax", calls: 0, reason: "付费模式尚未启用；真实模型预算与配置须先由统筹确认" },
  };
}

/** Current identity is never the historical B1 baseline. Dirty paths stay visible even in local fixture reports. */
const currentInstruments = new Set(["scripts/memory-evaluation/environment.mts", "scripts/memory-evaluation/originals.mts"]);
export function currentEvaluationSource(root = fileURLToPath(new URL("../../", import.meta.url))) {
  const dependency = JSON.parse(readFileSync(join(root, "horizontal/agent-host/package.json"), "utf8")).dependencies["@prologue/sdk"] as string;
  if (!dependency.startsWith("file:")) throw new Error("B2 requires the declared vendored SDK package");
  const archive = resolve(root, "horizontal/agent-host", dependency.slice(5));
  const provenance = JSON.parse(readFileSync(`${archive}.provenance.json`, "utf8"));
  const evidence = memoryEvaluationSourceEvidence(root, "HEAD");
  return { arm: "B2" as const, ...evidence,
    evaluationChanges: [...evidence.evaluationChanges, ...evidence.productChanges.filter(path => currentInstruments.has(path))].sort(),
    productChanges: evidence.productChanges.filter(path => !currentInstruments.has(path)),
    sdkCommit: provenance.source?.commit ?? null, sdkArtifact: relative(join(root, "vendor/prologue-sdk"), archive),
    historicalBaseline: MEMORY_BASELINE, attribution: "Current B2; not a rerun of B1 or an isolated SDK-upgrade attribution experiment" };
}

export function memoryEvaluationB2Preflight(root: string) {
  const source = currentEvaluationSource(root), build = buildEvidence(root);
  const installedSdk = installedSdkMatches(root, source.sdkArtifact), provenanceProblems = vendoredProvenanceProblems(root);
  return { source, build, installedSdk, provenanceProblems,
    ready: !source.productChanges.length && !source.evaluationChanges.length && build.checked && !build.stale.length && installedSdk.matches && !provenanceProblems.length,
    dependencies: { installed: existsSync(join(root, "node_modules")), memoryBuilt: existsSync(join(root, "horizontal/memory/dist/index.js")), hostBuilt: existsSync(join(root, "apps/local-host/dist/index.js")) },
    model: { calls: 0, status: "not-probed", reason: "Paid B2 needs a separately confirmed remaining budget; preflight does not grant it" } };
}
