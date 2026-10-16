import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";

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

// specs/ai-interaction-experience A2: Coding shows a run's waiting question as the Host's shared question card (the same one as the
// Assistant's), keeps what the person picked with the session, and answers with it; the Runtime offers the typed choice contract.
test("AC-22: Coding answers a typed questionnaire through the shared question card", { timeout: 180_000 }, async t => {
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const { runWithMolisWorkHome, resetSecretStoreCache } = await import("@molis-ai/molis-work-storage");
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); });
  const bodies: Array<{ tools?: Array<{ name: string; input_schema: { properties: { questions: { items: { properties: { options: { items: { type: string } } } } } } } }>; messages?: unknown }> = [];
  const model = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    bodies.push(JSON.parse(raw));
    // The round's first call asks the person a typed questionnaire; the next one goes on with the answer.
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(bodies.length === 1 ? turn("", { name: "ask-user", input: QUESTIONS }) : turn("好的，先修导出。"));
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const b = await openGoalBrowser(t, "seeded"); if (!b) return;
  const { click, evaluate, waitFor, command, sessionId, homeDirectory } = b;
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
  await click('.navigator-project-settings');
  await waitFor("!!document.querySelector('[data-directory-panel=project-settings] [data-settings-section=workspaces]')");
  await click('[data-directory-panel=project-settings] [data-settings-section=workspaces]');
  await waitFor("!!document.querySelector('[data-project-workspaces-add]') && !document.querySelector('[data-project-workspaces-refresh]').disabled");
  await fill('[data-project-workspaces-add] [name=path]', workspace);
  await click('[data-project-workspaces-add] [type=submit]');
  await waitFor("document.querySelector('[data-project-workspaces-list]').textContent.includes('coding-question-fixture')");
  const coding = "[data-coding-workbench]";
  await click(`[data-plugin-strip] [data-plugin-id="coding"]`);
  await waitFor(`document.querySelector('[data-work-surface="coding"]')?.getBoundingClientRect().width > 100`);
  await click(`${coding} [data-coding-new]`);
  await waitFor(`!document.querySelector('${coding} [data-coding-task]').disabled && document.querySelector('${coding} [data-coding-model]').options.length >= 1`);
  await fill(`${coding} [data-coding-model]`, JSON.stringify(["local-only", "fixture-plain"]));
  await fill(`${coding} [data-coding-intent]`, "discuss");
  await fill(`${coding} [data-coding-task]`, "登录和导出都坏了，先修哪个？");
  await waitFor(`!document.querySelector('${coding} [data-coding-send]').disabled`);
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
});
