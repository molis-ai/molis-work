// SECURITY-INVARIANTS S-plugin-connection-card, the shell's half (specs/assistant-service-connections/spec.md §13.5, C3): the connection
// card a plugin page asks for is drawn by the workbench outside the page's frame, and writes only on the person's own, deliberate press.
// What the page can do to it (send made-up messages, move it, half show it, press for the person, go away) writes nothing; what it hears
// is a height, that the card shows, and in the end only connected with a display name, or cancelled. Every refusal asserts that no write
// went to the Host. The Host route's own refusals are tests/security-invariants-connection-card.test.ts.
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { LocalHostHttpClient } from "@molis-ai/molis-work-test-kit/local-host-http";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";

const CARD = "[data-connection-need-area]", WIDE = 344, LINE = 48;
const WRITES = ["prepare", "bind", "switch", "enable", "save_key"];

/**
 * What each document sends, recorded as it goes: the outer one's messages down to the frame and its requests to the card's routes.
 * The lines go before the plugin-frame client, which both the outer document and the frame load.
 */
const OBSERVE = `(() => {
  window.cnDown = []; window.cnSent = [];
  const post = MessagePort.prototype.postMessage;
  MessagePort.prototype.postMessage = function (message, ...rest) {
    window.cnPort = this;
    if (message && typeof message.type === "string" && message.type.startsWith("connection-need-")) window.cnDown.push(JSON.parse(JSON.stringify(message)));
    return post.call(this, message, ...rest);
  };
  const fetch = window.fetch;
  window.fetch = function (input, init) {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/api/host/plugin-page-connection") || url.includes("/api/settings/connectors/") || url.includes("/sources/") && url.endsWith("/sync")) {
      let body = null; try { body = JSON.parse(init.body); } catch { body = null; }
      window.cnSent.push({ url, method: (init && init.method) || "GET", body });
    }
    return fetch.apply(this, arguments);
  };
})();`;

type Sent = { url: string; method: string; body: { operation?: string; connection_id?: string } | null };

