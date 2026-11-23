// SECURITY-INVARIANTS S-package-install-sheet, the shell's half (specs/plugin-builder-upgrade/spec.md §7.0, batch 47): the install sheet a
// plugin page asks for is drawn by the workbench outside the page's frame, shows what the Host verified in the package, and installs only
// on the person's own, deliberate press. What the page can do to it (send made-up messages, press for the person, go away) installs
// nothing; what it hears is a height, that the sheet shows, and in the end only which plugin and version is installed, that the person put
// it off, or a refusal's code: never a permission the person chose, or a key. Every refusal asserts that no confirmation went to the Host.
// The Host route's own refusals are tests/security-invariants-package-install-sheet.test.ts.
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type { PluginInstalledView } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { LocalHostHttpClient, projectPluginRevision } from "@molis-ai/molis-work-test-kit/local-host-http";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { mac } from "./fixtures/home-sandbox.js";
import { SHEET_KEY_VALUE, SHEET_PLUGIN_ID, pinSheetPublisher, sheetPackage } from "./fixtures/install-sheet.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";
import { SANDBOX_PACKAGE_FILES } from "@molis-ai/molis-work-contracts/platform/plugin";
import { newPublisher, signedPackage } from "./fixtures/sandbox-package.js";

const SHEET = "[data-install-sheet]";

/** What each document sends, recorded as it goes: the outer one's messages down to the frame and its requests to the sheet's route (never the package itself). */
const OBSERVE = `(() => {
  window.isDown = []; window.isSent = [];
  const post = MessagePort.prototype.postMessage;
  MessagePort.prototype.postMessage = function (message, ...rest) {
    window.isPort = this;
    if (message && typeof message.type === "string" && message.type.startsWith("package-install-") && !["package-install-open", "package-install-layout", "package-install-close"].includes(message.type)) window.isDown.push(JSON.parse(JSON.stringify(message)));
    return post.call(this, message, ...rest);
  };
  const fetch = window.fetch;
  window.fetch = function (input, init) {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/api/host/plugin-page-install")) { let body = null; try { body = JSON.parse(init.body); delete body.bundle; } catch { body = null; } window.isSent.push(body); }
    return fetch.apply(this, arguments);
  };
})();`;

type Sent = { operation?: string; preview_id?: string; optional?: string[]; secrets?: Array<{ name: string; header: string; value: string }> } | null;

/** The least any wait in this file allows: a slower runner takes well over the shared 10 s for a page or a sheet to come up. */
const WAIT_MS = 30_000;

