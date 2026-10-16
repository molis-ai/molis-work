import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type ServerResponse } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";

const sse = (type: string, value: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`;
const start = sse("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } })
  + sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
const reply = (text: string) => start + sse("content_block_delta", { index: 0, delta: { type: "text_delta", text } }) + sse("content_block_stop", { index: 0 })
  + sse("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } }) + sse("message_stop", {});

// specs/ai-input-receipts §4.1, §4.2, §7, D3 (stage 1d): on the real Coding page, a round under way offers the three send modes,
// a supplement shows as sending, the same words sent again after a lost answer go under the same key, and Esc in the composer no longer stops the round.
test("RC-10/RC-11/RC-13/RC-16: Coding sends a supplement with its mode, sends a lost supplement again under the same key, and Esc does not stop the round", { timeout: 180_000 }, async t => {
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const { runWithMolisWorkHome, resetSecretStoreCache } = await import("@molis-ai/molis-work-storage");
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); });
  const bodies: Array<{ messages?: unknown }> = [], held: ServerResponse[] = [];
  // The round's first reply keeps streaming until the person interrupts it; every later call answers at once.
  const model = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    bodies.push(JSON.parse(raw));
    res.writeHead(200, { "content-type": "text/event-stream" });
    if (bodies.length === 1) { res.write(start + sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: "正在看登录流程，" } })); held.push(res); return; }
    res.end(reply("好的，改按新接口做。"));
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { for (const res of held) res.destroy(); model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const b = await openGoalBrowser(t, "seeded"); if (!b) return;
  const { click, evaluate, waitFor, command, sessionId, homeDirectory } = b;
  await runWithMolisWorkHome(homeDirectory, () => withMolisWorkProjectCatalog({ homeDirectory }, catalog => {
    const connection = withConnectorConnections(homeDirectory, store => { const created = store.createToken({ serviceId: "model-api", displayName: "local-only", token: "fixture-local-model-key" }); store.assertTarget(created.connection_id, "model-api", `http://127.0.0.1:${address.port}`); return created; });
    catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "local-only", display_name: "本机", base_url: `http://127.0.0.1:${address.port}`, api_format: "anthropic-messages",
      models: [{ model_id: "fixture-plain", enabled: true }] });
  }));
  const workspace = join(homeDirectory, "coding-receipts-fixture");
  await mkdir(workspace, { recursive: true });
  await writeFile(join(workspace, "login.txt"), "login uses the old endpoint\n");
  const fill = (selector: string, value: string) => evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.value=${JSON.stringify(value)};node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const shot = async (name: string) => {
    const evidence = reviewEvidenceUrl("ai-input-receipts/"); await mkdir(evidence, { recursive: true });
    await writeFile(new URL(name, evidence), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  };
  await command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await b.navigate(() => command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/` }, sessionId));
  await click(".navigator-project-settings");
  await waitFor("!!document.querySelector('[data-directory-panel=project-settings] [data-settings-section=workspaces]')");
  await click("[data-directory-panel=project-settings] [data-settings-section=workspaces]");
  await waitFor("!!document.querySelector('[data-project-workspaces-add]') && !document.querySelector('[data-project-workspaces-refresh]').disabled");
  await fill("[data-project-workspaces-add] [name=path]", workspace);
  await click("[data-project-workspaces-add] [type=submit]");
  await waitFor("document.querySelector('[data-project-workspaces-list]').textContent.includes('coding-receipts-fixture')");
  const coding = "[data-coding-workbench]";
  await click(`[data-plugin-strip] [data-plugin-id="coding"]`);
  await waitFor(`document.querySelector('[data-work-surface="coding"]')?.getBoundingClientRect().width > 100`);
  await click(`${coding} [data-coding-new]`);
  await waitFor(`!document.querySelector('${coding} [data-coding-task]').disabled && document.querySelector('${coding} [data-coding-model]').options.length >= 1`);
  await fill(`${coding} [data-coding-model]`, JSON.stringify(["local-only", "fixture-plain"]));
  await fill(`${coding} [data-coding-intent]`, "discuss");
  assert.equal(await evaluate<boolean>(`document.querySelector('${coding} [data-coding-mode]').hidden`), true, "no send modes before a round runs");
  await fill(`${coding} [data-coding-task]`, "登录流程哪里用了旧接口？");
  await waitFor(`!document.querySelector('${coding} [data-coding-send]').disabled`);
  await click(`${coding} [data-coding-send]`);
  await waitFor(`!document.querySelector('${coding} [data-coding-mode]').hidden && !document.querySelector('${coding} [data-coding-stop]').hidden`, 30_000);
  assert.equal(await evaluate<string>(`document.querySelector('${coding} [data-coding-send]').textContent`), "发送");
  assert.equal(await evaluate<boolean>(`(() => { const stop = document.querySelector('${coding} [data-coding-stop]').getBoundingClientRect(), send = document.querySelector('${coding} [data-coding-send]').getBoundingClientRect(); return Math.abs((stop.top + stop.bottom) - (send.top + send.bottom)) < 8; })()`), true, "the modes fit on the composer's row: stopping stays beside them");

  // D3: Esc in the composer no longer stops the round; stopping takes the button.
  await evaluate(`document.querySelector('${coding} [data-coding-task]').focus()`);
  for (const type of ["keyDown", "keyUp"]) await command("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.equal(await evaluate<boolean>(`!document.querySelector('${coding} [data-coding-stop]').hidden && !document.querySelector('${coding} [data-coding-status]').textContent.includes('停止')`), true);

  // The mode menu is the shared select menu; each choice says what it does, and interrupting says what it costs.
  const trigger = `${coding} [data-coding-mode] [data-mw-select-trigger]`;
  await click(trigger);
  const menu = await evaluate<string>(`'#'+CSS.escape(document.querySelector(${JSON.stringify(trigger)}).getAttribute('aria-controls'))`);
  await waitFor(`document.querySelector(${JSON.stringify(menu)})?.matches(':popover-open, [data-open], .is-open') || document.querySelector(${JSON.stringify(menu)})?.getBoundingClientRect().height > 0`);
  assert.deepEqual(await evaluate<string[]>(`[...document.querySelectorAll(${JSON.stringify(menu + " [data-mw-select-option]")})].map(item => item.textContent.trim())`),
    ["补充：这步做完后读", "打断：丢弃当前回复", "下一轮再做"]);
  await shot("coding-send-modes.png");
  await click(`${menu} [data-mw-select-option="1"]`);
  assert.equal(await evaluate<string>(`document.querySelector('${coding} [data-coding-send-mode]').value`), "interrupt");

  // The first answer is lost on the way: the bubble says so and sends the same supplement again.
  await evaluate(`(() => { window.__steers = []; let failed = false; const original = window.fetch; window.fetch = async (...args) => {
    const body = args[1] && typeof args[1].body === 'string' ? args[1].body : '';
    if (body.includes('"kind":"steer"')) { window.__steers.push(JSON.parse(body)); if (!failed) { failed = true; throw new TypeError('Failed to fetch'); } }
    return original(...args); }; })()`);
  await fill(`${coding} [data-coding-task]`, "别看旧接口了，改用 /v2/login");
  await click(`${coding} [data-coding-send]`);
  const lost = `${coding} .coding-turn.is-sending[data-lost="1"]`;
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(lost)}))`);
  assert.match(await evaluate<string>(`document.querySelector(${JSON.stringify(lost)}).textContent`), /别看旧接口了.*没确认送到 · 再按发送，同一条不会重复/su);
  assert.equal(await evaluate<string>(`document.querySelector('${coding} [data-coding-task]').value`), "别看旧接口了，改用 /v2/login", "the words stay in the composer");
  assert.equal(await evaluate<string>(`document.querySelector('${coding} [data-coding-send-mode]').value`), "interrupt", "and so does the mode");
  assert.equal(await evaluate<string>(`document.querySelector('${coding} [data-coding-status]').textContent`), "没确认送到：连接断了，或回复读不出。");
  await shot("coding-send-lost.png");
  await click(`${coding} [data-coding-send]`);
  await waitFor(`document.querySelector('${coding} [data-coding-status]').textContent.includes('正在写的回复已丢掉')`, 15_000);
  const steers = await evaluate<Array<{ key: string; mode: string; text: string }>>("window.__steers");
  assert.equal(steers.length, 2);
  assert.equal(steers[1]!.key, steers[0]!.key, "the retry is the same supplement");
  assert.deepEqual([steers[1]!.mode, steers[1]!.text], ["interrupt", "别看旧接口了，改用 /v2/login"]);
  assert.match(steers[0]!.key, /^send\./);
  assert.equal(await evaluate<string>(`document.querySelector('${coding} [data-coding-send-mode]').value`), "next-boundary", "the mode goes back to the default after each send");

  // Interrupting dropped the reply under way; the round goes on with the person's words, and its record shows them with a receipt.
  for (let i = 0; i < 600 && bodies.length < 2; i++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.match(JSON.stringify(bodies[1]?.messages ?? ""), /v2\/login/u);
  await waitFor(`[...document.querySelectorAll('${coding} .coding-turn[data-kind=user]')].some(node => node.textContent.includes('/v2/login') && node.querySelector('.coding-turn-receipt')) && !document.querySelector('${coding} .coding-turn.is-sending')`, 20_000);
  // RC-16: the page marks the reply it showed being written as dropped; the runtime's record does not (a Prologue need).
  assert.equal(await evaluate<boolean>(`[...document.querySelectorAll('${coding} .coding-turn.is-dropped')].some(node => node.textContent.includes('正在看登录流程') && node.textContent.includes('这段回复已丢掉（你打断了它）'))`), true);
  await shot("coding-send-receipt.png");
});
