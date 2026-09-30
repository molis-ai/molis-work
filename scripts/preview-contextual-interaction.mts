/**
 * High-fidelity slice of context-driven interaction (specs/contextual-interaction §9).
 *
 * Real: the Pages editor bundle and its focus plugin, the workbench stylesheet and bottom bar markup, the Pages
 * fragment-offer declaration, the kernel layout policy and the Host judgment service. Labelled stand-ins: other
 * providers' executions, memory, and — until a key is configured — the judgment (`replay`) and writing results.
 *
 *   pnpm exec tsx scripts/preview-contextual-interaction.mts --port 4290 [--judge rules|replay|jev] [--latency 800]
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import {
  THEME_BOOTSTRAP_SCRIPT, VISUAL_FOUNDATION_CLIENT_SCRIPT, escapeHtml, icon, renderIconSprite, renderProjectMonogram,
} from "@molis-ai/molis-work-design-system";
import type { ContextualJudgeRequest, FrozenFocus } from "@molis-ai/molis-work-contracts/services/contextual";
import { renderMolisWorkWorkbenchStylesheet } from "../apps/workbench/src/page-assets.js";
import { renderAccountGlobalItems, renderPluginRail, renderWorkbenchBar, renderWorkspaceChrome } from "../apps/workbench/src/immersive-shell.js";
import { renderPersonalMenuItems, renderPluginRailAccountFooter } from "../apps/workbench/src/settings-directory.js";
import { PAGES_STYLES } from "../plugins/native/pages/src/styles.js";
import { preparePagesFragmentOffers } from "../plugins/native/pages/src/fragment-offers.js";
import { createContextualJudgmentService, type ContextualEvaluation } from "../apps/local-host/src/contextual/judgment-service.js";
import { fragmentCandidates } from "@molis-ai/molis-work-kernel";
import { DOCUMENTS, GOAL, MEMORY_STANDIN, PROVIDERS, sliceDirectory, type SliceDocument } from "./contextual-slice/fixture.mjs";
import { AUTHORED_REPLAY, findReplay, type ReplayAnswer } from "./contextual-slice/replay.mjs";
import { standinBreakdown, standinDependencies, standinEvidence, standinNext, standinPagesAi } from "./contextual-slice/standins.mjs";
import { SLICE_STYLES } from "./contextual-slice/styles.mjs";
import { createJevEvaluator } from "./contextual-slice/jev.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name: string) => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : undefined; };

// ---- state -------------------------------------------------------------------------------------------------------
const documents = new Map<string, SliceDocument>(DOCUMENTS.map(doc => [doc.id, structuredClone(doc)]));
const dev = {
  judge: (arg("--judge") ?? "replay") as "rules" | "replay" | "jev",
  latency: Number(arg("--latency") ?? 900),
  fail: false,
  disabled: new Set<string>(),
  memory: true,
};
const executed = new Map<string, unknown>();
const signals: { at: string; signal: string; label: string; context_id: string }[] = [];
const receipts: unknown[] = [];

// ---- judgment ----------------------------------------------------------------------------------------------------
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) { reject(signal.reason); return; }
  const timer = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});

const RECORDED = join(root, "scripts/contextual-slice/replay-recorded.json");
const jev = createJevEvaluator({ ...(arg("--home") ? { home: arg("--home") } : {}), ...(process.argv.includes("--record") || dev.judge === "jev" ? { recordTo: RECORDED } : {}) });
const recorded = (): ReplayAnswer[] => existsSync(RECORDED) ? (JSON.parse(readFileSync(RECORDED, "utf8")) as { match: string[]; activity: string; granularity: string; next: Record<string, number>; intent: Record<string, number>; surface: string | null; speak_up: number | null; confidence: number | null }[])
  .map(item => ({ match: item.match, activity: item.granularity === "objects" || item.granularity === "word" ? item.granularity : item.activity, next: item.next, intent: item.intent,
    surface: (item.surface ?? "none") as ReplayAnswer["surface"], speak_up: item.speak_up ?? 0, confidence: item.confidence ?? 0 })) : [];

let service = makeService();
function makeService() {
  let lastFocus: ContextualJudgeRequest["focus"] | null = null;
  const replay = async ({ questions, signal }: { state: string; questions: Record<string, unknown>; signal: AbortSignal }): Promise<ContextualEvaluation> => {
    await sleep(dev.latency, signal);
    if (dev.fail) throw new Error("注入的判断失败");
    const focus = lastFocus!;
    const texts = [focus.object.title ?? "", ...focus.targets.map(target => target.text)];
    // Recorded real Jev answers win over hand-written samples; the label says which one this is.
    const real = findReplay(recorded(), texts, focus.activity, focus.granularity);
    const answer = real ?? findReplay(AUTHORED_REPLAY, texts, focus.activity, focus.granularity);
    if (!answer) throw new Error("没有这个情境的回放样本");
    // Map `provider:offer` to this directory's judgment keys through the criteria text the question carries.
    const criteria = (questions.next as { criteria: Record<string, string> }).criteria;
    const candidates = service.lastCandidates;
    const next: Record<string, number> = {};
    for (const [qualified, value] of Object.entries(answer.next)) {
      const [provider, offer] = qualified.split(":");
      const found = candidates.find(item => item.source.provider_id === provider && item.offer_id === offer && criteria[item.key]);
      if (found) next[found.key] = value;
    }
    const top = Object.entries(next).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { basis: "replay", model: real ? "回放 · 录制的真实 Jev 回答" : "回放 · 人工样本（非真实 Jev）", body: { answers: {
      next: { choice: top, probabilities: next, confidence: answer.confidence },
      intent: { choice: Object.entries(answer.intent).sort((a, b) => b[1] - a[1])[0]?.[0], probabilities: answer.intent },
      surface: { choice: answer.surface }, speak_up: { noul: answer.speak_up },
    } } };
  };
  const inner = createContextualJudgmentService<string>({
    directory: async () => sliceDirectory(dev.disabled),
    ...(dev.judge === "replay" ? { evaluate: replay } : {}),
    ...(dev.judge === "jev" && jev.configured() ? { evaluate: async (input: { state: string; questions: Record<string, unknown>; signal: AbortSignal }) => {
      if (dev.fail) throw new Error("注入的判断失败");
      return jev.evaluate({ ...input, ...(lastFocus ? { focus: lastFocus } : {}), candidates: wrapper.lastCandidates });
    } } : {}),
    recall: async () => dev.memory ? { state: "ok" as const, items: MEMORY_STANDIN } : { state: "off" as const, items: [] },
    screen: text => {
      const notes: string[] = [];
      const redacted = text.replace(/\b(sk|pk|ghp|xox[abp])[-_A-Za-z0-9]{16,}\b/g, () => { notes.push("去掉了形似密钥的内容"); return "[redacted]"; });
      if (/(忽略(前面|之前|以上)的?(所有)?(指令|要求))|ignore (all )?previous instructions/i.test(redacted)) notes.push("有像指令的文字，已作为数据处理");
      return { text: redacted, notes };
    },
    timeoutMs: 30_000,
  });
  const wrapper = {
    lastCandidates: [] as import("@molis-ai/molis-work-contracts/services/contextual").ContextualCandidate[],
    async candidates(request: ContextualJudgeRequest) { const out = await inner.candidates(request, "preview-user"); wrapper.lastCandidates = [...out.plan.candidates]; return out; },
    async judge(request: ContextualJudgeRequest, signal: AbortSignal) {
      lastFocus = request.focus;
      const first = await inner.candidates(request, "preview-user");
      wrapper.lastCandidates = [...first.plan.candidates];
      return inner.judge(request, "preview-user", signal);
    },
    cancel: (pane: string) => inner.cancel(pane),
  };
  return wrapper;
}

// ---- prepare & execute -------------------------------------------------------------------------------------------
/** Candidates are derived again for the frozen context: a click acts on what was in hand then, not on the latest focus. */
function candidateFor(key: string, frozen: FrozenFocus) { return fragmentCandidates(sliceDirectory(dev.disabled), frozen.focus).find(item => item.key === key); }

