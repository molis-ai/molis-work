/**
 * Long Coding session benchmark: real web server, real Coding plugin and Prologue runtime, isolated home.
 *
 * The model is the only stand-in: calls to the benchmark provider (https://1.1.1.1, never contacted) are answered
 * by a scripted responder that reads two files and replies with a long answer, so every round carries real tool
 * output through the real runtime. Nothing touches the user's home, keychain or providers.
 *
 *   ROUNDS=300 pnpm exec tsx scripts/bench-coding-long-session.mts            # build and measure
 *   KEEP=1 PORT=4219 ... to leave the server running for manual inspection afterwards.
 */
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const home = await mkdtemp(join(tmpdir(), "molis-long-session-"));
process.env.MOLIS_WORK_HOME = home;
process.env.MOLIS_WORK_SECRET_BACKEND = "file";
const { openMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
const { PROJECT_SCOPED_PLUGIN_IDS } = await import("@molis-ai/molis-work-app-workbench");
const { createMolisWorkWebServer } = await import("../apps/desktop/launchers/web/server.js");
const { ChromeHarness } = await import("../tests/fixtures/plugin-builder-browser.js");

const ROUNDS = Number(process.env.ROUNDS ?? 300), PORT = Number(process.env.PORT ?? 0), token = "bench-control-token-" + randomUUID();
const log = (...values: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...values);

// A workspace with two sizeable files, so every read returns a lot of text.
const workspace = join(home, "bench-repo"); await mkdir(join(workspace, "src"), { recursive: true });
const lines = (name: string) => Array.from({ length: 180 }, (_, i) => `export function ${name}${i}(value: number): number { return value * ${i} + ${i % 7}; } // ${"x".repeat(40)}`).join("\n") + "\n";
await writeFile(join(workspace, "src", "alpha.ts"), lines("alpha")); await writeFile(join(workspace, "src", "beta.ts"), lines("beta"));
execFileSync("git", ["init", "-q"], { cwd: workspace }); execFileSync("git", ["-c", "user.name=bench", "-c", "user.email=bench@example.invalid", "add", "."], { cwd: workspace });
execFileSync("git", ["-c", "user.name=bench", "-c", "user.email=bench@example.invalid", "commit", "-qm", "base"], { cwd: workspace });

// The scripted model: read alpha, read beta, then answer at length. Anthropic Messages SSE, like the real provider.
const realFetch = globalThis.fetch; let modelCalls = 0, compactions = 0, toolNames: string[] = [];
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith("https://1.1.1.1")) return realFetch(input as never, init);
  modelCalls++;
  const body = JSON.parse(typeof init?.body === "string" ? init.body : new TextDecoder().decode(init?.body as Uint8Array));
  const events: string[] = [], emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  const promptTokens = Math.round(JSON.stringify(body).length / 4);
  // The runtime's own context compaction is the one call without tools: it asks for a selection, and keeping nothing extra is valid.
  if (!body.tools?.length) {
    compactions++;
    emit("message_start", { message: { id: "bench-" + modelCalls, type: "message", role: "assistant", model: "bench-model", content: [], usage: { input_tokens: promptTokens, output_tokens: 0 } } });
    emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: '{"selections":[]}' } });
    emit("content_block_stop", { index: 0 }); emit("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 8 } }); emit("message_stop", {});
    return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
  }
  if (body.tools?.length) toolNames = body.tools.map((tool: { name: string }) => tool.name);
  const messages = body.messages as Array<{ role: string; content: unknown }>;
  // Tool results after the latest plain user prompt decide the step.
  let step = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i]!.content;
    if (messages[i]!.role === "user" && Array.isArray(content) && content.some((part: { type?: string }) => part.type === "tool_result")) { step++; continue; }
    if (messages[i]!.role === "user") break;
  }
  const read = toolNames.find(name => /^read(-file)?$/.test(name)) ?? "read";
  emit("message_start", { message: { id: "bench-" + modelCalls, type: "message", role: "assistant", model: "bench-model", content: [], usage: { input_tokens: promptTokens, output_tokens: 0 } } });
  if (step < 2) emit("content_block_start", { index: 0, content_block: { type: "tool_use", id: `read-${modelCalls}`, name: read, input: { path: step === 0 ? "src/alpha.ts" : "src/beta.ts" } } });
  else {
    const answer = ["## 结论", "", ...Array.from({ length: 12 }, (_, i) => `- 第 ${i + 1} 点：alpha${i} 与 beta${i} 的系数一致，余数按 7 取模。`), "", "```ts", ...Array.from({ length: 16 }, (_, i) => `const v${i} = alpha${i}(${i}) + beta${i}(${i});`), "```", "", "以上核对只读取了文件，没有修改。"].join("\n");
    emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    for (let at = 0; at < answer.length; at += 120) emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: answer.slice(at, at + 120) } });
  }
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: step < 2 ? "tool_use" : "end_turn" }, usage: { output_tokens: step < 2 ? 24 : 420 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}) as typeof fetch;

