import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openWork, sendBrowser, waitWork } from "./fixtures/assistant-send-journey.js";
import type { AssistantSendResult } from "@molis-ai/molis-work-contracts/services/assistant";
import type { SurfaceHomeDisplay } from "@molis-ai/molis-work-app-workbench";

const imFrame = '[data-side-body="discussion"] iframe';
const visible = (selector: string) => '!!document.querySelector(' + JSON.stringify(selector) + ')?.checkVisibility()';
const quoted = (value: string) => JSON.stringify(value);

test("IUI-03 IUI-07 IUI-08 IUI-13: the original Inbox and 等你 display current owner objects and the trusted Inbox area saves one", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null);
  if (!b) return;
  const { projectId, store } = b;
  assert.ok(projectId);
  const feed = createLocalFeedApplication(store.db), sources = createLocalFeedSourceService(store.db, projectId);
  const source = sources.register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "cross-positions" }).source;
  const material = feed.ingestItem({ source, externalId: "cross-positions", title: "Report for the inbox mount", summary: "The original report",
    occurredAt: new Date().toISOString(), attention: false }).item;
  const entry = feed.ensureInboxEntryForFeedItem(projectId, material.item_id, "manual").entry;
  const inbox = await pluginFrameBrowser(t, b, "inbox");
  await b.setViewport(1440, 900);
  await b.command("Network.setCookie", { name: "molis_work_locale", value: "zh", url: b.origin }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/projects/" + projectId + "/" }, b.sessionId));
  const attention = '[data-assistant-attention]', notices = '[data-assistant-notices]';
  const item = '[data-home-subject-kind="feed_item"][data-home-subject-id="' + material.item_id + '"]';
  await b.waitFor(visible(attention), 20_000);
  await b.click(attention);
  await b.waitFor(visible(notices + ' ' + item));
  assert.match(await b.evaluate<string>(`document.querySelector(${quoted(notices + ' ' + item)}).innerText`), /Report for the inbox mount/);
  await b.click(attention);
  const homeEntry = '[data-home-card="io.molis.work.inbox"] [data-home-subject-id="' + entry.entry_id + '"] [data-presentation-action$=":open"]';
  await b.waitFor(visible(homeEntry)); await b.click(homeEntry);

  const own = '[data-inbox-detail="' + entry.entry_id + '"]', slot = '[data-inbox-origin-slot]';
  await inbox.waitFor(`document.querySelector(${quoted(own)})?.hidden === false`);
  assert.equal(await inbox.evaluate(`document.querySelector(${quoted(own + " " + slot)})?.childElementCount`), 0);
  assert.match(await inbox.evaluate<string>(`document.querySelector(${quoted(own + " .mw-presentation--chip")}).textContent`), /Report for the inbox mount/);
  const area = '[data-framed-area] .surface-slot-body';
  await b.waitFor(visible(area + ' .mw-presentation--card'));
  assert.match(await b.evaluate<string>(`document.querySelector(${quoted(area)}).innerText`), /Report for the inbox mount/);
  const menu = area + ' .mw-presentation__more summary';
  const action = (label: string) => `[...document.querySelectorAll(${quoted(area + ' [data-presentation-action]')})].find(button => button.textContent.includes(${quoted(label)}))`;
  const show = async (label: string) => {
    await b.waitFor(`!!${action(label)}`);
    if (!await b.evaluate(`!!${action(label)}?.checkVisibility()`)) await b.click(menu);
    await b.waitFor(`!!${action(label)}?.checkVisibility()`);
    await b.evaluate(`${action(label)}.scrollIntoView({block:'nearest'}); ${action(label)}.setAttribute('data-slot-test-control', '')`);
  };
  const choose = async (label: string) => {
    await show(label);
    await b.waitFor(`!document.querySelector(${quoted(area)}).parentElement.hasAttribute('data-unready')`);
    await b.click('[data-slot-test-control]');
  };
  const stored = () => feed.getFeedItem(projectId, material.item_id);
  await choose("更多操作");
  await b.waitFor(`!!${action("保存为资料")}`);
  assert.equal(await b.evaluate(`!!${action("加入 Inbox")}`), false);
  await show("保存为资料");
  await b.evaluate(`${action("保存为资料")}.click()`);
  assert.equal(await b.evaluate(`!!document.querySelector(${quoted(area + ' [data-framed-control="confirm"]')})`), false);
  assert.equal(stored().revision, material.revision);
  await choose("保存为资料");
  await b.waitFor(visible(area + ' [data-framed-control="confirm"]'));
  await b.click(area + ' [data-framed-control="cancel"]');
  await b.waitFor(`!document.querySelector(${quoted(area + ' [data-framed-control="confirm"]')})`);
  assert.equal(stored().revision, material.revision);
  await choose("保存为资料");
  await b.waitFor(visible(area + ' [data-framed-control="confirm"]'));
  await b.click(area + ' [data-framed-control="confirm"]');
  await b.waitFor(`document.querySelector(${quoted(area)}).innerText.includes('已完成')`);
  assert.equal(stored().disposition, "saved");
  assert.equal(stored().revision, material.revision + 1);
});

