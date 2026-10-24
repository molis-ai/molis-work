import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest, PluginProcessItemInput } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { ArtifactsModule, ProcessItemsModule, createPluginArtifactOperations } from "@molis-ai/molis-work-module-artifacts";
import { DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { pinnedArtifact } from "./fixtures/artifacts.js";
import { artifactPreview } from "./fixtures/artifact-preview.js";
import { pluginActions } from "./fixtures/plugin-actions.js";

const PLUGIN = "io.molis.work.operations-test";
const TYPE = "example.note";
const ITEM = "example.item";
const ACTOR = "installed-person";

function manifest(): PluginManifest {
  const preview = artifactPreview(PLUGIN, TYPE);
  return { schema_version: 2, host_api_version: 2, plugin_id: PLUGIN, version: "1.0.0", name: "Operations test", kind: "app",
    publisher: { publisher_id: "molis", signature: "test-binding" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: ["artifact:read", "artifact:write"].map(permission => ({ permission, required: true, reason: "Fixed versions" })),
    capabilities: { provides: [], consumes: [] }, ui: { contributions: [] }, actions: [preview.definition],
    artifacts: { produces: [preview.type], consumes: [{ artifact_type_id: TYPE, schema_version: 1 }] },
    process_items: { produces: [{ artifact_type_id: ITEM, schema_version: 1 }], consumes: [{ artifact_type_id: ITEM, schema_version: 1 }] } };
}

function harness() {
  const directory = mkdtempSync(join(tmpdir(), "molis-artifact-operations-"));
  const file = join(directory, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const ports = { db: store.db, appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event),
    eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const api = new ArtifactsModule({ ...ports, homeOwner: "home-person" });
  const process = new ProcessItemsModule(ports);
  const grants = new Set(["artifact:read", "artifact:write"]);
  const authorized: string[] = [];
  let author: string | undefined;
  let callerCurrent = true;
  const operations = (declaration = manifest(), actor_id = ACTOR, project_id = DEMO_PROJECT_ID) => createPluginArtifactOperations({
    api, process, manifest: declaration, actor_id, project_id, author: () => author, assertInput: assertActionInput,
    assertCallerCurrent() { if (!callerCurrent) throw new ActionError("actions.forbidden", "Caller revoked"); },
    authorize(permission) {
      authorized.push(permission);
      if (!grants.has(permission)) throw new ActionError("actions.forbidden", "Grant revoked");
    },
  });
  const snapshot = () => ({ artifacts: api.query.listArtifacts(DEMO_PROJECT_ID), process: process.query.listArtifacts(DEMO_PROJECT_ID),
    cursor: store.eventCursor(DEMO_PROJECT_ID) });
  return { store, api, process, grants, authorized, operations, snapshot, setAuthor(value: string) { author = value; },
    revokeCaller() { callerCurrent = false; },
    close() { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}

const item = (artifact_id: string, version = 1): PluginProcessItemInput => ({ artifact_id, version, artifact_type_id: ITEM, schema_version: 1,
  content: { kind: "inline", payload: { note: `${artifact_id} v${version}` } } });
const artifact = (artifact_id: string, version = 1) => ({ ...item(artifact_id, version), artifact_type_id: TYPE, ...pinnedArtifact(`${artifact_id} v${version}`) });
const denied = (error: unknown) => error instanceof ActionError && error.code === "artifacts.plugin_denied";
const incompatible = (error: unknown) => error instanceof ActionError && error.code === "artifacts.plugin_incompatible";
const inputInvalid = (error: unknown) => error instanceof ActionError && error.code === "actions.input_invalid";

test("W5-01-D1-01 W5-01-D1-04 W5-01-D1-06: direct owner operations preserve writes and identity without registering a provider", () => {
  const rig = harness();
  try {
    const actions = pluginActions(rig.store, DEMO_PROJECT_ID);
    const caller = { actor_id: ACTOR, project_id: DEMO_PROJECT_ID, audience: "system" as const, permissions: ["*"] };
    const directory = actions.registry.discover(caller);
    const declaration = manifest(), ops = rig.operations(declaration);
    declaration.publisher.signature = "mutated-after-creation";
    declaration.artifacts.produces.length = 0;
    declaration.process_items!.produces.length = 0;
    assert.deepEqual(actions.registry.discover(caller), directory, "an owner operation does not create an SDK provider");
    const forged = { project_id: "other-project", actor_id: "other-actor", owner_actor_id: "other-owner", scope: "team_project",
      producer: { plugin_id: "other", plugin_version: "99", binding_signature: "other" }, team_share_authorized: true };
    const cursor = rig.store.eventCursor(DEMO_PROJECT_ID);
    const published = ops.client.publish({ ...artifact("note"), ...forged });
    const recorded = ops.process.record({ ...item("step"), ...forged });
    for (const record of [published.artifact, recorded.artifact]) {
      assert.equal(record.project_id, DEMO_PROJECT_ID);
      assert.equal(record.created_by, ACTOR);
      assert.equal(record.producer_plugin_id, PLUGIN);
      assert.equal(record.producer_plugin_version, "1.0.0");
      assert.equal(record.producer_binding_signature, "test-binding");
      assert.equal(record.scope, "personal");
    }
    assert.equal(published.artifact.owner_actor_id, "home-person");
    assert.equal(recorded.artifact.owner_actor_id, ACTOR);
    assert.equal(published.replayed, false);
    assert.equal(recorded.replayed, false);
    assert.ok(published.observed_event_cursor > cursor);
    assert.ok(recorded.observed_event_cursor > published.observed_event_cursor);
    const before = rig.snapshot();
    assert.equal(ops.client.publish(artifact("note")).replayed, true);
    assert.equal(ops.process.record(item("step")).replayed, true);
    assert.deepEqual(rig.snapshot(), before);
    assert.deepEqual(ops.client.read(published.artifact), published.artifact);
    assert.deepEqual(ops.client.readOwn(published.artifact), published.artifact);
    assert.deepEqual(ops.client.head("note"), { version: 1, source_revision: 1 });
    assert.deepEqual(ops.process.readOwn(recorded.artifact), recorded.artifact);
    assert.equal(rig.operations(manifest(), ACTOR, "another-project").process.head("step"), null);
  } finally { rig.close(); }
});

test("W5-01-D1-02: process recovery uses only its store, producer signature and personal owner across upgrades", () => {
  const rig = harness();
  try {
    const declaration = manifest();
    declaration.artifacts.consumes = [];
    declaration.process_items!.consumes = [];
    const ops = rig.operations(declaration);
    assert.equal(ops.process.head("missing"), null);
    assert.equal(ops.process.readOwn({ artifact_id: "missing", version: 1 }), null);
    const report = ops.client.publish(artifact("artifact-only")).artifact;
    assert.equal(ops.process.head(report.artifact_id), null);
    assert.equal(ops.process.readOwn(report), null);
    const first = ops.process.record(item("process-only")).artifact;
    const second = ops.process.record(item("process-only", 2)).artifact;
    assert.equal(ops.client.head(first.artifact_id), null);
    assert.equal(ops.client.readOwn(first), null);
    assert.equal(ops.process.readOwn({ ...first, version: 3 }), null);
    assert.deepEqual(ops.process.head(first.artifact_id), { version: 2 });
    rig.process.commands.archiveVersion({ ...first, actor_id: ACTOR });
    rig.process.commands.markUnavailable({ ...second, actor_id: ACTOR, reason: "Removed source" });
    assert.equal(ops.process.readOwn(first)?.lifecycle_state, "archived");
    assert.equal(ops.process.readOwn(second)?.availability, "unavailable");
    assert.deepEqual(ops.process.head(first.artifact_id), { version: 2 });
    assert.throws(() => ops.client.read(first), incompatible);
    const upgrade = { ...declaration, version: "2.0.0" };
    assert.deepEqual(rig.operations(upgrade).process.readOwn(first), ops.process.readOwn(first));
    assert.deepEqual(rig.operations(upgrade).process.head(first.artifact_id), { version: 2 });
    for (const foreign of [rig.operations({ ...declaration, plugin_id: "io.molis.other" }),
      rig.operations({ ...declaration, publisher: { ...declaration.publisher, signature: "different" } }),
      rig.operations(declaration, "other-person")]) {
      assert.throws(() => foreign.process.head(first.artifact_id), denied);
      assert.throws(() => foreign.process.readOwn(first), denied);
    }
    const changedSignature = rig.operations({ ...declaration, publisher: { ...declaration.publisher, signature: "different" } }, "other-person");
    // RAC-411 (PG-107): an artifact line is the caller's own by plugin ID and publisher signature, the same rule as a process item.
    assert.throws(() => changedSignature.client.readOwn(report), denied, "RAC-411: same ID, different signature cannot read the artifact");
    assert.throws(() => changedSignature.client.head(report.artifact_id), denied, "RAC-411: same ID, different signature cannot head the artifact line");
    assert.deepEqual(rig.operations(upgrade).client.readOwn(report), report, "RAC-411: the same ID and signature still reads its own line across upgrades");
    assert.deepEqual(rig.operations(declaration, "other-person").client.head(report.artifact_id), { version: 1, source_revision: 1 }, "RAC-411: an artifact has no per-actor owner");
    assert.throws(() => rig.operations({ ...declaration, plugin_id: "io.molis.other" }).client.readOwn(report), denied);
  } finally { rig.close(); }
});

test("W5-01-D1-04: author attribution keeps Module ownership and the process recovery owner boundary", () => {
  const rig = harness();
  try {
    const ops = rig.operations();
    rig.setAuthor("actual-action-caller");
    const report = ops.client.publish(artifact("by-caller")).artifact;
    const step = ops.process.record(item("by-caller-process")).artifact;
    assert.equal(report.created_by, "actual-action-caller");
    assert.equal(report.owner_actor_id, "home-person");
    assert.equal(step.created_by, "actual-action-caller");
    assert.equal(step.owner_actor_id, "actual-action-caller");
    assert.deepEqual(ops.client.readOwn(report), report);
    assert.throws(() => ops.process.head(step.artifact_id), denied);
    assert.throws(() => ops.process.readOwn(step), denied);
    assert.throws(() => ops.client.read(step), denied);
    assert.deepEqual(rig.operations(manifest(), "actual-action-caller").process.readOwn(step), step);
  } finally { rig.close(); }
});

test("W5-01-D1-03: catalogue lists every consumable fixed version in owner order with minimal titles", () => {
  const rig = harness();
  try {
    const ops = rig.operations();
    assert.deepEqual(ops.client.listConsumable(), []);
    const reports = [ops.client.publish(artifact("report", 1)).artifact, ops.client.publish(artifact("report", 2)).artifact];
    const steps = [ops.process.record({ ...item("unbound-step", 1), metadata: { title: "  Original title  ", secret: "hidden" } }).artifact,
      ops.process.record({ ...item("unbound-step", 2), metadata: { title: "" } }).artifact,
      ops.process.record({ ...item("without-title"), metadata: { title: 9 } }).artifact];
    const archived = ops.client.publish(artifact("archived")).artifact;
    rig.api.commands.archiveVersion({ ...archived, actor_id: ACTOR });
    const unavailable = ops.process.record(item("unavailable")).artifact;
    rig.process.commands.markUnavailable({ ...unavailable, actor_id: ACTOR, reason: "Missing source" });
    const archivedStep = ops.process.record(item("archived-step")).artifact;
    rig.process.commands.archiveVersion({ ...archivedStep, actor_id: ACTOR });
    const unavailableReport = ops.client.publish(artifact("unavailable-report")).artifact;
    rig.api.commands.markUnavailable({ ...unavailableReport, actor_id: ACTOR, reason: "Missing source" });
    const producer = { plugin_id: PLUGIN, plugin_version: "1.0.0", binding_signature: "test-binding" };
    rig.api.commands.registerVersion({ ...artifact("unsupported"), schema_version: 2, project_id: DEMO_PROJECT_ID, actor_id: ACTOR, producer });
    rig.process.commands.registerVersion({ ...item("unsupported-step"), artifact_type_id: "other.item", project_id: DEMO_PROJECT_ID, actor_id: ACTOR, producer });
    rig.setAuthor("another-person");
    ops.process.record(item("other-person-step"));
    const result = ops.client.listConsumable();
    assert.equal(result.length, 5, "all versions, including those with no ports, are listed; rejected records are omitted");
    const orderedReports = rig.api.query.listArtifacts(DEMO_PROJECT_ID).filter(value => reports.some(row => row.artifact_id === value.artifact_id && row.version === value.version));
    const orderedSteps = rig.process.query.listArtifacts(DEMO_PROJECT_ID).filter(value => steps.some(row => row.artifact_id === value.artifact_id && row.version === value.version));
    assert.deepEqual(result.map(value => [value.artifact_id, value.version]), [...orderedReports, ...orderedSteps].map(value => [value.artifact_id, value.version]));
    assert.deepEqual(result.map(value => value.kind), ["artifact", "artifact", "process_item", "process_item", "process_item"]);
    assert.equal(result.find(value => value.artifact_id === "unbound-step" && value.version === 1)?.title, "  Original title  ");
    assert.equal(result.find(value => value.artifact_id === "unbound-step" && value.version === 2)?.title, null);
    assert.equal(result.find(value => value.artifact_id === "without-title")?.title, null);
    for (const summary of result) {
      assert.deepEqual(Object.keys(summary).sort(), ["artifact_id", "artifact_type_id", "kind", "schema_version", "title", "version"]);
      const read = ops.client.read(summary);
      assert.ok(read);
      assert.equal("origin" in read ? "artifact" : "process_item", summary.kind);
      assert.equal(read.artifact_type_id, summary.artifact_type_id);
      assert.equal(read.schema_version, summary.schema_version);
      assert.equal(read.version, summary.version);
      if ("title" in read) assert.equal(summary.title, read.title);
    }
    assert.throws(() => ops.client.read(archived), incompatible);
    assert.throws(() => ops.client.read(unavailable), incompatible);
  } finally { rig.close(); }
});

test("W5-01-D1-03: all artifact references shadow process collisions, including rejected artifacts", () => {
  const rig = harness();
  try {
    const ops = rig.operations();
    const active = ops.client.publish(artifact("collision-active")).artifact;
    const archived = ops.client.publish(artifact("collision-archived")).artifact;
    rig.api.commands.archiveVersion({ ...archived, actor_id: ACTOR });
    for (const report of [active, archived]) rig.process.commands.registerVersion({ ...item(report.artifact_id), project_id: DEMO_PROJECT_ID, actor_id: ACTOR,
      producer: { plugin_id: PLUGIN, plugin_version: "1.0.0", binding_signature: "test-binding" } });
    assert.deepEqual(ops.client.listConsumable(), [{ artifact_id: active.artifact_id, version: 1, artifact_type_id: TYPE, schema_version: 1,
      title: active.title, kind: "artifact" }]);
    assert.deepEqual(ops.client.read(active), active);
    assert.throws(() => ops.client.read(archived), incompatible);
    assert.ok(ops.process.readOwn(archived), "the hidden process is still recoverable through its own explicit store");
  } finally { rig.close(); }
});

test("W5-01-D1-03: catalogue propagates listing and compatibility query failures", () => {
  const rig = harness();
  try {
    const ops = rig.operations();
    ops.client.publish(artifact("report"));
    ops.process.record(item("step"));
    const failure = new Error("Read failed");
    for (const query of [rig.api.query, rig.process.query]) {
      const list = query.listArtifacts;
      query.listArtifacts = () => { throw failure; };
      assert.throws(() => ops.client.listConsumable(), error => error === failure);
      query.listArtifacts = list;
      const compatibility = query.consumptionCompatibility;
      query.consumptionCompatibility = () => { throw failure; };
      assert.throws(() => ops.client.listConsumable(), error => error === failure);
      query.consumptionCompatibility = compatibility;
    }
  } finally { rig.close(); }
});

test("W5-01-D1-04: projected direct inputs use the Kernel validator and refusals leave both stores and events unchanged", () => {
  const rig = harness();
  try {
    const ops = rig.operations();
    const report = ops.client.publish(artifact("taken-artifact")).artifact;
    const step = ops.process.record(item("taken-process")).artifact;
    const before = rig.snapshot();
    for (const operation of [
      () => ops.client.publish({ ...artifact("bad"), version: 0 }),
      () => ops.process.record({ ...item("bad"), schema_version: 0 }),
      () => Reflect.apply(ops.process.record, null, [{ ...item("bad"), content: { kind: "inline" } }]),
      () => Reflect.apply(ops.client.publish, null, [{ ...artifact("bad"), content: { kind: "inline", payload: {}, actor_id: "forged" } }]),
      () => ops.process.head(" "),
      () => ops.process.readOwn({ artifact_id: "step", version: -1 }),
      () => ops.client.read({ artifact_id: "", version: 1 }),
    ]) assert.throws(operation, inputInvalid);
    for (const operation of [
      () => ops.client.publish({ ...artifact("bad"), schema_version: 2 }),
      () => ops.process.record({ ...item("bad"), artifact_type_id: "undeclared" }),
      () => ops.process.record(item(report.artifact_id)),
      () => ops.client.publish(artifact(step.artifact_id)),
    ]) assert.throws(operation, incompatible);
    for (const operation of [() => ops.client.publish({ ...artifact(report.artifact_id), content: { kind: "inline", payload: "conflict" } }),
      () => ops.process.record({ ...item(step.artifact_id), content: { kind: "inline", payload: "conflict" } })]) {
      assert.throws(operation, { code: "artifacts.artifact.version_conflict" });
    }
    assert.deepEqual(rig.snapshot(), before);
    rig.grants.delete("artifact:write");
    assert.throws(() => ops.process.record(item("revoked")), { code: "actions.forbidden" });
    rig.grants.delete("artifact:read");
    assert.throws(() => ops.client.listConsumable(), { code: "actions.forbidden" });
    assert.throws(() => ops.process.head(step.artifact_id), { code: "actions.forbidden" });
    assert.throws(() => ops.process.readOwn(step), { code: "actions.forbidden" });
    const undeclared = manifest();
    undeclared.permissions = [];
    const calls = rig.authorized.length;
    const missing = rig.operations(undeclared);
    assert.throws(() => missing.client.listConsumable(), denied);
    assert.throws(() => missing.process.record(item("undeclared")), denied);
    assert.equal(rig.authorized.length, calls, "the declaration is checked before trusted authorization");
    assert.deepEqual(rig.snapshot(), before);
  } finally { rig.close(); }
});

test("W5-01-D1-04: a publish or record whose original caller is no longer current writes nothing; reads still answer", () => {
  const rig = harness();
  try {
    const ops = rig.operations();
    const report = ops.client.publish(artifact("before-revoke")).artifact;
    const before = rig.snapshot();
    rig.revokeCaller();
    assert.throws(() => ops.client.publish(artifact("after-revoke")), { code: "actions.forbidden" });
    assert.throws(() => ops.process.record(item("after-revoke")), { code: "actions.forbidden" });
    assert.deepEqual(rig.snapshot(), before, "neither store nor the journal changed");
    assert.deepEqual(ops.client.read(report), report, "the caller check guards writes only");
  } finally { rig.close(); }
});

test("W5-01-D1-04: factory options mutation cannot change the bound actor, project or owner stores", () => {
  const rig = harness(), other = harness();
  try {
    const foreign = rig.operations(manifest(), "other-person").process.record(item("another-person-process")).artifact;
    const options = { api: rig.api, process: rig.process, manifest: manifest(), actor_id: ACTOR, project_id: DEMO_PROJECT_ID,
      assertInput: assertActionInput, assertCallerCurrent() {}, authorize(permission: "artifact:read" | "artifact:write") {
        if (!rig.grants.has(permission)) throw new ActionError("actions.forbidden", "Grant revoked");
      } };
    const ops = createPluginArtifactOperations(options);
    const report = ops.client.publish(artifact("bound-report")).artifact;
    const own = ops.process.record(item("bound-process")).artifact;
    const expected = ops.client.listConsumable();
    const assertBound = () => {
      assert.throws(() => ops.client.read(foreign), denied, "changing factory options cannot borrow another person's process item");
      assert.deepEqual(ops.client.read(report), report);
      assert.deepEqual(ops.client.read(own), own);
      assert.deepEqual(ops.client.listConsumable(), expected);
      assert.deepEqual(ops.process.readOwn(own), own);
      assert.deepEqual(ops.process.head(own.artifact_id), { version: 1 });
      assert.throws(() => ops.process.readOwn(foreign), denied);
    };
    assertBound();
    options.actor_id = "other-person";
    assertBound();
    options.project_id = "other-project";
    assertBound();
    options.api = other.api;
    options.process = other.process;
    assertBound();
    const next = ops.process.record(item("bound-process", 2)).artifact;
    const nextReport = ops.client.publish(artifact("bound-report", 2)).artifact;
    for (const record of [next, nextReport]) {
      assert.equal(record.project_id, DEMO_PROJECT_ID);
      assert.equal(record.created_by, ACTOR);
    }
    assert.deepEqual(rig.process.query.getArtifactVersion(DEMO_PROJECT_ID, next), next);
    assert.deepEqual(rig.api.query.getArtifactVersion(DEMO_PROJECT_ID, nextReport), nextReport);
    assert.deepEqual(other.api.query.listArtifacts(DEMO_PROJECT_ID), []);
    assert.deepEqual(other.process.query.listArtifacts(DEMO_PROJECT_ID), []);
    rig.grants.delete("artifact:read");
    assert.throws(() => ops.client.listConsumable(), { code: "actions.forbidden" }, "the captured authority still observes live grants");
  } finally { rig.close(); other.close(); }
});
