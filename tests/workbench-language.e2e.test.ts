import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ASSISTANT_STORE_NAME, AssistantStore, hostTextProblems, pluginPagesFor, projectDeletedHooksFor, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { escapeHtml, format, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { deferred } from "./fixtures/home-runtime.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { renderAgentReviewRecovery, renderAgentReviewSurface } from "@molis-ai/molis-work-app-workbench";
import type { AgentReviewRecoveryView, AgentReviewRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";

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
    const dynamic = document.createElement('div'); dynamic.id = 'locale-collision-fixture';
    const fixed = ['common.control.done', 'common.generated.done'].map(key => {
      const button = document.createElement('button'); button.type = 'button'; button.title = t.text(key); button.append(t.text(key));
      dynamic.append(button); return button;
    });
    const original = document.createElement('span'); original.translate = false; original.append('完成'); dynamic.append(original);
    draft.after(dynamic);
    window.collisionWords = () => fixed.map(button => [button.textContent, button.title]).concat([[original.textContent, original.translate]]);
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
  const originalWords = [["完成", "完成"], ["已完成", "已完成"], ["完成", false]];
  assert.deepEqual(await evaluate("collisionWords()"), originalWords);
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
  assert.deepEqual(await evaluate("collisionWords()"), [["Done", "Done"], ["Done", "Done"], ["完成", false]]);
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
  assert.deepEqual(await evaluate("collisionWords()"), originalWords, "each live text and title keeps its own key when the translations collide");
  await evaluate("languageMode = 'wrong-asset'");
  await select("en");
  await waitFor("document.querySelector('[data-ui-language-status] button')");
  assert.deepEqual(await evaluate("[document.documentElement.lang, originalDocument === document.body, languageDraft.value, languageAttempts]"),
    ["zh-CN", true, "Draft 原文 保存", ["zh", "en", "zh"]]);
  await evaluate("languageMode = 'ready'; document.querySelector('[data-ui-language-status] button').click()");
  await waitFor("document.documentElement.lang === 'en' && !document.querySelector('[data-ui-language-status]')");
});

test("FSS-36 an open missed follow-up notice keeps its original label and time through both language changes", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b?.projectId) return;
  const text = { owner: "workbench", key: "workbench.assistant-notice.followup-missed", args: [
    { name: "label", kind: "text", text: "原始提醒 <raw>" },
    { name: "at", kind: "date", at: "2026-03-08T10:00:37.000Z", style: "datetime", time_zone: "America/Los_Angeles" },
  ] } as const;
  const db = openHomeSqliteDatabase(b.homeDirectory, ASSISTANT_STORE_NAME);
  const notices = new AssistantStore(db);
  t.after(() => db.close());
  const notice = notices.raiseNotice(LOCAL_PERSON_ACTOR_ID, { kind: "failed", work_id: "", work_title: "原始提醒 <raw>", text }, "fixture:followup-missed-language");
  assert.ok(notice);
  const path = `/projects/${b.projectId}/`;
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/locale?lang=en&next=" + encodeURIComponent(path) }, b.sessionId));
  await b.waitFor("document.querySelector('[data-assistant-attention]')?.hidden === false");
  await b.click("[data-assistant-attention]");
  const dismiss = `[data-notice-id=${JSON.stringify(notice.notice_id)}][data-notice-action=dismiss]`;
  await b.waitFor(`document.querySelector(${JSON.stringify(dismiss)})?.getClientRects().length`);
  await b.evaluate(`(() => {
    window.missedDismiss = document.querySelector(${JSON.stringify(dismiss)}); missedDismiss.focus();
    window.missedRow = missedDismiss.closest('.assistant-notice'); window.missedText = missedRow.querySelector('.assistant-notice-text').firstChild;
    window.missedWrites = []; const fetchOriginal = window.fetch;
    window.fetch = (input, init) => {
      if (String(input?.url || input).includes('/api/assistant/notices') && (init?.method || input?.method || 'GET') !== 'GET') missedWrites.push(init?.method);
      return fetchOriginal(input, init);
    };
  })()`);
  const english = /“原始提醒 <raw>” missed its scheduled time at .*3:00:37\sAM/u;
  assert.match(await b.evaluate<string>("missedText.data"), english);
  const select = (tag: "zh" | "en") => b.evaluate(`(() => { const link = document.createElement('a'); link.dataset.uiLanguage = '${tag}';
    link.href = '/locale?lang=${tag}'; document.body.append(link); link.click(); link.remove(); })()`);
  for (const [tag, words] of [["zh", /错过了「原始提醒 <raw>」.*03:00:37/u], ["en", english]] as const) {
    await select(tag);
    await b.waitFor(`document.documentElement.dataset.uiLanguageTag === '${tag}'`);
    assert.match(await b.evaluate<string>("missedText.data"), words);
    assert.deepEqual(await b.evaluate(`[document.querySelector(${JSON.stringify(dismiss)})===missedDismiss, document.activeElement===missedDismiss,
      missedRow.querySelector('.assistant-notice-text').firstChild===missedText, !!missedDismiss.getClientRects().length, missedWrites]`), [true, true, true, true, []]);
  }
  assert.deepEqual(notices.openNotices(LOCAL_PERSON_ACTOR_ID).find(row => row.notice_id === notice.notice_id)?.text, text);

  const lateLabel = "迟到提醒 <raw>";
  const late = notices.raiseNotice(LOCAL_PERSON_ACTOR_ID, { kind: "failed", work_id: "", work_title: lateLabel,
    text: { ...text, args: [{ ...text.args[0], text: lateLabel }, { ...text.args[1], at: "2026-03-08T10:00:39.000Z" }] } }, "fixture:late-followup-language");
  assert.ok(late);
  const lateDismiss = `[data-notice-id=${JSON.stringify(late.notice_id)}][data-notice-action=dismiss]`;
  await b.evaluate(`(() => {
    const fetchOriginal = window.fetch;
    window.fetch = (input, init) => {
      const path = new URL(String(input?.url || input), location.href).pathname;
      const response = fetchOriginal(input, init);
      if (path.endsWith('/api/attention') && !window.releaseLateAttention) return response.then(value => new Promise(resolve => {
        window.releaseLateAttention = () => resolve(value);
      }));
      if (path === '/api/ui/locale' && init?.method === 'POST') return response.then(value => new Promise(resolve => {
        window.releaseLatePreference = () => { window.fetch = fetchOriginal; resolve(value); };
      }));
      return response;
    };
    document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'));
  })()`);
  await b.waitFor("typeof releaseLateAttention === 'function'");
  await select("zh");
  await b.waitFor("typeof releaseLatePreference === 'function'");
  assert.equal(await b.evaluate("document.documentElement.lang"), "en");
  await b.evaluate("releaseLateAttention()");
  await b.waitFor(`document.querySelector(${JSON.stringify(lateDismiss)})?.getClientRects().length`);
  await b.evaluate(`(() => { window.lateDismiss = document.querySelector(${JSON.stringify(lateDismiss)}); lateDismiss.focus();
    window.lateText = lateDismiss.closest('.assistant-notice').querySelector('.assistant-notice-text').firstChild; })()`);
  assert.match(await b.evaluate<string>("lateText.data"), /“迟到提醒 <raw>” missed its scheduled time at .*3:00:39\sAM/u);
  await b.evaluate("releaseLatePreference()");
  await b.waitFor("document.documentElement.lang === 'zh-CN'");
  assert.match(await b.evaluate<string>("lateText.data"), /错过了「迟到提醒 <raw>」.*03:00:39/u);
  assert.deepEqual(await b.evaluate(`[document.querySelector(${JSON.stringify(lateDismiss)})===lateDismiss, document.activeElement===lateDismiss,
    lateDismiss.closest('.assistant-notice').querySelector('.assistant-notice-text').firstChild===lateText, missedWrites]`), [true, true, true, []]);
});

