import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, DEMO_PROJECT_ID, seedDemoBoard, releaseProjectPlugins, handleProjectPluginHttp, runWithLocale, L, NEXT_STEP, agentQuestionHtml, assistantCardHtml, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { CODING_NEXT_STEP, codingRouteActions } from "@molis-ai/molis-work-plugin-coding";
import { actionCardView, type ActionCard } from "@molis-ai/molis-work-plugin-sdk";
import type { ActionLocale, ActionView, ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentHostCapabilities as agent, type AgentRunOffer, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";

// specs/repository-anti-corruption PG-062 (C7, plugin half), slice 4b: Coding's round questions, its suggestions' cards and the
// row beside its composer are drawn by the platform's `services.interaction`, asked by Coding on what its routes answer its page.
// The server here runs no Coding route hooks, so nothing else could have drawn them.
const HAN = /[一-鿿]/u;
const WRITE: ActionView = { capability_id: "fixture.notes.write", version: 1, operation: "command",
  provider: { provider_id: "fixture.notes", kind: "plugin", title: "Notes" }, availability: { available: true },
  action: { title: "Save a note", description: "Store a note", kind: "operation", scope: "project", audiences: ["agent"], permissions: [], subject_kinds: [],
    input_schema: { type: "object", properties: { text: { type: "string", title: "Text" } }, required: ["text"], additionalProperties: false } } };
const reference: ExactActionReference = { capability_id: WRITE.capability_id, version: WRITE.version, provider_id: WRITE.provider.provider_id };
const offer: AgentRunOffer = { offer_id: "offer-1", offered_at: "2026-10-23T00:00:30.000Z", title: "Save <b>this</b> note", summary: "Store the minutes",
  reference, input: { text: "send the minutes" }, editable: ["text"], action_digest: "digest" };
const question: AgentPendingQuestion = { pending_id: "p1", kind: "plan-choice", prompt: "Retry <i>three</i> times or fail at once?",
  options: [{ value: "retry", label: "Retry" }, { value: "fail", label: "Fail" }], allows_free_text: true };

const run = (run_id: string, phase: AgentRunView["phase"], extra: Partial<AgentRunView> = {}): AgentRunView => ({
  ref: { session_id: "sdk", run_id }, phase, started_at: "2026-10-23T00:00:00Z", ended_at: phase === "awaiting-input" ? null : "2026-10-23T00:01:00Z",
  frozen: { role_id: "builder", role_version: 1, execution: "read-only", model_id: "fixture-model", prompts: [], skills: [], mcp_tools: [], host_tools: [], text_materials: [], budget: null, action_tools: [reference] },
  turns: [{ turn_id: `${run_id}-0`, kind: "user", text: "fix it", at: null }], activity: [], usage: { tokens: { input: 0, output: 0 } }, awaiting_input: [], ...extra,
} as AgentRunView);

type Round = { ref: { run_id: string }; awaiting_input: Array<AgentPendingQuestion & { html?: string }>; cards: Array<ActionCard & { run_id: string; html?: string }>; next_html?: string };
type ReadBody = { runs: Round[] };
const ids = (html: string) => [...html.matchAll(/data-ix-step-id="([^"]*)"/g)].map(match => match[1]!.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
const strip = <T extends object>(value: T) => { const { html: _html, ...rest } = value as T & { html?: string }; return rest; };

test("PG062-11, PG062-12: Coding's routes answer its page with its questions, cards and next-step row drawn by the platform, in the page's language; a call of the action gets none", async () => {
  const home = mkdtempSync(join(tmpdir(), "coding-interaction-html-")), dbPath = join(home, "board.db");
  await seedConfiguredModels(home); seedDemoBoard(dbPath);
  const store = new LocalProjectDatabase(dbPath), sessions = codingSessions(store), actions = pluginActions(store, DEMO_PROJECT_ID);
  await sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "app", title: "cards", runtime_id: "prologue", at: "2026-10-23T00:00:00Z" });
  await sessions.setRuntimeSession(noEffect, DEMO_PROJECT_ID, "app", "sdk", "2026-10-23T00:00:00Z");
  const runs = [
    run("ask", "awaiting-input", { awaiting_input: [question], offers: [offer] }),
    run("fixed", "reconcile-required", { activity: [{ call_id: "w1", name: "edit", target: "src/a.ts", state: "completed", summary: "", at: null }] } as Partial<AgentRunView>),
  ];
  const host = () => ({ store, ...openProjectVersionStores(store), homeDirectory: home, projectId: DEMO_PROJECT_ID, actions, actorId: "web-user",
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    capabilities: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      const values = args as ReadonlyArray<{ session_id?: string; run_id?: string }>;
      if (definition.capability_id === agent.readSession.capability_id) return { runs: runs.map(entry => entry.ref) } as Output;
      if (definition.capability_id === agent.readRun.capability_id) return structuredClone(runs.find(entry => entry.ref.run_id === values[1]?.run_id)) as Output;
      if (definition.capability_id === agent.listSubagents.capability_id) return [] as Output;
      if (definition.capability_id === agent.listActions.capability_id) return [WRITE] as Output;
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } },
  });
  // No Coding route hooks: whatever markup the page gets, Coding asked for.
  const server = createServer((request, response) => {
    const locale = request.headers["x-page-locale"] === "en" ? "en" : "zh";
    void runWithLocale(locale, () => handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), host())).catch(error => {
      response.writeHead(500); response.end(String(error));
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const read = async (locale: ActionLocale): Promise<ReadBody> => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/app`, { headers: { "x-page-locale": locale } });
    const body = await response.json() as ReadBody;
    assert.equal(response.status, 200, JSON.stringify(body));
    return body;
  };
  try {
    const drawnIn: Partial<Record<ActionLocale, ReadBody>> = {};
    for (const locale of ["zh", "en"] as const) {
      const page = drawnIn[locale] = await read(locale);
      const ask = page.runs.find(entry => entry.ref.run_id === "ask")!, fixed = page.runs.find(entry => entry.ref.run_id === "fixed")!;
      // PG062-11: the question card the Assistant shows, asked again on Coding's page; the suggestion's card as the Assistant draws it.
      const [asked] = ask.awaiting_input, [card] = ask.cards;
      assert.equal(asked!.html, runWithLocale(locale, () => agentQuestionHtml(strip(asked!) as AgentPendingQuestion, L, undefined, undefined, true)), `the question card (${locale})`);
      assert.match(asked!.html!, /Retry &lt;i&gt;three&lt;\/i&gt;/); assert.doesNotMatch(asked!.html!, /<i>three/, "the question is escaped");
      assert.equal(card!.html, runWithLocale(locale, () => assistantCardHtml(actionCardView(strip(card!) as ActionCard & { run_id: string }), L, undefined, false)), `the card (${locale})`);
      assert.match(card!.html!, /Save &lt;b&gt;this&lt;\/b&gt; note/); assert.doesNotMatch(card!.html!, /<b>this/, "the card is escaped");
      assert.deepEqual(fixed.cards, [], "a round without suggestions has no cards");
      // PG062-12: each round's row: the waiting round's question and card, the ended round's own follow-ups in Coding's words.
      assert.equal(card!.card_id, "card-offer-1");
      assert.deepEqual(ids(ask.next_html!), [NEXT_STEP.choose("p1", "pick", "retry"), NEXT_STEP.choose("p1", "pick", "fail"), NEXT_STEP.run("card-offer-1")],
        `the question's options, then the card that waits; a live round has no follow-ups yet (${locale})`);
      assert.deepEqual(ids(fixed.next_html!), [CODING_NEXT_STEP.recover("fixed"), CODING_NEXT_STEP.changes("fixed")]);
      if (locale === "en") {
        assert.match(fixed.next_html!, /Check and continue/); assert.match(fixed.next_html!, /View changes/);
        assert.doesNotMatch(fixed.next_html!.replace(/<[^>]*>/g, ""), HAN, "the English page gets an English row");
      } else assert.match(fixed.next_html!, /核对并继续/);
    }
    assert.notEqual(drawnIn.zh!.runs[0]!.awaiting_input[0]!.html, drawnIn.en!.runs[0]!.awaiting_input[0]!.html, "the language is the page's");

    // A model, a workflow or MCP reading the same action gets the round and its question, nothing drawn. (Without the suggestion,
    // so this read lands no card: what a call may write is coding-action-cards' to say.)
    delete runs[0]!.offers;
    const caller = { actor_id: "web-user", project_id: DEMO_PROJECT_ID, audience: "agent" as const, permissions: ["artifact:read"] };
    const direct = await actions.client.invoke(caller, codingRouteActions["coding.read-session"]!.definition, { session_id: "app", window: 5 }) as ReadBody;
    assert.equal(direct.runs.length, 2);
    for (const round of direct.runs) {
      assert.equal(round.next_html, undefined, round.ref.run_id);
      assert.ok((round.awaiting_input ?? []).every(entry => entry.html === undefined) && (round.cards ?? []).every(entry => entry.html === undefined), round.ref.run_id);
    }
    assert.equal(direct.runs.find(entry => entry.ref.run_id === "ask")!.awaiting_input.length, 1, "the question itself is there");
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); rmSync(home, { recursive: true, force: true });
  }
});

