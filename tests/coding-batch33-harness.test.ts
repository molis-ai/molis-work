import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { artifactSubjectId, type ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { AgentRunRef, AgentRunView, AgentStepBoard } from "@molis-ai/molis-work-contracts/services/agent-host";
import { KNOWLEDGE_PROVIDER_ID, knowledgeActions } from "@molis-ai/molis-work-contracts/services/knowledge";
import { ensureSystemAgentService, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import {
  renderCodingRoundMaterials,
  renderEnvChecklist,
  renderFileKind,
  renderMaterialsFunnel,
  renderMaterialsTrack,
  renderPrimitiveCatalog,
  renderRoundReportCard,
  renderScopeDeltaCard,
  renderTaskAttemptBudget,
} from "@molis-ai/molis-work-design-system";
import {
  codingHistoryDigest,
  codingTimelineWords,
  createCodingTimeline,
  historySummaryMaterial,
  isValidFibonacciStoryPoints,
  parseCodingPlan,
} from "@molis-ai/molis-work-plugin-coding";
import {
  applyUnknownCommandOutcomes,
  computeWeightedStepBoardProgress,
  effectiveCompactionAboveTokens,
  effectiveContextWindow,
  pinnedMaterialRevisions,
  SUBAGENT_DEFAULT_MAX_ATTEMPTS,
  withPinnedKnowledgeRevision,
} from "@molis-ai/molis-work-service-agent-host";
import { formatBoardProgressSummary, stepPointsBadge } from "../plugins/native/coding/src/browser/taskboard-steps.js";
import { buildEnvironmentChecklistHtml } from "../plugins/native/coding/src/browser/main/configuration.js";
import { buildRoundMaterialsHtml } from "../plugins/native/coding/src/browser/main/run-block.js";
import { cogniaModelResponse, cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";
import { codingProductHost } from "./fixtures/coding-product-host.js";
import { withPageText } from "./fixtures/page-text.js";
import { chinesePagePacks, pageTextForPacks, withPagePacks } from "./fixtures/page-text-packs.js";

const CODING_PREFIX = "/api/plugins/io.molis.work.coding";
const fixedRef = (reference: { artifact_id: string; version: number }, title = "notes") => ({
  ref: { subject: { kind: "artifact", id: artifactSubjectId(reference) }, pin: { mode: "fixed", version: { artifact_id: reference.artifact_id, version: reference.version } } },
  title,
});

interface FakeNode {
  tagName: string;
  className: string;
  innerHTML: string;
  textContent: string;
  hidden: boolean;
  dataset: Record<string, string>;
  attrs: Record<string, string>;
  children: FakeNode[];
  firstElementChild: FakeNode | null;
  lastElementChild: FakeNode | null;
  append(child: FakeNode): void;
  querySelector(selector: string): FakeNode | null;
  querySelectorAll(): FakeNode[];
  setAttribute(name: string, value: string): void;
}

function makeFakeBlock(): FakeNode {
  const make = (tagName: string): FakeNode => {
    const children: FakeNode[] = [];
    const node: FakeNode = {
      tagName: tagName.toUpperCase(),
      className: "",
      innerHTML: "",
      textContent: "",
      hidden: false,
      dataset: {},
      attrs: {},
      children,
      get firstElementChild() { return children[0] ?? null; },
      get lastElementChild() { return children.at(-1) ?? null; },
      append(child: FakeNode) { children.push(child); },
      querySelector(selector: string) {
        if (selector === ":scope > .coding-run-footer") return children.find(item => item.className === "coding-run-footer") ?? null;
        return null;
      },
      querySelectorAll() { return []; },
      setAttribute(name: string, value: string) { node.attrs[name] = value; },
    };
    return node;
  };
  (globalThis as Record<string, unknown>).document ??= { createElement: (tag: string) => make(tag) };
  return make("div");
}

test("Batch 33 component catalog specimens (#recovery-closures) and ENV file mark render decided shapes", () => {
  // CHO-11, CHO-12, CHO-13, CHO-35, ONB-38, C12, C14
  const catalogHtml = withPageText("zh", [], renderPrimitiveCatalog);
  assert.ok(catalogHtml.includes("href=\"#recovery-closures\""), "recovery-closures is indexed in catalog navigation");
  assert.ok(catalogHtml.includes("id=\"recovery-closures\""), "missing catalog section recovery-closures");
  for (const primitive of [
    "data-primitive=\"env-checklist\"",
    "data-primitive=\"task-attempt-budget\"",
    "data-primitive=\"round-report-card\"",
    "data-primitive=\"materials-funnel-track\"",
    "data-primitive=\"scope-delta-card\"",
    "data-primitive=\"coding-round-materials\"",
  ]) {
    assert.ok(catalogHtml.includes(primitive), `missing catalog specimen ${primitive}`);
  }
  assert.ok(renderFileKind(".env").includes("mw-file-kind--env"), "bare .env renders mw-file-kind--env");
  assert.ok(renderFileKind(".env.local").includes(">ENV<"), ".env.local renders ENV mark instead of LOCAL");
  assert.ok(renderEnvChecklist({ title: "准备清单", statusLabel: "就绪", statusTone: "done", rows: [{ state: "done", label: "依赖", value: "pnpm" }] }).includes("data-slot=\"env-checklist\""));
  assert.ok(renderTaskAttemptBudget({ headerText: "第 2 次，共 2 次", budgetPercent: 90, summaryText: "检查未过" }).includes("is-hot"));
  assert.ok(renderRoundReportCard({
    statusLabel: "本轮结束",
    statusTone: "done",
    finishedAtLabel: "刚刚",
    headings: { delivered: "交付了什么", verified: "怎么验证的", remaining: "没做完的" },
    delivered: [],
    verified: [],
    remaining: [],
  }).includes("data-slot=\"round-report-card\""));
  assert.ok(renderMaterialsFunnel([{ label: "已发现", value: 5 }], "材料核对统计").includes("mw-mr-funnel"));
  assert.ok(renderMaterialsTrack({ step: 3, label: "已读取" }).includes("mw-mr-cells"));
  assert.ok(renderScopeDeltaCard({ title: "这次只做这些", items: [{ kind: "add", glyph: "plus", title: "新增 1 份", detail: "spec.md" }] }).includes("data-slot=\"scope-delta-card\""));
  assert.ok(renderCodingRoundMaterials({ title: "本轮材料", summaryLabel: "2 份", summaryTone: "done", items: [{ state: "done", name: "spec.md", how: "全文", statusLabel: "全文", statusTone: "done" }] }).includes("data-slot=\"coding-round-materials\""));

  const enCatalogHtml = withPageText("en", [], renderPrimitiveCatalog);
  const enStart = enCatalogHtml.indexOf("id=\"recovery-closures\"");
  assert.ok(enStart >= 0, "English catalog includes #recovery-closures");
  const nextSec = enCatalogHtml.indexOf("<section class=\"mw-catalog__section\"", enStart + 1);
  const enRecoverySlice = enCatalogHtml.slice(enStart, nextSec > enStart ? nextSec : undefined);
  assert.equal(/[\u3400-\u9fff]/u.test(enRecoverySlice), false, `English #recovery-closures must contain zero Han characters: ${enRecoverySlice.match(/[\u3400-\u9fff]+/gu)?.join(", ") ?? ""}`);
});

test("CHO-08, CHO-09, CHO-10: context window scaling, proportional compaction threshold, and digest verification retention", () => {
  assert.deepEqual(effectiveContextWindow(1_000_000, 200_000), { window_tokens: 1_000_000 });
  assert.deepEqual(effectiveContextWindow(64_000, 200_000), { window_tokens: 64_000 });
  assert.deepEqual(effectiveContextWindow(1_000_000, 200_000, 128_000), { window_tokens: 128_000, stated_window_tokens: 1_000_000 });
  assert.deepEqual(effectiveContextWindow(undefined, 200_000), { window_tokens: 200_000, window_unknown: true });
  assert.equal(effectiveCompactionAboveTokens({ above_tokens: 150_000, window_ratio: 0.75 }, 1_000_000), 750_000);
  assert.equal(effectiveCompactionAboveTokens({ above_tokens: 150_000, window_ratio: 0.75 }, 64_000), 48_000);
  assert.equal(effectiveCompactionAboveTokens({ above_tokens: 150_000 }, 1_000_000), 150_000);

  const fakeRun: AgentRunView = {
    ref: { session_id: "s1", run_id: "r1" },
    phase: "completed",
    started_at: "2026-11-14T10:00:00.000Z",
    ended_at: "2026-11-14T10:01:00.000Z",
    usage: { tokens: { input: 100, output: 50 } },
    awaiting_input: [],
    turns: [
      { turn_id: "t1", kind: "user", text: "修复导出并跑测试", at: null },
      { turn_id: "t2", kind: "assistant", text: "已经全部完成并通过！", at: null },
    ],
    activity: [
      { call_id: "c1", name: "run-command", target: "pnpm test", state: "completed", summary: "", at: null, output: "exit 0\nok" },
      { call_id: "c2", name: "edit", target: "src/export.ts", state: "completed", summary: "", at: null },
      { call_id: "c3", name: "run-command", target: "pnpm lint", state: "completed", summary: "", at: null, output: "exit 1\nerror" },
      { call_id: "c4", name: "start-command", target: "pnpm dev", state: "completed", summary: "", at: null, output: "started pid 99" },
    ],
    step_board: {
      project_id: "p1",
      version: 2,
      terminal: false,
      nodes: [
        { id: "step-1", title: "修复导出", state: "succeeded", reports: [], owner: { kind: "session", label: "本会话" } },
        { id: "step-2", title: "补齐回归用例", state: "running", reports: [], owner: { kind: "session", label: "本会话" } },
      ],
    },
    frozen: { workspace: "none", role_id: "writer", role_version: 1, execution: "workspace-write", model_id: "m", prompts: [], skills: [], mcp_tools: [], mcp_sources: [], host_tools: [], text_materials: [], budget: null },
  };

  const digest = codingHistoryDigest([fakeRun], "继续做完剩余步骤");
  assert.match(digest, /含待核对结果/);
  assert.match(digest, /失败命令：pnpm lint/);
  assert.match(digest, /结果未知（待核对，不视作已完成）：pnpm dev/);
  assert.match(digest, /最后一次通过的检查之后又改过文件/);
  assert.match(digest, /未完成计划步骤：「补齐回归用例」（running）/);
  const material = historySummaryMaterial([fakeRun]);
  assert.match(material, /失败命令：pnpm lint/);
  assert.match(material, /未完成计划步骤：「补齐回归用例」/);
});

test("CHO-11, CHO-12, BL-222: round 4-section digest reports stale checks, unknown command ends, and pre-existing failures", () => {
  const packs = chinesePagePacks("coding");
  withPagePacks("zh", packs, () => {
    const timeline = createCodingTimeline(codingTimelineWords(pageTextForPacks("zh", packs)));
    const block = makeFakeBlock();
    timeline.renderFooter(block, {
      ref: { run_id: "r-stale" },
      phase: "completed",
      code_revision: "e8b410c",
      started_at: "2026-11-14T10:00:00.000Z",
      ended_at: "2026-11-14T10:00:12.000Z",
      activity: [
        { call_id: "c0", name: "run-command", target: "pnpm test:baseline", state: "completed", output: "exit 1\nbaseline red" },
        { call_id: "c1", name: "run-command", target: "pnpm test:unit", state: "completed", output: "exit 0\npass" },
        { call_id: "c2", name: "edit", target: "src/app.ts", state: "completed" },
      ],
      turn_changes: [{ turn: 1, sequence: 1, files: [{ path: "src/app.ts", byte_length: 42, digest: "d1", checkpoint_id: "cp-1" }] }],
    }, 0, true, false);
    const staleHtml = block.lastElementChild!.innerHTML;
    assert.ok(staleHtml.includes("data-slot=\"round-report-card\""), "renders shared round-report-card primitive");
    assert.ok(staleHtml.includes("data-coding-round-digest"), "renders round digest attribute");
    assert.ok(staleHtml.includes("e8b410c"), "renders code revision badge on verified check");
    assert.ok(staleHtml.includes("data-coding-rerun-checks=\"r-stale\""), "offers rerun-checks button on stale verification");
    assert.match(staleHtml, /结果已过期/);
    assert.match(staleHtml, /改代码前跑过，改后未重跑/);
    assert.match(staleHtml, /开始前已红/);

    const unknownBlock = makeFakeBlock();
    timeline.renderFooter(unknownBlock, {
      ref: { run_id: "r-unknown" },
      phase: "completed",
      started_at: "2026-11-14T10:01:00.000Z",
      ended_at: "2026-11-14T10:01:05.000Z",
      activity: [
        { call_id: "u1", name: "run-command", target: "pnpm deploy:dry", state: "completed", output: "" },
      ],
    }, 1, true, false);
    const unknownHtml = unknownBlock.lastElementChild!.innerHTML;
    assert.ok(unknownHtml.includes("data-mw-state=\"verify\""), "unknown command end marks verify ring instead of done (BL-222)");
    assert.ok(!unknownHtml.includes("data-tone=\"done\""), "round with unknown command receipt never claims done");
    assert.match(unknownHtml, /结果未知/);
  });
});

test("B1, B5 & B7: withPinnedKnowledgeRevision gateway pinning, client progress formatting, open env checklist, and live round materials continuation", () => {
  const knowledgeReadRef = { provider_id: KNOWLEDGE_PROVIDER_ID, capability_id: knowledgeActions.read.capability_id, version: 1 };
  const pinnedMap = pinnedMaterialRevisions([
    { material_id: "m1", title: "spec.md", text: "body", source_artifact_id: "art-1", source_version: 1, read_revision: "rev-initial" },
  ]);
  const injected = withPinnedKnowledgeRevision(knowledgeReadRef, { subject: { kind: "artifact", id: "art-1@1" } }, pinnedMap) as { expected_revision?: string };
  assert.equal(injected.expected_revision, "rev-initial", "injects pinned expected_revision onto knowledge.read@1");
  const sameOk = withPinnedKnowledgeRevision(knowledgeReadRef, { subject: { kind: "artifact", id: "art-1@1" }, expected_revision: "rev-initial" }, pinnedMap) as { expected_revision?: string };
  assert.equal(sameOk.expected_revision, "rev-initial");
  assert.throws(
    () => withPinnedKnowledgeRevision(knowledgeReadRef, { subject: { kind: "artifact", id: "art-1@1" }, expected_revision: "rev-other" }, pinnedMap),
    (err: { code?: string }) => err.code === "knowledge.revision_changed",
  );

  const packs = chinesePagePacks("coding");
  withPagePacks("zh", packs, () => {
    const sampleNodes = [
      { id: "step-1", title: "拆解 CSV 解析器", state: "running" as const, story_points: 2, progress: 0.5, progress_basis: "解析器主函数与 6 个单测已绿", reports: [], owner: { kind: "session" as const, label: "本会话" } },
      { id: "step-2", title: "接入流式输出", state: "not-started" as const, story_points: 3, reports: [], owner: { kind: "session" as const, label: "本会话" } },
      { id: "step-3", title: "补齐端到端回归", state: "not-started" as const, story_points: 8, estimate_source: "human" as const, reports: [], owner: { kind: "session" as const, label: "本会话" } },
    ];
    const summary = computeWeightedStepBoardProgress(sampleNodes);
    const summaryText = formatBoardProgressSummary(summary, sampleNodes);
    assert.equal(summaryText.includes("NaN"), false, `summary must never contain NaN: ${summaryText}`);
    assert.match(summaryText, /1 \/ 13 点/);
    const badge = stepPointsBadge(sampleNodes, sampleNodes[0]!);
    assert.match(badge.text, /2/);
    assert.match(badge.title, /50%/);
    assert.match(badge.title, /解析器主函数与 6 个单测已绿/);
    assert.equal(badge.title.includes("0.5%"), false);

    const envHtml = buildEnvironmentChecklistHtml({
      workspace_id: "ws-1",
      status: "attention",
      branch: "main",
      head_commit: "e8b410caabbcc",
      dirty_count: 2,
      git_conflicted_count: 0,
      git_merging: false,
      is_git_repo: true,
      deps_manager: "pnpm",
      deps_installed: false,
      script_names: ["test", "dev"],
      ports: [5173],
      env_template: ".env.example",
      env_keys: ["DATABASE_URL"],
      has_local_env: false,
      worktrees: { active: 1, problem_count: 0, cleanup_count: 0 },
      checked_at: "2026-11-14T10:00:00.000Z",
    });
    assert.ok(envHtml.includes("data-slot=\"env-checklist\""), "renders open env-checklist primitive");
    assert.ok(!envHtml.startsWith("<details"), "env checklist is never a collapsed details bar");
    assert.match(envHtml, /开始前已有/);
    assert.match(envHtml, /基线测试/);
    assert.match(envHtml, /pnpm test/);
    assert.ok(envHtml.includes("data-slot=\"env-recovery\""), "attaches inline recovery alert for missing deps/env");
    assert.ok(envHtml.includes("data-coding-env-action=\"install-deps\""), "attaches actionable dependency recovery button");
    assert.ok(envHtml.includes("data-coding-env-action=\"open-files\""), "attaches actionable env/files recovery button");

    const baseFrozen = {
      model_id: "m",
      role_id: "reader",
      role_version: 1,
      skills: [],
      text_materials: [{
        material_id: "mat-pdf",
        title: "architecture.pdf",
        source_artifact_id: "art-pdf",
        read_revision: "r1",
        delivery: "clipped" as const,
      }],
    };
    const beforeHtml = buildRoundMaterialsHtml({ frozen: baseFrozen, activity: [] });
    assert.ok(beforeHtml.includes("data-slot=\"coding-round-materials\""));
    assert.match(beforeHtml, /前 12,000 字/);
    const afterHtml = buildRoundMaterialsHtml({
      frozen: baseFrozen,
      activity: [{ call_id: "k1", name: "knowledge.read@1", target: "art-pdf", state: "completed" }],
    });
    assert.match(afterHtml, /已接着读/);
  });
});

test("CHO-13: Coding /state inspects git, missing deps, scripts/ports, and .env.example keys without reading .env secrets", { timeout: 45_000 }, async t => {
  const { home, project, other, directory, call } = await codingProductHost(t, () => cogniaModelResponse("ok"));
  execFileSync("git", ["init", "-b", "main"], { cwd: directory, stdio: "ignore" });
  const pkgContent = "{\"name\":\"demo-app\",\"scripts\":{\"test\":\"vitest run\",\"dev\":\"vite --port 5173\"}}";
  await writeFile(join(directory, "package.json"), pkgContent, "utf8");
  await writeFile(join(directory, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
  await writeFile(join(directory, ".env.example"), "DATABASE_URL=\nSTRIPE_SECRET_KEY=\n", "utf8");

  interface StateBody {
    environment_readiness?: {
      status: string;
      branch: string | null;
      dirty_count: number;
      items: Array<{ id: string; status: string; detail: string }>;
    };
  }
  const missingEnvState = await call<StateBody>(project.project_id, `${CODING_PREFIX}/state`);
  assert.equal(missingEnvState.status, 200);
  const missingById = new Map((missingEnvState.body.environment_readiness?.items ?? []).map(item => [item.id, item]));
  assert.equal(missingById.get("env")?.status, "warn");
  assert.match(missingById.get("env")?.detail ?? "", /DATABASE_URL/);
  assert.match(missingById.get("env")?.detail ?? "", /STRIPE_SECRET_KEY/);

  const envDir = join(home, "work-with-env");
  await mkdir(envDir);
  execFileSync("git", ["init", "-b", "main"], { cwd: envDir, stdio: "ignore" });
  await writeFile(join(envDir, "package.json"), pkgContent, "utf8");
  await writeFile(join(envDir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
  await writeFile(join(envDir, ".env.example"), "DATABASE_URL=\nSTRIPE_SECRET_KEY=\n", "utf8");
  const rawEnvToken = ["sk", "live", "NEVER_READ_FROM_DOTENV_998877"].join("_");
  await writeFile(join(envDir, ".env"), `DATABASE_URL=postgres://local\n${["STRIPE", "SECRET", "KEY"].join("_")}=${rawEnvToken}\n`, "utf8");
  const readOtherDirs = await call<{ revision: string }>(other.project_id, "/api/project-settings/directories");
  const setOtherDir = await call(other.project_id, "/api/project-settings/directories", {
    change: "set_output", input: { workspace_path: envDir, expected_revision: readOtherDirs.body.revision },
  });
  assert.equal(setOtherDir.status, 200);

  const state = await call<StateBody>(other.project_id, `${CODING_PREFIX}/state`);
  assert.equal(state.status, 200);
  const env = state.body.environment_readiness;
  assert.ok(env, "environment_readiness is returned on /state");
  assert.equal(env.status, "attention", "missing node_modules marks attention");
  const serialized = JSON.stringify(state.body);
  assert.equal(serialized.includes(rawEnvToken), false, ".env secret values are never read or returned");
  const byId = new Map(env.items.map(item => [item.id, item]));
  assert.equal(byId.get("deps")?.status, "warn");
  assert.match(byId.get("deps")?.detail ?? "", /node_modules/);
  assert.match(byId.get("scripts")?.detail ?? "", /5173/);
  assert.equal(byId.get("env")?.status, "ok");
  assert.match(byId.get("env")?.detail ?? "", /不读取密钥值/);
});

test("CHO-29, CHO-30, CHO-31, CHO-32, CHO-33: Fibonacci story points validation and leaf-only weighted progress", () => {
  for (const valid of [1, 2, 3, 5, 8, 13, 21, 34, 55]) assert.equal(isValidFibonacciStoryPoints(valid), true, `valid=${valid}`);
  for (const invalid of [0, -1, 4, 6, 7, 9, 10, 12, 1.5, Number.NaN]) assert.equal(isValidFibonacciStoryPoints(invalid), false, `invalid=${invalid}`);
  assert.throws(() => parseCodingPlan({ title: "非法点数", steps: [{ title: "步骤", acceptance: "通过", story_points: 4 }], blockers: "", change_reason: "" }), /斐波那契/);

  // CHO-30: 2 + 3 + 5 = 10; first two done => 50% (not 66.7%); third at 50% with basis => 75%.
  const base = computeWeightedStepBoardProgress([
    { id: "s1", state: "succeeded", story_points: 2 },
    { id: "s2", state: "succeeded", story_points: 3 },
    { id: "s3", state: "not-started", story_points: 5 },
  ]);
  assert.equal(base.weighted_percent, 50);
  assert.equal(base.completed_points, 5);
  assert.equal(base.total_points, 10);

  const half = computeWeightedStepBoardProgress([
    { id: "s1", state: "succeeded", story_points: 2 },
    { id: "s2", state: "succeeded", story_points: 3 },
    { id: "s3", state: "running", story_points: 5, progress: 0.5 },
  ]);
  assert.equal(half.weighted_percent, 75);
  assert.equal(half.completed_points, 7.5);

  // CHO-31: parent epic (parent_id referenced by children) never double-counts its own points on top of children.
  const nested = computeWeightedStepBoardProgress([
    { id: "epic", state: "running", story_points: 8 },
    { id: "c1", parent_id: "epic", state: "succeeded", story_points: 3 },
    { id: "c2", parent_id: "epic", state: "running", story_points: 3 },
  ]);
  assert.equal(nested.total_points, 6, "parent points are not added on top of leaf children");
  assert.equal(nested.weighted_percent, 50);

  // CHO-32: adding a 3-point unfinished step after 5/10 recalculates to 38.5%; scope_removed leaves denominator while failed/stopped stays.
  const expanded = computeWeightedStepBoardProgress([
    { id: "s1", state: "succeeded", story_points: 2 },
    { id: "s2", state: "succeeded", story_points: 3 },
    { id: "s3", state: "failed", story_points: 5 },
    { id: "s4", state: "not-started", story_points: 3 },
  ]);
  assert.equal(expanded.total_points, 13);
  assert.equal(expanded.weighted_percent, 38.5);

  const removed = computeWeightedStepBoardProgress([
    { id: "s1", state: "succeeded", story_points: 2 },
    { id: "s2", state: "cancelled", story_points: 5, scope_removed: true },
  ]);
  assert.equal(removed.total_points, 2);
  assert.equal(removed.removed_scope_points, 5);
  assert.equal(removed.weighted_percent, 100);

  // CHO-33: empty, all unestimated, and 99% rounding cap while any active leaf is unsucceeded.
  assert.equal(computeWeightedStepBoardProgress([]).weighted_percent, null);
  const unestimated = computeWeightedStepBoardProgress([{ id: "u1", state: "running", story_points: null }]);
  assert.equal(unestimated.weighted_percent, null);
  assert.equal(unestimated.unestimated_leaves, 1);
  const nearDone = computeWeightedStepBoardProgress([
    { id: "a", state: "succeeded", story_points: 55 },
    { id: "b", state: "succeeded", story_points: 55 },
    { id: "c", state: "running", story_points: 1, progress: 0.99 },
  ]);
  assert.equal(nearDone.weighted_percent, 99, "unfinished active leaf never rounds up to 100%");
});

test("CHO-34, CHO-35: Coding plan confirmation, TaskBoard Fibonacci amendments, persistence, and conflict protection", { timeout: 45_000 }, async t => {
  let mode: "plan" | "exec" = "plan";
  const planJson = JSON.stringify({
    title: "导出重构计划",
    steps: [
      { title: "拆解 CSV 解析器", acceptance: "单测通过", story_points: 2, estimate_reason: "单文件纯函数" },
      { title: "接入流式输出", acceptance: "大文件不超内存", after: [1], story_points: 3, estimate_reason: "涉及背压控制" },
      { title: "补齐端到端回归", acceptance: "E2E 全绿", after: [2], story_points: 5, estimate_reason: "跨模块联调" },
    ],
    blockers: "",
    change_reason: "",
  });
  const { host, home, project, workspaceId, call, ended } = await codingProductHost(t, () =>
    mode === "plan" ? cogniaModelResponse(planJson, 30) : cogniaModelResponse("已准备就绪，等待下一步确认。", 12));

  const created = await call<{ session: { session_id: string } }>(project.project_id, `${CODING_PREFIX}/sessions`, {});
  const sid = created.body.session.session_id;
  const planRun = await call<{ run: { ref: AgentRunRef } }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs`, {
    task: "制定导出重构计划", intent: "plan", workspace_id: workspaceId, provider_id: "fixture", model_id: "fixture-model",
  });
  assert.equal((await ended(planRun.body.run.ref)).phase, "completed");

  const savedPlan = await call<{ plan: { revision: number } }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/plan`, {
    expected_revision: 0, run_id: planRun.body.run.ref.run_id,
  });
  assert.equal(savedPlan.status, 200, JSON.stringify(savedPlan.body));
  const confirmed = await call<{ plan: { revision: number } }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/plan/confirm`, {
    expected_revision: savedPlan.body.plan.revision,
  });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));

  mode = "exec";
  const execRun = await call<{ run: { ref: AgentRunRef } }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs`, {
    task: "按计划执行", intent: "execute", plan_revision: confirmed.body.plan.revision,
    workspace_id: workspaceId, provider_id: "fixture", model_id: "fixture-model",
  });
  const execEnded = await ended(execRun.body.run.ref);
  const execView = await ensureSystemAgentService(host, home).agentHost.adapter("prologue").read(execEnded.ref);
  const runId = execEnded.ref.run_id;
  assert.ok(execView.step_board?.progress_summary);
  assert.equal(execView.step_board.progress_summary.total_points, 10);

  const badEst = await call(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs/${runId}/plan-amendments`, {
    expected_version: execView.step_board.version,
    amendment: { kind: "estimate", node: "step-3", story_points: 4, reason: "非法非斐波那契数" },
  });
  assert.equal(badEst.status, 400, "non-Fibonacci story point amendment is rejected");

  const reEst = await call<{ board: AgentStepBoard }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs/${runId}/plan-amendments`, {
    expected_version: execView.step_board.version,
    amendment: { kind: "estimate", node: "step-3", story_points: 8, reason: "需要额外兼容流式编码" },
  });
  assert.equal(reEst.status, 200, JSON.stringify(reEst.body));
  assert.equal(reEst.body.board.progress_summary?.total_points, 13);
  assert.equal(reEst.body.board.nodes.find(n => n.id === "step-3")?.estimate_source, "human");

  const staleConflict = await call(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs/${runId}/plan-amendments`, {
    expected_version: execView.step_board.version,
    amendment: { kind: "estimate", node: "step-1", story_points: 3 },
  });
  assert.ok(staleConflict.status >= 400, "stale expected_version is rejected instead of silently overwriting");

  const prog = await call<{ board: AgentStepBoard }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs/${runId}/plan-amendments`, {
    expected_version: reEst.body.board.version,
    amendment: { kind: "progress", node: "step-1", progress: 0.5, basis: "解析器主函数与 6 个单测已绿" },
  });
  assert.equal(prog.status, 200, JSON.stringify(prog.body));
  assert.equal(prog.body.board.progress_summary?.completed_points, 1);

  const reread = await call<{ taskboard_plans: Array<{ board: AgentStepBoard }> }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/taskboard`);
  assert.equal(reread.status, 200);
  const persisted = reread.body.taskboard_plans[0]?.board;
  assert.equal(persisted?.progress_summary?.total_points, 13);
  assert.equal(persisted?.progress_summary?.completed_points, 1);
  assert.equal(persisted?.progress_summary?.weighted_percent, 7.7);

  // B3: skip stays in denominator (scope_removed undefined), whereas remove-scope drops points from denominator.
  const skipped = await call<{ board: AgentStepBoard }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs/${runId}/plan-amendments`, {
    expected_version: persisted!.version,
    amendment: { kind: "skip", node: "step-2", reason: "暂缓流式背压验证" },
  });
  assert.equal(skipped.status, 200, JSON.stringify(skipped.body));
  assert.equal(skipped.body.board.nodes.find(n => n.id === "step-2")?.scope_removed, undefined, "skip must NOT mark scope_removed");
  assert.equal(skipped.body.board.progress_summary?.total_points, 13, "skipped step stays in denominator");

  const removedScope = await call<{ board: AgentStepBoard }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs/${runId}/plan-amendments`, {
    expected_version: skipped.body.board.version,
    amendment: { kind: "remove-scope", node: "step-3", reason: "拆分到下一批独立交付" },
  });
  assert.equal(removedScope.status, 200, JSON.stringify(removedScope.body));
  assert.equal(removedScope.body.board.nodes.find(n => n.id === "step-3")?.scope_removed, true);
  assert.equal(removedScope.body.board.progress_summary?.total_points, 5);
  assert.equal(removedScope.body.board.progress_summary?.removed_scope_points, 8);

  // B4: unknown command outcome deducts points & blocks terminal until explicit reconcile (confirm-done / rerun).
  const projectedUnknown = applyUnknownCommandOutcomes(
    {
      phase: "completed",
      activity: [{ name: "start-command", state: "started", at: "2099-01-01T00:00:00.000Z" }],
    },
    {
      ...removedScope.body.board,
      terminal: true,
      nodes: removedScope.body.board.nodes.map(n => n.id === "step-1" ? { ...n, state: "succeeded", progress: undefined } : n),
    },
  );
  assert.equal(projectedUnknown.terminal, false, "unknown command outcome reopens terminal board for reconciliation");
  assert.equal(projectedUnknown.nodes.find(n => n.id === "step-1")?.unknown_outcome, true);
  assert.equal(projectedUnknown.progress_summary?.completed_points, 0, "unknown_outcome step is not counted as completed");
});

test("C12, C13, C14: Coding round materials structured failure recovery, mid-round revision pinning, and >30 on-demand overflow", { timeout: 60_000 }, async t => {
  const { host, project, workspaceId, call, ended } = await codingProductHost(t, () => cogniaModelResponse("已按本轮材料处理。", 8));
  const admitMaterial = async (filename: string, body: string): Promise<ArtifactReference> => {
    const admitted = await call<{ item: { item_id: string } }>(project.project_id, "/api/plugins/io.molis.work.shelf/items", {
      filename, bytes_base64: Buffer.from(body).toString("base64"),
    });
    assert.equal(admitted.status, 200);
    const path = `/api/plugins/io.molis.work.shelf/items/${admitted.body.item.item_id}/project-material`;
    const preview = await call<{ fingerprint: string }>(project.project_id, path);
    const pinned = await call<{ reference: ArtifactReference }>(project.project_id, path, { expected_fingerprint: preview.body.fingerprint });
    assert.equal(pinned.status, 200);
    return pinned.body.reference;
  };

  const healthy = await admitMaterial("healthy.md", "# 正常资料\n保留给本轮使用。");
  const forbiddenMat = await admitMaterial("secret-scope.md", "# 限制资料\n对 Agent 关闭。");
  const states = await call<{ states: Array<{ kind: string; id: string }> }>(project.project_id, "/api/knowledge/states");
  assert.ok(states.body.states.some(row => row.kind === "artifact" && row.id === artifactSubjectId(forbiddenMat)));
  const excluded = await call(project.project_id, "/api/knowledge/exclude", { subject: { kind: "artifact", id: artifactSubjectId(forbiddenMat) }, excluded: true });
  assert.equal(excluded.status, 200, JSON.stringify(excluded.body));

  const session = await call<{ session: { session_id: string } }>(project.project_id, `${CODING_PREFIX}/sessions`, {});
  const sid = session.body.session.session_id;
  const missingRef = { artifact_id: "missing-artifact-id-404", version: 1 };

  // C12: unreadable materials return structured failed_materials distinguishing forbidden vs not_found without losing healthy picks.
  const failedStart = await call<{ code?: string; details?: { failed_materials?: Array<{ title: string; failure_kind: string }> } }>(
    project.project_id,
    `${CODING_PREFIX}/sessions/${sid}/runs`,
    {
      task: "核对资料恢复", intent: "discuss", workspace_id: workspaceId, provider_id: "fixture", model_id: "fixture-model",
      materials: [fixedRef(healthy, "healthy.md"), fixedRef(forbiddenMat, "secret-scope.md"), fixedRef(missingRef, "deleted.md")],
    },
  );
  assert.equal(failedStart.status, 400);
  assert.equal(failedStart.body.code, "coding.material_unreadable");
  const failures = failedStart.body.details?.failed_materials ?? [];
  assert.equal(failures.length, 2, JSON.stringify(failedStart.body));
  assert.equal(failures.find(f => f.title === "secret-scope.md")?.failure_kind, "forbidden");
  assert.equal(failures.find(f => f.title === "deleted.md")?.failure_kind, "not_found");

  // C13: knowledge.read enforces expected_revision so mid-round continuation cannot silently read a mutated revision.
  const projectRef = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const knowledgeClient = bindActionClient(host.actionClient(projectRef), () => ({
    actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: ["knowledge:read", "artifacts:read"],
  }));
  const firstRead = await knowledgeClient.invoke(knowledgeActions.read, { subject: { kind: "artifact", id: artifactSubjectId(healthy) } });
  const okPinned = await knowledgeClient.invoke(knowledgeActions.read, {
    subject: { kind: "artifact", id: artifactSubjectId(healthy) }, expected_revision: firstRead.revision,
  });
  assert.equal(okPinned.revision, firstRead.revision);
  await assert.rejects(
    () => knowledgeClient.invoke(knowledgeActions.read, {
      subject: { kind: "artifact", id: artifactSubjectId(healthy) }, expected_revision: `${firstRead.revision}-stale`,
    }),
    (err: { code?: string }) => err.code === "knowledge.revision_changed",
  );

  // C14: >30 materials succeed in a single round; first 30 inline + remaining 5 in an on-demand directory with pinned revisions.
  const extraRefs: ArtifactReference[] = [healthy];
  for (let i = 2; i <= 35; i += 1) {
    extraRefs.push(await admitMaterial(`doc-${i}.md`, `# 文档 ${i}\n用于大材料清单按需读取测试。`));
  }
  const bigRun = await call<{ run: { ref: AgentRunRef } }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs`, {
    task: "综合 35 份资料说明架构", intent: "discuss", workspace_id: workspaceId, provider_id: "fixture", model_id: "fixture-model",
    materials: extraRefs.map((ref, idx) => fixedRef(ref, `doc-${idx + 1}.md`)),
  });
  assert.equal(bigRun.status, 200, JSON.stringify(bigRun.body));
  const bigEnded = await ended(bigRun.body.run.ref);
  assert.equal(bigEnded.phase, "completed");
  const inlineMaterials = bigEnded.frozen.text_materials.filter(item => item.delivery !== "on-demand");
  assert.ok(inlineMaterials.length >= 30 && inlineMaterials.length <= 31, `expected 30 inline user materials (+ optional project guidance), got ${inlineMaterials.length}`);
  const overflow = bigEnded.frozen.text_materials.find(item => item.delivery === "on-demand");
  assert.ok(overflow, "expected on-demand overflow directory material");
  assert.equal(overflow.overflow_materials?.length, 5);
  assert.ok(overflow.overflow_materials?.every(item => Boolean(item.read_revision)));
});

test("BL-051, BL-182: subagent attempt budget tracking, exhaustion guard, +3 budget extension, and retry source provenance", { timeout: 60_000 }, async t => {
  let parentDispatched = false;
  let subagentTurn = 0;
  const { host, home, project, workspaceId, call } = await codingProductHost(t, (req) => {
    const text = JSON.stringify(req.messages);
    const isChild = text.includes("CHILD_CHECK");
    if (!isChild && !parentDispatched) {
      parentDispatched = true;
      const sysText = JSON.stringify((req as { system?: unknown }).system ?? "");
      const character = sysText.match(/molis-child-[a-z0-9-]+@\d+/)?.[0];
      assert.ok(character, `missing child character in coordinator system prompt: ${sysText.slice(0, 300)}`);
      return cogniaScriptedResponse({
        name: "dispatch-subagent",
        input: {
          instruction: "CHILD_CHECK 检查导出模块边界并汇报",
          tools: ["read", "search", "context-remaining"],
          character,
          idempotencyKey: "check-export",
        },
      });
    }
    if (isChild) {
      subagentTurn += 1;
      return cogniaModelResponse(`子任务第 ${subagentTurn} 次执行完成`, 8);
    }
    return cogniaModelResponse("父会话已收到子任务汇报。", 8);
  });

  const created = await call<{ session: { session_id: string } }>(project.project_id, `${CODING_PREFIX}/sessions`, {});
  const sid = created.body.session.session_id;
  const started = await call<{ run: { ref: AgentRunRef } }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs`, {
    task: "派发子任务检查导出模块", intent: "collaborate", workspace_id: workspaceId, provider_id: "fixture", model_id: "fixture-model",
  });
  assert.equal(started.status, 200, JSON.stringify(started.body));

  const service = ensureSystemAgentService(host, home);
  const adapter = service.agentHost.adapter("prologue");
  const decided = new Set<string>();
  const approvePending = async () => {
    for (const review of service.agentHost.reviews.list(project.project_id, "pending")) {
      if (!decided.has(review.review_id)) {
        decided.add(review.review_id);
        await service.agentHost.reviews.respond({ review_id: review.review_id, decision: "approve", actor_id: "web-user" });
      }
    }
  };
  const settleRun = async (ref: AgentRunRef) => {
    for (const deadline = Date.now() + 25_000; ;) {
      await approvePending();
      const view = await adapter.read(ref);
      if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) return view;
      if (Date.now() > deadline) throw new Error(`run did not settle: ${view.phase}`);
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  };
  const settleChild = async (ref: AgentRunRef, childId: string) => {
    for (const deadline = Date.now() + 25_000; ;) {
      await approvePending();
      const row = (await adapter.subagents!.list(ref)).find(item => item.subagent_id === childId);
      if (row && row.state !== "running") return row;
      if (Date.now() > deadline) throw new Error(`child did not settle: ${row?.state}`);
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  };

  const parentEnded = await settleRun(started.body.run.ref);
  assert.equal(parentEnded.phase, "completed", parentEnded.stop_reason ?? "");
  const runId = parentEnded.ref.run_id;

  const initialList = await adapter.subagents!.list(parentEnded.ref);
  assert.equal(initialList.length, 1);
  const childId = initialList[0]!.subagent_id;
  await settleChild(parentEnded.ref, childId);
  assert.equal(initialList[0]!.budget?.attempt, 1);
  assert.equal(initialList[0]!.budget?.max_attempts, SUBAGENT_DEFAULT_MAX_ATTEMPTS);

  // Retry 1 (attempt 2 of 2) with check-failed source via Coding's control-subagent route.
  const retry1 = await call<{ ok: boolean; subagent: { budget: { attempt: number; max_attempts: number; retry_source?: string; prior_attempts?: unknown[] } } }>(
    project.project_id,
    `${CODING_PREFIX}/sessions/${sid}/runs/${runId}/subagents/${childId}`,
    { action: "retry", source: "check-failed", reason: "单测断言未覆盖空输入" },
  );
  assert.equal(retry1.status, 200, JSON.stringify(retry1.body));
  assert.equal(retry1.body.subagent.budget.attempt, 2);
  assert.equal(retry1.body.subagent.budget.max_attempts, 2);
  assert.equal(retry1.body.subagent.budget.retry_source, "check-failed");
  assert.equal(retry1.body.subagent.budget.prior_attempts?.length, 1);
  await settleChild(parentEnded.ref, childId);

  // Attempt 3 without extending budget is refused (budget exhausted at 2/2).
  const overBudget = await call<{ error: string }>(
    project.project_id,
    `${CODING_PREFIX}/sessions/${sid}/runs/${runId}/subagents/${childId}`,
    { action: "retry", source: "user-requested" },
  );
  assert.ok(overBudget.status >= 400, "retrying past max_attempts without extending budget is refused");

  // Extend budget (+3 -> max_attempts = 5) without running yet, then retry once more.
  const extended = await call<{ ok: boolean; subagent: { budget: { attempt: number; max_attempts: number } } }>(
    project.project_id,
    `${CODING_PREFIX}/sessions/${sid}/runs/${runId}/subagents/${childId}`,
    { action: "extend-budget", extend_attempts: 3 },
  );
  assert.equal(extended.status, 200, JSON.stringify(extended.body));
  assert.equal(extended.body.subagent.budget.max_attempts, 5);
  assert.equal(extended.body.subagent.budget.attempt, 2);

  const retry2 = await call<{ ok: boolean; subagent: { budget: { attempt: number; max_attempts: number; retry_source?: string } } }>(
    project.project_id,
    `${CODING_PREFIX}/sessions/${sid}/runs/${runId}/subagents/${childId}`,
    { action: "retry", source: "model-error", reason: "上游模型短暂限流" },
  );
  assert.equal(retry2.status, 200, JSON.stringify(retry2.body));
  assert.equal(retry2.body.subagent.budget.attempt, 3);
  assert.equal(retry2.body.subagent.budget.retry_source, "model-error");
  await settleChild(parentEnded.ref, childId);
});
