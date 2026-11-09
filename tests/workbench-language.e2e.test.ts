import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { pluginPagesFor, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { format } from "@molis-ai/molis-work-plugin-sdk/ui";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { deferred } from "./fixtures/home-runtime.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

test("FSS-20 FSS-39 the settings language changes in place; rejected and late preparations leave the current document intact", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  const { command, sessionId, origin, waitFor, evaluate } = b;
  await command("Emulation.setTimezoneOverride", { timezoneId: "Asia/Shanghai" }, sessionId);
  await b.navigate(() => command("Page.navigate", { url: origin + "/locale?lang=zh&next=%2Fsettings%2Fappearance" }, sessionId));
  await waitFor("typeof t === 'function' && typeof molisWorkRequest === 'function' && document.querySelector('a[data-ui-language=en]')");
  const before = await evaluate<string>("document.querySelector('#settings-title').textContent");
  await evaluate(`(() => {
    window.originalDocument = document.body;
    const draft = window.languageDraft = document.createElement('textarea');
    draft.value = 'Draft 原文 保存';
    document.querySelector('.settings-content').append(draft);
    draft.focus(); draft.setSelectionRange(2, 6, 'backward');
    window.originalHeading = document.querySelector('#settings-title');
    const transport = window.molisWorkUiTransport;
    window.languageAttempts = []; window.languageMode = 'deny';
    window.molisWorkUiTransport = (url, init) => {
      const preview = init.headers['x-molis-work-ui-locale'];
      if (new URL(url).pathname === '/api/ui/locale' && init.method === 'POST') languageAttempts.push(JSON.parse(init.body).preference);
      if (preview === 'en' && languageMode === 'deny') return Promise.resolve(new Response('Unavailable', { status: 503 }));
      if (preview === 'en' && languageMode === 'hold') return new Promise(resolve => {
        window.releaseOldLanguage = () => { resolve(new Response('Late response', { status: 503 })); };
      });
      return transport?.(url, init);
    };
  })()`);
  const select = (locale: string) => evaluate(`document.querySelector('a[data-ui-language=${locale}]').click()`);
  await select("en");
  await waitFor("document.querySelector('[data-ui-language-status] button')");
  assert.deepEqual(await evaluate("[document.documentElement.lang, languageAttempts.length, languageDraft.selectionStart, languageDraft.selectionEnd]"), ["zh-CN", 0, 2, 6]);
  await evaluate("languageMode='hold'; document.querySelector('[data-ui-language-status] button').click()");
  await waitFor("typeof releaseOldLanguage === 'function'");
  await select("zh");
  await waitFor("languageAttempts.join() === 'zh' && !document.querySelector('[data-ui-language-status]')");
  await evaluate("releaseOldLanguage(); languageMode='ready'");
  assert.equal(await evaluate("document.documentElement.lang"), "zh-CN");
  await select("en");
  await waitFor("document.documentElement.lang === 'en' && document.querySelector('a[data-ui-language=en]').getAttribute('aria-current')==='true'");
  assert.notEqual(await evaluate("originalHeading.textContent"), before, "the server-rendered settings heading was translated");
  assert.deepEqual(await evaluate("[location.pathname, originalDocument === document.body, document.activeElement === languageDraft, languageDraft.value, languageDraft.selectionStart, languageDraft.selectionEnd, languageDraft.selectionDirection, languageAttempts]"),
    ["/settings/appearance", true, true, "Draft 原文 保存", 2, 6, "backward", ["zh", "en"]]);

  const zone = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const browser = await evaluate<string[]>("['2026-03-08T09:59:00Z','2026-03-08T10:00:00Z'].map(at => format.date(at,'time',{time_zone:'America/Los_Angeles'}))");
    const host = runWithLocale("en", () => ["2026-03-08T09:59:00Z", "2026-03-08T10:00:00Z"].map(at => format.date(at, "time", { time_zone: "America/Los_Angeles" })));
    assert.deepEqual(browser, host);
    assert.match(browser[0]!, /^1:59\sAM$/u); assert.match(browser[1]!, /^3:00\sAM$/u);
    assert.notEqual(await evaluate("format.date('2026-03-08T10:00:00Z','time')"), runWithLocale("en", () => format.date("2026-03-08T10:00:00Z", "time")));
  } finally { if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone; }
});

const ISSUE_OWNER = "io.molis.work.issues";

type LanguageBrowser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;

async function chooseEnglishInSettings(t: TestContext, b: LanguageBrowser) {
  const { targetId } = await b.command<{ targetId: string }>("Target.createTarget", { url: b.origin + "/settings/appearance", background: true });
  t.after(async () => { await b.command("Target.closeTarget", { targetId }).catch(() => undefined); });
  const { sessionId } = await b.command<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
  const clicked = await b.command<{ result: { value?: boolean }; exceptionDetails?: unknown }>("Runtime.evaluate", {
    expression: `(async () => {
      const stop = Date.now() + 15000;
      while (Date.now() < stop) {
        const link = document.querySelector('a[data-ui-language=en]');
        if (link && typeof molisWorkRequest === 'function' && typeof t === 'function') { link.click(); return true; }
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      return false;
    })()`, awaitPromise: true, returnByValue: true,
  }, sessionId, 16000);
  assert.equal(clicked.result.value, true, JSON.stringify(clicked.exceptionDetails));
}