/** The person's words in the input refine the same card: a style for rewrites, otherwise kept as a note. */
function refine(command: string, style: string | undefined, instruction?: string): { command: string; style?: string; note?: string } {
  if (!instruction) return { command, style };
  const styleOf = /短|简|精炼|压缩/.test(instruction) ? "concise" : /正式|书面/.test(instruction) ? "formal" : /口语|轻松/.test(instruction) ? "casual" : /展开|详细|长一点/.test(instruction) ? "expand" : undefined;
  if (styleOf && ["rewrite", "expand", "bullets", "continue"].includes(command)) return { command: "rewrite", style: styleOf, note: `按你说的「${instruction}」重新准备` };
  return { command, style, note: `已记下你的要求「${instruction}」（切片替身不会据此改写）` };
}

async function prepare(key: string, frozen: FrozenFocus, instruction?: string) {
  const candidate = candidateFor(key, frozen);
  if (!candidate) throw Object.assign(new Error("这个动作已不在当前情境的候选里，请重新选择"), { status: 409 });
  if (!candidate.available) throw Object.assign(new Error(candidate.reason ?? "不可用"), { status: 409 });
  const focus = frozen.focus;
  const texts = focus.targets.map(target => target.text);
  const doc = documents.get(focus.object.id);
  const base = { key, title: candidate.title, apply: candidate.apply, intent: candidate.intent, provider: candidate.provider_title, action: candidate.action };
  if (candidate.source.provider_id === PROVIDERS.pages.provider_id) {
    const fragment = { object: focus.object, granularity: focus.granularity as "range", targets: focus.targets.map(({ kind, role, text, truncated, ref }) => ({ kind, ...(role ? { role } : {}), text, ...(truncated ? { truncated } : {}), ...(ref ? { ref } : {}) })) };
    const offer = preparePagesFragmentOffers({ fragment, request_id: frozen.token }, PROVIDERS.pages.provider_id).find(item => item.offer_id === candidate.offer_id);
    if (!offer) throw Object.assign(new Error("Pages 没有为这个片段准备这个动作"), { status: 409 });
    if (candidate.action.capability_id === "pages.generate") {
      const input = offer.input as { title: string; instructions: string; inputs: { title: string }[] };
      return { ...base, offer, preview: { kind: "record", summary: `用 ${input.inputs.length} 份材料生成一篇新文档`, fields: [{ name: "title", label: "新文档标题", value: input.title }, { name: "instructions", label: "要求", value: input.instructions, multiline: true }], standin: "执行为切片替身：在切片里新建文档，正文为占位" } };
    }
    const input = offer.input as { command: string; style?: string; text: string };
    const refined = refine(input.command, input.style, instruction);
    const result = standinPagesAi(refined.command, refined.style, input.text);
    const kind = candidate.apply === "result" ? (input.command === "compare" ? "compare" : "text") : refined.command === "rewrite" && candidate.apply !== "replace" ? "replace" : candidate.apply;
    return { ...base, offer: { ...offer, input: { ...input, command: refined.command, ...(refined.style ? { style: refined.style } : {}) } },
      preview: { kind, text: result.text, standin: refined.note ? `${refined.note} · ${result.standin}` : result.standin, command: refined.command } };
  }
  const offer = { offer_id: candidate.offer_id, title: candidate.title, action: candidate.action, input: { fragment: { object: focus.object, texts } } };
  switch (`${candidate.source.provider_id}:${candidate.offer_id}`) {
    case "system.search:evidence": return { ...base, offer, preview: { kind: "evidence", ...standinEvidence(texts.join("\n"), doc?.id) } };
    case "io.molis.work.goals:dependencies": return { ...base, offer, preview: { kind: "dependencies", ...standinDependencies(texts) } };
    case "io.molis.work.goals:next": return { ...base, offer, preview: { kind: "list", ...standinNext(texts.join("\n")) } };
    case "io.molis.work.goals:breakdown": {
      const plan = standinBreakdown(texts);
      return { ...base, offer, preview: { kind: "record", summary: `在 Goal「${plan.goal.title}」下新建 ${plan.steps.length} 个步骤`, fields: plan.steps.map((step, index) => ({ name: `step${index}`, label: step.due ? `步骤 ${index + 1} · ${step.due}` : `步骤 ${index + 1}`, value: step.title })), standin: "执行为切片替身：不会写入真实 Goals" } };
    }
    case "io.molis.work.goals:relate":
      return { ...base, offer, preview: { kind: "record", summary: `把选中的内容作为依据关联到 Goal`, fields: [{ name: "goal", label: "Goal", value: (doc?.goal ?? GOAL).title }, { name: "relation", label: "关系", value: "依据" }], standin: "执行为切片替身：不会写入真实 Goals" } };
    case "io.molis.work.goals:progress":
      return { ...base, offer, preview: { kind: "record", summary: `为 Goal「${(doc?.goal ?? GOAL).title}」记录一条进展`, fields: [{ name: "note", label: "进展", value: `已完成：${texts[0] ?? ""}`, multiline: true }], standin: "执行为切片替身：不会写入真实 Goals" } };
    case "io.molis.work.lingguang:capture":
      return { ...base, offer, preview: { kind: "record", summary: "记到灵光", fields: [{ name: "text", label: "内容", value: texts.join("\n").slice(0, 300), multiline: true }], standin: "执行为切片替身：不会写入真实灵光" } };
    case "system.context-ledger:link":
      return { ...base, offer, preview: { kind: "record", summary: `在 ${focus.targets.length} 处内容之间建立引用关系`, fields: focus.targets.map((target, index) => ({ name: `t${index}`, label: `第 ${index + 1} 处`, value: target.ref?.title ?? target.text.slice(0, 60) })), standin: "执行为切片替身：不会写入真实关联服务" } };
    case "system.assistant:discuss":
      return { ...base, offer, preview: { kind: "handoff", text: `带上这${focus.targets.length > 1 ? ` ${focus.targets.length} 处` : "段"}内容开一项助理工作。你可以在下面的输入框里先说想怎么讨论。`, standin: "执行为切片替身：不会真的开助理工作" } };
  }
  throw Object.assign(new Error("切片没有这个动作的替身"), { status: 501 });
}

