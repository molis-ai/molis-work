import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { contextFileSkip } from "@molis-ai/molis-work-contracts/services/materials";
import {
  classifyContextModelFailure,
  MolisWorkLocalHost,
  waitContextJourney,
  withConnectorConnections,
} from "@molis-ai/molis-work-app-local-host";
import { runWithMolisWorkHome, resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { recordingTextModel } from "./fixtures/recording-text-model.js";
import { serveTestHost } from "./fixtures/test-home.js";

interface JourneyRefView {
  label: string;
  path: string;
  recognized_by_content?: boolean;
  used_in_summary?: boolean;
  adopted?: boolean;
  duplicate_of?: string;
}

interface JourneySourceView {
  kind: string;
  selected: boolean;
  path?: string;
  staged_digests?: Record<string, string>;
  references?: JourneyRefView[];
  reused_references?: JourneyRefView[];
  metadata?: {
    files: Array<{ path: string }>;
    skipped: number;
    skipped_reasons?: { ignored: number; secret: number; unreadable: number };
    ignored_rules?: string[];
  };
}

interface JourneyStateView {
  id: string;
  phase: string;
  error: string | null;
  failure_kind?: string | null;
  epoch?: number;
  project_id: string;
  /** Where the summary document opens, in the plugin that keeps documents (contract-design §2.5); before batch 44 a Pages document id. */
  summary_open: { surface: string; id: string } | null;
  sources: JourneySourceView[];
  summary: { title: string; body: string; references: JourneyRefView[] } | null;
  stale_summary?: { title: string; body: string } | null;
  scope_delta?: {
    added: string[];
    added_count: number;
    removed: string[];
    removed_count: number;
    reused: number;
    } | null;
  takers?: Array<{ plugin_id: string; name: string }>;
}

async function setupOnboardingHttp(
  t: TestContext,
  answer: (bodyText: string) => string | Promise<string> = () => "# 项目概览\n核心结论引用 [S1]。",
) {
  const dir = await mkdtemp(join(tmpdir(), "molis-onb-b33-"));
  const model = await recordingTextModel(t, dir, (wire) => answer(JSON.stringify(wire.messages)));
  const host = new MolisWorkLocalHost({ homeDirectory: dir });
  const served = await serveTestHost(null, { home: dir, host });
  t.after(async () => {
    await served.close();
    await host.close();
    await rm(dir, { recursive: true, force: true });
  });

  async function stageUpload(journeyId: string, relPath: string, content: string | Buffer): Promise<{ path: string; staged: string }> {
    const res = await fetch(`${served.origin}/api/onboarding/context/${encodeURIComponent(journeyId)}/files?path=${encodeURIComponent(relPath)}`, {
      method: "POST",
      headers: {
        origin: served.origin,
        "content-type": "application/octet-stream",
        "x-molis-work-control-token": served.controlToken,
        "x-molis-work-idempotency-key": randomUUID(),
      },
      body: Buffer.from(content),
    });
    assert.equal(res.status, 201);
    return await res.json() as { path: string; staged: string };
  }

  return { dir, host, model, served, stageUpload };
}

test("ONB-35, ONB-36, ONB-37, ONB-38, C1, C3, C5, C6: mixed code/extensionless materials, duplicate content dedup, 5-stage tracking, and upload digest retention", { timeout: 45_000 }, async t => {
  const { dir, served, stageUpload } = await setupOnboardingHttp(t, () => "# 仓库整理\n基于主脚本 [S1] 与配置构建，其余文件仅存档备查。");
  const codeDir = join(dir, "sample-repo");
  await mkdir(join(codeDir, "src"), { recursive: true });
  await mkdir(join(codeDir, "node_modules", "pkg"), { recursive: true });
  await writeFile(join(codeDir, "src", "index.ts"), "export const runApp = () => 'ready';\n", "utf8");
  await writeFile(join(codeDir, "Dockerfile"), "FROM node:24-alpine\nCMD [\"node\", \"dist/index.js\"]\n", "utf8");
  await writeFile(join(codeDir, "Jenkinsfile.customext"), "pipeline { agent any }\n", "utf8");
  await writeFile(join(codeDir, "node_modules", "pkg", "index.js"), "module.exports = 1;\n", "utf8");

  const id = randomUUID();
  await served.web.post("/api/onboarding/context", { id });

  assert.equal(contextFileSkip("node_modules/pkg/index.js"), "ignored");
  assert.equal(contextFileSkip("Dockerfile"), null);
  assert.equal(contextFileSkip("Jenkinsfile.customext"), null);

  const stagedIndex = await stageUpload(id, "src/index.ts", "export const runApp = () => 'ready';\n");
  const stagedDocker = await stageUpload(id, "Dockerfile", "FROM node:24-alpine\nCMD [\"node\", \"dist/index.js\"]\n");
  const stagedJenkins = await stageUpload(id, "Jenkinsfile.customext", "pipeline { agent any }\n");

  // C6: staged browser upload retains digest across selection refreshes; ONB-35: identical content under a different filename marks duplicate_of.
  const dupCopy = await stageUpload(id, "copy-of-dockerfile.txt", "FROM node:24-alpine\nCMD [\"node\", \"dist/index.js\"]\n");
  const dirMeta = {
    files: ["src/index.ts", "Dockerfile", "Jenkinsfile.customext"].map(path => ({ path, size: 32, modified_ms: 1, identity: "local" })),
    skipped: 1,
    skipped_reasons: { ignored: 1, secret: 0, unreadable: 0 },
    ignored_rules: ["node_modules"],
    truncated: false,
  };
  await served.web.post(`/api/onboarding/context/${id}/selection`, {
    sources: [
      { kind: "custom", selected: true, path: codeDir, metadata: dirMeta, files: [stagedIndex, stagedDocker, stagedJenkins] },
      { kind: "files", selected: true, files: [dupCopy] },
    ],
  });

  const beforeStart = await served.web.get<JourneyStateView>(`/api/onboarding/context/${id}`);
  const uploadSrc = beforeStart.sources.find(s => s.kind === "files")!;
  assert.equal(uploadSrc.staged_digests?.["copy-of-dockerfile.txt"], dupCopy.staged, "staged digest is persisted before start (C6)");

  await served.web.post(`/api/onboarding/context/${id}/start`, {});
  await waitContextJourney(dir, id);
  const ready = await served.web.get<JourneyStateView>(`/api/onboarding/context/${id}`);
  assert.equal(ready.phase, "review", ready.error ?? "");

  const dirSrc = ready.sources.find(s => s.kind === "custom")!;
  const paths = (dirSrc.references ?? []).map(r => r.path).sort();
  // C1 & ONB-37: .ts source, extensionless Dockerfile, and unfamiliar text suffix are all recognized and read; node_modules is skipped by rule.
  assert.deepEqual(paths, ["Dockerfile", "Jenkinsfile.customext", "src/index.ts"]);
  assert.equal(dirSrc.references?.find(r => r.path === "Dockerfile")?.recognized_by_content, true);
  assert.equal(dirSrc.references?.find(r => r.path === "Jenkinsfile.customext")?.recognized_by_content, true);
  assert.equal(paths.some(p => p.includes("node_modules")), false);

  // C3 & ONB-38: S1 is marked used_in_summary=true while uncited read materials are marked used_in_summary=false.
  const allRefs = ready.sources.flatMap(s => s.references ?? []);
  assert.equal(allRefs.some(r => r.used_in_summary === true), true);
  assert.equal(allRefs.some(r => r.used_in_summary === false), true);

  // ONB-35: identical content across overlapping sources under a different filename is detected via duplicate_of and not double-counted in summary.references.
  const dupRef = ready.sources.find(s => s.kind === "files")?.references?.[0];
  assert.equal(dupRef?.duplicate_of, "Dockerfile");
  assert.equal(ready.summary?.references.length, 3, "duplicate content across overlapping sources is not double-counted");
});

test("ONB-40, ONB-42, C7, C8, C11: incremental scope delta reuses unchanged files, allows mid-run reopen, and drops late superseded responses", { timeout: 45_000 }, async t => {
  let slowFirstPass = false;
  let releaseSlowPass: () => void = () => {};
  let firstPassStarted: () => void = () => {};
  const started = new Promise<void>(resolve => { firstPassStarted = resolve; });
  const held = new Promise<void>(resolve => { releaseSlowPass = resolve; });
  const { dir, model, served, stageUpload } = await setupOnboardingHttp(t, async (bodyText) => {
    if (bodyText.includes("新增补充材料")) return "# 扩充后概览\n包含新增材料 [S1] [S2]。";
    if (slowFirstPass) { firstPassStarted(); await held; }
    return "# 初次概览\n初次整理结果 [S1]。";
  });

  const id = randomUUID();
  await served.web.post("/api/onboarding/context", { id });
  const alpha = await stageUpload(id, "alpha.md", "# Alpha\n第一份核心材料。");
  const beta = await stageUpload(id, "beta.md", "# Beta\n待移除材料。");
  await served.web.post(`/api/onboarding/context/${id}/selection`, {
    sources: [{ kind: "files", selected: true, files: [alpha, beta] }],
  });
  await served.web.post(`/api/onboarding/context/${id}/start`, {});
  await waitContextJourney(dir, id);
  const pass1 = await served.web.get<JourneyStateView>(`/api/onboarding/context/${id}`);
  assert.equal(pass1.phase, "review");

  // C7, ONB-40, ONB-42: reopen, remove beta.md, add gamma.md -> alpha.md stays reused, scope_delta & stale_summary are populated, beta.md disappears!
  await served.web.post(`/api/onboarding/context/${id}/reopen`, {});
  const gamma = await stageUpload(id, "gamma.md", "# Gamma\n新增补充材料。");
  await served.web.post(`/api/onboarding/context/${id}/selection`, {
    sources: [{ kind: "files", selected: true, files: [alpha, gamma] }],
  });
  const afterDelta = await served.web.get<JourneyStateView>(`/api/onboarding/context/${id}`);
  assert.ok(afterDelta.scope_delta, "scope_delta is computed on incremental scope edit");
  assert.equal(afterDelta.scope_delta.added_count, 1);
  assert.equal(afterDelta.scope_delta.removed_count, 1);
  assert.equal(afterDelta.scope_delta.reused, 1);
  assert.equal(afterDelta.stale_summary?.title, "初次概览");

  await served.web.post(`/api/onboarding/context/${id}/start`, {});
  await waitContextJourney(dir, id);
  const pass2 = await served.web.get<JourneyStateView>(`/api/onboarding/context/${id}`);
  assert.equal(pass2.phase, "review");
  assert.equal(pass2.summary?.title, "扩充后概览");
  const pass2Paths = pass2.summary?.references.map(r => r.path).sort();
  assert.deepEqual(pass2Paths, ["alpha.md", "gamma.md"], "removed material beta.md is excluded from new summary");

  // C8 & C11: reopen while reading/generating is allowed (cancels active epoch) and a late older response cannot overwrite it.
  assert.equal(slowFirstPass, false);
  slowFirstPass = true;
  const origRequests = model.requests.length;
  await served.web.post(`/api/onboarding/context/${id}/reopen`, {});
  const deltaFile = await stageUpload(id, "delta.md", "# Delta\n触发重新整理。");
  await served.web.post(`/api/onboarding/context/${id}/selection`, {
    sources: [{ kind: "files", selected: true, files: [alpha, deltaFile] }],
  });

  // Start pass 3 and wait until its model call is actually held, then reopen mid-flight (C8): the old epoch returns late.
  await served.web.post(`/api/onboarding/context/${id}/start`, {});
  await started;
  const reopenedMidRun = await served.web.post<JourneyStateView>(`/api/onboarding/context/${id}/reopen`, {});
  releaseSlowPass();
  assert.equal(reopenedMidRun.phase, "selecting", "reopen during active reading/synthesis transitions cleanly back to selecting (C8)");
  await waitContextJourney(dir, id);
  const settled = await served.web.get<JourneyStateView>(`/api/onboarding/context/${id}`);
  assert.equal(settled.phase, "selecting", "superseded pass never overwrites reopened selecting state (C11)");
  assert.ok(settled.late_ignored, "C11: the late response of the superseded epoch is recorded as ignored");
  assert.equal(settled.summary, null, "C11: the late old summary is not written back");
  assert.ok(model.requests.length >= origRequests);
});

test("ONB-41, C9: model failure classification distinguishes auth, rate_limit, and invalid_output while preserving read materials", { timeout: 45_000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), "molis-onb-failkind-"));
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  let statusMode: 401 | 429 | 200 = 401;

  const provider = createServer(async (req, res) => {
    for await (const _chunk of req) { /* drain */ }
    if (statusMode === 401) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Invalid API key provided" } }));
      return;
    }
    if (statusMode === 429) {
      res.writeHead(429, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Rate limit exceeded (429)" } }));
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "m1", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`);
    res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`);
    res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "   " } })}\n\n`);
    res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`);
    res.write(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } })}\n\n`);
    res.end(`event: message_stop\ndata: {"type":"message_stop"}\n\n`);
  });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
  const addr = provider.address();
  assert.ok(addr && typeof addr === "object");
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  await runWithMolisWorkHome(dir, () => openMolisWorkProjectCatalog({ homeDirectory: dir }).then(catalog => {
    try {
      const conn = withConnectorConnections(dir, store => {
        const c = store.createToken({ serviceId: "model-api", displayName: "fail-fixture", token: "fixture-token" });
        store.assertTarget(c.connection_id, "model-api", baseUrl);
        return c;
      });
      catalog.models.upsert({
        credential_ref: conn.credential_ref!, provider_id: "fail-fixture", display_name: "故障替身", base_url: baseUrl,
        api_format: "anthropic-messages", models: [{ model_id: "fixture-model", enabled: true }],
      });
    } finally { catalog.close(); }
  }));

  const host = new MolisWorkLocalHost({ homeDirectory: dir });
  const served = await serveTestHost(null, { home: dir, host });
  t.after(async () => {
    await served.close();
    await host.close();
    provider.closeAllConnections();
    await new Promise<void>(resolve => provider.close(() => resolve()));
    if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior;
    resetSecretStoreCache();
    await rm(dir, { recursive: true, force: true });
  });

  const id = randomUUID();
  await served.web.post("/api/onboarding/context", { id });
  await served.web.post(`/api/onboarding/context/${id}/selection`, {
    sources: [{ kind: "browser", selected: true, text: "# 保留的已读正文\n模型失败不丢材料。" }],
  });

  for (const [mode, expectedKind] of [[401, "auth"], [429, "rate_limit"], [200, "invalid_output"]] as const) {
    statusMode = mode;
    await served.web.post(`/api/onboarding/context/${id}/start`, {});
    await waitContextJourney(dir, id);
    const failed = await served.web.get<JourneyStateView>(`/api/onboarding/context/${id}`);
    assert.equal(failed.phase, "failed");
    assert.equal(failed.failure_kind, expectedKind, `mode=${mode} classified as ${expectedKind}`);
    assert.equal(failed.sources[0]?.references?.length, 1, "already-read material stays preserved across model failures");
  }
});

test("ONB-43, ONB-44, ONB-45, ONB-46, C10: end-to-end code folder adoption, Coding taker handoff, and idempotent replay without duplicates", { timeout: 60_000 }, async t => {
  const { dir, served, stageUpload } = await setupOnboardingHttp(t, () => "# 代码项目上手\n已识别核心入口 [S1]。");
  const codeRootDir = join(dir, "my-product-repo");
  await mkdir(join(codeRootDir, "src"), { recursive: true });
  await writeFile(join(codeRootDir, "package.json"), "{\"name\":\"my-product-repo\",\"version\":\"1.0.0\"}\n", "utf8");
  await writeFile(join(codeRootDir, "src", "main.ts"), "export function main() { return 42; }\n", "utf8");

  const id = randomUUID();
  await served.web.post("/api/onboarding/context", { id });
  const stagedPkg = await stageUpload(id, "package.json", "{\"name\":\"my-product-repo\",\"version\":\"1.0.0\"}\n");
  const stagedMain = await stageUpload(id, "src/main.ts", "export function main() { return 42; }\n");
  await served.web.post(`/api/onboarding/context/${id}/selection`, {
    sources: [{
      kind: "custom",
      selected: true,
      path: codeRootDir,
      metadata: {
        files: [
          { path: "package.json", size: 44, modified_ms: 1, identity: "local" },
          { path: "src/main.ts", size: 39, modified_ms: 1, identity: "local" },
        ],
        skipped: 0,
        truncated: false,
      },
      files: [stagedPkg, stagedMain],
    }],
  });
  await served.web.post(`/api/onboarding/context/${id}/start`, {});
  await waitContextJourney(dir, id);

  const review = await served.web.get<JourneyStateView>(`/api/onboarding/context/${id}`);
  assert.equal(review.phase, "review", review.error ?? "");
  assert.ok(review.takers?.some(taker => taker.plugin_id === "io.molis.work.coding"), "code folder offers Coding taker (ONB-44)");

  // ONB-43, ONB-44, ONB-46: adopt with Coding taker -> creates project, imports Pages materials + summary, and hands code root to Coding!
  const adopted = await served.web.post<JourneyStateView & { next_href?: string }>(`/api/onboarding/context/${id}/adopt`, {
    title: "产品仓库项目",
    body: review.summary!.body,
    take: "io.molis.work.coding",
  });
  assert.equal(adopted.phase, "complete");
  assert.ok(adopted.project_id);
  assert.ok(adopted.summary_open?.id);

  // ONB-45, C10: repeating adopt (lost receipt / duplicate submit) reconciles existing project & documents without creating duplicates!
  const replayed = await served.web.post<JourneyStateView>(`/api/onboarding/context/${id}/adopt`, {
    title: "产品仓库项目",
    body: review.summary!.body,
    take: "io.molis.work.coding",
  });
  assert.equal(replayed.project_id, adopted.project_id);
  assert.deepEqual(replayed.summary_open, adopted.summary_open);

  const store = openPagesStore(dir);
  try {
    const pages = store.list(adopted.project_id);
    // 2 source files (package.json + src/main.ts) + 1 summary = 3 Pages documents (never duplicated on replay!)
    assert.equal(pages.length, 3);
  } finally {
    store.close();
  }
});

test("ONB-41, C9: the model-failure classifier covers all six recoverable classes and unknown", () => {
  assert.equal(classifyContextModelFailure({ status: 401 }), "auth");
  assert.equal(classifyContextModelFailure({ status: 429 }), "rate_limit");
  assert.equal(classifyContextModelFailure(Object.assign(new Error("empty"), { code: "agent.inference.empty" })), "invalid_output");
  assert.equal(classifyContextModelFailure({ name: "TimeoutError" }), "timeout");
  assert.equal(classifyContextModelFailure(new Error("fetch failed")), "connection");
  assert.equal(classifyContextModelFailure(new Error("maximum context length exceeded")), "context_limit");
  assert.equal(classifyContextModelFailure(new Error("something else")), "unknown");
});
