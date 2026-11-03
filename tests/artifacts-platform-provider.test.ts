import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { ActionError, type ActionCallContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionService } from "@molis-ai/molis-work-kernel";
import {
  ARTIFACT_ACTIONS, ARTIFACT_ACTION_PERMISSIONS, ARTIFACTS_PROVIDER_ID, ARTIFACTS_PROVIDER_TITLE, ArtifactsModule, createArtifactsSchema,
} from "@molis-ai/molis-work-module-artifacts";
import { createContextLedgerSchema } from "@molis-ai/molis-work-module-context-ledger";
import { HOST_PLUGIN_IDS, artifactActionProvider, liveHostJudgmentRuleAuthoringCatalog, localOwnerPermissionsOver } from "@molis-ai/molis-work-app-local-host";
import { MemoryPluginRuntimeRepository, PluginRuntime, UNSIGNED_TRUST } from "@molis-ai/molis-work-plugin-runtime";
import { SearchService } from "@molis-ai/molis-work-service-search";
import { openTextSearchIndex } from "@molis-ai/molis-work-storage";
import { eventCursorOf, pinnedArtifact } from "./fixtures/artifacts.js";

// PG-077 step 1 (specs/repository-anti-corruption/slices/pg077-artifacts-provider.md): the 成果库 is the platform's own provider, under the
// id it was called by as a plugin. Grants, workflow references and the search index name a provider by id, so none of them changes.

const projectId = "artifacts-platform-project";
const person: ActionCallContext = { actor_id: "web-user", project_id: projectId, audience: "user", permissions: ["artifacts:read", "search:read"] };
const FINGERPRINT = `ed25519:sha256:${"c".repeat(64)}`;

/** The registration the Host makes (`artifactActionProvider`), read off the real function with a runtime that has no database behind it. */
function hostRegistration(artifacts: ArtifactsModule, db: Database.Database): ActionProviderRegistration {
  const runtime = { project_id: projectId, artifacts, store: { db }, coordinator: { goalQueries: { getGoal: () => null } } };
  return artifactActionProvider(runtime as never, {});
}

function openProject() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec("CREATE TABLE project_root (project_id TEXT PRIMARY KEY); INSERT INTO project_root VALUES ('artifacts-platform-project'); CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL)");
  createArtifactsSchema(db);
  createContextLedgerSchema(db);
  const artifacts = new ArtifactsModule({ db, now: () => "2026-10-26T00:00:00.000Z",
    appendEvent: event => Number(db.prepare("INSERT INTO events (project_id) VALUES (?)").run(event.projectId).lastInsertRowid), eventCursor: eventCursorOf(db) });
  artifacts.commands.registerVersion({ project_id: projectId, actor_id: person.actor_id, artifact_id: "plan", version: 1, artifact_type_id: "io.example.report", schema_version: 1,
    producer: { plugin_id: "io.example.producer", plugin_version: "1.0.0", binding_signature: "binding" }, ...pinnedArtifact("季度计划"),
    content: { kind: "inline", payload: { title: "季度计划", content: "平台提供方" } } });
  return { db, artifacts };
}

/** The registration it had as a plugin, for the comparison: the same handlers and definitions, the old kind and `plugin_id`. */
function asPlugin(host: ActionProviderRegistration): ActionProviderRegistration {
  return { ...host, provider: { provider_id: ARTIFACTS_PROVIDER_ID, plugin_id: ARTIFACTS_PROVIDER_ID, title: ARTIFACTS_PROVIDER_TITLE, kind: "plugin", project_id: projectId } };
}

async function hitsOf(t: test.TestContext, registration: (host: ActionProviderRegistration) => ActionProviderRegistration) {
  const { db, artifacts } = openProject();
  const home = await mkdtemp(join(tmpdir(), "artifacts-platform-provider-"));
  const actions = new ActionService();
  actions.registerProvider(registration(hostRegistration(artifacts, db)));
  const index = openTextSearchIndex({ homeDirectory: home });
  const search = new SearchService({ index, clock: () => 1_000_000, freshMs: 3_000, budgetMs: 5_000, refreshDelayMs: 5, indexer: async () => ({ client: actions, caller: person }) });
  t.after(async () => { await search.close(); index.close(); db.close(); await rm(home, { recursive: true, force: true }); });
  return { actions, hits: (await search.query({ client: actions, caller: person }, { query: "季度计划" })).hits };
}

test("RAC-1040 the Host registers the 成果库 as a platform provider under its historical id, with the same 17 actions", async t => {
  const { actions } = await hitsOf(t, host => host);
  const rows = await actions.discover({ ...person, permissions: ARTIFACT_ACTION_PERMISSIONS });
  const own = rows.filter(row => row.provider.provider_id === ARTIFACTS_PROVIDER_ID);
  assert.deepEqual(own.map(row => `${row.capability_id}@${row.version}`).sort(), ARTIFACT_ACTIONS.map(row => `${row.capability_id}@${row.version}`).sort());
  assert.equal(own.length, 17);
  for (const row of own) {
    assert.equal(row.provider.kind, "system"); assert.equal(row.provider.plugin_id, undefined); assert.equal(row.provider.plugin_install_id, undefined);
    assert.equal(row.provider.project_id, projectId); assert.equal("words_of" in row.provider, false, "platform text uses the Workbench dictionary");
  }
  assert.equal(ARTIFACTS_PROVIDER_ID, "io.molis.work.artifacts", "the id is the one grants and workflow references already name");
});

