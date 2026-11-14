import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test, { type TestContext } from "node:test";
import { readRssHttpState } from "@molis-ai/molis-work-integration-rss";
import { createSourcePullRuntime } from "@molis-ai/molis-work-app-local-host";
import { addProjectPlugin } from "@molis-ai/molis-work-test-kit/local-host-http";
import { fromBetterSqlite, listListenerRuns } from "@molis-ai/molis-work-plugin-feed/store";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
const ADD = "[data-feed-column] [data-feed-add-toggle]";
const FORM = "[data-feed-add-form]";
const REGISTER = "[data-feed-source-register]";
const ALERTS = "[data-feed-add-error],[data-feed-source-error]";
const toastSelector = "[data-toast]";

async function openFeed(t: TestContext, b: Browser) {
  assert.ok(b.projectId);
  await b.setViewport(1440, 920);
  await pluginFrameInitScript(t, b, `
    window.feedback = { reads: 0, pending: 0, toasts: [] };
    window.molisWorkbenchPluginFactories = new Proxy({}, { set(target, key, value) {
      target[key] = key === "feed" ? host => {
        const read = host.view.readDocument, toast = host.showToast;
        // A change made elsewhere: the notice another view's invalidation delivers (a page's own invalidation is not sent back to it).
        feedback.refresh = () => host.root.dispatchEvent(new CustomEvent('molis-work:select-item',{detail:{invalidate:true}}));
        host.view.readDocument = async (...args) => {
          feedback.reads++; feedback.pending++;
          try { return await read(...args); } finally { feedback.pending--; }
        };
        host.showToast = (...args) => { feedback.toasts.push(args); return toast(...args); };
        return value(host);
      } : value;
      return true;
    } });
  `);
  const child = await pluginFrameBrowser(t, b, "feed");
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/?openPlugin=feed` }, b.sessionId));
  await child.waitFor("feedback.reads > 0 && feedback.pending === 0");
  return child;
}

async function shot(b: Browser, name: string) {
  const directory = reviewEvidenceUrl("feed-feedback/");
  await mkdir(directory, { recursive: true });
  const png = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, b.sessionId);
  await writeFile(new URL(name + ".png", directory), Buffer.from(png.data, "base64"));
}

test("B27-FF01 B27-FF02 Feed tells a refused, malformed, and interrupted pull apart and recovers", { timeout: 90000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null);
  if (!b) return;
  const { projectId, store } = b;
  assert.ok(projectId);
  await addProjectPlugin(b.web, projectId, "feed");
  const prefix = `/projects/${projectId}/api/plugins/io.molis.work.feed`;
  const { source } = await b.web.post<{ source: { source_id: string } }>(prefix + "/sources", { kind: "rss", definition_id: "solidot", name: "Feed feedback sample" });
  const { source_id: id } = source;
  const feed = createLocalFeedApplication(store.db);
  const snapshot = () => feed.snapshot(projectId);
  // The directory's `runs` is the latest run of each source (a bounded read since #2026); this source's whole pull history is read here.
  const pullHistory = () => listListenerRuns(fromBetterSqlite(store.db), projectId).filter(run => run.source_id === id)
    .map(run => ({ ...run, receipt: run.connector_receipt }));
  const pulls: Array<{ status: number; etag: string | null }> = [];
  let foreignRequests = 0;
  let answer = 200, title = "Original feed item";
  const fetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "https://example.invalid/not-allowed.xml") {
      foreignRequests++;
      return new Response(null, { status: 403 });
    }
    if (String(input) !== "https://www.solidot.org/index.rss") return fetch(input, init);
    pulls.push({ status: answer, etag: new Headers(init?.headers).get("if-none-match") });
    if (answer === 0) throw new TypeError("fixture: provider did not respond");
    if (answer === 403) return new Response("Forbidden", { status: 403, headers: { etag: '"refused"' } });
    if (answer === 302) return new Response(null, { status: 302, headers: { location: "https://example.invalid/not-allowed.xml" } });
    if (answer === 422) return new Response("<html><h1>Sign in</h1></html>", { headers: { "content-type": "text/html", etag: '"html"' } });
    return new Response(`<rss version="2.0"><channel><title>Fixture feed</title><link>https://www.solidot.org/</link>
      <item><title>${title}</title><link>https://www.solidot.org/${pulls.length}</link><description>Fixture RSS entry.</description></item>
      </channel></rss>`, { headers: { "content-type": "application/rss+xml", etag: `"accepted-${pulls.length}"` } });
  });
  const child = await openFeed(t, b);
  await child.click("[data-feed-rail-toggle]");
  await child.click(`[data-feed-source-rail] [data-feed-task="${id}"]`);
  await child.waitFor(`document.querySelector("[data-feed-workbench]").dataset.selectedSource === ${JSON.stringify(id)}`);
  const sync = "[data-feed-current-sync]";
  await child.click(sync);
  await child.waitFor("feedback.toasts.length === 1 && feedback.pending === 0");
  const before = snapshot();
  assert.deepEqual(before.feed_items.map(item => item.title), [title]);
  const priorSource = before.sources.find(row => row.source_id === id);
  assert.ok(priorSource);
  const priorCursor = readRssHttpState(priorSource.cursor);
  assert.equal(priorCursor.etag, '"accepted-1"');
  const observations: Array<{ reply: number; copy: string; mark: string; failure: boolean; persisted: string | null; http: unknown }> = [];
  for (const reply of [403, 422, 302, 0]) {
    answer = reply;
    const count = await child.evaluate<number>("feedback.toasts.length");
    await child.click(sync);
    await child.waitFor(`feedback.toasts.length > ${count} && feedback.pending === 0`);
    const after = snapshot();
    const runs = pullHistory();
    assert.equal(runs.length, observations.length + 2);
    const latest = runs[0]!;
    assert.equal(latest.phase, "terminal");
    assert.ok(latest.outcome === "failed" || latest.outcome === "reconciliation_required", String(latest.outcome));
    assert.equal(latest.created_count, 0);
    assert.ok(latest.error_code);
    assert.deepEqual(after.feed_items, before.feed_items, "the last successful content and source items survive a failed pull");
    const currentSource = after.sources.find(row => row.source_id === id);
    assert.ok(currentSource);
    assert.equal(currentSource.last_sync_at, priorSource.last_sync_at);
    const cursor = readRssHttpState(currentSource.cursor);
    assert.equal(cursor.etag, priorCursor.etag);
    assert.equal(cursor.last_success_at, priorCursor.last_success_at);
    const toasts = await child.evaluate<Array<[string, boolean | null]>>(`feedback.toasts.slice(${count})`);
    assert.equal(toasts.length, 1, "one pull produces one immediate response");
    await b.waitFor(`document.querySelector(${JSON.stringify(toastSelector)})?.textContent.includes(${JSON.stringify(toasts[0]![0])})`);
    const mark = await b.evaluate<string>(`document.querySelector(${JSON.stringify(toastSelector)}).dataset.mwState`);
    observations.push({ reply, copy: toasts[0]![0], mark, failure: toasts[0]![1] === true, persisted: latest.error_code, http: latest.receipt?.rss_http });
    await shot(b, "pull-" + reply);
  }
  const interrupted = createLocalFeedSourceService(store.db, projectId, db => {
    const runtime = createSourcePullRuntime({ db });
    runtime.intelligenceCollect.executeExact = async () => { throw new Error("fixture: lost collector result"); };
    return runtime;
  });
  const interruptedCall = await interrupted.sync(id, { idempotencyKey: "fixture-interrupted-pull" }).catch((error: unknown) => error);
  assert.ok(interruptedCall instanceof Error && "code" in interruptedCall);
  assert.equal(interruptedCall.code, "feed.source_sync_interrupted");
  assert.equal(snapshot().runs[0]?.phase, "interrupted");
  assert.equal(snapshot().runs[0]?.error_code, "feed.provider_interrupted");

  answer = 200;
  title = "Recovered feed item";
  const count = await child.evaluate<number>("feedback.toasts.length");
  await child.click(sync);
  await child.waitFor(`feedback.toasts.length > ${count} && feedback.pending === 0`);
  const recovered = snapshot();
  assert.deepEqual(recovered.feed_items.map(item => item.title).sort(), ["Original feed item", title]);
  assert.equal(recovered.runs[0]?.outcome, "completed");
  assert.equal(recovered.runs[0]?.error_code, null);
  assert.deepEqual(pulls, [200, 403, 422, 302, 0, 200].map((status, index) => ({ status, etag: index === 0 ? null : '"accepted-1"' })), "one provider request per explicit pull, with the last successful validator");
  assert.equal(foreignRequests, 0, "the refused redirect never contacts the second host");
  assert.equal(readRssHttpState(recovered.sources.find(row => row.source_id === id)?.cursor).etag, '"accepted-6"');
  const settings = `[data-feed-task-config="${id}"]`;
  await child.click('[data-feed-view="settings"]');
  await child.waitFor(`document.querySelector(${JSON.stringify(settings)})?.checkVisibility()`);
  const history = settings + " details:has([data-run-state])";
  await child.click(history + " summary");
  await child.waitFor(`document.querySelector(${JSON.stringify(history)}).open`);
  await child.evaluate(`document.querySelector(${JSON.stringify(history + ' [data-run-state="error"]')}).scrollIntoView({ block: "center", behavior: "instant" })`);
  const rendered = await child.evaluate<Array<{ state: string; ring: string; copy: string }>>(`[...document.querySelectorAll(${JSON.stringify(history + " [data-run-state]")})].map(node => ({ state: node.dataset.runState, ring: node.querySelector("[data-mw-state]").dataset.mwState, copy: node.textContent }))`);
  await shot(b, "pull-history-recovered");
  t.diagnostic(JSON.stringify({ pulls, observations, interrupted: interruptedCall.message, rendered }));
  assert.ok(observations.every(value => value.failure && value.mark === "failed"), "a failed pull must use the existing failure mark");
  assert.deepEqual(observations.map(value => value.persisted), ["provider_unavailable", "protocol_invalid", "protocol_invalid", "provider_unavailable"]);
  assert.deepEqual(observations.map(value => (value.http as { status: number } | undefined)?.status), [403, 200, undefined, undefined]);
  assert.match(interruptedCall.message, /拉取中断.*重试/);
  assert.match(observations[0]!.copy, /拒绝.*访问/);
  assert.match(observations[1]!.copy, /RSS.*Atom/);
  assert.match(observations[2]!.copy, /检查.*来源设置/);
  assert.match(observations[3]!.copy, /暂时.*重试/);
  assert.doesNotMatch(observations[3]!.copy, /拒绝.*访问/);
  assert.doesNotMatch(rendered.map(run => run.copy).join(" "), /protocol_invalid|feed_unavailable|provider_interrupted/);
  assert.ok(rendered.some(run => run.state === "error" && run.ring === "interrupted" && /重试/.test(run.copy) && !/新增/.test(run.copy)));
});

test("B27-FF02 B27-FF03 Feed keeps form errors local and retries just the missing plan", { timeout: 90000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null);
  if (!b) return;
  const { projectId, store } = b;
  assert.ok(projectId);
  await addProjectPlugin(b.web, projectId, "feed");
  const child = await openFeed(t, b);
  await b.evaluate(`(() => {
    const fetchOriginal = window.fetch;
    window.feedWrites = [];
    window.planFailure = "refused";
    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input, location.href);
      if (url.origin !== location.origin || !url.pathname.includes("/api/plugins/io.molis.work.feed/sources")) return fetchOriginal(input, init);
      if (url.pathname.endsWith("/sources") && init?.method === "POST") feedWrites.push("register");
      if (url.pathname.endsWith("/schedule") && init?.method === "PUT") {
        feedWrites.push("schedule");
        if (planFailure === "refused") return Promise.resolve(Response.json({ error: "拉取计划服务暂不可用。" }, { status: 503 }));
        if (planFailure === "unknown") return Promise.reject(new TypeError("fixture: schedule connection lost"));
      }
      return fetchOriginal(input, init);
    };
  })()`);
  await child.click(ADD);
  await child.click('[data-feed-choose-kind="custom_rss"]');
  const field = '[data-feed-source-value="custom_rss"]';
  const set = (selector: string, value: string) => child.evaluate(`(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    control.value = ${JSON.stringify(value)};
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await set(field, "http://127.0.0.1/test-rss");
  await child.click(REGISTER);
  const visibleErrors = `[...document.querySelectorAll(${JSON.stringify(ALERTS)})].filter(node => node.checkVisibility() && node.textContent.trim())`;
  await child.waitFor(visibleErrors + ".length > 0");
  const firstErrors = await child.evaluate<string[]>(visibleErrors + ".map(node => node.textContent)");
  const initialCount = firstErrors.length;
  assert.deepEqual(await child.evaluate("feedback.toasts"), [], "the rejected form has just its existing inline feedback");
  await shot(b, "add-refused");
  await child.click("[data-feed-setup-back]");
  await child.click('[data-feed-choose-kind="rss"]');
  const switchedErrors = await child.evaluate<string[]>(visibleErrors + ".map(node => node.textContent)");
  const defaultChoice = await child.evaluate<string>("document.querySelector('[data-feed-rss-definition]').value");
  const catalogFirst = await child.evaluate<string>("document.querySelector('[data-feed-rss-definition]').options[0].value");
  assert.match(await child.evaluate<string>(`document.querySelector(${JSON.stringify(REGISTER)}).textContent`), /添加来源|创建来源/);
  await child.click("[data-feed-setup-back]");
  await child.click('[data-feed-choose-kind="custom_rss"]');
  assert.equal(await child.evaluate(`document.querySelector(${JSON.stringify(field)}).value`), "http://127.0.0.1/test-rss");
  await set(field, "https://example.com/feed.xml");
  await set("[data-feed-add-name]", "Plan retry source");
  await set("[data-feed-create-frequency]", "60");
  await child.click(REGISTER);
  await child.waitFor(`document.querySelector(${JSON.stringify(FORM)}).dataset.createdSourceId && ${visibleErrors}.some(node => node.textContent.includes("未保存"))`);
  const partial = await child.evaluate<string>(visibleErrors + "[0].textContent");
  const read = () => createLocalFeedApplication(store.db).snapshot(projectId).sources.filter(row => row.name === "Plan retry source");
  const created = read();
  assert.equal(created.length, 1);
  assert.equal(created[0]!.schedule.mode, "manual");
  await b.setViewport(390, 844);
  await b.evaluate("document.documentElement.dataset.theme='dark'; document.documentElement.dataset.resolvedTheme='dark'");
  await child.waitFor("document.documentElement.dataset.resolvedTheme === 'dark'");
  assert.equal(await child.evaluate(`document.querySelector(${JSON.stringify(REGISTER)}).textContent`), "保存拉取计划");
  await shot(b, "add-plan-retry-dark-390");
  await b.evaluate('window.planFailure = "unknown"');
  await child.click(REGISTER);
  await child.waitFor(visibleErrors + '.some(node => node.textContent.includes("不知道这次操作"))');
  const unknown = await child.evaluate<string>(visibleErrors + "[0].textContent");
  assert.match(unknown, /来源已添加.*不知道这次操作/);
  assert.doesNotMatch(unknown, /计划未保存/);
  assert.deepEqual(read(), created, "a lost response in this case still leaves only the registered source");
  await b.evaluate("window.planFailure = null");
  await child.click(REGISTER);
  await child.waitFor("document.querySelector('[data-feed-sources-dialog]').hidden");
  const recovered = read();
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0]!.source_id, created[0]!.source_id);
  assert.equal(recovered[0]!.schedule.mode, "interval");
  assert.deepEqual(await b.evaluate("window.feedWrites"), ["register", "register", "schedule", "schedule", "schedule"]);
  t.diagnostic(JSON.stringify({ firstErrors, switchedErrors, defaultChoice, catalogFirst, partial, unknown, writes: await b.evaluate("window.feedWrites") }));
  assert.equal(initialCount, 1);
  assert.deepEqual(switchedErrors, []);
  assert.notEqual(defaultChoice, "36kr");
  assert.equal(catalogFirst, "36kr", "choosing a different default does not reorder the catalog");
  assert.match(partial, /来源已添加.*拉取计划未保存/);
});