test("IUI-03 IUI-21 IUI-26: the real discussion composer picks a Goal, sends only a reference, and keeps it when quoted", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null);
  if (!b) return;
  const prefix = "/projects/" + b.projectId, title = "Searchable discussion object";
  await b.setViewport(1440, 900);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + prefix + "/" }, b.sessionId));
  const { goal } = await b.web.post<{ goal: { goal_id: string } }>(prefix + "/api/plugins/io.molis.work.goals/goals", { title, outcome: "Same object's actual outcome", idempotency_key: randomUUID() });
  await b.waitFor(visible('[data-side-tabs] [data-side-tab][aria-selected=true]'));
  await b.click('[data-side-tabs] [data-side-tab][aria-selected=true]');
  await b.waitFor(visible('[data-side-tab="discussion"]'));
  await b.click('[data-side-tab="discussion"]');
  const frame = `document.querySelector(${quoted(imFrame)})`, doc = `${frame}?.contentDocument`, query = (selector: string) => `${doc}?.querySelector(${quoted(selector)})`;
  const imClick = async (selector: string) => {
    const node = query(selector);
    await b.waitFor(`${node}?.checkVisibility() && !${node}.disabled`);
    const point = await b.evaluate<{ x: number; y: number }>(`(() => { const frame = ${frame}.getBoundingClientRect(), box = ${node}.getBoundingClientRect();
      return { x: frame.left + box.left + box.width / 2, y: frame.top + box.top + box.height / 2 }; })()`);
    for (const type of ["mousePressed", "mouseReleased"]) await b.command("Input.dispatchMouseEvent", { type, button: "left", clickCount: 1, ...point }, b.sessionId);
  };
  const identity = query("[data-name-form]");
  await b.waitFor(`${identity}?.querySelector('input')`, 25_000);
  await b.evaluate(`(() => { const form = ${identity}; form.querySelector('input').value = 'Discussion tester'; form.requestSubmit(); })()`);
  const composer = '[data-composer="group"]';
  await imClick(composer + ' [data-im-add-object]');
  await b.waitFor(`${query('[data-dialog] input[type="search"]')}?.matches(':focus')`);
  await b.command("Input.insertText", { text: title }, b.sessionId);
  await b.waitFor(`${query('[data-im-object-choices] button')}?.textContent.includes(${quoted(title)})`);
  await imClick('[data-im-object-choices] button');
  assert.equal(await b.evaluate(`${query('#im-group-input')}.value`), "");
  assert.match(await b.evaluate<string>(`${query(composer + ' [data-im-draft-objects]')}.textContent`), new RegExp(title, "u"));
  await imClick(composer + ' [type="submit"]');
  const card = '[data-im-object-part="message"] [data-home-subject-id="' + goal.goal_id + '"]';
  await b.waitFor(`${query(card)}?.innerText.includes(${quoted(title)})`, 20_000);
  assert.equal(await b.evaluate(`${query(composer + ' [data-im-draft-objects]')}.textContent`), "");
  await b.evaluate(`${query(card)}.scrollIntoView({block:'center'})`);
  const message = await b.evaluate<string>(`${query(card)}.closest('[data-message]').dataset.message`);
  const quote = '[data-message="' + message + '"] [data-action="quote"]';
  const hover = await b.evaluate<{ x: number; y: number }>(`(() => { const outer = ${frame}.getBoundingClientRect(), row = ${query(card)}.closest('[data-message]').getBoundingClientRect();
    return { x: outer.left + row.x + row.width / 2, y: outer.top + row.y + row.height / 2 }; })()`);
  await b.command("Input.dispatchMouseEvent", { type: "mouseMoved", ...hover }, b.sessionId);
  await b.waitFor(`getComputedStyle(${query(quote)}.parentElement).pointerEvents !== 'none'`);
  await imClick(quote);
  await b.waitFor(`${query('#im-group-input')}?.matches(':focus') && !${query('[data-quote="group"]')}.hidden`);
  await b.command("Input.insertText", { text: "Discuss this reference" }, b.sessionId);
  await imClick(composer + ' [type="submit"]');
  await b.waitFor(`${query('[data-im-object-part="quote"] [data-home-subject-id="' + goal.goal_id + '"]')}?.innerText.includes(${quoted(title)})`, 15_000);
});

