import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ActionCallContext, ActionLocale } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest, PluginOutputsClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { FILE_SNAPSHOT_TYPE } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { createPluginPlatform, DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { createDiffPlugin, DIFF_LABELS, DIFF_PLUGIN_ID, diffActions, type DiffView } from "@molis-ai/molis-work-plugin-diff";
import { renderDiff } from "@molis-ai/molis-work-plugin-sdk/diff-view";
import { createTextStatsPlugin, TEXT_STATS_PLUGIN_ID, textStatsActions, renderTextStats, type TextStatsView } from "@molis-ai/molis-work-plugin-text-stats";
import { escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";
import { pageText } from "./fixtures/page-text.js";
import { diffPageText } from "./fixtures/diff-page-text.js";

// specs/repository-anti-corruption/privileges.md PG-062 (C7, the plugin half): Diff and Text Stats draw their own `/state` answer for a
// page, in the page's language, with their own words; the Host no longer decorates their route results.

const SOURCE = "io.molis.work.state-html-source", ACTOR = "tester", HAN = /[一-鿿]/;
const type = { artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: 1 };
const snapshot = (text: string) => ({ workspace: { workspace_id: "ws", name: "Project" }, path: ["a.ts"], text });
/** What the Host drew before: the page's translator, the design system's escape and icons. */
const pagePrimitives = (locale: ActionLocale) => ({ escape: escapeHtml, text: pageText(locale), icon: (name: string) => icon(name as Parameters<typeof icon>[0]) });
/** The same for Diff: its sentences with values in them matched to its messages first, as the Host's Diff renderer did. */
const diffPrimitives = (locale: ActionLocale) => ({ ...pagePrimitives(locale), text: diffPageText(locale) });

const source: PluginDefinition & { outputs?: PluginOutputsClient } = {
  manifest: {
    schema_version: 2, host_api_version: 2, plugin_id: SOURCE, version: "1.0.0", name: SOURCE, kind: "app",
    publisher: { publisher_id: "molis", signature: `${SOURCE}-binding` },
    entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: "artifact:write", required: true, reason: "Hand on a snapshot" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
    process_items: { produces: [type], consumes: [] }, ui: { contributions: [], views: [] },
    ports: { inputs: [], outputs: [{ port: "after", ...type }] },
  } satisfies PluginManifest,
  async start(context) { assert.ok(context.services?.outputs); source.outputs = context.services.outputs; return { kind: "app", views: [] }; },
};

type Platform = { invoke<Output>(definition: typeof diffState | typeof statsState, caller: Partial<ActionCallContext>): Promise<Output>; publish(text: string): void; pinBefore(text: string): void };

async function withPlatform(run: (project: Platform) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), "companion-state-html-")), databasePath = join(directory, "project.db");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  const options = { db: store.db, appendEvent: (event: Parameters<typeof store.appendEvent>[0]) => store.appendEvent(event), eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const artifacts = new ArtifactsModule(options), actions = pluginActions(store, DEMO_PROJECT_ID);
  const platform = createPluginPlatform({ actions, db: store.db, project_id: DEMO_PROJECT_ID, actor_id: ACTOR, artifacts, processItems: new ProcessItemsModule(options),
    ui: new UiHost(), home: null, privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) });
  try {
    const report = await platform.start([{ definition: source }, { definition: createDiffPlugin(), trust: { level: "host" } }, { definition: createTextStatsPlugin(), trust: { level: "host" } }]);
    assert.deepEqual(report.failed, []); assert.deepEqual(report.blocked, []);
    platform.wiring.selectInputGroup(DIFF_PLUGIN_ID, "snapshots");
    for (const [target, port] of [[DIFF_PLUGIN_ID, "after"], [TEXT_STATS_PLUGIN_ID, "text"]] as const) platform.wiring.bind({ project_id: DEMO_PROJECT_ID, actor_id: ACTOR,
      target_plugin_id: target, target_port: port, source_plugin_id: SOURCE, source_port: "after", origin: "user" });
    await run({
      invoke: async <Output>(definition: typeof diffState | typeof statsState, caller: Partial<ActionCallContext>) =>
        await actions.client.invoke({ actor_id: ACTOR, project_id: DEMO_PROJECT_ID, audience: "user", permissions: ["artifact:read"], ...caller }, definition, {}) as Output,
      publish: text => { source.outputs!.publish({ port: "after", content: { kind: "inline", payload: snapshot(text) } }); },
      pinBefore: text => {
        const artifact = artifacts.commands.registerVersion({ ...pinnedArtifact("before"), project_id: DEMO_PROJECT_ID, actor_id: ACTOR, artifact_id: "before", version: 1, ...type,
          producer: { plugin_id: "io.molis.work.files", plugin_version: "1.0.0", binding_signature: "official-files-binding" },
          content: { kind: "inline", payload: snapshot(text) } }).artifact;
        platform.wiring.bindArtifact({ target_plugin_id: DIFF_PLUGIN_ID, target_port: "before", actor_id: ACTOR, artifact_id: artifact.artifact_id, version: artifact.version });
      },
    });
  } finally {
    await platform.closeCoordination();
    for (const record of platform.runtime.list()) if (record.state === "running") await platform.runtime.stop(record.install_id, { preserve_enabled: true });
    store.close(); rmSync(directory, { recursive: true, force: true });
  }
}