test("B27-FF04 Feed preserves a filter, source selection, and source draft after a failed list read", { timeout: 90000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null);
  if (!b) return;
  const { projectId, store } = b;
  assert.ok(projectId);
  await addProjectPlugin(b.web, projectId, "feed");
  const sources = createLocalFeedSourceService(store.db, projectId);
  const source = sources.register({ kind: "web_query", query: "feedback-list", name: "Feed refresh source" }).source;
  const child = await openFeed(t, b);
  await child.click("[data-feed-rail-toggle]");
  await child.click(`[data-feed-source-rail] [data-feed-task="${source.source_id}"]`);
  await child.evaluate(`(() => {
    const search = document.querySelector("[data-feed-search]");
    search.value = "保留筛选"; search.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await child.click(ADD);
  await child.click('[data-feed-choose-kind="custom_rss"]');
  await child.click("[data-feed-add-name]");
  await b.command("Input.insertText", { text: "Feed unsaved source" }, b.sessionId);
  const state = () => child.evaluate(`({
    search: document.querySelector("[data-feed-search]").value,
    selected: document.querySelector("[data-feed-workbench]").dataset.selectedSource,
    name: document.querySelector("[data-feed-add-name]").value,
    open: document.querySelector("[data-feed-add-form]").checkVisibility()
  })`);
  const original = { search: "保留筛选", selected: source.source_id, name: "Feed unsaved source", open: true };
  assert.deepEqual(await state(), original);
  await b.evaluate(`(() => {
    const fetchOriginal = window.fetch;
    window.feedListRequests = 0; window.failFeedList = true;
    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input, location.href);
      if (url.href === location.href && (init?.method ?? "GET") === "GET") {
        feedListRequests++;
        if (failFeedList) return Promise.reject(new TypeError("fixture: read connection lost"));
      }
      return fetchOriginal(input, init);
    };
  })()`);
  const count = await child.evaluate<number>("feedback.toasts.length");
  await child.evaluate("feedback.refresh()");
  await child.waitFor(`feedback.toasts.length > ${count} && feedback.pending === 0`);
  assert.deepEqual(await state(), original);
  const feedback = await child.evaluate<Array<[string, boolean]>>(`feedback.toasts.slice(${count})`);
  const failedRequests = await b.evaluate<number>("feedListRequests");
  await shot(b, "list-read-failed");
  await b.evaluate("window.failFeedList = false");
  const reads = await child.evaluate<number>("feedback.reads");
  sources.register({ kind: "web_query", query: "feedback-list-recovered", name: "Feed refresh recovered" });
  await child.evaluate("feedback.refresh()");
  await child.waitFor(`feedback.reads > ${reads} && feedback.pending === 0 && document.querySelector("[data-feed-source-rail]").textContent.includes("Feed refresh recovered")`);
  assert.deepEqual(await state(), original);
  const requests = await b.evaluate<number>("feedListRequests");
  t.diagnostic(JSON.stringify({ failedRequests, requests, feedback }));
  // The failed refresh asks once and is not retried behind the person's back. The recovered one is a parameterized page
  // (`readInputPageDocument`): it reads its owner page before and after the list, so exactly two page reads, no more.
  assert.equal(failedRequests, 1);
  assert.equal(requests - failedRequests, 2);
  assert.equal(feedback.length, 1);
  assert.equal(feedback[0]![1], true);
  assert.match(feedback[0]![0], /当前输入已保留.*重试/);
});