const ISSUE_OWNER = "io.molis.work.issues";

type LanguageBrowser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;

test("FSS-20 a late Feed document read leaves the committed language in the frame and its opening template", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b?.projectId) return;
  const feed = await pluginFrameBrowser(t, b, "feed"), path = `/projects/${b.projectId}/`;
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/locale?lang=zh&next=" + encodeURIComponent(path), }, b.sessionId));
  await b.click('[data-plugin-strip] [data-plugin-id=feed]');
  const search = `document.querySelector('[data-feed-search]')`;
  await feed.waitFor(`${search}?.getAttribute('aria-label') === '搜索消息' && typeof t === 'function'`);
  await feed.clientReady();
  await b.evaluate(`(() => {
    const fetchOriginal = window.fetch;
    window.feedReadReplies = []; window.feedChecks = 0; window.feedReads = 0;
    window.fetch = (input, init) => {
      const url = new URL(String(input?.url || input), location.href), response = fetchOriginal(input, init);
      if (url.pathname.endsWith('/api/plugins/io.molis.work.feed/view-revision')) return response.then(value => { feedChecks++; return value; });
      if (url.pathname !== ${JSON.stringify(path)} || (init?.method || 'GET') !== 'GET' || new Headers(init?.headers).has('x-molis-work-ui-locale')) return response;
      const index = feedReads++;
      return response.then(async value => {
        const language = new DOMParser().parseFromString(await value.clone().text(), 'text/html').documentElement.lang;
        return new Promise(resolve => { feedReadReplies[index] = { language, release: () => resolve(value) }; });
      });
    };
    document.querySelector('[data-work-surface=feed]').dispatchEvent(new CustomEvent('molis-work:select-item', { detail: { invalidate: true } }));
    window.feedOpeningName = () => {
      const template = document.createElement('template');
      template.innerHTML = JSON.parse(document.querySelector('[data-work-surface=feed] > script[data-plugin-document]').textContent);
      return template.content.querySelector('[data-feed-search]').getAttribute('aria-label');
    };
  })()`);
  await b.waitFor("feedReadReplies[0]?.language === 'zh-CN'");
  await b.evaluate(`(() => { const link = document.createElement('a'); link.dataset.uiLanguage = 'en';
    link.href = '/locale?lang=en'; document.body.append(link); link.click(); link.remove(); })()`);
  await b.waitFor("document.documentElement.lang === 'en' && feedReadReplies[1]?.language === 'en'");
  await feed.waitFor(`${search}.getAttribute('aria-label') === 'Search messages'`);
  assert.equal(await b.evaluate("feedOpeningName()"), "Search messages");
  const checks = await b.evaluate<number>("feedChecks");
  await b.evaluate("feedReadReplies[0].release()");
  await b.waitFor(`feedChecks > ${checks}`);
  assert.equal(await b.evaluate("new Promise(resolve => requestAnimationFrame(() => resolve(feedOpeningName())))"), "Search messages");
  assert.equal(await feed.evaluate(`${search}.getAttribute('aria-label')`), "Search messages");
  const freshChecks = await b.evaluate<number>("feedChecks");
  await b.evaluate("feedReadReplies[1].release()");
  await b.waitFor(`feedChecks > ${freshChecks}`);
  assert.equal(await b.evaluate("feedReads"), 2, "one prior read and one existing invalidation read");
});

