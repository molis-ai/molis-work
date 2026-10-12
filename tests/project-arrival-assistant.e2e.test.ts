import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";

// ISSUE-29: the chooser's next work belongs to the selected project (or to the person),
// and its HTTP route must give the Host that same trusted context.
test("the chooser sends from the selected project and switches back to personal work", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "user");
  if (!browser) return;
  const { homeDirectory, projectId, origin, command, sessionId, navigate, evaluate, waitFor, click } = browser;
  const model = await issueModel(t, homeDirectory, { replyText: "已收到本轮查询。" });
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/" }, sessionId));
  await waitFor(`document.querySelector('.chooser')?.dataset.selected === ${JSON.stringify(projectId)}`);
  type Work = { work_id: string; scope: { kind: string; project_id?: string }; state: string };
  const works = () => evaluate<Work[]>("fetch('/api/assistant/works').then(r => r.json()).then(b => b.works)");
  const send = async (text: string, count: number) => {
    await click("[data-assistant-input]");
    await command("Input.insertText", { text }, sessionId);
    await click("[data-assistant-send]");
    await waitFor("document.querySelector('[data-assistant-thread]').textContent.includes('已收到本轮查询') || document.querySelector('.assistant-problem')", 20_000);
    assert.match(await evaluate<string>("document.querySelector('[data-assistant-thread]').textContent"), /已收到本轮查询/);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const saved = await works();
      if (saved.length === count && saved.every(work => work.state === "completed")) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail("the model answer must have completed persistent work");
  };
  await send("项目内查询，不修改数据", 1);
  assert.deepEqual((await works())[0]!.scope, { kind: "project", project_id: projectId });

  await click("[data-assistant-new]");
  await click("[data-assistant-panel-close]");
  await waitFor("document.querySelector('[data-assistant-panel]').hidden");
  await click("#row-personal");
  await send("个人查询，不修改数据", 2);
  assert.deepEqual((await works()).find(w => w.scope.kind === "personal")?.scope, { kind: "personal" });
  assert.equal(model.requests.length, 2, "each click starts exactly one model round");

  const refused = await evaluate<{ status: number; code?: string }>(`fetch('/api/assistant/send', {
    method: 'POST', headers: globalThis.molisWorkControlHeaders(),
    body: JSON.stringify({ text: '错误作用域', request_id: 'chooser-invalid-scope', scope: { kind: 'project', project_id: ${JSON.stringify(projectId)} } })
  }).then(async r => ({status: r.status, code: (await r.json()).code}))`);
  assert.deepEqual(refused, { status: 403, code: "assistant.scope" }, "Home requests still cannot claim a project in the payload");
  await navigate(() => command("Page.reload", {}, sessionId));
  assert.equal((await works()).length, 2, "both works persist and the refused request creates nothing");
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click("[data-assistant-input]");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await waitFor("!document.querySelector('[data-assistant-panel]').hidden");
  await click("[data-assistant-panel-close]");
  await waitFor("document.querySelector('[data-assistant-panel]').hidden", 4_000);
});
