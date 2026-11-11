import assert from "node:assert/strict";
import test from "node:test";
import { openWork, putInput, readWork, seedWork, sendBarrier, sendBrowser, waitWork } from "./fixtures/assistant-send-journey.js";
import { CURRENT_WORK } from "./fixtures/assistant-current-work.js";

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
    await browser.evaluate("document.querySelector('.chooser').setAttribute('data-assistant-context', JSON.stringify({ plugin_id: 'todo', surface_title: '页面 A' }))");
    await browser.click("[data-assistant-composer] [data-composer-send]");
    await openWork(browser, b);
    await browser.evaluate("document.querySelector('.chooser').setAttribute('data-assistant-context', JSON.stringify({ plugin_id: 'todo', surface_title: '页面 B' }))");
    await putInput(browser, "B 的下一条输入", "B 的材料");
    await barrier.release(draft);
    const sent = await barrier.next();
    const body = JSON.parse(sent.request.postData!);
    assert.equal(body.work_id, a, "the delayed request must still name the work chosen at Send");
    assert.equal(body.text, "只给 A 的补充");
    assert.equal(body.context.source.title, "页面 A", "context is captured with the original work before waiting for its draft");
    assert.deepEqual(body.materials.map((item: { title: string }) => item.title), ["A 的材料"]);
    await barrier.release(sent);
    await browser.waitFor("!document.querySelector('[data-assistant-composer] [data-composer-send]').disabled");
    assert.equal(await browser.evaluate(CURRENT_WORK), b);
    assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] .mw-composer__input').value"), "B 的下一条输入");
    assert.match(await browser.evaluate<string>("document.querySelector('[data-assistant-context-strip]:not([hidden])').textContent"), /B 的材料/);
    const afterA = await readWork(browser, a), afterB = await readWork(browser, b);
    assert.equal(afterA.rounds.at(-1)?.text, "只给 A 的补充");
    assert.deepEqual(afterB.rounds, beforeB.rounds, "B receives no round or steer from A's send");
    await waitWork(browser, b, view => view.work.draft === "B 的下一条输入");
    await browser.reloadPage();
    await browser.waitFor("document.querySelector('[data-assistant-composer] .mw-composer__input').value === 'B 的下一条输入'");
    assert.equal(await browser.evaluate(CURRENT_WORK), b, "the preserved draft and choice survive a reload");
  } finally { await barrier.close(); }
});

// W3-10-4-01 and W2-18-SEND-01: a real refusal includes work A; receiving it late must not put A's problem or draft into B.
test("W2-18-SEND-01: a late Host refusal belongs to A and leaves B's input and materials intact", { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t, false); if (!browser) return;
  const a = await seedWork(browser, "未配置模型的 A"), b = await seedWork(browser, "未配置模型的 B");
  await openWork(browser, a);
  const beforeB = await readWork(browser, b);
  const barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/send", requestStage: "Response" }]);
  try {
    await putInput(browser, "A 的失败输入", "A 的材料");
    await browser.click("[data-assistant-composer] [data-composer-send]");
    const sent = await barrier.next();
    assert.ok(sent.responseStatusCode! >= 400, "this is a real Host refusal, not a fabricated error body");
    await openWork(browser, b);
    await putInput(browser, "B 留下的输入", "B 的材料");
    await barrier.release(sent);
    await browser.waitFor("!document.querySelector('[data-assistant-composer] [data-composer-send]').disabled");
    assert.equal(await browser.evaluate(CURRENT_WORK), b);
    assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] .mw-composer__input').value"), "B 留下的输入");
    assert.equal(await browser.evaluate("document.querySelector('.assistant-problem')"), null);
    assert.match(await browser.evaluate<string>("document.querySelector('[data-assistant-context-strip]:not([hidden])').textContent"), /B 的材料/);
    assert.equal((await readWork(browser, a)).work.draft, "A 的失败输入");
    assert.deepEqual((await readWork(browser, b)).rounds, beforeB.rounds);
  } finally { await barrier.close(); }
});

// W2-18-SEND-01: switching away saves a newer draft for A after its send, so the Host cannot clear that later input.
test("W2-18-SEND-01: text written after Send survives in A while B remains current", { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const a = await seedWork(browser, "工作 A"), b = await seedWork(browser, "工作 B");
  await openWork(browser, a);
  const barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/send", requestStage: "Response" }]);
  try {
    await putInput(browser, "A 发出的内容");
    await browser.click("[data-assistant-composer] [data-composer-send]");
    const sent = await barrier.next();
    await putInput(browser, "A 还没发送的新输入");
    await openWork(browser, b);
    await putInput(browser, "B 的输入");
    await barrier.release(sent);
    await browser.waitFor("!document.querySelector('[data-assistant-composer] [data-composer-send]').disabled");
    const afterA = await waitWork(browser, a, view => view.work.draft === "A 还没发送的新输入");
    assert.equal(afterA.rounds.at(-1)?.text, "A 发出的内容");
    assert.equal(afterA.rounds.length, 2);
    assert.equal(await browser.evaluate(CURRENT_WORK), b);
    assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] .mw-composer__input').value"), "B 的输入");
    const afterB = await waitWork(browser, b, view => view.work.draft === "B 的输入");
    assert.equal(afterB.rounds.length, 1);
  } finally { await barrier.close(); }
});

