import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { GoalProjectApplication, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages/testing";
import { PROJECT_SCOPED_PLUGIN_IDS } from "@molis-ai/molis-work-app-workbench";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { asideReply } from "./fixtures/ending-review.js";

// specs/ai-interaction-experience AC-05: what a person writes into a question, and what they answer, stays with the session,
// project and object it was asked in. Each test asserts the refusal: the other session, project or object never gets it.
// AC-08 (two tabs answering one question) is here too: it needs the same Coding round that asks.

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

/** A round's question, picked by the words of its task; the answer comes back as a tool result in the round's next call. */
type Asked = { readonly task: string; readonly ask: object; readonly done: string };

/** The seeded browser with a local model that asks each round's question on its first call and then goes on. */
async function openCoding(t: TestContext, asked: readonly Asked[]) {
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const { runWithMolisWorkHome, resetSecretStoreCache } = await import("@molis-ai/molis-work-storage");
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); });
  /** Every model call after a question, by the task it belongs to: what the model heard when the round went on. */
  const heard: Array<{ task: string; body: string }> = [];
  /** For every model call: whose round it is, and which other rounds' tasks its request mentions. */
  const prompts: Array<{ task: string; others: string[] }> = [];
  const model = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    // A round that changed nothing has its ending reviewed (D1②): answered "nothing found" without spending a scripted turn.
    const review = asideReply(raw);
    res.writeHead(200, { "content-type": "text/event-stream" });
    if (review) { res.end(turn(review)); return; }
    // The round is the one whose task is the person's first message; other text in the request (another session's work in
    // the same folder, say) does not pick it.
    const body = JSON.parse(raw) as { messages?: Array<{ role: string; content: unknown }> };
    const opening = JSON.stringify(body.messages?.find(message => message.role === "user")?.content ?? "");
    const round = asked.find(one => opening.includes(one.task));
    prompts.push({ task: round?.task ?? "", others: asked.filter(one => one !== round && raw.includes(one.task)).map(one => one.task) });
    if (!round) { res.end(turn("没有认出这一轮。")); return; }
    if (!raw.includes("tool_result")) { res.end(turn("", { name: "ask-user", input: round.ask })); return; }
    heard.push({ task: round.task, body: raw });
    res.end(turn(round.done));
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const b = await openGoalBrowser(t, "seeded"); if (!b) return null;
  const { command, sessionId, homeDirectory } = b;
  const child = await pluginFrameBrowser(t,b,"coding");
  const { click, evaluate, waitFor } = child;
  await runWithMolisWorkHome(homeDirectory, () => withMolisWorkProjectCatalog({ homeDirectory }, catalog => {
    const connection = withConnectorConnections(homeDirectory, store => { const created = store.createToken({ serviceId: "model-api", displayName: "local-only", token: "fixture-local-model-key" }); store.assertTarget(created.connection_id, "model-api", `http://127.0.0.1:${address.port}`); return created; });
    catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "local-only", display_name: "本机", base_url: `http://127.0.0.1:${address.port}`, api_format: "anthropic-messages",
      models: [{ model_id: "fixture-plain", enabled: true }] });
  }));
  const fill = (selector: string, value: string) => (selector.includes("data-project-workspaces") ? b.evaluate : evaluate)(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.value=${JSON.stringify(value)};node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  const coding = "[data-coding-workbench]";
  const prepared = new Set<string>();
  /** Opens Coding in `project`; the first time, gives the project a workspace through its settings. */
  const enter = async (project: string) => {
    await b.navigate(() => command("Page.navigate", { url: `${b.origin}/projects/${project}/` }, sessionId));
    if (!prepared.has(project)) {
      const workspace = join(homeDirectory, `no-crosstalk-${prepared.size}`);
      await mkdir(workspace, { recursive: true });
      await writeFile(join(workspace, "note.txt"), "release notes go in CHANGELOG.md\n");
      await b.click('.navigator-project-settings');
      await b.waitFor("!!document.querySelector('[data-directory-panel=project-settings] [data-settings-section=workspaces]')");
      await b.click('[data-directory-panel=project-settings] [data-settings-section=workspaces]');
      await b.waitFor("!!document.querySelector('[data-project-workspaces-add]') && !document.querySelector('[data-project-workspaces-refresh]').disabled");
      await fill('[data-project-workspaces-add] [name=path]', workspace);
      await b.click('[data-project-workspaces-add] [type=submit]');
      await b.waitFor(`document.querySelector('[data-project-workspaces-list]').textContent.includes(${JSON.stringify(`no-crosstalk-${prepared.size}`)})`);
      prepared.add(project);
    }
    await b.click(`[data-plugin-strip] [data-plugin-id="coding"]`);
    await b.waitFor(`document.querySelector('[data-work-surface="coding"]')?.getBoundingClientRect().width > 100`);
    await waitFor("document.querySelector('[data-coding-task]')");
    // What the page sends: each request's path and body, to tell which session a draft or an answer went to.
    await evaluate(`(() => { if (window.__sent) return; window.__sent = []; const original = window.fetch; window.fetch = async (...args) => {
      const sent = args[1] && typeof args[1].body === 'string' ? { url: String(args[0]), method: args[1].method || 'GET', body: args[1].body } : null; if (sent) window.__sent.push(sent);
      const response = await original(...args); if (sent && sent.method === 'POST') response.clone().text().then(text => { sent.status = response.status; sent.reply = text.slice(0, 300); }, () => {}); return response; }; })()`);
  };
  /** Starts a new session and sends `task` in it; resolves to the session's id once its question card is shown. */
  const ask = async (task: string) => {
    await click(`${coding} [data-coding-new]`);
    await waitFor(`!document.querySelector('${coding} [data-coding-task]').disabled && document.querySelector('${coding} [data-coding-task]').value === '' && document.querySelector('${coding} [data-coding-model]').options.length >= 1`);
    await fill(`${coding} [data-coding-model]`, JSON.stringify(["local-only", "fixture-plain"]));
    await fill(`${coding} [data-coding-intent]`, "discuss");
    await fill(`${coding} [data-coding-task]`, task);
    await waitFor(`!document.querySelector('${coding} [data-coding-send]').disabled`);
    await click(`${coding} [data-coding-send]`);
    await waitFor(`Boolean(document.querySelector('${coding} [data-coding-question][data-ix-question]'))`, 30_000)
      .catch(async error => { throw new Error(`${(error as Error).message}\nstatus: ${await evaluate<string>(`document.querySelector('${coding} [data-coding-status]')?.textContent ?? ''`)}\ndialog: ${await evaluate<string>(`[...document.querySelectorAll('dialog[open],[role=dialog]:not([hidden]),[role=alertdialog]')].map(node => node.textContent.trim().slice(0, 300)).join(' | ')`)}\nposts: ${JSON.stringify(await evaluate(`window.__sent.filter(one => one.method === 'POST').slice(-4).map(one => [one.url.split('/api/')[1], one.status, one.reply])`))}\nmodel calls: ${JSON.stringify(prompts)}`); });
    return evaluate<string>(`document.querySelector('${coding} [data-coding-session][aria-current=true]').dataset.codingSession`);
  };
  /** Shows a session of `project` again through its tab, the way a person switches. */
  const show = async (session: string, project = b.projectId!) => {
    const state = await b.evaluate<{ panes: Array<{ tabs: Array<{ id: string; itemId: string }> }> }>(`JSON.parse(localStorage.getItem('molis-work-tab-workspace:${project}'))`);
    const tab = state.panes.flatMap(pane => pane.tabs).find(one => one.itemId === session);
    assert.ok(tab, "the session has a tab");
    await b.click(`[data-tab-id="${tab.id}"]`);
    await waitFor(`document.querySelector('${coding} [data-coding-session][aria-current=true]')?.dataset.codingSession === ${JSON.stringify(session)} && Boolean(document.querySelector('${coding} [data-coding-question][data-ix-question]'))`, 15_000);
  };
  return { ...b, ...child, ownerEvaluate: b.evaluate, coding, fill, heard, prompts, enter, ask, show };
}

