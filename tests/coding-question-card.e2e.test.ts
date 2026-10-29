import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { asideReply } from "./fixtures/ending-review.js";

/** One streamed Anthropic-format model turn: text, or one tool call. */
function turn(text: string, tool?: { name: string; input: object }): string {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: tool ? { type: "tool_use", id: "call-1", name: tool.name, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: tool ? { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } : { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return events.join("");
}

const QUESTIONS = { why: "先确认要修哪一处。", questions: [
  { prompt: "先修哪一个？", options: [{ label: "登录", description: "影响所有人", recommended: true }, { label: "导出", description: "只影响报表" }] },
  { prompt: "顺手做什么？", required: false, multiple: true, options: [{ label: "补测试" }, { label: "写说明" }] },
] };

/** A Coding session in a seeded browser whose model asks `ask` on the round's first call and then goes on; the task is typed, not sent. */
async function openCoding(t: TestContext, ask: object) {
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const { runWithMolisWorkHome, resetSecretStoreCache } = await import("@molis-ai/molis-work-storage");
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); });
  const bodies: Array<{ tools?: Array<{ name: string; input_schema: { properties: { questions: { items: { properties: { options: { items: { type: string } }; type: { enum: string[] } } } } } } }>; messages?: unknown }> = [];
  const model = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    // A round that changed nothing has its ending reviewed (D1②): answered "nothing found" without spending a scripted turn.
    const review = asideReply(raw);
    if (review) { res.writeHead(200, { "content-type": "text/event-stream" }); res.end(turn(review)); return; }
    bodies.push(JSON.parse(raw));
    // The round's first call asks the person a typed questionnaire; the next one goes on with the answer.
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(bodies.length === 1 ? turn("", { name: "ask-user", input: ask }) : turn("好的，先修导出。"));
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const b = await openGoalBrowser(t, "seeded"); if (!b) return null;
  const { command, sessionId, homeDirectory } = b;
  const frame = await pluginFrameBrowser(t, b, "coding");
  const { click, evaluate, waitFor } = frame;
  await runWithMolisWorkHome(homeDirectory, () => withMolisWorkProjectCatalog({ homeDirectory }, catalog => {
    const connection = withConnectorConnections(homeDirectory, store => { const created = store.createToken({ serviceId: "model-api", displayName: "local-only", token: "fixture-local-model-key" }); store.assertTarget(created.connection_id, "model-api", `http://127.0.0.1:${address.port}`); return created; });
    catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "local-only", display_name: "本机", base_url: `http://127.0.0.1:${address.port}`, api_format: "anthropic-messages",
      models: [{ model_id: "fixture-plain", enabled: true }] });
  }));
  const workspace = join(homeDirectory, "coding-question-fixture");
  await mkdir(workspace, { recursive: true });
  await writeFile(join(workspace, "note.txt"), "release notes go in CHANGELOG.md\n");
  const fill = (selector: string, value: string) => evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.value=${JSON.stringify(value)};node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await b.navigate(() => command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/` }, sessionId));
  await b.click('.navigator-project-settings');
  await b.waitFor("!!document.querySelector('[data-directory-panel=project-settings] [data-settings-section=workspaces]')");
  await b.click('[data-directory-panel=project-settings] [data-settings-section=workspaces]');
  await b.waitFor("!!document.querySelector('[data-project-workspaces-add]') && !document.querySelector('[data-project-workspaces-refresh]').disabled");
  await b.evaluate(`(() => { const input = document.querySelector('[data-project-workspaces-add] [name=path]'); input.value = ${JSON.stringify(workspace)}; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await b.click('[data-project-workspaces-add] [type=submit]');
  await b.waitFor("document.querySelector('[data-project-workspaces-list]').textContent.includes('coding-question-fixture')");
  const coding = "[data-coding-workbench]";
  await b.click(`[data-plugin-strip] [data-plugin-id="coding"]`);
  await b.waitFor(`document.querySelector('[data-work-surface="coding"]')?.getBoundingClientRect().width > 100`);
  await b.waitFor("document.querySelector('[data-work-surface=coding]')?.dataset.uiClientState === 'ready'");
  await click(`${coding} [data-coding-new]`);
  await waitFor(`!document.querySelector('${coding} [data-coding-task]').disabled && document.querySelector('${coding} [data-coding-model]').options.length >= 1`);
  await fill(`${coding} [data-coding-model]`, JSON.stringify(["local-only", "fixture-plain"]));
  await fill(`${coding} [data-coding-intent]`, "discuss");
  await fill(`${coding} [data-coding-task]`, "登录和导出都坏了，先修哪个？");
  await waitFor(`!document.querySelector('${coding} [data-coding-send]').disabled`);
  return { ...b, ...frame, owner: b, coding, fill, bodies };
}

// specs/ai-interaction-experience A2: Coding shows a run's waiting question as the Host's shared question card (the same one as the
// Assistant's), keeps what the person picked with the session, and answers with it; the Runtime offers the typed choice contract.
test("AC-22: Coding answers a typed questionnaire through the shared question card", { timeout: 180_000 }, async t => {
  const opened = await openCoding(t, QUESTIONS); if (!opened) return;
  const { click, evaluate, waitFor, command, sessionId, coding, bodies } = opened;
  // What the page keeps with the session while the person picks.
  await evaluate(`(() => { window.__drafts = []; const original = window.fetch; window.fetch = async (...args) => {
    if (args[1] && typeof args[1].body === 'string' && args[1].body.includes('question_drafts')) window.__drafts.push(JSON.parse(args[1].body).question_drafts); return original(...args); }; })()`);
  await click(`${coding} [data-coding-send]`);
  // The card the Host drew is itself the element the page marks as Coding's question.
  const card = `${coding} [data-coding-question][data-ix-question]`;
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(card)}))`, 30_000);
  assert.equal(bodies[0]?.tools?.find(tool => tool.name === "ask-user")?.input_schema.properties.questions.items.properties.options.items.type, "object",
    "the Runtime offers the typed choice contract both surfaces draw");
  const shown = await evaluate<{ title: string; tag: string; descriptions: string[]; optional: boolean }>(`(() => { const node = document.querySelector(${JSON.stringify(card)});
    return { title: node.querySelector('h3').textContent, tag: node.querySelector('[data-ix-field="q0"] .mw-ix-tag')?.textContent || '',
      descriptions: [...node.querySelectorAll('[data-ix-field="q0"] .mw-ix-option__desc')].map(item => item.textContent),
      optional: Boolean(node.querySelector('[data-ix-field="q1"] .mw-ix-optional')) }; })()`);
  assert.deepEqual(shown, { title: "先确认要修哪一处。", tag: "推荐", descriptions: ["影响所有人", "只影响报表"], optional: true });
  assert.equal(await evaluate<boolean>(`Boolean(document.querySelector(${JSON.stringify(card)}).querySelector('[aria-checked="true"], [aria-pressed="true"]'))`), false,
    "nothing is picked for the person, not even the recommendation");
  // AC-25: beside the composer, a set of two questions is only a way to the card.
  assert.deepEqual(await evaluate<string[]>(`[...document.querySelectorAll('${coding} [data-coding-steps]:not([hidden]) [data-ix-step-label]')].map(step => step.textContent)`), ["去回答（2 题）"]);

  const evidence = reviewEvidenceUrl("ai-interaction/"); await mkdir(evidence, { recursive: true });
  await writeFile(new URL("coding-question-card.png", evidence), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  await click(`${card} [data-ix-field="q0"] [data-ix-option="1"]`);
  await click(`${card} [data-ix-field="q1"] [data-ix-option="0"]`);
  await waitFor(`window.__drafts.some(drafts => Object.values(drafts).some(values => JSON.stringify(values.q0) === '["1"]' && JSON.stringify(values.q1) === '["0"]'))`, 10_000);

  await click(`${card} [data-ix-action="answer"]`);
  for (let i = 0; i < 600 && bodies.length < 2; i++) await new Promise(resolve => setTimeout(resolve, 50));
  const next = JSON.stringify(bodies[1]?.messages ?? "");
  assert.match(next, /导出/, "the model hears the option the person picked");
  assert.match(next, /补测试/);
  // The answered card leaves (its receipt shows only until the page reads the run again) and the round goes on with the answer.
  await waitFor(`!document.querySelector('${coding} [data-coding-question]') && document.querySelector('${coding}').innerText.includes('好的，先修导出。')`, 15_000);
  await waitFor(`document.querySelector('${coding} [data-coding-steps]').hidden`, 10_000);
});

// specs/ai-interaction-experience AC-25 (first part): a single choice is answered from the row beside the composer, by pressing
// the card's own option and its submit (specs/context-program FLOW-01, FLOW-02); there is no second way to answer. AC-10-3: the
// press leaves focus on the step, and when the row is drawn again without it, focus goes to the composer, not to the page.
test("AC-25, AC-10-3: Coding's next step answers a single choice through the card's own controls and focus ends in the composer", { timeout: 180_000 }, async t => {
  const opened = await openCoding(t, { why: "先确认要修哪一处。", questions: [{ prompt: "先修哪一个？", options: [{ label: "登录", recommended: true }, { label: "导出" }] }] });
  if (!opened) return;
  const { click, evaluate, waitFor, coding, bodies } = opened;
  await click(`${coding} [data-coding-send]`);
  const steps = `${coding} [data-coding-steps]:not([hidden]) [data-ix-step-id]`;
  await waitFor(`document.querySelectorAll(${JSON.stringify(steps)}).length === 2`, 30_000);
  assert.deepEqual(await evaluate<string[]>(`[...document.querySelectorAll(${JSON.stringify(steps)})].map(step => step.querySelector('[data-ix-step-label]').textContent)`), ["登录（推荐）", "导出"]);
  // What the card sends when its own submit is pressed.
  await evaluate(`(() => { window.__answers = []; const original = window.fetch; window.fetch = async (...args) => {
    if (args[1] && typeof args[1].body === 'string' && args[1].body.includes('"kind":"answer"')) window.__answers.push(JSON.parse(args[1].body)); return original(...args); }; })()`);
  await click(`${steps}:nth-child(2)`);
  await waitFor(`window.__answers.length === 1`, 10_000);
  assert.equal(await evaluate<string>(`JSON.stringify(window.__answers[0].values)`), JSON.stringify({ q0: ["1"] }), "the card's own fields, with the option pressed");
  for (let i = 0; i < 600 && bodies.length < 2; i++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.match(JSON.stringify(bodies[1]?.messages ?? ""), /导出/, "the model hears the option pressed in the row");
  await waitFor(`!document.querySelector('${coding} [data-coding-question]') && document.querySelector('${coding} [data-coding-steps]').hidden`, 15_000);
  // AC-10-3: the mouse press put focus on the step, and the row was hidden under it.
  assert.equal(await evaluate<boolean>(`document.activeElement === document.querySelector('${coding} [data-coding-task]')`), true,
    "AC-10-3: with the row hidden, focus is in the composer and not on the page");
});

// specs/ai-interaction-experience T1 (AC-27-5, AC-27-6): words, a number, a date and a date and time on Coding's card; a value past its limit is
// refused beside its own field with the limit named, the field marked and focused, and the corrected answer goes on to the model.
test("AC-27-5: Coding answers words, a number, a date and a date and time, and a refused field says its limit", { timeout: 240_000 }, async t => {
  const opened = await openCoding(t, { why: "约下周的复盘会，先确认几件事。", questions: [
    { id: "title", type: "text", prompt: "会议标题" },
    { id: "minutes", type: "number", prompt: "时长", min: 15, max: 120, integer: true, unit: "分钟" },
    { id: "due", type: "date", prompt: "截止日期", required: false },
    { id: "at", type: "datetime", prompt: "开会时间" },
  ] });
  if (!opened) return;
  const { click, evaluate, waitFor, command, sessionId, coding, bodies, fill } = opened;
  await click(`${coding} [data-coding-send]`);
  const card = `${coding} [data-coding-question][data-ix-question]`;
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(card)}))`, 30_000);
  assert.deepEqual(bodies[0]?.tools?.find(tool => tool.name === "ask-user")?.input_schema.properties.questions.items.properties.type.enum, ["choice", "text", "number", "date", "datetime", "reference"], "AC-27-1: the model is offered what the card draws");
  const shown = await evaluate<{ fields: string[]; weekday: string; zone: string; placeholder: string }>(`(() => { const node = document.querySelector(${JSON.stringify(card)});
    return { fields: [...node.querySelectorAll('[data-ix-field]')].map(field => field.dataset.ixField), weekday: node.querySelector('[data-ix-field="d2"] [data-ix-weekday]').textContent,
      zone: node.querySelector('[data-ix-field="w3"] .mw-ix-clock .mw-ix-zone')?.textContent || '', placeholder: node.querySelector('[data-ix-field="d2"] input').placeholder }; })()`);
  assert.deepEqual({ ...shown, zone: /UTC[+-]\d/.test(shown.zone) }, { fields: ["t0", "n1", "d2", "w3"], weekday: "", zone: true, placeholder: "YYYY-MM-DD" }, "an empty date shows its format, no weekday");

  const evidence = reviewEvidenceUrl("ai-interaction/"); await mkdir(evidence, { recursive: true });
  const shot = async (name: string, width: number, scheme: "light" | "dark") => {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] }, sessionId);
    await evaluate(`document.querySelector(${JSON.stringify(card)}).scrollIntoView({ block: 'center' })`);
    await waitFor(`document.getAnimations().every(animation => animation.playState !== 'running' || animation.effect?.getTiming().iterations === Infinity)`, 5_000);
    await writeFile(new URL(`coding-typed-question-${name}.png`, evidence), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  };
  const views = async (state: string) => { await shot(`${state}-light`, 1360, "light"); await shot(`${state}-dark`, 1360, "dark"); await shot(`${state}-390`, 390, "light");
    await command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] }, sessionId); };
  await fill(`${card} [data-ix-field="t0"] input`, "Q4 发布复盘");
  await fill(`${card} [data-ix-field="n1"] input`, "240");
  await fill(`${card} [data-ix-field="w3"] [data-ix-part="date"]`, "2026-10-23");
  await fill(`${card} [data-ix-field="w3"] [data-ix-part="time"]`, "15:00");
  await views("filled");
  assert.equal(await evaluate<string>(`document.querySelector(${JSON.stringify(card)}).querySelector('[data-ix-field="n1"] .mw-ix-unit')?.textContent`), "分钟", "AC-27-6: the unit is beside the number");
  assert.equal(await evaluate<string>(`document.querySelector(${JSON.stringify(card)}).querySelector('[data-ix-field="w3"] [data-ix-weekday]').textContent`), "周五", "a typed date shows its weekday");

  await click(`${card} [data-ix-action="answer"]`);
  await waitFor(`document.querySelector(${JSON.stringify(card)})?.querySelector('[data-ix-field="n1"] [data-ix-error]')?.textContent === '不能超过 120 分钟'`, 15_000);
  const refused = await evaluate<{ invalid: string | null; described: boolean; focused: boolean; others: string[] }>(`(() => { const node = document.querySelector(${JSON.stringify(card)}), field = node.querySelector('[data-ix-field="n1"]'), input = field.querySelector('input');
    return { invalid: input.getAttribute('aria-invalid'), described: (input.getAttribute('aria-describedby') || '').split(' ').includes(field.querySelector('[data-ix-error]').id),
      focused: field.contains(document.activeElement), others: [...node.querySelectorAll('[data-ix-error]:not([hidden])')].map(line => line.closest('[data-ix-field]').dataset.ixField) }; })()`);
  assert.deepEqual(refused, { invalid: "true", described: true, focused: true, others: ["n1"] }, "the refused field is marked, described by its line and focused; the others stay quiet");
  assert.equal(bodies.length, 1, "a refused answer does not go on to the model");
  await views("refused");

  await fill(`${card} [data-ix-field="n1"] input`, "45");
  await click(`${card} [data-ix-action="answer"]`);
  for (let i = 0; i < 600 && bodies.length < 2; i++) await new Promise(resolve => setTimeout(resolve, 50));
  const next = JSON.stringify(bodies[1]?.messages ?? "");
  for (const part of ["Q4 发布复盘", "45", "2026-10-23T15:00"]) assert.ok(next.includes(part), `the model hears ${part}`);
  await waitFor(`!document.querySelector('${coding} [data-coding-question]')`, 15_000);
});

