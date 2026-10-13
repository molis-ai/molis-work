import assert from "node:assert/strict";
import test from "node:test";
import { openWork, putInput, readWork, seedWork, sendBarrier, sendBrowser, waitWork } from "./fixtures/assistant-send-journey.js";

// W2-18-SEND-01: a real draft HTTP request holds Send while the person chooses B and prepares B's next message.
test("W2-18-SEND-01: waiting for A's draft sends A's intent and preserves B's selection, draft and materials", { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const a = await seedWork(browser, "工作 A"), b = await seedWork(browser, "工作 B");
  await openWork(browser, a);
  const beforeB = await readWork(browser, b);
  const barrier = await sendBarrier(browser, [{ urlPattern: `*/api/assistant/works/${a}/draft`, requestStage: "Request" }, { urlPattern: "*/api/assistant/send", requestStage: "Response" }]);
  try {
    await putInput(browser, "只给 A 的补充", "A 的材料");
    const draft = await barrier.next();
    await browser.click("[data-assistant-send]");
    await openWork(browser, b);
    await putInput(browser, "B 的下一条输入", "B 的材料");
    await barrier.release(draft);
    const sent = await barrier.next();
    const body = JSON.parse(sent.request.postData!);
    assert.equal(body.work_id, a, "the delayed request must still name the work chosen at Send");
    assert.equal(body.text, "只给 A 的补充");
    assert.deepEqual(body.materials.map((item: { title: string }) => item.title), ["A 的材料"]);
    await barrier.release(sent);
    await browser.waitFor("!document.querySelector('[data-assistant-send]').disabled");
    assert.equal(await browser.evaluate("localStorage.getItem('molis.assistant.current')"), b);
    assert.equal(await browser.evaluate("document.querySelector('[data-assistant-input]').value"), "B 的下一条输入");
    assert.match(await browser.evaluate<string>("document.querySelector('[data-assistant-materials]').getAttribute('aria-label')"), /B 的材料/);
    const afterA = await readWork(browser, a), afterB = await readWork(browser, b);
    assert.equal(afterA.rounds.at(-1)?.text, "只给 A 的补充");
    assert.deepEqual(afterB.rounds, beforeB.rounds, "B receives no round or steer from A's send");
    await waitWork(browser, b, view => view.work.draft === "B 的下一条输入");
    await browser.reloadPage();
    await browser.waitFor("document.querySelector('[data-assistant-input]').value === 'B 的下一条输入'");
    assert.equal(await browser.evaluate("localStorage.getItem('molis.assistant.current')"), b, "the preserved draft and choice survive a reload");
  } finally { await barrier.close(); }
});

// W2-18-SEND-01: a real refusal includes work A; receiving it late must not put A's problem or draft into B.
test("W2-18-SEND-01: a late Host refusal belongs to A and leaves B's input and materials intact", { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t, false); if (!browser) return;
  const a = await seedWork(browser, "未配置模型的 A"), b = await seedWork(browser, "未配置模型的 B");
  await openWork(browser, a);
  const beforeB = await readWork(browser, b);
  const barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/send", requestStage: "Response" }]);
  try {
    await putInput(browser, "A 的失败输入", "A 的材料");
    await browser.click("[data-assistant-send]");
    const sent = await barrier.next();
    assert.ok(sent.responseStatusCode! >= 400, "this is a real Host refusal, not a fabricated error body");
    await openWork(browser, b);
    await putInput(browser, "B 留下的输入", "B 的材料");
    await barrier.release(sent);
    await browser.waitFor("!document.querySelector('[data-assistant-send]').disabled");
    assert.equal(await browser.evaluate("localStorage.getItem('molis.assistant.current')"), b);
    assert.equal(await browser.evaluate("document.querySelector('[data-assistant-input]').value"), "B 留下的输入");
    assert.equal(await browser.evaluate("document.querySelector('.assistant-problem')"), null);
    assert.match(await browser.evaluate<string>("document.querySelector('[data-assistant-materials]').getAttribute('aria-label')"), /B 的材料/);
    assert.equal((await readWork(browser, a)).work.draft, "A 的失败输入");
    assert.deepEqual((await readWork(browser, b)).rounds, beforeB.rounds);
  } finally { await barrier.close(); }
});

// W2-18-SEND-02: even the chooser's trusted HTTP project route and an unknown result's retry stay fixed at the click.
test("W2-18-SEND-02: chooser changes and a lost receipt retry the original scope, materials and request_id exactly once", { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const a = await seedWork(browser, "等待草稿的旧工作");
  await openWork(browser, a);
  const barrier = await sendBarrier(browser, [{ urlPattern: `*/api/assistant/works/${a}/draft`, requestStage: "Request" }, { urlPattern: "*/api/assistant/send", requestStage: "Response" }]);
  try {
    await putInput(browser, "留在旧工作里的草稿");
    const draft = await barrier.next();
    await browser.click("[data-assistant-new]");
    await putInput(browser, "项目 A 的新工作", "项目 A 的材料");
    await browser.click("[data-assistant-send]");
    await browser.click("#row-personal");
    await putInput(browser, "项目 A 的新工作", "后来选择的材料");
    await barrier.release(draft);
    const first = await barrier.next();
    const body = JSON.parse(first.request.postData!);
    assert.equal(new URL(first.request.url).pathname, `/projects/${browser.projectId}/api/assistant/send`);
    assert.deepEqual(body.scope, { kind: "project", project_id: browser.projectId });
    assert.deepEqual(body.materials.map((item: { title: string }) => item.title), ["项目 A 的材料"]);
    assert.equal(first.responseStatusCode, 200, "the Host committed before the response is lost");
    const created = await browser.evaluate<Array<{ work_id: string }>>("fetch('/api/assistant/works').then(r => r.json()).then(b => b.works)");
    const newId = created.find(work => work.work_id !== a)?.work_id; assert.ok(newId);
    await barrier.drop(first);
    await browser.waitFor("!document.querySelector('[data-assistant-send]').disabled");
    await browser.click("[data-assistant-send]");
    const retry = await barrier.next();
    assert.equal(retry.request.url, first.request.url, "retry keeps the original trusted route");
    assert.deepEqual(JSON.parse(retry.request.postData!), body, "including context, original materials and request_id");
    await barrier.release(retry);
    await browser.waitFor("!document.querySelector('[data-assistant-send]').disabled");
    assert.equal(await browser.evaluate("document.querySelector('.chooser').dataset.selected"), "personal");
    assert.equal(await browser.evaluate("localStorage.getItem('molis.assistant.current')"), null);
    assert.equal(await browser.evaluate("document.querySelector('[data-assistant-input]').value"), "项目 A 的新工作");
    assert.match(await browser.evaluate<string>("document.querySelector('[data-assistant-materials]').getAttribute('aria-label')"), /后来选择的材料/);
    const persisted = await waitWork(browser, newId, view => view.work.state === "completed");
    assert.deepEqual(persisted.work.scope, { kind: "project", project_id: browser.projectId });
    assert.equal(persisted.rounds.length, 1, "two HTTP attempts produce one stored round");
    assert.equal(persisted.rounds[0]?.text, "项目 A 的新工作");
    assert.equal(browser.model!.requests.length, 2, "one seed round and one new round; retry does not run the model again");
  } finally { await barrier.close(); }
});
