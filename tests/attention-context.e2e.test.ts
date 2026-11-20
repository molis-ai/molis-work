import assert from "node:assert/strict";
import test from "node:test";
import { createProject } from "@molis-ai/molis-work-test-kit/local-host-http";
import { armResponse, openAuditBrowser, releaseResponse, waitHeld } from "./fixtures/workbench-audit-browser.js";
import { sendBarrier } from "./fixtures/assistant-send-journey.js";

// QEA-18: hold the actual old project's HTTP answer after it has arrived, then use the chooser normally. Its
// consumers must never receive the old context's event or failure, even if reading its body ignores abort.
for (const outcome of ["success", "missing", "network"] as const) {
  test(`QEA-18 a chooser switch discards a late ${outcome} from the previous project and reads the new one`, { timeout: 120_000 }, async t => {
    const b = await openAuditBrowser(t);
    assert.ok(b, "QEA-18 needs the isolated test browser");
    const other = await createProject(b.web, "Attention Beta");
    await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/" }, b.sessionId));
    const first = b.projectId!;
    const select = (id: string) => b.click(`.chooser-list [data-id="${id}"]`);
    await select(first);
    await b.evaluate(`window.__attentionEvents = []; window.__attentionFailures = 0;
      document.addEventListener('molis-work:attention', event => window.__attentionEvents.push({ selected: document.querySelector('.chooser').dataset.selected, started: event.detail.started }));
      document.addEventListener('molis-work:attention-unreachable', () => window.__attentionFailures++);`);
    await b.evaluate("document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'))");
    await b.waitFor("window.__attentionEvents.length > 0", 15_000);
    const path = `/projects/${first}/api/attention?`;
    await armResponse(b, "old-context", path);
    const barrier = outcome === "success" ? null : await sendBarrier(b, [{ urlPattern: `*${path}*`, requestStage: "Response" }]);
    try {
      await b.evaluate("document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'))");
      if (barrier) {
        try {
          const paused = await barrier.next();
          if (outcome === "network") await barrier.drop(paused);
          else await b.command("Fetch.fulfillRequest", { requestId: paused.requestId, responseCode: 404,
            responseHeaders: [{ name: "Content-Type", value: "application/json" }],
            body: Buffer.from(JSON.stringify({ error: "The old project is gone", code: "projects.not_found" })).toString("base64") }, b.sessionId);
        } finally { await barrier.close(); }
      }
      await waitHeld(b, "old-context");
      await b.evaluate("window.__attentionEvents = []; window.__attentionFailures = 0; window.__changedAt = performance.now()");
      await select(other.project_id);
      await b.waitFor(`document.querySelector('.chooser').dataset.selected === ${JSON.stringify(other.project_id)}`);
      // A slow old body must not keep the new project waiting for its answer.
      await b.waitFor(`window.__attentionEvents.some(event => event.selected === ${JSON.stringify(other.project_id)} && event.started >= window.__changedAt)`, 15_000);
      await releaseResponse(b, "old-context");
      await b.evaluate("document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'))");
      await b.waitFor(`window.__attentionEvents.filter(event => event.selected === ${JSON.stringify(other.project_id)}).length >= 2`, 15_000);
      assert.equal(await b.evaluate("window.__attentionEvents.some(event => event.started < window.__changedAt)"), false, "no consumer receives an old context's answer");
      assert.equal(await b.evaluate("window.__attentionFailures"), 0, "an old context's failure must not mark the new one offline");
      await select(first);
      await b.waitFor(`window.__attentionEvents.some(event => event.selected === ${JSON.stringify(first)})`, 15_000);
      assert.equal(await b.evaluate("document.querySelector('[data-background-tasks-problem]') === null"), true, "both project contexts retain the normal Home background read");
    } finally {
      await releaseResponse(b, "old-context").catch(() => {});
    }
  });
}

// 56-1 BL-attention-404-by-code: a 404 that does not say the project is gone (a Host starting again) is a failure like any other, and an
// open page reads again without a refresh; only the Host's `catalog.project_not_found` stops that address, on the read and on the stream.
const GONE = "catalog.project_not_found";
/** Answers the next `count` requests whose path holds `needle` with a 404, the way the Host would, before they leave the page. */
const answer404 = (needle: string, code: string | null, count = 1) => `(() => {
  const real = window.fetch; let left = ${count}; window.__fake404 = 0;
  window.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (left > 0 && (url.pathname + url.search).includes(${JSON.stringify(needle)})) {
      left--; window.__fake404++;
      return Promise.resolve(new Response(JSON.stringify(${code ? `{ error: 'gone', code: ${JSON.stringify(code)} }` : "{ error: 'Not Found' }"}), { status: 404, headers: { 'content-type': 'application/json' } }));
    }
    return real(input, init);
  };
})();`;
const COUNT_ATTENTION = `window.__attentionEvents = 0; window.__attentionFailures = 0;
  document.addEventListener('molis-work:attention', () => window.__attentionEvents++);
  document.addEventListener('molis-work:attention-unreachable', () => window.__attentionFailures++);`;

