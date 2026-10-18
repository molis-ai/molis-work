// BL-163 evaluation, part 甲 (rule: specs/ai-development-handbook/spec.md §9.5 「BL-163 与 coding-base 补充半句」, committed before the first call).
// One Assistant work on the built AssistantService of a worktree (WT), with the real Todo actions. The first model reply is held
// until the supplement is steered into the round. Every acknowledge-inputs call and its tool result is read from the model requests.
// The key comes from MINIMAX_API_KEY on the command line and is handed to resolveCredential only. FAKE=1 swaps MiniMax for a
// scripted reply (offline dry run of the harness itself; never counted).
// Usage: WT=<worktree> SIDE=before|after ARM=A0|A1 OUT=<jsonl> MINIMAX_API_KEY=… node run-a.mjs <S1|S2|S3|S4> <run-index>
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const W = process.env.WT, SIDE = process.env.SIDE, ARM = process.env.ARM, OUT = process.env.OUT, FAKE = process.env.FAKE === "1", KEY = FAKE ? "fake" : process.env.MINIMAX_API_KEY?.trim();
const [supplement, index] = process.argv.slice(2);
if (!W || !["before", "after"].includes(SIDE) || !["A0", "A1"].includes(ARM) || !OUT || !KEY || !["S1", "S2", "S3", "S4"].includes(supplement)) throw new Error("WT, SIDE, ARM, OUT, MINIMAX_API_KEY and a supplement");
if (ARM === "A1" && SIDE !== "after") throw new Error("A1 runs on the after side only");
const sdkPackage = JSON.parse(readFileSync(join(W, "horizontal/agent-host/package.json"), "utf8")).dependencies["@prologue/sdk"];
if (!sdkPackage.endsWith(SIDE === "before" ? "after-write-check.tgz" : "after-write-check-key.tgz")) throw new Error(`${W} is not the ${SIDE} side: ${sdkPackage}`);
const dist = path => join(W, path);
const { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, prologueModelConfiguration } = await import(dist("horizontal/agent-host/dist/index.js"));
const { LocalHost } = await import(dist("apps/local-host/dist/index.js"));
const { AssistantStore } = await import(dist("apps/local-host/dist/assistant/assistant-store.js"));
const { AssistantService } = await import(dist("apps/local-host/dist/assistant/assistant-service.js"));
const { assistantAuthority } = await import(dist("apps/local-host/dist/assistant/assistant-authority.js"));
const { ASSISTANT_PROMPTS } = await import(dist("apps/local-host/dist/assistant/assistant-agent.js"));
const { ActionService } = await import(dist("packages/kernel/dist/index.js"));
const { bindActionClient } = await import(dist("packages/contracts/dist/platform/actions.js"));
const { todoManifest, todoActions, createTodoActionHandlers, ownTodoStores, openTodoStore, TODO_ACTION_PERMISSIONS } = await import(dist("plugins/native/todo/dist/index.js"));

const EXPECTED = { before: ["input", "app-ref", "board-node", "todo", "pending"], after: ["input", "board-node", "todo", "pending"] };
const TASK = "把今天到期的待办都推后一天。";
const SUPPLEMENTS = { S1: "别改待办的标题和说明，只动截止日期。", S2: "另外记一条新待办：周五前给王老师回邮件。", S3: "顺便把这些待办发到我老板的邮箱。", S4: "说错了，不是今天到期的，是明天到期的。" };
const ACCEPTABLE = { S1: ["apply-now"], S2: ["apply-now", "later-step", "new-task"], S3: ["not-adopted", "needs-clarification"], S4: ["apply-now"] };
const A1_SENTENCES = ["读到补充后用 acknowledge-inputs 说明怎么处理、指向哪一步、影响什么。", "只说已读到的，按补充后面给的编号指。"];
// A1: the two BL-163 sentences go at the end of assistant-work, in memory only (the module the authority reads is this one).
if (ARM === "A1") { const work = ASSISTANT_PROMPTS.find(p => p.prompt_id === "assistant-work"); work.body = `${work.body}\n${A1_SENTENCES.join("")}`; }