test("FSS-36 a Feed detail checks the language of its own response after a withdrawn switch", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b?.projectId) return;
  const project = b.projectId, path = `/projects/${project}/`, title = "原始 Feed 标题 <raw>", body = "原始消息正文 · Original";
  const source = createLocalFeedSourceService(b.store.db, project).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "feed-detail-language" }).source;
  const library = createLocalFeedApplication(b.store.db);
  const { item } = library.ingestItem({ source, externalId: "read-before-language", title, summary: title, body, occurredAt: new Date().toISOString(), attention: false });
  library.markRead(project, item.item_id);
  const feed = await pluginFrameBrowser(t, b, "feed");
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/locale?lang=zh&next=" + encodeURIComponent(path) }, b.sessionId));
  await b.click('[data-plugin-strip] [data-plugin-id=feed]');
  const row = `[data-feed-entry-id][data-feed-item-id=${JSON.stringify(item.item_id)}]`;
  await feed.waitFor(`document.querySelector(${JSON.stringify(row)})?.dataset.feedEntryRead === 'read'`);
  await b.evaluate(`(() => {
    const fetchOriginal = window.fetch;
    window.detailLanguages = []; window.detailPreferences = []; window.detailWrites = [];
    window.fetch = (input, init) => {
      const path = new URL(String(input?.url || input), location.href).pathname, method = init?.method || 'GET';
      const response = fetchOriginal(input, init);
      if (path === '/api/ui/locale' && method === 'POST') {
        const preference = JSON.parse(init.body).preference;
        return response.then(value => {
          detailPreferences.push([preference, value.status]);
          if (preference === 'en') return new Promise(resolve => { window.releaseEnglishPreference = () => resolve(value); });
          return value;
        });
      }
      if (method !== 'GET' && path.includes('/api/plugins/io.molis.work.feed/')) detailWrites.push([method, path]);
      if (!path.endsWith('/api/stage/feed/objects/${item.item_id}')) return response;
      return response.then(value => {
        detailLanguages.push(value.headers.get('content-language'));
        if (detailLanguages.length === 1) return new Promise(resolve => { window.releaseEnglishDetail = () => resolve(value); });
        return value;
      });
    };
  })()`);
  const select = (tag: "zh" | "en") => b.evaluate(`(() => { const link = document.createElement('a'); link.dataset.uiLanguage = '${tag}';
    link.href = '/locale?lang=${tag}'; document.body.append(link); link.click(); link.remove(); })()`);
  await select("en");
  await b.waitFor("typeof releaseEnglishPreference === 'function'");
  await feed.click(row);
  await b.waitFor("typeof releaseEnglishDetail === 'function'");
  assert.deepEqual(await b.evaluate("detailLanguages"), ["en"], "this detail really was rendered in the withdrawn language");
  await select("zh");
  await b.evaluate("releaseEnglishPreference()");
  await b.waitFor("detailPreferences.some(([tag, status]) => tag === 'zh' && status === 200)");
  assert.equal(await feed.evaluate("document.documentElement.lang"), "zh-CN");
  await b.evaluate("releaseEnglishDetail()");
  const detail = `document.querySelector('[data-feed-detail]')`;
  await feed.waitFor(`${detail}?.querySelector('h1')?.textContent === ${JSON.stringify(title)} && ${detail}?.querySelector('[data-feed-read-state]')?.textContent === '已读'`);
  assert.match(await feed.evaluate<string>(`${detail}.textContent`), /原始消息正文 · Original/u);
  assert.deepEqual(await b.evaluate("[detailLanguages, detailPreferences, detailWrites]"), [["en", "zh-CN"], [["en", 200], ["zh", 200]], []]);
});

async function chooseEnglishInSettings(t: TestContext, b: LanguageBrowser, target: "zh" | "en" = "en") {
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
  const select = async (target: "zh" | "en") => {
    const opened = navigations.slice(); // The project cover can set settingsPath with replaceState in this same document.
    assert.equal(await evaluate(`(async () => {
      const stop = Date.now() + 15000;
      while (Date.now() < stop) {
        const control = [...document.querySelectorAll('a[data-ui-language=${target}]')].find(link => link.getClientRects().length);
        if (control) { window.languageSettingsDocument = document.body; control.click(); return true; }
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      return false;
    })()`), true, "the Settings control is visible");
    try {
      assert.equal(await evaluate(`(async () => {
        const stop = Date.now() + 15000;
        while (Date.now() < stop) {
          if (document.documentElement.dataset.uiLanguageTag === ${JSON.stringify(target)}) return languageSettingsDocument === document.body;
          await new Promise(resolve => setTimeout(resolve, 40));
        }
        return false;
      })()`), true);
      assert.deepEqual(navigations, opened, "the click was handled in the Settings document");
    } catch (error) {
      const status = await evaluate("[document.documentElement.lang, document.querySelector('[data-ui-language-status]')?.textContent ?? null]").catch(() => null);
      t.diagnostic(JSON.stringify({ settingsNavigations: navigations, status }));
      throw error;
    }
  };
  await select(target);
  return select;
}