async function open(t: TestContext) {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return null;
  await browser.setViewport(1440, 960);
  const { projectId, homeDirectory } = browser;
  const client = new LocalHostHttpClient({ origin: browser.origin, controlToken: browser.controlToken });
  await client.post(`/api/settings/projects/${projectId}/plugins`, { plugin_id: "feed" });
  const api = `/projects/${projectId}/api/plugins/io.molis.work.feed`;
  const source = (await client.post<{ source: { source_id: string } }>(api + "/sources/accounts", { service: "github", name: "Card source" })).source.source_id;
  await pluginFrameInitScript(t, browser, `window.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,value){target[key]=key==='feed'?host=>{window.pageHost=host;return value(host)}:value;return true}});${OBSERVE}`);
  const child = await pluginFrameBrowser(t, browser, "feed");
  await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + `/projects/${projectId}/?openPlugin=feed` }, browser.sessionId));
  await child.waitFor("window.pageHost");
  const target = { kind: "slot", slot_id: "github", record_key: source };
  const account = (name: string) => withConnectorConnections(homeDirectory, store => store.createToken({ serviceId: "github", displayName: name, token: "fixture-value-" + name }));
  const bound = async (record = source) => (await client.get<{ connection: { connection_id: string } | null }>("/api/settings/connectors/plugin-slots/record?"
    + new URLSearchParams({ project: projectId!, plugin_id: "io.molis.work.feed", slot_id: "github", record_key: record }))).connection;
  /** An empty element in the plugin's document at a fixed place, and the card asked for on it. */
  const ask = async (id: string, style: string, asked: unknown = target) => {
    await child.evaluate(`(() => {
      const element = document.getElementById(${JSON.stringify(id)}) ?? document.body.appendChild(Object.assign(document.createElement("div"), { id: ${JSON.stringify(id)} }));
      element.style.cssText = ${JSON.stringify("position:fixed;z-index:2147483647;" + style)};
      window.cnAnswers ??= {};
      window.cnAnswers[${JSON.stringify(id)}] = pageHost.connectionNeed(element, ${JSON.stringify(asked)})
        .then(outcome => outcome.status === "connected" ? "connected: " + outcome.account.label : outcome.status, error => "refused: " + error.message);
    })()`);
  };
  const answer = (id: string) => child.evaluate<string>(`window.cnAnswers[${JSON.stringify(id)}]`);
  const sent = () => browser.evaluate<Sent[]>("window.cnSent");
  const writes = async () => (await sent()).filter(item => WRITES.includes(item.body?.operation ?? "") || item.method !== "GET" && item.url.includes("/api/settings/connectors/"));
  const down = () => browser.evaluate<Array<Record<string, unknown>>>("window.cnDown");
  const stage = () => browser.evaluate<string>(`document.querySelector(${JSON.stringify(CARD)})?.dataset.stage ?? ""`);
  const note = () => browser.evaluate<string>(`document.querySelector(${JSON.stringify(CARD + " .connection-need-area__note")})?.textContent ?? ""`);
  const centre = (selector: string) => browser.evaluate<{ x: number; y: number }>(`(() => { const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; })()`);
  /** A real press of the mouse, as the browser delivers a person's: trusted. */
  const press = async (selector: string, at?: { x: number; y: number }) => {
    const point = at ?? await centre(selector);
    await browser.command("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 }, browser.sessionId);
    await browser.command("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 }, browser.sessionId);
  };
  const space = async () => {
    await browser.command("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " }, browser.sessionId);
    await browser.command("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 }, browser.sessionId);
  };
  const settle = (ms = 650) => new Promise(resolve => setTimeout(resolve, ms));
  /** As a person waits: the card has held still for the steady time and shows ready. */
  const ready = async () => { await settle(); await browser.waitFor(`document.querySelector(${JSON.stringify(CARD)}) && !document.querySelector(${JSON.stringify(CARD)}).hasAttribute("data-unready")`); };
  const control = (name: string) => `${CARD} [data-framed-control="${name}"]`;
  const shown = (name: string) => browser.waitFor(`document.querySelector(${JSON.stringify(control(name))})`);
  return { browser, child, client, source, target, account, bound, ask, answer, sent, writes, down, stage, note, centre, press, space, settle, ready, control, shown };
}

test("S-plugin-connection-card ASC-68 C3-2 C3-5 C3-10 ASC-65 ASC-66 made-up messages draw nothing, the card's height is the width's alone, and the person's own choice writes once", { timeout: 150_000 }, async t => {
  const p = await open(t); if (!p) return;
  const { browser, child } = p;

  // C3-2: made-up opens from the frame: a target with a name more, a message with a field more, another kind, a bad id.
  await child.evaluate(`(() => { const port = window.cnPort;
    port.postMessage({ type: "connection-need-open", id: 90, target: { ...${JSON.stringify(p.target)}, base_url: "https://example.test" } });
    port.postMessage({ type: "connection-need-open", id: 91, target: ${JSON.stringify(p.target)}, installation_id: "other" });
    port.postMessage({ type: "connection-need-open", id: 92, target: { kind: "account", slot_id: "github" } });
    port.postMessage({ type: "connection-need-open", id: -1, target: ${JSON.stringify(p.target)} });
    port.postMessage({ type: "connection-need-open", id: 0.5, target: ${JSON.stringify(p.target)} });
  })()`);
  await browser.waitFor(`window.cnDown.filter(message => message.type === "connection-need-done").length >= 3`);
  await p.settle(300);
  const refusals = (await p.down()).filter(message => message.type === "connection-need-done");
  assert.deepEqual(refusals.map(message => [message.id, message.error]).sort(), [[90, "Unavailable"], [91, "Unavailable"], [92, "Unavailable"]], "C3-2 every made-up open gets the one fixed answer");
  assert.deepEqual(await p.sent(), [], "C3-2 a made-up open reaches no route");
  assert.equal(await browser.evaluate(`document.querySelectorAll(${JSON.stringify(CARD)}).length`), 0, "C3-2 no card is drawn");

  // C3-5: the same width is told the same height with no account, one, or five to choose from.
  const heights: number[] = [];
  let made = 0;
  for (const count of [0, 1, 5]) {
    for (; made < count; made++) p.account("Account " + made);
    await browser.evaluate("window.cnDown = []");
    await p.ask("card", "left:24px;top:24px;width:560px");
    await p.shown("cancel");
    await browser.waitFor(`window.cnDown.some(message => message.type === "connection-need-size")`);
    heights.push(...(await p.down()).filter(message => message.type === "connection-need-size").map(message => Number(message.height)));
    assert.equal(await p.stage(), count ? "choose" : "ask", `with ${count} accounts the card starts where it should`);
    assert.equal(await child.evaluate("document.getElementById('card').getBoundingClientRect().height"), WIDE, "the page's element is as tall as the step for its width");
    if (count < 5) { await child.evaluate("document.getElementById('card').remove()"); await browser.waitFor(`!document.querySelector(${JSON.stringify(CARD)})`); }
  }
  assert.deepEqual([...new Set(heights)], [WIDE], "C3-5 the height depends on the width alone");
  const accounts = await browser.evaluate<string[]>(`[...document.querySelectorAll(${JSON.stringify(CARD + " [data-framed-control^='use:']")})].map(button => button.textContent)`);
  assert.equal(accounts.length, 5, "the five accounts are offered");

  // C3-10: a script in the outer document clicks an account outright: nothing it dispatches is trusted, nothing is written.
  await p.ready();
  const first = await browser.evaluate<string>(`document.querySelector(${JSON.stringify(CARD + " [data-framed-control^='use:']")}).dataset.framedControl`);
  await browser.evaluate(`document.querySelector(${JSON.stringify(p.control(first))}).click()`);
  await p.settle(250);
  assert.deepEqual(await p.writes(), [], "an untrusted click writes nothing");
  // The person's own press, three times at once: one bind, the page hears connected with the display name only.
  const point = await p.centre(p.control(first));
  await Promise.all([p.press("", point), p.press("", point), p.press("", point)]);
  assert.match(await p.answer("card"), /^connected: /u);
  const binds = await p.writes();
  assert.equal(binds.length, 1, "C3-10 one write for the person's presses: " + JSON.stringify(binds));
  assert.equal(binds[0]!.body?.operation, "bind");
  assert.equal((await p.bound())?.connection_id, first.slice(4), "the chosen account is on the source");
  await browser.waitFor(`document.querySelector(${JSON.stringify(CARD)})?.dataset.stage === "line"`);
  assert.equal(await child.evaluate("document.getElementById('card').getBoundingClientRect().height"), LINE, "ASC-66 the card folds into one line");

  // C3-5: what the frame heard: heights, that the card shows, and one answer; no account id, label of another account, or key.
  const heard = await p.down();
  for (const message of heard) {
    assert.ok(["connection-need-size", "connection-need-shown", "connection-need-done", "connection-need-reveal"].includes(String(message.type)), JSON.stringify(message));
    if (message.type === "connection-need-done" && message.outcome) assert.deepEqual(Object.keys(message.outcome as object).sort(), ["account", "status"]);
  }
  const text = JSON.stringify(heard);
  assert.equal(/fixture-value|connection_id|auth_method|state/u.test(text), false, "nothing names a connection, its state or a key: " + text);
  assert.equal(accounts.filter(label => text.includes(label!)).length <= 1, true, "only the chosen account's name reaches the frame");
});

test("S-plugin-connection-card ASC-68 C3-4 C3-8 C3-9 ASC-67 a press counts only on a card that held still and shows whole; cancelling and leaving write nothing", { timeout: 150_000 }, async t => {
  const p = await open(t); if (!p) return;
  const { browser, child } = p;
  p.account("Only account");
  await p.ask("card", "left:24px;top:24px;width:560px");
  await p.shown("cancel");
  const use = await browser.evaluate<string>(`document.querySelector(${JSON.stringify(CARD + " [data-framed-control^='use:']")}).dataset.framedControl`);

  // C3-4: pressed as soon as it is shown.
  await p.press(p.control(use));
  await p.settle(250);
  assert.deepEqual(await p.writes(), [], "C3-4 a card just shown does not act");
  // C3-4: the page moves its element 100 ms before the press.
  await p.ready();
  await child.evaluate(`document.getElementById("card").style.left = "64px"`);
  await p.settle(100);
  await p.press(p.control(use));
  await p.settle(250);
  assert.deepEqual(await p.writes(), [], "C3-4 a press on a moved card does not write");
  assert.equal(await p.note(), "刚移动过，请再点一次");
  // C3-4: the focus arrives on the account (as by Tab) and Space follows within 100 ms.
  await p.ready();
  // Focus the account afresh (the earlier press left it focused), as Tab arriving on it would.
  await browser.evaluate(`(() => { document.activeElement?.blur(); document.querySelector(${JSON.stringify(p.control(use))}).focus(); })()`);
  await p.settle(60);
  await p.space();
  await p.settle(250);
  assert.deepEqual(await p.writes(), [], "C3-4 a key press right after the focus arrived does not write");
  await browser.evaluate("document.activeElement.blur()");
  // C3-4: the page puts the card's header outside its frame: the account shows, the card does not show whole.
  await child.evaluate(`document.getElementById("card").style.top = "-120px"`);
  await p.ready();
  const visible = await browser.evaluate<{ x: number; y: number } | null>(`(() => { const frame = document.querySelector("iframe[data-plugin-frame=feed]").getBoundingClientRect();
    const control = document.querySelector(${JSON.stringify(p.control(use))}), box = control.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
    return y > frame.top + 4 && y < frame.bottom - 4 && control.contains(document.elementFromPoint(x, y)) ? { x, y } : null; })()`);
  if (visible) {
    await p.press("", visible);
    await p.settle(250);
    assert.deepEqual(await p.writes(), [], "C3-4 a press on a card not shown whole does not write");
    assert.equal(await p.note(), "请先让这一块完整显示");
  } else t.diagnostic("the account went under the frame's edge with the header; the partial press is covered by framed-area's own tests");
  await child.evaluate(`document.getElementById("card").style.top = "24px"`);

  // C3-9, ASC-67: the person cancels: the page hears cancelled, nothing is written, and asked again only the folded line shows.
  await p.ready();
  await p.press(p.control("cancel"));
  assert.equal(await p.answer("card"), "cancelled");
  assert.deepEqual(await p.writes(), [], "C3-9 cancelling writes nothing");
  assert.equal(await p.bound(), null);
  await p.ask("card", "left:24px;top:24px;width:560px");
  await browser.waitFor(`document.querySelector(${JSON.stringify(CARD)})?.dataset.stage === "line"`);
  assert.equal(await child.evaluate("document.getElementById('card').getBoundingClientRect().height"), LINE, "C3-9 the same page asked again shows only the line");

  // C3-8: the page goes (its element removed) while the person aims at the card: the press after it writes nothing.
  await p.ready();
  const again = await p.centre(p.control("retry"));
  await child.evaluate("document.getElementById('card').remove()");
  await browser.waitFor(`!document.querySelector(${JSON.stringify(CARD)})`);
  await p.press("", again);
  await p.settle(250);
  assert.deepEqual(await p.writes(), [], "C3-8 a press after the page left writes nothing");
  assert.equal(await p.bound(), null, "C3-8 nothing is on the source");
});

test("ASC-70 S-plugin-connection-card a source the person adds without an account gets the card in its row and is pulled once; the picker with no account shows the card, not a dialog", { timeout: 150_000 }, async t => {
  const p = await open(t); if (!p) return;
  const { browser, child } = p;
  const config = (id: string) => `[data-feed-task-config="${id}"]`;
  const picker = (id: string) => `${config(id)} [data-feed-account-picker]`;
  const DIALOG = 'dialog[aria-label="请选择账号连接"]';

  // A source added before, with no account anywhere: its settings keep the picker; the picker shows the card after itself, not a dialog.
  await child.evaluate(`pageHost.openView({ surface: "workbench", id: ${JSON.stringify(p.source)}, panel: "settings", intent: "open" })`);
  await child.waitFor(`!!document.querySelector(${JSON.stringify(picker(p.source) + ":not(:disabled)")})`);
  await p.settle(300);
  assert.equal(await browser.evaluate(`document.querySelectorAll(${JSON.stringify(CARD)}).length`), 0, "an older source without an account keeps its picker");
  await child.click(picker(p.source));
  await p.shown("cancel");
  assert.equal(await p.stage(), "ask", "with no account the card asks to connect one");
  assert.equal(await browser.evaluate(`document.querySelectorAll(${JSON.stringify(DIALOG)}).length`), 0, "no account dialog opens");
  await p.ready();
  await p.press(p.control("cancel"));
  await browser.waitFor(`!document.querySelector(${JSON.stringify(CARD)})`);
  await child.waitFor(`!document.querySelector(${JSON.stringify(picker(p.source))}).disabled`);
  assert.deepEqual(await p.writes(), [], "cancelling the picker's card writes nothing");

  // A GitHub source the person adds here, with an account to choose: the card in the new source's row; chosen, one first pull.
  const account = p.account("Feed account");
  await child.evaluate(`(() => { const form = document.querySelector('form[data-feed-add-account="github"]');
    form.querySelector("[data-feed-account-name]").value = "Added source"; form.requestSubmit(); })()`);
  await browser.waitFor(`document.querySelector(${JSON.stringify(CARD)})?.dataset.stage === "choose"`);
  const added = await child.evaluate<string>("document.querySelector('[data-feed-workbench]').dataset.selectedSource");
  assert.notEqual(added, p.source);
  assert.equal(await child.evaluate(`!!document.querySelector(${JSON.stringify(config(added) + " [data-feed-connection-need]")})`), true, "the card's place is in the new source's row");
  assert.equal(await child.evaluate(`document.querySelector(${JSON.stringify(picker(added))}).hidden`), true, "the picker steps aside while the card shows");
  await p.ready();
  await p.press(p.control("use:" + account.connection_id));
  // The page's requests to its own routes are carried by the outer document, so the pull is recorded there.
  await browser.waitFor(`window.cnSent.some(item => item.url.endsWith("/sources/" + ${JSON.stringify(added)} + "/sync"))`);
  assert.equal((await p.bound(added))?.connection_id, account.connection_id, "the chosen account is on the new source");
  assert.equal(await p.bound(), null, "the older source is untouched");
  await p.settle(500);
  const pulls = (await p.sent()).filter(item => item.url.endsWith("/sync"));
  assert.equal(pulls.length, 1, "connected, the new source is pulled once: " + JSON.stringify(pulls));
  assert.equal((await p.writes()).filter(item => item.body?.operation === "bind").length, 1);
});

test("DRT-13 S-plugin-connection-card 还不能一键连接 opens the connections page as the page's return trip; back on the page the card reads its target once more and goes on", { timeout: 150_000 }, async t => {
  const p = await open(t); if (!p) return;
  const { browser } = p;
  // This service cannot be connected in the card here: the Host says so when the login is prepared.
  await browser.evaluate(`(() => { const fetch = window.fetch; window.fetch = function (input, init) {
    let body = null; try { body = JSON.parse(init && init.body); } catch { body = null; }
    if (body && body.operation === "prepare") return Promise.resolve(new Response(JSON.stringify({ error: "unsupported", code: "connector.setup.unsupported" }), { status: 422, headers: { "content-type": "application/json" } }));
    return fetch.apply(this, arguments); }; })()`);
  await p.ask("card", "left:24px;top:24px;width:560px");
  await p.shown("connect");
  await p.ready();
  await p.press(p.control("connect"));
  await browser.waitFor(`document.querySelector(${JSON.stringify(CARD)})?.dataset.stage === "unsupported"`, 10_000);
  await p.shown("settings");
  await p.ready();
  await p.press(p.control("settings"));
  await browser.waitFor("document.body.dataset.desktopSurface === 'settings' && document.querySelector('[data-settings-return-bar]')", 15_000);
  const trip = await browser.evaluate<{ need: unknown; claim: boolean }>(`Object.values(JSON.parse(sessionStorage.getItem("molis-work:return-trips")))[0][0]`);
  assert.deepEqual({ need: trip.need, claim: trip.claim }, { need: { kind: "connection", service_id: "github", slot: { slot_id: "github", record_key: p.source } }, claim: true },
    "the trip is the page's, with the card's slot");
  // An account is connected while the person is on the connections page; going back, the owner reads it back and the card reads again.
  p.account("Connected meanwhile");
  const reads = async () => (await p.sent()).filter(item => item.body?.operation === "read").length;
  const before = await reads();
  await browser.click("[data-settings-return-bar] [data-return-bar-back]");
  await browser.waitFor("document.body.dataset.desktopSurface === 'feed'", 15_000);
  await browser.waitFor(`document.querySelector(${JSON.stringify(CARD)})?.dataset.stage === "choose"`, 15_000);
  assert.equal(await reads(), before + 1, "the card reads its target once more");
  assert.deepEqual(await p.writes(), [], "nothing is put on the place for the person");
  assert.equal(await browser.evaluate(`sessionStorage.getItem("molis-work:return-trips")`), null, "the trip is claimed and gone");
});
