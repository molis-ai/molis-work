import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import test, { type TestContext } from "node:test";
import { ActionError, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openWork, sendBrowser, waitWork } from "./fixtures/assistant-send-journey.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import type { AssistantSendResult } from "@molis-ai/molis-work-contracts/services/assistant";
import type { SurfaceHomeDisplay } from "@molis-ai/molis-work-design-system";

const imFrame = '[data-side-body="discussion"] iframe';
const visible = (selector: string) => '!!document.querySelector(' + JSON.stringify(selector) + ')?.checkVisibility()';
const quoted = (value: string) => JSON.stringify(value);

test("IUI-03 IUI-06 IUI-07 IUI-08 IUI-13: the original Inbox and 等你 display current owner objects and the trusted Inbox area saves one", { timeout: 90_000 },
  t => nativeInboxSurface(t, false));
test("S-surface-slots IUI-10: a native Inbox offer with a lost reply cannot execute again after reopening", { timeout: 90_000 },
  t => nativeInboxSurface(t, true));

async function nativeInboxSurface(t: TestContext, late: boolean) {
  let committed = 0;
  if (late) {
    const register = ActionService.prototype.registerProvider;
    t.mock.method(ActionService.prototype, "registerProvider", function (this: ActionService, registration: ActionProviderRegistration) {
      return register.call(this, { ...registration, handlers: registration.handlers.map(handler => handler.capability_id !== "feed.items.disposition" ? handler
        : { ...handler, async handle(caller, input) {
          await handler.handle(caller, input);
          committed++;
          throw new ActionError("actions.forbidden", "The actual operation committed but its reply was denied");
        } }) });
    });
  }
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
  if (!late) {
    const editing = area + " .surface-correction-menu summary", recovery = area + ' [data-presentation-action="surface-correction:restore"]';
    const key = async (key: string, code: number) => {
      await b.command("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: code, ...(key === "Enter" ? { text: "\r" } : {}) }, b.sessionId);
      await b.command("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: code }, b.sessionId);
    };
    await b.click(editing);
    await b.waitFor(visible(area + " .surface-correction-menu[open]"));
    await key("End", 35);
    await b.waitFor('document.activeElement.textContent.trim() === "从这里移走" && !document.activeElement.hasAttribute("aria-disabled")');
    await key("Enter", 13);
    await b.waitFor(`document.activeElement === document.querySelector(${quoted(recovery)}) && !document.activeElement.hasAttribute("aria-disabled")`);
    await key("Enter", 13);
    await b.waitFor(`document.activeElement === document.querySelector(${quoted(editing)}) && ${visible(area + ' .mw-presentation--card')}`);
  }
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
  const activations: string[] = [];
  await b.command("Network.enable", {}, b.sessionId);
  t.after(b.on("Network.requestWillBeSent", params => {
    const request = params.request as { url: string; postData?: string };
    if (request.url.endsWith("/api/contextual/surface-slot") && request.postData) {
      const body = JSON.parse(request.postData) as { intent: string };
      if (body.intent === "activate" || body.intent === "confirm") activations.push(body.intent);
    }
  }));
  const frames = () => b.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))");
  const blocked = async (reason: string, click: () => Promise<unknown>) => {
    const before = activations.length;
    await click(); await frames();
    assert.equal(activations.length, before, reason + " does not send an activation");
    assert.equal(stored().revision, material.revision, reason + " cannot write the original item");
  };
  if (late) {
    await choose("更多操作");
    await choose("保存为资料");
    await b.evaluate(`{
      const original = window.fetch.bind(window);
      let failNextRead = true;
      window.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        if (!url.pathname.endsWith("/api/contextual/surface-slot") || typeof init?.body !== "string" || JSON.parse(init.body).intent !== "read")
          return original(input, init);
        if (failNextRead) {
          failNextRead = false;
          document.documentElement.dataset.slotTestRead = "disconnected";
          throw new TypeError("Injected transport failure for the slot refresh");
        }
        const response = await original(input, init);
        document.documentElement.dataset.slotTestRead = String(response.status);
        return response;
      };
    }`);
    await b.click(area + ' [data-framed-control="confirm"]');
    const scrubbed = `document.querySelector(${quoted(area + ' [role="status"]')})?.textContent === "到原处核对执行结果"
      && !document.querySelector(${quoted(area + ' .mw-presentation, ' + area + ' [data-framed-control]')})`;
    await b.waitFor(`document.documentElement.dataset.slotTestRead === "disconnected" && ${scrubbed}`);
    assert.deepEqual([stored().disposition, stored().revision], ["saved", material.revision + 1]);
    assert.equal(committed, 1);
    const archived = feed.setDisposition(projectId, material.item_id, "archived", stored().revision);
    // Refresh the same trusted mount; prevent the child's independent Inbox list refresh from replacing this detail.
    await inbox.evaluate(`document.addEventListener("molis-work:select-item", event => {
      if (event.detail?.invalidate) event.stopPropagation();
    }, { capture: true, once: true })`);
    await b.evaluate(`document.querySelector(${quoted(area)}).dataset.failedRead = "true";
      document.querySelector('iframe[data-plugin-frame="inbox"]').parentElement.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { invalidate: true } }));`);
    await b.waitFor(`document.documentElement.dataset.slotTestRead === "200" && !document.querySelector(${quoted(area + '[data-failed-read]')}) && ${scrubbed}`);
    const restored = feed.restoreToFeed(projectId, material.item_id, archived.revision);
    await b.command("Network.setCookie", { name: "molis_work_locale", value: "en", url: b.origin }, b.sessionId);
    await b.command("Page.addScriptToEvaluateOnNewDocument", { source: `{
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const response = await original(input, init), url = new URL(input instanceof Request ? input.url : String(input), location.href);
        if (!response.ok || !url.pathname.endsWith("/api/contextual/surface-slot")) return response;
        const read = await response.clone().json();
        if (!read.render || !Array.isArray(read.controls)) return response;
        for (const control of read.controls) if (control.kind === "offers") control.label = "Renamed original offer group";
        return new Response(JSON.stringify(read), { status: response.status, headers: response.headers });
      };
    }` }, b.sessionId);
    await b.reloadPage();
    await b.click('[data-plugin-strip] [data-plugin-id="inbox"]');
    await inbox.click('[data-inbox-row][data-inbox-entry-id="' + entry.entry_id + '"]');
    await b.waitFor(`${visible(area + ' .mw-presentation--card')} && document.querySelector(${quoted(area)}).innerText.includes("Check the result at its source")`);
    assert.equal(await b.evaluate(`!!${action("Renamed original offer group")}`), false, "changed wording cannot change a pending command's identity");
    assert.equal(activations.filter(intent => intent === "confirm").length, 1);
    assert.equal(stored().revision, restored.revision);
    assert.equal(committed, 1);
    return;
  }
  await choose("更多操作");
  await b.waitFor(`!!${action("保存为资料")}`);
  assert.equal(await b.evaluate(`!!${action("加入 Inbox")}`), false);
  await show("保存为资料");
  await blocked("a scripted click", () => b.evaluate(`${action("保存为资料")}.click()`));
  assert.equal(await b.evaluate(`!!document.querySelector(${quoted(area + ' [data-framed-control="confirm"]')})`), false);

  await b.waitFor(`!document.querySelector(${quoted(area)}).parentElement.hasAttribute('data-unready')`);
  assert.equal(await b.evaluate(`(() => { const head = document.querySelector(${quoted(area + ' [data-framed-area-head]')}).getBoundingClientRect();
    const x = head.left + head.width / 2, y = head.top + head.height / 2, cover = document.createElement('div');
    cover.id = 'slot-test-cover'; cover.style.cssText = 'position:fixed;z-index:2147483647;width:12px;height:8px;left:' + (x - 6) + 'px;top:' + (y - 4) + 'px;';
    document.body.append(cover);
    const control = document.querySelector('[data-slot-test-control]'), box = control.getBoundingClientRect();
    return document.elementFromPoint(x, y) === cover && control.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)); })()`), true,
  "only the area's header is covered; the actual button can still receive a trusted press");
  await blocked("a trusted press with a covered header", () => b.click("[data-slot-test-control]"));
  await b.evaluate("document.getElementById('slot-test-cover').remove()");

  const held = await b.evaluate<{ x: number; y: number }>(`(() => { const box = document.querySelector('[data-slot-test-control]').getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; })()`);
  await blocked("a press whose render is replaced before release", async () => {
    await b.command("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...held }, b.sessionId);
    await b.evaluate("document.dispatchEvent(new CustomEvent('molis-work:plugins-changed'))");
    await b.waitFor(`!${action("保存为资料")} && !!${action("更多操作")}`);
    await b.command("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...held }, b.sessionId);
  });
  await choose("更多操作");
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
}

test("IUI-02 IUI-03 IUI-06 IUI-21 IUI-26: discussion picks and quotes a Goal and applies its form preference to both actual references, then opens a Pages object", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null);
  if (!b) return;
  const prefix = "/projects/" + b.projectId, title = "Searchable discussion object";
  await b.setViewport(1440, 900);
  await b.command("Network.setCookie", { name: "molis_work_locale", value: "zh", url: b.origin }, b.sessionId);
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
    await b.evaluate(`${node}.scrollIntoView({block:"nearest", inline:"nearest"})`);
    const point = await b.evaluate<{ x: number; y: number; covered: string | null }>(`(() => {
      const outer = ${frame}.getBoundingClientRect(), button = ${node}, box = button.getBoundingClientRect();
      const x = box.left + box.width / 2, y = box.top + box.height / 2, hit = ${doc}.elementFromPoint(x, y);
      return { x: outer.left + x, y: outer.top + y, covered: button.contains(hit) ? null : hit?.outerHTML.slice(0, 250) ?? "not visible" };
    })()`);
    assert.equal(point.covered, null, "the real discussion control must receive the pointer press: " + selector);
    for (const type of ["mousePressed", "mouseReleased"]) await b.command("Input.dispatchMouseEvent", { type, button: "left", clickCount: 1, x: point.x, y: point.y }, b.sessionId);
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
  const quotedObject = '[data-im-object-part="quote"] [data-home-subject-id="' + goal.goal_id + '"]';
  await b.waitFor(`${query(quotedObject)}?.innerText.includes(${quoted(title)})`, 15_000);
  const menu = quotedObject + " .mw-presentation__more summary", chip = quotedObject + " .mw-presentation--chip";
  const choose = async (label: string) => {
    await b.evaluate(`${query(menu)}.scrollIntoView({block: "center"})`);
    await imClick(menu);
    const options = quotedObject + ' [role="menuitem"]';
    await b.evaluate(`[...${doc}.querySelectorAll(${quoted(options)})].find(item => item.textContent.trim() === ${quoted(label)}).dataset.testPreference = ""`);
    await imClick("[data-test-preference]");
  };
  const quoteId = await b.evaluate<string>(`${query(quotedObject)}.closest('[data-message]').dataset.message`);
  const reveal = (id: string) => b.evaluate(`${query('[data-message="' + id + '"]')}.scrollIntoView({block: "center"})`);
  await choose("改成名字片");
  await b.waitFor(`!!${query(chip)}`);
  await reveal(message);
  await b.waitFor(`!!${query(card + " .mw-presentation--chip")}`);
  await reveal(quoteId);
  await b.waitFor(`!!${query(chip)}`);
  const decisions = new Map<string, { body: unknown; status?: number }>();
  await b.command("Network.enable", {}, b.sessionId);
  t.after(b.on("Network.requestWillBeSent", params => {
    const request = params.request as { url: string; postData?: string };
    if (/\/im\/api\/rooms\/[^/]+\/surfaces$/u.test(new URL(request.url).pathname) && request.postData)
      decisions.set(String(params.requestId), { body: JSON.parse(request.postData) });
  }));
  t.after(b.on("Network.responseReceived", params => {
    const request = decisions.get(String(params.requestId));
    if (request) request.status = (params.response as { status: number }).status;
  }));
  await choose("恢复默认显示");
  try { await b.waitFor(`!!${query(quotedObject + " .mw-presentation--card")}`, 4000); }
  catch (cause) {
    const state = await b.evaluate(`({ focus: ${doc}.activeElement?.outerHTML.slice(0, 200), row: ${query(quotedObject)}?.innerText, toast: document.querySelector('[data-toast]').textContent })`);
    throw new Error(JSON.stringify({ decisions: [...decisions.values()], state }), { cause });
  }
  await reveal(message);
  await b.waitFor(`!!${query(card + " .mw-presentation--card")}`);
  await reveal(quoteId);
  await choose("固定到前面");
  const reason = quotedObject + ' > .mw-presentation';
  await b.waitFor(`!!${query(reason)} && ${query(quotedObject)}.parentElement.querySelector("[data-surface-correction-reason]")?.textContent.includes("沿用你为这个位置保存的显示设置")`);

  const pageTitle = "Live Pages reference for the browser", pageBody = "Private body appears only in the original editor";
  const { document } = await b.web.post<{ document: { id: string } }>(prefix + "/api/plugins/io.molis.work.pages/pages",
    { title: pageTitle, markdown: pageBody });
  await imClick(composer + ' [data-im-add-object]');
  await b.waitFor(`${query('[data-dialog] input[type="search"]')}?.matches(':focus')`);
  await b.command("Input.insertText", { text: pageTitle }, b.sessionId);
  await b.waitFor(`${query('[data-im-object-choices] button')}?.textContent.includes(${quoted(pageTitle)})`);
  await imClick('[data-im-object-choices] button');
  await imClick(composer + ' [type="submit"]');
  const pageChip = '[data-im-object-part="message"] [data-home-subject-id="' + document.id + '"]';
  await b.waitFor(`${query(pageChip)}?.innerText.includes(${quoted(pageTitle)})`, 15_000);
  assert.doesNotMatch(await b.evaluate<string>(`${query(pageChip)}.innerText`), new RegExp(pageBody, "u"));
  assert.equal(await b.evaluate(`${query(pageChip)}.querySelectorAll("[data-presentation-action]").length`), 1);
  await imClick(pageChip + ' [data-presentation-action$=":open"]');
  await b.waitFor(`[...document.querySelectorAll('[data-tab-id]')].some(tab => tab.dataset.itemId === ${quoted(document.id)})`);
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
  const saved = await b.web.post<{ work: { draft: string } }>(prefix + "/api/assistant/works/" + id + "/draft", { draft: "A draft stays on the original work" });
  assert.equal(saved.work.draft, "A draft stays on the original work");
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

test("IUI-07 IUI-08: the original offers execute Inbox done and dismiss with the owner revision and receipt", { timeout: 75_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null);
  if (!b) return;
  const { projectId, store } = b;
  assert.ok(projectId);
  const feed = createLocalFeedApplication(store.db), sources = createLocalFeedSourceService(store.db, projectId);
  const source = sources.register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "inbox-owner-offer" }).source;
  const outcomes = [{ status: "done", label: "做完了" }, { status: "dismissed", label: "忽略" }] as const;
  const cases = outcomes.map(({ status, label }) => {
    const { item } = feed.ingestItem({ source, externalId: status, title: "Inbox original offer " + status,
      summary: "This is the original owner's item", occurredAt: new Date().toISOString(), attention: false });
    return { status, label, entry: feed.ensureInboxEntryForFeedItem(projectId, item.item_id, "manual").entry };
  });
  const prefix = "/projects/" + projectId, path = prefix + "/api/home/actions/";
  const inbox = await pluginFrameBrowser(t, b, "inbox");
  await b.setViewport(1440, 900);
  await b.command("Network.setCookie", { name: "molis_work_locale", value: "zh", url: b.origin }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + prefix + "/" }, b.sessionId));
  await b.waitFor('typeof molisWorkRequest === "function"');
  const post = <Result>(operation: "prepare" | "execute", body: unknown) =>
    b.evaluate<Result>(`molisWorkRequest(${quoted(path + operation)}, { method: "POST", body: ${JSON.stringify(body)} })`);
  for (const { status, label, entry } of cases) {
    const subject = { kind: "inbox_entry", id: entry.entry_id }, request_id = randomUUID();
    const prepared = await post<{ offers: { title: string; availability: { available: boolean }; input: unknown }[] }>("prepare", { subject, request_id });
    const selected = prepared.offers.find(offer => offer.title === label);
    assert.ok(selected?.availability.available);
    const { availability: _availability, ...offer } = selected;
    assert.deepEqual(offer.input, { entry_id: entry.entry_id, status, expected_revision: entry.revision });
    assert.equal(feed.getInboxEntry(projectId, entry.entry_id).revision, entry.revision, "preparing the original offer does not write");
    const answer = await post<{ title: string; result: { entry: { status: string; revision: number } } }>("execute", { subject, request_id, offer });
    assert.equal(answer.title, label);
    assert.deepEqual([answer.result.entry.status, answer.result.entry.revision], [status, entry.revision + 1]);
    assert.deepEqual([feed.getInboxEntry(projectId, entry.entry_id).status, feed.getInboxEntry(projectId, entry.entry_id).revision], [status, entry.revision + 1]);
  }
  await b.click('[data-plugin-strip] [data-plugin-id="inbox"]');
  for (const { status, entry } of cases) {
    await inbox.waitFor(`document.querySelector(${quoted('[data-inbox-row][data-inbox-entry-id="' + entry.entry_id + '"][data-inbox-status="' + status + '"]')})?.dataset.inboxEntryRevision === "${entry.revision + 1}"`);
  }
});