test("FSS-35 FSS-36 the real project deletion dialog retitles its data scope without reading the output again or deleting", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b?.projectId) return;
  const prefix = "/projects/" + b.projectId, path = prefix + "/settings/general";
  let reads = 0, writes = 0;
  b.server!.on("request", (request, response) => {
    if (request.url?.endsWith("/delete-scope")) response.once("finish", () => { reads += 1; });
    if (request.url?.endsWith("/delete") && request.method === "POST") writes += 1;
  });
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/locale?lang=zh&next=" + encodeURIComponent(path) }, b.sessionId));
  const dialog = "document.querySelector('[data-project-delete-dialog]')";
  const words = dialog + ".querySelector('[data-project-delete-scope] span')";
  await b.waitFor("document.querySelector('[data-tab-workspace]')?.dataset.exclusive === 'project-settings' && document.querySelector('[data-project-delete-dialog]')?.dataset.bound === '1'");
  await b.click("[data-project-delete-open]");
  await b.waitFor(dialog + ".open && " + words + ".textContent.includes('Pages 文稿与文件夹')");
  await b.evaluate(`window.initialDelete=${dialog}; window.initialNames=${words}; window.deleteConfirm=initialDelete.querySelector('[name=delete_confirmed]');
    deleteConfirm.checked=true;deleteConfirm.dispatchEvent(new Event('change',{bubbles:true}));deleteConfirm.focus();`);
  const chooseLanguage = await chooseEnglishInSettings(t, b);
  try { await b.waitFor("document.documentElement.dataset.uiLanguageTag==='en' && " + words + ".textContent.includes('Pages documents and folders')"); }
  catch (error) { t.diagnostic(JSON.stringify(await b.evaluate(`[document.documentElement.lang,${words}.textContent,document.querySelector('[data-ui-language-status]')?.textContent]`))); throw error; }
  assert.deepEqual(await b.evaluate(`[initialDelete===${dialog},initialNames===${words},initialDelete.open,deleteConfirm.checked,
    document.activeElement===deleteConfirm,initialDelete.querySelector('button[type=submit]').disabled]`), [true, true, true, true, true, false]);
  assert.match(await b.evaluate<string>(words + ".textContent"), /Forms and every answer they received/u);
  assert.deepEqual([reads, writes], [1, 0], "language preparation only read the existing HTML");
  await b.click("[data-project-delete-cancel]");
  await chooseLanguage("zh");
  await b.waitFor("document.documentElement.dataset.uiLanguageTag==='zh' && !initialDelete.open && " + words + ".textContent.includes('Pages 文稿与文件夹')");
  assert.deepEqual([reads, writes], [1, 0], "the hidden dialog changed without querying the output");

  const output = join(b.homeDirectory, "outputs", b.projectId);
  await mkdir(output, { recursive: true });
  const file = join(output, "kept.txt");
  await writeFile(file, "User output 原文");
  // The live registry can add an owner after the Settings document was drawn. Its own words remain literal.
  t.after(projectDeletedHooksFor(b.homeDirectory).register({ id: "late-fixture", label: "Owner 原文", clear: () => assert.fail("switching languages cannot delete data") }));
  await b.evaluate(`(() => {
    const transport = window.molisWorkUiTransport;
    window.molisWorkUiTransport = (url, options) => {
      const path = new URL(url).pathname;
      const scope = options.method === 'GET' && path.endsWith('/delete-scope');
      const preference = options.method === 'POST' && path === '/api/ui/locale';
      if (!scope && !preference) return transport?.(url, options);
      return (transport?.(url, options) ?? fetch(url, options)).then(async response => {
        if (scope) window.lateDeleteScope = await response.clone().json();
        return new Promise(resolve => { window[scope ? 'releaseDeleteScope' : 'releaseDeletePreference'] = () => resolve(response); });
      });
    };
  })()`);
  await b.click("[data-project-delete-open]");
  await b.waitFor(dialog + ".open && typeof releaseDeleteScope === 'function'");
  assert.deepEqual(await b.evaluate(`[initialDelete===${dialog},initialNames===${words},deleteConfirm.checked]`), [true, true, false], "reopening performs the normal reset");
  assert.equal(await b.evaluate("lateDeleteScope.default_output"), "has_files");
  await b.evaluate(`(() => {
    // The same Settings language control event, in the document where the delete-scope request is pending.
    const link = document.createElement('a');
    link.dataset.uiLanguage = 'en'; link.href = '/locale?lang=en';
    initialDelete.append(link); link.click(); link.remove();
  })()`);
  await b.waitFor("typeof releaseDeletePreference === 'function' && document.documentElement.dataset.uiLanguageTag==='zh'");
  const question = "initialDelete.querySelector('[data-project-delete-output]')";
  const description = "initialDelete.querySelector('.runtime-plan-body > p[id]')";
  const submit = "initialDelete.querySelector('button[type=submit]')";
  await b.evaluate("releaseDeleteScope()");
  await b.waitFor(`!${question}.hidden && ${words}.textContent.includes('Owner 原文') && ${description}.textContent.includes('自己选的文件夹')`);
  await b.click("[data-project-delete-output] [data-ix-option=delete]");
  await b.evaluate(`window.deleteChoice=${question}.querySelector('[data-ix-option=delete]');deleteChoice.focus()`);
  assert.equal(await b.evaluate(submit + ".textContent"), "删除项目和文件");
  await b.evaluate("releaseDeletePreference()");
  await b.waitFor("document.documentElement.dataset.uiLanguageTag==='en'");
  assert.match(await b.evaluate<string>(words + ".textContent"), /Pages documents and folders.*Owner 原文/u);
  assert.match(await b.evaluate<string>(question + ".textContent"), /The default output folder still has files/u);
  assert.match(await b.evaluate<string>(description + ".textContent"), /Code and files in folders you chose stay/u);
  assert.deepEqual(await b.evaluate(`[initialDelete===${dialog},initialNames===${words},!${question}.hidden,
    deleteChoice.getAttribute('aria-checked'),document.activeElement===deleteChoice,${submit}.disabled,${submit}.textContent]`),
    [true, true, true, "true", true, false, "Delete the project and the files"]);
  assert.deepEqual([reads, writes], [2, 0], "each opening read the output once and language changes issued no deletes");
  assert.equal(await readFile(file, "utf8"), "User output 原文");
});

