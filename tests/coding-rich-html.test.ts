import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { LocalProjectDatabase, DEMO_PROJECT_ID, seedDemoBoard, releaseProjectPlugins, handleProjectPluginHttp, runWithLocale, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { CODING_WORKBENCH_CLIENT_FACTORY_SCRIPT, HISTORY_DIGEST_MARKER, codingRouteActions } from "@molis-ai/molis-work-plugin-coding";
import { renderRichText } from "@molis-ai/molis-work-plugin-sdk/rich-text";
import { agentHostCapabilities as agent, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { pluginActions, withFakeAgentHost } from "./fixtures/plugin-actions.js";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";

// specs/repository-anti-corruption PG-062 (C7, plugin half), slice 2: Coding draws the model's words as rich text itself, with the
// plugin SDK's `/rich-text`, on what its routes answer its page; the Host adds none of it. The server here runs no Coding route hooks.
const root = fileURLToPath(new URL("..", import.meta.url));

type Turn = { kind: string; text: string; html?: string };
type ReadBody = {
  runs: Array<{ ref: { run_id: string }; turns?: Turn[]; fingerprint?: string; unchanged?: boolean }>;
  subagents: Array<{ run_id: string; children: Array<{ subagent_id: string; result: string | null; result_html?: string }> }>;
};
type ReportBody = { report: { body_markdown: string; run_id: string }; html: string };

const run = (run_id: string, role_id: string, turns: Array<{ kind: "user" | "assistant"; text: string }>): AgentRunView => ({
  ref: { session_id: "sdk", run_id }, phase: "completed", started_at: "2026-10-23T00:00:00Z", ended_at: "2026-10-23T00:01:00Z",
  frozen: { role_id, role_version: 1, execution: "read-only", model_id: "fixture-model", prompts: [], skills: [], mcp_tools: [], host_tools: [], text_materials: [], budget: null },
  turns: turns.map((turn, index) => ({ turn_id: `${run_id}-${index}`, ...turn, at: null })),
  activity: [], usage: { tokens: { input: 0, output: 0 } }, awaiting_input: [],
});

test("PG062-05, PG062-06: Coding's routes answer its page with the model's words drawn by the SDK; a call of the action gets the words alone", async () => {
  const home = mkdtempSync(join(tmpdir(), "coding-rich-html-")), dbPath = join(home, "board.db");
  await seedConfiguredModels(home); seedDemoBoard(dbPath);
  const store = new LocalProjectDatabase(dbPath), sessions = codingSessions(store), actions = pluginActions(store, DEMO_PROJECT_ID);
  await sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "app", title: "富文本", runtime_id: "prologue", at: "2026-10-23T00:00:00Z" });
  await sessions.setRuntimeSession(noEffect, DEMO_PROJECT_ID, "app", "sdk", "2026-10-23T00:00:00Z");
  const digest = `${HISTORY_DIGEST_MARKER}前 3 轮的 **摘要**`;
  const answer = "[retained current assistant run:4-1ab] [historical assistant run:2-9cd]\n[retained tool-result call:7]\n**完成**：见 [附注] 与 `cart.js`。<script>bad()</script>";
  const runs = [
    run("talk", "builder", [{ kind: "user", text: digest }, { kind: "user", text: "请看 **这里**" }, { kind: "assistant", text: answer }]),
    run("writers", "writers", [{ kind: "user", text: "分给两个子任务" }, { kind: "assistant", text: "正文里的 [retained assistant] 不算开头。" }]),
  ];
  const children = [{ subagent_id: "done", role_id: "writer", role_name: "子任务", state: "completed", task: "写测试", result: "子任务 **写好了**<img src=x onerror=bad()>", workspace_path: home },
    { subagent_id: "quiet", role_id: "writer", role_name: "子任务", state: "running", task: "等着", result: null, workspace_path: home }];
  const host = () => ({ store, ...openProjectVersionStores(store), homeDirectory: home, projectId: DEMO_PROJECT_ID, actions, actorId: "web-user",
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    agentHost: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      const values = args as ReadonlyArray<{ session_id?: string; run_id?: string }>;
      if (definition.capability_id === agent.readSession.capability_id) return { runs: runs.map(entry => entry.ref) } as Output;
      if (definition.capability_id === agent.readRun.capability_id) return structuredClone(runs.find(entry => entry.ref.run_id === values[1]?.run_id)) as Output;
      if (definition.capability_id === agent.listSubagents.capability_id) return structuredClone(children) as Output;
      if (definition.capability_id === agent.listActions.capability_id) return [] as Output;
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } },
  });
  const server = createServer((request, response) => {
    const locale = request.headers["x-page-locale"] === "en" ? "en" : "zh";
    void runWithLocale(locale, () => handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), withFakeAgentHost(host()))).catch(error => {
      response.writeHead(500); response.end(String(error));
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const read = async <Body>(suffix: string, locale = "zh"): Promise<Body> => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/app${suffix}`, { headers: { "x-page-locale": locale } });
    assert.equal(response.status, 200, `${suffix}: ${response.status === 200 ? "ok" : await response.clone().text()}`);
    return await response.json() as Body;
  };
  try {
    // PG062-05: a turn's html is the SDK's rendering of its text; a digest round's opening is drawn by the page and gets none.
    const page = await read<ReadBody>("");
    const [opening, asked, answered] = page.runs.find(entry => entry.ref.run_id === "talk")!.turns!;
    assert.equal(opening!.html, undefined, "a digest round's opening is not rendered twice");
    assert.equal(asked!.html, renderRichText("请看 **这里**"));
    // Compaction labels the model copied at the very start are dropped; the answer as the model wrote it is kept.
    assert.equal(answered!.text, answer);
    assert.equal(answered!.html, renderRichText("**完成**：见 [附注] 与 `cart.js`。<script>bad()</script>"));
    assert.doesNotMatch(answered!.html!, /retained|historical|<script>/u);
    const kept = page.runs.find(entry => entry.ref.run_id === "writers")!.turns!.at(-1)!;
    assert.equal(kept.html, renderRichText("正文里的 [retained assistant] 不算开头。"), "a label inside the answer stays");

    // PG062-06: a subagent's result and a round's report are drawn by Coding too.
    const [done, quiet] = page.subagents.find(group => group.run_id === "writers")!.children;
    assert.equal(done!.result_html, renderRichText(children[0]!.result));
    assert.doesNotMatch(done!.result_html!, /onerror/u);
    assert.equal(quiet!.result_html, undefined, "no result, nothing drawn");
    for (const [locale, source] of [["zh", "来自本轮执行 talk"], ["en", "From run talk"]] as const) {
      const report = await read<ReportBody>("/runs/talk/report", locale);
      assert.ok(report.html.includes(`<div class="coding-report-body mw-prose">${renderRichText(report.report.body_markdown)}</div>`), locale);
      assert.ok(report.html.includes(source), `the report says where it came from in the page's language (${locale})`);
    }

    // The html goes on after a round's fingerprint is taken: a round the page holds still travels as its fingerprint alone.
    const windowed = await read<ReadBody>("?window=5");
    const talk = windowed.runs.find(entry => entry.ref.run_id === "talk")!;
    assert.ok(talk.fingerprint && talk.turns?.at(-1)?.html);
    const again = await read<ReadBody>(`?window=5&known=${talk.fingerprint}`);
    assert.deepEqual(again.runs.find(entry => entry.ref.run_id === "talk"), { ref: talk.ref, fingerprint: talk.fingerprint, unchanged: true });

    // A model, a workflow or MCP reading the same action gets the words alone, with the same fingerprint.
    const caller = { actor_id: "web-user", project_id: DEMO_PROJECT_ID, audience: "agent" as const, permissions: ["artifact:read"] };
    const direct = await actions.client.invoke(caller, codingRouteActions["coding.read-session"]!.definition, { session_id: "app", window: 5 }) as ReadBody;
    const plain = direct.runs.find(entry => entry.ref.run_id === "talk")!;
    assert.equal(plain.fingerprint, talk.fingerprint);
    assert.ok(plain.turns!.every(turn => turn.html === undefined));
    assert.ok(direct.subagents.every(group => group.children.every(child => child.result_html === undefined)));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); rmSync(home, { recursive: true, force: true });
  }
});