// W2-18-SEND-01: returning to A before its receipt must read A's later draft, even after B rereads the work list.
test("W2-18-SEND-01: A to B to A before the receipt retains A's later draft on screen, in Host and after reload", { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const a = await seedWork(browser, "工作 A"), b = await seedWork(browser, "工作 B");
  await openWork(browser, b); await openWork(browser, a);
  await browser.waitFor("document.querySelector('[data-assistant-thread]').textContent.includes('工作 A')");
  await browser.command("Network.enable", {}, browser.sessionId);
  const barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/send", requestStage: "Response" }]);
  try {
    await putInput(browser, "A 已发送的文字");
    await browser.click("[data-assistant-composer] [data-composer-send]");
    const sent = await barrier.next();
    await putInput(browser, "A 等回执期间写下的 X");
    await browser.click(`[data-assistant-tabs] [data-tab="${b}"] .assistant-tab-main`);
    await browser.waitFor("document.querySelector('[data-assistant-thread]').textContent.includes('工作 B')");
    await putInput(browser, "B 自己的 Y");
    await waitWork(browser, a, view => view.work.draft === "A 等回执期间写下的 X");
    // Observe the real list request, so A's local pending draft must also survive a fresh server snapshot while B is current.
    let listRequest = "";
    let stopResponse = () => {}, stopFinished = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reread = new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Work-list reread did not finish")), 5_000);
      stopResponse = browser.on("Network.responseReceived", (event, session) => {
        const response = event.response as { url: string; status: number };
        if (session === browser.sessionId && new URL(response.url).pathname.endsWith("/api/assistant/works") && response.status === 200) listRequest = String(event.requestId);
      });
      stopFinished = browser.on("Network.loadingFinished", (event, session) => {
        if (session === browser.sessionId && event.requestId === listRequest) resolve();
      });
    });
    try {
      await browser.click("[data-assistant-works-toggle]");
      await reread;
      await browser.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    } finally { clearTimeout(timer); stopResponse(); stopFinished(); }
    await browser.click(`[data-assistant-works] [data-work-id="${a}"]`);
    assert.equal(await browser.evaluate(CURRENT_WORK), a);
    assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] .mw-composer__input').value"), "A 等回执期间写下的 X", "loadDraft must use A's later input before the receipt arrives");
    await barrier.release(sent);
    await browser.waitFor("!document.querySelector('[data-assistant-composer] [data-composer-send]').disabled");
    assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] .mw-composer__input').value"), "A 等回执期间写下的 X", "the send receipt cannot restore the sent words over the later input");
    const afterA = await waitWork(browser, a, view => view.work.draft === "A 等回执期间写下的 X");
    assert.equal(afterA.rounds.at(-1)?.text, "A 已发送的文字"); assert.equal(afterA.rounds.length, 2);
    const afterB = await waitWork(browser, b, view => view.work.draft === "B 自己的 Y"); assert.equal(afterB.rounds.length, 1);
    await browser.reloadPage();
    await browser.waitFor("document.querySelector('[data-assistant-composer] .mw-composer__input').value === 'A 等回执期间写下的 X'");
    assert.equal(await browser.evaluate(CURRENT_WORK), a);
    await openWork(browser, b);
    assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] .mw-composer__input').value"), "B 自己的 Y");
    // B's later edit alone is not an edit of A: returning without typing in A must still clear only A's sent text.
    await browser.click(`[data-assistant-tabs] [data-tab="${a}"] .assistant-tab-main`);
    await putInput(browser, "A 下一次发送的文字");
    await browser.click("[data-assistant-composer] [data-composer-send]");
    const nextSend = await barrier.next();
    await browser.click(`[data-assistant-tabs] [data-tab="${b}"] .assistant-tab-main`);
    await putInput(browser, "B 再写的 Y2");
    await browser.click(`[data-assistant-tabs] [data-tab="${a}"] .assistant-tab-main`);
    await barrier.release(nextSend);
    await browser.waitFor("document.querySelector('[data-assistant-composer] .mw-composer__input').value === ''");
    const finalA = await waitWork(browser, a, view => view.work.state === "completed"); assert.equal(finalA.work.draft, ""); assert.equal(finalA.rounds.length, 3);
    await waitWork(browser, b, view => view.work.draft === "B 再写的 Y2");
  } finally { await barrier.close(); }
});

