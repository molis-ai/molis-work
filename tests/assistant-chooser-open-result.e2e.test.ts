import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createServer } from "node:http";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { SKILLS_PROVIDER_ID, skillDraftActions, type SkillDraftSummary } from "@molis-ai/molis-work-contracts/services/skills";
import { asideReply } from "./fixtures/ending-review.js";

/** One streamed model turn: a tool call, or plain text. */
function turn(tool?: { name: string; input: unknown }, text = "记下了。"): string {
  const events: string[] = [], emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture-model", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: tool ? { type: "tool_use", id: `call-${Math.random().toString(36).slice(2)}`, name: tool.name, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: tool ? { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } : { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return events.join("");
}

async function resultModel(t: TestContext, script: readonly (() => string)[]) {
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const { runWithMolisWorkHome, resetSecretStoreCache } = await import("@molis-ai/molis-work-storage");
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); });
  let turns = 0;
  const model = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    const review = asideReply(raw);
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(review ? turn(undefined, review) : (script[turns++] ?? (() => turn()))());
  });
  await new Promise<void>((resolve) => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { model.closeAllConnections(); await new Promise<void>((resolve) => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  return async (homeDirectory: string) => {
    await runWithMolisWorkHome(homeDirectory, () => withMolisWorkProjectCatalog({ homeDirectory }, (catalog) => {
      const connection = withConnectorConnections(homeDirectory, (store) => { const created = store.createToken({ serviceId: "model-api", displayName: "local-only", token: "fixture-local-model-key" }); store.assertTarget(created.connection_id, "model-api", `http://127.0.0.1:${address.port}`); return created; });
      catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "local-only", display_name: "本机 HTTP 模型", base_url: `http://127.0.0.1:${address.port}`, api_format: "anthropic-messages", models: [{ model_id: "fixture-model", enabled: true }] });
    }));
  };
}

// VUX-12: a project result from the chooser opens in its owning project; Back returns to the chooser.
test("VUX-12: a result made from the project chooser opens on its project's page, and back returns to the chooser", { timeout: 120_000 }, async (t) => {
  const prepareHome = await resultModel(t, [
    () => turn({ name: "change-reversible", input: { capability_id: "todo.items.create", version: 1, provider_id: "io.molis.work.todo", input: { title: "订读书会的场地" } } }),
  ]);
  const browser = await openGoalBrowser(t, true, undefined, undefined, undefined, undefined, { prepareHome }); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const todo = await pluginFrameBrowser(t, browser, "todo");

  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/" }, sessionId));
  await waitFor(`document.querySelector('.chooser')?.dataset.selected === ${JSON.stringify(projectId)}`);
  await click("[data-assistant-composer] .mw-composer__input");
  await command("Input.insertText", { text: "记一下：订读书会的场地" }, sessionId);
  await click("[data-assistant-composer] [data-composer-send]");
  const step = "[data-assistant-next-row] [data-ix-step-id^=\"open:\"]";
  await waitFor(`document.querySelector(${JSON.stringify(step)})`, 30_000);
  await navigate(() => evaluate(`document.querySelector(${JSON.stringify(step)}).click()`));
  await waitFor(`location.pathname === ${JSON.stringify(`/projects/${projectId}/`)}`, 20_000);
  // The to-do the assistant made, open in the plugin that owns it.
  await waitFor("document.body.dataset.desktopSurface === 'todo'", 20_000);
  await todo.waitFor("document.querySelector('[data-todo-field=title]')?.value === '订读书会的场地'", 20_000);
  await navigate(() => command("Page.navigate", { url: "javascript:history.back()" }, sessionId).catch(() => evaluate("history.back()")));
  await waitFor("document.querySelector('.chooser')", 20_000);
});

for (const scope of ["home", "project"] as const) test(`QEA-124 the ${scope} assistant receipt opens its written Skill draft`, { timeout: 120_000 }, async t => {
  const name = scope === "home" ? "个人复盘草稿" : "项目复盘草稿";
  const fields = { name, description: "收到复盘材料时使用。", applies_to: "assistant", body: "# 整理复盘\n\n按决定和后续动作整理。" };
  const finished = "已把这套做法起草。";
  const prepareHome = await resultModel(t, [
    () => turn({ name: "change-reversible", input: {
      capability_id: skillDraftActions.create.capability_id, version: skillDraftActions.create.version, provider_id: SKILLS_PROVIDER_ID,
      input: { scope, target: { kind: "new" }, fields },
    } }),
    () => turn(undefined, finished),
  ]);
  const browser = await openGoalBrowser(t, "user", undefined, undefined, undefined, undefined, { prepareHome }); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = browser;
  const prefix = scope === "home" ? "" : `/projects/${projectId}`;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/" }, sessionId));
  await click(scope === "home" ? "#row-personal" : `#row-${projectId}`);
  await click("[data-assistant-composer] .mw-composer__input");
  await command("Input.insertText", { text: "把刚才的复盘做法存成技能草稿" }, sessionId);
  await click("[data-assistant-composer] [data-composer-send]");
  await waitFor(`document.querySelector('[data-assistant-thread]')?.innerText.includes(${JSON.stringify(finished)})`, 35_000);
  const drafts = () => evaluate<SkillDraftSummary[]>(`fetch(${JSON.stringify(prefix + "/api/skills/drafts/list")}, {
    method: 'POST', headers: molisWorkControlHeaders(), body: '{}'
  }).then(async response => {
    const result = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(result));
    return result.drafts;
  })`);
  const stored = await drafts();
  assert.deepEqual(stored.map(draft => [draft.name, draft.scope, draft.origin.by, draft.revision]), [[fields.name, scope, "assistant", 1]]);
  const [draft] = stored;
  const href = `${prefix}/settings/kit?draft=${draft!.draft_id}`;
  const receipt = `[data-assistant-thread] [data-card] a[data-ix-press=open][href=${JSON.stringify(href)}]`;
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(receipt)})?.textContent.trim()`), "打开草稿", "successful receipt points to the original draft");
  // QEA-192: wait for the destination document before reading its editor.
  await navigate(() => click(receipt));
  await waitFor(`document.querySelector('#au-name')?.value === ${JSON.stringify(fields.name)}`, 20_000);
  assert.equal(await evaluate("document.querySelector('#au-body')?.value"), fields.body);
  assert.equal(await evaluate("document.querySelector('[data-kit-settings]')?.dataset.project"), scope === "home" ? "" : projectId);
  assert.deepEqual(await drafts(), stored, "opening the receipt performs no new write");
});