function execute(requestId: string, key: string, fields: Record<string, string>, frozen: FrozenFocus) {
  if (executed.has(requestId)) return { ...(executed.get(requestId) as object), replayed: true };
  const candidate = candidateFor(key, frozen);
  if (!candidate) throw Object.assign(new Error("这个动作已不在当前情境的候选里"), { status: 409 });
  const doc = documents.get(frozen.focus.object.id);
  if (doc && frozen.focus.object.version !== undefined && Number(frozen.focus.object.version) !== doc.version && frozen.focus.granularity !== "objects") {
    throw Object.assign(new Error("文档在你点下之后又被改过，这个动作是按改之前的内容准备的。请按现在的内容重新准备。"), { status: 409, code: "stale" });
  }
  let result: Record<string, unknown>;
  if (candidate.action.capability_id === "pages.generate") {
    const id = "doc-" + randomUUID().slice(0, 8);
    const title = fields.title || "综合文稿";
    documents.set(id, { id, title, version: 1, body: { type: "doc", content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: title }] },
      { type: "paragraph", content: [{ type: "text", text: "（切片替身）这里是由所选材料生成的正文。接入真实模型后由 pages.generate 生成。" }] },
      ...frozen.focus.targets.map(target => ({ type: "paragraph", content: [{ type: "text", text: `来源：${target.ref?.title ?? ""}` }] })),
    ] } });
    result = { summary: `已新建文档「${title}」`, open: { doc_id: id }, standin: "切片替身" };
  } else {
    const labels: Record<string, string> = { "goals.tree.submit": "已在 Goal 下新建步骤", "goals.relations.add": "已关联到 Goal", "goals.progress.record": "已记录进展", "lingguang.sparks.create": "已记到灵光", "context.relations.add": "已建立引用关系" };
    result = { summary: labels[candidate.action.capability_id] ?? "已完成", detail: Object.values(fields).filter(Boolean).slice(0, 6), standin: "切片替身 · 没有写入真实插件" };
  }
  executed.set(requestId, result);
  return result;
}