// W3-10-4-01 and W2-18-SEND-02: even the chooser's trusted HTTP project route and an unknown result's retry stay fixed at the click.
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
    await browser.click("[data-assistant-composer] [data-composer-send]");
    await browser.click("[data-assistant-panel-close]");
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
    await browser.waitFor("!document.querySelector('[data-assistant-composer] [data-composer-send]').disabled");
    await browser.click("[data-assistant-composer] [data-composer-send]");
    const retry = await barrier.next();
    assert.equal(retry.request.url, first.request.url, "retry keeps the original trusted route");
    assert.deepEqual(JSON.parse(retry.request.postData!), body, "including context, original materials and request_id");
    await barrier.release(retry);
    await browser.waitFor("!document.querySelector('[data-assistant-composer] [data-composer-send]').disabled");
    assert.equal(await browser.evaluate("document.querySelector('.chooser').dataset.selected"), "personal");
    assert.equal(await browser.evaluate(CURRENT_WORK), null);
    assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] .mw-composer__input').value"), "项目 A 的新工作");
    assert.match(await browser.evaluate<string>("document.querySelector('[data-assistant-context-strip]:not([hidden])').textContent"), /后来选择的材料/);
    const persisted = await waitWork(browser, newId, view => view.work.state === "completed");
    assert.deepEqual(persisted.work.scope, { kind: "project", project_id: browser.projectId });
    assert.equal(persisted.rounds.length, 1, "two HTTP attempts produce one stored round");
    assert.equal(persisted.rounds[0]?.text, "项目 A 的新工作");
    assert.equal(browser.model!.requests.length, 2, "one seed round and one new round; retry does not run the model again");
    // The retry never deposits A's request key into B's unsent cache. Sending B now starts B, with B's retained materials.
    await browser.click("[data-assistant-composer] [data-composer-send]");
    const personal = await barrier.next(), personalBody = JSON.parse(personal.request.postData!);
    assert.notEqual(personalBody.request_id, body.request_id);
    assert.equal(new URL(personal.request.url).pathname, "/api/assistant/send");
    assert.deepEqual(personalBody.scope, { kind: "personal" });
    assert.deepEqual(personalBody.materials.map((item: { title: string }) => item.title), ["后来选择的材料"]);
    await barrier.release(personal);
    await browser.waitFor("document.querySelector('[data-assistant-composer] textarea').value === ''");
  } finally { await barrier.close(); }
});


for (const stage of ["Request", "Response"]) test(`B10-R3: checking a lost Send at ${stage} reads its outcome without submitting again`, { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/send", requestStage: stage }]);
  try {
    await putInput(browser, "只发送这一次");
    await browser.click("[data-assistant-composer] [data-composer-send]");
    const sent = await barrier.next(), body = JSON.parse(sent.request.postData!);
    await barrier.drop(sent);
    await browser.waitFor("document.querySelector('[data-composer-status-action=check]')", 10_000);
    // If Check POSTs again, this barrier holds it and the assertions time out. The actual GET remains free.
    await browser.click("[data-composer-status-action=check]");
    await browser.waitFor("!document.querySelector('[data-composer-status-action=check]') && !document.querySelector('[data-assistant-composer] .mw-composer[data-state=sending]')", 10_000);
    const works = await browser.evaluate<Array<{ work_id: string }>>("fetch('/api/assistant/works').then(r => r.json()).then(b => b.works)");
    assert.equal(works.length, stage === "Response" ? 1 : 0);
    assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] .mw-composer__input').value"), stage === "Response" ? "" : "只发送这一次");
    const checked = await browser.evaluate<{ state: string }>(`fetch('/api/assistant/requests/${body.request_id}').then(r => r.json())`);
    assert.equal(checked.state, stage === "Response" ? "sent" : "not-sent");
    if (works[0]) assert.equal((await readWork(browser, works[0].work_id)).rounds.length, 1);
  } finally { await barrier.close(); }
});

test("B10-R2: the Assistant keeps each work's selected files across A to B to A", { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const a = await seedWork(browser, "附件工作 A"), b = await seedWork(browser, "附件工作 B");
  await openWork(browser, a);
  await putInput(browser, "A 的草稿");
  await browser.evaluate(`(() => { const data = new DataTransfer(); data.items.add(new File(["A 的资料"], "A.txt", { type: "text/plain" }));
    document.querySelector('[data-assistant-composer] textarea').dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: data })); })()`);
  await browser.waitFor("document.querySelector('[data-assistant-composer] .mw-upload:not(.is-reading)')");
  await openWork(browser, b);
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-assistant-composer] .mw-upload').length"), 0);
  await openWork(browser, a);
  await browser.waitFor("document.querySelector('[data-assistant-composer] textarea').value === 'A 的草稿'");
  assert.match(await browser.evaluate<string>("document.querySelector('[data-assistant-composer] .mw-upload').textContent"), /A.txt/);
});


test("B10-R2: A's successful response never refills an empty B draft", { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const a = await seedWork(browser, "发送 A"), b = await seedWork(browser, "空草稿 B");
  await openWork(browser, a);
  const barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/send", requestStage: "Response" }]);
  try {
    await putInput(browser, "只能留在 A"); await browser.click("[data-assistant-composer] [data-composer-send]");
    const sent = await barrier.next(); await openWork(browser, b); await barrier.release(sent);
    await waitWork(browser, a, view => view.rounds.length === 2 && view.work.state === "completed");
    await browser.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] textarea').value"), "");
    assert.equal((await readWork(browser, b)).work.draft, "");
  } finally { await barrier.close(); }
});

