/** W0 interactive prototype. Rules only; no Home, credentials, model or production writes.
 * After a build/browser slot is assigned:
 * pnpm exec tsx scripts/preview-contextual-interaction.mts --judge rules --port 4290
 * --home may name an isolated directory for operator clarity; the preview never reads or writes it.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Fragment, Slice, type Node as ProseNode } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import type { ContextualJudgeRequest, FrozenFocus } from "@molis-ai/molis-work-contracts/services/contextual";
import { fragmentCandidates } from "@molis-ai/molis-work-kernel/contextual";
import { renderMolisWorkWorkbenchStylesheet } from "../apps/workbench/src/page-assets.js";
import { createContextualJudgmentService } from "../apps/local-host/src/contextual/judgment-service.js";
import { preparePagesFragmentOffers } from "../plugins/native/pages/src/fragment-offers.js";
import { nodeFromUnknown, pagesSchema } from "../plugins/native/pages/src/schema.js";
import { DOCUMENTS, PROVIDERS, sliceDirectory } from "./contextual-slice/fixture.mjs";
import { standinPagesAi } from "./contextual-slice/standins.mjs";
import { PreviewStore } from "./contextual-slice/w0-store.js";
import { readCreate, readPlacement, requestId } from "./contextual-slice/w0-request.js";
import { renderW0Page } from "./contextual-slice/w0-page.mjs";

const arg = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
if (arg("--judge") && arg("--judge") !== "rules") throw new Error("W0 只开放 --judge rules；真实模型与凭据读取未启用。");
if (process.argv.includes("--record")) throw new Error("W0 不录制模型回答。");
const port = Number(arg("--port") ?? 4290);
if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error("端口无效");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pagesEditorPath = join(root, "plugins/native/pages/dist/pages-editor.js");
if (!existsSync(pagesEditorPath)) throw new Error("缺少 Pages 编辑器构建产物。请先取得构建时段，再运行 pnpm build。");
/** The preview's ItemAttach stand-in: plain text at the cursor or over the selection, paragraphs at the end, or a quote block
 * after the landing's top-level block. The real Pages command will own this; here it only edits the in-memory copy. */
const store = new PreviewStore(DOCUMENTS, (body, from, to, text, format) => {
  const state = EditorState.create({ doc: nodeFromUnknown(body) }), size = state.doc.content.size;
  if (to > size) throw Object.assign(new Error("落点超出文档范围"), { status: 409 });
  const lines = text.split(/\n+/u).map(line => line.trim()).filter(Boolean);
  const paragraphs: ProseNode[] = lines.map(line => pagesSchema.nodes.paragraph.create(null, pagesSchema.text(line)));
  if (!paragraphs.length) throw Object.assign(new Error("内容为空"), { status: 400 });
  const $from = state.doc.resolve(from), between = from >= size || !$from.parent.isTextblock;
  if (format === "quote") {
    const at = between ? from : $from.after(1);
    return state.tr.insert(at, pagesSchema.nodes.blockquote.create(null, paragraphs)).doc.toJSON();
  }
  if (between) return state.tr.insert(from, paragraphs).doc.toJSON();
  if (paragraphs.length === 1) return state.tr.insertText(lines[0]!, from, to).doc.toJSON();
  return state.tr.replace(from, to, new Slice(Fragment.from(paragraphs), 1, 1)).doc.toJSON();
});
const directory = () => sliceDirectory(new Set(Object.values(PROVIDERS).filter(provider => provider !== PROVIDERS.pages).map(provider => provider.provider_id)));
const rules = createContextualJudgmentService<string>({ directory: async () => directory(), configured: () => false });
const bundled = await build({ entryPoints: [join(root, "scripts/contextual-slice/w0-client.ts")], bundle: true,
  format: "iife", platform: "browser", write: false, target: "es2022", logLevel: "silent", sourcemap: "inline" });
const client = bundled.outputFiles[0]!.text;
const css = renderMolisWorkWorkbenchStylesheet();