test("PG062-13: the Host no longer decorates Coding's answers, and a project route takes no hook after the plugin answered", () => {
  // coding-surface.ts is gone (PG-036 C9); what took over its stage and route work must not use these names either.
  const surface = ["project-plugin-stages.ts", "project-plugin-input-refresh.ts"].map(file => readFileSync(new URL(`../apps/local-host/src/${file}`, import.meta.url), "utf8")).join("\n");
  for (const name of ["decorateCodingResult", "codingNextSteps", "afterDispatch", "agentQuestionHtml", "assistantCardHtml", "cardView", "renderInteractionNextSteps", "codingFollowUps"]) {
    assert.equal(surface.includes(name), false, `the Host's stage and route code no longer uses ${name}`);
  }
  const entry = readFileSync(new URL("../apps/local-host/src/project-plugin-http.ts", import.meta.url), "utf8");
  assert.match(entry, /export type ProjectPluginRouteHooks = \(route: ProjectPluginRoute\) => Pick<RuntimePluginRouteHooks, "beforeDispatch">;/);
  assert.doesNotMatch(entry, /around\.afterDispatch/);
  // Coding words its own follow-ups: the workbench's dictionary no longer carries them for it.
  const gap = readFileSync(new URL("../apps/workbench/src/i18n/renderer-gap-en.ts", import.meta.url), "utf8");
  assert.doesNotMatch(gap, /plugins\/native\/coding\/src\/next-steps\.ts|这一轮改过的文件/);
});