function holdIssueOpening(t: TestContext, b: LanguageBrowser) {
  const authority = pluginPagesFor(b.homeDirectory), open = authority.open.bind(authority);
  const entered = deferred(), finish = deferred();
  t.after(finish.resolve);
  t.mock.method(authority, "open", (...[plugin, project, actor, scope, ...options]: Parameters<typeof open>) =>
    open(plugin, project, actor, plugin === ISSUE_OWNER ? async () => { await scope?.(); entered.resolve(); await finish.promise; } : scope, ...options));
  return { entered, finish };
}

test("FSS-09 FSS-20 FSS-37 the live Issue frame reuses its own authorized projection and retains the draft", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  const child = await pluginFrameBrowser(t, b, "issues");
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/locale?lang=zh&next=%2Fplugins%2Fissues" }, b.sessionId));
  await child.waitFor("document.querySelector('[data-issues=workbench]')?.dataset.ready === 'true'");
  await child.evaluate(`(() => {
    window.issuedDraft = document.querySelector('[data-issue-composer] textarea');
    issuedDraft.value = 'Issue draft 原文'; issuedDraft.focus(); issuedDraft.setSelectionRange(1, 5, 'backward');
    issuedDraft.dispatchEvent(new Event('input', {bubbles:true}));
  })()`);
  assert.match(await child.evaluate<string>("issuedDraft.placeholder"), /遇到什么问题/u);
  await b.evaluate(`(() => {
    window.liveIssueFrame = document.querySelector('iframe[data-plugin-frame=issues]'); window.wordsRequests = [];
    const transport = window.molisWorkUiTransport;
    window.molisWorkUiTransport = (url, init) => {
      const path = new URL(url);
      if (path.pathname === '/api/ui/locales') wordsRequests.push([path.searchParams.get('locale'), path.searchParams.getAll('page').length]);
      return transport?.(url, init);
    };
  })()`);
  await chooseEnglishInSettings(t, b);
  await b.waitFor("document.documentElement.lang === 'en'", 25000);
  await child.waitFor("document.documentElement.lang === 'en' && issuedDraft.placeholder.startsWith('What went wrong')", 10000);
  assert.deepEqual(await b.evaluate("[liveIssueFrame === document.querySelector('iframe[data-plugin-frame=issues]'), wordsRequests]"), [true, [["en", 1]]]);
  assert.deepEqual(await child.evaluate("[issuedDraft === document.querySelector('[data-issue-composer] textarea'), document.activeElement === issuedDraft, issuedDraft.value, issuedDraft.selectionStart, issuedDraft.selectionEnd, issuedDraft.selectionDirection]"), [true, true, "Issue draft 原文", 1, 5, "backward"]);
  assert.deepEqual(await child.evaluate("[t.text('issues.when.minutes-ago',{count:1}),t.text('issues.when.minutes-ago',{count:3})]"), ["1 minute ago", "3 minutes ago"]);
});

test("S-ui-text-page FSS-08 stopping the real plugin during the opening locale batch denies frame config", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  const { entered, finish } = holdIssueOpening(t, b);
  const child = await pluginFrameBrowser(t, b, "issues");
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/plugins/issues" }, b.sessionId));
  await entered.promise;
  await child.waitFor("document.querySelector('meta[name=molis-work-frame-mount]') && typeof t === 'undefined'");
  // The actual Home Plugin Supervisor withdraws the running installation while the actual HTTP scope check is waiting.
  await b.web.post("/api/plugins/" + ISSUE_OWNER + "/disable", {});
  finish.resolve();
  await b.waitFor("!document.querySelector('iframe[data-plugin-frame=issues]') && !document.querySelector('[data-home-status]').hidden", 15000);
  assert.equal(await b.evaluate("document.querySelector('[data-work-surface=issues]').dataset.uiClientState"), "failed");
});

test("FSS-20 FSS-37 a frame still opening when Settings changes the language draws all its words before running the plugin", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  const child = await pluginFrameBrowser(t, b, "issues");
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/locale?lang=zh&next=%2Fplugins%2Fissues" }, b.sessionId));
  await child.waitFor("document.querySelector('[data-issues=workbench]')?.dataset.ready === 'true'");
  await child.evaluate(`(() => {
    const draft = document.querySelector('[data-issue-composer] textarea');
    draft.value = '原文 from a previous opening'; draft.dispatchEvent(new Event('input', {bubbles:true}));
  })()`);
  await b.waitFor("Object.values(localStorage).includes('原文 from a previous opening')");
  const { entered, finish } = holdIssueOpening(t, b);
  await b.reloadPage();
  await entered.promise;
  await child.waitFor("document.documentElement.lang === 'zh-CN' && typeof t === 'undefined'");
  assert.match(await child.evaluate<string>("document.querySelector('[data-issue-composer] textarea').placeholder"), /遇到什么问题/u);
  await chooseEnglishInSettings(t, b);
  await b.waitFor("document.documentElement.lang === 'en'", 25000);
  assert.equal(await child.evaluate("typeof t"), "undefined", "the first srcdoc still waits for its own authorized response");
  finish.resolve();
  await child.waitFor("document.querySelector('[data-issues=workbench]')?.dataset.ready === 'true'");
  const result = await child.evaluate<string[]>(`[
    document.documentElement.lang,
    document.querySelector('[data-issue-composer] textarea').placeholder,
    document.querySelector('[data-issue-composer] textarea').value,
    t.text('issues.when.minutes-ago', {count:3})
  ]`);
  assert.deepEqual(result, ["en", "What went wrong? Write it here, or paste a screenshot", "原文 from a previous opening", "3 minutes ago"]);
});
