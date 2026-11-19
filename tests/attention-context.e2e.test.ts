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
