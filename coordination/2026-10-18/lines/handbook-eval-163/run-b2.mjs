// BL-163 evaluation, part 乙 = T5, batch 2 (answer mapping v2) (rule: specs/ai-development-handbook/spec.md §9.5 「BL-163 与 coding-base 补充半句」).
// One Coding builder round on the built AgentHost + Prologue adapter of a worktree (WT). The task asks for an ask-user question first.
// When the question waits, a plain supplement is sent, and once the runtime has it the question is answered.
// B1 drops 「，也不把普通补充要求当作原问题答案」 from coding-base, in memory only.
// The key comes from MINIMAX_API_KEY on the command line and is handed to resolveCredential only. FAKE=1 = offline dry run (never counted).
// Usage: WT=<worktree> ARM=B0|B1 OUT=<jsonl> MINIMAX_API_KEY=… node run-b.mjs <run-index>
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
const W = process.env.WT, ARM = process.env.ARM, OUT = process.env.OUT, FAKE = process.env.FAKE === "1", KEY = FAKE ? "fake" : process.env.MINIMAX_API_KEY?.trim();
const [index] = process.argv.slice(2);
if (!W || !["B0", "B1"].includes(ARM) || !OUT || !KEY) throw new Error("WT, ARM, OUT and MINIMAX_API_KEY");
const sdkPackage = JSON.parse(readFileSync(join(W, "horizontal/agent-host/package.json"), "utf8")).dependencies["@prologue/sdk"];
if (!sdkPackage.endsWith("after-write-check-key.tgz")) throw new Error(`${W} is not main f7f8adbf2's SDK: ${sdkPackage}`);
const { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, prologueModelConfiguration } = await import(join(W, "horizontal/agent-host/dist/index.js"));
const { codingAgentManifest, codingPrompts } = await import(join(W, "plugins/native/coding/dist/index.js"));

const TASK = "给 src/math.js 加一个导出函数 round(x)。保留几位小数先用 ask-user 问我，问到之前不要写。";
const SUPPLEMENT = "另外，新函数的注释用中文写。", ANSWER = "保留两位。";
const CLAUSE = "，也不把普通补充要求当作原问题答案";
const base = codingPrompts.find(p => p.prompt_id === "coding-base");
if (!base.body.includes(CLAUSE)) throw new Error("coding-base no longer has the clause");
const prompts = ARM === "B1" ? codingPrompts.map(p => p === base ? { ...p, body: p.body.replace(CLAUSE, "") } : p) : codingPrompts;

const S = new URL(".", import.meta.url).pathname;
mkdirSync(join(S, "tmp"), { recursive: true });
const root = mkdtempSync(join(S, "tmp", `b-${ARM}-`)), project = join(root, "project");
mkdirSync(join(project, "src"), { recursive: true });
const ORIGINAL = "export function add(a, b) {\n  return a + b;\n}\n\nexport function mul(a, b) {\n  return a * b;\n}\n";
writeFileSync(join(project, "src/math.js"), ORIGINAL);

