import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import type { AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { setProjectOutputFolder } from "./fixtures/project-directories-http.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";
import { cogniaModelResponse, cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";
import { asideReply } from "./fixtures/ending-review.js";
import { untilSetup } from "./fixtures/connector-assistant-model.js";
import { CODING_OPEN, CODING_SEND, codingControl, codingType } from "./fixtures/coding-composer.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

test("QEA-48 · real exhausted subagents extend only their own budget from both Coding views, recover a failed write and retry with the original permission ceiling and frozen model", { timeout: 180_000 }, async t => {
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); });
  type Body = { system?: unknown; messages: unknown; model: string; tools?: Array<{ name: string }> };
  const childCalls: Body[] = [], release = Promise.withResolvers<void>();
  let dispatched = 0, recover = false;
  t.after(() => release.resolve());
  const model = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    const aside = asideReply(raw), body = JSON.parse(raw) as Body;
    let result: Response;
    if (aside) result = cogniaModelResponse(aside);
    else if (!body.tools?.some(tool => tool.name === "dispatch-subagent") && JSON.stringify(body.messages).includes("QEA_CHILD")) {
      childCalls.push(body);
      if (recover) { await release.promise; result = cogniaModelResponse('Recovered child <img src=x onerror="globalThis.budgetInjected=1">'); }
      else result = Response.json({ type: "error", error: { type: "invalid_request_error", message: "Fixture child provider refused this attempt" } }, { status: 400 });
    } else if (dispatched < 2) {
      const character = JSON.stringify(body.system).match(/molis-child-[a-z0-9-]+@\d+/)?.[0];
      assert.ok(character, "the actual coordinator lists a registered child character");
      dispatched++;
      result = cogniaScriptedResponse({ name: "dispatch-subagent", input: { instruction: `QEA_CHILD_${dispatched} inspect module boundaries`,
        tools: ["read", "search", "context-remaining"], character, idempotencyKey: `budget-child-${dispatched}` } });
    } else result = cogniaModelResponse("两个子任务已派出，请查看各自结果。");
    response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text());
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const b = await openGoalBrowser(t, "seeded", undefined, undefined, {}, undefined, {
    prepareHome: home => seedConfiguredModels(home, [{ provider_id: "fixture", model_id: "fixture-model" }, { provider_id: "fixture", model_id: "different-next-model" }], `http://127.0.0.1:${address.port}`),
  });
  if (!b) return;
  assert.ok(b.localHost);
  const directory = join(b.homeDirectory, "budget-recovery"); await mkdir(directory);
  await writeFile(join(directory, "note.txt"), "Fixture content remains unchanged.\n");
  await setProjectOutputFolder(b.web, b.projectId!, directory);
  const frame = await pluginFrameBrowser(t, b, "coding");
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/?openPlugin=coding` }, b.sessionId));
  await frame.click("[data-coding-new]"); await b.waitFor(CODING_OPEN);
  const sid = await frame.evaluate<string>("document.querySelector('[data-coding-session].is-selected').dataset.codingSession");
  const choose = (id: string, value: string) => b.evaluate(`{ const node = document.querySelector(${JSON.stringify(codingControl(id))}); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event('change', { bubbles: true })); }`);
  await choose("model", JSON.stringify(["fixture", "fixture-model"])); await choose("intent", "collaborate");
  await b.evaluate(codingType("派出两个只读子任务检查模块边界")); await b.click(CODING_SEND);
  const approve = "[data-host-review-slot] [data-agent-review-approve]";
  for (let index = 1; index <= 2; index++) {
    await untilSetup(async () => dispatched >= index ? true : undefined, "coordinator requests child dispatch");
    await b.waitFor(`document.querySelector(${JSON.stringify(approve)})`);
    const reviewId = await b.evaluate<string>(`document.querySelector(${JSON.stringify(approve)}).dataset.agentReviewApprove`);
    await b.click(approve); await b.click("[data-page-dialog=confirm] [type=submit]");
    await b.waitFor(`!document.querySelector('[data-agent-review-approve="${reviewId}"]')`);
  }
  await frame.waitFor("document.querySelector('[data-coding-workbench]').textContent.includes('两个子任务已派出')", 30_000);
  const api = `/projects/${b.projectId}/api/plugins/io.molis.work.coding/sessions/${sid}`;
  const session = await b.web.get<{ runs: Array<{ ref: AgentRunRef }> }>(api);
  const ref = session.runs.at(-1)!.ref;
  const adapter = ensureSystemAgentService(b.localHost, b.homeDirectory).agentHost.adapter("prologue"), port = adapter.subagents!;
  const failed = await untilSetup(async () => { const rows = await port.list(ref); return rows.length === 2 && rows.every(row => row.state === "failed") ? rows : undefined; }, "both real children fail");
  const readerTools = ["list", "search", "read", "ask-user"];
  assert.deepEqual(childCalls[0]!.tools?.map(tool => tool.name), [...readerTools, "board-read", "board-report"]);
  await untilSetup(async () => (await adapter.read(ref)).phase === "completed" ? true : undefined, "parent has actually ended before child retry");
  await b.reloadPage(); await b.waitFor(CODING_OPEN);
  const ids = failed.map(row => row.subagent_id);
  const card = (id: string) => `.coding-child[data-child="${id}"]`;
  const panel = (id: string) => `[data-coding-subagents] > details[data-child="${id}"]`;
  const clickText = async (selector: string, label: string) => {
    await frame.waitFor(`[...document.querySelectorAll(${JSON.stringify(selector + " button")})].some(button => button.textContent === ${JSON.stringify(label)} && !button.disabled)`);
    await frame.evaluate(`[...document.querySelectorAll(${JSON.stringify(selector + " button")})].find(button => button.textContent === ${JSON.stringify(label)}).click()`);
  };
  const readChild = async (id: string) => (await port.list(ref)).find(row => row.subagent_id === id)!;
  for (const id of ids) {
    await clickText(card(id), "重试这个子任务");
    await untilSetup(async () => { const row = await readChild(id); return row.state === "failed" && row.budget?.attempt === 2 ? row : undefined; }, "actual retry consumes second attempt");
  }
  const exhausted = await port.list(ref);
  assert.ok(exhausted.every(row => row.budget?.exhausted && row.budget.max_attempts === 2));
  const callsBeforeExtension = childCalls.length;
  // Fail at the real owner boundary before a budget write. The same UI control must recover.
  let failExtension = true, extensionCalls = 0;
  const command = port.command!.bind(port);
  t.mock.method(port, "command", async (...args: Parameters<typeof command>) => {
    if (args[2].kind === "extend-budget") {
      extensionCalls++;
      if (failExtension) throw new Error("Fixture budget write unavailable");
    }
    return command(...args);
  });
  await clickText(card(ids[0]!), "再给 3 次");
  await untilSetup(async () => extensionCalls === 1 ? true : undefined, "extension reaches actual owner");
  await frame.waitFor(`document.querySelector(${JSON.stringify(card(ids[0]!) + " [data-coding-extend-budget]")})?.disabled === false`);
  assert.deepEqual(await port.list(ref), exhausted); assert.equal(childCalls.length, callsBeforeExtension);
  failExtension = false;
  await clickText(card(ids[0]!), "再给 3 次");
  await untilSetup(async () => (await readChild(ids[0]!)).budget?.max_attempts === 5 ? true : undefined, "card extends actual budget");
  assert.deepEqual(await readChild(ids[1]!), exhausted[1]);
  await frame.click("[data-coding-results-open]");
  await frame.evaluate(`document.querySelector(${JSON.stringify(panel(ids[1]!))}).open = true`);
  await clickText(panel(ids[1]!), "再给 3 次");
  await untilSetup(async () => (await readChild(ids[1]!)).budget?.max_attempts === 5 ? true : undefined, "sidebar extends actual budget");
  assert.equal(childCalls.length, callsBeforeExtension);
  for (const id of ids) {
    const row = await readChild(id); assert.equal(row.state, "failed"); assert.equal(row.budget?.attempt, 2);
    for (const selector of [card(id), panel(id)]) {
      await frame.waitFor(`document.querySelector(${JSON.stringify(selector + " [role=progressbar]")})?.getAttribute('aria-valuenow') === '40'`);
      assert.equal(await frame.evaluate(`document.querySelector(${JSON.stringify(selector + " .mw-attempt__meter i")}).style.transform`), "scaleX(0.4)");
    }
  }
  await choose("model", JSON.stringify(["fixture", "different-next-model"])); recover = true;
  await clickText(card(ids[0]!), "重试这个子任务");
  await untilSetup(async () => childCalls.length > callsBeforeExtension ? true : undefined, "explicit retry reaches model");
  const running = await readChild(ids[0]!); assert.equal(running.state, "running"); assert.equal(running.budget?.attempt, 3);
  assert.equal(running.child_run?.session_id, failed[0]!.child_run?.session_id);
  assert.notEqual(running.child_run?.run_id, failed[0]!.child_run?.run_id);
  assert.equal(running.budget?.prior_attempts?.length, 2);
  assert.equal(childCalls.at(-1)!.model, "fixture-model"); assert.deepEqual(running.host_tools, failed[0]!.host_tools);
  // SDK continue is deliberately unbound from the dispatch's returned task-board step (runtime.d.ts).
  // The original reader can ask the person. Board tools require a new dispatch or handover.
  assert.deepEqual(childCalls.at(-1)!.tools?.map(tool => tool.name), readerTools);
  await frame.waitFor(`document.querySelector(${JSON.stringify(card(ids[0]!) + " .coding-child-mark")})?.dataset.mwState === 'running'`);
  assert.equal(await frame.evaluate(`Boolean(document.querySelector(${JSON.stringify(card(ids[0]!) + " [data-coding-extend-budget]")}))`), false);
  release.resolve();
  await untilSetup(async () => (await readChild(ids[0]!)).state === "completed" ? true : undefined, "explicit retry completes");
  await frame.waitFor(`document.querySelector(${JSON.stringify(card(ids[0]!))})?.textContent.includes('Recovered child')`);
  assert.equal(await frame.evaluate("Boolean(globalThis.budgetInjected) || Boolean(document.querySelector('.coding-child-result img[onerror]'))"), false);
  await b.reloadPage(); await b.waitFor(CODING_OPEN);
  const persisted = await port.list(ref); assert.equal(persisted[0]!.budget?.max_attempts, 5); assert.equal(persisted[0]!.budget?.attempt, 3);
  assert.equal(persisted[1]!.budget?.max_attempts, 5); assert.equal(persisted[1]!.budget?.attempt, 2);
  const evidence = reviewEvidenceUrl("quality-audit-coding-recovery/"); await mkdir(evidence, { recursive: true });
  for (const width of [1440, 1024, 390]) for (const theme of ["light", "dark"]) {
    await b.setViewport(width, 900);
    await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }, { name: "prefers-reduced-motion", value: "reduce" }] }, b.sessionId);
    await frame.evaluate(`document.querySelector(${JSON.stringify(card(ids[0]!))}).scrollIntoView({ block: 'center' })`);
    await writeFile(new URL(`budget-${theme}-${width}.png`, evidence), Buffer.from((await b.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, b.sessionId)).data, "base64"));
  }
});