test("B10-R3: two new-work scopes keep independently checkable lost Send intents", { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/send", requestStage: "Request" }]);
  try {
    for (const [row, text] of [[`#row-${browser.projectId}`, "项目的未知发送"], ["#row-personal", "个人的未知发送"]]) {
      await browser.click(row); await putInput(browser, text); await browser.click("[data-assistant-composer] [data-composer-send]");
      await barrier.drop(await barrier.next()); await browser.waitFor("document.querySelector('[data-composer-status-action=check]')");
      await browser.click("[data-assistant-panel-close]");
    }
    await browser.click(`#row-${browser.projectId}`);
    await browser.waitFor("document.querySelector('[data-composer-status-action=check]')");
    await browser.click("[data-composer-status-action=check]");
    await browser.waitFor("!document.querySelector('[data-composer-status-action=check]')");
    assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] textarea').value"), "项目的未知发送");
    await browser.click("#row-personal");
    await browser.waitFor("document.querySelector('[data-composer-status-action=check]')");
    await browser.click("[data-composer-status-action=check]");
    await browser.waitFor("!document.querySelector('[data-composer-status-action=check]')");
    assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] textarea').value"), "个人的未知发送");
  } finally { await barrier.close(); }
});


test("B10-R3: after reload a new work changed to personal cannot replay the project's lost request", { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + "/projects/" + browser.projectId }, browser.sessionId));
  await browser.waitFor("document.querySelector('[data-assistant-composer] textarea')");
  await putInput(browser, "相同的字，不同的范围");
  const barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/send", requestStage: "Response" }]);
  try {
    await browser.click("[data-assistant-composer] [data-composer-send]");
    const first = await barrier.next(), original = JSON.parse(first.request.postData!);
    assert.deepEqual(original.scope, { kind: "project", project_id: browser.projectId });
    await barrier.drop(first);
    await browser.waitFor("document.querySelector('[data-composer-status-action=check]')");
    await browser.reloadPage();
    await browser.waitFor("document.querySelector('[data-assistant-composer] textarea').value === '相同的字，不同的范围'");
    await browser.evaluate("document.querySelector('[data-assistant-composer] textarea').focus()");
    await browser.evaluate("document.querySelector('[data-assistant-side-toggle]')?.click()");
    await browser.waitFor("document.querySelector('[aria-label=新工作放在] button:last-child')");
    await browser.evaluate("document.querySelector('[aria-label=新工作放在] button:last-child').click()");
    await browser.click("[data-assistant-composer] [data-composer-send]");
    const next = await barrier.next(), body = JSON.parse(next.request.postData!);
    assert.equal(next.request.url, first.request.url, "this regression changes scope on the same project page and route");
    assert.deepEqual(body.scope, { kind: "personal" }); assert.notEqual(body.request_id, original.request_id);
    await barrier.release(next);
    await browser.waitFor("document.querySelector('[data-assistant-composer] textarea').value === ''");
    const current = await browser.evaluate<string>(CURRENT_WORK);
    assert.deepEqual((await readWork(browser, current)).work.scope, { kind: "personal" });
  } finally { await barrier.close(); }
});


for (const stage of ["Request", "Response"]) test(`B10-R3: after reload a lost ${stage} is checked before sending newly attached material`, { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  await putInput(browser, "刷新后仍在框里的文字");
  let barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/send", requestStage: stage }]);
  try {
    await browser.click("[data-assistant-composer] [data-composer-send]");
    const first = await barrier.next(), original = JSON.parse(first.request.postData!);
    if (stage === "Response") assert.equal(first.responseStatusCode, 200);
    await barrier.drop(first);
    await browser.waitFor("document.querySelector('[data-composer-status-action=check]')");
    await barrier.close();
    await browser.reloadPage();
    await browser.waitFor("document.querySelector('[data-assistant-composer] textarea').value === '刷新后仍在框里的文字'");
    await browser.evaluate(`(() => { const data = new DataTransfer(); data.items.add(new File(["刷新后新加的正文"], "new-after-reload.txt", { type: "text/plain" }));
      document.querySelector('[data-assistant-composer] textarea').dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: data })); })()`);
    await browser.waitFor("document.querySelector('[data-assistant-composer] .mw-upload:not(.is-reading)')");
    barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/requests/*", requestStage: "Response" }, { urlPattern: "*/api/assistant/send", requestStage: "Response" }]);
    await browser.click("[data-assistant-composer] [data-composer-send]");
    const check = await barrier.next();
    assert.ok(check.request.url.endsWith("/requests/" + original.request_id), "read the old outcome before arbitrating another content attempt");
    await barrier.release(check);
    if (stage === "Response") {
      await browser.waitFor("document.querySelector('[data-assistant-composer] .mw-composer[data-state=failed]')");
      assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] textarea').value"), "刷新后仍在框里的文字");
      assert.match(await browser.evaluate<string>("document.querySelector('[data-assistant-composer] .mw-upload').textContent"), /new-after-reload.txt/);
      const old = await browser.evaluate<Array<{ work_id: string }>>("fetch('/api/assistant/works').then(r => r.json()).then(b => b.works)");
      assert.equal(old.length, 1); assert.equal((await readWork(browser, old[0]!.work_id)).rounds.length, 1);
      await browser.click("[data-assistant-composer] [data-composer-send]");
    }
    const sent = await barrier.next(), body = JSON.parse(sent.request.postData!);
    assert.ok(sent.request.url.endsWith("/send"));
    assert.equal(body.request_id === original.request_id, stage === "Request", "no record yet still uses the old key for atomic arbitration");
    assert.notEqual(body.submission_id, original.submission_id);
    assert.equal(body.materials[0].title, "new-after-reload.txt");
    if (stage === "Request") {
      // The old request arrives only after GET saw no ledger and the new content won the atomic claim.
      await browser.evaluate(`void fetch(${JSON.stringify(first.request.url)}, { method: 'POST', headers: molisWorkControlHeaders(), body: ${JSON.stringify(first.request.postData!)} }).then(r => r.json()).then(result => { globalThis.lateOriginal = result; })`);
      const late = await barrier.next(); await barrier.release(late);
      await browser.waitFor("Boolean(globalThis.lateOriginal)");
      assert.deepEqual(await browser.evaluate("[globalThis.lateOriginal.outcome, globalThis.lateOriginal.submission_id]"), ["repeated", body.submission_id]);
    }
    await barrier.release(sent);
    await browser.waitFor("document.querySelector('[data-assistant-composer] textarea').value === ''");
    assert.equal(await browser.evaluate("document.querySelectorAll('[data-assistant-composer] .mw-upload').length"), 0);
    const work = await waitWork(browser, await browser.evaluate<string>(CURRENT_WORK), view => view.work.state === "completed");
    assert.equal(work.rounds.length, 1); assert.equal(work.rounds[0]!.materials?.[0]?.title, "new-after-reload.txt");
    assert.match(JSON.stringify(browser.model!.requests.at(-1)), /刷新后新加的正文/, "the submitted attachment reaches the actual model request");
  } finally { await barrier.close(); }
});