test("IUI-06 IUI-21 IUI-26: the real attention popover, correction menu and quick look at twelve settings", { timeout: 180_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null);
  if (!b) return;
  const { projectId, store } = b;
  assert.ok(projectId);
  const feed = createLocalFeedApplication(store.db), sources = createLocalFeedSourceService(store.db, projectId);
  const source = sources.register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "attention-matrix" }).source;
  const title = "A long source title for the original attention item · " + "Owner values remain readable at narrow widths. ".repeat(3);
  const { item } = feed.ingestItem({ source, externalId: "attention-matrix", title, summary: "Read this at its source",
    occurredAt: new Date().toISOString(), attention: false });
  feed.ensureInboxEntryForFeedItem(projectId, item.item_id, "manual");
  const panel = "[data-assistant-notices]", button = "[data-assistant-attention]";
  const itemSelector = panel + ' [data-home-subject-id="' + item.item_id + '"]', row = itemSelector + " .mw-presentation__row-title";
  const peek = "dialog:has([data-position-peek])", close = peek + ' [data-home-control="close"]';
  const dom = (selector: string) => `document.querySelector(${quoted(selector)})`;
  const key = async (name: string, code: number) => {
    await b.command("Input.dispatchKeyEvent", { type: "keyDown", key: name, code: name, windowsVirtualKeyCode: code, ...(name === "Enter" ? { text: "\r" } : {}) }, b.sessionId);
    await b.command("Input.dispatchKeyEvent", { type: "keyUp", key: name, code: name, windowsVirtualKeyCode: code }, b.sessionId);
  };
  const shots = reviewEvidenceUrl("surface-cross-consumers/");
  await mkdir(shots, { recursive: true });
  for (const width of [1440, 1024, 390]) for (const lang of ["zh", "en"]) for (const theme of ["light", "dark"]) {
    const setting = `${width}/${lang}/${theme}`;
    await b.setViewport(width, 900, width === 390);
    await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, b.sessionId);
    await b.command("Network.setCookie", { name: "molis_work_locale", value: lang, url: b.origin }, b.sessionId);
    await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/projects/" + projectId + "/" }, b.sessionId));
    await b.waitFor(visible(button), 15_000);
    await b.click(button);
    await b.waitFor(visible(row), 12_000);
    const shown = await b.evaluate<{ title: string; heading: string; status: string; overflow: boolean; theme: string }>(`(() => {
      const panel = ${dom(panel)}, row = ${dom(row)};
      return { title: row.textContent.trim(), heading: panel.querySelector('.assistant-popover-title').textContent,
        status: ${dom(itemSelector)}.querySelector('.mw-status')?.textContent || '',
        overflow: panel.scrollWidth > panel.clientWidth + 1, theme: document.documentElement.dataset.resolvedTheme }; })()`);
    assert.equal(shown.title, title.trim(), setting);
    assert.equal(shown.heading, lang === "zh" ? "等你处理" : "Waiting for you", setting);
    assert.match(shown.status, lang === "zh" ? /未读/u : /Unread/u, setting);
    assert.equal(shown.theme, theme, setting);
    assert.equal(shown.overflow, false, setting);
    if (width === 1440 && lang === "zh" && theme === "light") {
      await b.waitFor(`document.activeElement === ${dom(row)}`);
      await key("Enter", 13);
      await b.waitFor(`${dom(peek)}?.open && document.activeElement === ${dom(close)}`);
      await key("Tab", 9);
      assert.equal(await b.evaluate(`document.activeElement.closest(${quoted(peek)})?.open`), true);
      await key("Escape", 27);
      await b.waitFor(`!${dom(peek)}?.open && document.activeElement === ${dom(row)}`);
    }
    if (width === 1440 && lang === "zh" && theme === "light" || width === 390 && lang === "en" && theme === "dark") {
      if (width === 390) {
        await b.click(row); await b.waitFor(`${dom(peek)}?.open`);
        assert.equal(await b.evaluate(`Math.abs(${dom(peek)}.getBoundingClientRect().bottom - innerHeight) < 1`), true, "phone quick look opens as a bottom sheet");
      }
      const shot = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, b.sessionId);
      await writeFile(new URL(`attention-${width}-${lang}-${theme}.png`, shots), Buffer.from(shot.data, "base64"));
      if (width === 390) await b.click(close);
    }
    const menu = itemSelector + " .mw-presentation__more summary", opened = itemSelector + " .mw-presentation__more[open]";
    await b.click(menu);
    await b.waitFor(visible(opened));
    const label = lang === "zh" ? "从这里移走" : "Remove from here";
    const options = await b.evaluate<string[]>(`[...${dom(opened)}.querySelectorAll('[role="menuitem"]')].map(item => item.textContent.trim())`);
    assert.ok(options.includes(label), setting + " shows the original remove control in the chosen language");
    assert.ok(options.every(word => !/固定|改成|Pin|Show as/u.test(word)), setting);
    assert.equal(await b.evaluate(`(() => { const box = ${dom(opened)}.querySelector('[role="menu"]').getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth + 1; })()`), true, setting + " menu fits");
    if (width === 1440 && lang === "zh" && theme === "light" || width === 390 && lang === "en" && theme === "dark") {
      const shot = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, b.sessionId);
      await writeFile(new URL(`iui06-menu-${width}-${lang}-${theme}.png`, shots), Buffer.from(shot.data, "base64"));
    }
    await b.evaluate(`[...${dom(opened)}.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.trim() === ${quoted(label)}).dataset.testMatrixRemove = ""`);
    await b.click("[data-test-matrix-remove]");
    const restore = panel + ' [data-presentation-action="surface-correction:restore"]';
    await b.waitFor(`${visible(restore)} && !${dom(itemSelector)}`);
    assert.equal(await b.evaluate(`${dom(panel)}.textContent.includes(${quoted(title.trim())})`), false, setting + " restoration does not expose a hidden title");
    assert.match(await b.evaluate<string>(`${dom(restore)}.textContent`), lang === "zh" ? /恢复默认显示/u : /Restore default display/u, setting);
    await b.click(restore);
    await b.waitFor(visible(row));
  }
});

