import assert from "node:assert/strict";
import test from "node:test";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { seedDemoGoals } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

type Diagnostic = {
  node_elapsed_ms: number;
  browser: {
    unavailable?: string;
    started_ms?: number;
    ended_ms?: number;
    outcome?: string;
    last_blocked?: { ms: number; more_roots: boolean; roots: Array<{
      kind: string; loading: boolean; deferred: boolean; hidden: boolean; pool: boolean;
    }> };
  };
};

// MEM-CI-TRACE-02 exercises the fixture gate and its failure recording only, not an App product journey.
test("MEM-CI-TRACE-02: original loading gate rejects, keeps its snapshot, and preserves errors when diagnostics fail", async t => {
  const b = await openGoalBrowser(t, false, seedDemoGoals, null); if (!b) return;
  await b.navigate(() => b.command("Page.navigate", { url: "about:blank" }, b.sessionId));
  const privateText = "MEM_CI_TRACE_PRIVATE_TEXT";
  const privateUrl = "https://invalid.example/MEM_CI_TRACE_PRIVATE_URL";
  await b.evaluate(`(() => {
    document.body.replaceChildren();
    const button = document.createElement('button'); button.id = 'trace-target'; button.textContent = 'Target'; document.body.append(button);
    const pool = document.createElement('div'); pool.hidden = true; pool.setAttribute('data-surface-pool', '');
    for (let index = 0; index < 10; index++) {
      const root = document.createElement('section'); root.dataset.uiClientState = 'loading'; root.setAttribute('data-deferred-surface', '');
      root.setAttribute('data-work-surface', ${JSON.stringify(privateText)}); root.setAttribute('data-private-url', ${JSON.stringify(privateUrl)});
      root.textContent = ${JSON.stringify(privateText)};
      if (index === 0) root.setAttribute('data-settings-page', ${JSON.stringify(privateText)});
      if (index === 1) { const script = document.createElement('script'); script.type = 'application/json'; script.setAttribute('data-plugin-document', ''); script.textContent = '"private"'; root.append(script); }
      pool.append(root);
    }
    document.body.append(pool);
    window.__memCiTracePointers = 0;
    document.addEventListener('pointerdown', () => window.__memCiTracePointers++);
  })()`);

  const original = ChromeHarness.prototype.command;
  type Phase = "loading" | "stale" | "read-failed";
  let phase: Phase | "idle" = "idle";
  let calls = 0, pointers = 0, recovered = false;
  const cause = new Error("controlled original cause");
  const primary = new TypeError("controlled original CDP rejection", { cause });
  const originalStack = primary.stack;
  t.mock.method(ChromeHarness.prototype, "command", function (this: ChromeHarness, method: string,
    params: Record<string, unknown> = {}, sessionId?: string, timeoutMs?: number) {
    if (method === "Input.dispatchMouseEvent") pointers++;
    // The gate and its failure read are the first two Runtime.evaluate calls in this explicit phase.
    // No matching of generated JavaScript or private implementation strings is needed.
    if (phase !== "idle" && method === "Runtime.evaluate" && sessionId === b.sessionId) {
      const ordinal = ++calls;
      assert.ok(ordinal <= 2, "the fixture must make one gate call and at most one diagnostic read");
      assert.equal(timeoutMs, ordinal === 1 ? 12_000 : 1_000);
      if (ordinal === 1 && phase !== "loading") return Promise.reject(primary);
      if (ordinal === 2 && phase === "read-failed") return Promise.reject(new Error("controlled diagnostic read failure"));
      if (ordinal === 2 && phase === "loading") {
        return original.call(this, "Runtime.evaluate", {
          expression: "document.querySelector('[data-surface-pool]').remove(); true", returnByValue: true,
        }, sessionId, 1_000).then(() => {
          recovered = true;
          return original.call(this, method, params, sessionId, timeoutMs);
        });
      }
    }
    return original.call(this, method, params, sessionId, timeoutMs);
  });

  async function rejectedClick(next: Phase): Promise<Error> {
    phase = next; calls = 0;
    let caught: unknown;
    try { await b.click("#trace-target"); } catch (error) { caught = error; }
    finally { phase = "idle"; }
    assert.ok(caught instanceof Error, "click must reject before pointer dispatch");
    assert.equal(calls, 2, "one gate command and one bounded diagnostic read");
    assert.equal(pointers, 0);
    return caught;
  }
  function diagnostic(error: Error): Diagnostic {
    const property = Object.getOwnPropertyDescriptor(error, "surface_wait_diagnostic");
    assert.equal(property?.enumerable, true);
    assert.equal(property?.configurable, true);
    assert.equal(typeof property?.value, "string");
    const text = property!.value as string;
    assert.ok(text.length <= 2304);
    // Privacy assertions apply to the new diagnostic, not the pre-existing original error text.
    assert.ok(!text.includes(privateText)); assert.ok(!text.includes(privateUrl));
    assert.ok(!text.includes("<")); assert.ok(!text.includes("https://"));
    return JSON.parse(text) as Diagnostic;
  }

  // Real Chromium holds the hidden-pool loading roots through the original 10s predicate deadline.
  const loading = await rejectedClick("loading");
  assert.equal(loading.name, "AssertionError");
  assert.match(loading.message, /DOM condition timeout/);
  const saved = diagnostic(loading);
  assert.ok(saved.node_elapsed_ms >= 10_000, "the original loading gate must not be shortened");
  assert.equal(saved.browser.outcome, "timeout");
  assert.equal(saved.browser.last_blocked?.roots.length, 8);
  assert.equal(saved.browser.last_blocked?.more_roots, true);
  assert.ok(saved.browser.last_blocked?.roots.every(root => root.loading && root.deferred && root.hidden && root.pool));
  assert.deepEqual(saved.browser.last_blocked?.roots.slice(0, 2).map(root => root.kind), ["settings", "plugin"]);
  assert.equal(saved.browser.last_blocked?.ms, saved.browser.ended_ms);
  assert.ok(saved.browser.ended_ms! >= saved.browser.started_ms!);
  assert.equal(recovered, true);
  assert.equal(await b.evaluate("document.querySelectorAll('[data-ui-client-state=loading]').length"), 0);

  // The next command never enters the renderer: its sequence must reject the prior saved timeout snapshot.
  const stale = await rejectedClick("stale");
  assert.strictEqual(stale, primary);
  assert.strictEqual(stale.cause, cause);
  assert.equal(stale.stack, originalStack);
  assert.equal(diagnostic(stale).browser.unavailable, "not-current");

  // Reuse the same Error to cover updating our own configurable property without changing identity or cause.
  const unreadable = await rejectedClick("read-failed");
  assert.strictEqual(unreadable, primary);
  assert.strictEqual(unreadable.cause, cause);
  assert.equal(unreadable.message, "controlled original CDP rejection");
  assert.equal(unreadable.stack, originalStack);
  assert.equal(diagnostic(unreadable).browser.unavailable, "read-failed");
  assert.equal(pointers, 0);
  assert.equal(await b.evaluate("window.__memCiTracePointers"), 0);
});
