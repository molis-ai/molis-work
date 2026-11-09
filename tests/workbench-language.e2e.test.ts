import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { hostTextProblems, pluginPagesFor, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { format } from "@molis-ai/molis-work-plugin-sdk/ui";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { deferred } from "./fixtures/home-runtime.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

test("FSS-20 FSS-34 FSS-39 the settings language changes in place; rejected and late preparations leave the current document intact", { timeout: 120_000 }, async t => {
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
      if (preview === 'en' && languageMode === 'wrong-asset') return fetch(url, init).then(async response => {
        const body = (await response.text()).replace(/workbench\\.en\\.[a-f0-9]{24}\\.js/, 'workbench.en.000000000000000000000000.js');
        return new Response(body, { status: response.status, headers: response.headers });
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

  // English has already been cached. A different resource named by the new render still has to load.
  await select("zh");
  await waitFor("document.documentElement.lang === 'zh-CN' && languageAttempts.length === 3");
  await evaluate("languageMode = 'wrong-asset'");
  await select("en");
  await waitFor("document.querySelector('[data-ui-language-status] button')");
  assert.deepEqual(await evaluate("[document.documentElement.lang, originalDocument === document.body, languageDraft.value, languageAttempts]"),
    ["zh-CN", true, "Draft 原文 保存", ["zh", "en", "zh"]]);
  await evaluate("languageMode = 'ready'; document.querySelector('[data-ui-language-status] button').click()");
  await waitFor("document.documentElement.lang === 'en' && !document.querySelector('[data-ui-language-status]')");
});

const ISSUE_OWNER = "io.molis.work.issues";

type LanguageBrowser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;

async function chooseEnglishInSettings(t: TestContext, b: LanguageBrowser) {
  const { targetId } = await b.command<{ targetId: string }>("Target.createTarget", { url: "about:blank", background: true });
  t.after(async () => { await b.command("Target.closeTarget", { targetId }).catch(() => undefined); });
  const { sessionId } = await b.command<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
  const path = "/settings/appearance", navigations: string[] = [];
  const stop = b.on("Page.frameNavigated", (event, session) => {
    const frame = event.frame as { url?: string; parentId?: string };
    if (session === sessionId && !frame.parentId && frame.url) navigations.push(frame.url);
  });
  t.after(stop);
  await b.command("Page.enable", {}, sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + path }, sessionId), sessionId);
  const evaluate = async <T>(expression: string): Promise<T> => {
    const answer = await b.command<{ result: { value: T }; exceptionDetails?: unknown }>("Runtime.evaluate", {
      expression, awaitPromise: true, returnByValue: true,
    }, sessionId, 16000);
    assert.equal(answer.exceptionDetails, undefined, JSON.stringify(answer.exceptionDetails));
    return answer.result.value;
  };
  const [address, request, text, settings] = await evaluate<[string, string, string, boolean]>(
    "[location.href, typeof molisWorkRequest, typeof t, !!document.querySelector('a[data-ui-language=en]')]");
  assert.equal(new URL(address).origin, b.origin);
  assert.deepEqual([request, text, settings], ["function", "function", true]);
  assert.ok(navigations.length > 0);
  const location = new URL(address), navigation = new URL(navigations.at(-1)!);
  assert.deepEqual([location.origin, location.pathname], [navigation.origin, navigation.pathname]);
  const opened = navigations.slice(); // The project cover can set settingsPath with replaceState in this same document.
  await evaluate("window.languageSettingsDocument = document.body; document.querySelector('a[data-ui-language=en]').click()");
  try {
    assert.equal(await evaluate(`(async () => {
      const stop = Date.now() + 15000;
      while (Date.now() < stop) {
        if (document.documentElement.lang === 'en') return languageSettingsDocument === document.body;
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      return false;
    })()`), true);
    assert.deepEqual(navigations, opened, "the click was handled in the Settings document");
  } catch (error) {
    t.diagnostic(JSON.stringify({ settingsNavigations: navigations }));
    throw error;
  }
}

function holdIssueOpening(t: TestContext, b: LanguageBrowser) {
  const authority = pluginPagesFor(b.homeDirectory), open = authority.open.bind(authority);
  const entered = deferred(), finish = deferred();
  t.after(finish.resolve);
  t.mock.method(authority, "open", (...[plugin, project, actor, scope, ...options]: Parameters<typeof open>) =>
    open(plugin, project, actor, plugin === ISSUE_OWNER ? async () => { await scope?.(); entered.resolve(); await finish.promise; } : scope, ...options));
  return { entered, finish };
}

test("FSS-09 FSS-20 FSS-34 FSS-37 the live Issue frame reuses its own authorized projection and retains the draft", { timeout: 120_000 }, async t => {
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
  // A trusted fixture uses HTML en and German Intl conventions. The current frame grant and the rest of the words are real.
  const described = Promise.withResolvers<void>();
  void described.promise.catch(() => undefined);
  await b.command("Fetch.enable", { patterns: [{ urlPattern: "*/assets/locale/workbench.en.*.js", requestStage: "Response" }] }, b.sessionId);
  t.after(b.on("Fetch.requestPaused", (event, session) => {
    if (session !== b.sessionId) return;
    void (async () => {
      const requestId = String(event.requestId);
      const result = await b.command<{ body: string; base64Encoded: boolean }>("Fetch.getResponseBody", { requestId }, session);
      const source = result.base64Encoded ? Buffer.from(result.body, "base64").toString("utf8") : result.body;
      const marker = "\nglobalThis.molisWorkLanguageAsset(", start = source.lastIndexOf(marker) + marker.length;
      assert.ok(start >= marker.length);
      const asset = JSON.parse(source.slice(start, source.lastIndexOf(");")));
      asset.catalog.languages.find((row: { tag: string }) => row.tag === "en").intl = "de-DE";
      const body = source.slice(0, start) + JSON.stringify(asset).replaceAll("<", "\\u003c") + ");";
      await b.command("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "content-type", value: "text/javascript; charset=utf-8" }],
        body: Buffer.from(body).toString("base64") }, session);
      described.resolve();
    })().catch(described.reject);
  }));
  await b.evaluate(`(() => {
    window.liveIssueFrame = document.querySelector('iframe[data-plugin-frame=issues]'); window.wordsRequests = [];
    const transport = window.molisWorkUiTransport;
    window.molisWorkUiTransport = (url, init) => {
      const path = new URL(url);
      if (path.pathname === '/api/ui/locales') {
        wordsRequests.push([path.searchParams.get('locale'), path.searchParams.getAll('page').length]);
        if (path.searchParams.get('locale') === 'en') return fetch(url, init).then(async response => {
          if (!response.ok) return response;
          const body = await response.json(); body.language.intl = 'de-DE';
          return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
        });
      }
      return transport?.(url, init);
    };
  })()`);
  await chooseEnglishInSettings(t, b);
  await b.waitFor("document.documentElement.lang === 'en'", 25000);
  await described.promise;
  await child.waitFor("document.documentElement.lang === 'en' && issuedDraft.placeholder.startsWith('What went wrong')", 10000);
  assert.deepEqual(await b.evaluate("[liveIssueFrame === document.querySelector('iframe[data-plugin-frame=issues]'), wordsRequests]"), [true, [["en", 1]]]);
  assert.deepEqual(await child.evaluate("[issuedDraft === document.querySelector('[data-issue-composer] textarea'), document.activeElement === issuedDraft, issuedDraft.value, issuedDraft.selectionStart, issuedDraft.selectionEnd, issuedDraft.selectionDirection]"), [true, true, "Issue draft 原文", 1, 5, "backward"]);
  assert.deepEqual(await child.evaluate("[t.text('issues.when.minutes-ago',{count:1}),t.text('issues.when.minutes-ago',{count:3})]"), ["1 minute ago", "3 minutes ago"]);
  const numbers = "[format.date('2026-05-09T14:30:00Z','time',{time_zone:'UTC'}),format.number(1234.5)]";
  assert.deepEqual(await b.evaluate(numbers), ["14:30", "1.234,5"]);
  assert.deepEqual(await child.evaluate(numbers), ["14:30", "1.234,5"], "FSS-39: the child formats with Intl, not the HTML language");
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

test("S-ui-text-page FSS-37 Coding receives only the words of its actual embedded Git and Files instances", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b) return;
  const child = await pluginFrameBrowser(t, b, "coding");
  const route = "/projects/" + b.projectId + "/?openPlugin=coding";
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/locale?lang=zh&next=" + encodeURIComponent(route) }, b.sessionId));
  await child.waitFor("typeof t === 'function'", 25000);
  assert.deepEqual(await child.evaluate("[!!document.querySelector('[data-coding-workbench]'), !!document.querySelector('[data-git-browser]'), !!document.querySelector('[data-files-browser]')]"), [true, true, true]);
  const words = "[t.text('git.commit.submit'),t.text('files.reader.copy'),t.text('issues.when.minutes-ago',{count:1})]";
  assert.deepEqual(await child.evaluate(words), ["提交…", "复制全文", "这句话暂时显示不了"]);
  await chooseEnglishInSettings(t, b);
  await child.waitFor("document.documentElement.lang === 'en'", 25000);
  assert.deepEqual(await child.evaluate(words), ["Commit…", "Copy all", "This text cannot be shown right now"]);
  await child.evaluate("document.querySelector('[data-coding-face=files]').click()");
  await child.waitFor("!document.querySelector('[data-git-browser]').hidden && !document.querySelector('[data-git-refresh]').disabled");
  await b.evaluate(`(() => {
    const transport = window.molisWorkUiTransport;
    window.finishCompanionReads = [];
    window.molisWorkUiTransport = (url, init) => {
      if (new URL(url).pathname.endsWith("/api/host/plugin-page-actions") && ["git.state", "files.state"].includes(JSON.parse(init.body).reference?.capability_id)) {
        return new Promise(resolve => window.finishCompanionReads.push(() => resolve(transport(url, init))));
      }
      return transport(url, init);
    };
  })()`);
  try {
    await child.evaluate("document.querySelector('[data-git-refresh]').click(); document.querySelector('[data-files-refresh]').click()");
    await b.waitFor("finishCompanionReads.length >= 2");
    assert.deepEqual(await child.evaluate("[document.querySelector('[data-git-status]').textContent, document.querySelector('[data-files-status]').textContent, document.querySelector('[data-files-copy]').textContent]"),
      ["Reading Git…", "Reading the workspace…", "Copy all"], "the actual Git and Files client listeners consume their own words");
  } finally { await b.evaluate("finishCompanionReads.splice(0).forEach(finish => finish())"); }
});