test("FSS-36 the Studio retitles the same refused request through both language changes and keeps its draft", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b?.projectId) return;
  const prefix = "/projects/" + b.projectId;
  const child = await pluginFrameBrowser(t, b, "plugin-builder");
  let creates = 0;
  b.server!.on("request", request => { if (request.method === "POST" && request.url?.endsWith("/api/plugin-builder/studio/builds")) creates += 1; });
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/locale?lang=en&next=" + encodeURIComponent(prefix + "/?openPlugin=plugin-builder") }, b.sessionId));
  await child.waitFor(`document.querySelector('[data-as-model-setup]')?.hidden===false`);
  await child.evaluate(`window.studioDraft=document.querySelector('[data-as-input]');studioDraft.value="Original 草稿";
    studioDraft.dispatchEvent(new Event("input",{bubbles:true}));studioDraft.form.requestSubmit();`);
  const notice = `document.querySelector(".as-error p")`;
  await child.waitFor(`${notice}?.textContent==="Choose the model used for building first"`);
  await child.evaluate(`window.studioNotice=${notice};studioDraft.focus();studioDraft.setSelectionRange(1,6,"backward");`);
  const chooseLanguage = await chooseEnglishInSettings(t, b, "zh");
  await child.waitFor(`${notice}?.textContent==="请先选择构建使用的模型"`);
  const preserved = `[studioNotice===${notice},studioDraft===document.querySelector('[data-as-input]'),document.activeElement===studioDraft,
    studioDraft.value,studioDraft.selectionStart,studioDraft.selectionEnd,studioDraft.selectionDirection]`;
  assert.deepEqual(await child.evaluate(preserved), [true, true, true, "Original 草稿", 1, 6, "backward"]);
  await chooseLanguage("en");
  await child.waitFor(`${notice}?.textContent==="Choose the model used for building first"`);
  assert.deepEqual(await child.evaluate(preserved), [true, true, true, "Original 草稿", 1, 6, "backward"]);
  assert.equal(creates, 1, "neither switch resubmitted the original draft");
  assert.deepEqual(await b.evaluate(`molisWorkRequest(${JSON.stringify(prefix + "/api/plugin-builder/studio/state")}).then(state=>state.builds)`), []);
});

test("FSS-35 a Pages editor retitles its controls in place without rewriting the document or moving selection", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b?.projectId) return;
  const projectId = b.projectId, title = "保留原文 · Draft", original = "复制代码 — 这句话属于用户。";
  const paragraph = (value: string) => ({ type: "paragraph", content: [{ type: "text", text: value }] });
  const store = openPagesStore(b.homeDirectory);
  const record = (() => { try {
    return store.create({ project_id: projectId, title, body: { type: "doc", content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "目录（用户正文）" }] },
      paragraph(original), { type: "toc" }, { type: "calendar" }, { type: "code_block" },
      ...Array.from({ length: 55 }, (_, index) => paragraph("Original paragraph " + (index + 1))),
    ] } });
  } finally { store.close(); } })();
  const child = await pluginFrameBrowser(t, b, "pages");
  const path = `/projects/${projectId}/?openPlugin=pages&openItem=${record.id}`;
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/locale?lang=zh&next=" + encodeURIComponent(path) }, b.sessionId));
  await child.waitFor("document.querySelector('.pages-code-copy')?.title === '复制代码' && !!document.querySelector('.pages-calendar header')", 15000);
  const snapshot = `[document.body===originalBody, editor===document.querySelector('[data-pages-editor] .ProseMirror'),
    codeCopy===editor.querySelector('.pages-code-copy'), contents===editor.querySelector('[data-pages-toc]'),
    calendar===editor.querySelector('.pages-calendar header'), editor.getAttribute('aria-label'), codeCopy.title,
    contents.querySelector('.pages-toc-label').textContent, contents.querySelector('button').textContent,
    !!calendar.textContent.match(/年/u), document.activeElement===editor, getSelection().anchorNode===originalText,
    getSelection().anchorOffset, getSelection().focusOffset, originalText.data, scrollHost.scrollTop === scrollOffset,
    document.querySelector('[data-pages-title]').value]`;
  await child.evaluate(`(() => { window.originalBody=document.body; window.editor=document.querySelector('[data-pages-editor] .ProseMirror');
    window.codeCopy=editor.querySelector('.pages-code-copy'); window.contents=editor.querySelector('[data-pages-toc]');
    window.calendar=editor.querySelector('.pages-calendar header'); window.originalText=editor.querySelector(':scope > p').firstChild;
    window.scrollHost=[editor.closest('.pages-workspace'),editor.closest('[data-pages-stage-workspace]')].find(node=>node.scrollHeight>node.clientHeight);
    editor.focus(); getSelection().setBaseAndExtent(originalText,6,originalText,1); document.dispatchEvent(new Event('selectionchange'));
    scrollHost.scrollTop=140; window.scrollOffset=scrollHost.scrollTop;
    if (!scrollOffset) throw new Error('Fixture did not scroll');
  })()`);
  const expected = (en: boolean) => [true, true, true, true, true, en ? "Document body" : "文档正文", en ? "Copy code" : "复制代码",
    en ? "Table of contents" : "目录", "目录（用户正文）", !en, true, true, 6, 1, original, true, title];
  assert.deepEqual(await child.evaluate(snapshot), expected(false));
  await chooseEnglishInSettings(t, b);
  await child.waitFor("codeCopy.title === 'Copy code' && contents.querySelector('.pages-toc-label')?.textContent === 'Table of contents'");
  assert.deepEqual(await child.evaluate(snapshot), expected(true));
  const read = () => {
    const persisted = openPagesStore(b.homeDirectory);
    try { return persisted.get(record.id, projectId); } finally { persisted.close(); }
  };
  await new Promise(resolve => setTimeout(resolve, 550)); // The editor schedules saves after 400ms.
  assert.deepEqual(read(), record, "the language switch did not queue an autosave");
  const addition = " + continued typing";
  assert.equal(await child.evaluate(`(() => {
    getSelection().collapse(originalText, originalText.length);
    return document.execCommand("insertText", false, ${JSON.stringify(addition)});
  })()`), true);
  const deadline = Date.now() + 5000;
  while (!JSON.stringify(read()).includes(original + addition) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(JSON.stringify(read()).includes(original + addition), "editing and autosave still work in the same editor");
  assert.deepEqual(await child.evaluate("[editor===document.querySelector('[data-pages-editor] .ProseMirror'), codeCopy.title, contents.querySelector('button').textContent]"),
    [true, "Copy code", "目录（用户正文）"]);
});

