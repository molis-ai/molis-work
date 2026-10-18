// C4 probe: one Coding task on the built AgentHost + Prologue adapter, with MiniMax as the model, following yielded rounds.
// "before" is main's build (WT_BEFORE), "after" the branch's (WT_AFTER): the same vendored SDK, three sentences apart.
// The key comes from MINIMAX_API_KEY on the command line and is handed to resolveCredential only: no Home, no store.
// Usage: WT_BEFORE=<worktree> WT_AFTER=<worktree> VERSION=before|after OUT=<jsonl> MINIMAX_API_KEY=… node run.mjs <T1|T2|T3> <run-index>
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
const VERSION = process.env.VERSION, OUT = process.env.OUT, KEY = process.env.MINIMAX_API_KEY?.trim();
const W = VERSION === "before" ? process.env.WT_BEFORE : VERSION === "after" ? process.env.WT_AFTER : undefined;
const [task, index] = process.argv.slice(2);
if (!W || !OUT || !KEY || !["T1", "T2", "T3"].includes(task)) throw new Error("WT_BEFORE, WT_AFTER, VERSION, OUT, MINIMAX_API_KEY and a task id");
const out = pkg => join(W, pkg, "dist");
const { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, prologueModelConfiguration } = await import(join(out("horizontal/agent-host"), "index.js"));
const { codingAgentManifest, codingPrompts } = await import(join(out("plugins/native/coding"), "index.js"));
const { openWait, wakeBodyOf } = await import(join(out("plugins/native/coding"), "waits.js"));

// The two builds must differ in exactly the three sentences under test.
const base = codingPrompts.find(p => p.prompt_id === "coding-base"), host = readFileSync(join(out("horizontal/agent-host"), "adapters/prologue-run.js"), "utf8");
const has = { search: base.body.includes("search 只在文件内容里找文字"), offset: base.body.includes("大文件用 offset、limit 读一段行"), tools: host.includes("可以写 []") };
const expected = VERSION === "before" ? { version: 11, present: true } : { version: 12, present: false };
if (base.version !== expected.version || Object.values(has).some(v => v !== expected.present)) throw new Error(`${VERSION} build in ${W}: coding-base v${base.version}, ${JSON.stringify(has)}`);