test("PG062-07: the Markdown parser and sanitizer stay on Coding's server side, and the Host no longer declares them", () => {
  // What each library leaves in any bundle that carries it: a string literal minifying keeps.
  const coding = createRequire(join(root, "plugins/native/coding/package.json"));
  const parsers = /markedjs|disallowedTagsMode/u;
  assert.match(readFileSync(coding.resolve("marked"), "utf8"), /markedjs/u);
  assert.match(readFileSync(coding.resolve("sanitize-html"), "utf8"), /disallowedTagsMode/u);
  assert.doesNotMatch(readFileSync(join(root, "plugins/native/coding/dist/workbench-bundle.js"), "utf8"), parsers, "workbench-bundle.js");
  assert.doesNotMatch(CODING_WORKBENCH_CLIENT_FACTORY_SCRIPT, parsers);
  const hostManifest = JSON.parse(readFileSync(join(root, "apps/local-host/package.json"), "utf8")) as { dependencies?: Record<string, string> };
  for (const name of ["marked", "sanitize-html"]) assert.equal(hostManifest.dependencies?.[name], undefined, `the Host declares no ${name}`);
  const hostSources = join(root, "apps/local-host/src");
  const rendering = readdirSync(hostSources, { recursive: true, encoding: "utf8" }).filter(name => name.endsWith(".ts"))
    .filter(name => readFileSync(join(hostSources, name), "utf8").includes("plugin-sdk/rich-text"));
  assert.deepEqual(rendering, [], "the Host renders no rich text for a plugin");
});