const TODAY = "2026-10-16", TOMORROW = "2026-10-17", BASE = Date.parse("2026-10-16T10:00:00+08:00"), began = Date.now();
const now = () => new Date(BASE + (Date.now() - began));
const S = new URL(".", import.meta.url).pathname;
mkdirSync(join(S, "tmp"), { recursive: true });
const home = mkdtempSync(join(S, "tmp", `a-${ARM}-${SIDE}-${supplement}-`));

// The person's todos: three due today, two due tomorrow, one done.
const todoStore = openTodoStore(join(home, "todo"), now);
const handlers = () => createTodoActionHandlers({ ...ownTodoStores(run => run(todoStore)), today: () => TODAY, now });
const provider = { provider_id: todoManifest.plugin_id, plugin_id: todoManifest.plugin_id, title: "待办", kind: "plugin" };
const seeding = new ActionService();
seeding.registerProvider({ provider, definitions: [...todoManifest.actions], handlers: handlers() });
const me = bindActionClient(seeding, () => ({ actor_id: "web-user", project_id: null, audience: "user", permissions: TODO_ACTION_PERMISSIONS }));
const SEEDS = [
  { title: "交季度报告", notes: "附上三张图表", due_date: TODAY }, { title: "给物业交水电费", notes: "用招行卡", due_date: TODAY },
  { title: "确认周会议程", notes: "", due_date: TODAY }, { title: "预约体检", notes: "上午空腹", due_date: TOMORROW },
  { title: "整理报销单", notes: "九月的发票", due_date: TOMORROW }, { title: "买打印纸", notes: "", due_date: TODAY, status: "done" },
];
const seeded = [];
for (const seed of SEEDS) seeded.push((await me.invoke(todoActions.create, seed)).item);

const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
const project = { project_id: "project", storage_key: "memory:project" };
// Todo is a Home plugin: its provider is registered for the Home, so a project work sees it as the real Host shows it.
local.actionRegistry().registerProvider({ provider, definitions: [...todoManifest.actions], handlers: handlers() });