function send(response: ServerResponse, status: number, value: unknown, type = "application/json; charset=utf-8") {
  response.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(typeof value === "string" ? value : JSON.stringify(value));
}
async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  let value = "";
  for await (const chunk of request) {
    value += String(chunk);
    if (value.length > 1_000_000) throw Object.assign(new Error("预览输入过大"), { status: 413 });
  }
  const parsed: unknown = JSON.parse(value || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Object.assign(new Error("请求格式无效"), { status: 400 });
  return parsed as Record<string, unknown>;
}
function state() {
  return { documents: [...store.documents.values()].map(({ id, title, version }) => ({ id, title, version })),
    materials: [...store.materials.values()], created: [...store.created.values()], mode: "rules" };
}
function prepare(input: Record<string, unknown>) {
  const frozen = input.frozen as FrozenFocus;
  if (!frozen?.focus?.object || !Array.isArray(frozen.focus.targets)) throw Object.assign(new Error("选区无效"), { status: 400 });
  const candidate = fragmentCandidates(directory(), frozen.focus).find(item => item.key === input.key && item.available);
  if (!candidate) throw Object.assign(new Error("动作不在当前选区中"), { status: 409 });
  const offer = preparePagesFragmentOffers({ fragment: { object: frozen.focus.object, granularity: frozen.focus.granularity as "range",
    targets: frozen.focus.targets }, request_id: frozen.token }, "pages_document", PROVIDERS.pages.provider_id).find(item => item.offer_id === candidate.offer_id);
  if (!offer) throw Object.assign(new Error("这个动作没有可用的预览"), { status: 409 });
  const prepared = offer.input as { command?: string; style?: string; text?: string };
  const result = standinPagesAi(prepared.command ?? "rewrite", prepared.style, prepared.text ?? frozen.focus.targets.map(item => item.text).join("\n"));
  return { text: result.text, apply: candidate.apply, title: candidate.title, simulated: true };
}
async function route(request: IncomingMessage, response: ServerResponse) {
  const host = request.headers.host ?? "";
  if (!/^(127\.0\.0\.1|localhost):\d+$/u.test(host) || request.headers.origin && request.headers.origin !== `http://${host}`) {
    return send(response, 403, { error: "只允许从本预览页面访问" });
  }
  const path = new URL(request.url ?? "/", `http://${host}`).pathname;
  if (request.method === "GET") {
    if (path === "/") return send(response, 200, renderW0Page(), "text/html; charset=utf-8");
    if (path === "/assets/workbench.css") return send(response, 200, css, "text/css; charset=utf-8");
    if (path === "/assets/pages-editor.js") return send(response, 200, readFileSync(pagesEditorPath, "utf8"), "text/javascript; charset=utf-8");
    if (path === "/assets/slice.js") return send(response, 200, client, "text/javascript; charset=utf-8");
    if (path === "/api/w0/state") return send(response, 200, state());
    const match = /^\/api\/docs\/([^/]+)$/u.exec(path);
    if (match) return send(response, 200, store.document(match[1]!));
  }
  if (request.method === "POST" || request.method === "PUT") {
    const input = await body(request);
    const match = /^\/api\/docs\/([^/]+)$/u.exec(path);
    if (match && request.method === "PUT") {
      if (!input.body || typeof input.body !== "object") throw Object.assign(new Error("文档内容无效"), { status: 400 });
      return send(response, 200, store.save(match[1]!, Number(input.expected_version), nodeFromUnknown(input.body).toJSON()));
    }
    if (path === "/api/contextual/candidates") {
      const query = input as Partial<ContextualJudgeRequest>;
      if (!query.focus?.object || !Array.isArray(query.focus.targets) || typeof query.pane_id !== "string") throw Object.assign(new Error("选区无效"), { status: 400 });
      return send(response, 200, await rules.candidates(query as ContextualJudgeRequest, "preview-person"));
    }
    if (path === "/api/contextual/prepare") return send(response, 200, prepare(input));
    if (path === "/api/w0/place") { const value = readPlacement(input); return send(response, 200, store.place(value.requestId, value.placement)); }
    if (path === "/api/w0/unplace") return send(response, 200, store.unplace(requestId(input.requestId)));
    if (path === "/api/w0/create") { const value = readCreate(input); return send(response, 200, store.create(value.requestId, value.target, value.draft, value.replaceId)); }
    if (path === "/api/w0/undo") { store.undo(String(input.id)); return send(response, 200, state()); }
  }
  return send(response, 404, { error: "W0 没有这个入口；真实模型和生产动作未接入" });
}
const server = createServer((request, response) => {
  void route(request, response).catch((error: unknown) => send(response,
    error instanceof SyntaxError ? 400 : error && typeof error === "object" && "status" in error ? Number(error.status) : 500,
    { error: error instanceof Error ? error.message : String(error) }));
});
server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  console.log(`Contextual W0: http://127.0.0.1:${typeof address === "object" && address ? address.port : port}/ (rules only; in-memory preview)`);
});
const stop = () => { server.close(); server.closeAllConnections(); };
process.once("SIGTERM", stop); process.once("SIGINT", stop);
