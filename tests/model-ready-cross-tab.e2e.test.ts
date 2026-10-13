import assert from "node:assert/strict";
import test from "node:test";
import { standInKey } from "./fixtures/first-model-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";

/**
 * The onboarding page sends the person to the model settings in a NEW tab ("连接文字模型" opens `/settings/models` with
 * target=_blank). The first model is saved in that other tab, so the page that waits for it is a different document:
 * it learns of the model through a same-origin cross-tab channel and redraws without a reload. Two real tabs of one
 * browser: the waiting onboarding page stays in the background while the other tab saves, and is never reloaded.
 */

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;

const MAIL = "小王你好，请周五前发新版方案，预算等小李确认。";

/** A second tab of the same browser, driven over the same debugger connection. */
async function openTab({ command }: Browser, url: string) {
  const { targetId } = await command<{ targetId: string }>("Target.createTarget", { url }, undefined, 20_000);
  const { sessionId } = await command<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true }, undefined, 20_000);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId, 20_000);
  async function evaluate<T = unknown>(expression: string, timeoutMs = 10_000): Promise<T> {
    const result = await command<{ result: { value: T }; exceptionDetails?: unknown }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId, timeoutMs);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  // Polled from here: the tab may navigate under the poll (a settings address opens the workbench), which ends its page.
  const waitFor = async (expression: string, timeoutMs = 15_000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        if (await evaluate<boolean>(`(() => { try { return Boolean(${expression}); } catch (error) { return false; } })()`)) return;
      } catch (error) {
        if (Date.now() > deadline) throw error;
      }
      assert.ok(Date.now() <= deadline, `DOM condition timeout in the second tab: ${expression.slice(0, 160)}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };
  const setValue = (selector: string, value: string) => evaluate(`(() => { const field = document.querySelector(${JSON.stringify(selector)});
    field.value = ${JSON.stringify(value)}; field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  return { evaluate, waitFor, setValue };
}

/** In the settings of the other tab: pick DeepSeek, point it at the stand-in provider, give its key and save. */
async function connectModel(tab: Awaited<ReturnType<typeof openTab>>, baseUrl: string) {
  // The button is in the page before the script that binds it has run: a click before that does nothing.
  await tab.waitFor("document.readyState === 'complete' && document.querySelector('[data-model-settings] [data-model-template=deepseek]') && globalThis.molisWorkBindModelSettings");
  await tab.evaluate("document.querySelector('[data-model-template=deepseek]').click()");
  await tab.waitFor("document.querySelector('[data-model-base-url]')?.value === 'https://api.deepseek.com'");
  await tab.setValue("[data-model-base-url]", baseUrl);
  await tab.setValue("[data-model-api-key]", standInKey);
  await tab.evaluate("document.querySelector('[data-model-save]').click()");
  await tab.waitFor("/连接检查通过/.test(document.querySelector('[data-model-status]')?.textContent || '')");
}

/** A journey the Host holds, built through the Host's own routes from the onboarding page (it has the control headers). */
async function journeyAt(browser: Browser, stage: "scope" | "materials"): Promise<string> {
  const { evaluate, waitFor, navigate, command, sessionId, origin } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/onboarding?mode=new-project` }, sessionId));
  await waitFor("new URL(location.href).searchParams.get('journey')", 15_000);
  const id = await evaluate<string>("new URL(location.href).searchParams.get('journey')");
  const post = (path: string, body: unknown) => evaluate<number>(`(async () => (await fetch('/api/onboarding/context/${id}' + ${JSON.stringify(path)}, { method: 'POST',
    headers: molisWorkControlHeaders(), body: JSON.stringify(${JSON.stringify(body)}) })).status)()`);
  const sources = [{ kind: "browser", selected: true, text: MAIL, url: "https://example.com/brief" }];
  assert.equal(await post("/selection", { sources, previewed: stage === "scope" }), 200);
  if (stage === "materials") {
    // With no model the Host reads the pasted text, keeps it and stops on "connect a model": the screen this test is about.
    assert.equal(await post("/start", {}), 202);
    for (let attempt = 0; ; attempt++) {
      const stopped = await evaluate<boolean>(`(async () => { const journey = await (await fetch('/api/onboarding/context/${id}')).json();
        return journey.phase === 'failed' && journey.needs_model === true; })()`);
      if (stopped) break;
      assert.ok(attempt < 75, "the journey stops on the missing model");
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  // A new person meets the opening and two questions first; this test is about the screens after them.
  await evaluate("try { localStorage.setItem('molis-work:onboarding-intro', 'done'); } catch (error) { throw error; }");
  await navigate(() => command("Page.navigate", { url: `${origin}/onboarding?mode=new-project&journey=${id}` }, sessionId));
  await waitFor(`!!document.querySelector('[data-ob-view=${stage === "scope" ? "preview" : "materials"}]')`, 15_000);
  return id;
}

for (const [name, catalog, settingsAddress] of [
  ["a person with no project yet: the standalone model settings page in the other tab", "empty", "the standalone page"],
  ["a person with a project: the workbench with the model settings open in the other tab", "seeded", "the workbench cover"],
] as const) {
  test(`${name} tells the onboarding model line without a reload`, { timeout: 150_000 }, async t => {
    const standIn = await startModelStandIn(standInKey);
    t.after(() => standIn.close());
    const browser = await openGoalBrowser(t, catalog);
    if (!browser) return;
    const { command, sessionId, evaluate, waitFor, origin } = browser;
    await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
    await journeyAt(browser, "scope");
    assert.match(await evaluate<string>("document.querySelector('.ob-model')?.textContent || ''"), /尚未连接文字模型/);
    assert.equal(await evaluate("document.querySelector('.ob-model').classList.contains('is-off')"), true);
    await evaluate("window.__sameDocument = 'never reloaded'");

    // The link the page offers is a plain new-tab address; the second tab is exactly what it opens.
    const tab = await openTab(browser, `${origin}/settings/models`);
    await tab.waitFor("document.querySelector('[data-model-settings] [data-model-template=deepseek]')");
    assert.equal(await tab.evaluate("Boolean(document.querySelector('[data-cover-chip=settings]'))"), settingsAddress === "the workbench cover",
      settingsAddress === "the workbench cover" ? "a person with a project meets the settings in the workbench" : "no project, so no workbench around the settings page");
    await connectModel(tab, standIn.baseUrl);

    // The onboarding tab sat in the background the whole time and was not touched.
    await waitFor("document.querySelector('.ob-model') && !document.querySelector('.ob-model').classList.contains('is-off')", 15_000);
    const line = await evaluate<{ text: string; same: string; link: boolean }>(`({ text: document.querySelector('.ob-model').textContent,
      same: window.__sameDocument, link: Boolean(document.querySelector('.ob-model a[href*="/settings/models"]')) })`);
    assert.match(line.text, /文字模型 · \S+/);
    assert.match(line.text, /已连接/);
    assert.doesNotMatch(line.text, /尚未连接/);
    assert.equal(line.same, "never reloaded", "the page was redrawn in place");
    assert.equal(line.link, true, "the line now offers 更换, still a link to the settings");
    assert.match(await evaluate<string>("document.querySelector('[data-ob-view=preview]')?.textContent || ''"), /发给所选模型；原文件保持原样/, "the rest of the screen agrees: the start is the model's");
  });
}

test("the materials screen that waits for a model offers the way on once the other tab connects one", { timeout: 150_000 }, async t => {
  const standIn = await startModelStandIn(standInKey);
  t.after(() => standIn.close());
  const browser = await openGoalBrowser(t, "empty");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await journeyAt(browser, "materials");
  const before = await evaluate<{ text: string; connect: boolean; button: string }>(`({ text: document.querySelector('[data-ob-view=materials]').textContent,
    connect: Boolean(document.querySelector('[data-ob-view=materials] a[href*="/settings/models"]')), button: document.querySelector('[data-action=retry]')?.textContent || '' })`);
  assert.match(before.text, /连接文字模型后，可以回来继续整理/);
  assert.equal(before.connect, true);
  assert.match(before.button, /已连接，继续整理/);
  await evaluate("window.__sameDocument = 'never reloaded'");

  const tab = await openTab(browser, `${origin}/settings/models`);
  await connectModel(tab, standIn.baseUrl);

  await waitFor("/文字模型已连接/.test(document.querySelector('[data-ob-view=materials]')?.textContent || '')", 15_000);
  const after = await evaluate<{ connect: boolean; button: string; same: string; busy: string | null }>(`({
    connect: Boolean(document.querySelector('[data-ob-view=materials] a[href*="/settings/models"]')),
    button: document.querySelector('[data-action=retry]')?.textContent.trim() || '', same: window.__sameDocument, busy: document.getElementById('cx-app').getAttribute('aria-busy') })`);
  assert.equal(after.connect, false, "the link to connect a model is gone with the problem");
  assert.equal(after.button, "继续整理", "what is left is the way on");
  assert.equal(after.same, "never reloaded");
  assert.equal(after.busy, "false", "nothing was started for the person: continuing is still their click");
});