const S = new URL(".", import.meta.url).pathname, root = mkdtempSync(join(S, "tmp", `${task}-${VERSION}-`)), project = join(root, "project");
const write = (dir, files) => { for (const [path, text] of Object.entries(files)) { mkdirSync(join(dir, path, ".."), { recursive: true }); writeFileSync(join(dir, path), text); } };
const plain = text => text.replace(/[*_`]/g, "");

// T1: the file is found only by its name; no file's contents say "retry".
const T1_FILES = {
  "README.md": "# Fetcher\n\nA small HTTP fetcher with policies for timeouts and limits.\n",
  "package.json": "{ \"name\": \"fetcher\", \"type\": \"module\", \"version\": \"0.1.0\" }\n",
  "src/index.js": "export { get } from \"./net/client.js\";\n",
  "src/net/client.js": "import { TIMEOUT_MS } from \"./policies/timeout-policy.js\";\nexport async function get(url) { return fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) }); }\n",
  "src/net/policies/timeout-policy.js": "export const TIMEOUT_MS = 3000;\n",
  "src/net/policies/rate-limit-policy.js": "export const MAX_PER_MINUTE = 60;\n",
  "src/net/policies/retry-policy.js": "export const MAX_ATTEMPTS = 7;\nexport const BACKOFF_MS = 250;\n",
  "src/util/log.js": "export const log = (...args) => console.error(\"[fetcher]\", ...args);\n",
  "src/util/env.js": "export const debug = process.env.FETCHER_DEBUG === \"1\";\n",
  "test/client.test.js": "import test from \"node:test\";\nimport { get } from \"../src/index.js\";\ntest(\"get is a function\", () => { if (typeof get !== \"function\") throw new Error(\"no get\"); });\n",
  "docs/policies.md": "# Policies\n\nTimeouts and rate limits are set in src/net/policies.\n",
};
if (Object.values(T1_FILES).some(text => /retry/i.test(text))) throw new Error("a T1 file's contents say retry");

// T2: 3000 lines from a fixed seed, no line numbers in them, about 150 KB.
const random = (seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(20261018);
const ids = [], seen = new Set(), lines = [];
const pad = n => String(n).padStart(2, "0");
while (ids.length < 3000) {
  const id = "ORD-" + Math.floor(random() * 0xfffff).toString(16).toUpperCase().padStart(5, "0");
  if (seen.has(id)) continue;
  seen.add(id); ids.push(id);
  const status = ["shipped", "packed", "paid", "returned"][Math.floor(random() * 4)];
  lines.push(`2026-10-${pad(1 + Math.floor(random() * 17))} ${pad(Math.floor(random() * 24))}:${pad(Math.floor(random() * 60))}:${pad(Math.floor(random() * 60))} ${id} status=${status} qty=${1 + Math.floor(random() * 9)}`);
}
const LOG = lines.join("\n") + "\n";
if (Buffer.byteLength(LOG) <= 64 * 1024) throw new Error("the T2 log is not over 64 KB");
const line2400 = ids[2399];

const TASKS = {
  T1: { role: "reader", text: "项目里有一个文件名带 retry 的文件，它规定最多试几次？告诉我文件路径和那个次数。", files: T1_FILES, want: [],
    done: text => /retry-policy\.js/.test(plain(text)) && /(?<![0-9])7(?![0-9])/.test(plain(text)) },
  T2: { role: "reader", text: "logs/orders.log 第 2400 行记的是哪个订单号？", files: { "README.md": "Order logs.\n", "logs/orders.log": LOG }, want: [],
    done: text => text.includes(line2400) },
  // BL-151's T3, word for word.
  T3: { role: "coordinator", text: "请派一个代码调查子任务看看 src/parse.js 导出了哪些函数，告诉我函数名。",
    files: { "src/parse.js": "const trim = value => String(value).trim();\nexport function parseDate(text) { return new Date(trim(text)); }\nexport function parseAmount(text) { return Number(trim(text).replace(/,/g, \"\")); }\n", "README.md": "Parsing helpers.\n" },
    want: ["coding-reader"], done: text => text.includes("parseDate") && text.includes("parseAmount") },
};
const spec = TASKS[task];
write(project, spec.files);

// Every model request, to read back each tool call and what came back for it.
const requests = [], calls = [], reading = [], http = [], realFetch = globalThis.fetch;
const toolNames = body => (body.tools ?? []).map(t => t.name);
const isTop = body => task === "T3" ? toolNames(body).includes("dispatch-subagent") : true;
const readStream = async (response, top) => {
  const blocks = {};
  for (const line of (await response.text()).split("\n")) {
    if (!line.startsWith("data:")) continue;
    let event; try { event = JSON.parse(line.slice(5)); } catch { continue; }
    if (event.type === "content_block_start" && event.content_block?.type === "tool_use") blocks[event.index] = { id: event.content_block.id, name: event.content_block.name, json: "", input: event.content_block.input };
    if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta" && blocks[event.index]) blocks[event.index].json += event.delta.partial_json;
  }
  for (const b of Object.values(blocks)) { let input = b.input; try { if (b.json) input = JSON.parse(b.json); } catch {} calls.push({ id: b.id, name: b.name, input, top }); }
};
globalThis.fetch = async (url, init) => {
  let body = null; try { body = JSON.parse(typeof init?.body === "string" ? init.body : new TextDecoder().decode(init.body)); requests.push(body); } catch {}
  let response;
  try { response = await realFetch(url, init); } catch (e) { http.push({ error: String(e?.cause?.code ?? e?.code ?? e?.message ?? e).slice(0, 120) }); throw e; }
  if (response.status !== 200) http.push({ status: response.status });
  if (body) reading.push(readStream(response.clone(), isTop(body)).catch(() => {}));
  return response;
};
const access = { modelConfiguration: async () => prologueModelConfiguration({ provider: { api_format: "anthropic-messages", base_url: "https://api.minimax.cn/anthropic", credential_ref: "minimax-eval" }, model: { model_id: "MiniMax-M3" } }),
  resolveCredential: ref => ref === "minimax-eval" ? KEY : null };
const queue = new AgentReviewQueue();
const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.eval-c4", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue, ...access });
const inside = (base, path) => { const r = relative(base, path); return !r.startsWith("..") && !isAbsolute(r); };
const READ_ONLY_COMMANDS = ["ls", "cat", "pwd", "find", "head", "tail", "wc", "grep"];
const rejected = [], reviewed = [];
const decide = review => {
  const d = review.document;
  if (review.kind === "tool-operation") return "approve";
  if (d.kind === "text-edit") return "reject";
  if (d.kind === "command") return READ_ONLY_COMMANDS.includes(d.command) && !d.escalate && !(d.grants?.network) && !(d.grants?.paths?.length) ? "approve" : "reject";
  return "reject";
};
const started = Date.now();
let view, error = null;
const children = [], handles = [], views = [];
try {
  const agents = new AgentHost({ reviews: queue }); agents.register(adapter);
  const owner = { project_id: "eval", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: project, realpath_verified: true };
  const session = await adapter.createSession({ ...owner, directory, title: `C4 ${task}` });
  const authority = { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [project] };
  const decided = new Set(), deadline = Date.now() + 8 * 60_000;
  const answerReviews = async () => { for (const review of queue.list("eval", "pending")) if (!decided.has(review.review_id)) {
    decided.add(review.review_id); const decision = decide(review);
    const d = review.document, what = d.kind === "command" ? [d.command, ...(d.args ?? [])].join(" ") : d.kind === "text-edit" ? d.target_path : d.tool ?? review.kind;
    (decision === "approve" ? reviewed : rejected).push({ kind: review.kind, what });
    await queue.respond({ review_id: review.review_id, decision, actor_id: "user" });
  } };
  let body = { role_id: spec.role, task: spec.text };
  for (;;) {
    const handle = await agents.start("prologue", { ...owner, session, directory, ...body }, authority);
    handles.push(handle);
    for (;;) {
      view = await adapter.read(handle.ref);
      if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) break;
      if (view.phase === "awaiting-input" || Date.now() > deadline) { error = view.phase === "awaiting-input" ? "asked the user" : "timed out"; await adapter.cancel?.(handle.ref).catch(() => {}); view = await adapter.read(handle.ref); break; }
      await answerReviews(); await new Promise(resolve => setTimeout(resolve, 200));
    }
    views.push(view);
    // A round that yielded on its children: wait for its continuation, then start the next round as Coding's wake loop does.
    if (error || view.phase !== "completed" || handles.length >= 4) break;
    let wait;
    for (;;) {
      const open = openWait((await adapter.collaboration?.read("eval", session.session_id).catch(() => []))?.[0]);
      if (!open) break;
      if (open.continuation?.state === "eligible") { wait = open; break; }
      if (Date.now() > deadline) { error = "timed out waiting on children"; break; }
      await answerReviews(); await new Promise(resolve => setTimeout(resolve, 300));
    }
    if (!wait) break;
    body = wakeBodyOf(wait, body);
  }
  for (const handle of handles) for (const c of await adapter.subagents.list(handle.ref)) children.push({ role_id: c.role_id, state: c.state });
} catch (e) { error = String(e?.stack ?? e).slice(0, 800); }
finally { await adapter.close().catch(() => {}); await Promise.allSettled(reading); }

const textOf = c => typeof c === "string" ? c : Array.isArray(c) ? c.map(x => x.text ?? "").join("") : JSON.stringify(c ?? "");
const results = new Map(requests.flatMap(body => (body.messages ?? []).flatMap(m => Array.isArray(m.content) ? m.content : [])).filter(c => c.type === "tool_result").map(c => [c.tool_use_id, textOf(c.content)]));
const top = calls.filter(c => c.top).map(c => ({ name: c.name, input: c.input, result: results.has(c.id) ? results.get(c.id).slice(0, 300) : null }));
const finalText = (views.at(-1)?.turns ?? []).filter(t => t.kind === "assistant").map(t => t.text).join("\n");
const firstTop = requests.find(isTop), sys = firstTop?.system;
const systemChars = typeof sys === "string" ? sys.length : Array.isArray(sys) ? sys.map(x => x.text ?? "").join("").length : null;
// Errors that have nothing to do with how the model answered (统筹 10-18): the run is recorded, not counted, and run again.
const failed = !!error || view?.phase !== "completed";
const infra = failed && (http.some(h => h.error || h.status >= 500 || h.status === 429) || /timed out/.test(error ?? "")
  || /PROVIDER|NETWORK|TIMEOUT|RATE_LIMIT|OVERLOADED|5\d\d/i.test(String(view?.stop_reason ?? "")));
const row = { task, version: VERSION, run: Number(index), attempt: Number(process.env.ATTEMPT ?? 1), counted: !infra, infra, http, phase: view?.phase ?? null, stop_reason: view?.stop_reason ?? null, error, ms: Date.now() - started,
  rounds: views.length, modelCalls: requests.length, tokens: view?.usage?.tokens ?? null, systemChars, done: spec.done(finalText), finalText: finalText.slice(-1500),
  calls: top, askUser: top.filter(c => c.name === "ask-user").length, rejected, reviewed: reviewed.length };
if (task === "T1") {
  const searches = top.filter(c => c.name === "search");
  Object.assign(row, { searches: searches.map(c => ({ query: c.input?.query ?? null, missed: /\(no matches\)/.test(c.result ?? "") })),
    lists: top.filter(c => c.name === "list").length, reads: top.filter(c => c.name === "read").map(c => c.input?.path ?? null),
    saysMissing: /不存在|找不到|没有找到|未找到/.test(plain(finalText)) });
}
if (task === "T2") Object.assign(row, { line2400, offByOne: !row.done && (finalText.includes(ids[2398]) || finalText.includes(ids[2400])),
  reads: top.filter(c => c.name === "read").map(c => ({ path: c.input?.path ?? null, offset: c.input?.offset ?? null, limit: c.input?.limit ?? null, result: (c.result ?? "").slice(0, 160) })),
  searches: top.filter(c => c.name === "search").map(c => c.input?.query ?? null) });
if (task === "T3") {
  // A character is an opaque reference; the host lists each one in the system text as "<ref>: <name>; tools=[…]".
  const systemText = typeof sys === "string" ? sys : Array.isArray(sys) ? sys.map(x => x.text ?? "").join("") : "";
  const refTools = {};
  for (const m of systemText.matchAll(/^(\S+): ([^;\n]+); tools=(\[[^\n]*\])$/gm)) { try { refTools[m[1]] = { name: m[2], tools: JSON.parse(m[3]) }; } catch {} }
  row.roleRefs = refTools;
  // Recorded only, not judged (统筹 10-18): do the tools the host lists to the model match what the manifest declares, by role name?
  const declaredByName = Object.fromEntries((codingAgentManifest.subagents?.roles ?? []).map(r => [r.name, r.host_tools.map(t => ({ "read-file": "read", "edit-file": "edit" })[t] ?? t)]));
  row.roleRefsMatchManifest = Object.values(refTools).map(({ name, tools }) => {
    const declared = declaredByName[name];
    return { name, listed: tools, declared: declared ?? null, same: !!declared && declared.length === tools.length && declared.every(t => tools.includes(t)) };
  });
  const shape = (tools, character) => {
    if (!Array.isArray(tools)) return "not a list";
    if (!tools.length) return "empty";
    const declared = refTools[character]?.tools;
    if (!declared) return "unknown character";
    const extra = tools.filter(t => !declared.includes(t)), missing = declared.filter(t => !tools.includes(t));
    return extra.length ? `more: ${extra.join(", ")}` : missing.length ? "fewer" : "exact";
  };
  row.dispatches = top.filter(c => c.name === "dispatch-subagent").map(c => ({ tools: c.input?.tools, shape: shape(c.input?.tools, c.input?.character), character: c.input?.character ?? null,
    yield: c.input?.yield ?? false, background: c.input?.background ?? false, result: c.result?.slice(0, 300) ?? null,
    refused: /TOOL_ARGUMENTS_INVALID|CHARACTER_ESCALATION|SUBAGENT_ESCALATION|TASKBOARD_|_INVALID|_DENIED/.exec(c.result ?? "")?.[0] ?? null }));
  row.children = children;
  row.childDone = children.some(c => c.role_id === "coding-reader" && c.state === "completed");
  row.done = row.done && row.childDone;
}
appendFileSync(OUT, JSON.stringify(row) + "\n");
console.log(JSON.stringify({ task, version: VERSION, run: row.run, phase: row.phase, error, done: row.done, rounds: row.rounds, calls: top.map(c => c.name).join(","), s: Math.round(row.ms / 1000) }));
rmSync(root, { recursive: true, force: true });
if (infra) process.exitCode = 75;