test("FSS-20 FSS-37 the Workbench and its inline Goals share a language change without replacing a draft", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b) return;
  const problemsBefore = new Set(hostTextProblems());
  const route = "/projects/" + b.projectId + "/?openPlugin=goals";
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/locale?lang=zh&next=" + encodeURIComponent(route) }, b.sessionId));
  await b.waitFor("typeof t === 'function' && document.querySelector('[data-open-create] span')");
  const projection = await b.evaluate("JSON.parse(document.querySelector('script[data-ui-page-text]')?.textContent || '[]').map(row => [row.slot,row.packs.map(pack => pack.owner)])");
  assert.deepEqual(projection, [["project:goals", ["io.molis.work.goals"]]]);
  assert.equal(await b.evaluate("t.text('goals.tree-ui.new-goal')"), "新建 Goal");
  assert.equal(await b.evaluate("t.text('git.commit.submit')"), "这句话暂时显示不了", "an opaque client's words do not enter the shell");
  await b.evaluate("document.querySelector('[data-open-create]').click()");
  await b.waitFor("document.querySelector('dialog[open] input.create-compose-title')");
  await b.evaluate(`(() => {
    const field = window.goalDraft = document.querySelector('dialog[open] input.create-compose-title');
    window.goalNewLabel = document.querySelector('[data-open-create] span');
    field.value = 'Original 目标'; field.focus(); field.setSelectionRange(1, 5, 'backward');
    field.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await chooseEnglishInSettings(t, b);
  await b.waitFor("document.documentElement.lang === 'en'", 25000);
  assert.deepEqual(await b.evaluate("[goalNewLabel.textContent.trim(), goalNewLabel === document.querySelector('[data-open-create] span'), goalDraft === document.activeElement, goalDraft.value, goalDraft.selectionStart, goalDraft.selectionEnd, goalDraft.selectionDirection, t.text('goals.tree-ui.new-goal')]"),
    ["New Goal", true, true, "Original 目标", 1, 5, "backward", "New Goal"]);
  assert.deepEqual([...new Set(hostTextProblems().filter(problem => !problemsBefore.has(problem)).map(problem => problem.key ?? problem.code))], [], "the real Host rendered every visible owner without missing text");
});

test("FSS-20 FSS-34 FSS-37 the catalog and capsule switch their existing documents without saving a Home preference", { timeout: 120_000 }, async t => {
  const problemsBefore = new Set(hostTextProblems());
  const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b) return;
  const { command, sessionId, origin, waitFor, evaluate } = b;
  await b.navigate(() => command("Page.navigate", { url: origin + "/locale?lang=zh&next=%2F__ui%2Fcatalog%3Flang%3Dzh" }, sessionId));
  await waitFor("typeof molisWorkSelectLocalLanguage === 'function' && document.querySelector('[data-board-lang=en]')");
  const first = await evaluate("document.documentElement.lang");
  assert.equal(first, "zh-CN");
  await evaluate("window.catalogHeading = document.querySelector('h1'); document.querySelector('[data-board-lang=en]').click()");
  await waitFor("document.documentElement.lang === 'en'");
  assert.deepEqual(await evaluate("[catalogHeading === document.querySelector('h1'), catalogHeading.textContent.trim(), document.querySelector('[data-board-lang=en]').getAttribute('aria-pressed')]"),
    [true, "Molis Work Component catalog", "true"]);
  assert.match(await evaluate<string>("document.cookie"), /molis_work_locale=zh/u);

  await b.navigate(() => command("Page.navigate", { url: origin + "/desktop/capsule?locale=zh" }, sessionId));
  await waitFor("typeof molisWorkSelectCapsuleLanguage === 'function' && document.querySelector('[data-capsule-open-board]')");
  await evaluate(`(() => {
    window.capsuleButton = document.querySelector('[data-capsule-open-board]');
    window.capsuleProject = document.querySelector('[data-capsule-project]').value;
    molisWorkSelectCapsuleLanguage({ tag: 'en', html_lang: 'zh-CN', direction: 'ltr' }, 99);
    molisWorkSelectCapsuleLanguage({ tag: 'en', html_lang: 'en', direction: 'ltr' }, 2);
    molisWorkSelectCapsuleLanguage({ tag: 'zh', html_lang: 'zh-CN', direction: 'ltr' }, 1);
  })()`);
  await waitFor("document.documentElement.lang === 'en' && document.documentElement.dataset.uiNativeLanguageRevision === '2'");
  assert.deepEqual(await evaluate("[capsuleButton === document.querySelector('[data-capsule-open-board]'), capsuleButton.textContent.trim(), capsuleProject === document.querySelector('[data-capsule-project]').value]"),
    [true, "Open Molis Work", true]);
  assert.match(await evaluate<string>("document.cookie"), /molis_work_locale=zh/u);
  assert.deepEqual([...new Set(hostTextProblems().filter(problem => !problemsBefore.has(problem)).map(problem => problem.key ?? problem.code))], [], "the real catalog and capsule rendered their words from the exact packs");
});

test("FSS-20 FSS-38 FSS-74 a signed Studio installation switches its words in the same frame and keeps draft and record data", { timeout: 120_000, skip: process.platform !== "darwin" }, async t => {
  const { mkdtemp, rm } = await import("node:fs/promises"), { tmpdir } = await import("node:os"), { join } = await import("node:path");
  const { readyPublication } = await import("./fixtures/studio-publishing.js"), { studioBilingualLiteralNotes, literalStudioExcerpt } = await import("./fixtures/studio-bilingual.js");
  const { readStudioDistribution } = await import("@molis-ai/molis-work-app-local-host");
  const { sandboxPackageBuildId } = await import("@molis-ai/molis-work-plugin-sdk");
  const author = await mkdtemp(join(tmpdir(), "molis-studio-browser-author-")), h = readyPublication(author, "author", "project", candidate => {
    const design = studioBilingualLiteralNotes(candidate);
    design.presentation = { version: 1, pages: [{ pageId: "home", layout: { layout: "stack", children: design.parts.map(part => ({ part: part.id })) } }],
      parts: { notes: { detail: true } } };
    return design;
  });
  t.after(async () => { await h.workflow.close(); await rm(author, { recursive: true, force: true }); });
  const release = await h.publish(), bundle = await readStudioDistribution(h.root, release);
  const plugin = release.pluginId, surface = "app-" + sandboxPackageBuildId(plugin, bundle.payload.manifest.publisher.signature);
  const b = await openGoalBrowser(t, "user", undefined, null); if (!b) return;
  const prefix = "/projects/" + b.projectId, source = prefix + "/plugins/" + plugin + "?frame=workbench", requests: string[] = [];
  b.server!.on("request", request => { if (request.headers.accept === "application/json" && request.url === source) requests.push(source); });
  const child = await pluginFrameBrowser(t, b, surface);
  await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] }, b.sessionId);
  const navigate = (path: string) => b.navigate(() => b.command("Page.navigate", { url: b.origin + path }, b.sessionId));
  await navigate("/locale?lang=zh&next=" + encodeURIComponent(prefix + "/"));
  await b.waitFor("typeof molisWorkRequest === 'function'");
  await b.evaluate(`(async()=>{const bundle=${JSON.stringify(bundle)};
    const pending=await molisWorkRequest(${JSON.stringify(prefix + "/api/plugin-trust/install/preview")},{body:{bundle}});
    await molisWorkRequest(${JSON.stringify(prefix + "/api/plugin-trust/install/confirm")},{body:{preview_id:pending.preview_id,consent:true,pin_label:"Isolated Studio publisher"}});
  })()`);
  const noProof = await b.evaluate<number>(`fetch(${JSON.stringify(source)}, {headers:{accept:"application/json"}}).then(response=>response.status)`);
  assert.ok(noProof >= 400, "a credentialless projection cannot mint a page grant");
  requests.length = 0;
  await navigate(prefix + "/?openSurface=" + encodeURIComponent(surface));
  const frame = `iframe[data-plugin-frame=${JSON.stringify(surface)}]`;
  await b.waitFor(`!!document.querySelector(${JSON.stringify(frame)})`, 15000);
  await child.waitFor("globalThis.__molisPluginReady === true");
  assert.deepEqual(await child.evaluate(`[document.querySelector("h1").textContent,document.querySelector(".pc-region").getAttribute("aria-label"),
    document.querySelector('[data-pc-description]').textContent, document.querySelector('[data-field=text]').closest('label').querySelector('.mw-field__label').textContent,
    document.querySelector('[data-field=text]').placeholder,document.querySelector('[type=submit]').textContent,document.querySelector('[data-pc-value=personal]').textContent]`),
  ["读书摘记", literalStudioExcerpt, literalStudioExcerpt, "摘录正文", "保留引文", "保存摘记", "个人"]);
  await child.evaluate(`(() => { const field=document.querySelector('[data-field=text]');field.value='保存摘记';field.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('[data-pc-value=personal]').click();field.form.requestSubmit(); })()`);
  await child.waitFor("document.querySelector('[data-record-id]')?.innerText.includes('保存摘记')");
  await child.click("[data-record-id] [data-pc-select]");
  await child.waitFor("document.querySelector('[data-detail-open] .pc-detail-meta span')?.textContent === '可见范围 · 个人'");
  await child.evaluate(`(() => {const field=window.savedStudioField=document.querySelector('[data-field=text]');window.savedStudioBody=document.body;
    window.savedStudioDetail=document.querySelector('[data-detail-open] .pc-detail-pane');window.savedStudioDetailWord=savedStudioDetail.querySelector('.pc-detail-meta span');
    window.savedStudioExcerpt=document.querySelector('[data-pc-description]');
    field.value='unfinished 摘录';field.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-pc-value=team]').click();
    field.focus();field.setSelectionRange(1,6,'backward');})()`);
  const opened = await b.evaluate<string>(`document.querySelector(${JSON.stringify(frame)}).parentElement.dataset.pluginPage`);
  assert.ok(opened);
  await chooseEnglishInSettings(t, b);
  await child.waitFor("document.documentElement.lang === 'en' && document.querySelector('h1').textContent === 'Reading notes'");
  assert.deepEqual(await child.evaluate(`[savedStudioBody===document.body,savedStudioField===document.querySelector('[data-field=text]'),document.activeElement===savedStudioField,
    savedStudioField.value,savedStudioField.selectionStart,savedStudioField.selectionEnd,savedStudioField.selectionDirection,document.querySelector('[data-field=access]').value,
    document.querySelector(".pc-region").getAttribute("aria-label"),savedStudioExcerpt===document.querySelector('[data-pc-description]'),savedStudioExcerpt.textContent,
    savedStudioField.closest('label').querySelector('.mw-field__label').textContent,savedStudioField.placeholder,document.querySelector('[type=submit]').textContent,
    document.querySelector('[data-pc-value=personal]').textContent,document.querySelector('[data-record-id]').innerText.includes('保存摘记')]`),
  [true, true, true, "unfinished 摘录", 1, 6, "backward", "team", literalStudioExcerpt, true, literalStudioExcerpt, "Excerpt text", "Keep the quotation", "Save excerpt", "Personal", true]);
  assert.deepEqual(await child.evaluate(`[savedStudioDetail===document.querySelector('[data-detail-open] .pc-detail-pane'),
    savedStudioDetailWord===savedStudioDetail.querySelector('.pc-detail-meta span'),savedStudioDetailWord.textContent,savedStudioDetail.querySelector('h2').textContent]`),
  [true, true, "Visibility · Personal", "保存摘记"]);
  assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(frame)}).parentElement.dataset.pluginPage`), opened);
  assert.deepEqual(requests, [source], "language preparation did not mint or re-open a release");
  const beforeLook = await child.evaluate<string[]>("['--page','--font'].map(name=>getComputedStyle(document.documentElement).getPropertyValue(name).trim())");
  const { randomUUID } = await import("node:crypto");
  const selectLook = (expected_revision: number, font: { policy: "follow-skin" } | { policy: "pinned"; scheme: { id: string; revision: number } }) => b.evaluate(
    `molisWorkRequest('/api/ui/appearance',${JSON.stringify({ body: { request_id: randomUUID(), expected_revision,
      choice: { kind: "selection", selection: { skin: { id: "folio", revision: 1 }, font, mono: null } } } })})`);
  await selectLook(0, { policy: "follow-skin" });
  await child.waitFor("document.documentElement.dataset.uiSkin === 'folio@1' && /Nunito Variable/u.test(getComputedStyle(document.documentElement).getPropertyValue('--font'))");
  const folioLook = await child.evaluate<string[]>("['--page','--font'].map(name=>getComputedStyle(document.documentElement).getPropertyValue(name).trim())");
  assert.equal(folioLook[0], "#f4ede2"); assert.notDeepEqual(folioLook, beforeLook);
  await selectLook(1, { policy: "pinned", scheme: { id: "system-sans", revision: 1 } });
  await child.waitFor("document.documentElement.dataset.uiFont === 'system-sans@1' && /system-ui/u.test(getComputedStyle(document.documentElement).getPropertyValue('--font'))");
  const finalLook = await child.evaluate<string[]>("['--page','--font'].map(name=>getComputedStyle(document.documentElement).getPropertyValue(name).trim())");
  assert.equal(finalLook[0], folioLook[0]); assert.notEqual(finalLook[1], folioLook[1]);
  assert.deepEqual(await child.evaluate("[savedStudioBody===document.body, savedStudioField.value,savedStudioField.selectionStart,savedStudioField.selectionEnd,document.querySelector('[data-record-id]').innerText.includes('保存摘记')]"),
    [true, "unfinished 摘录", 1, 6, true]);
  assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(frame)}).parentElement.dataset.pluginPage`), opened);
  const wrongProject = `/api/ui/locales?locale=en&page=${encodeURIComponent(opened)}`;
  const refused = await b.evaluate<number>(`molisWorkRequest(${JSON.stringify(wrongProject)}, {control:true}).then(()=>200,error=>error.status)`);
  assert.equal(refused, 403, "a project grant cannot be read from the Home route");
  await b.evaluate(`document.querySelector(${JSON.stringify(frame)}).parentElement.remove()`);
  const batch = `${prefix}/api/ui/locales?locale=en&page=${encodeURIComponent(opened)}`;
  await b.waitFor(`window.closedStudioGrant === true || (window.closedStudioGrant === undefined && (window.closedStudioGrant = false,molisWorkRequest(${JSON.stringify(batch)}, {control:true}).then(()=>window.closedStudioGrant=undefined,error=>window.closedStudioGrant=error.status===403),false))`);
});

test("FSS-20 FSS-74 the Studio canvas switches the current and previous design's own words in place", { timeout: 100_000 }, async t => {
  const { mkdtemp, rm } = await import("node:fs/promises"), { tmpdir } = await import("node:os"), { join } = await import("node:path");
  const { readyPublication } = await import("./fixtures/studio-publishing.js"), { studioBilingualNotes } = await import("./fixtures/studio-bilingual.js");
  const author = await mkdtemp(join(tmpdir(), "molis-studio-history-author-")), h = readyPublication(author, "author", "project", studioBilingualNotes);
  t.after(async () => { await h.workflow.close(); await rm(author, { recursive: true, force: true }); });
  const { directory: _directory, ...build } = structuredClone(h.build);
  const before = structuredClone(build.design!);
  const heading = before.parts.find(part => part.id === "title")!.props.title!;
  assert.ok(typeof heading !== "string" && "key" in heading);
  const en = before.localePacks!.find(pack => pack.locale === "en")!;
  Object.assign(en.messages, { [heading.key]: "Earlier reading notes" });
  build.history.push({ design: before, nodes: build.nodes, connected: build.connected });
  build.phase = "paused";
  const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b) return;
  const prefix = "/projects/" + b.projectId + "/api/plugin-builder/studio";
  await b.command("Page.addScriptToEvaluateOnNewDocument", { source: `{
    const original = fetch.bind(window), prefix = ${JSON.stringify(prefix)}, build = ${JSON.stringify(build)};
    window.fetch = async (input, options) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.origin !== location.origin || !url.pathname.startsWith(prefix)) return original(input, options);
      const route = url.pathname.slice(prefix.length);
      if (route === '/state') { const state = await (await original(input, options)).json(); return Response.json({...state,builds:[build]}); }
      if (route === '/builds/' + build.id) return Response.json({build,versions:[]});
      if (route === '/builds/' + build.id + '/events') return new Response(null,{status:204});
      if (route === '/builds/' + build.id + '/call') return Response.json({value:[]});
      return original(input, options);
    };
  }` }, b.sessionId);
  const child = await pluginFrameBrowser(t, b, "plugin-builder");
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/locale?lang=zh&next=" +
    encodeURIComponent("/projects/" + b.projectId + "/?openPlugin=plugin-builder") }, b.sessionId));
  await child.click(`[data-as-open="${build.id}"]`);
  await child.waitFor("document.querySelector('[data-as-plugin] h1')?.textContent === '读书摘记'");
  await child.evaluate(`(()=>{const root=window.studioCanvas=document.querySelector('[data-as-plugin]'),field=window.studioCanvasField=root.querySelector('[data-field=text]');
    field.value='Canvas 草稿';field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();field.setSelectionRange(1,5,'backward');})()`);
  await chooseEnglishInSettings(t, b);
  await child.waitFor("studioCanvas.querySelector('h1')?.textContent === 'Reading notes'");
  assert.deepEqual(await child.evaluate(`[studioCanvas===document.querySelector('[data-as-plugin]'),studioCanvasField===studioCanvas.querySelector('[data-field=text]'),
    studioCanvasField.value,studioCanvasField.selectionStart,studioCanvasField.selectionEnd,studioCanvasField.selectionDirection,document.activeElement===studioCanvasField,
    studioCanvasField.placeholder,studioCanvas.querySelector('[type=submit]').textContent,studioCanvas.querySelector('[data-pc-value=personal]').textContent]`),
  [true,true,"Canvas 草稿",1,5,"backward",true,"Keep the quotation","Save excerpt","Personal"]);
  await child.click("[data-as-compare]");
  await child.waitFor("studioCanvas.querySelector('h1')?.textContent === 'Earlier reading notes'");
  assert.equal(await child.evaluate("studioCanvas.inert"), true);
  await child.click("[data-as-compare]");
  await child.waitFor("studioCanvas.querySelector('h1')?.textContent === 'Reading notes'");
  assert.deepEqual(await child.evaluate("[studioCanvas.inert,studioCanvasField.value]"), [false,"Canvas 草稿"]);
});