test("FSS-35 FSS-36 an opened Git review retitles the retained view without another inspection", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/locale?lang=zh&next=%2Fsettings%2Fappearance" }, b.sessionId));
  await b.waitFor("typeof molisWorkRequest === 'function' && typeof molisWorkRetitleRegion === 'function'");
  const date = "2026-11-09T12:34:00Z", raw = "回执保持原样", original = "<git> 文件原文";
  const request: AgentReviewRequest = { review_id: "known", project_id: "fixture", plugin_id: "io.molis.work.git", kind: "git-index",
    run: null, requested_at: date, expires_at: null, operation: { kind: "git-index", workspace_id: "review-ws", operation_id: "review-op" },
    document: { kind: "git-index", action: "stage", workspace_name: "Review fixture", files: [{ path: "原路径", before_text: "before", after_text: original, before_mode: "100644", after_mode: "100644" }] } };
  const view: AgentReviewRecoveryView = { review_id: request.review_id, message: { owner: "workbench", key: "workbench.agent-review.recovery-matches-before" },
    receipt: { review_id: request.review_id, status: "approved", decided_by: "tester", decided_at: date, note: null, effect_settled: false, effect_error: null, effect_uncertain: raw },
    observation: { revision: "exact", observed_at: date, files: [{ path: "原路径", text: original, mode: "100644" }], matches_before: true, matches_after: false }, can_confirm_not_happened: true };
  const rows = [{ request, receipt: view.receipt }];
  const payload = (locale: string) => runWithLocale(locale, () => ({ reviews: rows,
    html: renderAgentReviewSurface({ rows, primitives: { escape: escapeHtml, icon, formatDate: at => format.date(at, "datetime") } }),
    recovery: renderAgentReviewRecovery(view, escapeHtml), omitted: 0 }));
  const zh = payload("zh"), en = payload("en");
  await b.evaluate(`(async () => {
    if(typeof molisFrameReviews !== "function") await new Promise((resolve,reject)=>{ const script=document.createElement('script');
      script.src='/assets/molis-work-plugin-frame.js';script.onload=resolve;script.onerror=reject;document.head.append(script); });
    window.reviewRequests=[]; const responses={zh:${JSON.stringify(zh)},en:${JSON.stringify(en)}}, previous=window.molisWorkUiTransport;
    window.molisWorkUiTransport=(url,options)=> {
      const path=new URL(url).pathname;
      if(!path.startsWith('/api/agent/reviews')) return previous?.(url,options);
      const response=responses[document.documentElement.dataset.uiLanguageTag];
      reviewRequests.push((options.method||'GET')+' '+path);
      return Promise.resolve(Response.json(path.endsWith('/recovery')?{view:${JSON.stringify(view)},html:response.recovery}:response));
    };
    const owner=document.createElement('div'),holder=document.createElement('div');holder.dataset.reviewFixture='';owner.append(holder);document.querySelector('.settings-content').append(owner);
    const mount=(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})(); const lifetime=mount(owner);
    const show=molisFrameReviews({mountPluginClient:mount,route:path=>path});
    window.reviewOwner=owner; window.reviewScope=lifetime;
    window.showReview=()=>show(holder,[],null,'review-ws',{}, {lifetime,signal:lifetime.signal});
    await showReview();
  })()`);
  await b.click("[data-review-fixture] [data-agent-review-inspect]");
  await b.waitFor("document.querySelector('[data-review-recovery-view] [role=status]')?.textContent.includes('当前暂存区与操作前一致')");
  await b.evaluate(`(() => {
    window.reviewPanel=document.querySelector('[data-review-recovery-view]');window.reviewInput=reviewPanel.querySelector('textarea');
    window.reviewDetail=reviewPanel.querySelector('details');reviewDetail.open=true;
    reviewPanel.querySelector('input[type=checkbox]').click();
    reviewInput.value='  核对依据 · exact  ';reviewInput.dispatchEvent(new Event('input',{bubbles:true}));
    reviewInput.focus();reviewInput.setSelectionRange(2,8,'backward');
  })()`);
  await b.evaluate("reviewOwner.hidden=true");
  assert.equal(await b.evaluate("reviewScope.visible"), false);
  await chooseEnglishInSettings(t,b);
  await b.waitFor("document.documentElement.dataset.uiLanguageTag === 'en'");
  await b.evaluate("reviewOwner.hidden=false; showReview()");
  await b.waitFor("reviewPanel.querySelector('[role=status]').textContent.startsWith('The current Git index matches its state before')");
  const kept = `[reviewPanel===document.querySelector('[data-review-recovery-view]'), reviewInput===reviewPanel.querySelector('textarea'),
    reviewInput.value,reviewInput.selectionStart,reviewInput.selectionEnd,reviewInput.selectionDirection,reviewDetail.open,
    reviewPanel.querySelector('input[type=checkbox]').checked, reviewPanel.querySelector('pre').textContent,
    reviewRequests.filter(request=>request.includes('/recovery')), reviewRequests.filter(request=>request.startsWith('POST '))]`;
  const expected = [true,true,"  核对依据 · exact  ",2,8,"backward",true,true,original,["GET /api/agent/reviews/recovery"],[]];
  assert.deepEqual(await b.evaluate(kept), expected, "the hidden view is current when shown, without rerunning an inspection");
  await b.evaluate("reviewInput.focus({preventScroll:true})");
  await chooseEnglishInSettings(t,b,"zh");
  await b.waitFor("reviewPanel.querySelector('[role=status]').textContent.startsWith('当前暂存区与操作前一致')");
  assert.deepEqual(await b.evaluate(kept), expected);
  assert.equal(await b.evaluate("document.activeElement===reviewInput"), true);
});

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
  const problemsBefore = new Set(hostTextProblems());
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
  const tab = `.tab-item[data-tab-kind=plugin][data-plugin=${JSON.stringify(surface)}]`;
  await b.waitFor(`document.querySelector(${JSON.stringify(tab)})?.querySelector('.tab-item-name')?.textContent === '读书摘记'`);
  assert.deepEqual(await b.evaluate(`[window.originalInstalledTitle = document.querySelector(${JSON.stringify(tab)}), window.originalMarketTitle = document.querySelector('[data-market-plugin=todo] h2'),
    JSON.parse(document.querySelector('#workbench-plugin-titles').textContent)[${JSON.stringify(surface)}], originalMarketTitle.textContent].slice(2)`), ["读书摘记", "待办"]);
  const goalsStart = `JSON.parse(document.querySelector('[data-home-starts]').dataset.homeStarts).find(start=>start.id==='goals')`;
  assert.deepEqual(await b.evaluate(`[${goalsStart}.title,${goalsStart}.hint]`), ["推进一个目标", "明确要做成什么，接着往下走。"]);
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
  assert.deepEqual(await b.evaluate(`[originalInstalledTitle===document.querySelector(${JSON.stringify(tab)}),
    originalInstalledTitle.querySelector('.tab-item-name').textContent, originalMarketTitle===document.querySelector('[data-market-plugin=todo] h2'),
    originalMarketTitle.textContent, originalMarketTitle.nextElementSibling.textContent, JSON.parse(document.querySelector('#workbench-plugin-titles').textContent)[${JSON.stringify(surface)}]]`),
  [true, "Reading notes", true, "Todo", "Write down what needs doing, what is for today, and who you are waiting for.", "Reading notes"]);
  assert.deepEqual([...new Set(hostTextProblems().filter(problem => !problemsBefore.has(problem)).map(problem => problem.key ?? problem.code))], [], "a viewless Home half and the installed release used their actual owners");
  assert.deepEqual(await b.evaluate(`[${goalsStart}.title,${goalsStart}.hint,document.querySelector(${JSON.stringify(frame)}).title]`),
    ["Move a goal forward", "Decide what you want to achieve, then take the next step.", "Reading notes"]);
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