/** The tool results a model request carries: what the round heard back from its questions. */
function answersIn(body: string): string {
  const { messages = [] } = JSON.parse(body) as { messages?: Array<{ content: unknown }> };
  return messages.flatMap(message => Array.isArray(message.content) ? message.content : [])
    .filter((part: { type?: string }) => part.type === "tool_result").map(part => JSON.stringify(part)).join("\n");
}

/** Every file of the Home's Agent runtime by content: what a refused answer must leave as it was. */
async function runtimeFiles(home: string): Promise<Map<string, string>> {
  const root = join(home, "agent-runtime"), files = new Map<string, string>();
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) files.set(join(entry.parentPath, entry.name).slice(root.length), createHash("sha256").update(await readFile(join(entry.parentPath, entry.name))).digest("hex"));
  }
  return files;
}

const card = (coding: string) => `${coding} [data-coding-question][data-ix-question]`;
/** Which options of the card's first question are picked, by index. */
const picked = (coding: string) => `[...document.querySelectorAll(${JSON.stringify(`${card(coding)} [data-ix-field="q0"] [data-ix-option]`)})].filter(node => node.getAttribute('aria-checked') === 'true' || node.getAttribute('aria-pressed') === 'true').map(node => node.dataset.ixOption)`;
/** The question keys (`[run, pending, revision]`) the page saved as drafts for one session, over every save it sent. */
const savedDraftKeys = (session: string) => `window.__sent.filter(one => one.method === 'PATCH' && one.url.endsWith('/sessions/' + ${JSON.stringify(session)}) && one.body.includes('question_drafts'))
  .flatMap(one => Object.keys(JSON.parse(one.body).question_drafts || {}))`;