async function open(t: TestContext) {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return null;
  await browser.setViewport(1440, 960);
  const atLeast = <T extends { waitFor(expression: string, timeoutMs?: number): Promise<void> }>(target: T): T => {
    const original = target.waitFor.bind(target);
    target.waitFor = (expression: string, timeoutMs = WAIT_MS) => original(expression, Math.max(timeoutMs, WAIT_MS));
    return target;
  };
  atLeast(browser);
  const { projectId, homeDirectory } = browser;
  assert.ok(projectId);
  const client = new LocalHostHttpClient({ origin: browser.origin, controlToken: browser.controlToken });
  // Any plugin page may ask for the sheet; Feed's stands in for one here.
  await client.post(`/api/settings/projects/${projectId}/plugins`, { plugin_id: "feed", expected_revision: await projectPluginRevision(client, projectId) });
  await pluginFrameInitScript(t, browser, `window.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,value){target[key]=key==='feed'?host=>{window.pageHost=host;return value(host)}:value;return true}});${OBSERVE}`);
  const child = atLeast(await pluginFrameBrowser(t, browser, "feed"));
  await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + `/projects/${projectId}/?openPlugin=feed` }, browser.sessionId));
  await child.waitFor("window.pageHost");
  /** An empty element in the plugin's document at a fixed place, and the sheet asked for on it with the package the page holds. */
  const ask = async (id: string, style: string, bundle: unknown) => {
    await child.evaluate(`(() => {
      const element = document.getElementById(${JSON.stringify(id)}) ?? document.body.appendChild(Object.assign(document.createElement("div"), { id: ${JSON.stringify(id)} }));
      element.style.cssText = ${JSON.stringify("position:fixed;z-index:2147483647;" + style)};
      window.isAnswers ??= {};
      window.isAnswers[${JSON.stringify(id)}] = pageHost.packageInstall(element, { bundle: ${JSON.stringify(bundle)} }).then(outcome => JSON.stringify(outcome), error => "refused: " + error.message);
    })()`);
  };
  const answer = (id: string) => child.evaluate<string>(`window.isAnswers[${JSON.stringify(id)}]`);
  const sent = () => browser.evaluate<Sent[]>("window.isSent");
  const confirms = async () => (await sent()).filter(item => item?.operation !== "preview");
  const down = () => browser.evaluate<Array<Record<string, unknown>>>("window.isDown");
  const stage = () => browser.evaluate<string>(`document.querySelector(${JSON.stringify(SHEET)})?.dataset.stage ?? ""`);
  const staged = (name: string) => browser.waitFor(`document.querySelector(${JSON.stringify(SHEET)})?.dataset.stage === ${JSON.stringify(name)}`);
  const control = (name: string) => `${SHEET} [data-framed-control="${name}"]`;
  const centre = (selector: string) => browser.evaluate<{ x: number; y: number }>(`(() => { const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; })()`);
  /** A real press of the mouse, as the browser delivers a person's: trusted. */
  const press = async (selector: string, at?: { x: number; y: number }) => {
    const point = at ?? await centre(selector);
    await browser.command("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 }, browser.sessionId);
    await browser.command("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 }, browser.sessionId);
  };
  const settle = (ms = 650) => new Promise(resolve => setTimeout(resolve, ms));
  /** As a person waits: the sheet has held still for the steady time and shows ready. */
  const ready = async () => { await settle(); await browser.waitFor(`document.querySelector(${JSON.stringify(SHEET)}) && !document.querySelector(${JSON.stringify(SHEET)}).hasAttribute("data-unready")`); };
  const on = (permission: string) => browser.evaluate<string>(`document.querySelector(${JSON.stringify(control("tile:" + permission))})?.dataset.on ?? ""`);
  const installed = async () => (await client.get<{ plugins: PluginInstalledView[] }>(`/projects/${projectId}/api/plugin-trust/overview`)).plugins.find(row => row.plugin_id === SHEET_PLUGIN_ID && row.state !== "uninstalled");
  return { browser, child, client, homeDirectory, ask, answer, sent, confirms, down, stage, staged, control, centre, press, settle, ready, on, installed };
}

test("S-package-install-sheet PBU-47-6 made-up messages draw nothing, an untrusted publisher is not installed from a page, and only the person's own press moves a switch or puts the install off", { timeout: 180_000 }, async t => {
  const p = await open(t); if (!p) return;
  const { browser, child } = p, publisher = newPublisher(), bundle = sheetPackage(publisher);

  // Made-up opens from the frame: a target with a name more, a message with a field more, no package, a bad id.
  await child.evaluate(`(() => { const port = window.isPort, bundle = ${JSON.stringify(bundle)};
    port.postMessage({ type: "package-install-open", id: 90, target: { bundle, optional: ["network:request"] } });
    port.postMessage({ type: "package-install-open", id: 91, target: { bundle }, consent: true });
    port.postMessage({ type: "package-install-open", id: 92, target: { bundle: "text" } });
    port.postMessage({ type: "package-install-open", id: -1, target: { bundle } });
    port.postMessage({ type: "package-install-layout", id: 93, box: { x: 0, y: 0, width: 720, height: 300 } });
  })()`);
  await browser.waitFor(`window.isDown.filter(message => message.type === "package-install-done").length >= 3`);
  await p.settle(300);
  assert.deepEqual((await p.down()).filter(message => message.type === "package-install-done").map(message => [message.id, message.error]).sort(), [[90, "Unavailable"], [91, "Unavailable"], [92, "Unavailable"]], "every made-up open gets the one fixed answer");
  assert.deepEqual(await p.sent(), [], "a made-up open reaches no route");
  assert.equal(await browser.evaluate(`document.querySelectorAll(${JSON.stringify(SHEET)}).length`), 0, "no sheet is drawn");

  // A publisher the person has not trusted: the sheet says so and has nothing to confirm with.
  await p.ask("sheet", "left:24px;top:24px;width:720px", bundle);
  await p.staged("untrusted");
  assert.equal(await browser.evaluate(`document.querySelectorAll(${JSON.stringify(p.control("confirm") + "," + SHEET + " [data-framed-control^='tile:']")}).length`), 0, "an untrusted publisher's sheet offers no confirmation");
  await p.ready();
  await p.press(p.control("dismiss"));
  assert.equal(await p.answer("sheet"), JSON.stringify({ status: "failed", code: "host.package_install.publisher_untrusted" }));
  assert.deepEqual(await p.confirms(), [], "nothing was asked of the Host but the preview");
  assert.equal(await p.installed(), undefined);

  // Trusted by the person: the sheet shows what the Host verified, at the height its rows add up to, with nothing scrolling.
  pinSheetPublisher(p.homeDirectory, publisher);
  await browser.evaluate("window.isDown = []");
  await p.ask("sheet", "left:24px;top:24px;width:720px", bundle);
  await p.staged("review");
  // The review markup arrives before the outer frame applies its new height.
  await p.ready();
  const drawn = await browser.evaluate<{ height: number; scrolls: number; tiles: string[]; publisher: string; name: string }>(`(() => { const sheet = document.querySelector(${JSON.stringify(SHEET)}), main = sheet.querySelector(".install-sheet__main");
    return { height: sheet.getBoundingClientRect().height, scrolls: main.scrollHeight - main.clientHeight, tiles: [...sheet.querySelectorAll("[data-framed-control^='tile:']")].map(tile => tile.dataset.framedControl + "=" + tile.dataset.on),
      publisher: sheet.querySelector(".install-chip").textContent, name: sheet.querySelector(".install-sheet__name strong").textContent }; })()`);
  assert.deepEqual(drawn.tiles, ["tile:network:request=false", "tile:secret:use=false"], "every optional permission starts off");
  assert.match(drawn.publisher, /Sheet publisher/u, "the publisher is the pin's own label");
  assert.ok(drawn.scrolls <= 0, "one screen: the sheet's middle does not scroll");
  await child.waitFor(`document.getElementById('sheet').getBoundingClientRect().height === ${drawn.height}`);
  assert.ok(drawn.height > 200 && drawn.height <= 580, `the page's element is as tall as the sheet (${drawn.height})`);

  // A script in the outer document presses for the person: nothing it dispatches is trusted, so no switch moves and nothing is confirmed.
  await browser.evaluate(`(() => { for (const name of ["tile:network:request", "switch:network:request", "confirm"]) document.querySelector(${JSON.stringify(SHEET)} + ' [data-framed-control="' + name + '"]').click(); })()`);
  await p.settle(250);
  assert.equal(await p.on("network:request"), "false", "an untrusted click moves no switch");
  assert.equal(await browser.evaluate<boolean>(`document.querySelector(${JSON.stringify(p.control("switch:network:request"))}).checked`), false);
  assert.equal(await p.stage(), "review");
  assert.deepEqual(await p.confirms(), [], "an untrusted click confirms nothing");

  // The person's own press on the tile moves its switch, here and nowhere else; putting the install off tells the page only that.
  await p.press(p.control("tile:network:request"));
  await browser.waitFor(`document.querySelector(${JSON.stringify(p.control("tile:network:request"))}).dataset.on === "true"`);
  assert.equal(await browser.evaluate<boolean>(`document.querySelector(${JSON.stringify(p.control("switch:network:request"))}).checked`), true, "the switch follows its tile");
  assert.equal(await p.on("secret:use"), "false");
  await p.press(p.control("later"));
  assert.equal(await p.answer("sheet"), JSON.stringify({ status: "cancelled" }));
  await p.staged("line");
  assert.deepEqual(await p.confirms(), [], "putting it off confirms nothing");
  assert.equal(await p.installed(), undefined, "nothing is installed");

  // What the frame heard: heights, that the sheet shows, and one answer; no permission, preview or publisher.
  const heard = await p.down();
  for (const message of heard) assert.ok(["package-install-size", "package-install-shown", "package-install-done", "package-install-reveal"].includes(String(message.type)), JSON.stringify(message));
  assert.equal(/network:request|secret:use|preview|publisher|calendar-key|api\.example\.test/u.test(JSON.stringify(heard)), false, "nothing the sheet shows or the person chose reaches the frame: " + JSON.stringify(heard));
});

test("S-package-install-sheet PBU-47-7 the person's press installs once, with the switches they turned on and the key they typed, and the page hears only the plugin and its version", mac, async t => {
  const p = await open(t); if (!p) return;
  const { browser, child } = p, publisher = newPublisher();
  pinSheetPublisher(p.homeDirectory, publisher);
  await p.ask("sheet", "left:24px;top:24px;width:720px", sheetPackage(publisher));
  await p.staged("review");
  await p.ready();
  await p.press(p.control("tile:network:request"));
  await p.press(p.control("tile:secret:use"));
  await browser.waitFor(`document.querySelector(${JSON.stringify(p.control("tile:secret:use"))}).dataset.on === "true"`);
  // The package may use a key the person has not saved: one more step in the sheet, typed here and never in the page.
  await p.press(p.control("confirm"));
  await p.staged("keys");
  assert.deepEqual(await p.confirms(), [], "nothing is confirmed before the key is typed");
  await browser.waitFor(`document.activeElement?.matches(${JSON.stringify(SHEET + " [data-install-key='calendar-key']")})`);
  await browser.command("Input.insertText", { text: SHEET_KEY_VALUE }, browser.sessionId);
  await p.ready();
  // Three presses at once: one confirmation.
  const point = await p.centre(p.control("save"));
  await Promise.all([p.press("", point), p.press("", point), p.press("", point)]);
  await p.staged("done");
  assert.equal(await p.answer("sheet"), JSON.stringify({ status: "installed", plugin_id: SHEET_PLUGIN_ID, version: "1.0.0" }));
  const confirmed = await p.confirms();
  assert.equal(confirmed.length, 1, "one confirmation for the person's presses");
  assert.deepEqual([confirmed[0]!.operation, [...confirmed[0]!.optional ?? []].sort(), confirmed[0]!.secrets], ["confirm", ["network:request", "secret:use"], [{ name: "calendar-key", header: "Authorization", value: SHEET_KEY_VALUE }]]);
  const row = await p.installed();
  assert.deepEqual([row?.version, row?.permissions.filter(item => item.granted).map(item => item.permission).sort()], ["1.0.0", ["network:request", "secret:use", "storage:private"]], "installed with what the person turned on");
  // The key stays where it was typed: not in what the frame heard, not in the frame's document, and no longer in the sheet.
  const heard = JSON.stringify(await p.down());
  assert.equal(heard.includes(SHEET_KEY_VALUE) || /network:request|secret:use/u.test(heard), false, "neither the key nor a choice reaches the frame: " + heard);
  assert.equal(await child.evaluate<boolean>(`document.documentElement.outerHTML.includes(${JSON.stringify(SHEET_KEY_VALUE)})`), false);
  assert.equal(await browser.evaluate<boolean>(`[...document.querySelectorAll(${JSON.stringify(SHEET + " input")})].some(input => input.value.includes(${JSON.stringify(SHEET_KEY_VALUE)}))`), false, "the result holds no key");
});

test("B47-F6 PBU-47-5 the sheet localizes a bad signature and an actual startup refusal in both languages", { ...mac, timeout: 180_000 }, async t => {
  const p = await open(t);
  if (!p) return;
  const { browser } = p, publisher = newPublisher();
  pinSheetPublisher(p.homeDirectory, publisher);
  const broken = signedPackage(publisher, files => { files[SANDBOX_PACKAGE_FILES.entrypoint] = "throw new Error('controlled startup failure');"; }, { pluginId: SHEET_PLUGIN_ID });
  const badSignature = structuredClone(broken);
  badSignature.signature!.value_base64 = Buffer.alloc(64).toString("base64");
  for (const [language, bad, start] of [
    ["zh", "签名未通过校验", "插件没能启动"],
    ["en", "The signature could not be verified", "The plugin could not start"],
  ] as const) {
    await browser.command("Network.setCookie", { name: "molis_work_locale", value: language, url: browser.origin }, browser.sessionId);
    await browser.reloadPage();
    await p.child.waitFor("window.pageHost", WAIT_MS);
    for (const [name, bundle, copy, phase] of [["signature", badSignature, bad, 0], ["start", broken, start, 2]] as const) {
      await p.ask(name, "left:24px;top:24px;width:720px", bundle);
      if (phase === 2) {
        await p.staged("review");
        await p.ready();
        await p.press(p.control("confirm"));
      }
      await p.staged("failed");
      const failed = await browser.evaluate<{ text: string; step: number }>(`(() => {
        const sheet = document.querySelector('${SHEET}');
        return { text: sheet.innerText, step: [...sheet.querySelectorAll('.install-steps li')].findIndex(li => li.dataset.state === 'failed') };
      })()`);
      assert.equal(failed.step, phase);
      assert.ok(failed.text.includes(copy), failed.text);
      if (language === "en") assert.doesNotMatch(failed.text, /\p{Script=Han}/u);
      assert.equal(await p.installed(), undefined);
      await p.ready();
      await p.press(p.control("dismiss"));
      await browser.waitFor(`!document.querySelector('${SHEET}') || document.querySelector('${SHEET}').dataset.stage === 'line'`, WAIT_MS);
    }
  }
});
