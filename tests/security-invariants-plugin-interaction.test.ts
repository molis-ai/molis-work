import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ActionDefinition, ActionLocale } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginInteractionClient, PluginInteractionNextSteps } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxIdentity, SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import type { AssistantCard } from "@molis-ai/molis-work-contracts/services/assistant";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { createPluginPlatform, DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { createSandboxRunner, type SandboxServices } from "@molis-ai/molis-work-plugin-sandbox";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";

// S-56 (specs/repository-anti-corruption/privileges.md PG-062): `services.interaction` draws the platform's question card, action card
// and next-step row for a plugin's own page. It is given to every activation without a permission because it only draws: every string
// the plugin passes comes out escaped, a result link leaving this Home is not drawn, a value of another shape is refused rather than drawn
// half, and drawing writes no record. A sandboxed plugin reaches it through the broker, which takes objects only.

const PROBE = "io.molis.work.example.interaction-probe", ACTOR = "tester", HAN = /[一-鿿]/u;
const HOSTILE = `<script>alert("x")</script>`;
const raw = <T>(value: unknown) => value as T;
const refused = (code: string) => (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === code);

const card = (change: Partial<AssistantCard> = {}): AssistantCard => ({
  card_id: "rename-1", revision: 1, run_id: null, title: "Rename", summary: "Renames the note", provider: "Probe", capability_title: "Rename note",
  capability_id: "probe.rename", effect: "write", fields: [{ key: "name", label: "Name", value: "Plan", editable: false }], missing: [], status: "ready",
  created_at: "2026-10-23T00:00:00.000Z", updated_at: "2026-10-23T00:00:00.000Z", ...change });
const question = (change: Partial<AgentPendingQuestion> = {}): AgentPendingQuestion => ({
  pending_id: "ask-1", kind: "clarification", prompt: "Which plan?", options: [{ value: "a", label: "Plan A" }], allows_free_text: true, ...change });
const hostileCard = card({ card_id: `c1" onclick="steal()`, title: `Rename ${HOSTILE}`, summary: `<img src=x onerror=steal()>`, capability_title: `<b>bold</b>`,
  fields: [{ key: "name", label: `<i>label</i>`, value: `<svg onload=steal()>`, editable: false }], status: "done", outcome: `<u>done</u>`,
  presentation: { summary: "Renamed", title: `<h1>t</h1>`, text: `<iframe src=x>`, link: { label: "Open", href: "javascript:steal()" } } });
const hostileQuestion = question({ pending_id: `q" autofocus onfocus="steal()`, prompt: HOSTILE, options: [{ value: `"><script>`, label: `<img src=x onerror=steal()>` }] });
const hostileSteps: PluginInteractionNextSteps = { questions: [hostileQuestion], cards: [hostileCard], finished: true,
  follow_ups: [{ id: `"><script>x</script>`, label: `<img src=x onerror=steal()>`, source: HOSTILE }] };
const MARKUP = [`<script>alert`, `<script>x`, `<img src=x`, `<svg onload`, `<iframe src`, `<h1>t`, `<b>bold`, `<i>label`, `<u>done`, `onclick="steal`, `onfocus="steal`, "javascript:"];

const draw: ActionDefinition<Record<string, never>, { card: string; question: string; next: string }> = { capability_id: "interaction-probe.draw", version: 1, operation: "query",
  action: { title: "画交互件", description: "用平台的交互渲染画一张操作卡、一个问题和下一步行", kind: "query", scope: "project", audiences: ["user"], permissions: [], subject_kinds: [],
    input_schema: { type: "object", additionalProperties: false } } };

/** A plugin that declares no permission at all: what its activation is given, and an action drawing in the language of its call. */
function probe() {
  const given: { interaction?: PluginInteractionClient } = {};
  const definition: PluginDefinition = {
    manifest: { schema_version: 2, host_api_version: 2, plugin_id: PROBE, version: "1.0.0", name: "Interaction probe", kind: "app",
      publisher: { publisher_id: "example", signature: "interaction-probe" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: [], capabilities: { provides: [], consumes: [] }, actions: [draw], artifacts: { produces: [], consumes: [] }, ui: { contributions: [], views: [] } },
    async start(context) {
      given.interaction = context.services?.interaction;
      const interaction = given.interaction;
      return { kind: "app", views: [], actions: [{ ...draw, handle: async () => {
        assert.ok(interaction);
        return { card: await interaction.cardHtml(card()), question: await interaction.questionHtml(question()),
          next: await interaction.nextStepsHtml({ questions: [], cards: [card()], follow_ups: [{ id: "again", label: "Again", source: "Probe" }] }) };
      } }] };
    },
  };
  return { definition, given };
}

async function withProbe(run: (rig: { interaction: PluginInteractionClient; drawIn(locale: ActionLocale): Promise<{ card: string; question: string; next: string }>; cursor(): unknown }) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), "plugin-interaction-")), databasePath = join(directory, "project.db");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  const options = { db: store.db, appendEvent: (event: Parameters<typeof store.appendEvent>[0]) => store.appendEvent(event), eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const actions = pluginActions(store, DEMO_PROJECT_ID), plugin = probe();
  const platform = createPluginPlatform({ actions, db: store.db, project_id: DEMO_PROJECT_ID, actor_id: ACTOR, artifacts: new ArtifactsModule(options), processItems: new ProcessItemsModule(options),
    ui: new UiHost(), home: null, privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) });
  try {
    const report = await platform.start([{ definition: plugin.definition }]);
    assert.deepEqual(report.failed, []); assert.deepEqual(report.blocked, []);
    assert.ok(plugin.given.interaction, "an activation that declared no permission is given the drawings");
    const caller = { actor_id: ACTOR, project_id: DEMO_PROJECT_ID, audience: "user" as const, permissions: [] };
    const view = (await actions.client.discover(caller)).find(value => value.capability_id === draw.capability_id && value.version === draw.version);
    assert.ok(view, "the running plugin publishes its drawing action in the directory");
    const reference = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
    await run({ interaction: plugin.given.interaction,
      drawIn: async locale => await actions.client.invoke({ ...caller, locale }, reference, {}),
      cursor: () => store.eventCursor(DEMO_PROJECT_ID) });
  } finally {
    await platform.closeCoordination();
    for (const record of platform.runtime.list()) if (record.state === "running") await platform.runtime.stop(record.install_id, { preserve_enabled: true });
    store.close(); rmSync(directory, { recursive: true, force: true });
  }
}