// ---- assets ------------------------------------------------------------------------------------------------------
let clientBundle = "";
async function bundleClient() {
  const out = await build({ entryPoints: [join(root, "scripts/contextual-slice/client.ts")], bundle: true, format: "iife", platform: "browser", write: false, target: "es2022",
    logLevel: "silent", sourcemap: "inline" });
  clientBundle = out.outputFiles[0]!.text;
}
const pagesEditorPath = join(root, "plugins/native/pages/dist/pages-editor.js");

function renderPage(): string {
  const primitives = { L: (value: string) => value, escapeHtml, icon, htmlLang: () => "zh-CN" };
  const plugins = ["goals", "inbox", "feed", "pages", "shelf", "lingguang"] as const;
  const project = { project_id: "project-q4", display_name: "Q4 增长" };
  const monogram = renderProjectMonogram(project.display_name, project.project_id, escapeHtml);
  const projectMenu = `<div class="navigator-project-primary"><details class="navigator-project-menu" data-project-menu><summary class="navigator-project-selector" aria-label="切换项目">${monogram}<strong>${project.display_name}</strong>${icon("chevron-down")}</summary><div class="navigator-project-menu-popover"><span>切换项目</span>${renderPersonalMenuItems(primitives)}</div></details></div>`;
  const bar = renderWorkbenchBar(primitives, {
    enabled: plugins, rail: renderPluginRail(primitives, plugins, "pages"),
    accountFooter: renderPluginRailAccountFooter(primitives).replace("<!-- account-global-items -->", renderAccountGlobalItems(primitives, plugins)),
    projectChrome: renderWorkspaceChrome(primitives, projectMenu),
  });
  const pin = (id: string, glyph: Parameters<typeof icon>[0], label: string, extra = "") => `<button type="button" class="dock-pin${id === "home" ? " is-fixed" : ""}" data-dock-pin="${id}" aria-label="${label}" title="${label}"${extra}>${icon(glyph)}</button>`;
  const pins = pin("home", "home", "项目首页") + pin("goals", "target", "Goals") + pin("pages", "note", "Pages", ' aria-current="page"') + pin("feed", "rss", "Feed");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>情境动态交互 · 切片</title>
  <script>${THEME_BOOTSTRAP_SCRIPT}</script>
  <link rel="stylesheet" href="/assets/workbench.css">
  <style>${PAGES_STYLES}${SLICE_STYLES}</style>
</head>
<body class="immersive-workbench cx-slice">
  ${renderIconSprite()}
  <div class="cx-banner" role="note"><strong>高保真切片</strong><span>编辑器、底栏、陈列策略与判断服务为真实代码；标“替身”的执行、记忆与回放判断为模拟。</span><button type="button" class="mw-btn mw-btn--ghost cx-dev-toggle" data-cx-dev-toggle aria-expanded="false">切片调试</button></div>
  <main class="cx-main" data-cx-main>
    <aside class="cx-docs" aria-label="文档">
      <header><strong>Pages</strong><span class="cx-hint">⌘/Ctrl 点击可多选</span></header>
      <nav data-cx-doc-list></nav>
    </aside>
    <section class="cx-stage" aria-label="文档正文">
      <div class="cx-doc-head"><h1 data-cx-doc-title></h1><span class="cx-doc-meta" data-cx-doc-meta></span></div>
      <div class="pages-workspace cx-editor-wrap"><div class="pages-editor-host" data-cx-editor></div></div>
    </section>
  </main>
  <section class="cx-panel" data-cx-panel hidden aria-label="助理">
    <header class="cx-panel-head"><strong>助理</strong><span data-cx-panel-sub>跟着你正在处理的内容</span><button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only" data-cx-panel-close aria-label="收起">${icon("chevron-down")}</button></header>
    <div class="cx-panel-body" data-cx-cards></div>
  </section>
  <aside class="cx-dev" data-cx-dev hidden aria-label="切片调试"></aside>
  <div class="cx-bar-wrap" data-catalog-bar>${bar.replace('<div class="dock-pins" data-dock-pins role="toolbar" aria-label="常驻插件"></div>', `<div class="dock-pins" data-dock-pins role="toolbar" aria-label="常驻插件">${pins}</div>`)}</div>
  <script>${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>
  <script src="/assets/pages-editor.js"></script>
  <script src="/assets/slice.js"></script>
</body>
</html>`;
}

// ---- http --------------------------------------------------------------------------------------------------------
async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
function send(response: ServerResponse, status: number, value: unknown, type = "application/json; charset=utf-8") {
  response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  response.end(typeof value === "string" ? value : JSON.stringify(value));
}
const inflight = new Map<string, AbortController>();

const server = createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const path = url.pathname;
    if (request.method === "GET" && path === "/") return send(response, 200, renderPage(), "text/html; charset=utf-8");
    if (request.method === "GET" && path === "/assets/workbench.css") return send(response, 200, renderMolisWorkWorkbenchStylesheet(), "text/css; charset=utf-8");
    if (request.method === "GET" && path === "/assets/pages-editor.js") return send(response, 200, existsSync(pagesEditorPath) ? readFileSync(pagesEditorPath, "utf8") : "", "text/javascript; charset=utf-8");
    if (request.method === "GET" && path === "/assets/slice.js") { if (!clientBundle || url.searchParams.has("rebuild")) await bundleClient(); return send(response, 200, clientBundle, "text/javascript; charset=utf-8"); }
    if (request.method === "GET" && path === "/api/docs") return send(response, 200, { documents: [...documents.values()].map(({ id, title, version, goal }) => ({ id, title, version, goal })) });
    const docMatch = /^\/api\/docs\/([^/]+)$/.exec(path);
    if (docMatch && request.method === "GET") { const doc = documents.get(docMatch[1]!); return doc ? send(response, 200, doc) : send(response, 404, { error: "文档不存在" }); }
    if (docMatch && request.method === "PUT") {
      const doc = documents.get(docMatch[1]!); const input = await body(request);
      if (!doc) return send(response, 404, { error: "文档不存在" });
      if (input.expected_version !== doc.version) return send(response, 409, { error: "文档已被其他地方修改", version: doc.version });
      doc.body = input.body as SliceDocument["body"]; doc.version += 1;
      return send(response, 200, { version: doc.version });
    }
    if (request.method === "POST" && (path === "/api/contextual/candidates" || path === "/api/contextual/judge")) {
      const input = await body(request) as unknown as ContextualJudgeRequest;
      if (path.endsWith("candidates")) return send(response, 200, await service.candidates(input));
      inflight.get(input.pane_id)?.abort();
      const controller = new AbortController(); inflight.set(input.pane_id, controller);
      response.on("close", () => { if (!response.writableEnded) controller.abort(); });
      const out = await service.judge(input, controller.signal);
      receipts.unshift({ at: new Date().toISOString(), ...out.receipt, basis: out.judgment?.basis ?? "rules", model: out.judgment?.model, latency_ms: out.judgment?.latency_ms });
      receipts.length = Math.min(receipts.length, 30);
      return send(response, 200, out);
    }
    if (request.method === "POST" && path === "/api/contextual/cancel") { const input = await body(request); service.cancel(String(input.pane_id)); inflight.get(String(input.pane_id))?.abort(); return send(response, 200, { ok: true }); }
    if (request.method === "POST" && path === "/api/contextual/prepare") { const input = await body(request); return send(response, 200, await prepare(String(input.key), input.frozen as FrozenFocus, typeof input.instruction === "string" ? input.instruction : undefined)); }
    if (request.method === "POST" && path === "/api/pages-ai") {
      const input = await body(request);
      const out = standinPagesAi(String(input.command), typeof input.style === "string" ? input.style : undefined, String(input.text ?? ""));
      return send(response, 200, { text: out.text, stub: true, command: input.command });
    }
    if (request.method === "POST" && path === "/api/contextual/execute") { const input = await body(request); return send(response, 200, execute(String(input.request_id), String(input.key), (input.fields ?? {}) as Record<string, string>, input.frozen as FrozenFocus)); }
    if (request.method === "POST" && path === "/api/contextual/signal") {
      const input = await body(request);
      signals.unshift({ at: new Date().toISOString(), signal: String(input.signal), label: String(input.label), context_id: String(input.context_id) });
      signals.length = Math.min(signals.length, 30);
      return send(response, 200, { state: dev.memory ? "counted" : "off", candidate_id: null });
    }
    if (request.method === "GET" && path === "/api/dev") return send(response, 200, { judge: dev.judge, latency: dev.latency, fail: dev.fail, memory: dev.memory, disabled: [...dev.disabled], receipts, signals, providers: Object.values(PROVIDERS) });
    if (request.method === "POST" && path === "/api/dev") {
      const input = await body(request);
      if (typeof input.judge === "string" && ["rules", "replay", "jev"].includes(input.judge)) dev.judge = input.judge as typeof dev.judge;
      if (typeof input.latency === "number") dev.latency = Math.max(0, Math.min(10_000, input.latency));
      if (typeof input.fail === "boolean") dev.fail = input.fail;
      if (typeof input.memory === "boolean") dev.memory = input.memory;
      if (Array.isArray(input.disabled)) dev.disabled = new Set(input.disabled.map(String));
      service = makeService();
      return send(response, 200, { ok: true });
    }
    send(response, 404, { error: "not found" });
  })().catch(error => send(response, (error as { status?: number }).status ?? 500, { error: error instanceof Error ? error.message : String(error), code: (error as { code?: string }).code }));
});

await bundleClient();
const port = Number(arg("--port") ?? 4290);
server.listen(port, "127.0.0.1", () => console.log(`Contextual interaction slice: http://127.0.0.1:${port}/  (judge=${dev.judge})`));
const stop = () => server.close(() => process.exit(0));
process.on("SIGTERM", stop); process.on("SIGINT", stop);
