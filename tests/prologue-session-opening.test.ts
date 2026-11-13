import { build } from "esbuild";
import { CODING_STYLES } from "@molis-ai/molis-work-plugin-coding";
import { openStudioChrome } from "./fixtures/plugin-builder-browser.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import type { AgentRunView, AgentRunHandle } from "@molis-ai/molis-work-contracts/services/agent-host";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));
const app = { appId: "io.molis.work.c3-opening", appVersion: "1.0.0" };
const owner = { project_id: "p", plugin_id: "coding", install_id: "i", actor_id: "person" };
const role = { role_id: "reader", version: 1, workspace: "none" as const, execution: "read-only" as const, host_tools: [], prompts: [] };
const text = (body: string) => JSON.stringify(JSON.parse(body).messages);
async function ended(adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>>, handle: AgentRunHandle): Promise<AgentRunView> {
  for (const deadline = Date.now() + 10_000; Date.now() < deadline;) {
    const view = await adapter.read(handle.ref);
    if (["completed", "cancelled", "failed", "stopped"].includes(view.phase)) return view;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Run did not finish");
}
async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "molis-c3-opening-")), requests: string[] = [];
  const server = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk; requests.push(body);
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end('data: {"choices":[{"index":0,"delta":{"content":"ORDINARY_REPLY"},"finish_reason":null}]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const open = () => createPrologueNodeAdapter({ app, storageRoot: home, modelConfiguration: async () => ({ protocol: "openai-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/chat/completions`, model: "scripted", credential_ref: "fixture" }), resolveCredential: () => "fixture" });
  const start = (adapter: Awaited<ReturnType<typeof open>>, session: { runtime_id: string; session_id: string }, task: string) => adapter.start({ ...owner, session, workspace: "none", role_id: "reader", role, task });
  return { home, requests, open, start, async close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(home, { recursive: true, force: true }); } };
}

/** Historical Session fixture uses public SDK Session adoption and encrypted Host storage, never a product test branch. */
async function legacy(home: string, frozen: AgentRunView["frozen"], words: string[], mode: "valid" | "missing" | "duplicate" | "child" = "valid") {
  const host = createNodeHost({ storageRoot: home });
  const runtime = await createRuntime({ app, host, preset: "local-agent" });
  try {
    const session = await runtime.sessions.create();
    const run = { kind: "run", id: "legacy-run", revision: 1 } as const;
    const events = [...words.map(word => ({ type: "prompt", role: "user", text: word, atMs: 1 })),
      { type: "prompt", role: "user", source: "peer", text: "LEGIT_PEER", atMs: 1 },
      { type: "text-delta", text: "ORDINARY_REPLY" }, { type: "completed" }];
    await session.adoptRun(run, events);
    const raw = await session.exportPackage();
    const kind = `molis-agent-index-${createHash("sha256").update(app.appId).digest("hex").slice(0, 24)}`;
    const attempt = { run_id: run.id, task: mode === "missing" ? "" : "EXACT_CALLER", frozen, started_at: "2026-11-04T00:00:00.000Z" };
    await host.storage.commit({ kind, id: session.ref.id, expectedVersion: 0, metadata: { schema: 1 }, secureBody: new TextEncoder().encode(JSON.stringify({ schema: 1, workspace: "none", ref: session.ref, owner, title: "Legacy", ...(mode === "child" ? { parent_run: { session_id: "parent", run_id: "parent-run" } } : {}), attempts: mode === "duplicate" ? [attempt, { ...attempt }] : [attempt] })) });
    return { session: { runtime_id: "prologue", session_id: session.ref.id }, ref: session.ref, run, raw };
  } finally { await runtime.shutdown(); }
}