test("IUI-07 IUI-08 IUI-10: an Attention peek clears old content on close and a successful empty refresh, and confirms at its own endpoint", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null);
  if (!b) return;
  const { projectId, store } = b;
  assert.ok(projectId);
  const prefix = "/projects/" + projectId, feed = createLocalFeedApplication(store.db), sources = createLocalFeedSourceService(store.db, projectId);
  const source = sources.register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "protected-peek" }).source;
  const samples = ["Filter a live original after refresh", "Actually confirm an original offer"].map((title, index) => {
    const { item } = feed.ingestItem({ source, externalId: "peek-" + index, title, summary: "Only the current owner projection",
      occurredAt: new Date().toISOString(), attention: false });
    return { item, entry: feed.ensureInboxEntryForFeedItem(projectId, item.item_id, "manual").entry };
  });
  const attention = "[data-assistant-attention]", panel = "[data-assistant-notices]";
  const dialog = "dialog:has([data-position-peek])", close = dialog + ' [data-home-control="close"]';
  const q = (selector: string) => `document.querySelector(${quoted(selector)})`;
  const scrubbed = `!${q(dialog)}?.open && ${q("[data-position-peek]")}.childElementCount === 0 && ${q("[data-position-offers]")}.childElementCount === 0`;
  const endpoint = prefix + "/api/host/surface-attention", requests = new Map<string, { endpoint: string; mode?: string; status: number }>();
  const errors: string[] = [];
  await b.setViewport(1440, 900);
  await b.command("Network.setCookie", { name: "molis_work_locale", value: "zh", url: b.origin }, b.sessionId);
  await b.command("Network.enable", {}, b.sessionId);
  await b.command("Runtime.enable", {}, b.sessionId);
  t.after(b.on("Runtime.exceptionThrown", params => {
    const detail = params.exceptionDetails as { text?: string; exception?: { description?: string } };
    errors.push(detail.exception?.description?.slice(0, 450) ?? detail.text ?? "uncaught exception");
  }));
  t.after(b.on("Network.requestWillBeSent", params => {
    const request = params.request as { url: string; postData?: string };
    const path = new URL(request.url).pathname;
    if (path !== endpoint && !path.includes("/api/home/actions/")) return;
    const body = request.postData ? JSON.parse(request.postData) : undefined;
    requests.set(String(params.requestId), { endpoint: path, mode: body?.offer?.intent ?? (body?.click ? "peek" : "read"), status: 0 });
  }));
  t.after(b.on("Network.responseReceived", params => {
    const found = requests.get(String(params.requestId));
    if (found) found.status = (params.response as { status: number }).status;
  }));
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + prefix + "/" }, b.sessionId));
  const itemSelector = (id: string) => panel + ' [data-home-subject-id="' + id + '"]';
  const peek = async (index: number) => {
    if (!await b.evaluate(visible(panel))) await b.click(attention);
    const { item } = samples[index]!;
    const row = itemSelector(item.item_id) + " .mw-presentation__row-title";
    await b.waitFor(visible(row)); await b.click(row);
    await b.waitFor(`${q(dialog)}?.open && ${q("[data-position-peek]")}?.textContent.includes(${quoted(item.title)})
      && !!${q("[data-position-offer]")}`);
  };
  await peek(0);
  await b.click(close);
  await b.waitFor(scrubbed);
  await peek(0);
  const beforeRefresh = requests.size, gone = samples[0]!.item;
  feed.setDisposition(projectId, gone.item_id, "saved", gone.revision);
  const immediately = await b.evaluate(`(() => { document.dispatchEvent(new CustomEvent("molis-work:plugins-changed"));
    return [${q("[data-position-peek]")}.childElementCount, ${q("[data-position-offers]")}.childElementCount]; })()`);
  assert.deepEqual(immediately, [0, 0], "the in-flight list refresh already removed old details and actions");
  await b.waitFor(`${scrubbed} && !${q(itemSelector(gone.item_id))}`);
  assert.ok([...requests.values()].slice(beforeRefresh).some(item => item.endpoint === endpoint && item.mode === "read" && item.status === 200),
    "the source response succeeded with the former object filtered out");

  await peek(1);
  const choose = `[...document.querySelectorAll("[data-position-offer]")].find(button => button.textContent.trim() === "保存为资料")`;
  await b.evaluate(`${choose}.setAttribute('data-tested-position-save', '')`);
  await b.click("[data-tested-position-save]");
  const { item, entry } = samples[1]!;
  assert.equal(feed.getFeedItem(projectId, item.item_id).revision, item.revision);
  const confirm = dialog + ' [data-position-offer="confirm"]';
  try { await b.waitFor(visible(confirm), 3_000); }
  catch (cause) {
    const state = await b.evaluate(`({ open: ${q(dialog)}?.open, panel: ${q(panel)}?.hidden,
      choices: ${q("[data-position-offers]")}?.innerText, active: document.activeElement?.outerHTML.slice(0, 220) })`);
    throw new Error(JSON.stringify({ state, errors, requests: [...requests.values()].slice(-15) }), { cause });
  }
  await b.click(confirm);
  await b.waitFor(`document.querySelector('[data-toast]').textContent.includes('已完成') && ${scrubbed} && !${q(itemSelector(item.item_id))}`);
  assert.equal(feed.getFeedItem(projectId, item.item_id).revision, item.revision + 1);
  assert.deepEqual([feed.getInboxEntry(projectId, entry.entry_id).status, feed.getInboxEntry(projectId, entry.entry_id).revision], ["done", entry.revision + 1]);
  assert.ok([...requests.values()].every(item => item.endpoint === endpoint));
  assert.equal([...requests.values()].filter(item => item.mode === "confirm" && item.status === 200).length, 1);
});