test("B10-R6: the receiver opens by keyboard with a draft present and does not send it", { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const work = await seedWork(browser, "键盘打开的工作"); await openWork(browser, work); await putInput(browser, "还没有发送的草稿");
  await browser.click('[data-assistant-panel-close]');
  await browser.evaluate("document.querySelector('[data-assistant-composer] textarea').focus()");
  const press = async (key: string, code: number, modifiers = 0) => {
    const params = { key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers };
    await browser.command('Input.dispatchKeyEvent', { type: 'keyDown', ...params, ...(key === 'Enter' ? { text: '\r' } : {}) }, browser.sessionId);
    await browser.command('Input.dispatchKeyEvent', { type: 'keyUp', ...params }, browser.sessionId);
  };
  await press('Tab', 9, 8); await press('Tab', 9, 8);
  assert.equal(await browser.evaluate("document.activeElement?.matches('[data-composer-receiver]')"), true, "the receiver name is a Tab stop before reset and input");
  await press('Enter', 13);
  await browser.waitFor("!document.querySelector('[data-assistant-panel]').hidden");
  assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] textarea').value"), "还没有发送的草稿");
  assert.equal((await readWork(browser, work)).rounds.length, 1);
});


test("B10-R3: a late old request winning after the lookup never consumes the changed draft or newly chosen material", { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return; await putInput(browser, "只执行其中一份内容");
  let barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/send", requestStage: "Request" }]);
  try {
    await browser.click('[data-assistant-composer] [data-composer-send]'); const old = await barrier.next(), original = JSON.parse(old.request.postData!);
    await barrier.drop(old); await browser.waitFor("document.querySelector('[data-composer-status-action=check]')");
    await putInput(browser, '改过的下一份内容', '仍待发送的资料');
    await browser.click('[data-composer-status-action=check]'); await browser.waitFor("!document.querySelector('[data-composer-status-action=check]')"); await barrier.close();
    barrier = await sendBarrier(browser, [{ urlPattern: '*/api/assistant/requests/*', requestStage: 'Response' }, { urlPattern: '*/api/assistant/send', requestStage: 'Response' }]);
    await browser.click('[data-assistant-composer] [data-composer-send]'); const check = await barrier.next();
    assert.ok(check.request.url.endsWith('/requests/' + original.request_id));
    // GET has already read no row. The original HTTP body arrives before the new content's POST.
    await browser.evaluate(`void fetch(${JSON.stringify(old.request.url)}, { method: 'POST', headers: molisWorkControlHeaders(), body: ${JSON.stringify(old.request.postData!)} }).then(r => r.json()).then(result => { globalThis.oldWinner = result; })`);
    const late = await barrier.next(); assert.equal(late.responseStatusCode, 200); await barrier.release(late);
    await browser.waitFor('Boolean(globalThis.oldWinner)'); await barrier.release(check);
    const recovery = await barrier.next(), body = JSON.parse(recovery.request.postData!);
    assert.equal(body.request_id, original.request_id); assert.notEqual(body.submission_id, original.submission_id);
    await barrier.release(recovery); await browser.waitFor("document.querySelector('[data-assistant-composer] .mw-composer[data-state=failed]')");
    assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] textarea').value"), '改过的下一份内容');
    assert.match(await browser.evaluate<string>("document.querySelector('[data-assistant-context-strip]:not([hidden])').textContent"), /仍待发送的资料/);
    const works = await browser.evaluate<Array<{ work_id: string }>>("fetch('/api/assistant/works').then(r => r.json()).then(b => b.works)");
    assert.equal(works.length, 1); const work = await waitWork(browser, works[0]!.work_id, view => view.work.state === 'completed');
    assert.equal(work.rounds.length, 1); assert.equal(work.rounds[0]!.materials?.length ?? 0, 0);
    assert.equal(browser.model!.requests.length, 1);
  } finally { await barrier.close(); }
});