test("56-1 BL-attention-404-by-code an open project page reads again after a passing 404, and stops only once its project is deleted", { timeout: 120_000 }, async t => {
  const b = await openAuditBrowser(t);
  assert.ok(b, "56-1 needs the isolated test browser");
  const project = await createProject(b.web, "Attention Passing");
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${encodeURIComponent(project.project_id)}/` }, b.sessionId));
  const readPath = `/projects/${encodeURIComponent(project.project_id)}/api/attention?`;
  const reads = () => b.evaluate<number>(`window.__auditRequests.filter(row => row.path.includes(${JSON.stringify(readPath)})).length`);
  const refresh = () => b.evaluate("document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'))");
  await b.evaluate(COUNT_ATTENTION);
  await refresh();
  await b.waitFor("window.__attentionEvents > 0", 15_000);
  // The Host is starting again: one read meets a 404 that names no project.
  await b.evaluate(answer404(readPath, null));
  await b.evaluate("window.__attentionEvents = 0; window.__attentionFailures = 0");
  await refresh();
  await b.waitFor("window.__fake404 === 1 && window.__attentionFailures > 0", 15_000);
  // It is back: the same page, never refreshed, reads it again and paints it.
  await new Promise(resolve => setTimeout(resolve, 700));
  await refresh();
  await b.waitFor("window.__attentionEvents > 0", 15_000);
  // The project is deleted: the Host says so, and the page stops reading that address.
  const before = await reads();
  await b.web.post(`/api/settings/projects/${encodeURIComponent(project.project_id)}/delete`, { delete_confirmed: true, idempotency_key: "bl-attention-404-deleted" });
  await refresh();
  await b.waitFor(`window.__auditRequests.filter(row => row.path.includes(${JSON.stringify(readPath)})).length > ${before}`, 15_000);
  await new Promise(resolve => setTimeout(resolve, 700));
  const stopped = await reads();
  for (let round = 0; round < 3; round++) { await refresh(); await new Promise(resolve => setTimeout(resolve, 700)); }
  assert.equal(await reads(), stopped, "a deleted project's address is not read again");
});

test("56-1 BL-attention-404-by-code the attention stream connects again after a passing 404, and lets go only on the Host's word that the project is gone", { timeout: 120_000 }, async t => {
  const b = await openAuditBrowser(t);
  assert.ok(b, "56-1 needs the isolated test browser");
  const page = `${b.origin}/projects/${encodeURIComponent(b.projectId!)}/`;
  const streams = `window.__auditRequests.filter(row => row.path === '/api/attention/events').length`;
  // The first connection of a freshly opened page meets a 404 that names no project.
  const passing = await b.command<{ identifier: string }>("Page.addScriptToEvaluateOnNewDocument", { source: COUNT_ATTENTION + answer404("/api/attention/events", null) }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: page }, b.sessionId));
  await b.command("Page.removeScriptToEvaluateOnNewDocument", { identifier: passing.identifier }, b.sessionId);
  await b.waitFor("window.__fake404 === 1 && window.__attentionFailures >= 1", 15_000);
  // It waits as a stream the Host never answered does (N54), then connects, and the stream's first word reads.
  await b.waitFor(`${streams} > 0`, 45_000);
  await b.waitFor("window.__attentionEvents > 0", 15_000);
  // The stream says the project is gone: no retry, nothing said unreachable, and the reads of that address stop with it.
  const gone = await b.command<{ identifier: string }>("Page.addScriptToEvaluateOnNewDocument", { source: COUNT_ATTENTION + answer404("/api/attention/events", GONE) }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: page }, b.sessionId));
  await b.command("Page.removeScriptToEvaluateOnNewDocument", { identifier: gone.identifier }, b.sessionId);
  await b.waitFor("window.__fake404 === 1", 15_000);
  await new Promise(resolve => setTimeout(resolve, 1_500));
  const attentionRequests = `${streams} + window.__auditRequests.filter(row => row.path.includes('/api/attention?')).length`;
  const before = await b.evaluate<number>(attentionRequests);
  for (let round = 0; round < 3; round++) {
    await b.evaluate("document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'))");
    await new Promise(resolve => setTimeout(resolve, 700));
  }
  assert.equal(await b.evaluate("window.__attentionFailures"), 0, "a gone project is not a lost Host: nothing is said, nothing is retried");
  assert.equal(await b.evaluate(`${streams}`), 0, "the stream is not connected again");
  assert.equal(await b.evaluate<number>(attentionRequests), before, "and the gone address is not read again");
});
