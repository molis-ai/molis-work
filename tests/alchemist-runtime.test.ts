import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalRuntime, type LocalRuntime } from "../plugins/native/alchemist/src/studio/server/bootstrap/local-runtime.js";
import type { AlchemistAiPort } from "../plugins/native/alchemist/src/studio/server/runtime/host-port.js";

const model = { id: "test-provider/test-model", label: "显式测试模型", runtimeLabel: "Prologue · 显式测试", costVisibility: "unobservable" as const };
const generation = {
  understanding: { summary: "帮助创始人保留证据与假设。", assumptions: ["用户需要追溯"], unknowns: ["使用频率"], concreteness: "direction" },
  cards: [{ title: "证据卡", highlight: "保留可查的假设", targetUser: "独立创始人", scenario: "每次访谈结束", problem: "证据散落", mechanism: "记录原文与判断", valueProposition: "少重复调研", whyItMayWork: "已有手工记录行为", assumptions: ["愿意记录"], unknowns: ["付费意愿"], mvp: { inScope: ["证据收集"], outOfScope: ["团队协作"] } }],
  noCardsReason: null,
};
const labels = ["需求强度", "付出意愿", "竞争压力", "切入缝隙", "触达与时机"];

function fakeHost() {
  const generated: Parameters<AlchemistAiPort["generate"]>[0][] = [];
  const searched: string[] = [];
  const ai: AlchemistAiPort = {
    listModels: async () => [model],
    async generate(input) {
      generated.push(input);
      const properties = input.jsonSchema.properties as Record<string, unknown>;
      const value = properties.reply ? { reply: "这条假设需要下次访谈验证。" }
        : properties.judgments ? { judgments: labels.map(label => ({ label, status: "tentative", conclusion: "只有有限支持", rationale: "根据给定来源，仍需访谈", supportingEvidenceIndexes: [0], counterEvidenceIndexes: [], unknowns: ["持续使用"], changeConditions: ["新增独立访谈"] })) }
        : properties.summary ? { summary: "已有有限支持，仍需验证持续使用。" } : generation;
      return { text: JSON.stringify(value), runtimeLabel: model.runtimeLabel, usage: { inputTokens: 12, outputTokens: 7 } };
    },
    async search(input) {
      searched.push(input.query);
      return [{ url: "https://docs.example.org/product", title: "原始产品说明", excerpt: "用户可以记录访谈证据，尚无付费数据。" }];
    },
  };
  return { ai, generated, searched };
}

