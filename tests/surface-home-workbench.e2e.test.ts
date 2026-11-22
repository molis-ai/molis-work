import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { addProjectPlugin, createProject } from "@molis-ai/molis-work-test-kit/local-host-http";
import type { SurfaceHomeDisplay } from "@molis-ai/molis-work-design-system";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

const home = '[data-work-surface="home"]';
const GOALS = "io.molis.work.goals";
const source = `[data-home-card="${GOALS}"]`;
const outline = `[data-home-group="outline:${GOALS}"]`;
const next = '[data-home-group="next"]';
// A Goal is drawn in its place in the owner's tree, and nowhere else on the page (POLISH-77).
const row = outline + ' [data-home-row]';
const title = row + ' .mw-presentation__row-title';
const endpoint = "/api/host/surface-home";
// 项目主页 from the start page: the browser's window is under 760px, where the strip's ⌂ shows only while the home is the
// current page (specs/screen-polish §3 方案 C, POLISH-07), and the start page lists it at every width.
const HOME_ENTRY = '[data-plugin-strip] [data-plugin-id="home"]';

test("POLISH-76 POLISH-78 POLISH-79 POLISH-80 POLISH-81 POLISH-83 PEQ-07 IUI-21 IUI-26 SCS-11 WBR-21: the project's first page says where it stands from what its plugins declare, at twelve settings", { timeout: 180_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null);
  if (!b) return;
  const project = await createProject(b.web, "Home journey"), prefix = "/projects/" + project.project_id;
  await addProjectPlugin(b.web, project.project_id, "goals");
  const go = (query = "") => b.navigate(() => b.command("Page.navigate", { url: b.origin + prefix + "/" + query }, b.sessionId));
  const shown = (selector: string) => b.waitFor(`document.querySelector(${JSON.stringify(selector)})?.checkVisibility() && !document.querySelector(${JSON.stringify(home)}).hidden`, 15_000);
  const rows = async () => (await b.web.post<SurfaceHomeDisplay>(prefix + endpoint, {})).display.rows.filter(item => item.owner === GOALS);
  const captures = reviewEvidenceUrl("surface-home-consumers/");
  await mkdir(captures, { recursive: true });
  const capture = async (name: string) => {
    const shot = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, b.sessionId);
    await writeFile(new URL(name + ".png", captures), Buffer.from(shot.data, "base64"));
  };
  await b.setViewport(1440, 900, false);
  await go();
  await shown('[data-home-group="start"]');
  assert.equal((await rows()).length, 0);
  // A project with nothing in it: one line that says so and three places to begin (user decision 2026-11-22); the first is the one
  // ink-blue button. Nothing here starts a plugin's own work: that is the start page's (specs/screen-polish §八之二).
  const begin = await b.evaluate<{ entries: string[]; primary: number; bring: string; sections: string[]; starts: number }>(`(() => {
    const box = document.querySelector(${JSON.stringify(home)}), steps = [...box.querySelectorAll('[data-home-group="start"] .mw-first-page__step')];
    return { entries: steps.map(step => step.querySelector('a,button')?.getAttribute('data-home-start') || step.querySelector('button')?.getAttribute('data-home-control') || ''),
      primary: box.querySelectorAll('.mw-btn--primary').length, bring: steps[0]?.querySelector('a')?.getAttribute('href') || '',
      sections: [...box.querySelectorAll('[data-home-group]')].map(node => node.getAttribute('data-home-group')),
      starts: box.querySelectorAll('[data-home-control*=":start:"]').length };
  })()`);
  assert.deepEqual(begin.entries, ["bring", "write", "picker"]);
  assert.equal(begin.primary, 1, "one primary action on the page");
  assert.match(begin.bring, /\/settings\/workspaces$/u);
  assert.deepEqual(begin.sections, ["start"], "no 目标 section and no rows before there is anything to say");
  assert.equal(begin.starts, 0, "the first page carries no plugin start entry");
  await capture("home-new-1440-zh-light");
  await b.click('[data-home-group="start"] [data-home-control="write"]');
  await b.waitFor("document.activeElement?.closest('[data-assistant-island], .assistant-island, [data-work-bar]') !== null");

  // The owner's own tree: a parent with two parts, one of them done. The page learns it from the overview, not from Goals' tables.
  const create = (body: Record<string, unknown>) => b.web.post<{ goal: { goal_id: string } }>(prefix + "/api/plugins/" + GOALS + "/goals", body);
  const parent = await create({ title: "Homepage object · a long title with real values", idempotency_key: "home-parent" });
  await create({ title: "First part of the homepage object", parent_goal_id: parent.goal.goal_id, idempotency_key: "home-part-1" });
  await create({ title: "Second part of the homepage object", parent_goal_id: parent.goal.goal_id, idempotency_key: "home-part-2" });
  assert.equal((await rows()).length, 3);
  await go();
  await shown(row);
  const page = await b.evaluate<{ groups: string[]; depths: string[]; progress: string; nextPrimary: number[]; steps: number; source: string; keys: string[] }>(`(() => {
    const box = document.querySelector(${JSON.stringify(home)});
    return { groups: [...box.querySelectorAll('[data-home-group]')].map(node => node.getAttribute('data-home-group')),
      depths: [...box.querySelectorAll(${JSON.stringify(outline + " [data-home-row]")})].map(node => node.getAttribute('data-first-page-depth')),
      progress: box.querySelector(${JSON.stringify(outline + " .mw-first-page__progress small")})?.textContent || '',
      nextPrimary: [...box.querySelectorAll(${JSON.stringify(next + " .mw-first-page__step")})].map(step => step.querySelectorAll('.mw-btn--primary').length),
      steps: box.querySelectorAll(${JSON.stringify(next + " .mw-first-page__step")}).length,
      source: box.querySelector(${JSON.stringify(source + " .mw-first-page__word")})?.textContent || '',
      keys: [...box.querySelectorAll('[data-home-row]')].map(node => node.getAttribute('data-home-row')) };
  })()`);
  assert.deepEqual(page.groups, ["outline:" + GOALS, "next"], "the tree's objects are not listed a second time under 自你上次来");
  assert.equal(new Set(page.keys).size, page.keys.length, "an object is on the page once");
  assert.equal(page.keys.length, 3);
  assert.deepEqual(page.depths, ["0", "1", "1"], "the parent and then its parts");
  assert.equal(page.progress, "0 / 2");
  assert.ok(page.steps > 0 && page.steps <= 3, "at most three next steps");
  assert.deepEqual(page.nextPrimary, [1, ...Array(page.steps - 1).fill(0)], "only the first next step is primary");
  assert.match(page.source, /正常|No change|有变化|Changed/u);

  // Take the actual Tab stop, then use the real browser keyboard, not a direct DOM click or focus on the dialog.
  await b.evaluate(`document.querySelector(${JSON.stringify(outline + ' h2')}).setAttribute('tabindex','-1');document.querySelector(${JSON.stringify(outline + ' h2')}).focus()`);
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

  // The source in the margin opens the plugin; the page returns from the strip.
  await b.click(source + " .mw-first-page__source-name");
  await b.waitFor(`!document.querySelector(${JSON.stringify(home)}).checkVisibility()`);
  await b.click(HOME_ENTRY);
  await shown(row);

  for (const width of [1440, 1024, 390]) for (const lang of ["zh", "en"]) for (const theme of ["light", "dark"]) {
    await b.setViewport(width, 900, width === 390);
    await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, b.sessionId);
    await b.command("Network.setCookie", { name: "molis_work_locale", value: lang, url: b.origin }, b.sessionId);
    await go();
    await shown(row);
    const sample = await b.evaluate<{ words: string; content: string; theme: string; overflow: boolean; margin: string; column: number; heads: string[]; wraps: boolean }>(`(() => {
      const box = document.querySelector(${JSON.stringify(home)}), mark = box.querySelector(${JSON.stringify(row + ' .mw-status')});
      const scroll = box.querySelector('.home-scroll'), column = box.querySelector('.mw-first-page__column'), margin = box.querySelector('.mw-first-page__margin');
      const a = column.getBoundingClientRect(), m = margin.getBoundingClientRect();
      const name = box.querySelector(${JSON.stringify(title)});
      return { words: mark?.textContent || '', content: box.innerText, theme: document.documentElement.dataset.resolvedTheme,
        overflow: scroll.scrollWidth > scroll.clientWidth + 1, margin: m.left >= a.right ? 'beside' : m.top >= a.bottom - 1 ? 'below' : 'overlap',
        column: Math.round(a.width), heads: [...box.querySelectorAll('.mw-first-page__section h2')].map(node => node.textContent.trim()),
        wraps: name.getBoundingClientRect().height > parseFloat(getComputedStyle(name).lineHeight) * 1.5 };
    })()`);
    const at = width + "/" + lang + "/" + theme;
    assert.ok(sample.content.includes("Homepage object"), at);
    assert.equal(sample.theme, theme);
    assert.equal(sample.overflow, false, at);
    assert.equal(sample.wraps, false, at + ": a row stays on one line");
    // POLISH-76: one reading column of at most 640px with its sources beside it; under 980px of page the sources go below the column.
    assert.ok(sample.column <= 640, at + " column " + sample.column);
    assert.equal(sample.margin, width >= 1440 ? "beside" : "below", at);
    assert.match(sample.words, lang === "zh" ? /进行中/ : /In progress/);
    assert.deepEqual(sample.heads.slice(-2), lang === "zh" ? ["目标", "下一步"] : ["Goals", "Next"], at);
    if (lang === "en") assert.doesNotMatch(sample.content.replace(/Homepage object[^\n]*/gu, ""), /\p{Script=Han}/u, at);
    assert.doesNotMatch(sample.content, /(?:接着做|Pick up where you left off|当天的事件|Today’s events)/u);
    // F-11 (batch 27 item 14, now on this home): no standing greeting or slogan, and no second explanation of how to start above the actions.
    assert.doesNotMatch(sample.content, /(?:早上好|中午好|下午好|晚上好|夜深了|Good (?:morning|midday|afternoon|evening)|Working late|今天的工作|Today’s work|插件提供的新事项和待处理事项会出现在这里|New and pending items from plugins appear here)/u);
    if (theme === "light" && lang === "zh" || theme === "dark" && lang === "en") await capture(`home-${width}-${lang}-${theme}`);
  }
});

test("SCS-12 FSS-34 the project home changes its owners' words in place when the language changes, without composing it again", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null);
  if (!b) return;
  const project = await createProject(b.web, "Home words"), prefix = "/projects/" + project.project_id;
  await addProjectPlugin(b.web, project.project_id, "goals");
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
  await b.click(HOME_ENTRY);
  await b.waitFor(`document.querySelector(${JSON.stringify(home)}).checkVisibility() && /In progress/u.test(document.querySelector(${JSON.stringify(row + " .mw-status")})?.textContent ?? "")`, 15_000);
  assert.equal(await b.evaluate("homeWordReads.at(-1)"), "en", "the home installs fresh grants in the new language");
});
