import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";

/** One streamed provider turn through the production model adapter. */
function turn(text = "好的。", tool?: { name: string; input: object }): string {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture-model", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: tool ? { type: "tool_use", id: "question-call", name: tool.name, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: tool ? { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } : { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return events.join("");
}

const ASKED = { why: "约下周的复盘会，先确认几件事", questions: [
  { id: "title", type: "text", prompt: "会议标题" },
  { id: "minutes", type: "number", prompt: "时长", min: 15, max: 120, integer: true, unit: "分钟" },
  { id: "due", type: "date", prompt: "截止日期", required: false },
  { id: "at", type: "datetime", prompt: "开会时间", min: "2026-10-19T09:00+08:00" },
] };

/** The real Assistant over Todo, its model a local fixture that asks `asked` on its first turn and then says `done`. */
async function assistantAsking(t: TestContext, asked: object, done: string) {
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const { runWithMolisWorkHome, resetSecretStoreCache } = await import("@molis-ai/molis-work-storage");
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); });
  const requests: Array<{ tools?: Array<{ name: string; input_schema: { properties: { questions: { items: { properties: { type: { enum: string[] } } } } } } }>; messages?: unknown }> = [];
  const model = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(requests.length === 1 ? turn("", { name: "ask-user", input: asked }) : turn(done));
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const browser = await openGoalBrowser(t, true); if (!browser) return null;
  const { command, sessionId, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  await runWithMolisWorkHome(homeDirectory, () => withMolisWorkProjectCatalog({ homeDirectory }, catalog => {
    const connection = withConnectorConnections(homeDirectory, store => { const created = store.createToken({ serviceId: "model-api", displayName: "local-only", token: "fixture-local-model-key" }); store.assertTarget(created.connection_id, "model-api", "http://127.0.0.1:" + address.port); return created; });
    catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "local-only", display_name: "本机 HTTP 模型", base_url: "http://127.0.0.1:" + address.port, api_format: "anthropic-messages", models: [{ model_id: "fixture-model", enabled: true }] });
  }));
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/?openPlugin=todo" }, sessionId));
  await waitFor("document.querySelector('[data-assistant-input]')");
  await click("[data-assistant-input]"); await command("Input.insertText", { text: "约个复盘会" }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  return { ...browser, requests };
}