async function api(runtime: LocalRuntime, pathname: string, method = "GET", body?: unknown) {
  const response = await runtime.app.request(`http://localhost/api/v1${pathname}`, { method,
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
  const value = await response.json();
  assert.ok(response.ok, `${method} ${pathname}: ${response.status} ${JSON.stringify(value)}`);
  return value as any;
}

async function withRuntime(run: (runtime: LocalRuntime, host: ReturnType<typeof fakeHost>, databasePath: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "alchemist-runtime-"));
  const host = fakeHost();
  const databasePath = join(directory, "studio.sqlite");
  const runtime = createLocalRuntime({ databasePath, ai: host.ai, pulseSourceMode: "fixture" });
  try { await run(runtime, host, databasePath); }
  finally { await runtime.close(); await rm(directory, { recursive: true, force: true }); }
}

async function createIdea(runtime: LocalRuntime) {
  const { direction } = await api(runtime, "/directions", "POST", { title: "证据产品", description: "让独立创始人保留真实访谈的证据与判断" });
  const receipt = await api(runtime, `/directions/${direction.id}/explorations`, "POST");
  await runtime.runPending();
  const { exploration } = await api(runtime, `/explorations/${receipt.runId}`);
  assert.equal(exploration.status, "completed");
  const kept = await api(runtime, `/idea-cards/${exploration.cards[0].id}/keep`, "POST");
  return { direction, receipt, exploration, ideaId: kept.idea.id };
}

test("Alchemist: host settings contain no secret surface; generation uses selected opaque model and active Taste", async () => {
  await withRuntime(async (runtime, host) => {
    const settings = await api(runtime, "/settings/runtime");
    assert.equal(settings.provider, "prologue");
    assert.equal(settings.configured, true);
    assert.equal(settings.secretConfigured, undefined);
    assert.equal(settings.baseUrl, undefined);
    const secret = await runtime.app.request("http://localhost/api/v1/settings/runtime/secret", { method: "POST", body: JSON.stringify({ apiKey: "not-a-real-key" }) });
    assert.equal(secret.status, 404);
    await api(runtime, "/settings/runtime", "PUT", { modelId: model.id, modelPolicy: "fixed", defaultBudgets: { marketSpace: { kind: "calls", limit: 3 }, buildCost: { kind: "calls", limit: 2 } } });
    const { rule } = await api(runtime, "/memory/taste", "POST", { title: "小产品", statement: "先做单人可用的工具", appliesTo: "产品构思", exceptions: ["强网络效应"] });
    const { direction, ideaId } = await createIdea(runtime);
    assert.equal(host.generated[0]?.modelId, model.id);
    assert.equal(JSON.parse(host.generated[0]!.userPrompt).founderTaste[0].statement, "先做单人可用的工具");
    const persisted = await api(runtime, `/ideas/${ideaId}/versions/1`);
    assert.equal(persisted.version.content.title, "证据卡");
    await api(runtime, `/memory/taste/${rule.id}/disable`, "POST");
    await api(runtime, `/directions/${direction.id}/explorations`, "POST");
    await runtime.runPending();
    assert.deepEqual(JSON.parse(host.generated[1]!.userPrompt).founderTaste, []);
    host.ai.listModels = async () => [];
    const unavailable = await api(runtime, "/settings/runtime");
    assert.equal(unavailable.configured, false);
    const again = await api(runtime, `/directions/${direction.id}/explorations`, "POST");
    await runtime.runPending();
    assert.equal((await api(runtime, `/explorations/${again.runId}`)).exploration.errorCode, "RUNTIME_MODEL_UNAVAILABLE");
    assert.equal(host.generated.length, 2, "a missing fixed model must never fall back");
  });
});

test("Alchemist: invalid generated JSON fails without persisting cards and a new exploration can retry", async () => {
  await withRuntime(async (runtime, host) => {
    const original = host.ai.generate;
    host.ai.generate = async () => ({ text: '{"cards":[]}', runtimeLabel: model.runtimeLabel });
    const { direction } = await api(runtime, "/directions", "POST", { description: "让独立创始人保留真实访谈证据" });
    const first = await api(runtime, `/directions/${direction.id}/explorations`, "POST");
    await runtime.runPending();
    const failed = (await api(runtime, `/explorations/${first.runId}`)).exploration;
    assert.equal(failed.status, "failed");
    assert.equal(failed.errorCode, "AI_OUTPUT_INVALID");
    assert.deepEqual(failed.cards, []);
    host.ai.generate = original;
    const second = await api(runtime, `/directions/${direction.id}/explorations?reuse=existing`, "POST");
    assert.notEqual(second.runId, first.runId);
    await runtime.runPending();
    assert.equal((await api(runtime, `/explorations/${second.runId}`)).exploration.status, "completed");
  });
});

for (const limit of [1, 2, 3]) test(`Alchemist: research call limit ${limit} preserves actual sources and the frozen model`, async () => {
  await withRuntime(async (runtime, host) => {
    const { ideaId } = await createIdea(runtime);
    const before = host.generated.length;
    const { plan } = await api(runtime, `/ideas/${ideaId}/lenses/market_space/plans`, "POST", { ideaVersion: 1, modelPolicy: "fixed", modelId: model.id, budget: { kind: "calls", limit } });
    assert.equal(host.generated.length, before, "planning is local and does not spend an AI call");
    await api(runtime, `/ideas/${ideaId}/lenses/market_space/runs`, "POST", { planId: plan.id });
    await runtime.runPending();
    const workspace = await api(runtime, `/ideas/${ideaId}/versions/1/research`);
    const lens = workspace.lenses.market_space;
    assert.equal(lens.report.status, limit < 3 ? "partial" : "completed");
    assert.equal(host.searched.length + host.generated.length - before, limit);
    assert.ok(host.generated.slice(before).every(input => input.modelId === plan.modelId));
    assert.equal(lens.evidence[0].url, "https://docs.example.org/product");
    assert.equal(lens.evidence[0].excerpt, "用户可以记录访谈证据，尚无付费数据。");
    if (limit > 1) assert.equal(lens.report.judgments[0].supportingEvidenceIds[0], lens.evidence[0].id);
  });
});

test("Alchemist: each Lens searches one concise problem or MVP capability, without invented names or another model call", async () => {
  for (const example of [
    { title: "果园星云 Nebula", targetUser: "每周拍摄两百张照片的果农；这段描述不应进入检索",
      problem: "果园病虫害照片难以分类，长期记录混在聊天软件里。", capability: "离线图片分类与标注",
      market: "果园病虫害照片难以分类 工具 软件 用户评价", cost: "离线图片分类与标注 官方文档 实现" },
    { title: "Polar Orchid", targetUser: "Warehouse managers who check six dashboards every morning",
      problem: "Temperature alerts disappear across vendor dashboards. Managers miss incidents.", capability: "MQTT temperature sensor ingestion",
      market: "Temperature alerts disappear across vendor dashboards software tools user reviews", cost: "MQTT temperature sensor ingestion implementation official documentation" },
  ]) await withRuntime(async (runtime, host) => {
    const generate = host.ai.generate;
    host.ai.generate = async input => ({ ...await generate(input), text: JSON.stringify({ ...generation, cards: [{ ...generation.cards[0],
      title: example.title, targetUser: example.targetUser, problem: example.problem,
      mvp: { inScope: [example.capability, "另一个不应塞入同次检索的功能"], outOfScope: ["全球扩展"] } }] }) });
    const requests: Parameters<AlchemistAiPort["search"]>[0][] = [];
    host.ai.search = async input => {
      requests.push(input);
      return [
        { url: "https://example.org/unreadable", title: "无可用正文", excerpt: "extract_failed\nUnable to extract content from the URL." },
        { url: "https://example.org/reference", title: "相关能力说明", excerpt: "相关产品或技术的实际页面正文，仍不代表用户需求已经得到验证。" },
      ];
    };
    const { ideaId } = await createIdea(runtime);
    const generatedBefore = host.generated.length;
    for (const lens of ["market_space", "build_cost"] as const) {
      const { plan } = await api(runtime, `/ideas/${ideaId}/lenses/${lens}/plans`, "POST", { ideaVersion: 1, modelPolicy: "fixed", modelId: model.id, budget: { kind: "calls", limit: 1 } });
      await api(runtime, `/ideas/${ideaId}/lenses/${lens}/runs`, "POST", { planId: plan.id });
      await runtime.runPending();
      const result = (await api(runtime, `/ideas/${ideaId}/versions/1/research`)).lenses[lens];
      assert.equal(result.report.status, "partial");
      assert.equal(result.evidence.length, 1); assert.equal(result.evidence[0].url, "https://example.org/reference");
      assert.ok(result.report.judgments.every((item: { status: string }) => item.status === "unknown"));
    }
    assert.deepEqual(requests.map(input => ({ query: input.query, lens: input.lens })), [
      { query: example.market, lens: "market_space" }, { query: example.cost, lens: "build_cost" },
    ]);
    assert.equal(host.generated.length, generatedBefore, "query construction must not add a model call");
  });
});

test("Alchemist: safe search failure codes survive the job boundary and unusable pages never become a report", async () => {
  await withRuntime(async (runtime, host) => {
    const { ideaId } = await createIdea(runtime);
    host.ai.search = async () => { throw Object.assign(new Error("公开搜索暂时不可用"), { code: "RESEARCH_SEARCH_DEADLINE_EXCEEDED" }); };
    const run = async () => {
      const { plan } = await api(runtime, `/ideas/${ideaId}/lenses/market_space/plans`, "POST", { ideaVersion: 1, modelPolicy: "fixed", modelId: model.id, budget: { kind: "calls", limit: 3 } });
      await api(runtime, `/ideas/${ideaId}/lenses/market_space/runs`, "POST", { planId: plan.id });
      await runtime.runPending();
      return (await api(runtime, `/ideas/${ideaId}/versions/1/research`)).lenses.market_space;
    };
    const failed = await run();
    assert.equal(failed.run.errorCode, "RESEARCH_SEARCH_DEADLINE_EXCEEDED"); assert.equal(failed.report, undefined);
    host.ai.search = async () => [{ url: "https://example.org/failed", title: "无法提取", excerpt: "extract_failed\nUnable to extract content from the URL." }];
    const empty = await run();
    assert.equal(empty.run.errorCode, "RESEARCH_NO_SOURCES"); assert.equal(empty.report, undefined); assert.equal(empty.evidence, undefined);
    assert.equal(host.generated.length, 1, "neither failed search may spend a cross-check or synthesis call");
  });
});

test("Alchemist: cancelling an in-flight search aborts it and prevents following model calls", async () => {
  await withRuntime(async (runtime, host) => {
    const { ideaId } = await createIdea(runtime);
    const entered = Promise.withResolvers<void>();
    let aborted = false;
    host.ai.search = async ({ signal }) => {
      entered.resolve();
      return new Promise((_resolve, reject) => signal!.addEventListener("abort", () => { aborted = true; reject(signal!.reason); }, { once: true }));
    };
    const { plan } = await api(runtime, `/ideas/${ideaId}/lenses/market_space/plans`, "POST", { ideaVersion: 1, modelPolicy: "fixed", modelId: model.id, budget: { kind: "calls", limit: 3 } });
    const { run } = await api(runtime, `/ideas/${ideaId}/lenses/market_space/runs`, "POST", { planId: plan.id });
    const draining = runtime.runPending();
    await entered.promise;
    await api(runtime, `/runs/${run.jobId}/cancel`, "POST");
    await draining;
    assert.equal(aborted, true);
    assert.equal(host.generated.length, 1);
    const lens = (await api(runtime, `/ideas/${ideaId}/versions/1/research`)).lenses.market_space;
    assert.equal(lens.run.status, "cancelled");
    assert.equal(lens.report, undefined);
  });
});

test("Alchemist: restart before lease expiry recovers on a later drain and never replays ambiguous dispatch", async () => {
  await withRuntime(async (runtime, host, databasePath) => {
    const { ideaId } = await createIdea(runtime);
    const { plan } = await api(runtime, `/ideas/${ideaId}/lenses/market_space/plans`, "POST", { ideaVersion: 1, modelPolicy: "fixed", modelId: model.id, budget: { kind: "calls", limit: 1 } });
    const { run } = await api(runtime, `/ideas/${ideaId}/lenses/market_space/runs`, "POST", { planId: plan.id });
    runtime.database.prepare("UPDATE jobs SET status = 'running', lease_owner = 'old-worker', lease_expires_at = ?, checkpoint_json = ? WHERE id = ?")
      .run("2999-01-01T00:00:00.000Z", JSON.stringify({ stage: "call_dispatched", operation: "collecting", callsUsed: 1, previous: { stage: "planning_complete" } }), run.jobId);
    await runtime.close();
    const restarted = createLocalRuntime({ databasePath, ai: host.ai, pulseSourceMode: "fixture" });
    try {
      await restarted.runPending();
      assert.equal((restarted.database.prepare("SELECT status FROM jobs WHERE id = ?").get(run.jobId) as { status: string }).status, "running");
      restarted.database.prepare("UPDATE jobs SET lease_expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(run.jobId);
      await restarted.runPending();
      const lens = (await api(restarted, `/ideas/${ideaId}/versions/1/research`)).lenses.market_space;
      assert.equal(lens.run.status, "failed");
      assert.equal(lens.run.errorCode, "RESEARCH_CALL_INTERRUPTED");
      assert.equal(host.searched.length, 0);
      assert.equal(host.generated.length, 1);
    } finally { await restarted.close(); }
  });
});

test("Alchemist: Copilot consumes object content, prior discussion, and enabled Taste", async () => {
  await withRuntime(async (runtime, host) => {
    const { direction } = await createIdea(runtime);
    await api(runtime, "/memory/taste", "POST", { title: "约束", statement: "保留失败证据", appliesTo: "研究", exceptions: [] });
    const context = { kind: "direction", directionId: direction.id, label: direction.title };
    await api(runtime, "/conversation/messages", "POST", { body: "先讨论用户付出的时间", context });
    await api(runtime, "/conversation/messages", "POST", { body: "继续上一点", context });
    const prompt = JSON.parse(host.generated.at(-1)!.userPrompt);
    assert.equal(prompt.object.direction.description, direction.description);
    assert.ok(prompt.history.some((item: { text: string }) => item.text === "先讨论用户付出的时间"));
    assert.ok(prompt.history.some((item: { role: string }) => item.role === "assistant"));
    assert.equal(prompt.founderTaste[0].statement, "保留失败证据");
    const messages = await api(runtime, "/conversation/messages");
    assert.equal(messages.messages.at(-1).body, "这条假设需要下次访谈验证。");
  });
});

test("Alchemist: close waits for cancelled in-flight work before closing SQLite", async () => {
  await withRuntime(async (runtime, host) => {
    const entered = Promise.withResolvers<void>();
    const released = Promise.withResolvers<void>();
    let signal: AbortSignal | undefined;
    host.ai.generate = async input => { signal = input.signal; entered.resolve(); await released.promise; input.signal!.throwIfAborted(); throw new Error("expected cancellation"); };
    const { direction } = await api(runtime, "/directions", "POST", { description: "让独立创始人保留真实访谈证据" });
    const { runId } = await api(runtime, `/directions/${direction.id}/explorations`, "POST");
    const work = runtime.runPending();
    await entered.promise;
    const closing = runtime.close();
    assert.equal(signal?.aborted, true);
    assert.equal((runtime.database.prepare("SELECT status FROM exploration_runs WHERE id = ?").get(runId) as { status: string }).status, "running");
    released.resolve();
    await Promise.all([work, closing]);
    assert.throws(() => runtime.database.prepare("SELECT status FROM exploration_runs"), /not open|closed/);
  });
});

test("Alchemist: refreshed rerun stays stoppable while keeping the earlier partial report visible", async () => {
  await withRuntime(async (runtime, host) => {
    const { ideaId } = await createIdea(runtime);
    const plan = async (limit: number) => (await api(runtime, `/ideas/${ideaId}/lenses/market_space/plans`, "POST", {
      ideaVersion: 1, modelPolicy: "fixed", modelId: model.id, budget: { kind: "calls", limit },
    })).plan;
    const first = await plan(1);
    await api(runtime, `/ideas/${ideaId}/lenses/market_space/runs`, "POST", { planId: first.id });
    await runtime.runPending();
    const previous = (await api(runtime, `/ideas/${ideaId}/versions/1/research`)).lenses.market_space;
    assert.equal(previous.status, "partial");
    const entered = Promise.withResolvers<void>();
    host.ai.search = async ({ signal }) => { entered.resolve(); return new Promise((_resolve, reject) => signal!.addEventListener("abort", () => reject(signal!.reason), { once: true })); };
    const second = await plan(3);
    const { run } = await api(runtime, `/ideas/${ideaId}/lenses/market_space/runs`, "POST", { planId: second.id });
    const queued = (await api(runtime, `/ideas/${ideaId}/versions/1/research`)).lenses.market_space;
    assert.equal(queued.status, "queued");
    assert.equal(queued.run.jobId, run.jobId);
    assert.equal(queued.report.id, previous.report.id);
    const work = runtime.runPending(); await entered.promise;
    const refreshed = (await api(runtime, `/ideas/${ideaId}/versions/1/research`)).lenses.market_space;
    assert.equal(refreshed.status, "running");
    assert.equal(refreshed.run.jobId, run.jobId);
    assert.equal(refreshed.report.id, previous.report.id);
    assert.equal(refreshed.evidence[0].url, previous.evidence[0].url);
    await api(runtime, `/runs/${refreshed.run.jobId}/cancel`, "POST");
    await work;
    const cancelled = (await api(runtime, `/ideas/${ideaId}/versions/1/research`)).lenses.market_space;
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.report.id, previous.report.id);
    assert.equal(host.generated.length, 1, "stopping a rerun must not proceed into cross-checking");
  });
});