test("B10-R3: reading a historical send receipt cannot replace an existing work's newer draft", { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const a = await seedWork(browser, '历史回执 A'), b = await seedWork(browser, '空白 B'); await openWork(browser, a);
  let barrier = await sendBarrier(browser, [{ urlPattern: '*/api/assistant/send', requestStage: 'Response' }]);
  try {
    await putInput(browser, 'A 已经送到的内容'); await browser.click('[data-assistant-composer] [data-composer-send]');
    const sent = await barrier.next(); await barrier.drop(sent); await browser.waitFor("document.querySelector('[data-composer-status-action=check]')"); await barrier.close();
    await browser.reloadPage(); await browser.waitFor("document.querySelector('[data-assistant-composer] textarea')"); await openWork(browser, a);
    await putInput(browser, 'A 从宿主恢复的新草稿'); await waitWork(browser, a, view => view.work.draft === 'A 从宿主恢复的新草稿');
    barrier = await sendBarrier(browser, [{ urlPattern: '*/api/assistant/requests/*', requestStage: 'Response' }]);
    await browser.click('[data-assistant-composer] [data-composer-send]'); const check = await barrier.next();
    await openWork(browser, b); await barrier.release(check);
    await browser.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await openWork(browser, a); await browser.waitFor("document.querySelector('[data-assistant-composer] textarea').value === 'A 从宿主恢复的新草稿'");
    assert.equal((await readWork(browser, a)).work.draft, 'A 从宿主恢复的新草稿'); assert.equal((await readWork(browser, a)).rounds.length, 2);
  } finally { await barrier.close(); }
});

test("B10-R3: a delayed original Send preserves the newer Host draft across a second reload", { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const a = await seedWork(browser, "Persisted draft owner"); await openWork(browser, a);
  await putInput(browser, "Original delayed content");
  const before = await waitWork(browser, a, view => view.work.draft === "Original delayed content");
  let barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/send", requestStage: "Request" }]);
  try {
    await browser.click('[data-assistant-composer] [data-composer-send]');
    const old = await barrier.next(), original = JSON.parse(old.request.postData!);
    assert.equal(original.draft_revision, before.work.draft_revision);
    await barrier.drop(old); await browser.waitFor("document.querySelector('[data-composer-status-action=check]')"); await barrier.close();
    await browser.reloadPage(); await browser.waitFor("document.querySelector('[data-assistant-composer] textarea')"); await openWork(browser, a);
    await putInput(browser, "New draft already saved on Host");
    await waitWork(browser, a, view => view.work.draft === "New draft already saved on Host");
    barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/requests/*", requestStage: "Response" }, { urlPattern: "*/api/assistant/send", requestStage: "Response" }]);
    await browser.click('[data-assistant-composer] [data-composer-send]'); const check = await barrier.next();
    assert.ok(check.request.url.endsWith('/requests/' + original.request_id));
    await browser.evaluate(`void fetch(${JSON.stringify(old.request.url)}, { method: 'POST', headers: molisWorkControlHeaders(), body: ${JSON.stringify(old.request.postData!)} }).then(r => r.json()).then(result => { globalThis.durableOld = result; })`);
    const late = await barrier.next(); assert.equal(late.responseStatusCode, 200);
    assert.equal((await readWork(browser, a)).work.draft, "New draft already saved on Host", "the old request cannot replace or clear the newer persisted draft");
    await barrier.release(late); await browser.waitFor('Boolean(globalThis.durableOld)'); await barrier.release(check);
    const repeated = await barrier.next(); assert.equal(JSON.parse(repeated.request.postData!).request_id, original.request_id);
    await barrier.release(repeated); await browser.waitFor("document.querySelector('[data-assistant-composer] .mw-composer[data-state=failed]')");
    assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] textarea').value"), "New draft already saved on Host");
    const result = await waitWork(browser, a, view => view.work.state === "completed");
    assert.equal(result.rounds.length, 2); assert.equal(result.rounds.at(-1)?.text, "Original delayed content");
    assert.equal(browser.model!.requests.length, 2);
    await barrier.close(); await browser.reloadPage();
    await browser.waitFor("document.querySelector('[data-assistant-composer] textarea').value === 'New draft already saved on Host'");
    assert.equal((await readWork(browser, a)).work.draft, "New draft already saved on Host");
  } finally { await barrier.close(); }
});

