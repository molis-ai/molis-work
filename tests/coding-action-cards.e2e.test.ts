import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { asideReply } from "./fixtures/ending-review.js";
import { goalsQueryOf } from "./fixtures/goal-application.js";

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

type Body = { tools?: Array<{ name: string; input_schema?: { properties?: { action?: { enum?: string[] } } } }>; messages?: unknown };

// specs/ai-interaction-experience AC-25 (second part, D25–D27): a Coding round suggests one of the actions it was given; the
// person sees the Host's operation card under the round and as a step beside the composer, changes its open field, and runs
// it once; the action runs under the round's own grant through agent.offers.run, and the card says how it ended.
test("AC-25: a Coding round's suggestion is a card the person runs once, with their change", { timeout: 240_000 }, async t => {
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const { runWithMolisWorkHome, resetSecretStoreCache } = await import("@molis-ai/molis-work-storage");
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); });
  const bodies: Body[] = [];
  let suggested = false;
  const model = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    // A round that changed nothing has its ending reviewed (D1②): answered "nothing found" without spending a scripted turn.
    const review = asideReply(raw);
    if (review) { res.writeHead(200, { "content-type": "text/event-stream" }); res.end(turn(review)); return; }
    const body = JSON.parse(raw) as Body; bodies.push(body);
    // Past 32 tools the round's tool shapes are deferred: then its first call finds the suggest tool; the next suggests creating
    // a Goal with the one action it was given, and the last one ends the round.
    const suggest = body.tools?.find(tool => tool.name.startsWith("molis-suggest-"));
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(!suggest && !suggested ? turn("", { name: "find-tools", input: { query: "button" } })
      : suggest && !suggested ? (suggested = true, turn("", { name: suggest.name, input: { action: suggest.input_schema?.properties?.action?.enum?.[0],
        title: "新建目标：写发布说明", summary: "在这个项目里新建目标「写发布说明」", input: { title: "写发布说明", idempotency_key: "coding-card-e2e" }, editable: ["title"] } }))
      : turn("我放了一张卡，点了才会新建目标。"));
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const b = await openGoalBrowser(t, "seeded"); if (!b) return;
  const child = await pluginFrameBrowser(t, b, "coding");
  const {click, evaluate, waitFor} = child;
  const { command, sessionId, homeDirectory, projectId } = b;
  await runWithMolisWorkHome(homeDirectory, () => withMolisWorkProjectCatalog({ homeDirectory }, catalog => {
    const connection = withConnectorConnections(homeDirectory, store => { const created = store.createToken({ serviceId: "model-api", displayName: "local-only", token: "fixture-local-model-key" }); store.assertTarget(created.connection_id, "model-api", `http://127.0.0.1:${address.port}`); return created; });
    catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "local-only", display_name: "本机", base_url: `http://127.0.0.1:${address.port}`, api_format: "anthropic-messages",
      models: [{ model_id: "fixture-plain", enabled: true }] });
  }));
  // The person granted the built-in Agent one action in this project (the capability service's own grant file).
  await mkdir(join(homeDirectory, "config"), { recursive: true });
  await writeFile(join(homeDirectory, "config", "mcp-tools.json"), JSON.stringify({ version: 3, action_grants: [{ client_id: "agent:prologue", project_id: projectId,
    capability_id: "goals.create", version: 1, provider_id: "io.molis.work.goals", permissions: ["goals:write"], enabled: true, generation: "grant-1" }] }));
  const workspace = join(homeDirectory, "coding-card-fixture");
  await mkdir(workspace, { recursive: true });
  const fill = (selector: string, value: string, page: Pick<typeof child, "evaluate"> = child) => page.evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.value=${JSON.stringify(value)};node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await b.navigate(() => command("Page.navigate", { url: `${b.origin}/projects/${projectId}/` }, sessionId));
  await b.click('.navigator-project-settings');
  await b.waitFor("!!document.querySelector('[data-directory-panel=project-settings] [data-settings-section=workspaces]')");
  await b.click('[data-directory-panel=project-settings] [data-settings-section=workspaces]');
  await b.waitFor("!!document.querySelector('[data-project-workspaces-add]') && !document.querySelector('[data-project-workspaces-refresh]').disabled");
  await fill('[data-project-workspaces-add] [name=path]', workspace, b);
  await b.click('[data-project-workspaces-add] [type=submit]');
  await b.waitFor("document.querySelector('[data-project-workspaces-list]').textContent.includes('coding-card-fixture')");
  const coding = "[data-coding-workbench]";
  await b.click(`[data-plugin-strip] [data-plugin-id="coding"]`);
  await b.waitFor(`document.querySelector('[data-work-surface="coding"]')?.getBoundingClientRect().width > 100`);
  await click(`${coding} [data-coding-new]`);
  await waitFor(`!document.querySelector('${coding} [data-coding-task]').disabled && document.querySelector('${coding} [data-coding-model]').options.length >= 1`);
  await fill(`${coding} [data-coding-model]`, JSON.stringify(["local-only", "fixture-plain"]));
  await fill(`${coding} [data-coding-intent]`, "execute");
  // The round is given the one granted action.
  await click(`${coding} [data-coding-attach-toggle]`);
  await click(`${coding} [data-coding-actions-open]`);
  const granted = `[...document.querySelectorAll('${coding} [data-coding-actions-list] label')].find(row => row.textContent.includes('创建目标'))?.querySelector('input')`;
  await waitFor(`${granted} && !${granted}.disabled`, 15_000);
  await evaluate(`(()=>{const input=${granted};input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await click(`${coding} [data-coding-actions-save]`);
  await waitFor(`!document.querySelector('${coding} [data-coding-actions-dialog]').open`);
  await fill(`${coding} [data-coding-task]`, "整理一下这次发布要做的事");
  await waitFor(`!document.querySelector('${coding} [data-coding-send]').disabled`);
  await click(`${coding} [data-coding-send]`);

  // The Host's operation card, under the round that suggested it, and a step beside the composer that runs it.
  const card = `${coding} [data-coding-cards] [data-ix-operation]`;
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(card)}))`, 60_000);
  const shown = await evaluate<{ title: string; field: string; run: string }>(`(()=>{const node=document.querySelector(${JSON.stringify(card)});
    return {title:node.querySelector('h3').textContent,field:node.querySelector('[data-ix-field="title"] [data-ix-value]')?.value||'',run:node.querySelector('[data-ix-action="run"]')?.textContent||''};})()`);
  assert.deepEqual(shown, { title: "新建目标：写发布说明", field: "写发布说明", run: "新建目标：写发布说明" }, "the card shows the suggestion and runs by its words");
  await waitFor(`[...document.querySelectorAll('${coding} [data-coding-steps]:not([hidden]) [data-ix-step-label]')].some(step => step.textContent === '新建目标：写发布说明')`, 15_000);
  await evaluate(`document.querySelector(${JSON.stringify(card)}).scrollIntoView({block:'center'})`);
  await waitFor(`document.getAnimations().every(animation => animation.playState !== 'running' || animation.effect?.getTiming().iterations === Infinity)`, 5_000);
  const evidence = reviewEvidenceUrl("ai-interaction/"); await mkdir(evidence, { recursive: true });
  await writeFile(new URL("coding-action-card.png", evidence), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));

  // A step does not send what the person has not looked at: with an unsent change it only brings the card into view (FLOW-03).
  await evaluate(`(() => { window.__runs = []; const original = window.fetch; window.fetch = async (...args) => {
    if (String(args[0]).includes('/cards/') && String(args[0]).endsWith('/run')) window.__runs.push(JSON.parse(args[1].body)); return original(...args); }; })()`);
  await fill(`${card} [data-ix-field="title"] [data-ix-value]`, "写 1.4 发布说明");
  await click(`${coding} [data-coding-steps] [data-ix-step-id$=":run"]`);
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(await evaluate<number>(`window.__runs.length`), 0, "a step runs nothing while the card holds an unsent change");
  // The card's own button runs it once, with the change; a card that ran offers no second run.
  await click(`${card} [data-ix-action="run"]`);
  await waitFor(`document.querySelector(${JSON.stringify(card)})?.querySelector('[data-ix-status]')?.textContent.includes('已完成')`, 30_000);
  assert.equal(await evaluate<number>(`window.__runs.length`), 1);
  assert.equal(await evaluate<string>(`window.__runs[0].values.title`), "写 1.4 发布说明", "the card ran with the person's change");
  assert.equal(await evaluate<boolean>(`Boolean(document.querySelector(${JSON.stringify(card)}).querySelector('[data-ix-action="run"]'))`), false, "a card that ran offers no second run");
  await waitFor(`![...document.querySelectorAll('${coding} [data-coding-steps] [data-ix-step-label]')].some(step => step.textContent.includes('写发布说明'))`, 15_000);
  const goals = goalsQueryOf(b.store).listGoals(projectId).map(goal => goal.title);
  assert.deepEqual(goals.filter(title => title.includes("发布说明")), ["写 1.4 发布说明"], "the Goal was created once, as the person changed it");
});
