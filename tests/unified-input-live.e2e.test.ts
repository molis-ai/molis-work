import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { withConnectorConnections, createLocalFeedApplication, createLocalFeedSourceService, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { CodexAppServerTransport, CodexRuntimeSessionAdapter } from "@molis-ai/molis-work-service-runtime-host";
import type { AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
const live = process.env.MOLIS_WORK_LIVE_ACCEPTANCE === "1";
const key = process.env.MINIMAX_API_KEY;
async function eventually<T>(read: () => Promise<T>, ready: (value: T) => boolean): Promise<T> {
  for (const deadline = Date.now() + 90_000; ;) {
    const value = await read();
    if (ready(value)) return value;
    assert.ok(Date.now() < deadline, `Live result did not settle: ${JSON.stringify(value)}`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}
async function sendTwice(b: Browser, field: string, text: string) {
  await b.click(field);
  await b.command("Input.insertText", { text }, b.sessionId);
  for (let attempt = 0; attempt < 2; attempt++) {
    await b.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", modifiers: 2, windowsVirtualKeyCode: 13 }, b.sessionId);
    await b.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, b.sessionId);
  }
}
async function openProject(b: Browser) {
  await b.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/` }, b.sessionId));
  await b.waitFor("!!document.querySelector('[data-assistant-input]')");
}

// UIV-01/03/04: the actual composers and Host deliver to a real provider, then clear only accepted drafts.
test("UIV-03 live Assistant and Coding preserve complete input and send once to MiniMax", { skip: !live || !key, timeout: 240_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded"); if (!b) return;
  const endpoint = "https://api.minimaxi.com/anthropic";
  await runWithMolisWorkHome(b.homeDirectory, () => withMolisWorkProjectCatalog({ homeDirectory: b.homeDirectory }, catalog => {
    const connection = withConnectorConnections(b.homeDirectory, store => {
      const created = store.createToken({ serviceId: "model-api", displayName: "Live MiniMax acceptance", token: key! });
      store.assertTarget(created.connection_id, "model-api", endpoint); return created;
    });
    catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "live-minimax", display_name: "Live MiniMax", base_url: endpoint,
      api_format: "anthropic-messages", models: [{ model_id: "MiniMax-M3", enabled: true }] });
  }));
  await openProject(b);
  const marker = `UIV_${randomUUID().replaceAll("-", "")}`;
  const text = `这是隔离集成测试，不调用工具，不保存记忆。\n只回复 ${marker}。`;
  await sendTwice(b, "[data-assistant-input]", text);
  await b.waitFor("document.querySelector('[data-assistant-input]').value === ''", 30_000);
  const workId = await b.evaluate<string>("localStorage.getItem('molis.assistant.current')");
  assert.ok(workId);
  const view = await eventually(() => b.evaluate<AssistantWorkView>(`fetch('/api/assistant/works/${workId}').then(r => r.json())`), value => value.rounds?.[0]?.phase === "completed");
  assert.equal(view.rounds.length, 1, "two shortcuts create exactly one persisted round");
  assert.equal(view.rounds[0]!.text, text);
  assert.ok(view.rounds[0]!.turns.filter(turn => turn.kind === "assistant").some(turn => turn.text.includes(marker)), "actual provider reply contains the unique marker");
  assert.equal(view.work.draft, "");
  await b.waitFor(`document.querySelector('[data-assistant-panel]').textContent.includes(${JSON.stringify(marker)})`);
  await b.click("[data-assistant-panel-close]");

  const workspace = join(b.homeDirectory, "live-coding-workspace"); await mkdir(workspace);
  await b.click(".navigator-project-settings");
  await b.waitFor("!!document.querySelector('[data-directory-panel=project-settings] [data-settings-section=workspaces]')");
  await b.click("[data-directory-panel=project-settings] [data-settings-section=workspaces]");
  await b.waitFor("!!document.querySelector('[data-project-workspaces-add]') && !document.querySelector('[data-project-workspaces-refresh]').disabled");
  await b.click("[data-project-workspaces-add] [name=path]");
  await b.command("Input.insertText", { text: workspace }, b.sessionId);
  await b.click("[data-project-workspaces-add] [type=submit]");
  await b.waitFor("document.querySelector('[data-project-workspaces-list]').textContent.includes('live-coding-workspace')");
  await b.click('[data-plugin-strip] [data-plugin-id="coding"]');
  await b.waitFor("document.querySelector('[data-work-surface=coding]')?.getBoundingClientRect().width > 100");
  await b.click("[data-coding-new]");
  await b.waitFor("!document.querySelector('[data-coding-task]').disabled");
  await b.evaluate(`(() => { for (const [selector,value] of [['[data-coding-model]',JSON.stringify(['live-minimax','MiniMax-M3'])],['[data-coding-intent]','discuss']]) {
    const node=document.querySelector(selector); node.value=value; node.dispatchEvent(new Event('change',{bubbles:true})); } })()`);
  const codingText = `不要调用工具或修改文件。\n只回复 CODING_${marker}。`;
  await sendTwice(b, "[data-coding-task]", codingText);
  const id = await b.evaluate<string>("document.querySelector('[data-coding-composer]').dataset.uivKey");
  assert.ok(id);
  const coding = await eventually(() => b.evaluate<{ runs: AgentRunView[]; draft: string }>(`fetch('/projects/${b.projectId}/api/plugins/io.molis.work.coding/sessions/${id}').then(r => r.json())`), value => value.runs?.[0]?.phase === "completed");
  assert.equal(coding.runs.length, 1);
  assert.ok(coding.runs[0]!.turns.filter(turn => turn.kind === "assistant").some(turn => turn.text.includes(`CODING_${marker}`)));
  assert.equal(coding.draft, "");
  await b.waitFor(`document.querySelector('[data-coding-workbench]').textContent.includes(${JSON.stringify(`CODING_${marker}`)})`);
  await b.reloadPage();
  assert.equal((await b.evaluate<AssistantWorkView>(`fetch('/api/assistant/works/${workId}').then(r=>r.json())`)).work.draft, "");
  t.diagnostic(JSON.stringify({ provider: "MiniMax-M3", assistant: "one completed round, exact multiline input, empty saved draft", coding: "one completed round, real reply, empty saved draft", reload: true }));
});

// UIV-03: Home's original subject and multiline words reach the selected real Codex session, once.
test("UIV-03 live Home composer sends its subject and complete words to one real Codex session", { skip: !live, timeout: 150_000 }, async t => {
  const cwd = await mkdtemp(join(tmpdir(), "uiv-live-codex-"));
  const transport = new CodexAppServerTransport({ clientVersion: "0.3.0-live-test" });
  const adapter = new CodexRuntimeSessionAdapter(transport);
  let threadId = "";
  t.after(async () => { if (threadId) await transport.request("thread/archive", { threadId }).catch(() => undefined); transport.close(); await rm(cwd, { recursive: true, force: true }); });
  const created = await adapter.invoke("create", { cwd, approvalPolicy: "never", sandbox: "read-only", baseInstructions: "Isolated acceptance test: use no tools, read no files, only reply with the literal requested by the user." });
  assert.equal(created.status, "ok");
  if (created.status !== "ok") return;
  threadId = (created.value as { thread: { id: string } }).thread.id;
  const b = await openGoalBrowser(t, "seeded", undefined, null, transport); if (!b) return;
  assert.ok(b.localHost); assert.ok(b.projectId);
  const resources = await b.localHost.sessionResources();
  const selected = resources.registry.createSession({ runtime_id: "codex", native_runtime_session_id: threadId, project_id: b.projectId, title: "Live input acceptance", actor_id: "browser-test", user_confirmed: true });
  const feed = createLocalFeedApplication(b.store.db);
  const source = createLocalFeedSourceService(b.store.db, b.projectId).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "uiv-live" }).source;
  const marker = `HOME_${randomUUID().replaceAll("-", "")}`;
  const item = feed.ingestItem({ source, externalId: marker, title: "隔离输入测试", summary: "测试目标与原文", body: `上下文校验：${marker}`, occurredAt: new Date().toISOString(), attention: false }).item;
  await feed.flushPendingJudgments();
  await b.localHost.withProject(molisWorkHostProjectReference({ databasePath: b.databasePath, projectId: b.projectId }), () => undefined);
  await openProject(b);
  const selector = `[data-home-subject-kind=feed_item][data-home-subject-id="${item.item_id}"]`;
  await b.waitFor(`!!document.querySelector(${JSON.stringify(selector)})`);
  await b.click(selector); await b.click("[data-home-open-talk]");
  await b.waitFor("!!document.querySelector('[name=talk-session]:not(:disabled)')");
  await b.click(`[name=talk-session][value="${selected.session_id}"]`);
  const text = `这是隔离测试，不执行工具。\n只回复上下文校验中的 HOME_ 开头标记。`;
  await sendTwice(b, "[data-home-talk-form] textarea", text);
  await b.waitFor("document.querySelector('.home-talk-status').textContent.includes('已被会话接收')", 30_000);
  assert.equal(await b.evaluate("document.querySelector('[data-home-talk-form] textarea').value"), "");
  type Thread = { thread: { turns: Array<{ status: string; items: Array<{ type: string; text?: string; content?: unknown }> }> } };
  const read = await eventually(() => transport.request("thread/read", { threadId, includeTurns: true }) as Promise<Thread>, value => value.thread.turns.length > 0 && value.thread.turns.every(turn => turn.status === "completed"));
  assert.equal(read.thread.turns.length, 1);
  const items = read.thread.turns[0]!.items;
  const received = JSON.stringify(items.filter(item => item.type === "userMessage"));
  assert.ok(received.includes(marker));
  assert.ok(received.includes(text.replaceAll("\n", "\\n")));
  assert.ok(items.some(item => item.type === "agentMessage" && item.text?.includes(marker)));
  assert.equal(resources.registry.eventCount(selected.session_id), 1);
  t.diagnostic(JSON.stringify({ runtime: "codex", oneTurn: true, completeSubjectAndText: true, realReply: true, draftCleared: true }));
});