test("RAC-1043 the person at this computer holds the 成果库's permissions over its provider, and nothing over a provider the Host has no row for", () => {
  for (const definition of ARTIFACT_ACTIONS) {
    const held = localOwnerPermissionsOver(ARTIFACTS_PROVIDER_ID, definition.action.permissions);
    for (const permission of definition.action.permissions) assert.ok(held.includes(permission), `${definition.capability_id} asks ${permission}`);
  }
  // The refusals: a permission held over one provider is not held over another, and an unknown provider gives the person nothing.
  assert.deepEqual(localOwnerPermissionsOver("system.not-registered", ARTIFACT_ACTION_PERMISSIONS), []);
  assert.ok(!localOwnerPermissionsOver("io.molis.work.characters", ARTIFACT_ACTION_PERMISSIONS).includes("artifacts:write"));
  assert.ok(!localOwnerPermissionsOver("io.molis.work.artifacts.x", ARTIFACT_ACTION_PERMISSIONS).length, "a nested id is not the provider's");
});

test("RAC-2343 RAC-1045 an install that is not of the Host's build cannot take the 成果库's id or nest under it, whichever its trust", async () => {
  assert.ok(HOST_PLUGIN_IDS.has(ARTIFACTS_PROVIDER_ID), "the id stays reserved by the Host's build");
  const manifest = (pluginId: string, signature: string): PluginManifest => ({ schema_version: 2, host_api_version: 2, plugin_id: pluginId, version: "1.0.0", name: "Squatter",
    kind: "app", publisher: { publisher_id: "squatter", signature }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] } });
  const definition = (value: PluginManifest): PluginDefinition => ({ manifest: value, async start() { return { kind: "app", views: [] }; }, async stop() {} });
  for (const id of [ARTIFACTS_PROVIDER_ID, `${ARTIFACTS_PROVIDER_ID}.x`]) {
    for (const [trust, signature] of [[UNSIGNED_TRUST, "squatter-label"], [{ level: "pinned", publisher_key_id: FINGERPRINT } as const, FINGERPRINT]] as const) {
      const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { hostIds: HOST_PLUGIN_IDS });
      await assert.rejects(Promise.resolve().then(() => runtime.install({ definition: definition(manifest(id, signature)), deployment: "local", grants: [], trust })),
        (error: unknown) => error instanceof ActionError && error.code === "plugin.id_namespace_conflict", `${id} as ${trust.level}`);
      assert.equal(runtime.list().length, 0, "the refusal leaves no installation");
    }
  }
});

test("RAC-1046 the search index names the 成果库 by the same plugin id, and a hit keeps the same reference, as the plugin registration gave", async t => {
  const platform = await hitsOf(t, host => host), plugin = await hitsOf(t, asPlugin);
  assert.equal(platform.hits.length, 1);
  assert.deepEqual(platform.hits.map(hit => ({ hit_id: hit.hit_id, plugin_id: hit.plugin_id, plugin_title: hit.plugin_title, source: hit.source })),
    plugin.hits.map(hit => ({ hit_id: hit.hit_id, plugin_id: hit.plugin_id, plugin_title: hit.plugin_title, source: hit.source })));
  assert.equal(platform.hits[0]!.plugin_id, "io.molis.work.artifacts");
});

test("RAC-1048 the person's permissions over the 成果库 come from the module's actions, not from the built-in Manifest", () => {
  const source = readFileSync(new URL("../apps/local-host/src/local-owner-permissions.ts", import.meta.url), "utf8");
  assert.ok(source.includes("[ARTIFACTS_PROVIDER_ID, ARTIFACT_ACTION_PERMISSIONS]"), "an explicit row, so deleting the Manifest takes nothing with it");
  assert.deepEqual([...new Set(ARTIFACT_ACTIONS.flatMap(row => row.action.permissions))].sort(), [...ARTIFACT_ACTION_PERMISSIONS].sort());
});

test("RAC-1049 the judgment rule authoring catalog lists the 成果库's actions as the platform's, not as a plugin's", async t => {
  const { actions } = await hitsOf(t, host => host);
  const directory = await actions.discover({ ...person, audience: "agent" });
  const behaviors = liveHostJudgmentRuleAuthoringCatalog(directory).behaviors.filter(behavior => "action_ref" in behavior && behavior.action_ref.provider_id === ARTIFACTS_PROVIDER_ID);
  assert.ok(behaviors.length > 0, "the Agent can be offered 成果库 actions");
  for (const behavior of behaviors) { assert.equal(behavior.source, "system"); assert.equal(behavior.plugin_id, ARTIFACTS_PROVIDER_ID); assert.equal(behavior.plugin_title, ARTIFACTS_PROVIDER_TITLE); }
});
