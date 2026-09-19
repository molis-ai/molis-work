import assert from "node:assert/strict";
import test from "node:test";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { resolvePluginActivation } from "@molis-ai/molis-work-plugin-runtime";

function manifest(input: {
  id: string;
  provides?: string[];
  requires?: Array<{ capability_id: string; version: number; optional?: boolean }>;
  inputs?: Array<{ port: string; type: string; version: number; optional?: boolean }>;
  outputs?: Array<{ port: string; type: string; version: number }>;
}): PluginManifest {
  const requires = (input.requires ?? []).map((requirement) => ({
    capability_id: requirement.capability_id,
    version: requirement.version,
    ...(requirement.optional === undefined ? {} : { optional: requirement.optional }),
    reason: "测试依赖",
  }));
  return {
    schema_version: 2,
    host_api_version: 2,
    plugin_id: input.id,
    version: "1.0.0",
    name: input.id,
    kind: "app",
    publisher: { publisher_id: "molis", signature: `${input.id}-binding` },
    entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [],
    capabilities: {
      provides: input.provides ?? [],
      consumes: requires.map((requirement) => requirement.capability_id),
    },
    artifacts: { produces: [], consumes: [] },
    ui: { contributions: [] },
    ports: {
      inputs: (input.inputs ?? []).map((port) => ({
        port: port.port,
        artifact_type_id: port.type,
        schema_version: port.version,
        ...(port.optional === undefined ? {} : { optional: port.optional }),
      })),
      outputs: (input.outputs ?? []).map((port) => ({
        port: port.port,
        artifact_type_id: port.type,
        schema_version: port.version,
      })),
    },
    ...(requires.length > 0 ? { requires } : {}),
  };
}

test("providers activate before the Plugins that require them", () => {
  const resolution = resolvePluginActivation({
    manifests: [
      manifest({ id: "io.molis.work.coding", requires: [{ capability_id: "projects.read.v1", version: 1 }] }),
      manifest({ id: "io.molis.work.projects", provides: ["projects.read.v1"] }),
    ],
  });
  assert.deepEqual(resolution.order, ["io.molis.work.projects", "io.molis.work.coding"]);
  assert.deepEqual(resolution.blocked, []);
  assert.deepEqual(resolution.diagnostics, []);
});

test("an unsatisfied required Capability blocks only its own Plugin and names the contract", () => {
  const resolution = resolvePluginActivation({
    manifests: [
      manifest({ id: "io.molis.work.coding", requires: [{ capability_id: "projects.read.v1", version: 1 }] }),
      manifest({ id: "io.molis.work.files" }),
    ],
  });
  assert.deepEqual(resolution.blocked, ["io.molis.work.coding"]);
  assert.deepEqual(resolution.order, ["io.molis.work.files"]);
  const missing = resolution.diagnostics.find((item) => item.code === "capability_missing");
  assert.equal(missing?.plugin_id, "io.molis.work.coding");
  assert.equal(missing?.contract, "projects.read.v1@1");
});

test("an optional Capability degrades instead of blocking", () => {
  const resolution = resolvePluginActivation({
    manifests: [
      manifest({
        id: "io.molis.work.coding",
        requires: [{ capability_id: "git.workspace.v1", version: 1, optional: true }],
      }),
    ],
  });
  assert.deepEqual(resolution.blocked, []);
  assert.deepEqual(resolution.order, ["io.molis.work.coding"]);
  assert.equal(resolution.diagnostics[0]?.code, "capability_optional_missing");
});

test("Host-provided Capabilities satisfy requirements without adding an ordering edge", () => {
  const resolution = resolvePluginActivation({
    manifests: [
      manifest({ id: "io.molis.work.coding", requires: [{ capability_id: "artifacts.read.v1", version: 1 }] }),
    ],
    hostCapabilities: [{ capability_id: "artifacts.read.v1", version: 1 }],
  });
  assert.deepEqual(resolution.order, ["io.molis.work.coding"]);
  assert.deepEqual(resolution.diagnostics, []);
});

test("a Capability version mismatch is an unsatisfied requirement, not a silent match", () => {
  const resolution = resolvePluginActivation({
    manifests: [
      manifest({ id: "io.molis.work.coding", requires: [{ capability_id: "projects.read", version: 2 }] }),
      manifest({ id: "io.molis.work.projects", provides: ["projects.read@1"] }),
    ],
  });
  assert.deepEqual(resolution.blocked, ["io.molis.work.coding"]);
  assert.equal(resolution.diagnostics[0]?.contract, "projects.read@2");
});

test("a dependency cycle blocks its members with a named diagnostic and spares the rest", () => {
  const resolution = resolvePluginActivation({
    manifests: [
      manifest({ id: "io.molis.work.a", provides: ["a.v1"], requires: [{ capability_id: "b.v1", version: 1 }] }),
      manifest({ id: "io.molis.work.b", provides: ["b.v1"], requires: [{ capability_id: "a.v1", version: 1 }] }),
      manifest({ id: "io.molis.work.c" }),
    ],
  });
  assert.deepEqual(resolution.order, ["io.molis.work.c"]);
  assert.deepEqual(resolution.blocked, ["io.molis.work.a", "io.molis.work.b"]);
  assert.ok(resolution.diagnostics.some((item) => item.code === "dependency_cycle"));
});

test("a blocked provider blocks the Plugins that required it", () => {
  const resolution = resolvePluginActivation({
    manifests: [
      manifest({ id: "io.molis.work.a", requires: [{ capability_id: "missing.v1", version: 1 }], provides: ["a.v1"] }),
      manifest({ id: "io.molis.work.b", requires: [{ capability_id: "a.v1", version: 1 }] }),
    ],
  });
  assert.deepEqual(resolution.order, []);
  assert.deepEqual(resolution.blocked, ["io.molis.work.a", "io.molis.work.b"]);
});

test("ports never create ordering edges, and an unproducible required input is reported", () => {
  const resolution = resolvePluginActivation({
    manifests: [
      manifest({
        id: "io.molis.work.diff",
        inputs: [{ port: "change-set", type: "coding.change-set", version: 1 }],
        outputs: [{ port: "selection", type: "diff.selection", version: 1 }],
      }),
      manifest({
        id: "io.molis.work.coding",
        inputs: [{ port: "selection", type: "diff.selection", version: 1 }],
        outputs: [{ port: "change-set", type: "coding.change-set", version: 1 }],
      }),
    ],
  });
  assert.deepEqual(resolution.blocked, []);
  assert.equal(resolution.order.length, 2);
  assert.deepEqual(resolution.diagnostics, []);

  const unsatisfiable = resolvePluginActivation({
    manifests: [
      manifest({
        id: "io.molis.work.coding",
        inputs: [
          { port: "project", type: "projects.project", version: 1 },
          { port: "files", type: "files.selection", version: 1, optional: true },
        ],
      }),
    ],
  });
  assert.deepEqual(unsatisfiable.blocked, []);
  assert.deepEqual(
    unsatisfiable.diagnostics.map((item) => [item.code, item.contract]),
    [["port_type_unsatisfiable", "projects.project@1"]],
  );
});