test("S-56 every string a plugin passes is escaped, and a result link leaving this Home is not drawn", async () => {
  await withProbe(async ({ interaction, cursor }) => {
    const before = cursor();
    const drawn = [await interaction.cardHtml(hostileCard), await interaction.questionHtml(hostileQuestion), await interaction.nextStepsHtml(hostileSteps)];
    for (const html of drawn) {
      assert.ok(html.length > 0);
      for (const markup of MARKUP) assert.equal(html.includes(markup), false, `${markup} is drawn as text, not markup`);
    }
    assert.match(drawn[0]!, /&lt;script&gt;alert/u);
    assert.match(drawn[2]!, /&lt;img src=x onerror=steal\(\)&gt;/u);
    // Off this Home is not drawn as a link; a path on it is (the check is not vacuous).
    const away = await interaction.cardHtml(card({ status: "done", presentation: { summary: "Renamed", link: { label: "Open", href: "//evil.example/x" } } }));
    assert.equal(away.includes("evil.example"), false);
    const home = await interaction.cardHtml(card({ status: "done", presentation: { summary: "Renamed", link: { label: "Open", href: "/projects/p/notes/1" } } }));
    assert.match(home, /href="\/projects\/p\/notes\/1"/u);
    assert.deepEqual(cursor(), before, "drawing writes no record");
    assert.ok(Object.isFrozen(interaction));
  });
});