const LOGIN: Asked = { task: "甲会话：登录和导出都坏了", done: "甲：好的，先修导出。",
  ask: { why: "甲：先确认要修哪一处。", questions: [{ prompt: "先修哪一个？", options: [{ label: "登录" }, { label: "导出" }] }] } };
const REPORT: Asked = { task: "乙会话：报表要改版", done: "乙：好的，先改日报。",
  ask: { why: "乙：先确认改哪张表。", questions: [{ prompt: "先改哪张？", options: [{ label: "日报" }, { label: "周报" }] }] } };

test("AC-05: a question's draft and answer stay in the session it was asked in; switching sessions carries none to the other", { timeout: 240_000 }, async t => {
  const opened = await openCoding(t, [LOGIN, REPORT]); if (!opened) return;
  const { click, evaluate, waitFor, coding, heard, prompts, enter, ask, show, projectId } = opened;
  await enter(projectId!);

  const first = await ask(LOGIN.task);
  await click(`${card(coding)} [data-ix-field="q0"] [data-ix-option="1"]`);
  await waitFor(`${savedDraftKeys(first)}.length > 0`, 10_000);
  const firstKey = (await evaluate<string[]>(savedDraftKeys(first)))[0]!;

  const second = await ask(REPORT.task);
  t.diagnostic(`model calls so far: ${JSON.stringify(prompts)}`);
  assert.notEqual(second, first);
  assert.match(await evaluate<string>(`document.querySelector(${JSON.stringify(card(coding))}).querySelector('h3').textContent`), /乙/, "the card shown is the second session's own question");
  assert.deepEqual(await evaluate<string[]>(picked(coding)), [], "the first session's pick is not on the second session's card");
  await click(`${card(coding)} [data-ix-field="q0"] [data-ix-option="0"]`);
  await waitFor(`${savedDraftKeys(second)}.length > 0`, 10_000);
  assert.ok(!(await evaluate<string[]>(savedDraftKeys(second))).includes(firstKey), "no draft of the first session's question is saved with the second session");

  await show(first);
  assert.match(await evaluate<string>(`document.querySelector(${JSON.stringify(card(coding))}).querySelector('h3').textContent`), /甲/);
  assert.deepEqual(await evaluate<string[]>(picked(coding)), ["1"], "back in the first session, its own pick is there and the second session's is not");
  const secondKeys = await evaluate<string[]>(savedDraftKeys(second));
  assert.ok(!(await evaluate<string[]>(savedDraftKeys(first))).some(key => secondKeys.includes(key)), "no draft of the second session's question is saved with the first session");

  await click(`${card(coding)} [data-ix-action="answer"]`);
  await waitFor(`document.querySelector('${coding}').innerText.includes(${JSON.stringify(LOGIN.done)})`, 30_000);
  const answers = await evaluate<Array<{ url: string }>>(`window.__sent.filter(one => one.method === 'POST' && one.body.includes('"kind":"answer"'))`);
  assert.equal(answers.length, 1);
  assert.ok(answers[0]!.url.includes(encodeURIComponent(first)) && !answers[0]!.url.includes(encodeURIComponent(second)), "the answer goes to the first session only");
  assert.equal(heard.filter(one => one.task === REPORT.task).length, 0, "the second session's round heard nothing: its question is still open");
  const firstAnswer = answersIn(heard.find(one => one.task === LOGIN.task)!.body);
  assert.match(firstAnswer, /导出/, "the first round hears its own pick");
  assert.doesNotMatch(firstAnswer, /日报/, "and not the second session's");

  await show(second);
  assert.deepEqual(await evaluate<string[]>(picked(coding)), ["0"], "the second session's card still holds its own pick after the first was answered");
  await click(`${card(coding)} [data-ix-action="answer"]`);
  await waitFor(`document.querySelector('${coding}').innerText.includes(${JSON.stringify(REPORT.done)})`, 30_000);
  // What each round heard as its answer: the tool results in its request. (The project's task graph may name the other
  // session's task, by design; that is not an answer.)
  const secondAnswer = answersIn(heard.find(one => one.task === REPORT.task)!.body);
  assert.match(secondAnswer, /日报/);
  assert.doesNotMatch(secondAnswer, /导出/, "the second round never hears the first session's answer");
});


