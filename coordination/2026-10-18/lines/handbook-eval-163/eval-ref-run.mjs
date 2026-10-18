// AGENT_INPUT_REF_REJECTED count for molis-ai/molis-work#723 (rule: ../ref-rule.md, posted on the PR before the first call).
// One Coding round on the built AgentHost + Prologue adapter of a worktree (WT). The Coding role gets acknowledge-inputs
// added in memory only. A supplement is sent while the first model reply is held. Every acknowledge-inputs call and its
// tool result is read from the model requests.
// The key comes from MINIMAX_API_KEY on the command line and is handed to resolveCredential only: no Home, no store.
// FAKE=1 swaps MiniMax for a scripted reply (offline dry run of the harness itself; never counted).
// Usage: WT=<worktree> SIDE=before|after OUT=<jsonl> MINIMAX_API_KEY=… node run.mjs <reader|builder> <S1|S2|S3> <run-index>
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
const W = process.env.WT, SIDE = process.env.SIDE, OUT = process.env.OUT, FAKE = process.env.FAKE === "1", KEY = FAKE ? "fake" : process.env.MINIMAX_API_KEY?.trim();
const [role, supplement, index] = process.argv.slice(2);
if (!W || !SIDE || !OUT || !KEY || !["reader", "builder"].includes(role) || !["S1", "S2", "S3"].includes(supplement)) throw new Error("WT, SIDE, OUT, MINIMAX_API_KEY, a role and a supplement");
const { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, prologueModelConfiguration } = await import(join(W, "horizontal/agent-host/dist/index.js"));
const { codingAgentManifest, codingPrompts } = await import(join(W, "plugins/native/coding/dist/index.js"));
const sdkPackage = JSON.parse(readFileSync(join(W, "horizontal/agent-host/package.json"), "utf8")).dependencies["@prologue/sdk"];
const wantSdk = SIDE === "before" ? "after-write-check.tgz" : "after-write-check-key.tgz";
if (!sdkPackage.endsWith(wantSdk)) throw new Error(`${W} is not the ${SIDE} side: ${sdkPackage}`);

const EXPECTED = {
  before: { reader: ["input", "app-ref", "board-node", "todo", "pending"], builder: ["input", "app-ref", "board-node", "todo", "pending"] },
  after: { reader: ["input", "todo", "pending"], builder: ["input", "board-node", "todo", "pending"] },
};
const TASKS = { reader: "看一下 src/ 里每个导出函数是做什么的，用几句话告诉我。", builder: "给 src/math.js 里每个导出函数加一行 JSDoc 注释。" };
const SUPPLEMENTS = { S1: "这一步做完以后，再给 README.md 补一段用法说明。", S2: "另外单独记一件事：以后要把日志改成中文，这次先别动。", S3: "不要改任何导出的函数名。" };

const S = new URL(".", import.meta.url).pathname;
mkdirSync(join(S, "tmp"), { recursive: true });
const root = mkdtempSync(join(S, "tmp", `${role}-${supplement}-${SIDE}-`)), project = join(root, "project");
const files = {
  "src/math.js": "export function add(a, b) {\n  return a + b;\n}\n\nexport function sub(a, b) {\n  return a - b;\n}\n",
  "src/log.js": "export function logStart(name) {\n  console.log(`Starting ${name}...`);\n}\n\nexport function logDone(name) {\n  console.log(`Finished ${name}.`);\n}\n",
  "README.md": "# tiny\n\nTwo small helpers.\n",
};
for (const [path, text] of Object.entries(files)) { mkdirSync(join(project, path, ".."), { recursive: true }); writeFileSync(join(project, path), text); }

// The manifest is changed in memory only: the role gets acknowledge-inputs, nothing else differs.
const manifest = structuredClone(codingAgentManifest);
const patched = manifest.roles.find(r => r.role_id === role);
patched.host_tools = [...patched.host_tools, "acknowledge-inputs"];

