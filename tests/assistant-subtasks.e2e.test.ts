import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantNotice, AssistantScope, AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { recordingTextModel, type ModelWire } from "./fixtures/recording-text-model.js";
import { cogniaScriptedResponse as reply } from "./fixtures/cognia-model-response.js";
import { holdSubtaskDraft } from "./fixtures/subtask-draft-barrier.js";

const userTexts = (body: ModelWire) => body.messages.filter(message => message.role === "user").map(message => typeof message.content === "string" ? message.content : JSON.stringify(message.content));

// SAI-01/02/04/05/07/11/15: real local HTTP provider, installed SDK, resident Host, native page, original Work/child histories.
// The model responses are scripted; this is engineering integration evidence, not a real-provider or user acceptance claim.
for (const place of ["project", "home"] as const) for (const source of ["work", "sdk"] as const) test(`Assistant ${place} ${source} child opens in the shared float, continues its own context, and leaves main input untouched`, { timeout: 120_000 }, async t => {
  let parentCalls = 0, childCalls = 0; const bodies: ModelWire[] = [];
  const followUp = Promise.withResolvers<void>(); t.after(() => followUp.resolve());
  const browser = await openGoalBrowser(t, "user", undefined, undefined, undefined, undefined, { prepareHome: async home => {
    await recordingTextModel(t, home, async body => {
      bodies.push(body);
      const words = userTexts(body).join("\n");
      if (userTexts(body)[0]?.includes(`CHILD_${source}_59`)) { childCalls++; if (words.includes(`FOLLOW_UP_${source}_59`)) await followUp.promise; return reply(undefined, `Child answer ${childCalls}`); }
      if (words.includes(`PARENT_${source}_59`) && ++parentCalls === 1) {
        if (source === "work") return reply({ name: "delegate-work", input: { title: "真实子任务 59", brief: `CHILD_${source}_59: reply with one sentence.`, acceptance: "一句话" } });
        const character = JSON.stringify(body.system).match(/molis-child-[a-z0-9-]+@\d+/u)?.[0]; assert.ok(character, "real registered child Character is offered");
        return reply({ name: "dispatch-subagent", input: { instruction: `CHILD_${source}_59: reply with one sentence.`, tools: [], character, idempotencyKey: "ui-child" } });
      }
      return reply(undefined, "Parent stays here.");
    });
  } }); if (!browser) return;
  const width = place === "home" ? source === "work" ? 390 : 1024 : 1440;
  const locale = source === "sdk" ? "en" : "zh", theme = source === "sdk" ? "dark" : "light";
  await browser.command("Emulation.setDeviceMetricsOverride", { width, height: 960, deviceScaleFactor: 1, mobile: width === 390 }, browser.sessionId);
  await browser.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }, { name: "prefers-reduced-motion", value: "reduce" }] }, browser.sessionId);
  await browser.command("Network.setCookie", { name: "molis_work_locale", value: locale, url: browser.origin }, browser.sessionId);
  await browser.command("Page.addScriptToEvaluateOnNewDocument", { source: `window.__subtaskErrors=[];addEventListener('error',e=>window.__subtaskErrors.push(e.message));addEventListener('unhandledrejection',e=>window.__subtaskErrors.push(String(e.reason?.stack??e.reason)));` }, browser.sessionId);
  await browser.navigate(() => browser.command("Page.navigate", { url: place === "project" ? `${browser.origin}/projects/${browser.projectId}/` : `${browser.origin}/` }, browser.sessionId));
  await browser.waitFor("document.querySelector('[data-assistant-composer] .mw-composer__input')", 20_000);
  const base = place === "project" ? `/projects/${browser.projectId}/api/assistant` : "/api/assistant";
  const scope: AssistantScope = place === "project" ? { kind: "project", project_id: browser.projectId } : { kind: "personal" };
  assert.equal(await browser.evaluate("!!document.querySelector('script[data-assistant-subtasks]')"), false, "subtask program is not fetched before first opening");
  const sent = await browser.evaluate<AssistantSendResult>(`fetch(${JSON.stringify(base + "/send")}, {method:'POST',headers:molisWorkControlHeaders(),body:JSON.stringify({text:${JSON.stringify(`PARENT_${source}_59`)},scope:${JSON.stringify(scope)},request_id:crypto.randomUUID()})}).then(r=>r.json())`);
  assert.ok(sent.work, JSON.stringify(sent));
  await browser.evaluate(`document.dispatchEvent(new CustomEvent('molis:assistant-open',{detail:{work_id:${JSON.stringify(sent.work.work_id)}}}))`);
  const read = () => browser.evaluate<AssistantWorkView>(`fetch(${JSON.stringify(base + "/works/" + sent.work.work_id)}).then(r=>r.json())`);
  let current: AssistantWorkView | undefined;
  for (const end = Date.now() + 35_000; Date.now() < end;) {
    current = await read();
    for (const review of current.reviews) await browser.evaluate(`fetch(${JSON.stringify(base + "/works/" + sent.work.work_id + "/reviews/" + review.review_id)}, {method:'POST',headers:molisWorkControlHeaders(),body:JSON.stringify({decision:'approve',version:${JSON.stringify(review.version)}})}).then(r=>r.json())`);
    if (childCalls && (source === "work" ? current.delegated?.some(child => child.state === "completed") : current.sdk_subtasks && "children" in current.sdk_subtasks && current.sdk_subtasks.children.some(child => child.state === "completed"))) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(childCalls, JSON.stringify(current));
  if (source === "sdk") {
    await browser.waitFor("[...document.querySelectorAll('.assistant-msg--note')].some(node=>node.textContent.includes('Child answer 1'))", 15_000);
    const peer = await browser.evaluate<string[]>("[...document.querySelectorAll('.assistant-msg--note')].map(node=>node.textContent)");
    assert.doesNotMatch(peer.join("\n"), /resume: subagent|board-report|A person added input to subagent/, "SAI-07: parent notices show the original report summary, without model protocol");
  }
  const notices = () => browser.evaluate<{ notices: AssistantNotice[] }>(`fetch(${JSON.stringify(base + "/notices")}).then(r=>r.json())`);
  await notices();
  await browser.evaluate(`fetch(${JSON.stringify(base + "/notices")},{method:'POST',headers:molisWorkControlHeaders(),body:JSON.stringify({work_id:${JSON.stringify(sent.work.work_id)},state:'seen'})}).then(r=>r.json())`);
  // Read the existing path list after the parent has settled, then use its actual child-name button.
  await browser.evaluate("window.dispatchEvent(new Event('focus'))");
  await browser.waitFor("document.querySelector('.assistant-subtask-name')", 15_000);
  if (!await browser.evaluate("document.querySelector('.assistant-subtask-name').getBoundingClientRect().width > 0")) await browser.click("[data-assistant-side-toggle]");
  await browser.evaluate(`(() => { const input=document.querySelector('[data-assistant-composer] .mw-composer__input');input.value='main draft stays';input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  if (place === "home" && source === "sdk") {
    // B59-FIX-03: an unchanged Assistant wait does not project the original question and review widgets again.
    const sdkTasks = current?.sdk_subtasks;
    assert.ok(sdkTasks && "children" in sdkTasks && sdkTasks.children[0]?.state === "completed");
    const child = sdkTasks.children[0]!;
    const waitPath = base + "/works/" + sent.work.work_id + "/sdk-subtasks/" + child.parent_run.run_id + "/" + child.subagent_id + "/wait?timeout=0";
    const wait = (suffix = "") => browser.evaluate<{ version: string; conversation?: unknown }>(`fetch(${JSON.stringify(waitPath + suffix)}).then(r=>r.json())`);
    const first = await wait();
    assert.ok(first.version && first.conversation);
    assert.deepEqual(await wait("&since=" + encodeURIComponent(first.version)), { version: first.version });

    // SAI-04/11: the first load is still pending when its parent is closed; a late error cannot reopen it.
    const held = Promise.withResolvers<{ requestId: string; session: string | undefined }>();
    const off = browser.on("Fetch.requestPaused", (event, session) => held.resolve({ requestId: String(event.requestId), session }));
    t.after(off);
    await browser.command("Fetch.enable", { patterns: [{ urlPattern: "*/assets/molis-work-assistant-subtasks.js", requestStage: "Request" }] }, browser.sessionId);
    await browser.click(".assistant-subtask-name");
    const request = await held.promise;
    await browser.click("[data-assistant-panel-close]");
    await browser.command("Fetch.failRequest", { requestId: request.requestId, errorReason: "ConnectionFailed" }, request.session);
    await browser.command("Fetch.disable", {}, browser.sessionId); off();
    await browser.waitFor("!document.querySelector('script[data-assistant-subtasks]')");
    assert.equal(await browser.evaluate("!!document.querySelector('[data-work-task-float]')"), false);
    await browser.evaluate(`document.dispatchEvent(new CustomEvent('molis:assistant-open',{detail:{work_id:${JSON.stringify(sent.work.work_id)}}}))`);
    if (!await browser.evaluate("document.querySelector('.assistant-subtask-name')?.getBoundingClientRect().width > 0")) await browser.click("[data-assistant-side-toggle]");
    await browser.waitFor("document.querySelector('.assistant-subtask-name')?.getBoundingClientRect().width > 0");
  }
  const workPath = source === "work" ? base + "/works/" + current!.delegated![0]!.work_id : undefined;
  const draftPath = place === "home" ? workPath : undefined;
  const followUpText = `FOLLOW_UP_${source}_59`;
  const writeDraft = (draft: string) => browser.evaluate<boolean>(`fetch(${JSON.stringify(draftPath + "/draft")},{method:'POST',headers:molisWorkControlHeaders(),body:JSON.stringify({draft:${JSON.stringify(draft)}})}).then(response=>response.ok)`);
  if (draftPath) assert.equal(await writeDraft(followUpText), true);
  await browser.evaluate("window.__subtaskEntry=document.querySelector('.assistant-subtask-name')");
  await browser.click(".assistant-subtask-name");
  try { await browser.waitFor("document.querySelector('[data-work-task-float] .mw-subtask__composer .mw-composer__input')", 15_000); }
  catch (error) { t.diagnostic(JSON.stringify(await browser.evaluate("({errors:window.__subtaskErrors,bar:!!document.querySelector('[data-work-bar]'),float:document.querySelector('[data-work-task-float]')?.outerHTML.slice(0,1500)})"))); throw error; }
  assert.equal(await browser.evaluate("document.querySelectorAll('script[data-assistant-subtasks]').length"), 1, "both native shells load the same shared program once");
  const childInput = "document.querySelector('[data-work-task-float] .mw-subtask__composer .mw-composer__input')";
  await browser.waitFor(`${childInput} && !${childInput}.disabled`);
  // SAI-13: the actual shell/float, not a component fixture, contains both inputs at the supported widths.
  const layout = await browser.evaluate<{ left: number; right: number; top: number; bottom: number; viewport: number; height: number; theme: string; locale: string }>(`(() => {
    const rect=document.querySelector('[data-work-task-float]').getBoundingClientRect();
    return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,viewport:innerWidth,height:innerHeight,theme:document.documentElement.dataset.resolvedTheme,locale:document.documentElement.lang};
  })()`);
  assert.ok(layout.left >= 0 && layout.right <= layout.viewport + 1 && layout.top >= 0 && layout.bottom <= layout.height + 1, JSON.stringify(layout));
  assert.equal(layout.theme, theme); assert.ok(layout.locale.startsWith(locale));
  const before = childCalls;
  const failedDraft = place === "project" && workPath ? Promise.withResolvers<{ requestId: string; session: string | undefined }>() : undefined;
  if (failedDraft) {
    t.after(browser.on("Fetch.requestPaused", (event, session) => failedDraft.resolve({ requestId: String(event.requestId), session })));
    await browser.command("Fetch.enable", { patterns: [{ urlPattern: `*${workPath}/draft` }] }, browser.sessionId);
  }
  if (draftPath) {
    // B59-FIX-02: Work restored the first revision. A later owner write must survive sending the visible text.
    await browser.waitFor(`${childInput}.value === ${JSON.stringify(followUpText)}`);
    assert.equal(await writeDraft("a newer draft from another page"), true);
    await browser.evaluate(`${childInput}.focus()`);
  } else {
    await browser.evaluate(`(() => { const input=${childInput};input.value=${JSON.stringify(followUpText)};input.dispatchEvent(new Event('input',{bubbles:true}));input.focus(); })()`);
  }
  await browser.command("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 2 }, browser.sessionId);
  await browser.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 2 }, browser.sessionId);
  if (failedDraft) {
    // B59-FIX-02: a failed Work autosave must leave the same edit retryable without retyping it.
    const failure = await failedDraft.promise;
    await browser.command("Fetch.failRequest", { requestId: failure.requestId, errorReason: "ConnectionFailed" }, failure.session);
    await browser.command("Fetch.disable", {}, browser.sessionId);
    const retry = '[data-work-task-float] [data-composer-status-action="retry"]';
    await browser.waitFor(`document.querySelector(${JSON.stringify(retry)})`);
    assert.equal(await browser.evaluate(`${childInput}.value`), followUpText);
    assert.equal(childCalls, before);
    await browser.click(retry);
  }
  try { await browser.waitFor(`document.querySelector('[data-work-task-float]')?.textContent.includes('FOLLOW_UP_${source}_59')`, 20_000); }
  catch (error) { t.diagnostic(JSON.stringify({ parentCalls, childCalls, view: await read(), ui: await browser.evaluate("({errors:window.__subtaskErrors,float:document.querySelector('[data-work-task-float]')?.outerHTML})") })); throw error; }
  for (const end = Date.now() + 20_000; childCalls === before && Date.now() < end;) await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(childCalls, before + 1);
  assert.ok(bodies.some(body => userTexts(body).some(text => text.includes(`FOLLOW_UP_${source}_59`))));
  if (draftPath) assert.equal((await browser.evaluate<AssistantWorkView>(`fetch(${JSON.stringify(draftPath)}).then(response=>response.json())`)).work.draft, "a newer draft from another page");
  assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] .mw-composer__input').value"), "main draft stays");
  await browser.evaluate("window.dispatchEvent(new Event('focus'))");
  try { await browser.waitFor("!window.__subtaskEntry.isConnected", 15_000); }
  catch (error) { t.diagnostic(JSON.stringify({ before, parentCalls, childCalls, original: current, now: await read(), ui: await browser.evaluate("({hidden:document.hidden,entry:window.__subtaskEntry.outerHTML,path:document.querySelector('[data-assistant-side-path]')?.textContent,errors:window.__subtaskErrors})") })); throw error; }
  await browser.evaluate(`${childInput}.focus()`);
  await browser.command("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, browser.sessionId);
  await browser.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, browser.sessionId);
  await browser.waitFor("!document.querySelector('[data-work-task-float]')");
  await browser.waitFor("document.activeElement===document.getElementById(window.__subtaskEntry.id)");
  assert.notEqual(await browser.evaluate("document.activeElement===window.__subtaskEntry"), true, "focus returns to the same logical entry after its actual state refresh");
  assert.equal(await browser.evaluate("document.querySelector('[data-assistant-composer] .mw-composer__input').value"), "main draft stays");
  // A result still being read in the open parent is correctly marked seen. Close it before this new reply arrives.
  await browser.click(".assistant-subtask-name"); await browser.waitFor(childInput);
  await browser.click("[data-work-task-float] [data-subtask-close]");
  await browser.waitFor("!document.querySelector('[data-work-task-float]') && document.activeElement===document.getElementById(window.__subtaskEntry.id)");
  await browser.click(".assistant-subtask-name"); await browser.waitFor(childInput);
  await browser.click("[data-assistant-composer] .mw-composer__input");
  if (place === "project") await browser.waitFor("!document.querySelector('[data-work-task-float]')");
  assert.equal(await browser.evaluate("document.activeElement===document.querySelector('[data-assistant-composer] .mw-composer__input')"), true, "choosing the main input preserves its focus; Home keeps both conversations open");
  await browser.click("[data-assistant-panel-close]");
  followUp.resolve();
  let updates: AssistantNotice[] = [];
  for (const end = Date.now() + 15_000; Date.now() < end;) {
    updates = (await notices()).notices.filter(one => one.work_id === sent.work.work_id && one.kind === "result");
    if (updates.length) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(updates.length, 1, "a closed child float still leaves the new result at the parent entry");
  assert.ok("key" in updates[0]!.text && updates[0]!.text.key === "workbench.assistant-notice.subtask-result");
  assert.equal((await read()).rounds.length, source === "work" ? 2 : 1, "result observation never restarts the parent");
  await browser.evaluate(`fetch(${JSON.stringify(base + "/notices")},{method:'POST',headers:molisWorkControlHeaders(),body:JSON.stringify({notice_id:${JSON.stringify(updates[0]!.notice_id)},state:'seen'})}).then(r=>r.json())`);
  assert.equal((await notices()).notices.filter(one => one.work_id === sent.work.work_id && one.kind === "result").length, 0, "original result replay preserves the read state");
  if (place === "home" && source === "sdk") {
    // B59-FIX-01/02: a close before the first budget POST leaves the same action usable on the actual Home float.
    await browser.evaluate("document.dispatchEvent(new CustomEvent('molis:assistant-open',{detail:{work_id:" + JSON.stringify(sent.work.work_id) + "}}))");
    await browser.waitFor("document.querySelector('.assistant-subtask-name')");
    if (!await browser.evaluate("document.querySelector('.assistant-subtask-name').getBoundingClientRect().width > 0")) await browser.click("[data-assistant-side-toggle]");
    const extend = "[data-work-task-float] [data-subtask-action=extend-budget]";
    await browser.click(".assistant-subtask-name");
    await browser.waitFor("document.querySelector(" + JSON.stringify(extend) + ") && " + childInput + ".disabled");
    const held = await holdSubtaskDraft(browser, "extend-budget");
    try {
      await browser.click(extend);
      await held.wait();
      await browser.click("[data-work-task-float] [data-subtask-close]");
      await browser.waitFor("!document.querySelector('[data-work-task-float]')");
    } finally { await held.release(); }
    await browser.click(".assistant-subtask-name");
    await browser.waitFor("document.querySelector(" + JSON.stringify(extend + ":not(:disabled)") + ")");
    assert.equal(held.posts(), 0, "closing during draft CAS prevents the intercepted request");
    assert.equal(childCalls, 2);
    await browser.click(extend);
    await browser.waitFor(childInput + " && !" + childInput + ".disabled");
    assert.equal(held.posts(), 1);
    held.dispose();
    assert.equal(childCalls, 2, "extending the original budget does not dispatch a run");
    const beforeRetry = (await read()).sdk_subtasks;
    assert.ok(beforeRetry && "children" in beforeRetry && beforeRetry.children[0]?.budget?.max_attempts === 5);
    await browser.evaluate("(() => { const input=" + childInput + ";input.value='SAI_THIRD_ASSISTANT';input.dispatchEvent(new Event('input',{bubbles:true})); })()");
    await browser.click("[data-work-task-float] [data-composer-send]");
    await browser.waitFor("document.querySelector('[data-work-task-float]')?.textContent.includes('Child answer 3')");
    assert.equal(childCalls, 3);
    assert.ok(bodies.some(body => userTexts(body).join("\n").includes("SAI_THIRD_ASSISTANT") && JSON.stringify(body.messages).includes("Child answer 2")));
    const afterRetry = await read(), children = afterRetry.sdk_subtasks;
    assert.ok(children && "children" in children);
    assert.equal(children.children[0]?.subagent_id, beforeRetry.children[0]!.subagent_id);
    assert.equal(children.children[0]?.child_run?.session_id, beforeRetry.children[0]!.child_run!.session_id);
    assert.notEqual(children.children[0]?.child_run?.run_id, beforeRetry.children[0]!.child_run!.run_id);
    assert.equal(afterRetry.rounds.length, 1);
  }
});