test("IUI-06: the original Attention more menu explains, removes and restores a known readable object", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null);
  if (!b) return;
  const { projectId, store } = b;
  assert.ok(projectId);
  const feed = createLocalFeedApplication(store.db), sources = createLocalFeedSourceService(store.db, projectId);
  const source = sources.register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "attention-corrections" }).source;
  const title = "Return to the original attention object";
  const { item } = feed.ingestItem({ source, externalId: "attention-corrections", title, summary: "Still available in Feed",
    occurredAt: new Date().toISOString(), attention: false });
  const original = feed.ensureInboxEntryForFeedItem(projectId, item.item_id, "manual").entry;
  const panel = "[data-assistant-notices]", bell = "[data-assistant-attention]", endpoint = "/projects/" + projectId + "/api/host/surface-attention";
  const row = panel + ' [data-home-subject-id="' + item.item_id + '"]', menu = row + " .mw-presentation__more summary";
  const reason = panel + " [data-surface-correction-reason]", recovery = panel + ' [data-presentation-action="surface-correction:restore"]';
  const defaults = panel + " .surface-correction-default summary", reset = panel + ' [data-presentation-action="surface-correction:restore-position"]';
  const confirm = 'dialog[open] [data-position-reset="confirm"]', cancel = 'dialog[open] [data-position-reset="cancel"]';
  const q = (selector: string) => `document.querySelector(${quoted(selector)})`;
  const focus = (selector: string) => `${q(selector)} && document.activeElement === ${q(selector)}`;
  const press = async (key: string, code: number) => {
    await b.command("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: code, ...(key === "Enter" ? { text: "\r" } : {}) }, b.sessionId);
    await b.command("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: code }, b.sessionId);
  };
  const read = () => b.evaluate<SurfaceHomeDisplay>(`molisWorkRequest(${quoted(endpoint)}, { method: "POST", body: {} })`);
  await b.setViewport(1440, 900);
  await b.command("Network.setCookie", { name: "molis_work_locale", value: "zh", url: b.origin }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/projects/" + projectId + "/" }, b.sessionId));
  await b.waitFor(visible(bell));
  await b.click(bell); await b.waitFor(visible(menu));
  assert.match(await b.evaluate<string>(`${q(reason)}.textContent`), /等你处理/u);
  assert.ok(await b.evaluate(`!!${q(reason + " p")}?.textContent.trim()`), "the actual composition supplies its reason");
  const revision = (await read()).corrections_revision;
  await b.click(menu); await press("End", 35);
  const active = await b.evaluate<{ text: string; options: string[] }>(`({ text: document.activeElement.textContent.trim(),
    options: [...document.querySelectorAll(${quoted(row + ' [role="menuitem"]')})].map(button => button.textContent.trim()) })`);
  assert.equal(active.text, "从这里移走");
  assert.ok(active.options.includes("从这里移走"));
  assert.ok(active.options.every(label => !/固定|改成/u.test(label)), "Attention does not claim to support those preferences");
  await press("Escape", 27); await b.waitFor(focus(menu));
  await b.click(menu); await press("End", 35); await press("Enter", 13);
  try { await b.waitFor(`${focus(recovery)} && !${q(row)}`, 4000); }
  catch (cause) {
    const after = await read(), state = await b.evaluate(`({ open: ${q(panel)}?.hidden === false,
      recovery: ${q(recovery)}?.outerHTML, focus: document.activeElement?.outerHTML.slice(0, 200), toast: ${q("[data-toast]")}?.textContent })`);
    throw new Error(JSON.stringify({ before: revision, after: after.corrections_revision, state }), { cause });
  }
  assert.doesNotMatch(await b.evaluate<string>(`${q(panel)}.textContent`), new RegExp(title, "u"));
  const removed = (await read()).corrections_revision;
  assert.notEqual(removed, revision);
  assert.deepEqual([feed.getInboxEntry(projectId, original.entry_id).status, feed.getInboxEntry(projectId, original.entry_id).revision], ["open", original.revision]);
  await b.click(defaults); await b.click(reset); await b.waitFor(visible(confirm));
  await b.click(cancel);
  assert.equal((await read()).corrections_revision, removed, "cancelling the position restore does not write");
  await b.click(recovery);
  await b.waitFor(`${visible(row)} && !${q(recovery)}`);
  const restored = (await read()).corrections_revision;
  assert.notEqual(restored, removed);
  await b.click(defaults); await b.click(reset); await b.click(confirm);
  await b.waitFor(`${focus(defaults)} && !${q(confirm)}`);
  assert.notEqual((await read()).corrections_revision, restored);
  assert.equal(feed.getFeedItem(projectId, item.item_id).revision, item.revision);
});