test("IUI-21: changing an actual owner's displayed values replaces the Home row and preserves its logical focus", { timeout: 70_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null);
  if (!b) return;
  const { projectId, store } = b;
  assert.ok(projectId);
  const feed = createLocalFeedApplication(store.db), sources = createLocalFeedSourceService(store.db, projectId);
  const source = sources.register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "home-focus" }).source;
  const items = ["First read change", "Second read change"].map((title, index) => feed.ingestItem({ source, externalId: "home-focus-" + index, title,
    summary: title, occurredAt: new Date().toISOString(), attention: false }).item);
  const prefix = "/projects/" + projectId;
  await b.setViewport(1440, 900);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + prefix + "/" }, b.sessionId));
  const item = (index: number) => '[data-home-card="io.molis.work.feed"] [data-home-subject-id="' + items[index]!.item_id + '"]';
  const title = (index: number) => item(index) + " .mw-presentation__row-title";
  const read = (index: number) => b.web.post(prefix + "/api/plugins/io.molis.work.feed/items/" + items[index]!.item_id + "/read", {});
  const dom = (selector: string) => `document.querySelector(${quoted(selector)})`;
  await b.waitFor(visible(title(0)));
  await b.evaluate(`window.__originalHomeRow = ${dom(item(0))}; ${dom(title(0))}.focus()`);
  assert.equal(await b.evaluate(`document.activeElement === ${dom(title(0))}`), true);
  await read(0);
  await b.waitFor(`${dom(item(0))} !== window.__originalHomeRow && ${dom(item(0))}?.checkVisibility()`, 15_000);
  assert.equal(await b.evaluate(`document.activeElement === ${dom(title(0))}`), true);
  await b.evaluate(`window.__originalHomeRow = ${dom(item(1))}; ${dom(title(1))}.focus(); ${dom(title(0))}.focus()`);
  await read(1);
  await b.waitFor(`${dom(item(1))} !== window.__originalHomeRow && ${dom(item(1))}?.checkVisibility()`, 15_000);
  assert.equal(await b.evaluate(`document.activeElement === ${dom(title(0))}`), true, "a late change cannot steal focus back from a different object");
});

test("IUI-03 SSC-14: an actual Assistant material is composed from its owner while text attachments stay in the round", { timeout: 90_000 }, async t => {
  const b = await sendBrowser(t);
  if (!b) return;
  const prefix = "/projects/" + b.projectId, title = "Goal shown across the conversation and tree";
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + prefix + "/" }, b.sessionId));
  const { goal } = await b.web.post<{ goal: { goal_id: string } }>(prefix + "/api/plugins/io.molis.work.goals/goals", { title, outcome: title, idempotency_key: randomUUID() });
  const object = { kind: "goal", id: goal.goal_id };
  const input = { text: "Read these materials", scope: { kind: "project", project_id: b.projectId }, request_id: randomUUID(), materials: [
    { material_id: "goal-ref", kind: "object", title: "A draft label", explicit: true, object },
    { material_id: "note-ref", kind: "text", title: "A separate source note", explicit: true, text: "Evidence about the current request." },
  ] };
  const sent = await b.web.post<AssistantSendResult>(prefix + "/api/assistant/send", input);
  const id = sent.work.work_id;
  const work = await waitWork(b, id, view => view.work.state === "completed");
  assert.deepEqual(work.rounds.flatMap(round => round.materials.flatMap(material => material.object ? [{ kind: material.object.kind, id: material.object.id }] : [])), [object]);
  const display = await b.web.post<SurfaceHomeDisplay>(prefix + "/api/assistant/works/" + id + "/surfaces", {});
  assert.ok(display.groups.some(group => group.items.some(item => item.subject.id === goal.goal_id && item.form === "chip")));
  const responses: number[] = [];
  t.after(b.on("Network.responseReceived", params => {
    const response = params.response as { url: string; status: number };
    if (response.url.endsWith("/api/assistant/works/" + id + "/surfaces")) responses.push(response.status);
  }));
  await b.command("Network.enable", {}, b.sessionId);
  await openWork(b, id);
  const chip = '[data-assistant-object-surface] [data-home-subject-id="' + goal.goal_id + '"] .mw-presentation--chip';
  try { await b.waitFor(visible(chip)); }
  catch (cause) {
    const state = await b.evaluate(`(() => {const root=document.querySelector('[data-assistant-object-surface]'),thread=document.querySelector('[data-assistant-thread]');
      return {root:root?.outerHTML.slice(0,500),parent:root?.parentElement?.className,hidden:root?.closest('[hidden]')?.className,thread:thread?.innerText.slice(-450),project:document.body.dataset.projectId};})()`);
    throw new Error("Conversation browser projection " + JSON.stringify({ responses, state }), { cause });
  }
  const painted = await b.evaluate<string>(`document.querySelector(${quoted(chip)}).innerText`);
  assert.match(painted, new RegExp(title, "u"));
  assert.doesNotMatch(painted, /A draft label/u);
  assert.ok(await b.evaluate(`[...document.querySelectorAll('.assistant-attachments')].some(node => node.innerText.includes("A separate source note"))`));
  assert.ok(await b.evaluate(`[...document.querySelectorAll('.assistant-attachments')].every(node => !node.innerText.includes("A draft label"))`));
  await b.click(chip + ' [data-presentation-action$=":open"]');
  await b.waitFor(`[...document.querySelectorAll('[data-tab-id]')].some(tab => tab.dataset.itemId === ${quoted(goal.goal_id)})`);
});