// AC-08: two tabs answer the same Coding question. The second tab's answer is held in that page until the first tab's answer was
// taken and its round ended, then let go: the order is fixed, not left to timing. One is taken; the other comes back refused with a
// code, and its card stays, closed, saying why, after the session is read again; the round hears the answer once, and the refused
// one writes nothing.
test("AC-08: two tabs answer one Coding question: one is taken, the other is refused with a code, the round hears once and nothing is written twice", { timeout: 240_000 }, async t => {
  const opened = await openCoding(t, [LOGIN]); if (!opened) return;
  const { click, waitFor, command, coding, heard, enter, ask, projectId, origin, homeDirectory } = opened;
  await enter(projectId!);
  const session = await ask(LOGIN.task);
  // A window of its own, so both pages stay in front: Coding reads and follows a session only in a page that is shown.
  const { targetId } = await command<{ targetId: string }>("Target.createTarget", { url: `${origin}/projects/${projectId}/`, newWindow: true }, undefined, 20_000);
  const { sessionId: tab } = await command<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true }, undefined, 20_000);
  await command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false }, tab, 20_000);
  const other = async <T = unknown>(expression: string): Promise<T> => {
    const result = await command<{ result: { value: T }; exceptionDetails?: unknown }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, tab, 20_000);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const otherWaits = async (expression: string, timeoutMs = 30_000) => {
    for (const deadline = Date.now() + timeoutMs; !(await other<boolean>(`(() => { try { return Boolean(${expression}); } catch { return false; } })()`).catch(() => false));) {
      assert.ok(Date.now() < deadline, `DOM condition timeout in the second tab: ${expression.slice(0, 160)}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };
  const otherPage=await pluginFrameBrowser(t,{command,on:opened.on,evaluate:other,sessionId:tab},"coding");
  // The second tab picks the same session from Coding's list, the way a person would.
  assert.equal(await other("document.visibilityState"), "visible");
  await otherWaits(`document.querySelector('[data-plugin-strip] [data-plugin-id="coding"]')`);
  await other(`document.querySelector('[data-plugin-strip] [data-plugin-id="coding"]').click()`);
  // SYS-53: the server renders links before their handlers load; the readiness marker belongs to the trusted owner.
  await otherWaits(`document.querySelector('[data-work-surface="coding"]')?.dataset.uiClientState === 'ready' && !document.querySelector('[data-work-surface="coding"]').inert`);
  await otherPage.waitFor(`document.querySelector('${coding} [data-coding-session=${JSON.stringify(session)}]')`);
  await otherPage.evaluate(`document.querySelector('${coding} [data-coding-session=${JSON.stringify(session)}]').click()`);
  await otherPage.waitFor(`document.querySelector('${coding} [data-coding-session][aria-current=true]')?.dataset.codingSession === ${JSON.stringify(session)} && document.querySelector(${JSON.stringify(card(coding))})`);
  // Its request to answer waits in its page until released; the reply is kept for the assertions. Every read of the session that
  // starts after the reply waits until `__rereads()`, and is counted once the page has drawn from it: its JSON taken, and the page's own
  // code after that run.
  await otherPage.evaluate(`(() => { const original = window.fetch; let release, reread; window.__held = new Promise(resolve => { release = resolve; }); window.__release = () => release();
    window.__readsAfter = 0; const rereads = new Promise(resolve => { reread = resolve; }); window.__rereads = () => reread();
    window.fetch = async (...args) => { const answering = args[1] && typeof args[1].body === 'string' && args[1].body.includes('"kind":"answer"');
      const rereading = Boolean(window.__reply) && !(args[1] && args[1].body) && /\\/sessions\\//.test(String(args[0]));
      if (answering) { window.__sent = true; await window.__held; }
      if (rereading) { await rereads; const response = await original(...args), json = response.json.bind(response);
        response.json = async () => { const value = await json(); setTimeout(() => { window.__readsAfter++; }); return value; }; return response; }
      const response = await original(...args); if (answering) window.__reply = { status: response.status, body: await response.clone().json() }; return response; }; })()`);
  await otherPage.evaluate(`document.querySelector(${JSON.stringify(`${card(coding)} [data-ix-field="q0"] [data-ix-option="0"]`)}).click()`);
  await otherPage.evaluate(`document.querySelector(${JSON.stringify(`${card(coding)} [data-ix-action="answer"]`)}).click()`);
  await otherPage.waitFor("window.__sent === true");

  await click(`${card(coding)} [data-ix-field="q0"] [data-ix-option="1"]`);
  await click(`${card(coding)} [data-ix-action="answer"]`);
  await waitFor(`document.querySelector('${coding}').innerText.includes(${JSON.stringify(LOGIN.done)})`, 30_000);
  assert.equal(heard.length, 1, "the first tab's answer is taken and the round goes on");
  // The round ends writing its own records; what is on disk once they stop changing is what the refused answer must leave.
  let taken = await runtimeFiles(homeDirectory);
  for (let attempt = 0, same = 0; same < 3; attempt++) {
    assert.ok(attempt < 100, "the round's records settle");
    await new Promise(resolve => setTimeout(resolve, 200));
    const now = await runtimeFiles(homeDirectory); same = JSON.stringify([...now]) === JSON.stringify([...taken]) ? same + 1 : 0; taken = now;
  }

  // The second tab follows the round too: it sees the question answered and the round end while its own answer is still on the
  // way. The card it was sent from stays, so the answer's outcome has a place to show.
  await otherPage.waitFor(`document.querySelector('${coding}').innerText.includes(${JSON.stringify(LOGIN.done)})`);
  assert.equal(await otherPage.evaluate(`document.querySelector(${JSON.stringify(card(coding))})?.dataset.busy`), "true", "the card whose answer is on its way is not taken down");
  await otherPage.evaluate("window.__release()");
  await otherPage.waitFor("window.__reply");
  const reply = await otherPage.evaluate<{ status: number; body: { code?: string; error?: string } }>("window.__reply");
  // The first answer was taken and the round has ended: what the Host knows is that, not who answered.
  assert.deepEqual([reply.status, reply.body.code], [409, "coding.round_ended"], "the other is refused with a code: the round has ended");
  const refusedCard = `(() => { const node = document.querySelector(${JSON.stringify(card(coding))}); return node && { refused: node.dataset.refused, note: node.querySelector('[data-ix-note]').textContent,
    open: [...node.querySelectorAll('fieldset,button')].filter(one => !one.disabled).length, picked: node.querySelector('[data-ix-field="q0"] [data-ix-option="0"]').getAttribute('aria-checked') ?? node.querySelector('[data-ix-field="q0"] [data-ix-option="0"]').getAttribute('aria-pressed') }; })()`;
  const kept = { refused: "true", note: reply.body.error, open: 0, picked: "true" };
  // Refused, before the page has read the session again: the card is closed with its reason.
  await otherPage.waitFor(`JSON.stringify(${refusedCard}) === ${JSON.stringify(JSON.stringify(kept))}`);
  // The page reads the session again after the refusal; the question is gone from the round, and the refused card stays, closed,
  // with its reason and what was picked, so the person sees why it was not sent.
  await otherPage.evaluate("window.__rereads()");
  await otherPage.waitFor("window.__readsAfter >= 1");
  assert.deepEqual(await otherPage.evaluate(refusedCard), kept, "after the session is read again, the refused card still says why, closed");
  await new Promise(resolve => setTimeout(resolve, 800));
  assert.equal(heard.length, 1, "the round heard the answer once");
  const answer = answersIn(heard[0]!.body);
  assert.match(answer, /导出/, "it heard the answer that was taken");
  assert.doesNotMatch(answer, /登录/, "and not the refused one");
  assert.deepEqual(await runtimeFiles(homeDirectory), taken, "the refused answer writes nothing: the session, its run and its queue are unchanged on disk");
});

const GOAL_QUESTION = (side: string) => ({ why: `${side}：这件事挂到哪个 Goal 下`, questions: [{ id: "goal", type: "reference", prompt: "关联的 Goal", refKinds: ["goal"] }] });
const OURS: Asked = { task: "甲项目：把发布挂到 Goal", done: "甲：挂好了。", ask: GOAL_QUESTION("甲") };
const THEIRS: Asked = { task: "乙项目：把发布挂到 Goal", done: "乙：挂好了。", ask: GOAL_QUESTION("乙") };
const OUR_GOAL = "甲项目的发布清单", THEIR_GOAL = "乙项目的发布清单";

test("AC-05: a reference question in one project finds and keeps only that project's objects; switching projects carries no pick or answer across", { timeout: 300_000 }, async t => {
  const opened = await openCoding(t, [OURS, THEIRS]); if (!opened) return;
  const { click, evaluate, waitFor, command, sessionId, coding, heard, enter, ask, show, projectId, homeDirectory } = opened;
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const other = await (async () => {
    try {
      const project = await catalog.createProject({ display_name: "另一项目", actor_id: "browser-test" });
      for (const plugin_id of PROJECT_SCOPED_PLUGIN_IDS) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id, actor_id: "browser-test" });
      return project.project_id;
    } finally { catalog.close(); }
  })();
  /** A Goal created through the project's own Goals route, from the page, in the project the page is in. */
  const goal = (goalId: string, title: string) => opened.ownerEvaluate(`fetch(document.body.dataset.routePrefix + '/api/goals', { method: 'POST',
    headers: { ...molisWorkControlHeaders(), 'content-type': 'application/json', 'x-molis-work-idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ goal_id: ${JSON.stringify(goalId)}, title: ${JSON.stringify(title)}, outcome: '', why: '', business_logic: '' }) })
    .then(async r => { if (!r.ok) throw new Error(await r.text()); })`);
  const card = `${coding} [data-coding-question][data-ix-question]`;
  const query = `${card} [data-ix-field=r0] [data-ix-ref-query]`, list = `${card} [data-ix-field=r0] [role=listbox]`;
  /** Types into the question's search until it offers something (a fresh Home may still be indexing); resolves to the labels offered. */
  const search = async (words: string) => {
    for (let attempt = 0; attempt < 20 && !(await evaluate<boolean>(`!document.querySelector('${list}').hidden`)); attempt++) {
      await evaluate(`(() => { const input = document.querySelector('${query}'); input.focus(); input.value = ''; })()`);
      await command("Input.insertText", { text: words }, sessionId);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    await waitFor(`!document.querySelector('${list}').hidden`, 10_000);
    return evaluate<Array<{ value: string; label: string }>>(`[...document.querySelectorAll('${list} [role=option]')].map(o => ({ value: o.dataset.ixRefOption, label: o.dataset.label }))`);
  };
  const pickedRef = () => evaluate<string | null>(`document.querySelector('${card} [data-ix-field=r0] [data-ix-reference]')?.dataset.ixReference ?? null`);

  await enter(projectId!);
  await goal("our-release", OUR_GOAL);
  const ours = await ask(OURS.task);
  const offeredHere = await search("发布清单");
  assert.ok(offeredHere.some(one => one.label === OUR_GOAL), "this project's Goal is offered");
  assert.ok(!offeredHere.some(one => one.label === THEIR_GOAL), "another project's Goal is never offered here");
  await click(`${list} [data-ix-ref-option="goal our-release"]`);
  await waitFor(`document.querySelector('${card} [data-ix-field=r0] [data-ix-reference]')?.dataset.ixReference === 'goal our-release'`);

  await enter(other);
  await goal("their-release", THEIR_GOAL);
  const theirs = await ask(THEIRS.task);
  assert.notEqual(theirs, ours);
  assert.equal(await pickedRef(), null, "the pick made in the other project is not on this project's card");
  const offeredThere = await search("发布清单");
  assert.ok(offeredThere.some(one => one.label === THEIR_GOAL));
  assert.ok(!offeredThere.some(one => one.label === OUR_GOAL), "the first project's Goal is never offered in this one");
  await click(`${list} [data-ix-ref-option="goal their-release"]`);
  await waitFor(`document.querySelector('${card} [data-ix-field=r0] [data-ix-reference]')?.dataset.ixReference === 'goal their-release'`);
  // S-26 at Coding's door: the first project's Goal, named in an answer sent to this session as the page sends one, is refused
  // by the Host (it cannot be read in this project) and nothing of it is written; the question still takes the real answer.
  const path = encodeURIComponent(theirs);
  await waitFor(`window.__sent.some(one => one.url.includes('/sessions/${path}'))`, 10_000);
  const run = await evaluate<{ run_id: string; pending_id: string; pending_revision: number }>(`(() => {
    const [run_id, pending_id, pending_revision] = JSON.parse(document.querySelector('${card}').dataset.questionKey); return { run_id, pending_id, pending_revision }; })()`);
  const before = await runtimeFiles(homeDirectory);
  assert.ok(before.size > 0, "the runtime's files are where this reads them");
  const forged = await evaluate<{ status: number; code?: string }>(`(async () => {
    const url = window.__sent.find(one => one.url.includes('/sessions/${path}')).url.split('/sessions/')[0] + '/sessions/${path}/control';
    const response = await fetch(url, { method: 'POST', headers: molisWorkControlHeaders(), body: JSON.stringify({ kind: 'answer', ...${JSON.stringify(run)},
      answers: [{ question: 0, value: [{ kind: 'goal', id: 'our-release', label: ${JSON.stringify(OUR_GOAL)} }] }] }) });
    return { status: response.status, code: (await response.json()).code }; })()`);
  assert.equal(forged.status, 400, "an object of another project is refused");
  assert.equal(forged.code, "agent.answer_invalid");
  assert.deepEqual(await runtimeFiles(homeDirectory), before, "and nothing of the refused answer is written");
  assert.equal(heard.filter(one => one.task === THEIRS.task).length, 0, "no round heard it");
  await click(`${card} [data-ix-action="answer"]`);
  await waitFor(`document.querySelector('${coding}').innerText.includes(${JSON.stringify(THEIRS.done)})`, 30_000)
    .catch(async error => { throw new Error(`${(error as Error).message}\ncard note: ${await evaluate<string>(`document.querySelector('${card} [data-ix-note]')?.textContent ?? '(no card)'`)}\nheard: ${heard.map(one => one.task).join(", ")}`); });
  const theirHeard = heard.find(one => one.task === THEIRS.task)!.body;
  assert.match(theirHeard, new RegExp(THEIR_GOAL));
  assert.doesNotMatch(theirHeard, new RegExp(`${OUR_GOAL}|our-release`), "this project's run never hears the other project's Goal");

  await enter(projectId!);
  await show(ours, projectId!);
  assert.equal(await pickedRef(), "goal our-release", "back in the first project, its own pick is there and the other project's is not");
  await click(`${card} [data-ix-action="answer"]`);
  await waitFor(`document.querySelector('${coding}').innerText.includes(${JSON.stringify(OURS.done)})`, 30_000);
  const ourHeard = heard.find(one => one.task === OURS.task)!.body;
  assert.match(ourHeard, new RegExp(OUR_GOAL));
  assert.doesNotMatch(ourHeard, new RegExp(`${THEIR_GOAL}|their-release`), "the first project's run never hears the other project's Goal");
});

const FIRST = "联系阿杰确认秋季发布计划。附上本周方案和预算说明。";
const SECOND = "联系小王确认周末徒步路线。附上集合时间。";
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

// The card was made from what was selected then; a selection made later, while it is shown or in the moment its button is
// pressed, never becomes its target.
test("AC-05: an action card keeps the selection it was made from; selecting something else after it shows, or as its button is pressed, changes nothing it does", { timeout: 180_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { command, sessionId, navigate, evaluate, waitFor, click, origin, projectId, homeDirectory, store } = browser;
  const child=await pluginFrameBrowser(t,browser,"pages");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  const pages = openPagesStore(homeDirectory);
  const page = (() => { try { return pages.create({ project_id: projectId!, title: "发布笔记", body: { type: "doc", content: [paragraph(FIRST), paragraph(SECOND)] } }); } finally { pages.close(); } })();
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
  await child.waitFor(`document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes(${JSON.stringify(SECOND)})`);
  const selectScript = (index: number) => `(() => {
    const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const text = editor.querySelectorAll('p')[${index}].firstChild, range = document.createRange(); range.selectNodeContents(text);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange'));
  })()`;
  const select = (index: number) => child.evaluate(selectScript(index));
  const bar = ".mw-ctx:not(.mw-ctx--static):not([hidden]):not([data-away])";
  // A write that still goes as a card (记成待办 is made at once since W4-1): a plan broken into Goal steps, a proposal.
  const writeButton = `[...document.querySelectorAll('${bar} button,.mw-ctx-menu button')].find(button => !button.disabled && button.textContent.startsWith('拆成目标步骤'))`;
  await evaluate(`(() => { const original = window.fetch; window.__placed = []; window.__runs = [];
    window.fetch = async (url, options) => {
      if (String(url).includes('/cards/') && String(url).endsWith('/run')) window.__runs.push(JSON.parse(options.body));
      const response = await original(url, options);
      if (String(url).endsWith('/api/assistant/cards') && response.ok) window.__placed.push(await response.clone().json());
      return response;
    }; })()`);
  /** Selects paragraph `index`, takes 「记成待办」 from the bar beside it, and resolves to the card it placed once it is shown. */
  const offer = async (index: number) => {
    const before = await evaluate<number>("window.__placed.length");
    // The Assistant's panel, open on the last card, covers the passage and its bar waits for the cover to go (context-bar):
    // the person closes it to see the page.
    if (await evaluate<boolean>("Boolean(document.querySelector('[data-assistant-panel-close]')?.getClientRects().length)")) await click("[data-assistant-panel-close]");
    await select(index);
    await waitFor(`document.querySelector('${bar} [data-more]')`, 8000).catch(async error => { throw new Error(`${(error as Error).message}\nbars: ${await evaluate<string>(
      `[...document.querySelectorAll('.mw-ctx'), ...[...document.querySelectorAll('iframe')].flatMap(frame => { try { return [...frame.contentDocument.querySelectorAll('.mw-ctx')]; } catch { return []; } })].map(node => node.outerHTML.slice(0, 400)).join(' || ')`)}\nselection: ${await child.evaluate<string>("getSelection().toString()")}\nassistant open: ${await evaluate<boolean>("!document.querySelector('[data-assistant-panel]')?.hidden")}`); });
    await click(`${bar} [data-more]`);
    await waitFor(`Boolean(${writeButton})`);
    await evaluate(`${writeButton}.click()`);
    await waitFor(`window.__placed.length === ${before + 1} && !document.querySelector('[data-assistant-panel]').hidden`, 10_000);
    const placed = await evaluate<{ work_id: string }>(`window.__placed[${before}]`);
    const view = await evaluate<{ cards: Array<{ card_id: string; capability_id: string; status: string }> }>(
      `fetch(document.body.dataset.routePrefix + '/api/assistant/works/' + ${JSON.stringify(placed.work_id)}, { headers: molisWorkControlHeaders() }).then(r => r.json())`);
    const card = view.cards.filter(one => one.capability_id === "goals.tree.submit" && one.status === "ready").at(-1);
    assert.ok(card, "a ready card for the selection");
    const selector = `[data-card="${card.card_id}"]`;
    await waitFor(`document.querySelector(${JSON.stringify(`${selector} [data-ix-action="run"]`)})`);
    return selector;
  };
  // Each proposal by the passage it was made from: its steps, as the person selected them.
  const proposals = () => new GoalProjectApplication(store).goalTree.listGoalTreeProposals({ project_id: projectId! }).proposals
    .map(proposal => (proposal.narrative?.main_path ?? []).join("。") + "。");

  // 1. After the card is shown, the person selects the other paragraph; the bar follows the new selection, the card does not.
  const first = await offer(0);
  await select(1);
  assert.equal(await child.evaluate("getSelection().toString()"), SECOND);
  assert.equal(await evaluate<boolean>(`document.querySelector(${JSON.stringify(first)}).textContent.includes(${JSON.stringify(SECOND)})`), false,
    "the shown card does not take up the new selection");
  await click(`${first} [data-ix-action="run"]`);
  await waitFor(`document.querySelector(${JSON.stringify(first)})?.dataset.status === 'done'`, 20_000);
  assert.deepEqual(proposals(), [FIRST], "the card did what it was made from; nothing was made from the selection that came after");

  // 2. In the moment its button is pressed: the pointer going down on it selects the other paragraph first.
  const second = await offer(1);
  const pressAt = await evaluate<{x:number;y:number}>(`(() => {const button=document.querySelector(${JSON.stringify(`${second} [data-ix-action="run"]`)});button.scrollIntoView({block:"center"});const box=button.getBoundingClientRect();return {x:box.x+box.width/2,y:box.y+box.height/2};})()`);
  await command("Input.dispatchMouseEvent",{type:"mousePressed",...pressAt,button:"left",clickCount:1},sessionId);
  await select(0);
  await command("Input.dispatchMouseEvent",{type:"mouseReleased",...pressAt,button:"left",clickCount:1},sessionId);
  await waitFor(`document.querySelector(${JSON.stringify(second)})?.dataset.status === 'done'`, 20_000);
  assert.equal(await child.evaluate("getSelection().toString()"), FIRST, "the selection did change as the button was pressed");
  const runs = await evaluate<unknown[]>("window.__runs");
  assert.equal(runs.length, 2);
  assert.equal(JSON.stringify(runs[1]).includes(FIRST), false, "what the press sent carries nothing of the selection made at that moment");
  assert.deepEqual(proposals().sort(), [FIRST, SECOND].sort(), "each card made its own proposal once; the selection at the press made none");
  assert.equal(await child.evaluate("document.querySelector('[data-pages-editor] .ProseMirror').textContent"), FIRST + SECOND, "the page is unchanged");
});
