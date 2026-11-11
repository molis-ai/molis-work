import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { asideReply } from "./fixtures/ending-review.js";
import { CURRENT_WORK } from "./fixtures/assistant-current-work.js";

/** One streamed model turn: some words, then (optionally) one tool call. */
function turn(text: string, tool?: { name: string; input: unknown }): string {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: randomUUID(), type: "message", role: "assistant", model: "fixture-model", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  let index = 0;
  if (text) {
    emit("content_block_start", { index, content_block: { type: "text", text: "" } });
    emit("content_block_delta", { index, delta: { type: "text_delta", text } });
    emit("content_block_stop", { index }); index++;
  }
  if (tool) {
    emit("content_block_start", { index, content_block: { type: "tool_use", id: randomUUID(), name: tool.name, input: {} } });
    emit("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } });
    emit("content_block_stop", { index });
  }
  emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return events.join("");
}

const read = (capability_id: string, input: unknown = {}) => ({ name: "read-capability", input: { capability_id, version: 1, provider_id: "io.molis.work.goals", input } });
const P = "[data-assistant-panel] .assistant-round";
const LINES = `${P} [data-entry^="a:"]`;
const GROUP = `${P} > details.assistant-steps`;

// FSS-35/36/39: another real Settings document commits the language while this conversation keeps its reading state.
async function checkStepLanguageRoundTrip(b: NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>) {
  const before = await b.evaluate(`fetch('/api/assistant/works/' + ${CURRENT_WORK}).then(r => r.json()).then(v => v.rounds.flatMap(r => r.activity))`);
  await b.evaluate(`void (() => {
    const group = window.__group, raw = window.__failed.querySelector('.assistant-activity-raw'); raw.open = true;
    raw.querySelector('summary').focus();
    window.__stepLanguage = { body: document.body, group, summary: group.firstElementChild, steps: [...group.querySelectorAll('[data-entry^="a:"]')],
      raw, diagnostic: raw.lastElementChild, text: raw.lastElementChild.textContent, focused: document.activeElement };
  })()`);
  const businessWrites: string[] = [];
  const stop = b.on("Network.requestWillBeSent", (event, session) => {
    const request = event.request as { method: string; url: string };
    if (session === b.sessionId && request.method === "POST" && /\/api\/(?:assistant|actions)\//u.test(new URL(request.url).pathname)) businessWrites.push(request.url);
  });
  const { targetId } = await b.command<{ targetId: string }>("Target.createTarget", { url: "about:blank", background: true });
  try {
    const { sessionId } = await b.command<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
    await b.command("Page.enable", {}, sessionId);
    await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/settings/appearance" }, sessionId), sessionId);
    for (const locale of ["en", "zh"] as const) {
      const clicked = await b.command<{ result: { value: boolean }; exceptionDetails?: unknown }>("Runtime.evaluate", { awaitPromise: true, returnByValue: true,
        expression: `(async () => { const until = Date.now() + 15000; while (Date.now() < until) {
          const link = document.querySelector('a[data-ui-language=${locale}]'); if (link && link.getClientRects().length) { link.click(); return true; }
          await new Promise(resolve => setTimeout(resolve, 40)); } return false; })()` }, sessionId);
      assert.equal(clicked.exceptionDetails, undefined); assert.equal(clicked.result.value, true);
      await b.waitFor(`document.documentElement.lang === '${locale === "en" ? "en" : "zh-CN"}'`, 25000);
      assert.deepEqual(await b.evaluate(`(() => { const old = window.__stepLanguage;
        return [old.body === document.body, old.group === document.querySelector('${GROUP}'), old.summary === old.group.firstElementChild,
          old.steps.every((step, index) => step === old.group.querySelectorAll('[data-entry^="a:"]')[index]),
          old.raw === window.__failed.querySelector('.assistant-activity-raw'), old.diagnostic === old.raw.lastElementChild,
          old.raw.lastElementChild.textContent === old.text, document.activeElement === old.focused,
          old.group.open, window.__first.open, window.__failed.open, old.raw.open, old.diagnostic.matches('[translate=no]'),
          window.__first.querySelector('.assistant-activity-detail > p > span:last-child').matches('[translate=no]')]; })()`), Array(14).fill(true));
      assert.equal(await b.evaluate("window.__stepLanguage.summary.textContent"), locale === "en"
        ? "Read Goals, look up capabilities · 4 steps · 1 did not finish" : "读取 Goals、查找能力 · 4 步 · 1 步没有完成");
      assert.deepEqual(await b.evaluate(`[...document.querySelectorAll(${JSON.stringify(LINES)})].map(node => (node.matches('details') ? node.firstElementChild : node).textContent)`), locale === "en"
        ? ["Read Goals · 读取回收站", "Read Goals · 读取目标正文 — Not finished", "Looked up capabilities Goal", "Looked up capabilities Todo"]
        : ["已读取 Goals · 读取回收站", "读取 Goals · 读取目标正文 — 没有完成", "已查找能力 Goal", "已查找能力 Todo"]);
      assert.equal(await b.evaluate("window.__stepLanguage.raw.firstElementChild.textContent"), locale === "en" ? "Original message" : "原始说明");
    }
    assert.deepEqual(await b.evaluate(`fetch('/api/assistant/works/' + ${CURRENT_WORK}).then(r => r.json()).then(v => v.rounds.flatMap(r => r.activity))`), before);
    assert.deepEqual(businessWrites, []);
  } finally { stop(); await b.command("Target.closeTarget", { targetId }).catch(() => undefined); }
}

async function openScriptedAssistant(t: TestContext, script: Array<() => string | Promise<string>>) {
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const { runWithMolisWorkHome, resetSecretStoreCache } = await import("@molis-ai/molis-work-storage");
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); });
  let step = 0;
  const model = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    // A round that changed nothing has its ending reviewed (D1②): answered aside, without spending a scripted turn.
    const review = asideReply(raw);
    if (review) { res.writeHead(200, { "content-type": "text/event-stream" }); res.end(turn(review)); return; }
    const body = await script[Math.min(step++, script.length - 1)]();
    res.writeHead(200, { "content-type": "text/event-stream" }); res.end(body);
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const prepareHome = async (homeDirectory: string) => {
    await runWithMolisWorkHome(homeDirectory, () => withMolisWorkProjectCatalog({ homeDirectory }, catalog => {
      const connection = withConnectorConnections(homeDirectory, store => { const created = store.createToken({ serviceId: "model-api", displayName: "local-only", token: "fixture-local-model-key" }); store.assertTarget(created.connection_id, "model-api", `http://127.0.0.1:${address.port}`); return created; });
      catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "local-only", display_name: "本机 HTTP 模型", base_url: `http://127.0.0.1:${address.port}`, api_format: "anthropic-messages", models: [{ model_id: "fixture-model", enabled: true }] });
    }));
  };
  return openGoalBrowser(t, true, undefined, undefined, undefined, undefined, { prepareHome });
}