for (const changedMaterials of [false, true]) test(`B10-R3: same-page retry claims the original receipt only for unchanged complete content (${changedMaterials})`, { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  await putInput(browser, "Unchanged original text");
  let barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/send", requestStage: "Request" }]);
  try {
    await browser.click('[data-assistant-composer] [data-composer-send]'); const old = await barrier.next(), original = JSON.parse(old.request.postData!);
    await barrier.drop(old); await browser.waitFor("document.querySelector('[data-composer-status-action=check]')");
    await browser.click('[data-composer-status-action=check]'); await browser.waitFor("!document.querySelector('[data-composer-status-action=check]')"); await barrier.close();
    if (changedMaterials) await putInput(browser, "Unchanged original text", "New unsent material");
    barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/requests/*", requestStage: "Response" }, { urlPattern: "*/api/assistant/send", requestStage: "Response" }]);
    await browser.evaluate(`void fetch(${JSON.stringify(old.request.url)}, { method: 'POST', headers: molisWorkControlHeaders(), body: ${JSON.stringify(old.request.postData!)} }).then(r => r.json()).then(result => { globalThis.unchangedOld = result; })`);
    const late = await barrier.next(); assert.equal(late.responseStatusCode, 200); await barrier.release(late); await browser.waitFor('Boolean(globalThis.unchangedOld)');
    await browser.click('[data-assistant-composer] [data-composer-send]'); const retry = await barrier.next();
    if (changedMaterials) {
      assert.ok(retry.request.url.endsWith('/requests/' + original.request_id)); await barrier.release(retry);
      await browser.waitFor("document.querySelector('[data-assistant-composer] .mw-composer[data-state=failed]')");
      assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] textarea').value"), "Unchanged original text");
      assert.match(await browser.evaluate<string>("document.querySelector('[data-assistant-context-strip]:not([hidden])').textContent"), /New unsent material/);
    } else {
      assert.ok(retry.request.url.endsWith('/send')); const body = JSON.parse(retry.request.postData!);
      assert.equal(body.request_id, original.request_id); assert.equal(body.submission_id, original.submission_id);
      await barrier.release(retry); await browser.waitFor("document.querySelector('[data-assistant-composer] textarea').value === ''");
      assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] [data-composer-send]').disabled"), true, "the successful unchanged retry is consumed, so another click cannot repeat it");
    }
    const works = await browser.evaluate<Array<{ work_id: string }>>("fetch('/api/assistant/works').then(r => r.json()).then(b => b.works)");
    assert.equal(works.length, 1); assert.equal((await waitWork(browser, works[0]!.work_id, view => view.work.state === "completed")).rounds.length, 1);
    assert.equal(browser.model!.requests.length, 1);
  } finally { await barrier.close(); }
});