const requests = [], responses = [], realFetch = globalThis.fetch;
let releaseFirst = () => {}; const firstHeld = new Promise(resolve => { releaseFirst = resolve; });
const readStream = async text => {
  const blocks = {};
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    let event; try { event = JSON.parse(line.slice(5)); } catch { continue; }
    if (event.type === "content_block_start" && event.content_block?.type === "tool_use") blocks[event.index] = { id: event.content_block.id, name: event.content_block.name, json: "" };
    if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta" && blocks[event.index]) blocks[event.index].json += event.delta.partial_json;
  }
  return Object.values(blocks).map(b => { let input = null; try { input = JSON.parse(b.json || "{}"); } catch { input = { unparsed: b.json }; } return { id: b.id, name: b.name, input }; });
};
// Offline dry run: read, then one acknowledge-inputs per offered conditional kind plus a plain one, then finish.
let fakeRound = 0;
const fakeReply = body => {
  fakeRound += 1;
  const ids = [...JSON.stringify(body.messages ?? []).matchAll(/has the id ([A-Za-z0-9._~-]+?)\. Use it/g)].map(m => m[1]);
  const tool = (name, input) => ({ tool: { name, input } });
  const pick = fakeRound === 1 ? tool("read-file", { path: "src/math.js" })
    : fakeRound === 2 && ids[0] ? tool("acknowledge-inputs", { items: [{ input: ids[0], treatment: "later-step", targets: [{ kind: "app-ref", id: "goal:1" }] }] })
    : fakeRound === 3 && ids[0] ? tool("acknowledge-inputs", { items: [{ input: ids[0], treatment: "later-step", targets: [{ kind: "board-node", board: "b", id: "n" }] }] })
    : fakeRound === 4 && ids[0] ? tool("acknowledge-inputs", { items: [{ input: ids[0], treatment: "later-step", note: "做完再补" }] })
    : { text: "完成。" };
  const events = [], emit = (type, value) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: `m-${fakeRound}`, type: "message", role: "assistant", model: "fake", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: pick.tool ? { type: "tool_use", id: `call-${fakeRound}`, name: pick.tool.name, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: pick.tool ? { type: "input_json_delta", partial_json: JSON.stringify(pick.tool.input) } : { type: "text_delta", text: pick.text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: pick.tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
};
globalThis.fetch = async (url, init) => {
  let body = null; try { body = JSON.parse(typeof init?.body === "string" ? init.body : new TextDecoder().decode(init.body)); } catch {}
  const isModel = body && Array.isArray(body.messages);
  if (isModel) requests.push(body);
  const n = requests.length;
  const response = FAKE && isModel ? fakeReply(body) : await realFetch(url, init);
  if (isModel && n === 1) await firstHeld;
  if (isModel) { const text = await response.clone().text(); responses.push({ n, calls: await readStream(text) }); }
  return response;
};
const access = FAKE
  ? { modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fake", credential_ref: "fake" }), resolveCredential: () => "fake" }
  : { modelConfiguration: async () => prologueModelConfiguration({ provider: { api_format: "anthropic-messages", base_url: "https://api.minimax.cn/anthropic", credential_ref: "minimax-eval" }, model: { model_id: "MiniMax-M3" } }),
    resolveCredential: ref => ref === "minimax-eval" ? KEY : null };
const queue = new AgentReviewQueue();
const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.eval-ref", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue, ...access });
const inside = path => { const r = relative(project, path); return !r.startsWith("..") && !isAbsolute(r); };
const decide = review => {
  const d = review.document;
  if (review.kind === "tool-operation") return "approve";
  if (d.kind === "text-edit") return inside(join(d.workspace_path ?? project, d.target_path)) || inside(d.target_path) ? "approve" : "reject";
  if (d.kind === "command") return ["ls", "cat", "pwd"].includes(d.command) && !d.escalate && !(d.grants?.network) && !(d.grants?.paths?.length) ? "approve" : "reject";
  return "reject";
};
const started = Date.now();
let view, error = null, sent = null;
try {
  const host = new AgentHost({ reviews: queue }); host.register(adapter);
  const owner = { project_id: "eval", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: project, realpath_verified: true };
  const session = await adapter.createSession({ ...owner, directory, title: `ref ${role} ${supplement}` });
  const handle = await host.start("prologue", { ...owner, session, directory, role_id: role, task: TASKS[role] }, { manifest, prompts: codingPrompts, authorizedDirectories: [project] });
  for (let i = 0; requests.length < 1; i++) { if (i > 600) throw new Error("no first model request"); await new Promise(resolve => setTimeout(resolve, 50)); }
  sent = await adapter.inputs.send(handle.ref, { text: SUPPLEMENTS[supplement] });
  releaseFirst();
  const decided = new Set(), deadline = Date.now() + 5 * 60_000;
  for (;;) {
    view = await adapter.read(handle.ref);
    if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) break;
    if (view.phase === "awaiting-input" || Date.now() > deadline) { error = view.phase === "awaiting-input" ? "asked the user" : "timed out"; await adapter.cancel?.(handle.ref).catch(() => {}); view = await adapter.read(handle.ref); break; }
    for (const review of queue.list("eval", "pending")) if (!decided.has(review.review_id)) { decided.add(review.review_id); await queue.respond({ review_id: review.review_id, decision: decide(review), actor_id: "user" }); }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
} catch (e) { error = String(e?.stack ?? e).slice(0, 800); releaseFirst(); }
finally { await adapter.close().catch(() => {}); }

// What the model was offered, what it called and what came back.
const textOf = c => typeof c === "string" ? c : Array.isArray(c) ? c.map(x => x.text ?? "").join("") : JSON.stringify(c ?? "");
const ackDefs = requests.map(body => (body.tools ?? []).find(t => t.name === "acknowledge-inputs")).filter(Boolean);
const enumOf = def => def?.input_schema?.properties?.items?.items?.properties?.targets?.items?.properties?.kind?.enum ?? null;
const enums = [...new Set(ackDefs.map(def => JSON.stringify(enumOf(def))))];
const expected = JSON.stringify(EXPECTED[SIDE][role]);
const valid = ackDefs.length > 0 && enums.length === 1 && enums[0] === expected;
const results = new Map(requests.flatMap(body => (body.messages ?? []).flatMap(m => Array.isArray(m.content) ? m.content : [])).filter(c => c.type === "tool_result").map(c => [c.tool_use_id, textOf(c.content)]));
const acks = responses.flatMap(r => r.calls.filter(c => c.name === "acknowledge-inputs").map(c => {
  const out = results.get(c.id) ?? null, code = out === null ? "no-result" : (/^([A-Z][A-Z_]+):/.exec(out)?.[1] ?? "returned");
  const items = Array.isArray(c.input?.items) ? c.input.items : [];
  const kinds = [...new Set(items.flatMap(item => (Array.isArray(item?.targets) ? item.targets : []).map(t => t?.kind)))];
  return { request: r.n, code, kinds, items: c.input?.items ?? null, result: out?.slice(0, 300) ?? null };
}));
const row = { role, supplement, side: SIDE, run: Number(index), fake: FAKE, valid, enums, expected, phase: view?.phase ?? null, stop_reason: view?.stop_reason ?? null, error,
  input_id: sent?.input_id ?? null, ms: Date.now() - started, modelCalls: requests.length, acks, otherCalls: responses.flatMap(r => r.calls.map(c => c.name)).filter(n => n !== "acknowledge-inputs") };
appendFileSync(OUT, JSON.stringify(row) + "\n");
console.log(JSON.stringify({ role, supplement, side: SIDE, run: row.run, valid, phase: row.phase, error: error?.slice(0, 160) ?? null, acks: acks.map(a => `${a.code}[${a.kinds.join(",")}]`), calls: row.modelCalls, s: Math.round(row.ms / 1000) }));
rmSync(root, { recursive: true, force: true });