// specs/ai-interaction-experience §15.10 (AC-10-1～8): Coding's question card in a real round, at three widths, in Dark, by
// keyboard and input method, without motion, while the page reads the run again, and as a screen reader hears it.
const MOD = process.platform === "darwin" ? 4 : 2, SHIFT = 8;
const KEYS: Record<string, [code: string, keyCode: number, text?: string]> = { Tab: ["Tab", 9], Enter: ["Enter", 13, "\r"], " ": ["Space", 32, " "], ArrowDown: ["ArrowDown", 40] };
/** A key as the browser takes typing: Tab moves focus, Enter and Space press a button. */
async function press({ command, sessionId }: { command: <T>(method: string, params: object, session?: string) => Promise<T>; sessionId: string }, key: string, modifiers = 0) {
  const [code, windowsVirtualKeyCode, text] = KEYS[key]!;
  await command("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode, modifiers, ...(text && !modifiers ? { text } : {}) }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode, modifiers }, sessionId);
}
/** In the page: the contrast of a colour over everything painted behind an element (its background and its ancestors' down to the first opaque one). */
const CONTRAST = `window.__contrast = (fore, behind) => {
  const canvas = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }), x = canvas.getContext('2d', { willReadFrequently: true });
  const paint = color => { x.fillStyle = color; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data]; };
  const layers = [];
  for (let at = behind; at; at = at.parentElement) { const color = getComputedStyle(at).backgroundColor; layers.unshift(color); x.clearRect(0, 0, 1, 1); if (paint(color)[3] === 255) break; }
  x.clearRect(0, 0, 1, 1); let back = paint('#fff'); for (const color of layers) back = paint(color);
  const front = paint(fore), lum = rgb => rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const [a, b] = [lum(back), lum(front)];
  return Math.round((Math.max(a, b) + .05) / (Math.min(a, b) + .05) * 100) / 100;
};`;
const LONG = "导出报表时，同一天里跨时区的记录按服务器时区切日，页面上却按本地时区显示，两边的合计对不上，财务每个月要手工核一遍。";
const LONG_QUESTIONS = { why: `先确认要修哪一处。${LONG}`, questions: [
  { prompt: `先修哪一个？${LONG}`, options: [{ label: "登录", description: `${LONG}${LONG}`, recommended: true },
    { label: "导出", description: "Only the export path changes; the login flow, the session store and every other report keep working exactly as they do today." }] },
  { prompt: "顺手做什么？", required: false, multiple: true, options: [{ label: "补测试" }, { label: "写说明" }] },
] };

test("AC-10-1, AC-10-2, AC-10-7: Coding's card fits 1440, 1024 and 390 px, reads in Dark, and wraps long content", { timeout: 240_000 }, async t => {
  const opened = await openCoding(t, LONG_QUESTIONS); if (!opened) return;
  const { click, evaluate, waitFor, command, sessionId, coding } = opened;
  await click(`${coding} [data-coding-send]`);
  const card = `${coding} [data-coding-question][data-ix-question]`;
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(card)}))`, 30_000);
  await evaluate(CONTRAST);
  const evidence = reviewEvidenceUrl("ai-interaction/"); await mkdir(evidence, { recursive: true });
  const shot = async (name: string) => writeFile(new URL(`coding-question-${name}.png`, evidence), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  // Colours are read once every transition has finished, not halfway through one.
  const settle = () => waitFor(`document.getAnimations().every(animation => animation.playState !== 'running' || animation.effect?.getTiming().iterations === Infinity)`, 5_000);
  const width = async (pixels: number) => {
    await command("Emulation.setDeviceMetricsOverride", { width: pixels, height: pixels < 768 ? 844 : 900, deviceScaleFactor: 1, mobile: pixels < 768 }, sessionId);
    await evaluate(`new Promise(resolve => { document.querySelector(${JSON.stringify(card)}).scrollIntoView({ block: 'center' }); requestAnimationFrame(() => requestAnimationFrame(resolve)); })`);
    await settle();
  };
  const theme = async (name: "light" | "dark") => {
    await opened.owner.evaluate(`localStorage.setItem('molis-work:theme','${name}');dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:'${name}'}))`);
    // Black on the card's surface: a light card gives it a high contrast, a dark one almost none.
    await waitFor(`window.__contrast('#000', document.querySelector(${JSON.stringify(card)})) ${name === "dark" ? "<" : ">"} 3`);
    await settle();
  };
  // AC-10-1: in the thread, nothing scrolls sideways, every control inside the card; on a phone each is a 44 px target.
  for (const pixels of [1440, 1024, 390]) {
    await width(pixels);
    const fit = await evaluate<{ inThread: boolean; page: boolean; thread: boolean; card: boolean; outside: string[]; small: string[] }>(`(() => {
      const node = document.querySelector(${JSON.stringify(card)}), box = node.getBoundingClientRect(), turns = node.closest('[data-coding-turns]'), lane = turns?.getBoundingClientRect();
      const controls = [...node.querySelectorAll('button, input, textarea, select')].filter(control => control.getClientRects().length).map(control => [control, control.getBoundingClientRect()]);
      const name = control => control.textContent.trim().slice(0, 12) || control.getAttribute('aria-label') || control.tagName;
      return { inThread: Boolean(lane) && box.left >= lane.left - 1 && box.right <= lane.right + 1,
        page: document.scrollingElement.scrollWidth <= innerWidth + 1, thread: turns.scrollWidth <= turns.clientWidth + 1, card: node.scrollWidth <= node.clientWidth + 1,
        outside: controls.filter(([, r]) => r.left < box.left - 1 || r.right > box.right + 1).map(([control]) => name(control)),
        small: ${pixels < 768} ? controls.filter(([, r]) => Math.min(r.width, r.height) < 44).map(([control, r]) => name(control) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)) : [] }; })()`);
    assert.deepEqual(fit, { inThread: true, page: true, thread: true, card: true, outside: [], small: [] }, `at ${pixels} px`);
    await shot(`${pixels}`);
  }
  // AC-10-7: at 390 px the long prompt and description wrap inside the card, and the submit stays inside it, pressable.
  // The card and the submit are both measured after the submit is scrolled to: boxes from before the scroll are elsewhere.
  const wrapped = await evaluate<{ option: boolean; lines: number; submitInside: boolean; submitHit: boolean; card: number[]; submit: number[] }>(`(() => {
    const node = document.querySelector(${JSON.stringify(card)}), option = node.querySelector('[data-ix-field="q0"] [data-ix-option="0"]');
    const description = option.querySelector('.mw-ix-option__desc'), submit = node.querySelector('[data-ix-action="answer"]');
    submit.scrollIntoView({ block: 'center' }); const box = node.getBoundingClientRect(), at = submit.getBoundingClientRect(), hit = document.elementFromPoint(at.left + at.width / 2, at.top + at.height / 2);
    return { option: option.scrollWidth <= option.clientWidth + 1 && option.getBoundingClientRect().right <= box.right + 1,
      lines: Math.round(description.getBoundingClientRect().height / parseFloat(getComputedStyle(description).lineHeight)),
      submitInside: at.left >= box.left - 1 && at.right <= box.right + 1 && at.bottom <= box.bottom + 1, submitHit: Boolean(hit && submit.contains(hit)),
      card: [box.left, box.right, box.bottom].map(Math.round), submit: [at.left, at.right, at.bottom].map(Math.round) }; })()`);
  assert.equal(wrapped.option, true, "the long option stays inside its button and the card");
  assert.ok(wrapped.lines >= 3, `the long description wraps (${wrapped.lines} lines)`);
  assert.deepEqual({ submitInside: wrapped.submitInside, submitHit: wrapped.submitHit }, { submitInside: true, submitHit: true }, `submit ${wrapped.submit} in card ${wrapped.card} (left, right, bottom)`);

  // AC-10-2: in Dark, text at 4.5:1 on what is behind it; a picked option's fill against the card and its mark against the fill at 3:1.
  await width(1440); await theme("dark");
  const text = `(selectors) => selectors.flatMap(selector => [...document.querySelector(${JSON.stringify(card)}).querySelectorAll(selector)].slice(0, 1).map(node => [selector, window.__contrast(getComputedStyle(node).color, node)]))`;
  const unpicked = await evaluate<Array<[string, number]>>(`(${text})(['h3', '.mw-ix-label', '[data-ix-option="0"] .mw-ix-option__title', '.mw-ix-option__desc', '.mw-ix-tag', '[data-ix-error]', '[data-ix-note]', '.mw-ix-choices .mw-choice'])`);
  assert.equal(unpicked.length, 8, "every kind of text the card shows was measured");
  await click(`${card} [data-ix-field="q0"] [data-ix-option="0"]`);
  await click(`${card} [data-ix-field="q1"] [data-ix-option="0"]`);
  await settle();
  const picked = await evaluate<Array<[string, number]>>(`(${text})(['[aria-checked="true"] .mw-ix-option__title', '[aria-checked="true"] .mw-ix-option__desc', '[aria-checked="true"] .mw-ix-tag', '.mw-ix-choices [aria-pressed="true"]'])`);
  assert.deepEqual(picked.map(([selector]) => selector), ['[aria-checked="true"] .mw-ix-option__title', '[aria-checked="true"] .mw-ix-option__desc', '[aria-checked="true"] .mw-ix-tag', '.mw-ix-choices [aria-pressed="true"]'],
    "every kind of text a picked option or choice shows was measured");
  for (const [selector, ratio] of [...unpicked, ...picked]) assert.ok(ratio >= 4.5, `${selector} is ${ratio}:1 in Dark`);
  const marks = await evaluate<Array<[string, number]>>(`(() => { const node = document.querySelector(${JSON.stringify(card)}), option = node.querySelector('[data-ix-field="q0"] [aria-checked="true"]'), chip = node.querySelector('[data-ix-field="q1"] [aria-pressed="true"]');
    return [['picked option fill', window.__contrast(getComputedStyle(option).backgroundColor, option.parentElement)], ['picked option mark', window.__contrast(getComputedStyle(option.querySelector('.mw-ix-option__check')).color, option)],
      ['picked choice fill', window.__contrast(getComputedStyle(chip).backgroundColor, chip.parentElement)], ['picked choice mark', window.__contrast(getComputedStyle(chip.querySelector('.mw-choice__check')).color, chip)]]; })()`);
  for (const [what, ratio] of marks) assert.ok(ratio >= 3, `${what} is ${ratio}:1 in Dark`);
  await shot("1440-dark");
  await width(390); await shot("390-dark");
  await theme("light");
});

test("AC-10-3, AC-10-4, AC-10-5, AC-10-8: Coding's card by keyboard and input method, without motion, read out, and focus back in the composer", { timeout: 240_000 }, async t => {
  const opened = await openCoding(t, { why: "先确认要修哪一处。", questions: [
    { id: "fix", prompt: "先修哪一个？", options: [{ label: "登录", description: "影响所有人", recommended: true }, { label: "导出", description: "只影响报表" }] },
    { id: "note", type: "text", prompt: "还有什么要交代的？", required: false },
    { id: "extra", prompt: "顺手做什么？", required: false, multiple: true, options: [{ label: "补测试" }, { label: "写说明" }] },
  ] });
  if (!opened) return;
  const { click, evaluate, waitFor, command, sessionId, coding, bodies } = opened;
  const card = `${coding} [data-coding-question][data-ix-question]`, composer = `${coding} [data-coding-task]`;
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  // What runs in the card, or in the thread around it, a frame after each change; what the page keeps and what it answers.
  await evaluate(`(() => { const card = ${JSON.stringify(card)};
    window.__moving = label => new Promise(resolve => requestAnimationFrame(() => { const node = document.querySelector(card), turns = node.closest('[data-coding-turns]');
      resolve([label, document.getAnimations().filter(animation => animation.playState === 'running' && animation.effect?.target && (node.contains(animation.effect.target) || (animation.effect.target.contains(node) && turns.contains(animation.effect.target))))
        .map(animation => (animation.effect.target.getAttribute('class') || animation.effect.target.tagName) + ' ' + (animation.animationName || animation.transitionProperty || ''))]); }));
    window.__motion = []; new MutationObserver((_, observer) => { if (!document.querySelector(card)) return; observer.disconnect(); window.__moving('appear').then(seen => window.__motion.push(seen)); }).observe(document.body, { childList: true, subtree: true });
    window.__drafts = []; window.__answers = []; const original = window.fetch; window.fetch = async (...args) => { const body = args[1]?.body;
      if (typeof body === 'string' && body.includes('question_drafts')) window.__drafts.push(JSON.parse(body).question_drafts);
      if (typeof body === 'string' && body.includes('"kind":"answer"')) window.__answers.push(JSON.parse(body));
      return original(...args); }; })()`);
  await click(`${coding} [data-coding-send]`);
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(card)})) && window.__motion.length === 1`, 30_000);
  // Read back by value (CDP `returnByValue`): what the focused element lacks (a field, a role, an option) comes back null, not undefined.
  const focused = () => evaluate<[string | null, string | null, string | null]>(`[document.activeElement.closest('[data-ix-field]')?.dataset.ixField, document.activeElement.getAttribute('role'), document.activeElement.dataset.ixOption]`);
  const states = () => evaluate<{ name: string; tag: string; radios: Array<string | null>; toggles: Array<string | null>; status: string | null }>(`(() => { const node = document.querySelector(${JSON.stringify(card)}), title = document.getElementById(node.getAttribute('aria-labelledby') || '');
    return { name: title?.textContent.trim() || '', tag: node.tagName, radios: [...node.querySelectorAll('[data-ix-field="q0"] [role=radiogroup] [role=radio]')].map(radio => radio.getAttribute('aria-checked')),
      toggles: [...node.querySelectorAll('[data-ix-field="q2"] [role=group] [data-ix-option]')].map(button => button.getAttribute('aria-pressed')), status: node.querySelector('[data-ix-note]')?.getAttribute('role') ?? null }; })()`);
  // AC-10-8: the card is named by its title; one pick is a radio, several are toggle buttons, each saying whether it is on.
  assert.deepEqual(await states(), { name: "先确认要修哪一处。", tag: "ARTICLE", radios: ["false", "false"], toggles: ["false", "false"], status: "status" });

  // AC-10-3: from the composer back to the row above it; 「去回答」 takes focus to the first question's first option.
  await waitFor(`!document.querySelector(${JSON.stringify(composer)}).disabled`);
  await evaluate(`document.querySelector(${JSON.stringify(composer)}).focus()`);
  for (let i = 0; i < 8 && !(await evaluate<boolean>(`document.activeElement.matches('[data-ix-step-id]')`)); i++) await press(opened, "Tab", SHIFT);
  assert.equal(await evaluate<string>(`document.activeElement.querySelector('[data-ix-step-label]')?.textContent ?? ''`), "去回答（3 题）", "Shift+Tab from the composer reaches the step");
  await press(opened, "Enter");
  assert.deepEqual(await focused(), ["q0", "radio", "0"], "「去回答」 lands on the first question's first option");
  await press(opened, "ArrowDown");
  assert.deepEqual(await focused(), ["q0", "radio", "1"], "the arrow keys move between the options");
  await evaluate(`window.__moving('pick').then(seen => window.__motion.push(seen))`);
  await press(opened, "Tab");
  assert.deepEqual(await focused(), ["t1", null, null], "Tab goes on to the next question");

  // AC-10-4: pinyin being composed is no draft, and the input method's Enter neither answers nor moves on; the chosen words are kept.
  await command("Input.imeSetComposition", { text: "ceshi", selectionStart: 5, selectionEnd: 5 }, sessionId);
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.equal(JSON.stringify(await evaluate("window.__drafts")).includes("ceshi"), false, "what is still being composed is not kept as a draft");
  // The page reads the input method's Enter as keyCode 229. No native key code: 229 is Windows' own, and on macOS Chrome turns it
  // into a key that hides the page, after which the receipt (rightly) takes no focus into a page that is not shown.
  await command("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 229 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 229 }, sessionId);
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.equal(await evaluate<number>("window.__answers.length"), 0, "the input method's Enter does not answer");
  assert.deepEqual(await focused(), ["t1", null, null], "nor move on to the next question");
  // Since Chrome 155 that synthetic Enter may itself commit the pinyin, so the candidate is chosen on a composition of its own.
  await evaluate(`(() => { const input = document.activeElement; input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await command("Input.imeSetComposition", { text: "ceshi", selectionStart: 5, selectionEnd: 5 }, sessionId);
  await command("Input.insertText", { text: "测试" }, sessionId);
  await waitFor(`window.__drafts.some(drafts => Object.values(drafts).some(values => JSON.stringify(values.t1).includes('测试')))`, 10_000);

  await press(opened, "Tab");
  assert.deepEqual(await focused(), ["q2", null, "0"]);
  await press(opened, " ");
  assert.deepEqual(await states(), { name: "先确认要修哪一处。", tag: "ARTICLE", radios: ["false", "true"], toggles: ["true", "false"], status: "status" }, "each control says it is on");
  // AC-10-8: every line written to the card's status line, with what holds focus at that moment.
  await evaluate(`(() => { const note = document.querySelector(${JSON.stringify(card)}).querySelector('[data-ix-note]'), composer = document.querySelector(${JSON.stringify(composer)});
    window.__note = []; new MutationObserver(() => { window.__note.push({ text: note.textContent, role: note.getAttribute('role'), connected: note.isConnected, composer: document.activeElement === composer, body: document.activeElement === document.body, shut: composer.disabled, hidden: document.hidden });
      if (window.__note.length === 1) window.__moving('submit').then(seen => window.__motion.push(seen)); }).observe(note, { childList: true, characterData: true, subtree: true }); })()`);
  await press(opened, "Enter", MOD);
  await waitFor(`window.__answers.length === 1`, 10_000);
  const values = await evaluate<Record<string, unknown>>(`window.__answers[0].values`);
  assert.deepEqual({ q0: values.q0, q2: values.q2, t1: JSON.stringify(values.t1).includes("测试") }, { q0: ["1"], q2: ["0"], t1: true }, "⌘/Ctrl+Enter answers with what the keyboard picked");
  for (let i = 0; i < 600 && bodies.length < 2; i++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.match(JSON.stringify(bodies[1]?.messages ?? ""), /导出/);
  await waitFor(`!document.querySelector('${coding} [data-coding-question]')`, 15_000);
  const notes = await evaluate<Array<{ text: string; role: string | null; connected: boolean; composer: boolean; body: boolean; shut: boolean; hidden: boolean }>>("window.__note");
  assert.equal(notes[0]?.text, "正在提交原问题的回答…");
  const receipt = notes.find(note => note.text === "回答已交给原执行者，继续这一轮任务。");
  assert.deepEqual(receipt && { text: receipt.text, role: receipt.role, connected: receipt.connected, composer: receipt.composer, body: receipt.body },
    { text: "回答已交给原执行者，继续这一轮任务。", role: "status", connected: true, composer: true, body: false },
    `AC-10-8, AC-10-3: the receipt is written into the status line already on the page, and focus is back in the composer (composer disabled: ${receipt?.shut}, page hidden: ${receipt?.hidden})`);
  assert.equal(await evaluate<boolean>(`document.activeElement === document.querySelector(${JSON.stringify(composer)})`), true, "after the card leaves, focus is still in the composer");
  // AC-10-5: with reduced motion nothing runs as the card arrives, as an option is picked, or as the answer is sent.
  assert.deepEqual(await evaluate("window.__motion"), [["appear", []], ["pick", []], ["submit", []]]);
});

test("AC-10-6: while Coding waits, the page reads the run again and the card, the words being written and the reading position stay", { timeout: 180_000 }, async t => {
  const opened = await openCoding(t, { why: `先确认要修哪一处。${LONG}`, questions: [
    { id: "fix", prompt: `先修哪一个？${LONG}`, options: [{ label: "登录", description: LONG, recommended: true }, { label: "导出", description: LONG }, { label: "都修", description: LONG }] },
    { id: "note", type: "text", prompt: "还有什么要交代的？", required: false },
  ] });
  if (!opened) return;
  const { click, evaluate, waitFor, command, sessionId, coding } = opened;
  const card = `${coding} [data-coding-question][data-ix-question]`, field = `${card} [data-ix-field="t1"] input`, turns = `${coding} [data-coding-turns]`;
  // A short window, so the thread scrolls and there is something above the card to read back.
  await command("Emulation.setDeviceMetricsOverride", { width: 1024, height: 640, deviceScaleFactor: 1, mobile: false }, sessionId);
  await evaluate(`(() => { window.__reads = 0; const original = window.fetch; window.fetch = (...args) => { if (String(args[0]).includes('?window=')) window.__reads++; return original(...args); }; })()`);
  await click(`${coding} [data-coding-send]`);
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(card)}))`, 30_000);
  await evaluate(`(() => { window.__card = document.querySelector(${JSON.stringify(card)}); document.querySelector(${JSON.stringify(field)}).focus(); })()`);
  await command("Input.insertText", { text: "写到一半的话" }, sessionId);
  await evaluate(`document.querySelector(${JSON.stringify(field)}).setSelectionRange(3, 3)`);
  // Scrolled up with the wheel, as a person reading back does.
  const lane = await evaluate<{ x: number; y: number; room: number }>(`(() => { const node = document.querySelector(${JSON.stringify(turns)}), r = node.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, room: node.scrollHeight - node.clientHeight }; })()`);
  assert.ok(lane.room > 200, `the thread has something above the card to scroll back to (${lane.room} px)`);
  const offset = await opened.owner.evaluate<{ x: number; y: number }>("(() => { const r = document.querySelector('iframe[data-plugin-frame=coding]').getBoundingClientRect(); return { x: r.x, y: r.y }; })()");
  await command("Input.dispatchMouseEvent", { type: "mouseWheel", x: offset.x + lane.x, y: offset.y + lane.y, deltaX: 0, deltaY: -200 }, sessionId);
  await new Promise(resolve => setTimeout(resolve, 400));
  const position = `(() => { const node = document.querySelector(${JSON.stringify(turns)}); return { top: Math.round(node.scrollTop), latest: node.scrollHeight - node.clientHeight - node.scrollTop < 8 }; })()`;
  const before = await evaluate<{ top: number; latest: boolean }>(position);
  assert.equal(before.latest, false, "the person has scrolled up from the latest");
  const reads = await evaluate<number>("window.__reads");
  await waitFor(`window.__reads >= ${reads + 3}`, 20_000);
  await new Promise(resolve => setTimeout(resolve, 300));
  const after = await evaluate<{ same: boolean; value: string; caret: number[]; focused: boolean }>(`(() => { const input = document.querySelector(${JSON.stringify(field)});
    return { same: document.querySelector(${JSON.stringify(card)}) === window.__card, value: input.value, caret: [input.selectionStart, input.selectionEnd], focused: document.activeElement === input }; })()`);
  assert.deepEqual(after, { same: true, value: "写到一半的话", caret: [3, 3], focused: true }, "three reads later the card is the same node, with the words, the caret and focus where they were");
  assert.deepEqual(await evaluate(position), before, "and the thread is where the person scrolled it");
  // VUX-26 reading anchor: a read that rewrites an earlier turn above the view (longer now) leaves what the person is reading
  // where it was on screen. Coding compensates by hand (overflow-anchor is none on the thread), so the browser does not move it twice.
  const grown = await evaluate<{ id: string; seen: string; at: number } | null>(`(() => { const node = document.querySelector(${JSON.stringify(turns)}), top = node.getBoundingClientRect().top;
    const above = [...node.querySelectorAll('[data-turn]')].find(turn => turn.getBoundingClientRect().bottom < top && turn.textContent.trim());
    const seen = [...node.querySelectorAll(':scope > [data-run] > *')].find(part => part.getBoundingClientRect().bottom > top);
    if (!above || !seen) return null; seen.dataset.probeSeen = ''; window.__grow = above.dataset.turn;
    const original = window.fetch, longer = (value) => { if (Array.isArray(value)) value.forEach(longer); else if (value && typeof value === 'object') { if (value.turn_id === window.__grow && typeof value.text === 'string') { value.text += ' 更正：补上的一段。'.repeat(6); if (typeof value.html === 'string') value.html += '<p>更正：补上的一段。</p>'.repeat(6); window.__grown = true; } Object.values(value).forEach(longer); } };
    // The read names the runs it already has; asking without that brings the whole run back, with the corrected turn in it.
    window.fetch = async (...args) => { const asked = String(args[0]), read = asked.includes('?window=') && window.__grow; if (read) args[0] = asked.replace(/&known=[^&]*/, '');
      const response = await original(...args); if (!read) return response; const data = await response.clone().json(); longer(data); return new Response(JSON.stringify(data), { status: response.status, headers: response.headers }); };
    return { id: above.dataset.turn, seen: seen.tagName, at: seen.getBoundingClientRect().top }; })()`);
  assert.ok(grown, "there is an earlier turn wholly above the view");
  await waitFor(`window.__grown && document.querySelector('[data-turn="' + window.__grow + '"]').textContent.includes('更正：补上的一段')`, 20_000);
  await new Promise(resolve => setTimeout(resolve, 200));
  const moved = await evaluate<number>("document.querySelector('[data-probe-seen]').getBoundingClientRect().top");
  assert.ok(Math.abs(moved - grown!.at) <= 1, `the part being read stayed put (${grown!.at} → ${moved})`);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(turns)}).dataset.follow`), "detached", "and the reader is still reading back");
  await evaluate("window.__grow = null");
  // VUX-26: the thread has one scroll owner. Detached, 回到最新 is offered; it is the one trip back, and the thread follows again.
  const latest = `${coding} [data-coding-latest]`;
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(turns)}).dataset.follow`), "detached");
  await waitFor(`document.querySelector(${JSON.stringify(latest)})?.hidden === false`);
  await click(latest);
  await waitFor(`(() => { const node = document.querySelector(${JSON.stringify(turns)}); return node.dataset.follow === 'following' && node.scrollHeight - node.clientHeight - node.scrollTop < 8; })()`, 10_000);
  await waitFor(`document.querySelector(${JSON.stringify(latest)}).hidden === true`);
});