// specs/ai-interaction-experience T1 (AC-27-5, AC-27-6): the Assistant's card takes words, a number, a date and a date and time; a value past its
// limit is refused by the real Runtime beside its own field with the limit named, and the corrected answer continues the same work.
test("AC-27-5: the Assistant answers words, a number, a date and a date and time, and a refused field says its limit", { timeout: 240_000 }, async t => {
  const page = await assistantAsking(t, ASKED, "复盘会安排好了。"); if (!page) return;
  const { command, sessionId, evaluate, waitFor, click, requests } = page;
  const card = "[data-ix-question]";
  await waitFor(`document.querySelector('${card} [data-ix-field=w3] [data-ix-part=time]')`, 20_000);
  assert.deepEqual(requests[0]!.tools!.find(tool => tool.name === "ask-user")!.input_schema.properties.questions.items.properties.type.enum,
    ["choice", "text", "number", "date", "datetime", "reference"], "AC-27-1: the provider is offered what the card draws");
  const fill = (selector: string, value: string) => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.focus(); node.value = ${JSON.stringify(value)};
    node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const evidence = reviewEvidenceUrl("ai-interaction/"); await mkdir(evidence, { recursive: true });
  const shot = async (name: string, width: number, scheme: "light" | "dark") => {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] }, sessionId);
    await evaluate(`document.querySelector('${card}').scrollIntoView({ block: 'center' })`);
    await waitFor(`document.getAnimations().every(animation => animation.playState !== 'running' || animation.effect?.getTiming().iterations === Infinity)`, 5_000);
    await writeFile(new URL(`assistant-typed-question-${name}.png`, evidence), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  };
  const views = async (state: string) => { await shot(`${state}-light`, 1440, "light"); await shot(`${state}-dark`, 1440, "dark"); await shot(`${state}-390`, 390, "light");
    await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] }, sessionId); };

  await fill(`${card} [data-ix-field=t0] input`, "Q4 发布复盘");
  await fill(`${card} [data-ix-field=n1] input`, "240");
  await fill(`${card} [data-ix-field=w3] [data-ix-part=date]`, "2026-10-23");
  await fill(`${card} [data-ix-field=w3] [data-ix-part=time]`, "15:00");
  await views("filled");
  // AC-27-6: the unit is drawn beside the stepper, on one line with it.
  assert.deepEqual(await evaluate(`(() => { const row = document.querySelector('${card} [data-ix-field=n1] .mw-ix-number-row'), unit = row?.querySelector('.mw-ix-unit');
    return [unit?.textContent, unit && Math.abs(unit.getBoundingClientRect().top + unit.getBoundingClientRect().height / 2 - row.querySelector('.mw-ix-number').getBoundingClientRect().top - row.querySelector('.mw-ix-number').getBoundingClientRect().height / 2) < 4]; })()`), ["分钟", true]);
  await click(`${card} [data-ix-action=answer]`);
  await waitFor(`document.querySelector('${card} [data-ix-field=n1] [data-ix-error]')?.textContent === '不能超过 120 分钟'`, 15_000);
  const refused = await evaluate<{ invalid: string | null; focused: boolean; others: string[] }>(`(() => { const node = document.querySelector('${card}'), field = node.querySelector('[data-ix-field=n1]');
    return { invalid: field.querySelector('input').getAttribute('aria-invalid'), focused: field.contains(document.activeElement),
      others: [...node.querySelectorAll('[data-ix-error]:not([hidden])')].map(line => line.closest('[data-ix-field]').dataset.ixField) }; })()`);
  assert.deepEqual(refused, { invalid: "true", focused: true, others: ["n1"] }, "the refused field is marked and focused; the others stay quiet");
  assert.equal(await evaluate(`document.querySelector('${card} [data-ix-field=t0] input').value`), "Q4 发布复盘", "what the person wrote is kept");
  assert.equal(requests.length, 1, "a refused answer starts no provider call");
  await views("refused");

  await fill(`${card} [data-ix-field=n1] input`, "45");
  await click(`${card} [data-ix-action=answer]`);
  for (let attempt = 0; requests.length < 2 && attempt < 300; attempt++) await new Promise(resolve => setTimeout(resolve, 50));
  const told = JSON.stringify(requests[1]?.messages ?? "");
  for (const part of ["Q4 发布复盘", "45", "2026-10-23T15:00"]) assert.ok(told.includes(part), `the provider hears ${part}`);
  await waitFor("document.querySelector('[data-assistant-thread]')?.textContent.includes('复盘会安排好了。')", 15_000);
});

