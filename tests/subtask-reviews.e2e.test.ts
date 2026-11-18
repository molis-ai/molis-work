import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { assistantReviewHtml } from "@molis-ai/molis-work-app-workbench";
import { ASSISTANT_NEXT_STEP_REVIEW, type AssistantPendingReview } from "@molis-ai/molis-work-contracts/services/assistant";
import { pageText } from "./fixtures/page-text.js";
import { openBoardBrowser } from "./fixtures/board-browser.js";

// Compile the actual Host programs as the browser build does; no new package API exists only for this fixture.
async function clientPiece(file: string, name: string): Promise<string> {
  const bundle = await build({ entryPoints: ["apps/workbench/src/scripts/client/" + file + ".ts"], bundle: true, write: false, format: "cjs", platform: "browser" });
  const module = { exports: {} as Record<string, unknown> };
  runInNewContext(bundle.outputFiles[0]!.text, { module });
  const value = module.exports[name]; assert.equal(typeof value, "string"); return value as string;
}

for (const mode of ["work", "sdk"] as const) test(`SAI-06/08/10/11: ${mode} original review mount keeps its owner through close and A→B→A`, { timeout: 90_000 }, async t => {
  const forms = Object.fromEntries(["a", "b"].map(target => {
    const review: AssistantPendingReview = { review_id: "review-" + target, version: "proposal-" + target, kind: ASSISTANT_NEXT_STEP_REVIEW, run_id: "run-" + target,
      summary: "Continue " + target, fields: [], requested_at: "2026-11-17T00:00:00Z", expires_at: null };
    return [target, { ...review, html: assistantReviewHtml(review, pageText("en")) }];
  }));
  const bundle = await build({ entryPoints: ["tests/fixtures/subtask-review-probe.ts"], bundle: true, write: false, format: "iife", globalName: "ReviewProbe", platform: "browser" });
  const widget = await build({ entryPoints: ["apps/workbench/src/browser/assistant-subtask-reviews.ts"], bundle: true, write: false, format: "iife", globalName: "ReviewWidget", platform: "browser" });
  const [AGENT_REVIEW_CLIENT_FACTORY_SCRIPT, ASSISTANT_REVIEW_PART] = await Promise.all([clientPiece("agent-review", "AGENT_REVIEW_CLIENT_FACTORY_SCRIPT"), clientPiece("assistant-review", "ASSISTANT_REVIEW_PART")]);
  const b = await openBoardBrowser(t, "empty"); if (!b) return;
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/__ui/catalog?lang=en` }, b.sessionId));
  await b.waitFor("globalThis.molisComposerProgram && window.molisFollow");
  await b.evaluate(bundle.outputFiles[0]!.text);
  await b.evaluate(widget.outputFiles[0]!.text);
  await b.evaluate(`(() => {
    const glyph=()=>document.createElement('span'), bindReviewCode=()=>{};
    ${ASSISTANT_REVIEW_PART}
    globalThis.rp=ReviewProbe.mountReviewProbe(${JSON.stringify(mode)}, ${JSON.stringify(forms)},
      { mountPluginClient: (${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})(), reviews: (${AGENT_REVIEW_CLIENT_FACTORY_SCRIPT}) },
      { mount:mountWorkReview, retitle:retitleReviewText }, ReviewWidget.assistantSubtaskReviews);
    return rp.open('a');
  })()`);
  const approve = mode === "work" ? "#review-probe [data-assistant-decision=approve]" : "#review-probe [data-agent-review-approve]";
  await b.waitFor(`Boolean(document.querySelector(${JSON.stringify(approve)}))`);
  if (mode === "sdk") {
    await b.click(approve); await b.waitFor("Boolean(document.querySelector('dialog[open]'))");
    await b.evaluate("rp.handle.close()");
    await b.waitFor("!document.querySelector('dialog[open]')");
    assert.equal(await b.evaluate("rp.calls.length"), 0, "closing while confirming cannot submit the decision");
    await b.evaluate("rp.open('a')"); await b.waitFor(`Boolean(document.querySelector(${JSON.stringify(approve)}))`);
    await b.click("#review-probe [data-agent-review-remember]");
  }
  await b.evaluate("rp.gate=rp.block()"); await b.click(approve);
  if (mode === "sdk") { await b.waitFor("Boolean(document.querySelector('dialog[open]'))"); await b.click("dialog[open] .mw-btn--primary"); }
  await b.waitFor("rp.calls.length===1");
  const submitted = await b.evaluate<{ path: string; body: Record<string, unknown> }>("({path:rp.calls[0].path,body:rp.calls[0].body})");
  assert.equal(submitted.body.version, "proposal-a", "the original owner receives the version the person saw");
  assert.match(submitted.path, mode === "work" ? /^\/works\/a\/reviews\/review-a$/ : /\/sdk-subtasks\/parent-run\/a\/reviews\/review-a$/);
  if (mode === "sdk") { assert.equal(submitted.body.remember, "session"); assert.deepEqual(submitted.body.child_run, { run_id: "run-a", session_id: "session-a" }); }
  else assert.deepEqual((submitted.body.subtask as { run: unknown }).run, { run_id: "run-a", session_id: "session-a" });
  await b.evaluate("rp.open('b')"); await b.waitFor("rp.root.querySelector('textarea.mw-composer__input')?.value === 'b draft'");
  await b.evaluate("rp.open('a')"); await b.waitFor(`Boolean(document.querySelector(${JSON.stringify(approve)}))`);
  assert.equal(await b.evaluate("rp.calls[0].signal.aborted"), true, "the old detail releases its own POST lifetime");
  await b.evaluate("rp.gate.resolve()");
  await b.evaluate("new Promise(resolve=>setTimeout(resolve,80))");
  assert.deepEqual(await b.evaluate("rp.refreshes"), [], "a late accepted receipt does not refresh a replacement A mount");
  assert.equal(await b.evaluate("rp.calls.length"), 1, "reopening only reads original facts");
  if (mode === "sdk") {
    const reads = await b.evaluate<string[]>("rp.reads");
    assert.ok(reads.every(path => path.startsWith("/projects/original-project/api/agent/reviews?") && !path.includes("run_session_id")));
    assert.ok(reads.some(path => path.includes("run_id=run-b")));
  }
  await b.evaluate("rp.dispose()");
});