const diffState = { ...diffActions.state, provider_id: DIFF_PLUGIN_ID }, statsState = { ...textStatsActions.state, provider_id: TEXT_STATS_PLUGIN_ID };

test("PG062-01, PG062-02: a page's diff.state and text-stats.state carry the plugin's own markup, in the page's language", async () => {
  await withPlatform(async project => {
    // Nothing bound yet: each answers with its own empty block.
    for (const locale of ["zh", "en"] as const) {
      const stats = await project.invoke<{ view: TextStatsView; html: string }>(statsState, { locale });
      assert.equal(stats.view.phase, "waiting");
      assert.equal(stats.html, renderTextStats({ view: stats.view, primitives: pagePrimitives(locale) }));
      assert.match(stats.html, /mw-empty[\s\S]*#icon-hash/);
      const diff = await project.invoke<{ view: DiffView; html: string }>(diffState, { locale });
      assert.equal(diff.html, renderDiff({ labels: DIFF_LABELS, view: diff.view, primitives: diffPrimitives(locale) }));
      assert.match(diff.html, /#icon-git-compare/);
    }
    project.pinBefore("original <b>\n"); project.publish("changed <b>\n");
    for (const locale of ["zh", "en"] as const) {
      const diff = await project.invoke<{ view: DiffView; html: string }>(diffState, { locale });
      assert.equal(diff.view.phase, "ready");
      assert.equal(diff.html, renderDiff({ labels: DIFF_LABELS, view: diff.view, primitives: diffPrimitives(locale) }), `diff.state draws the same comparison the Host drew (${locale})`);
      assert.match(diff.html, /original &lt;b&gt;/); assert.doesNotMatch(diff.html, /original <b>/, "a line's text is escaped");
      const stats = await project.invoke<{ view: TextStatsView; html: string }>(statsState, { locale });
      assert.equal(stats.view.phase, "ready");
      assert.equal(stats.html, renderTextStats({ view: stats.view, primitives: pagePrimitives(locale) }), `text-stats.state draws the same counts the Host drew (${locale})`);
      if (locale === "en") for (const html of [diff.html, stats.html]) assert.doesNotMatch(html.replace(/<[^>]*>/g, ""), HAN, "the English page gets English words");
    }
    // Coding's, Files' and Git's pages read both through their consumer declarations, so the call reaches them as a plugin's (#1018):
    // the same markup in the page's language, where the Host used to draw it.
    for (const definition of [diffState, statsState]) for (const locale of ["zh", "en"] as const) {
      const page = await project.invoke<{ html: string }>(definition, { locale });
      const consumed = await project.invoke<{ html: string }>(definition, { audience: "plugin", locale });
      assert.equal(consumed.html, page.html, `${definition.capability_id} draws the same markup for a consuming plugin's page (${locale})`);
    }
    // No language from the page (no cookie, no Accept-Language): the plugins' Chinese, as the Host's default was.
    const plain = await project.invoke<{ view: TextStatsView; html: string }>(statsState, {});
    assert.equal(plain.html, renderTextStats({ view: plain.view, primitives: pagePrimitives("zh") }));
  });
});

test("PG062-03: a model, a workflow or an MCP client reads the view alone, and both outputs declare the optional markup (V-16)", async () => {
  for (const definition of [diffActions.state, textStatsActions.state]) {
    const schema = definition.action.output_schema as { properties: Record<string, unknown>; required: readonly string[]; additionalProperties: boolean };
    assert.deepEqual(schema.properties.html, { type: "string" }); assert.deepEqual(schema.required, ["view"]); assert.equal(schema.additionalProperties, false);
  }
  await withPlatform(async project => {
    project.pinBefore("a\n"); project.publish("b\n");
    for (const audience of ["agent", "workflow", "mcp"] as const) for (const definition of [diffState, statsState]) {
      const result = await project.invoke<Record<string, unknown>>(definition, { audience, locale: "en" });
      assert.deepEqual(Object.keys(result), ["view"], `${definition.capability_id} for ${audience} carries no page markup`);
    }
  });
});

test("PG062-04: the Host no longer names Diff or Text Stats to decorate their route results or a page's action answers", () => {
  // coding-surface.ts is gone (PG-036 C9); what took over its stage and route work must not use these names either.
  const surface = ["project-plugin-stages.ts"].map(file => readFileSync(new URL(`../apps/local-host/src/${file}`, import.meta.url), "utf8")).join("\n");
  for (const name of ["DIFF_PLUGIN_ID", "TEXT_STATS_PLUGIN_ID", "renderTextStats", "decorateRuntimeResult", "decorateCompanionState"]) {
    assert.equal(surface.includes(name), false, `the Host's stage and route code no longer uses ${name}`);
  }
  // A plugin page's action (Files, Git or Coding reading diff.state or text-stats.state) returns what the plugin drew; the Host
  // adds nothing after the call (tests/security-invariants-plugin-pages.test.ts SYS-15-U5 reads the markup through that path).
  const pageActions = readFileSync(new URL("../apps/local-host/src/plugin-page-http.ts", import.meta.url), "utf8");
  assert.doesNotMatch(pageActions, /coding-surface|decorateCompanionState|renderDiff|renderTextStats/u,
    "plugin-page-http.ts returns a page action's answer as the plugin drew it");
});