// D34: a questionnaire whose one question asks for words is a free-text question, so the composer's chip answers it too.
test("AC-27-5, D34: one text question is answered from the composer, and the run hears the words", { timeout: 240_000 }, async t => {
  const page = await assistantAsking(t, { why: "给复盘会起个标题", questions: [{ id: "title", type: "text", prompt: "会议标题" }] }, "标题记下了。"); if (!page) return;
  const { command, sessionId, evaluate, waitFor, click, requests } = page;
  await waitFor("document.querySelector('[data-ix-question] [data-ix-field=t0]') && !document.querySelector('[data-assistant-answer]').hidden", 20_000);
  assert.equal(await evaluate("document.querySelector('[data-assistant-answer]').textContent"), "回答上面的问题", "the default is to answer it");
  await click("[data-assistant-input]"); await command("Input.insertText", { text: "Q4 发布复盘" }, sessionId);
  await click("[data-assistant-send]");
  for (let attempt = 0; requests.length < 2 && attempt < 300; attempt++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(JSON.stringify(requests[1]?.messages ?? "").includes("Q4 发布复盘"), "the words answer the question");
  await waitFor("document.querySelector('[data-assistant-thread]')?.textContent.includes('标题记下了。')", 15_000);
  assert.equal(await evaluate("document.querySelector('[data-assistant-answer]').hidden"), true, "nothing waits, so there is no choice");
});

// T2 (AC-28-2, AC-28-3, AC-28-4, AC-28-6): a reference question lists nothing until the person types; the search offers this project's
// Goals as their owner has them, a pick is a chip, and the run hears the Goal under its owner's title.
test("AC-28: the Assistant's reference question finds a Goal by name, and the run hears the Goal its owner names", { timeout: 240_000 }, async t => {
  const asked = { why: "复盘会挂在哪个 Goal 下", questions: [{ id: "goal", type: "reference", prompt: "关联的 Goal", refKinds: ["goal"], help: "输入 Goal 的名字" }] };
  const page = await assistantAsking(t, asked, "挂好了。"); if (!page) return;
  const { command, sessionId, evaluate, waitFor, click, requests } = page;
  const card = "[data-ix-question]", query = `${card} [data-ix-field=r0] [data-ix-ref-query]`, list = `${card} [data-ix-field=r0] [role=listbox]`;
  await waitFor(`document.querySelector('${query}')`, 20_000);
  assert.equal(await evaluate(`document.querySelectorAll('${card} [data-ix-ref-option]').length`), 0, "AC-28-2: nothing is offered before the person searches");
  const evidence = reviewEvidenceUrl("ai-interaction/"); await mkdir(evidence, { recursive: true });
  const shot = async (name: string, width: number, scheme: "light" | "dark") => {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] }, sessionId);
    await evaluate(`document.querySelector('${card}').scrollIntoView({ block: 'center' })`);
    await waitFor(`document.getAnimations().every(animation => animation.playState !== 'running' || animation.effect?.getTiming().iterations === Infinity)`, 5_000);
    await writeFile(new URL(`assistant-reference-question-${name}.png`, evidence), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  };
  const views = async (state: string) => { await shot(`${state}-light`, 1440, "light"); await shot(`${state}-dark`, 1440, "dark"); await shot(`${state}-390`, 390, "light");
    await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] }, sessionId); };
  await views("empty");
  // The search box is an input group: focused, the copper edge and halo sit on the group once, not again on the input inside it.
  await evaluate(`document.querySelector('${query}').focus()`);
  const ring = await evaluate<{ focused: boolean; inner: string; innerEdge: string; outer: string; outerEdge: string }>(`(() => {
    const input = document.querySelector('${query}'), inner = getComputedStyle(input), outer = getComputedStyle(input.closest('.mw-input-group'));
    return { focused: input.matches(':focus-visible'), inner: inner.boxShadow, innerEdge: inner.borderTopWidth + ' ' + inner.borderTopStyle, outer: outer.boxShadow, outerEdge: outer.borderTopColor };
  })()`);
  assert.ok(ring.focused, "the search box has keyboard focus");
  assert.equal(ring.inner, "none", "no halo on the input inside the group");
  assert.match(ring.innerEdge, /^0px|none$/, "no edge on the input inside the group");
  assert.notEqual(ring.outer, "none", "the group carries the halo");
  // The project's search may still be indexing its Goals on a fresh Home: type again until they are found.
  for (let attempt = 0; attempt < 20 && !(await evaluate<boolean>(`!document.querySelector('${list}').hidden`)); attempt++) {
    await evaluate(`(() => { const input = document.querySelector('${query}'); input.focus(); input.value = ''; })()`);
    await command("Input.insertText", { text: "可信" }, sessionId);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  await waitFor(`!document.querySelector('${list}').hidden`, 10_000);
  const offered = await evaluate<Array<{ value: string; label: string }>>(`[...document.querySelectorAll('${list} [role=option]')].map(o => ({ value: o.dataset.ixRefOption, label: o.dataset.label }))`);
  assert.ok(offered.length > 0 && offered.every(option => option.value.startsWith("goal ")), "AC-28-2: only Goals, the kind the question asked for");
  const goal = offered.find(option => option.label === "让每项工作都有可信的完成依据");
  assert.ok(goal, "the Goal is offered under its own title");
  assert.match(await evaluate<string>(`document.querySelector('${query}').getAttribute('aria-expanded')`), /true/);
  await views("results");
  // AC-28-6: the keyboard picks: down to the first result, Enter.
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 }, sessionId);
  const first = await evaluate<string>(`document.querySelector('${list} [aria-selected=true]').dataset.ixRefOption`);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await waitFor(`document.querySelector('${card} [data-ix-field=r0] [data-ix-reference]')?.dataset.ixReference === ${JSON.stringify(first)}`);
  await views("picked");
  await click(`${card} [data-ix-action=answer]`);
  for (let attempt = 0; requests.length < 2 && attempt < 300; attempt++) await new Promise(resolve => setTimeout(resolve, 50));
  const told = JSON.stringify(requests[1]?.messages ?? "");
  assert.ok(told.includes(first.slice("goal ".length)), "AC-28-4: the run hears the picked Goal");
  await waitFor("document.querySelector('[data-assistant-thread]')?.textContent.includes('挂好了。')", 15_000);
});
