import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readSandboxPackage, readStudioDistribution, verifySyncPluginDistribution } from "@molis-ai/molis-work-app-local-host";
import { SANDBOX_PACKAGE_FILES } from "@molis-ai/molis-work-contracts/platform/plugin";
import { AgentBuilderStore, builderPrivateValueReplicationOwner, validateAgentDesign, type AgentDesign } from "@molis-ai/molis-work-plugin-builder";
import { verifyPluginPackageSignature } from "@molis-ai/molis-work-plugin-runtime";
import { assertContract } from "@molis-ai/molis-work-plugin-sandbox";
import { authoredObjectSlot } from "./fixtures/signed-surface-slot.js";
import { signedPackage } from "./fixtures/sandbox-package.js";
import { publicationStorage, readyPublication } from "./fixtures/studio-publishing.js";

test("IUI-13: signed app install reading refuses illegal slot declarations and bindings, and still accepts unchanged packages", () => {
  const noSlots = verifyPluginPackageSignature(signedPackage()).bundle.payload;
  assert.equal(readSandboxPackage(noSlots).ui, undefined);
  const options = { pluginId: noSlots.manifest.plugin_id };
  type Authored = ReturnType<typeof authoredObjectSlot>;
  const cases: ReadonlyArray<(source: Authored) => void> = [
    ({ surface }) => Object.assign(surface.ui, { surfaces: [] }),
    ({ surface }) => surface.ui.slots.push(surface.ui.slots[0]!),
    ({ surface }) => Object.assign(surface.ui.slots[0]!, { accepts: ["native"] }),
    ({ surface }) => Object.assign(surface.parts[1]!.surfaceSlot!, { slot_id: "another.slot" }),
    ({ surface }) => Object.assign(surface.nodes[1]!, { kind: "card" }),
    ({ contract }) => Object.assign(contract.operations[0]!.output.properties!.references!.items!.properties!, { title: { type: "string" } }),
    ({ surface }) => Object.assign(surface.parts[0]!.submit!.input, { id: { source: "selection", componentId: "objects", field: "id" } }),
  ];
  for (const change of cases) {
    const source = authoredObjectSlot(options.pluginId, "goal");
    change(source);
    const signed = signedPackage(undefined, files => {
      files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(source.contract);
      files[SANDBOX_PACKAGE_FILES.interface] = JSON.stringify(source.surface);
      files[SANDBOX_PACKAGE_FILES.entrypoint] = source.code;
    }, options);
    const verified = verifyPluginPackageSignature(signed).bundle;
    assert.throws(() => readSandboxPackage(verified.payload), { code: "plugin.declaration_invalid" });
  }
});

test("IUI-13: the version 1 Studio draft, release, and portable restore keep the same signed slot and refuse malformed writes first", async t => {
  const home = await mkdtemp(join(tmpdir(), "studio-surface-slot-")), receiver = await mkdtemp(join(tmpdir(), "studio-surface-receive-"));
  const fixture = readyPublication(home, "author", "project"), { store } = fixture.workflow;
  t.after(async () => { await fixture.workflow.close(); await rm(home, { recursive: true, force: true }); await rm(receiver, { recursive: true, force: true }); });
  const key = "plugin-builder:agent-built:v1", raw = fixture.storage.get(key)!;
  const old = new AgentBuilderStore(publicationStorage(fixture.statePath)).require(fixture.build.id);
  assert.equal(old.design?.ui, undefined);
  assert.equal(fixture.storage.get(key), raw, "opening an existing draft does not write it");
  const original = authoredObjectSlot(old.design!.contract.pluginId, "goal");
  const id = "reference-editor", description = "Keep a reference in the original editor";
  original.contract.acceptance = [{ id, description, steps: [{ description, operationId: "references.save", input: { id: "goal-ref" }, expected: "Returns true" }] }];
  const acceptance: AgentDesign["acceptance"] = [{ id, description, steps: [
    { action: "fill", componentId: "editor", field: "id", value: "goal-ref" }, { action: "submit", componentId: "editor" },
    { action: "expect", componentId: "editor", text: "Keep a reference" },
  ] }];
  const design = validateAgentDesign({ ...old.design, contract: original.contract, parts: original.surface.parts,
    ui: original.surface.ui, acceptance }, [], [], assertContract);
  assert.throws(() => store.update(old.id, old.revision, item => {
    item.design = { ...design, ui: { slots: [] } }; item.nodes = original.surface.nodes;
  }), { code: "plugin_builder.store_invalid" });
  assert.equal(fixture.storage.get(key), raw, "invalid slot leaves the exact saved document unchanged");
  const bundlePath = join(fixture.build.directory!, "build", "references.mjs");
  writeFileSync(bundlePath, original.code);
  const saved = store.update(old.id, old.revision, item => {
    item.design = design; item.nodes = original.surface.nodes; item.connected = ["references.save", "references.list"];
    item.checks.global!.bundlePath = bundlePath;
    item.browserResult!.cases = [{ id, passed: true, detail: "Fixed publication fixture" }];
  });
  assert.deepEqual(new AgentBuilderStore(publicationStorage(fixture.statePath)).require(old.id).design?.ui, original.surface.ui);
  const release = await fixture.publish(), distributed = await readStudioDistribution(fixture.root, release);
  const verified = readSandboxPackage(verifyPluginPackageSignature(distributed).bundle.payload);
  assert.deepEqual(verified.ui, original.surface.ui);
  assert.deepEqual(verified.nodes, original.surface.nodes);
  const sender = builderPrivateValueReplicationOwner({ home, verifyDistribution: verifySyncPluginDistribution });
  const target = builderPrivateValueReplicationOwner({ home: receiver, verifyDistribution: verifySyncPluginDistribution });
  type Transfer = { format: number; builds: Array<{ design: AgentDesign }> };
  const current = fixture.storage.get(key)!;
  const data = sender.project(JSON.parse(current), "author", saved.id) as Transfer;
  assert.equal(data.format, 1);
  const wrongVersion = { ...data, format: 2 };
  const malformed = structuredClone(data);
  Reflect.set(malformed.builds[0]!.design.ui!, "producer", "untrusted");
  for (const input of [wrongVersion, malformed]) {
    assert.throws(() => target.restore(input, null, "author", saved.id), { code: "plugin_builder.sync_invalid" });
    assert.equal(existsSync(join(receiver, "plugin-builder")), false, "refusal does not create target directories");
  }
  const restored = target.restore(data, null, "author", saved.id);
  mkdirSync(join(receiver, "store")); const statePath = join(receiver, "store", "state.json");
  writeFileSync(statePath, JSON.stringify({ [key]: JSON.stringify(restored) }));
  const reopened = new AgentBuilderStore(publicationStorage(statePath));
  assert.deepEqual(reopened.require(saved.id).design?.ui, original.surface.ui);
  const copiedRelease = reopened.versions(saved.id)[0]!;
  assert.deepEqual(copiedRelease.nodes, original.surface.nodes);
  assert.deepEqual(readFileSync(join(copiedRelease.directory, "signed-package.json")), readFileSync(join(release.directory, "signed-package.json")));
  assert.equal(fixture.storage.get(key), current, "sync does not rewrite the original draft");
});