test("old extra opening stays readable but is absent from next and restarted model payload; omission is a notice", { timeout: 40_000 }, async () => {
  const f = await fixture(); let adapter = await f.open();
  try {
    const source = await adapter.createSession({ ...owner, workspace: "none", title: "Template" });
    const first = await ended(adapter, await f.start(adapter, source, "new caller")); assert.equal(first.phase, "completed");
    await adapter.close();
    const old = await legacy(f.home, first.frozen, ["EXACT_CALLER", "UNKNOWN_OLD_MEMORY"]);
    adapter = await f.open();
    const raw = await adapter.read({ session_id: old.ref.id, run_id: old.run.id });
    assert.ok(raw.turns.some(turn => turn.text.includes("UNKNOWN_OLD_MEMORY")), "raw user-visible history remains available");
    const second = await ended(adapter, await f.start(adapter, old.session, "new followup")); assert.equal(second.phase, "completed", second.stop_reason);
    const sent = text(f.requests.at(-1)!);
    assert.match(sent, /EXACT_CALLER/); assert.match(sent, /LEGIT_PEER/); assert.match(sent, /ORDINARY_REPLY/);
    assert.doesNotMatch(sent, /UNKNOWN_OLD_MEMORY/);
    const notice = second.turns.find(turn => turn.kind === "notice" && /旧|背景/.test(turn.text));
    assert.ok(notice, "the actual omission event must be visible");
    // Draw the actual projected turn with the production renderer and its shipped styles in a real browser.
    const profile = await mkdtemp(join(tmpdir(), "molis-c3-notice-browser-"));
    const browser = await openStudioChrome(profile); assert.ok(browser, "a dedicated test browser is required");
    try {
      const page = await browser.page();
      const bundle = await build({ entryPoints: ["plugins/native/coding/src/browser/main/run-turn.ts"], bundle: true, write: false, platform: "browser", format: "iife", globalName: "C3Turn" });
      await page.evaluate(bundle.outputFiles[0]!.text);
      const visible = await page.evaluate<{ text: string; visible: boolean }>(`(() => {
        const style = document.createElement('style'); style.textContent = ${JSON.stringify(CODING_STYLES)}; document.head.append(style);
        document.body.style.cssText='--muted:#555;--line:#ccc;--ink:#111;background:white;color:#111;padding:32px';
        const block = document.createElement('section'); document.body.append(block);
        const page = { host: { receipts: { line: () => null } }, s: { renderedText: new WeakMap(), current: '' }, turns: [],
          refs: { plans: { renderTurn: () => false }, writerDirectories: { renderTurn: () => false }, inputReceipts: { act: () => () => {} } } };
        const run = ${JSON.stringify(second)};
        const node = C3Turn.turnNode(page, block, ${JSON.stringify(notice)}, run, [run]); block.append(node);
        return { text: node.innerText, visible: node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden' };
      })()`);
      assert.equal(visible.text, notice.text); assert.equal(visible.visible, true);
      const evidence = join(REVIEW_EVIDENCE, "memory-session-opening");
      await mkdir(evidence, { recursive: true });
      await page.screenshot(join(evidence, "history-notice.png"));
    } finally { await browser.close(); await rm(profile, { recursive: true, force: true }); }
    await adapter.close(); adapter = await f.open();
    const restored = await adapter.read(second.ref);
    assert.deepEqual(restored.turns.filter(turn => turn.kind === "notice"), second.turns.filter(turn => turn.kind === "notice"));
    await ended(adapter, await f.start(adapter, old.session, "third followup")); assert.doesNotMatch(text(f.requests.at(-1)!), /UNKNOWN_OLD_MEMORY/);
    await adapter.close();
    const sdk = await createRuntime({ app, host: createNodeHost({ storageRoot: f.home }), preset: "local-agent" });
    try {
      const session = await sdk.sessions.open(old.ref); assert.ok(session);
      const current = await session.exportPackage();
      assert.deepEqual(current.runs.find((run: { runId: string }) => run.runId === old.run.id), old.raw.runs.find((run: { runId: string }) => run.runId === old.run.id), "old ledger export bytes and event ordering are unchanged");
    } finally { await sdk.shutdown(); }
  } finally { await adapter.close(); await f.close(); }
});

for (const mode of ["missing", "duplicate", "child", "ambiguous"] as const) test(`unattributable ${mode} opening refuses continuation without hiding raw history or sending`, { timeout: 30_000 }, async () => {
  const f = await fixture(); let adapter = await f.open();
  try {
    const source = await adapter.createSession({ ...owner, workspace: "none", title: "Template" });
    const first = await ended(adapter, await f.start(adapter, source, "new")); await adapter.close();
    const old = await legacy(f.home, first.frozen, mode === "ambiguous" ? ["EXACT_CALLER", "UNKNOWN", "EXACT_CALLER"] : ["EXACT_CALLER", "UNKNOWN"], mode === "ambiguous" ? "valid" : mode);
    adapter = await f.open();
    assert.ok((await adapter.read({ session_id: old.ref.id, run_id: old.run.id })).turns.some(turn => turn.text === "UNKNOWN"));
    const count = f.requests.length;
    await assert.rejects(f.start(adapter, old.session, "followup"), (e: unknown) => e instanceof Error && "code" in e && e.code === "agent.capability_unavailable" && /原记录仍可查看/.test(e.message) && /请新建会话并补充必要背景/.test(e.message));
    assert.equal(f.requests.length, count);
    assert.ok((await adapter.read({ session_id: old.ref.id, run_id: old.run.id })).turns.some(turn => turn.text === "UNKNOWN"));
  } finally { await adapter.close(); await f.close(); }
});


test("new caller task stays distinct from raw original through continued_from and ordinary intentional repetition", { timeout: 30_000 }, async () => {
  const f = await fixture(); let adapter = await f.open();
  try {
    const session = await adapter.createSession({ ...owner, workspace: "none", title: "New exact task" });
    const first = await ended(adapter, await adapter.start({ ...owner, session, workspace: "none", role_id: "reader", role, task: "ASSEMBLED_CALLER_TASK",
      original_input: { input_id: "original-one", text: "RAW_PERSON_WORDS", written_by: "host", occurred_at: "2026-11-04T00:00:00.000Z" } }));
    const second = await ended(adapter, await adapter.start({ ...owner, session, workspace: "none", role_id: "reader", role, task: "CONTINUATION_CALLER_TASK", continued_from: first.ref }));
    assert.equal(second.phase, "completed", second.stop_reason);
    assert.equal(second.original_input?.text, "RAW_PERSON_WORDS");
    assert.match(text(f.requests.at(-1)!), /ASSEMBLED_CALLER_TASK/); assert.match(text(f.requests.at(-1)!), /CONTINUATION_CALLER_TASK/); assert.doesNotMatch(text(f.requests.at(-1)!), /RAW_PERSON_WORDS/);
    await adapter.close(); adapter = await f.open();
    const third = await ended(adapter, await f.start(adapter, session, "I intentionally repeat UNKNOWN_OLD_MEMORY as my own new instruction"));
    assert.equal(third.phase, "completed", third.stop_reason);
    assert.match(text(f.requests.at(-1)!), /I intentionally repeat UNKNOWN_OLD_MEMORY/);
  } finally { await adapter.close(); await f.close(); }
});
