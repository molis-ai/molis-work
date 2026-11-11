import assert from "node:assert/strict";
import test from "node:test";
import type { ArtifactReference, ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { FILE_SNAPSHOT_SCHEMA_VERSION, FILE_SNAPSHOT_TYPE } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { PluginWiringError, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { MATERIALS_PROVIDER_ID, SYSTEM_MATERIALS_SOURCE, SYSTEM_OUTPUT_SOURCES } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { MemoryPluginConsentLedger, MemoryPluginWiringRepository, PluginInputGraph, consentSubject, type PluginHostLifecycle } from "@molis-ai/molis-work-plugin-runtime";

// Files retirement S1 (specs/batch-06-shared-tools §3, BSH-05): the platform's materials service is a registered producer, not a plugin.
// A Manifest may name it as a default source only with a port it offers; a binding may read it; a version on its output must be one it
// wrote under its current signature; and the Host agrees for its own build to read it by default only on a target's first install here.

const PROJECT = "project-materials";
const DIFF = "io.molis.work.example.diff-reader";

function consumerManifest(port = "before"): PluginManifest {
  return {
    schema_version: 1, host_api_version: 1, plugin_id: DIFF, version: "1.0.0", name: "Reader", kind: "app",
    publisher: { publisher_id: "fixture", signature: "fixture-reader" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: "artifact:read", required: true, reason: "Read the snapshot" }], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    process_items: { produces: [], consumes: [{ artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION }] },
    ports: { inputs: [{ port: "before", artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION,
      default_source: { plugin_id: MATERIALS_PROVIDER_ID, port } }], outputs: [] },
  };
}

test("BSH-05 a Manifest names system.materials as a default source only with a port the platform offers", () => {
  assert.doesNotThrow(() => parsePluginManifest(consumerManifest("before")));
  assert.throws(() => parsePluginManifest(consumerManifest("diagram")), /system\.materials/u);
});

function graphOver(versions: Map<string, ArtifactVersionRecord>) {
  const manifest = consumerManifest();
  const lifecycle: PluginHostLifecycle = {
    manifest: id => id === DIFF ? manifest : undefined, contract: () => undefined, generation: id => id === DIFF ? 1 : undefined,
    installation: () => undefined, enabledPluginIds: () => [DIFF], ensureStarted: async () => undefined,
  };
  const read = (reference: ArtifactReference) => versions.get(`${reference.artifact_id}@${reference.version}`) ?? null;
  return new PluginInputGraph({ projectId: PROJECT, lifecycle, repository: new MemoryPluginWiringRepository(), artifacts: { read },
    systemSources: SYSTEM_OUTPUT_SOURCES });
}

function snapshot(artifact_id: string, producer: string, signature: string): ArtifactVersionRecord {
  return { artifact_id, version: 1, artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION, producer_plugin_id: producer,
    producer_binding_signature: signature, availability: "available", lifecycle_state: "active" } as ArtifactVersionRecord;
}

test("BSH-05 a binding reads system.materials; a version on its output that another producer or an old signature wrote is not handed on", () => {
  const versions = new Map<string, ArtifactVersionRecord>();
  const graph = graphOver(versions);
  assert.throws(() => graph.bind({ project_id: PROJECT, actor_id: "owner", target_plugin_id: DIFF, target_port: "before", source_plugin_id: MATERIALS_PROVIDER_ID,
    source_port: "files", origin: "user" }), (error: unknown) => error instanceof PluginWiringError && error.code === "plugin.port_type_mismatch");
  graph.bind({ project_id: PROJECT, actor_id: "owner", target_plugin_id: DIFF, target_port: "before", source_plugin_id: MATERIALS_PROVIDER_ID, source_port: "before", origin: "user" });
  assert.ok(graph.view().plugins[0]?.ports[0]?.candidates.some(candidate => candidate.source_plugin_id === MATERIALS_PROVIDER_ID && candidate.source_port === "before"));

  versions.set("own@1", snapshot("own", MATERIALS_PROVIDER_ID, SYSTEM_MATERIALS_SOURCE.signature));
  graph.publish({ plugin_id: MATERIALS_PROVIDER_ID, port: "before", reference: { artifact_id: "own", version: 1 } });
  assert.deepEqual(graph.reference(DIFF, "before"), { artifact_id: "own", version: 1 });

  for (const [id, producer, signature] of [["forged", "io.molis.work.files", SYSTEM_MATERIALS_SOURCE.signature], ["stale", MATERIALS_PROVIDER_ID, "an-old-signature"]] as const) {
    versions.set(`${id}@1`, snapshot(id, producer, signature));
    graph.publish({ plugin_id: MATERIALS_PROVIDER_ID, port: "before", reference: { artifact_id: id, version: 1 } });
    assert.equal(graph.reference(DIFF, "before"), null, `${id}: not the platform's current registration`);
  }
  assert.throws(() => graph.publish({ plugin_id: MATERIALS_PROVIDER_ID, port: "diagram", reference: { artifact_id: "own", version: 1 } }),
    (error: unknown) => error instanceof PluginWiringError && error.code === "plugin.port_unknown");
});

test("BSH-06 the Host agrees for its build to read system.materials by default only on the target's first install in this Home", () => {
  const subject = consentSubject.defaultWiring("before", { plugin_id: MATERIALS_PROVIDER_ID, port: "before" }, SYSTEM_MATERIALS_SOURCE.signature);
  const grant = { kind: "default_wiring" as const, subject };
  const entry = (plugin_id: string, grants: readonly { kind: "default_wiring" | "always_on"; subject: string }[]) =>
    ({ plugin_id, publisher_signature: "fixture-reader", manifest_digest: "digest", granted_by: "host_build" as const, grants, at: "2026-11-11T00:00:00.000Z" });
  const fresh = new MemoryPluginConsentLedger();
  assert.equal(fresh.record(entry(DIFF, [grant])).length, 1, "a first install in a Home with no record of the target is agreed for");
  const upgraded = new MemoryPluginConsentLedger();
  upgraded.record(entry(DIFF, [{ kind: "default_wiring", subject: "before<-io.molis.work.files:before@files-signature" }]));
  assert.equal(upgraded.record(entry(DIFF, [grant])).length, 0, "an upgrade waits for the person");
  assert.equal(upgraded.consents(DIFF).filter(row => row.subject === subject).length, 0);
  const person = upgraded.record({ ...entry(DIFF, [grant]), granted_by: "user" as const });
  assert.equal(person.length, 1, "the person's own agreement is recorded");
});

test("BSH-06 the person agrees to a shipped plugin's default from system.materials only through the Host's settings entry, and only to what its Manifest declares", { timeout: 60_000 }, async t => {
  const { openTestHome } = await import("./fixtures/test-home.js");
  const { HomeConsentLedger, PLUGIN_CONSENT_PERMISSIONS, pluginConsentActions } = await import("@molis-ai/molis-work-app-local-host");
  const { ActionError, LOCAL_PERSON_ACTOR_ID } = await import("@molis-ai/molis-work-contracts/platform/actions");
  const f = await openTestHome(t);
  const DIFF_ID = "io.molis.work.diff";
  const grant = (input: unknown) => f.web.post<{ consent: { subject: string; granted_by: string; revoked_at: string | null } }>("/api/settings/plugin-consents/grant-default-source", input);
  const subject = consentSubject.defaultWiring("before", { plugin_id: MATERIALS_PROVIDER_ID, port: "before" }, SYSTEM_MATERIALS_SOURCE.signature);
  const { consent } = await grant({ plugin_id: DIFF_ID, port: "before" });
  assert.deepEqual([consent.subject, consent.granted_by, consent.revoked_at], [subject, "user", null]);
  assert.ok(new HomeConsentLedger(f.home).consents(DIFF_ID).some(row => row.subject === subject && row.granted_by === "user" && row.revoked_at === null));
  // Agreeing again keeps the one standing row.
  await grant({ plugin_id: DIFF_ID, port: "before" });
  assert.equal(new HomeConsentLedger(f.home).consents(DIFF_ID).filter(row => row.subject === subject && row.revoked_at === null).length, 1);
  // A port whose default is another plugin's, a port it does not have, and a plugin the Host does not ship are refused, and nothing is written.
  const rows = new HomeConsentLedger(f.home).consents(DIFF_ID).length;
  for (const input of [{ plugin_id: DIFF_ID, port: "changeset" }, { plugin_id: DIFF_ID, port: "nothing" }, { plugin_id: "io.molis.work.example.someone", port: "before" }]) {
    await assert.rejects(grant(input), (error: unknown) => (error as { code?: string }).code === "actions.target_invalid", JSON.stringify(input));
  }
  assert.equal(new HomeConsentLedger(f.home).consents(DIFF_ID).length, rows);
  // Not through the settings entry (a forged audit line, or none): refused before the ledger.
  for (const user_action of [undefined, { source: "web", conversation_ref: "web:settings:plugin-consents", message_ref: "web:request:forged" }] as const) {
    await assert.rejects(f.host.homeActionClient().invoke({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user", permissions: PLUGIN_CONSENT_PERMISSIONS, ...(user_action ? { user_action } : {}) },
      pluginConsentActions.grantDefaultSource, { plugin_id: DIFF_ID, port: "after" }), (error: unknown) => error instanceof ActionError && error.code === "actions.forbidden");
  }
  assert.ok(!new HomeConsentLedger(f.home).consents(DIFF_ID).some(row => row.subject.startsWith("after<-system.materials") && row.granted_by === "user"));
});
