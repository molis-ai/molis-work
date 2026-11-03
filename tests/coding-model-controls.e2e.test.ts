import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
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

// specs/prologue-adoption §4.3: the composer offers a reasoning effort only for a model marked as taking one and sends it
// with the round; while the round runs, choosing another model offers to switch the round to it from its next model call,
// and the note under the composer says what the round really uses.
test("PA-24: the composer sends a chosen reasoning effort and switches a running round to another model from its next call", { timeout: 180_000 }, async t => {
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const { runWithMolisWorkHome, resetSecretStoreCache } = await import("@molis-ai/molis-work-storage");
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); });
  const bodies: Array<{ model?: string; output_config?: { effort?: string } }> = [];
  const answered = Promise.withResolvers<void>();
  const model = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    // A round that changed nothing has its ending reviewed (D1②): answered "nothing found" without spending a scripted turn.
    const review = asideReply(raw);
    if (review) { res.writeHead(200, { "content-type": "text/event-stream" }); res.end(turn(review)); return; }
    const body = JSON.parse(raw); bodies.push(body);
    // The first call of the round waits until the person has switched; it asks to read a file, so a second call follows.
    if (bodies.length === 1) await answered.promise;
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(bodies.length === 1 ? turn("", { name: "read", input: { path: "note.txt" } }) : turn("发布说明写在 CHANGELOG.md。"));
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { answered.resolve(); model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const b = await openGoalBrowser(t, "seeded"); if (!b) return;
  const child = await pluginFrameBrowser(t, b, "coding");
  const {click, evaluate, waitFor} = child;
  const { command, sessionId, homeDirectory } = b;
  await runWithMolisWorkHome(homeDirectory, () => withMolisWorkProjectCatalog({ homeDirectory }, catalog => {
    const connection = withConnectorConnections(homeDirectory, store => { const created = store.createToken({ serviceId: "model-api", displayName: "local-only", token: "fixture-local-model-key" }); store.assertTarget(created.connection_id, "model-api", `http://127.0.0.1:${address.port}`); return created; });
    catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "local-only", display_name: "本机", base_url: `http://127.0.0.1:${address.port}`, api_format: "anthropic-messages",
      models: [{ model_id: "fixture-small", enabled: true, reasoning_effort: true }, { model_id: "fixture-large", enabled: true, reasoning_effort: true }, { model_id: "fixture-plain", enabled: true }] });
  }));
  const workspace = join(homeDirectory, "coding-model-fixture");
  await mkdir(workspace, { recursive: true });
  await writeFile(join(workspace, "note.txt"), "release notes go in CHANGELOG.md\n");
  const fill = (selector: string, value: string, page: Pick<typeof child, "evaluate"> = child) => page.evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.value=${JSON.stringify(value)};node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await b.navigate(() => command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/` }, sessionId));
  await b.click('.navigator-project-settings');
  await b.waitFor("!!document.querySelector('[data-directory-panel=project-settings] [data-settings-section=workspaces]')");
  await b.click('[data-directory-panel=project-settings] [data-settings-section=workspaces]');
  await b.waitFor("!!document.querySelector('[data-project-workspaces-add]') && !document.querySelector('[data-project-workspaces-refresh]').disabled");
  await fill('[data-project-workspaces-add] [name=path]', workspace, b);
  await b.click('[data-project-workspaces-add] [type=submit]');
  await b.waitFor("document.querySelector('[data-project-workspaces-list]').textContent.includes('coding-model-fixture')");
  const coding = "[data-coding-workbench]";
  await b.click(`[data-plugin-strip] [data-plugin-id="coding"]`);
  await b.waitFor(`document.querySelector('[data-work-surface="coding"]')?.getBoundingClientRect().width > 100`);
  await click(`${coding} [data-coding-new]`);
  await waitFor(`!document.querySelector('${coding} [data-coding-task]').disabled && document.querySelector('${coding} [data-coding-model]').options.length >= 2`);
  const small = JSON.stringify(["local-only", "fixture-small"]), large = JSON.stringify(["local-only", "fixture-large"]), plain = JSON.stringify(["local-only", "fixture-plain"]);
  // An unmarked model offers no effort; the marked one does.
  await fill(`${coding} [data-coding-model]`, plain);
  await waitFor(`document.querySelector('${coding} [data-coding-effort-wrap]').hidden`);
  await fill(`${coding} [data-coding-model]`, small);
  await waitFor(`!document.querySelector('${coding} [data-coding-effort-wrap]').hidden`);
  await fill(`${coding} [data-coding-effort]`, "high");
  await fill(`${coding} [data-coding-intent]`, "discuss");
  await fill(`${coding} [data-coding-task]`, "发布说明写在哪里？读 note.txt 再回答。");
  await waitFor(`!document.querySelector('${coding} [data-coding-send]').disabled`);
  await click(`${coding} [data-coding-send]`);
  for (let i = 0; i < 600 && bodies.length < 1; i++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.deepEqual(bodies[0]?.output_config, { effort: "high" }, "the round's first model call carries the effort");
  assert.equal(bodies[0]?.model, "fixture-small");
  // While the round runs: the effort is fixed for it, another model offers a switch.
  await waitFor(`document.querySelector('${coding} [data-coding-model-note]')?.textContent.includes('思考力度 深入')`);
  assert.equal(await evaluate<boolean>(`document.querySelector('${coding} [data-coding-effort-wrap]').hidden`), true, "a running round's effort is fixed; the note says which");
  // A model that cannot carry the round's effort is refused, and the round goes on with its model.
  await fill(`${coding} [data-coding-model]`, plain);
  await waitFor(`!document.querySelector('${coding} [data-coding-model-switch]').hidden`);
  await click(`${coding} [data-coding-model-switch]`);
  await waitFor(`document.querySelector('${coding} [data-coding-status]')?.textContent.includes('没有换模型')`);
  assert.match(await evaluate<string>(`document.querySelector('${coding} [data-coding-status]').textContent`), /没有标注「fixture-plain」可调思考力度/);
  assert.doesNotMatch(await evaluate<string>(`document.querySelector('${coding} [data-coding-model-note]').textContent`), /已请求改用/);
  await fill(`${coding} [data-coding-model]`, large);
  await waitFor(`!document.querySelector('${coding} [data-coding-model-switch]').hidden`);
  const shot = async (name: string) => {
    const directory = join(process.cwd(), ".impeccable/qa/review/prologue-adoption"); await mkdir(directory, { recursive: true });
    const image = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(join(directory, `${name}.png`), Buffer.from(image.data, "base64"));
  };
  await shot("composer-switch-offered");
  await click(`${coding} [data-coding-model-switch]`);
  for (let i = 0; i < 200; i++) {
    const seen = await evaluate<{ note: string; status: string }>(`({note:document.querySelector('${coding} [data-coding-model-note]')?.textContent||'',status:document.querySelector('${coding} [data-coding-status]')?.textContent||''})`);
    if (seen.note.includes("已请求改用 fixture-large") || /没有换模型.*fixture-large/.test(seen.status)) { assert.match(seen.note, /已请求改用 fixture-large/, seen.status); break; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  await shot("composer-switch-requested");
  answered.resolve();
  for (let i = 0; i < 600 && bodies.length < 2; i++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(bodies[1]?.model, "fixture-large", "the next model call goes to the switched model");
  assert.deepEqual(bodies[1]?.output_config, { effort: "high" }, "the round's effort stays as it was frozen");
  await waitFor(`document.querySelector('${coding} [data-coding-model-note]')?.textContent.includes('本轮：fixture-large') && document.querySelector('${coding} [data-coding-model-note]').textContent.includes('开始时 fixture-small')`);
  await waitFor(`[...document.querySelectorAll('${coding} .coding-tool-verb')].some(node => node.textContent.includes('换模型'))`);
  await shot("composer-switch-taken");
  assert.deepEqual(await evaluate("(window.codingTestErrors || [])"), []);
});