test("S-56 a value of another shape is refused, not drawn half", async () => {
  await withProbe(async ({ interaction }) => {
    const invalid = refused("host.plugin_interaction_invalid");
    await assert.rejects(interaction.cardHtml(raw<AssistantCard>({ ...card(), status: "pwned" })), invalid);
    await assert.rejects(interaction.cardHtml(raw<AssistantCard>({ ...card(), effect: "<b>" })), invalid);
    await assert.rejects(interaction.cardHtml(raw<AssistantCard>({ ...card(), fields: "Name" })), invalid);
    await assert.rejects(interaction.cardHtml(raw<AssistantCard>(null)), invalid);
    await assert.rejects(interaction.questionHtml(raw<AgentPendingQuestion>({ prompt: "Which plan?" })), invalid);
    await assert.rejects(interaction.questionHtml(raw<AgentPendingQuestion>({ ...question(), questions: "all" })), invalid);
    await assert.rejects(interaction.nextStepsHtml(raw<PluginInteractionNextSteps>(null)), invalid);
    await assert.rejects(interaction.nextStepsHtml(raw<PluginInteractionNextSteps>({ questions: [], cards: [{}] })), invalid);
    await assert.rejects(interaction.nextStepsHtml(raw<PluginInteractionNextSteps>({ questions: [], cards: [], follow_ups: [{ id: "again", label: 1, source: "Probe" }] })), invalid);
    // Nested fields are where a top-level check would let a value through and the drawing would throw or draw half (the P3).
    await assert.rejects(interaction.cardHtml(raw<AssistantCard>({ ...card(), fields: [{ key: "name", label: "Name", value: "Plan", editable: "yes" }] })), invalid);
    await assert.rejects(interaction.cardHtml(raw<AssistantCard>({ ...card(), fields: [{ ...card().fields[0]!, options: [{ value: "a", label: 1 }] }] })), invalid);
    await assert.rejects(interaction.cardHtml(raw<AssistantCard>({ ...card(), missing: [{ field: "name" }] })), invalid);
    await assert.rejects(interaction.cardHtml(raw<AssistantCard>({ ...card(), status: "done", presentation: { summary: "Renamed", link: { label: "Open" } } })), invalid);
    await assert.rejects(interaction.questionHtml(raw<AgentPendingQuestion>({ ...question(), options: [{ value: "a", label: 1 }] })), invalid);
    await assert.rejects(interaction.questionHtml(raw<AgentPendingQuestion>({ ...question(), questions: [{ prompt: "Which?" }] })), invalid);
    await assert.rejects(interaction.nextStepsHtml(raw<PluginInteractionNextSteps>({ questions: [], cards: [], finished: "yes" })), invalid);
  });
});

test("S-56 drawn in the language of the plugin's call", async () => {
  await withProbe(async ({ drawIn }) => {
    const zh = await drawIn("zh"), en = await drawIn("en");
    for (const html of Object.values(zh)) assert.match(html, HAN);
    for (const html of Object.values(en)) { assert.ok(html.length > 0); assert.doesNotMatch(html, HAN); }
  });
});

const identity: SandboxIdentity = { projectId: "project-a", installationId: "installation-a", pluginId: "test", namespace: "preview" };
const contract: SandboxPluginContract = { version: 1, pluginId: "test", revision: "one", entities: [], pages: [], acceptance: [],
  operations: [{ id: "run", kind: "command", input: { type: "string" }, output: { type: "string" }, effects: {}, errors: [], examples: [{ input: "", output: "" }] }] };
async function sandboxed(body: string, services: SandboxServices) {
  const directory = await mkdtemp(join(tmpdir(), "sandbox-interaction-")), bundlePath = join(directory, "plugin.mjs");
  await writeFile(bundlePath, body);
  const runner = await createSandboxRunner({ bundlePath, contract, identity, grants: {}, services });
  try { return JSON.parse(await runner.call("run", "") as string) as Record<string, unknown>; } finally { await runner.stop(); await rm(directory, { recursive: true, force: true }); }
}
const mac = { skip: process.platform !== "darwin" };

test("S-56 a sandboxed plugin's drawings cross the broker as objects only, with no grant", mac, async () => {
  const calls: unknown[][] = [];
  const interaction: PluginInteractionClient = {
    async questionHtml(...args) { calls.push(["question", ...args]); return "<q>"; },
    async cardHtml(...args) { calls.push(["card", ...args]); return "<card>"; },
    async nextStepsHtml(...args) { calls.push(["next", ...args]); return "<next>"; },
  };
  const result = await sandboxed(`export const operations={run:async(_,sdk)=>{const out={};
    for(const [name,draw] of [['text',()=>sdk.interaction.cardHtml('a card',{})],['list',()=>sdk.interaction.nextStepsHtml([])],['options',()=>sdk.interaction.questionHtml({pending_id:'q'},'reask')]])
      {try{out[name]=await draw()}catch(e){out[name]=e.code}}
    out.loose=await sdk.interaction.cardHtml({card_id:'c'},{redo:'yes'});
    out.redo=await sdk.interaction.cardHtml({card_id:'c'},{redo:true});
    return JSON.stringify(out)}};`, { interaction });
  assert.deepEqual(result, { text: "sandbox.invalid_request", list: "sandbox.invalid_request", options: "sandbox.invalid_request", loose: "<card>", redo: "<card>" });
  // Only the two well-formed drawings reached the service, an option that is not exactly `true` read as off.
  assert.deepEqual(calls, [["card", { card_id: "c" }, { redo: false }], ["card", { card_id: "c" }, { redo: true }]]);
  const unconnected = await sandboxed(`export const operations={run:async(_,sdk)=>{try{return await sdk.interaction.nextStepsHtml({questions:[],cards:[]})}catch(e){return JSON.stringify({code:e.code})}}};`, {});
  assert.deepEqual(unconnected, { code: "sandbox.service_unavailable" });
});