const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
const project = await catalog.createProject({ display_name: "长会话基准", actor_id: "bench" });
for (const plugin_id of PROJECT_SCOPED_PLUGIN_IDS) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id, actor_id: "bench" });
catalog.close();
const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: token });
await new Promise<void>(resolve => server.listen(PORT, "127.0.0.1", resolve));
const address = server.address(); if (!address || typeof address !== "object") throw new Error("no address");
const origin = `http://127.0.0.1:${address.port}`, projectPath = `${origin}/projects/${project.project_id}`, plugin = `${projectPath}/api/plugins/io.molis.work.coding`;
const call = async <T = any>(url: string, method = "GET", body?: unknown): Promise<T> => {
  const response = await realFetch(url, { method, headers: { "content-type": "application/json", origin, "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID() }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text(); if (!response.ok) throw new Error(`${method} ${url} → ${response.status} ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
};
log("home", home, "project", projectPath);

// Model keys live in Connectors; the provider refers to the connection.
const key = await call(`${origin}/api/settings/connectors/connections`, "POST", { service_id: "model-api", display_name: "Bench key", token: "bench-placeholder-not-a-secret" });
await call(`${origin}/api/settings/models/bench`, "POST", { display_name: "Bench", base_url: "https://1.1.1.1", api_format: "anthropic-messages", enabled: true, prompt_cache: "off",
  models: [{ model_id: "bench-model", enabled: true, context_tokens: 200_000 }], connection_id: key.connection.connection_id });
const grant = await call(`${projectPath}/api/workspaces`, "POST", { workspace_path: workspace, user_confirmed: true });
const workspaceId: string = grant.workspace?.workspace_id ?? grant.workspace_id ?? grant.workspaces?.[0]?.workspace_id;
if (!workspaceId) throw new Error("workspace grant: " + JSON.stringify(grant).slice(0, 400));
const created = await call(`${plugin}/sessions`, "POST", {});
const sessionId: string = created.session?.session_id ?? created.session_id;
if (!sessionId) throw new Error("session: " + JSON.stringify(created).slice(0, 400));
log("workspace", workspaceId, "session", sessionId);

const callRound = (round: number, ...args: Parameters<typeof call>) => call(...args).catch(error => { throw new Error(`round ${round} (${modelCalls} model calls, ${compactions} compactions): ${error.message}`); });
const stateOf = async () => (await call(`${plugin}/state`)).sessions.find((session: { session_id: string }) => session.session_id === sessionId)?.state as string;
const started = Date.now();
for (let round = 1; round <= ROUNDS; round++) {
  await callRound(round, `${plugin}/sessions/${sessionId}/runs`, "POST", { task: `第 ${round} 轮：核对 alpha 和 beta 的系数是否一致`, intent: "discuss", provider_id: "bench", model_id: "bench-model",
    workspace_id: workspaceId, methods: [], mcp_tools: [], mcp_sources: [], materials: [] });
  for (;;) { const state = await stateOf(); if (["done", "failed", "stopped", "idle"].includes(state)) { if (state !== "done") { const view = await call(`${plugin}/sessions/${sessionId}`); const run = view.runs.at(-1); throw new Error(`round ${round} ended ${state}: ${run?.phase} ${run?.stop_reason ?? view.error ?? ""} · model calls ${modelCalls}`); } break; } await new Promise(r => setTimeout(r, 60)); }
  if (round % 25 === 0) log(`built ${round}/${ROUNDS} rounds · ${modelCalls} model calls (${compactions} compactions) · ${Math.round((Date.now() - started) / 1000)}s`);
}
log("tools offered:", toolNames.join(","));

// Measure what one refresh costs on the server and over the wire, as the page asks for it.
const measureRead = async (label: string, path: string) => {
  const times: number[] = []; let bytes = 0;
  for (let i = 0; i < 5; i++) { const at = performance.now(); const response = await realFetch(path, { headers: { origin } }); const text = await response.text(); times.push(performance.now() - at); bytes = text.length; }
  times.sort((a, b) => a - b); log(`${label}: ${Math.round(bytes / 1024)} KB · median ${Math.round(times[2]!)} ms`);
  return { bytes, median: times[2]! };
};
const readUrl = `${plugin}/sessions/${sessionId}` + (process.env.READ_QUERY ?? "?window=6");
const read = await measureRead("session read (first)", readUrl);
// A refresh as the open page sends it: the fingerprints of what it already holds.
const held = await (await realFetch(readUrl, { headers: { origin } })).json();
const steadyUrl = readUrl + (held.earlier_fingerprint ? `&earlier=${held.earlier_fingerprint}` : "") + (held.runs?.some((run: { fingerprint?: string }) => run.fingerprint) ? `&known=${held.runs.map((run: { fingerprint: string }) => run.fingerprint).join(",")}` : "");
const steady = await measureRead("session read (refresh, nothing changed)", steadyUrl);

if (process.env.NO_BROWSER) { log("server kept running at", `${projectPath}/?surface=coding`, "token", token); await new Promise(() => {}); }
// And what the page does with it: first paint of the session, DOM size, scrolling from the bottom to the top.
const browser = await ChromeHarness.start(await mkdtemp(join(tmpdir(), "molis-long-session-chrome-")));
if (!browser) throw new Error("Chrome is required");
const page = await browser.page();
await page.command("Page.enable"); await page.command("Network.enable");
await page.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await page.command("Page.addScriptToEvaluateOnNewDocument", { source: "performance.setResourceTimingBufferSize(100000)" });
await page.command("Page.navigate", { url: `${projectPath}/?surface=coding` });
await page.wait("document.querySelector('[data-plugin-strip] [data-plugin-id=\"coding\"]')");
// Page work can outlast one CDP call, so it runs in the page and is collected when done.
const inPage = async <T,>(script: string, seconds = 180): Promise<T> => {
  await page.evaluate(`window.__bench=undefined;(${script})().then(value=>{window.__bench={value};},error=>{window.__bench={error:String(error)};});0`);
  for (const until = Date.now() + seconds * 1000; Date.now() < until; await new Promise(r => setTimeout(r, 250))) {
    const done = await page.evaluate<{ value?: T; error?: string } | null>("window.__bench||null");
    if (done) { if (done.error) throw new Error(done.error); return done.value as T; }
  }
  throw new Error("page work timed out");
};
// From opening Coding on the rail to the session's last round on screen, the way a person gets there.
const opened = await inPage<{ ms: number; session: number; sinceNavigation: number; sections: number }>(`async()=>{const at=performance.now();const until=Date.now()+Number(window.__benchWait||170000);
  const wait=(test)=>new Promise((resolve,reject)=>{const check=()=>{const value=test();if(value)return resolve(value);if(Date.now()>until)return reject(new Error('timeout: sessions='+document.querySelectorAll('[data-coding-session]').length+' sections='+document.querySelector('[data-coding-turns]')?.children.length));requestAnimationFrame(check);};check();});
  let clicked=0;await wait(()=>{const surface=document.querySelector('[data-work-surface="coding"]');if(!surface||surface.hidden){if(performance.now()-clicked>1500){clicked=performance.now();document.querySelector('[data-plugin-strip] [data-plugin-id="coding"]').click();}return false;}return document.querySelector('[data-coding-session]');});
  const listed=performance.now(),row=document.querySelector('[data-coding-session]');if(row.getAttribute('aria-current')!=='true')row.click();
  await wait(()=>document.querySelector('[data-coding-turns] > [data-run]:last-of-type .coding-run-footer'));
  return {ms:Math.round(performance.now()-at),session:Math.round(performance.now()-listed),sinceNavigation:Math.round(performance.now()),sections:document.querySelectorAll('[data-coding-turns] > [data-run]').length};}`);
log(`first open: ${opened.session} ms from choosing the session to its last round on screen · ${opened.ms} ms from the Coding rail · ${opened.sections} rounds in the page`);
await new Promise(r => setTimeout(r, 1500));
const dom = await page.evaluate<{ nodes: number; heap: number }>("({nodes:document.getElementsByTagName('*').length,heap:Math.round((performance.memory?.usedJSHeapSize||0)/1048576)})");
log(`DOM ${dom.nodes} elements · JS heap ${dom.heap} MB`);
// Everything the page pulls while the session sits idle, per endpoint (bodies as sent, before compression).
const traffic = await inPage<Record<string, number>>(`async()=>{performance.clearResourceTimings();await new Promise(r=>setTimeout(r,10000));const sums={};
  for(const entry of performance.getEntriesByType('resource')){const path=new URL(entry.name).pathname.replace(/\\/projects\\/[^/]+/,'').replace(/sessions\\/[^/]+/,'sessions/:id');sums[path]=(sums[path]||0)+entry.encodedBodySize;}return sums;}`);
const wire = Object.values(traffic).reduce((sum, value) => sum + value, 0);
log(`idle refresh traffic: ${Math.round(wire / 1024)} KB over 10 s`, JSON.stringify(Object.fromEntries(Object.entries(traffic).map(([path, bytes]) => [path, Math.round(bytes / 1024) + " KB"]))));
// PROFILE=1 records where the page spends the scroll: the heaviest functions by their own time.
if (process.env.PROFILE) { await page.command("Profiler.enable"); await page.command("Profiler.setSamplingInterval", { interval: 200 }); await page.command("Profiler.start"); }
const scroll = await inPage<{ frames: number; slow: number; worst: number; longTasks: number; loadedRounds: number; topRound?: string; topRoundLater?: string; scrollTop: number; scrollTopLater: number }>(`async()=>{
  const turns=document.querySelector('[data-coding-turns]');let longTasks=0;const observer=new PerformanceObserver(list=>{longTasks+=list.getEntries().length;});observer.observe({entryTypes:['longtask']});
  const gaps=[];let last=performance.now();const until=performance.now()+8000;
  await new Promise(resolve=>{const step=()=>{const now=performance.now();gaps.push(now-last);last=now;turns.scrollTop=Math.max(0,turns.scrollTop-600);if(now<until)requestAnimationFrame(step);else resolve();};requestAnimationFrame(step);});
  observer.disconnect();gaps.shift();
  // Where reading ended up: the round at the top of the view, then again a second later (a jump would change it).
  const top=()=>[...turns.querySelectorAll(':scope > [data-run]')].find(node=>node.getBoundingClientRect().bottom>turns.getBoundingClientRect().top)?.dataset.runIndex;
  const at=top(),offset=Math.round(turns.scrollTop);await new Promise(resolve=>setTimeout(resolve,1000));
  return {frames:gaps.length,slow:gaps.filter(gap=>gap>50).length,worst:Math.round(Math.max(...gaps)),longTasks,loadedRounds:document.querySelectorAll('[data-coding-turns] > [data-run]').length,
    topRound:at,topRoundLater:top(),scrollTop:offset,scrollTopLater:Math.round(turns.scrollTop)};}`);
log(`scroll up 8 s: ${scroll.frames} frames · ${scroll.slow} over 50 ms · worst ${scroll.worst} ms · ${scroll.longTasks} long tasks · ${scroll.loadedRounds} rounds loaded`);
if (process.env.PROFILE) {
  const { profile } = await page.command("Profiler.stop") as { profile: { nodes: Array<{ id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[]; positionTicks?: Array<{ line: number; ticks: number }> }>; samples: number[]; timeDeltas: number[] } };
  // Hot lines inside the heaviest functions, to tell rendering work from forced layout.
  const lines = new Map<string, number>();
  for (const node of profile.nodes) for (const tick of node.positionTicks ?? []) {
    const key = `${node.callFrame.functionName || "(anonymous)"}@${tick.line}`; lines.set(key, (lines.get(key) ?? 0) + tick.ticks);
  }
  log("scroll hot lines (ticks):", [...lines].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([key, ticks]) => `${key} ${ticks}`).join(" | "));
  const self = new Map<number, number>(); profile.samples.forEach((id, index) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[index] ?? 0)));
  const byName = new Map<string, number>();
  for (const node of profile.nodes) {
    const frame = node.callFrame, key = `${frame.functionName || "(anonymous)"} ${frame.url.replace(/^.*\//, "")}:${frame.lineNumber + 1}`;
    byName.set(key, (byName.get(key) ?? 0) + (self.get(node.id) ?? 0));
  }
  log("scroll profile (self ms):", [...byName].filter(([key]) => !/^\((idle|program|garbage collector)\)/.test(key)).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([key, us]) => `${key} ${Math.round(us / 1000)}`).join(" | "));
}
// DIAG=1: what one forced layout of the transcript costs, and how much of it the TaskBoard section accounts for.
if (process.env.DIAG) log("forced layout ms:", JSON.stringify(await inPage(`async()=>{
  const turns=document.querySelector('[data-coding-turns]'),board=document.querySelector('[data-coding-board]');
  const measure=()=>{const times=[];for(let i=0;i<5;i++){const probe=document.createElement('div');turns.prepend(probe);const t=performance.now();void turns.scrollHeight;times.push(performance.now()-t);probe.remove();}return times.map(Math.round);};
  const withBoard=measure(),boardInfo=board?{hidden:board.hidden,display:getComputedStyle(board).display,nodes:board.querySelectorAll('*').length,inTurns:turns.contains(board)}:null;
  board?.remove();const withoutBoard=measure();
  return {withBoard,withoutBoard,boardInfo,turnsNodes:turns.querySelectorAll('*').length};}`)));
await page.screenshot(join(home, "long-session.png"));
console.log(JSON.stringify({ rounds: ROUNDS, read, steady, opened, dom, idle_kb_10s: Math.round(wire / 1024), traffic, scroll, screenshot: join(home, "long-session.png") }));
await browser.close();
if (!process.env.KEEP) { server.close(); process.exit(0); }
log("server kept running at", `${projectPath}/?surface=coding`);