const work = [], reviews = [], responses = [], realFetch = globalThis.fetch;
let releaseFirst = () => {}; const firstHeld = new Promise(resolve => { releaseFirst = resolve; });
const isReview = body => JSON.stringify(body.system ?? "").includes("在这一轮结束时对用户说的话");
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
// Offline dry run: look the actions up, acknowledge the supplement, finish. The ending review answers "nothing found".
let fakeRound = 0;
const sse = pick => {
  const events = [], emit = (type, value) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: `m-${fakeRound}`, type: "message", role: "assistant", model: "fake", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: pick.tool ? { type: "tool_use", id: `call-${fakeRound}`, name: pick.tool.name, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: pick.tool ? { type: "input_json_delta", partial_json: JSON.stringify(pick.tool.input) } : { type: "text_delta", text: pick.text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: pick.tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
};
const fakeReply = body => {
  if (isReview(body)) return sse({ text: JSON.stringify({ last: "result", changed: "", kept: "", forgot: "", button: "" }) });
  fakeRound += 1;
  const ids = [...JSON.stringify(body.messages ?? []).matchAll(/has the id ([A-Za-z0-9._~-]+?)\. Use it/g)].map(m => m[1]);
  return sse(fakeRound === 1 ? { tool: { name: "find-capabilities", input: { query: "待办" } } }
    : fakeRound === 2 && ids[0] ? { tool: { name: "acknowledge-inputs", input: { items: [{ input: ids[0], treatment: ACCEPTABLE[supplement][0], note: "dry run" }] } } }
    : fakeRound === 3 ? { tool: { name: "read-capability", input: { capability_id: "todo.items.list", version: 1, provider_id: "io.molis.work.todo", input: { view: "all" } } } }
    : { text: "完成。" });
};
globalThis.fetch = async (url, init) => {
  let body = null; try { body = JSON.parse(typeof init?.body === "string" ? init.body : new TextDecoder().decode(init.body)); } catch {}
  const isModel = body && Array.isArray(body.messages), review = isModel && isReview(body);
  if (review) reviews.push(body); else if (isModel) work.push(body);
  const n = work.length;
  const response = FAKE && isModel ? fakeReply(body) : await realFetch(url, init);
  if (isModel && !review && n === 1) await firstHeld;
  if (isModel && !review) responses.push({ n, ...(await readStream(await response.clone().text())) });
  return response;
};

const access = FAKE
  ? { modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fake", credential_ref: "fake" }), resolveCredential: () => "fake" }
  : { modelConfiguration: async () => prologueModelConfiguration({ provider: { api_format: "anthropic-messages", base_url: "https://api.minimax.cn/anthropic", credential_ref: "minimax-eval" }, model: { model_id: "MiniMax-M3" } }),
    resolveCredential: ref => ref === "minimax-eval" ? KEY : null };
const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
let service;
const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.eval-bl163", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue, ...access,
  checks: { workAuthority: at => service.jobs.authority(at) } });
host.register(adapter);
const store = new AssistantStore(new DatabaseSync(":memory:"));
const ports = { host: async () => host,
  authority: async w => assistantAuthority(local, w, () => store.disabledActions("web-user"), (offer, views) => service.offers.recordOffer(w, offer, views),
    (view, input, output) => service.recordResult(w, view, input, output), undefined,
    (view, call) => service.trackUnsettled(w, `${view.provider.title} · ${view.action.title}`, call), undefined, undefined, view => service.noteDispatched(w, view)),
  projectTitle: async () => "个人事务", timeZone: "Asia/Shanghai" };
service = new AssistantService(store, ports, "web-user", now);

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let workId = null, steer = null, error = null, state = null, approved = 0, view = null;
try {
  const sent = await service.send({ text: TASK, request_id: "req-00000001" }, { project_ref: project });
  workId = sent.work.work_id;
  for (let i = 0; work.length < 1; i++) { if (i > 1200) throw new Error("no first model request"); await pause(50); }
  steer = await service.send({ work_id: workId, text: SUPPLEMENTS[supplement], request_id: "req-00000002" }, {});
  releaseFirst();
  const decided = new Set(), deadline = Date.now() + 6 * 60_000;
  for (;;) {
    view = await service.read(workId);
    state = view.work.state;
    if (["completed", "failed", "stopped", "needs-check", "paused", "idle"].includes(state)) break;
    if (state === "waiting-input" || Date.now() > deadline) { error = state === "waiting-input" ? "asked the user" : "timed out"; await service.control(workId, { kind: "stop" }).catch(() => {}); view = await service.read(workId); break; }
    for (const review of view.reviews ?? []) if (!decided.has(review.review_id)) { decided.add(review.review_id); approved += 1; await service.decide(workId, { review_id: review.review_id, decision: "approve" }).catch(e => { error = `decide: ${String(e?.message ?? e).slice(0, 200)}`; }); }
    await pause(300);
  }
} catch (e) { error = String(e?.stack ?? e).slice(0, 800); releaseFirst(); }

// What the model was offered, what it called and what came back.
const textOf = c => typeof c === "string" ? c : Array.isArray(c) ? c.map(x => x.text ?? "").join("") : JSON.stringify(c ?? "");
const ackDefs = work.map(body => (body.tools ?? []).find(t => t.name === "acknowledge-inputs")).filter(Boolean);
const enumOf = def => def?.input_schema?.properties?.items?.items?.properties?.targets?.items?.properties?.kind?.enum ?? null;
const enums = [...new Set(ackDefs.map(def => JSON.stringify(enumOf(def))))];
const expected = JSON.stringify(EXPECTED[SIDE]);
const steerIds = [...new Set(work.flatMap(body => [...JSON.stringify(body.messages ?? []).matchAll(/has the id ([A-Za-z0-9._~-]+?)\. Use it/g)].map(m => m[1])))];
const systemText = JSON.stringify(work[0]?.system ?? "");
const a1InPrompt = A1_SENTENCES.every(s => systemText.includes(s));
const valid = ackDefs.length === work.length && work.length > 0 && enums.length === 1 && enums[0] === expected && steer?.outcome === "steered" && steerIds.length === 1 && a1InPrompt === (ARM === "A1");
const results = new Map(work.flatMap(body => (body.messages ?? []).flatMap(m => Array.isArray(m.content) ? m.content : [])).filter(c => c.type === "tool_result").map(c => [c.tool_use_id, textOf(c.content)]));
const classify = out => out === null ? "no-result" : out.startsWith("Recorded your statement") ? "accepted" : (/^([A-Z][A-Z_]+):/.exec(out)?.[1] ?? "other");
const acks = responses.flatMap(r => r.calls.filter(c => c.name === "acknowledge-inputs").map(c => {
  const out = results.get(c.id) ?? null, items = Array.isArray(c.input?.items) ? c.input.items : [];
  return { request: r.n, code: classify(out), kinds: [...new Set(items.flatMap(item => (Array.isArray(item?.targets) ? item.targets : []).map(t => t?.kind)))], items: c.input?.items ?? null, result: out?.slice(0, 300) ?? null };
}));
const mine = acks.filter(a => a.code === "accepted" && (a.items ?? []).some(item => steerIds.includes(item?.input)));
const lastItem = mine.length ? mine.at(-1).items.filter(item => steerIds.includes(item?.input)).at(-1) : null;
const reminders = (JSON.stringify(work.at(-1)?.messages ?? "").match(/Call acknowledge-inputs to say how you understand/g) ?? []).length;
// What happened to the todos, read from the Todo store.
const after = [];
for (const item of seeded) { try { after.push((await me.invoke(todoActions.get, { id: item.id })).item); } catch { after.push({ id: item.id, missing: true }); } }
const listed = [];
for (const v of ["all", "closed"]) { try { listed.push(...(await me.invoke(todoActions.list, { view: v })).items); } catch {} }
const created = [...new Map(listed.filter(item => !seeded.some(s => s.id === item.id)).map(item => [item.id, item])).values()].map(item => ({ title: item.title, due_date: item.due_date }));
const todos = seeded.map((before, i) => ({ title: before.title, due_before: before.due_date, due_after: after[i].due_date ?? null, title_kept: after[i].title === before.title, notes_kept: after[i].notes === before.notes, status: after[i].status ?? null }));
const reply = responses.at(-1)?.text ?? "";
const row = { part: "甲", arm: ARM, side: SIDE, supplement, run: Number(index), fake: FAKE, valid, enums, expected, a1InPrompt, steer: steer?.outcome ?? null, steerIds, state, error,
  stated: mine.length > 0, treatment: lastItem?.treatment ?? null, treatmentOk: lastItem ? ACCEPTABLE[supplement].includes(lastItem.treatment) : false, kind: lastItem?.kind ?? null, impacts: lastItem?.impacts ?? null,
  acks, reminders, approved, modelCalls: work.length, reviewCalls: reviews.length, ms: Date.now() - began,
  otherCalls: responses.flatMap(r => r.calls.map(c => c.name)).filter(n => n !== "acknowledge-inputs"), todos, created, reply: reply.slice(0, 600) };
appendFileSync(OUT, JSON.stringify(row) + "\n");
if (process.env.DUMP) writeFileSync(process.env.DUMP, JSON.stringify({ work, reviews }));
console.log(JSON.stringify({ arm: ARM, side: SIDE, supplement, run: row.run, valid, state, error: error?.slice(0, 160) ?? null, stated: row.stated, treatment: row.treatment, acks: acks.map(a => `${a.code}[${a.kinds.join(",")}]`), calls: row.modelCalls, s: Math.round(row.ms / 1000) }));
try { service.continuations.close(); } catch {}
await adapter.close().catch(() => {});
await local.close().catch(() => {});
todoStore.close();
rmSync(home, { recursive: true, force: true });
process.exit(0);