test("FSS-35 FSS-36 connection guides translate with the same OAuth form and keep a hidden settings draft", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b?.projectId) return;
  const { command, sessionId, origin, waitFor, evaluate } = b;

  // Use the real accessible control state without waiting on the collapsible's decorative transition.
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  const path = `/projects/${b.projectId}/?settings=connections`;
  await b.navigate(() => command("Page.navigate", { url: origin + "/locale?lang=zh&next=" + encodeURIComponent(path) }, sessionId));
  const row = "[data-connector-item=jira]", input = row + " [data-protocol=oauth] [data-protocol-field='setting:site_url']";
  const get = (selector: string) => `document.querySelector(${JSON.stringify(selector)})`;
  await waitFor(`${get("[data-connectors-settings]")} || ${get("[data-settings-loading][role=alert]")}`, 20_000);
  const shown = await evaluate(`({ url: location.href, title: ${get("[data-settings-title], #settings-title")}?.textContent,
    page: ${get("[data-settings-stage-body]")}?.innerText.slice(0, 320), fields: [...document.querySelectorAll(${JSON.stringify(row + " [data-protocol-field]")})].map(node => node.dataset.protocolField),
    bound: ${get("[data-connectors-settings]")}?.dataset.connectorsBound })`);
  if (!await evaluate(`!!${get(input)}`)) {
    t.diagnostic(JSON.stringify(await evaluate(`(async () => {
      const source = '/capabilities/connections?project=' + encodeURIComponent(${JSON.stringify(b.projectId)});
      const hits = performance.getEntriesByType('resource').filter(row => row.name.includes('/capabilities/') || row.name.includes('capabilities.js')).map(row => [row.name, row.responseStatus]);
      try { const response = await molisWorkRequest(source, { as: 'response' }); const body = await response.text();
        return [hits, response.status, response.headers.get('content-type'), body.includes('setting:site_url'), body.includes('data-connectors-settings')]; }
      catch (error) { return [hits, String(error), error.status, error.code]; }
    })()`)));
  }
  assert.equal(await evaluate(`!!${get(input)}`), true, JSON.stringify(shown));
  assert.equal(await evaluate(`${get("[data-connectors-settings]")}?.dataset.connectorsBound`), "1", JSON.stringify(shown));
  await b.click(row + " [data-connection-toggle]");
  await waitFor(`${get(row)}.dataset.open === 'true'`);
  await b.click(row + " [data-connector-advanced] > summary");
  await waitFor(`${get(row + " [data-connector-advanced]")}.open`);
  await b.click(row + " [data-method-choice=oauth] > summary");
  await waitFor(`${get(row + " [data-method-choice=oauth]")}.open && ${get(input)}.getClientRects().length > 0`);
  const start = await evaluate(`(() => {
    const field = window.jiraDraft = ${get(input)};
    window.jiraSettings = field.closest('[data-connectors-settings]'); window.jiraOriginalBody = document.body;
    const link = ${get(row + " [data-protocol=oauth] [data-connector-method-link]")};
    const transport = window.molisWorkUiTransport;
    window.settingsPreviews = []; window.blockEnglishPanel = true; window.holdEnglishPanel = false;
    window.molisWorkUiTransport = (url, init) => {
      const address = new URL(url), tag = init.headers['x-molis-work-ui-locale'];
      if (tag && address.pathname === '/capabilities/connections') {
        settingsPreviews.push([tag, address.searchParams.get('project')]);
        if (tag === 'en' && blockEnglishPanel) return Promise.resolve(new Response('Unavailable', { status: 503 }));
        if (tag === 'en' && holdEnglishPanel) {
          const actual = transport?.(url, init) ?? fetch(url, init);
          return new Promise((resolve, reject) => { window.releasePanelPreparation = () => actual.then(resolve, reject); });
        }
      }
      return transport?.(url, init) ?? fetch(url, init);
    };
    window.connectionFocusChanges = [];
    for (const kind of ['focusin', 'focusout']) document.addEventListener(kind, event => connectionFocusChanges.push([kind, event.target.dataset.protocolField || event.target.tagName, event.relatedTarget?.tagName]));
    field.value = 'https://draft-only.atlassian.net'; field.focus(); field.setSelectionRange(8, 18, 'backward');
    return [field.previousElementSibling.textContent, link.textContent.trim(), link.href, document.activeElement === field];
  })()`);
  assert.deepEqual(start, ["Atlassian 站点", "查看 Atlassian OAuth 2.0", "https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/", true]);
  // Another real settings document commits English. This document rejects only its panel's preparation and must preserve the full old display.
  await chooseEnglishInSettings(t, b);
  await waitFor("!!document.querySelector('[data-ui-language-status] button')");
  assert.deepEqual(await evaluate(`[document.documentElement.lang, jiraOriginalBody === document.body, document.activeElement === jiraDraft, jiraDraft.value, jiraDraft.selectionStart, jiraDraft.selectionEnd, jiraDraft.selectionDirection]`),
    ["zh-CN", true, true, "https://draft-only.atlassian.net", 8, 18, "backward"], JSON.stringify(await evaluate("connectionFocusChanges")));
  await evaluate("window.blockEnglishPanel = false; document.querySelector('[data-ui-language-status] button').click()");
  await waitFor(`document.documentElement.lang === 'en' && ${get(input)}?.previousElementSibling.textContent === 'Atlassian site'`, 20_000);
  assert.deepEqual(await evaluate(`[jiraDraft === ${get(input)}, jiraOriginalBody === document.body, document.activeElement === jiraDraft, jiraDraft.value, jiraDraft.selectionStart, jiraDraft.selectionEnd,
    jiraDraft.selectionDirection, ${get(row + " [data-method-choice=oauth]")}.open, ${get(row + " .settings-connection-row__identity small")}.textContent,
    ${get(row + " [data-protocol=oauth] [data-connector-method-link]")}.textContent.trim(), settingsPreviews.map(([tag, project]) => tag + ':' + project).sort()]`),
    [true, true, true, "https://draft-only.atlassian.net", 8, 18, "backward", true, "Issues and projects.", "View Atlassian OAuth 2.0", ["en", "en", "zh", "zh"].map(tag => tag + ":" + b.projectId)]);
  // Switch while the existing pane is detached, then reopen the same cached form.
  await evaluate(`${get("[data-directory-panel=settings] [data-settings-section=appearance]")}.click()`);
  await waitFor(`!jiraSettings.isConnected && !!${get("a[data-ui-language=zh]")}`);
  await evaluate(`${get("a[data-ui-language=zh]")}.click()`);
  await waitFor("document.documentElement.lang === 'zh-CN'");
  await evaluate(`${get("[data-directory-panel=settings] [data-settings-section=connections]")}.click()`);
  await waitFor("jiraSettings.isConnected");
  assert.deepEqual(await evaluate(`[jiraDraft === ${get(input)}, jiraDraft.previousElementSibling.textContent, jiraDraft.value, jiraDraft.selectionStart, jiraDraft.selectionEnd]`),
    [true, "Atlassian 站点", "https://draft-only.atlassian.net", 8, 18]);

  await evaluate(`${get("[data-directory-panel=settings] [data-settings-section=appearance]")}.click()`);
  await waitFor(`!jiraSettings.isConnected && !!${get("a[data-ui-language=en]")}`);
  await evaluate(`window.holdEnglishPanel = true; ${get("a[data-ui-language=en]")}.click()`);
  await waitFor("typeof releasePanelPreparation === 'function'");
  await evaluate(`(() => {
    const link = document.createElement('a');
    link.href = '/capabilities/connections?connector=cloudflare&project=' + encodeURIComponent(${JSON.stringify(b.projectId)});
    document.querySelector('[data-settings-stage-body]').append(link); link.click(); link.remove();
  })()`);
  await waitFor("!jiraSettings.isConnected && document.querySelector('[data-connector-item=cloudflare][data-open=true]')");
  await evaluate("window.holdEnglishPanel = false; releasePanelPreparation()");
  await waitFor("!!document.querySelector('[data-ui-language-status] button')");
  assert.deepEqual(await evaluate(`[document.documentElement.lang, document.body === jiraOriginalBody, jiraSettings.isConnected, ${get(row + " .settings-connection-row__identity small")}.textContent]`),
    ["zh-CN", true, false, "Issue 与项目。"], "a prepared response cannot retitle a replaced settings pane");
  await evaluate("document.querySelector('[data-ui-language-status] button').click()");
  await waitFor(`document.documentElement.lang === 'en' && ${get(row + " .settings-connection-row__identity small")}.textContent === 'Issues and projects.'`);
});