// VUX-13: what a round did reads as one short line per run of steps that says what was done to what, opens to each step
// and to the technical part behind it (the capability called, what came back); the group and each step keep their node,
// open state and focus while their state changes in place, and after the round ends. Every word comes from the activity.
test("VUX-13: a round's steps say what they did to what, open to where they came from, and stay as the person opened them while the round goes on", { timeout: 180_000 }, async t => {
  const holdA = Promise.withResolvers<void>(), atA = Promise.withResolvers<void>(), holdB = Promise.withResolvers<void>(), atB = Promise.withResolvers<void>();
  const script = [
    () => turn("我先看一下回收站。", read("goals.trash.list")),
    async () => { atA.resolve(); await holdA.promise; return turn("", read("goals.document.read", { nope: true })); },
    () => turn("", { name: "find-capabilities", input: { query: "Goal" } }),
    async () => { atB.resolve(); await holdB.promise; return turn("", { name: "find-capabilities", input: { query: "Todo" } }); },
    () => turn("看完了：项目里有两个 Goal。"),
  ];
  t.after(() => { holdA.resolve(); holdB.resolve(); });
  const browser = await openScriptedAssistant(t, script); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;

  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("Boolean(document.querySelector('[data-assistant-composer] .mw-composer__input'))");
  await click("[data-assistant-composer] .mw-composer__input");
  await command("Input.insertText", { text: "看看这个项目有哪些 Goal" }, sessionId);
  const enter = async (text?: string, modifiers = 0) => {
    // With its text a key press activates what has focus, as a real Enter does (a summary opens on it).
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers, ...(text ? { text } : {}) }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers }, sessionId);
  };
  // K3 (UIC-05): the unified composer sends on ⌘↵ / Ctrl+↵; Enter is a new line.
  await enter(undefined, 2);
  const texts = () => evaluate<string[]>(`[...document.querySelectorAll(${JSON.stringify(LINES)})].map(node => (node.matches('details') ? node.querySelector(':scope > summary') : node).textContent)`);

  // One step done: it stands alone, and what it called opens from its own line.
  await atA.promise;
  await waitFor(`document.querySelectorAll(${JSON.stringify(LINES)}).length === 1 && document.querySelector(${JSON.stringify(LINES)}).dataset.state === 'completed'`, 15_000);
  assert.deepEqual(await texts(), ["已读取 Goals · 读取回收站"]);
  assert.ok(await evaluate<boolean>(`(() => { const one = document.querySelector(${JSON.stringify(LINES)}); window.__first = one;
    return one.matches('details') && !one.open && !one.hasAttribute('title'); })()`), "a step with a source opens from its own line, not from a hover title");
  // The explanation before the call is ordinary text, not folded into the steps.
  assert.ok(await evaluate<boolean>(`[...document.querySelectorAll('${P} > .assistant-msg--assistant')].some(node => node.textContent.includes('我先看一下回收站'))`));
  await click(`${LINES} > summary`);
  assert.ok(await evaluate<boolean>("window.__first.open"));
  assert.match(await evaluate<string>("window.__first.querySelector('.assistant-activity-detail').textContent"), /goals\.trash\.list/);
  await evaluate("window.__first.querySelector('summary').focus()");
  holdA.resolve();

  // Three steps: they join one group that says what was done to what; the step the person opened is the same node, still
  // open and focused, and the group formed around it opens with it rather than hiding it.
  await atB.promise;
  await waitFor(`document.querySelectorAll(${JSON.stringify(LINES)}).length === 3 && document.querySelector('${GROUP}')?.dataset.state === 'failed'`, 15_000);
  assert.equal(await evaluate<string>(`document.querySelector('${GROUP} > summary').textContent`), "读取 Goals、查找能力 · 3 步 · 1 步没有完成");
  assert.deepEqual(await evaluate(`(() => { const first = window.__first;
    return { connected: first.isConnected, inGroup: first.parentElement.matches('details.assistant-steps > .assistant-steps-body'), groupOpen: first.closest('details.assistant-steps').open, open: first.open, focused: document.activeElement === first.querySelector('summary') }; })()`),
    { connected: true, inGroup: true, groupOpen: true, open: true, focused: true });
  assert.deepEqual(await texts(), ["已读取 Goals · 读取回收站", "读取 Goals · 读取目标正文 — 没有完成", "已查找能力 Goal"]);
  // The step that did not finish keeps why on demand, by keyboard: what it called and what came back.
  await evaluate(`(() => { window.__group = document.querySelector('${GROUP}'); window.__failed = window.__group.querySelector('[data-entry^="a:"][data-state="failed"]');
    window.__failed.querySelector('summary').focus(); })()`);
  assert.equal(await evaluate<boolean>("window.__failed.matches('details') && !window.__failed.hasAttribute('title')"), true);
  await enter("\r");
  assert.ok(await evaluate<boolean>("window.__failed.open"), "Enter on a step opens what is behind it");
  const behind = await evaluate<string>("window.__failed.querySelector('.assistant-activity-detail').textContent");
  assert.match(behind, /goals\.document\.read/);
  assert.match(behind, /actions\.input_invalid/);
  assert.ok(await evaluate<boolean>("window.__group.open"));
  holdB.resolve();

  // The round ends: the summary is updated in place; the group and every step the person opened are the same nodes, still open; nothing is shown twice.
  await waitFor(`document.querySelector('[data-assistant-panel]').textContent.includes('项目里有两个 Goal') && document.querySelector('${P} [data-entry="status"]').hidden`, 15_000);
  const settled = await evaluate<{ group: boolean; first: boolean; failed: boolean; summary: string; entries: number; unique: number; groups: number }>(`(() => {
    const entries = [...document.querySelectorAll('${P} [data-entry^="a:"]')].map(node => node.dataset.entry);
    return { group: window.__group.isConnected && window.__group.open, first: window.__first.isConnected && window.__first.open, failed: window.__failed.isConnected && window.__failed.open,
      summary: window.__group.querySelector('summary').textContent, entries: entries.length, unique: new Set(entries).size, groups: document.querySelectorAll('${GROUP}').length }; })()`);
  assert.deepEqual(settled, { group: true, first: true, failed: true, summary: "读取 Goals、查找能力 · 4 步 · 1 步没有完成", entries: 4, unique: 4, groups: 1 });
  assert.deepEqual(await texts(), ["已读取 Goals · 读取回收站", "读取 Goals · 读取目标正文 — 没有完成", "已查找能力 Goal", "已查找能力 Todo"]);
  // Every line is the activity's own record: the same steps, in order, as the Host keeps them; no step is made up.
  const activity = await evaluate<Array<{ verb: string; state: string }>>(`fetch('/api/assistant/works/' + ${CURRENT_WORK}).then(r => r.json()).then(v => v.rounds.flatMap(r => r.activity))`);
  assert.deepEqual(activity.map(item => item.verb + ":" + item.state), ["read:completed", "read:failed", "lookup:completed", "lookup:completed"]);
  // A step with nothing behind it is a plain line: no control that opens nothing.
  assert.equal(await evaluate<number>(`[...document.querySelectorAll(${JSON.stringify(LINES)})].filter(node => node.matches('details') && !node.querySelector('.assistant-activity-detail').textContent).length`), 0);

  // The group opens to its natural height like every collapsible (disclosure.ts): closed, then opened, its steps grow from
  // nothing to their own height over the frames, never at once.
  await evaluate("window.__group.open = false"); await new Promise((resolve) => setTimeout(resolve, 500));
  const opening = await evaluate<{ heights: number[]; transition: string }>(`new Promise((done) => { const group = window.__group, body = group.querySelector('.assistant-steps-body'), heights = [];
    group.open = true; const start = performance.now(); const step = () => { heights.push(Math.round(body.getBoundingClientRect().height)); if (performance.now() - start < 450) requestAnimationFrame(step); else done({ heights, transition: getComputedStyle(group, '::details-content').transitionProperty }); }; requestAnimationFrame(step); })`);
  assert.match(opening.transition, /grid-template-rows/);
  const full = opening.heights.at(-1)!;
  assert.ok(full > 40 && opening.heights[0]! < full && opening.heights.some((height) => height > opening.heights[0]! && height < full), `the group grows to its height over frames: ${opening.heights.join(",")}`);
  assert.ok(opening.heights.every((height, index) => index === 0 || height >= opening.heights[index - 1]!), "it only grows while it opens");

  await checkStepLanguageRoundTrip(browser);

  // In English the summary is the same sentence, in English.
  const work = await evaluate<string>(CURRENT_WORK);
  await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=en&next=${encodeURIComponent(`/projects/${projectId}/`)}` }, sessionId));
  await waitFor("Boolean(document.querySelector('[data-assistant-composer] .mw-composer__input'))");
  await evaluate(`document.dispatchEvent(new CustomEvent('molis:assistant-open', { detail: { work_id: ${JSON.stringify(work)} } }))`);
  await waitFor(`Boolean(document.querySelector('${GROUP} > summary')?.textContent)`, 15_000);
  assert.equal(await evaluate<string>(`document.querySelector('${GROUP} > summary').textContent`), "Read Goals, look up capabilities · 4 steps · 1 did not finish");
  // Each line says its step whole in English too: done in the past tense, a step that did not finish by its verb, each line
  // starting with a capital (before: "read Goals", "look up capabilities Goal": a Chinese prefix translated to nothing).
  const english = await texts();
  assert.equal(english.length, 4);
  assert.match(english[0]!, /^Read Goals/);
  assert.match(english[1]!, /^Read Goals .* — /);
  assert.deepEqual(english.slice(2), ["Looked up capabilities Goal", "Looked up capabilities Todo"]);
});

// FSS-36/39: the actual work view has three distinct operations, not only the two-phrase VUX-13 case above.
test("FSS-36 FSS-39: an Assistant group abbreviates three real operations and keeps its exact failed-step count in both languages", { timeout: 90_000 }, async t => {
  const b = await openScriptedAssistant(t, [
    () => turn("", read("goals.trash.list")),
    () => turn("", read("goals.document.read", { nope: true })),
    () => turn("", { name: "find-capabilities", input: { query: "Goal" } }),
    () => turn("", { name: "suggest-action", input: { capability_id: "todo.items.create", version: 1, provider_id: "io.molis.work.todo", title: "待办原文", summary: "只准备操作卡", input: { title: "原文待办" } } }),
    () => turn("已核对三个操作。"),
  ]);
  if (!b) return;
  const path = `/projects/${b.projectId}/`;
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + path }, b.sessionId));
  await b.waitFor("!!document.querySelector('[data-assistant-composer] .mw-composer__input')");
  await b.click("[data-assistant-composer] .mw-composer__input");
  await b.command("Input.insertText", { text: "核对能力和工具" }, b.sessionId);
  await b.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 2 }, b.sessionId);
  await b.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 2 }, b.sessionId);
  await b.waitFor(`document.querySelector('${P} [data-entry="status"]')?.hidden && document.querySelectorAll(${JSON.stringify(LINES)}).length === 4`, 20000);
  assert.equal(await b.evaluate(`document.querySelector('${GROUP} > summary').textContent`), "读取 Goals、查找能力等 · 4 步 · 1 步没有完成");
  const work = await b.evaluate<string>(CURRENT_WORK);
  const facts = `fetch('/api/assistant/works/' + ${JSON.stringify(work)}).then(r => r.json()).then(v => v.rounds.flatMap(r => r.activity))`;
  const before = await b.evaluate<Array<{ verb: string; state: string }>>(facts);
  assert.deepEqual(before.map(item => item.verb + ":" + item.state), ["read:completed", "read:failed", "lookup:completed", "suggest:completed"]);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/locale?lang=en&next=" + encodeURIComponent(path) }, b.sessionId));
  await b.waitFor("!!document.querySelector('[data-assistant-composer] .mw-composer__input')");
  await b.evaluate(`document.dispatchEvent(new CustomEvent('molis:assistant-open', { detail: { work_id: ${JSON.stringify(work)} } }))`);
  await b.waitFor(`!!document.querySelector('${GROUP} > summary')?.textContent`);
  assert.equal(await b.evaluate(`document.querySelector('${GROUP} > summary').textContent`), "Read Goals, look up capabilities and more · 4 steps · 1 did not finish");
  assert.deepEqual(await b.evaluate(facts), before);
});