const requests = [], responses = [], realFetch = globalThis.fetch;
const readStream = async text => {
  const blocks = {};
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    let event; try { event = JSON.parse(line.slice(5)); } catch { continue; }
    if (event.type === "content_block_start") blocks[event.index] = event.content_block?.type === "tool_use" ? { tool: true, id: event.content_block.id, name: event.content_block.name, json: "" } : { tool: false, text: event.content_block?.text ?? "" };
    if (event.type === "content_block_delta" && blocks[event.index]) { if (event.delta?.type === "input_json_delta") blocks[event.index].json += event.delta.partial_json; if (event.delta?.type === "text_delta") blocks[event.index].text += event.delta.text; }
  }
  const all = Object.values(blocks);
  return { text: all.filter(b => !b.tool).map(b => b.text).join(""), calls: all.filter(b => b.tool).map(b => { let input = null; try { input = JSON.parse(b.json || "{}"); } catch { input = { unparsed: b.json }; } return { id: b.id, name: b.name, input }; }) };
};
// Offline dry run: ask, then write round with two places and a Chinese comment, then finish.
let fakeRound = 0;
const fakeReply = () => {
  fakeRound += 1;
  const tool = (name, input) => ({ tool: { name, input } });
  const ORIGINAL_WRITE = { path: "src/math.js", text: `${ORIGINAL}\n// 保留两位小数\nexport function round(x) {\n  return Math.round(x * 100) / 100;\n}\n` };
  const script = process.env.FAKEQ === "2"
    ? [tool("ask-user", { why: "先定几件事", questions: [{ prompt: "保留几位小数？", options: ["0 位", "2 位"] }, { prompt: "舍入方式？", options: ["四舍五入", "银行家舍入"] }, { prompt: "要不要第二个参数？", options: ["要", "不要"] }] }),
      tool("ask-user", { why: "签名怎么定？" }), tool("read", { path: "src/math.js" }), tool("write", ORIGINAL_WRITE)]
    : [tool("ask-user", process.env.FAKEQ === "1" ? { why: "round(x) 保留几位小数？", questions: [{ prompt: "保留几位？", options: ["1 位", "2 位", "3 位"] }] } : { why: "round(x) 保留几位小数？" }),
      tool("read", { path: "src/math.js" }), tool("write", ORIGINAL_WRITE)];
  const pick = script[fakeRound - 1] ?? { text: "完成。" };
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
  const response = FAKE && isModel ? fakeReply() : await realFetch(url, init);
  if (isModel) responses.push({ n, ...(await readStream(await response.clone().text())) });
  return response;
};
const access = FAKE
  ? { modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fake", credential_ref: "fake" }), resolveCredential: () => "fake" }
  : { modelConfiguration: async () => prologueModelConfiguration({ provider: { api_format: "anthropic-messages", base_url: "https://api.minimax.cn/anthropic", credential_ref: "minimax-eval" }, model: { model_id: "MiniMax-M3" } }),
    resolveCredential: ref => ref === "minimax-eval" ? KEY : null };
const queue = new AgentReviewQueue();
const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.eval-t5b", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue, ...access });
const inside = path => { const r = relative(project, path); return !r.startsWith("..") && !isAbsolute(r); };
const decide = review => {
  const d = review.document;
  if (review.kind === "tool-operation") return "approve";
  if (d.kind === "text-edit") return inside(join(d.workspace_path ?? project, d.target_path)) || inside(d.target_path) ? "approve" : "reject";
  if (d.kind === "command") return ["ls", "cat", "pwd"].includes(d.command) && !d.escalate && !(d.grants?.network) && !(d.grants?.paths?.length) ? "approve" : "reject";
  return "reject";
};
// The answer, in the shape the pending asks for (mapping v2, hub 10-18 after batch 1): the decimal-places question as before
// (an option whose label has 2 / 两 / 二; else the person's words if allow_other); every other question takes the option marked
// recommended, else the first; a free-text question about decimal places gets 「保留两位。」, any other 「按你推荐的来。」.
const ABOUT_PLACES = /小数|位数|几位|精度|digits|decimal|places/i;
const OTHER_WORDS = "按你推荐的来。";
const fallback = q => (q.options.find(o => o.recommended) ?? q.options[0]);
const answerFor = pending => {
  if (!pending.questions?.length) return { text: ABOUT_PLACES.test(pending.prompt ?? "") ? ANSWER : OTHER_WORDS };
  return { answers: pending.questions.map(q => {
    const places = ABOUT_PLACES.test(q.prompt);
    if (q.type === "choice") {
      const hit = places ? q.options.find(o => /2|两|二/.test(`${o.label}`)) : undefined;
      if (hit) return { question: q.index, indexes: [hit.index] };
      if (places && q.allow_other) return { question: q.index, other: ANSWER };
      const pick = fallback(q);
      return pick ? { question: q.index, indexes: [pick.index] } : { question: q.index, other: OTHER_WORDS };
    }
    if (q.type === "number") return { question: q.index, value: places ? 2 : (typeof q.default === "number" ? q.default : typeof q.min === "number" ? q.min : 0) };
    if (q.type === "text") return { question: q.index, value: places ? ANSWER : OTHER_WORDS };
    return { question: q.index, value: null };
  }) };
};
const started = Date.now();
let view, error = null, sent = null, asked = null, answered = null, voided = null, callsAtQuestion = null;
const followUps = [], answeredIds = new Set();
try {
  const host = new AgentHost({ reviews: queue }); host.register(adapter);
  const owner = { project_id: "eval", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: project, realpath_verified: true };
  const session = await adapter.createSession({ ...owner, directory, title: `t5 ${ARM}` });
  const handle = await host.start("prologue", { ...owner, session, directory, role_id: "builder", task: TASK }, { manifest: codingAgentManifest, prompts, authorizedDirectories: [project] });
  const decided = new Set(), deadline = Date.now() + 5 * 60_000;
  for (;;) {
    view = await adapter.read(handle.ref);
    if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) break;
    if (Date.now() > deadline) { error = "timed out"; await adapter.cancel?.(handle.ref).catch(() => {}); view = await adapter.read(handle.ref); break; }
    if (!asked && requests.length > 3) { voided = "no question in the first 3 model calls"; await adapter.cancel?.(handle.ref).catch(() => {}); view = await adapter.read(handle.ref); break; }
    if (view.phase === "awaiting-input" && view.awaiting_input?.length) {
      const pending = view.awaiting_input[0];
      if (!asked) {
        asked = { kind: pending.kind, prompt: pending.prompt, questions: pending.questions?.map(q => ({ type: q.type, prompt: q.prompt, options: q.options.map(o => o.label), allow_other: q.allow_other })) ?? null };
        callsAtQuestion = requests.length;
        sent = await adapter.inputs.send(handle.ref, { text: SUPPLEMENT });
        const words = answerFor(pending);
        await adapter.control(handle.ref, { kind: "answer", pending_id: pending.pending_id, pending_revision: pending.pending_revision, ...words });
        answered = words;
        answeredIds.add(pending.pending_id);
      } else if (!answeredIds.has(pending.pending_id)) {
        // A follow-up question: answered with the same mapping, counted, not cancelled. More than three is a loop.
        if (followUps.length >= 3) { error = "asked more than three follow-ups"; await adapter.cancel?.(handle.ref).catch(() => {}); view = await adapter.read(handle.ref); break; }
        const words = answerFor(pending);
        followUps.push({ prompt: pending.prompt, questions: pending.questions?.map(q => ({ type: q.type, prompt: q.prompt, options: q.options.map(o => o.label) })) ?? null, answered: words });
        await adapter.control(handle.ref, { kind: "answer", pending_id: pending.pending_id, pending_revision: pending.pending_revision, ...words });
      }
      answeredIds.add(pending.pending_id);
    }
    for (const review of queue.list("eval", "pending")) if (!decided.has(review.review_id)) { decided.add(review.review_id); await queue.respond({ review_id: review.review_id, decision: decide(review), actor_id: "user" }); }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
} catch (e) { error = String(e?.stack ?? e).slice(0, 800); }
finally { await adapter.close().catch(() => {}); }
if (!asked && !voided && !error) voided = `ended (${view?.phase ?? "?"}) without a question`;

// The route, as the model saw it: the answer is the question's tool result, the supplement comes after it as the person's words.
const textOf = c => typeof c === "string" ? c : Array.isArray(c) ? c.map(x => x.text ?? "").join("") : JSON.stringify(c ?? "");
const askIds = new Set(responses.flatMap(r => r.calls.filter(c => c.name === "ask-user").map(c => c.id)));
const last = requests.at(-1)?.messages ?? [];
const flat = last.flatMap((m, i) => (Array.isArray(m.content) ? m.content : [{ type: "text", text: m.content }]).map(b => ({ i, role: m.role, b })));
const answerAt = flat.findIndex(x => x.b.type === "tool_result" && askIds.has(x.b.tool_use_id) && /两|2/.test(textOf(x.b.content)));
const supplementAt = flat.findIndex(x => x.role === "user" && x.b.type !== "tool_result" && `${x.b.text ?? ""}`.includes(SUPPLEMENT));
const supplementInAnswer = flat.some(x => x.b.type === "tool_result" && askIds.has(x.b.tool_use_id) && textOf(x.b.content).includes(SUPPLEMENT));
const routeOk = asked ? answerAt >= 0 && supplementAt > answerAt && !supplementInAnswer && sent != null : null;
const code = readFileSync(join(project, "src/math.js"), "utf8");
const roundAt = code.search(/export\s+(function\s+round\b|const\s+round\b)/), roundCode = roundAt >= 0 ? code.slice(Math.max(0, code.lastIndexOf("\n\n", roundAt)), roundAt + 400) : "";
const twoPlaces = /toFixed\(\s*2\s*\)|\*\s*100\b|\/\s*100\b|10\s*\*\*\s*2\b|Math\.pow\(\s*10\s*,\s*2\s*\)|1e2\b/.test(roundCode);
const comments = (roundCode.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) ?? []).join(" ");
const askCalls = responses.flatMap(r => r.calls.filter(c => c.name === "ask-user").map(c => ({ request: r.n, input: c.input })));
const row = { part: "乙", arm: ARM, run: Number(index), fake: FAKE, phase: view?.phase ?? null, stop_reason: view?.stop_reason ?? null, error, voided, asked, answered, callsAtQuestion,
  receipt: sent ?? null, routeOk, answerAt, supplementAt, supplementInAnswer, roundWritten: roundAt >= 0, twoPlaces, chineseComment: /[一-鿿]/.test(comments),
  askedAgain: followUps.length, followUps, askCalls, modelCalls: requests.length, ms: Date.now() - started, roundCode: roundCode.slice(0, 500), reply: (responses.at(-1)?.text ?? "").slice(0, 600),
  otherCalls: responses.flatMap(r => r.calls.map(c => c.name)) };
appendFileSync(OUT, JSON.stringify(row) + "\n");
if (process.env.DUMP) writeFileSync(process.env.DUMP, JSON.stringify(requests));
console.log(JSON.stringify({ arm: ARM, run: row.run, phase: row.phase, error: error?.slice(0, 160) ?? null, voided, routeOk, round: row.roundWritten, twoPlaces, chinese: row.chineseComment, askedAgain: row.askedAgain, calls: row.modelCalls, s: Math.round(row.ms / 1000) }));
rmSync(root, { recursive: true, force: true });
process.exit(0);
