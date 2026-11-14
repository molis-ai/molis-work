import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { createProject } from "@molis-ai/molis-work-test-kit/local-host-http";
import type { SurfaceHomeDisplay } from "@molis-ai/molis-work-design-system";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

const home = '[data-work-surface="home"]';
const goals = '[data-home-card="io.molis.work.goals"]';
const start = goals + ' [data-home-control$=":start:0"]';
const row = goals + ' [data-home-row]';
const title = row + ' .mw-presentation__row-title';
const endpoint = "/api/host/surface-home";

test("IUI-21 IUI-26 SCS-11 WBR-21: the project home opens Goals’ original form and renders real rows at twelve settings", { timeout: 150_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null);
  if (!b) return;
  const project = await createProject(b.web, "Home journey"), prefix = "/projects/" + project.project_id;
  const go = (query = "") => b.navigate(() => b.command("Page.navigate", { url: b.origin + prefix + "/" + query }, b.sessionId));
  const painted = () => b.waitFor(`document.querySelector(${JSON.stringify(goals)}) && !document.querySelector(${JSON.stringify(home)}).hidden`, 15_000);
  const rows = async () => (await b.web.post<SurfaceHomeDisplay>(prefix + endpoint, {})).display.rows.filter(item => item.owner === "io.molis.work.goals");
  await go();
  await painted();
  assert.equal((await rows()).length, 0);
  await b.click(start);
  await b.waitFor("document.querySelector('[data-create-dialog]').open");
  await b.click('[data-create-dialog] [data-close-create]');
  await b.waitFor("!document.querySelector('[data-create-dialog]').open");
  assert.equal((await rows()).length, 0, "opening and cancelling the real form write no Goal");
  await b.click('[data-dock-pin="home"]');
  await painted();
  await b.click(start);
  await b.waitFor("document.querySelector('[data-create-dialog]').open");
  await b.evaluate(`(() => {
    const form = document.querySelector('[data-create-form]');
    form.elements.title.value = 'Homepage object · a long title with real values';
    form.elements.title.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await b.navigate(() => b.click('[data-create-form] [type="submit"]'));
  assert.match(await b.evaluate<string>("location.pathname"), /\/goals\//u);
  assert.equal((await rows()).length, 1, "one submit creates one Goal");
  await b.click('[data-dock-pin="home"]');
  await painted();

  // Take the actual Tab stop, then use the real browser keyboard, not a direct DOM click or focus on the dialog.
  await b.evaluate(`document.querySelector(${JSON.stringify(goals + ' h3')}).setAttribute('tabindex','-1');document.querySelector(${JSON.stringify(goals + ' h3')}).focus()`);
  const key = async (name: string, code: number) => {
    await b.command("Input.dispatchKeyEvent", { type: "keyDown", key: name, code: name, windowsVirtualKeyCode: code }, b.sessionId);
    await b.command("Input.dispatchKeyEvent", { type: "keyUp", key: name, code: name, windowsVirtualKeyCode: code }, b.sessionId);
  };
  await key("Tab", 9);
  assert.equal(await b.evaluate(`document.activeElement.matches(${JSON.stringify(title)})`), true);
  await key("Enter", 13);
  await b.waitFor("document.querySelector('[data-home-peek]').open && document.activeElement.matches('[data-home-close]')");
  await key("Tab", 9);
  assert.equal(await b.evaluate("document.activeElement.closest('[data-home-peek]') !== null"), true);
  await key("Escape", 27);
  await b.waitFor(`!document.querySelector('[data-home-peek]').open && document.activeElement.matches(${JSON.stringify(title)})`);

  for (const width of [1440, 1024, 390]) for (const lang of ["zh", "en"]) for (const theme of ["light", "dark"]) {
    await b.setViewport(width, 900, width === 390);
    await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, b.sessionId);
    await b.command("Network.setCookie", { name: "molis_work_locale", value: lang, url: b.origin }, b.sessionId);
    await go();
    await painted();
    const sample = await b.evaluate<{ words: string; content: string; theme: string; overflow: boolean; starts: string[] }>(`(() => {
      const box = document.querySelector(${JSON.stringify(home)}), mark = box.querySelector(${JSON.stringify(row + ' .mw-status')});
      const grid = box.querySelector('.home-plugin-cards');
      return { words: mark?.textContent || '', content: box.innerText, theme: document.documentElement.dataset.resolvedTheme,
        overflow: grid.scrollWidth > grid.clientWidth + 1,
        starts: [...box.querySelectorAll('.home-plugin-card__actions [data-home-control]')].map(button => (button.innerText + ' ' + (button.getAttribute('aria-label') || '')).trim()) };
    })()`);
    assert.ok(sample.content.includes("Homepage object"), width + "/" + lang + "/" + theme);
    assert.equal(sample.theme, theme);
    assert.equal(sample.overflow, false);
    assert.match(sample.words, lang === "zh" ? /进行中/ : /In progress/);
    // RAC-603 on this home: the plugins' start entries are labelled, and in the English interface they carry no Chinese.
    assert.ok(sample.starts.length > 0 && sample.starts.every(Boolean), JSON.stringify(sample.starts));
    if (lang === "en") assert.doesNotMatch(sample.starts.join("\n"), /\p{Script=Han}/u, JSON.stringify(sample.starts));
    assert.doesNotMatch(sample.content, /(?:接着做|Pick up where you left off|当天的事件|Today’s events)/u);
    // F-11 (batch 27 item 14, now on this home): no standing greeting or slogan, and no second explanation of how to start above the actions.
    assert.doesNotMatch(sample.content, /(?:早上好|中午好|下午好|晚上好|夜深了|Good (?:morning|midday|afternoon|evening)|Working late|今天的工作|Today’s work|插件提供的新事项和待处理事项会出现在这里|New and pending items from plugins appear here)/u);
    if (width === 1440 && lang === "zh" && theme === "light" || width === 390 && lang === "en" && theme === "dark") {
      const captures = reviewEvidenceUrl("surface-home-consumers/");
      await mkdir(captures, { recursive: true });
      const shot = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, b.sessionId);
      await writeFile(new URL(`home-${width}-${lang}-${theme}.png`, captures), Buffer.from(shot.data, "base64"));
    }
  }
});

test("SCS-12 FSS-34 the project home changes its owners' words in place when the language changes, without composing it again", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null);
  if (!b) return;
  const project = await createProject(b.web, "Home words"), prefix = "/projects/" + project.project_id;
  await b.web.post(prefix + "/api/plugins/io.molis.work.goals/goals", { title: "Home words goal", idempotency_key: "home-words-goal" });
  await b.command("Network.setCookie", { name: "molis_work_locale", value: "zh", url: b.origin }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + prefix + "/" }, b.sessionId));
  await b.waitFor(`document.querySelector(${JSON.stringify(row + " .mw-status")}) && !document.querySelector(${JSON.stringify(home)}).hidden`, 15_000);
  // Count what the switch asks for: a compose is a POST to the home endpoint, the owners' words are a locale read naming the grants.
  await b.evaluate(`(() => {
    window.homeMark = document.querySelector(${JSON.stringify(row + " .mw-status")}); window.homeRow = homeMark.closest('[data-home-row]');
    window.homeComposes = 0; window.homeWordReads = [];
    const original = window.fetch;
    window.fetch = (input, init) => {
      const url = new URL(String(input?.url || input), location.href);
      if (url.pathname.endsWith(${JSON.stringify(endpoint)})) homeComposes += 1;
      if (url.pathname.endsWith('/api/ui/locales') && url.searchParams.has('surface_text')) homeWordReads.push(url.searchParams.get('locale'));
      return original(input, init);
    };
  })()`);
  assert.match(await b.evaluate<string>("homeMark.textContent"), /进行中/u);
  const select = (tag: "zh" | "en") => b.evaluate(`(() => { const link = document.createElement('a'); link.dataset.uiLanguage = '${tag}';
    link.href = '/locale?lang=${tag}'; document.body.append(link); link.click(); link.remove(); })()`);
  for (const [tag, words] of [["en", /In progress/u], ["zh", /进行中/u]] as const) {
    await select(tag);
    await b.waitFor(`document.documentElement.dataset.uiLanguageTag === '${tag}'`);
    assert.match(await b.evaluate<string>("homeMark.textContent"), words, tag);
    assert.deepEqual(await b.evaluate(`[document.querySelector(${JSON.stringify(row + " .mw-status")}) === homeMark, homeMark.closest('[data-home-row]') === homeRow,
      homeComposes, homeWordReads.at(-1)]`), [true, true, 0, tag], "the same nodes are retexted from the granted words; nothing is composed again");
  }
  // Leaving the home releases its grants: a switch made elsewhere does not read them and still succeeds; the home rereads on return.
  await b.click('[data-plugin-strip] [data-plugin-id="goals"]');
  await b.waitFor(`!document.querySelector(${JSON.stringify(home)}).checkVisibility()`);
  const readsBefore = await b.evaluate<number>("homeWordReads.length");
  await select("en");
  await b.waitFor("document.documentElement.dataset.uiLanguageTag === 'en' && !document.querySelector('[data-ui-language-status]')");
  assert.equal(await b.evaluate<number>("homeWordReads.length"), readsBefore, "released grants are not read by a later switch");
  await b.click('[data-dock-pin="home"]');
  await b.waitFor(`document.querySelector(${JSON.stringify(home)}).checkVisibility() && /In progress/u.test(document.querySelector(${JSON.stringify(row + " .mw-status")})?.textContent ?? "")`, 15_000);
  assert.equal(await b.evaluate("homeWordReads.at(-1)"), "en", "the home installs fresh grants in the new language");
});