for (const checkReceipt of [false, true]) test(`B10-R3: another window's saved draft survives ${checkReceipt ? "Check" : "Send"} settlement and switching work`, { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const a = await seedWork(browser, "Shared draft A"), b = await seedWork(browser, "Work B"); await openWork(browser, a);
  await putInput(browser, "My sent text"); await waitWork(browser, a, view => view.work.draft === "My sent text");
  let barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/send", requestStage: "Response" }]);
  try {
    await browser.click('[data-assistant-composer] [data-composer-send]'); let receipt = await barrier.next();
    if (checkReceipt) {
      await barrier.drop(receipt); await browser.waitFor("document.querySelector('[data-composer-status-action=check]')"); await barrier.close();
      barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/requests/*", requestStage: "Response" }]);
      await browser.click('[data-composer-status-action=check]'); receipt = await barrier.next();
    }
    await browser.evaluate(`fetch('/api/assistant/works/${a}/draft', { method: 'POST', headers: molisWorkControlHeaders(), body: JSON.stringify({ draft: 'Other window durable Y' }) }).then(r => { if (!r.ok) throw new Error('save failed'); })`);
    if (checkReceipt) { await putInput(browser, "Same page newer Z"); await waitWork(browser, a, view => view.work.draft === "Same page newer Z"); }
    await barrier.release(receipt); await browser.waitFor("!document.querySelector('[data-assistant-composer] .mw-composer[data-state=sending]')");
    if (!checkReceipt) assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] textarea').value"), "");
    await openWork(browser, b); await openWork(browser, a);
    if (checkReceipt) await browser.waitFor("document.querySelector('[data-assistant-composer] textarea').value === 'Same page newer Z'");
    assert.equal((await readWork(browser, a)).work.draft, checkReceipt ? "Same page newer Z" : "Other window durable Y", "settlement and remount must not write an empty stale field over the newer draft");
    await barrier.close(); await browser.reloadPage();
    await browser.waitFor(`document.querySelector('[data-assistant-composer] textarea').value === ${JSON.stringify(checkReceipt ? "Same page newer Z" : "Other window durable Y")}`);
    assert.equal((await readWork(browser, a)).rounds.length, 2);
  } finally { await barrier.close(); }
});

for (const sameText of [false, true]) test(`B10-R3: a stale page draft keeps its own version after work polling (same text ${sameText})`, { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const a = await seedWork(browser, "Draft pair A"), b = await seedWork(browser, "Pair B"); await openWork(browser, a);
  await putInput(browser, "X"); const original = await waitWork(browser, a, view => view.work.draft === "X");
  await browser.evaluate(`(async () => { for (const draft of ${JSON.stringify(sameText ? ["", "X"] : ["Y"])}) { const res = await fetch('/api/assistant/works/${a}/draft', { method:'POST', headers:molisWorkControlHeaders(), body:JSON.stringify({draft}) }); if (!res.ok) throw new Error('save failed'); } })()`);
  // Both view rendering and list refresh must keep the old draft paired with its old version.
  await openWork(browser, a);
  await browser.click('[data-assistant-works-toggle]');
  const barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/send", requestStage: "Response" }]);
  try {
    await browser.click('[data-assistant-composer] [data-composer-send]'); const receipt = await barrier.next();
    assert.equal(JSON.parse(receipt.request.postData!).draft_revision, original.work.draft_revision);
    assert.equal((await readWork(browser, a)).work.draft, sameText ? "X" : "Y");
    await barrier.release(receipt); await browser.waitFor("document.querySelector('[data-assistant-composer] textarea').value === ''");
    await openWork(browser, b);
    assert.equal((await readWork(browser, a)).work.draft, sameText ? "X" : "Y", "switching after the stale Send must preserve the new generation");
  } finally { await barrier.close(); }
});

// B10-R3: the same words typed after Send are a new draft, even if the debounce never saved the intermediate empty value.
test("B10-R3: clearing and retyping the sent text while its receipt is held preserves the new generation", { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const a = await seedWork(browser, "Same text generation"), b = await seedWork(browser, "Other work"); await openWork(browser, a);
  await putInput(browser, "X"); await waitWork(browser, a, view => view.work.draft === "X");
  const barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/send", requestStage: "Response" }]);
  try {
    await browser.click('[data-assistant-composer] [data-composer-send]'); const receipt = await barrier.next();
    await putInput(browser, ""); await putInput(browser, "X");
    const newer = await waitWork(browser, a, view => view.work.draft === "X");
    await barrier.release(receipt); await browser.waitFor("!document.querySelector('[data-assistant-composer] .mw-composer[data-state=sending]')");
    assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] textarea').value"), "X");
    await openWork(browser, b); await openWork(browser, a);
    await browser.waitFor("document.querySelector('[data-assistant-composer] textarea').value === 'X'");
    assert.equal((await readWork(browser, a)).work.draft_revision, newer.work.draft_revision);
    await barrier.close(); await browser.reloadPage(); await browser.waitFor("document.querySelector('[data-assistant-composer] textarea').value === 'X'");
  } finally { await barrier.close(); }
});

test("B10-R3: retyping the same text while Send is unknown survives the delayed request, Check and reload", { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const a = await seedWork(browser, "Unknown same text generation"); await openWork(browser, a);
  await putInput(browser, "X"); const saved = await waitWork(browser, a, view => view.work.draft === "X");
  let barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/send", requestStage: "Request" }]);
  try {
    await browser.click('[data-assistant-composer] [data-composer-send]'); const original = await barrier.next();
    assert.equal(JSON.parse(original.request.postData!).draft_revision, saved.work.draft_revision);
    await barrier.drop(original); await browser.waitFor("document.querySelector('[data-composer-status-action=check]')");
    // One JS turn: the debounce cannot save the intermediate empty string.
    await browser.evaluate("{ const field = document.querySelector('[data-assistant-composer] textarea'); for (const text of ['', 'X']) { field.value = text; field.dispatchEvent(new Event('input', { bubbles: true })); } }");
    const newer = await waitWork(browser, a, view => view.work.draft === "X" && view.work.draft_revision > saved.work.draft_revision);
    await barrier.close();
    barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/send", requestStage: "Response" }]);
    await browser.evaluate(`void fetch(${JSON.stringify(original.request.url)}, { method: 'POST', headers: molisWorkControlHeaders(), body: ${JSON.stringify(original.request.postData!)} }).then(r => r.json()).then(result => { globalThis.sameTextOld = result; })`);
    const late = await barrier.next(); assert.equal(late.responseStatusCode, 200); await barrier.release(late);
    await browser.waitFor("Boolean(globalThis.sameTextOld)");
    assert.equal((await readWork(browser, a)).work.draft_revision, newer.work.draft_revision);
    await browser.click('[data-composer-status-action=check]'); await browser.waitFor("!document.querySelector('[data-composer-status-action=check]')");
    assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] textarea').value"), "X");
    const done = await waitWork(browser, a, view => view.work.state === "completed");
    assert.equal(done.work.draft, "X"); assert.equal(done.work.draft_revision, newer.work.draft_revision);
    assert.equal(done.rounds.length, 2); assert.equal(browser.model!.requests.length, 2, "one seed and exactly one delayed Send");
    await barrier.close(); await browser.reloadPage(); await browser.waitFor("document.querySelector('[data-assistant-composer] textarea').value === 'X'");
    assert.equal((await readWork(browser, a)).work.draft, "X");
  } finally { await barrier.close(); }
});

test("B10-R3: switching work before the shared composer script arrives saves only the edited owner's text", { timeout: 90_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const a = await seedWork(browser, "Early input A"), b = await seedWork(browser, "Early input B"); await openWork(browser, a);
  await browser.command("Network.setCacheDisabled", { cacheDisabled: true }, browser.sessionId);
  const barrier = await sendBarrier(browser, [{ urlPattern: "*/assets/molis-work-composer.js", requestStage: "Response" }]);
  try {
    const loading = browser.reloadPage(); const script = await barrier.next();
    await browser.waitFor("Boolean(window.molisComposer) && !window.molisComposerProgram");
    await putInput(browser, "Typed before the program arrived");
    await browser.evaluate(`document.dispatchEvent(new CustomEvent('molis:assistant-open', { detail: { work_id: '${b}' } }))`);
    await browser.waitFor(`${CURRENT_WORK} === '${b}'`);
    await waitWork(browser, a, view => view.work.draft === "Typed before the program arrived");
    await barrier.release(script); await loading;
    await browser.waitFor("Boolean(window.molisComposerProgram)");
    assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] textarea').value"), "");
    await openWork(browser, a);
    await browser.waitFor("document.querySelector('[data-assistant-composer] textarea').value === 'Typed before the program arrived'");
  } finally { await barrier.close(); }
});
