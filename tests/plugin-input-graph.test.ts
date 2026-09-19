import assert from "node:assert/strict";
import test from "node:test";
import type {
  ArtifactReference,
  ArtifactVersionRecord,
} from "@molis-ai/molis-work-contracts/modules/artifacts";
import type {
  PluginAppContribution,
  PluginDefinition,
  PluginManifest,
  PluginUpstreamReadyInputs,
  PluginUpstreamUnavailableReason,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { PluginWiringError } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import {
  MemoryPluginWiringRepository,
  PluginInputGraph,
  PluginRuntime,
  PluginSupervisor,
} from "@molis-ai/molis-work-plugin-runtime";

const BOARD = "board-wiring";
const PROJECTS = "io.molis.work.projects";
const FILES = "io.molis.work.files";
const CODING = "io.molis.work.coding";
const PROJECT_TYPE = "projects.project";
const FILES_TYPE = "files.selection";

function view(pluginId: string): UiContribution {
  return {
    descriptor: {
      contribution_id: `${pluginId}.main`,
      plugin_id: pluginId,
      kind: "primary-page",
      label: "main",
      slots: [],
    },
    render: () => "<section></section>",
  };
}

interface PortSpec {
  port: string;
  type: string;
  version?: number;
  optional?: boolean;
}

function portPlugin(input: {
  id: string;
  inputs?: PortSpec[];
  outputs?: PortSpec[];
  groups?: Array<{ group_id: string; title: string; ports: string[] }>;
  onReady?: (inputs: PluginUpstreamReadyInputs, context: { signal: AbortSignal }) => void | Promise<void>;
  onUnavailable?: (reason: PluginUpstreamUnavailableReason) => void;
  failUntil?: number;
}): { definition: PluginDefinition; starts: () => number } {
  const inputs = input.inputs ?? [];
  const outputs = input.outputs ?? [];
  const manifest: PluginManifest = {
    schema_version: 2,
    host_api_version: 2,
    plugin_id: input.id,
    version: "1.0.0",
    name: input.id,
    kind: "app",
    publisher: { publisher_id: "molis", signature: `${input.id}-binding` },
    entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [],
    capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] },
    ui: {
      contributions: [`${input.id}.main`],
      views: [{ view_id: "main", slot: "stage", title: "Main" }],
    },
    ports: {
      inputs: inputs.map((port) => ({
        port: port.port,
        artifact_type_id: port.type,
        schema_version: port.version ?? 1,
        ...(port.optional === undefined ? {} : { optional: port.optional }),
      })),
      outputs: outputs.map((port) => ({
        port: port.port,
        artifact_type_id: port.type,
        schema_version: port.version ?? 1,
      })),
      ...(input.groups ? { input_groups: input.groups } : {}),
    },
  };

  let starts = 0;
  const definition: PluginDefinition = {
    manifest,
    async start() {
      starts += 1;
      if (input.failUntil !== undefined && starts <= input.failUntil) {
        throw new Error(`${input.id} 启动失败`);
      }
      const contribution: PluginAppContribution = {
        kind: "app",
        views: [view(input.id)],
        ...(inputs.length > 0
          ? {
            onUpstreamReady: input.onReady ?? (() => {}),
            onUpstreamUnavailable: input.onUnavailable ?? (() => {}),
          }
          : {}),
      };
      return contribution;
    },
    async stop() {},
  };
  return { definition, starts: () => starts };
}

function artifactStore() {
  const records = new Map<string, ArtifactVersionRecord>();
  return {
    put(artifactId: string, version: number): ArtifactReference {
      records.set(`${artifactId}@${version}`, {
        artifact_id: artifactId,
        version,
        board_id: BOARD,
        artifact_type_id: PROJECT_TYPE,
        schema_version: 1,
        producer_plugin_id: PROJECTS,
        producer_plugin_version: "1.0.0",
        producer_binding_signature: "sig",
        owner_actor_id: "actor",
        content_kind: "inline",
        payload: { artifactId, version },
        content_ref: null,
        content_digest: "digest",
        size_bytes: 1,
        metadata: {},
        scope: "personal",
        availability: "available",
        unavailable_reason: null,
        lifecycle_state: "active",
        supersedes_version: null,
        created_by: "actor",
        created_at: "2026-09-19T00:00:00.000Z",
        archived_at: null,
        archived_by: null,
      });
      return { artifact_id: artifactId, version };
    },
    drop(reference: ArtifactReference): void {
      records.delete(`${reference.artifact_id}@${reference.version}`);
    },
    read(reference: ArtifactReference): ArtifactVersionRecord | null {
      return records.get(`${reference.artifact_id}@${reference.version}`) ?? null;
    },
  };
}

function harness(definitions: PluginDefinition[]) {
  const runtime = new PluginRuntime();
  const supervisor = new PluginSupervisor(runtime);
  const artifacts = artifactStore();
  const graph = new PluginInputGraph({
    boardId: BOARD,
    lifecycle: supervisor,
    repository: new MemoryPluginWiringRepository(),
    artifacts,
  });
  return {
    supervisor,
    graph,
    artifacts,
    start: () => supervisor.start(definitions.map((definition) => ({ definition }))),
  };
}

test("a consumer receives the complete fixed input set once every port resolves", async () => {
  const deliveries: PluginUpstreamReadyInputs[] = [];
  const projects = portPlugin({ id: PROJECTS, outputs: [{ port: "project", type: PROJECT_TYPE }] });
  const coding = portPlugin({
    id: CODING,
    inputs: [{ port: "project", type: PROJECT_TYPE }],
    onReady: (inputs) => {
      deliveries.push(inputs);
    },
  });

  const rig = harness([projects.definition, coding.definition]);
  await rig.start();
  rig.graph.bind({
    board_id: BOARD,
    target_plugin_id: CODING,
    target_port: "project",
    source_plugin_id: PROJECTS,
    source_port: "project",
    origin: "user",
    actor_id: "actor",
  });

  assert.deepEqual(rig.graph.status(CODING), { status: "missing", missing: ["project"] });

  const reference = rig.artifacts.put("artifact-project", 1);
  rig.graph.publish({ plugin_id: PROJECTS, port: "project", reference });
  rig.graph.evaluate(CODING);
  await rig.graph.drain();

  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0]?.project?.artifact_id, "artifact-project");
  assert.equal(deliveries[0]?.project?.version, 1);
  assert.deepEqual(rig.graph.status(CODING), { status: "ready", ports: ["project"] });
});

test("an incomplete input set is never delivered", async () => {
  const deliveries: PluginUpstreamReadyInputs[] = [];
  const projects = portPlugin({ id: PROJECTS, outputs: [{ port: "project", type: PROJECT_TYPE }] });
  const files = portPlugin({ id: FILES, outputs: [{ port: "selection", type: FILES_TYPE }] });
  const coding = portPlugin({
    id: CODING,
    inputs: [
      { port: "project", type: PROJECT_TYPE },
      { port: "files", type: FILES_TYPE },
    ],
    onReady: (inputs) => {
      deliveries.push(inputs);
    },
  });

  const rig = harness([projects.definition, files.definition, coding.definition]);
  await rig.start();
  for (const [targetPort, sourcePluginId, sourcePort] of [
    ["project", PROJECTS, "project"],
    ["files", FILES, "selection"],
  ] as const) {
    rig.graph.bind({
      board_id: BOARD,
      target_plugin_id: CODING,
      target_port: targetPort,
      source_plugin_id: sourcePluginId,
      source_port: sourcePort,
      origin: "user",
      actor_id: "actor",
    });
  }

  rig.graph.publish({
    plugin_id: PROJECTS,
    port: "project",
    reference: rig.artifacts.put("artifact-project", 1),
  });
  rig.graph.evaluate(CODING);
  await rig.graph.drain();
  assert.deepEqual(deliveries, [], "只齐一半的输入不能投递");
  assert.deepEqual(rig.graph.status(CODING), { status: "missing", missing: ["files"] });

  rig.graph.publish({
    plugin_id: FILES,
    port: "selection",
    reference: rig.artifacts.put("artifact-files", 1),
  });
  rig.graph.evaluate(CODING);
  await rig.graph.drain();
  assert.equal(deliveries.length, 1);
  assert.deepEqual(Object.keys(deliveries[0] ?? {}).sort(), ["files", "project"]);
});

test("an invalidated source revokes the old context before the consumer is told", async () => {
  const signals: AbortSignal[] = [];
  const reasons: PluginUpstreamUnavailableReason[] = [];
  const projects = portPlugin({ id: PROJECTS, outputs: [{ port: "project", type: PROJECT_TYPE }] });
  const coding = portPlugin({
    id: CODING,
    inputs: [{ port: "project", type: PROJECT_TYPE }],
    onReady: (_inputs, context) => {
      signals.push(context.signal);
    },
    onUnavailable: (reason) => {
      reasons.push(reason);
      assert.equal(signals[0]?.aborted, true, "通知失效前必须先撤掉旧上下文");
    },
  });

  const rig = harness([projects.definition, coding.definition]);
  await rig.start();
  rig.graph.bind({
    board_id: BOARD,
    target_plugin_id: CODING,
    target_port: "project",
    source_plugin_id: PROJECTS,
    source_port: "project",
    origin: "user",
    actor_id: "actor",
  });
  rig.graph.publish({
    plugin_id: PROJECTS,
    port: "project",
    reference: rig.artifacts.put("artifact-project", 1),
  });
  rig.graph.evaluate(CODING);
  await rig.graph.drain();
  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.aborted, false);

  rig.graph.invalidate(PROJECTS, "project", "项目已切换");
  rig.graph.evaluate(CODING);
  await rig.graph.drain();

  assert.equal(reasons.length, 1);
  assert.equal(reasons[0]?.code, "source_invalidated");
  assert.equal(reasons[0]?.message, "项目已切换");
});

test("inputs from different scopes are refused before delivery", async () => {
  const deliveries: PluginUpstreamReadyInputs[] = [];
  const reasons: PluginUpstreamUnavailableReason[] = [];
  const projects = portPlugin({ id: PROJECTS, outputs: [{ port: "project", type: PROJECT_TYPE }] });
  const files = portPlugin({ id: FILES, outputs: [{ port: "selection", type: FILES_TYPE }] });
  const coding = portPlugin({
    id: CODING,
    inputs: [
      { port: "project", type: PROJECT_TYPE },
      { port: "files", type: FILES_TYPE },
    ],
    onReady: (inputs) => {
      deliveries.push(inputs);
    },
    onUnavailable: (reason) => {
      reasons.push(reason);
    },
  });

  const rig = harness([projects.definition, files.definition, coding.definition]);
  await rig.start();
  for (const [targetPort, sourcePluginId, sourcePort] of [
    ["project", PROJECTS, "project"],
    ["files", FILES, "selection"],
  ] as const) {
    rig.graph.bind({
      board_id: BOARD,
      target_plugin_id: CODING,
      target_port: targetPort,
      source_plugin_id: sourcePluginId,
      source_port: sourcePort,
      origin: "user",
      actor_id: "actor",
    });
  }

  rig.graph.publish({
    plugin_id: PROJECTS,
    port: "project",
    reference: rig.artifacts.put("artifact-project", 1),
    scope_key: "workspace-a",
  });
  rig.graph.publish({
    plugin_id: FILES,
    port: "selection",
    reference: rig.artifacts.put("artifact-files", 1),
    scope_key: "workspace-b",
  });
  rig.graph.evaluate(CODING);
  await rig.graph.drain();

  assert.deepEqual(deliveries, [], "跨作用域的输入不能投递");
  assert.equal(rig.graph.status(CODING).status, "inconsistent");

  rig.graph.publish({
    plugin_id: FILES,
    port: "selection",
    reference: rig.artifacts.put("artifact-files", 2),
    scope_key: "workspace-a",
  });
  rig.graph.evaluate(CODING);
  await rig.graph.drain();
  assert.equal(deliveries.length, 1, "作用域一致后应正常投递");
  assert.deepEqual(reasons, []);
});

test("a binding whose types do not match is refused before it is persisted", async () => {
  const projects = portPlugin({ id: PROJECTS, outputs: [{ port: "project", type: PROJECT_TYPE }] });
  const coding = portPlugin({ id: CODING, inputs: [{ port: "files", type: FILES_TYPE }] });
  const rig = harness([projects.definition, coding.definition]);
  await rig.start();

  assert.throws(
    () => rig.graph.bind({
      board_id: BOARD,
      target_plugin_id: CODING,
      target_port: "files",
      source_plugin_id: PROJECTS,
      source_port: "project",
      origin: "user",
      actor_id: "actor",
    }),
    (error: unknown) => error instanceof PluginWiringError && error.code === "port_type_mismatch",
  );
  assert.deepEqual(rig.graph.view().plugins.find((entry) => entry.plugin_id === CODING)?.ports[0]?.state, "missing");
});

test("an input group decides which ports are required", async () => {
  const deliveries: PluginUpstreamReadyInputs[] = [];
  const projects = portPlugin({ id: PROJECTS, outputs: [{ port: "project", type: PROJECT_TYPE }] });
  const files = portPlugin({ id: FILES, outputs: [{ port: "selection", type: FILES_TYPE }] });
  const coding = portPlugin({
    id: CODING,
    inputs: [
      { port: "project", type: PROJECT_TYPE },
      { port: "files", type: FILES_TYPE },
    ],
    groups: [
      { group_id: "project-only", title: "只用项目", ports: ["project"] },
      { group_id: "project-and-files", title: "项目加文件", ports: ["project", "files"] },
    ],
    onReady: (inputs) => {
      deliveries.push(inputs);
    },
  });

  const rig = harness([projects.definition, files.definition, coding.definition]);
  await rig.start();
  rig.graph.bind({
    board_id: BOARD,
    target_plugin_id: CODING,
    target_port: "project",
    source_plugin_id: PROJECTS,
    source_port: "project",
    origin: "user",
    actor_id: "actor",
  });
  rig.graph.publish({
    plugin_id: PROJECTS,
    port: "project",
    reference: rig.artifacts.put("artifact-project", 1),
  });

  rig.graph.evaluate(CODING);
  await rig.graph.drain();
  assert.deepEqual(deliveries, [], "没选输入组时不应投递");

  rig.graph.selectInputGroup(CODING, "project-only");
  rig.graph.evaluate(CODING);
  await rig.graph.drain();
  assert.equal(deliveries.length, 1);
  assert.deepEqual(Object.keys(deliveries[0] ?? {}), ["project"]);

  rig.graph.selectInputGroup(CODING, "project-and-files");
  rig.graph.evaluate(CODING);
  await rig.graph.drain();
  assert.equal(deliveries.length, 1, "换到更宽的组后输入不齐，不应再投递");
  assert.deepEqual(rig.graph.status(CODING), { status: "missing", missing: ["files"] });
});

test("the same version is not redelivered, and a new version is", async () => {
  const deliveries: PluginUpstreamReadyInputs[] = [];
  const projects = portPlugin({ id: PROJECTS, outputs: [{ port: "project", type: PROJECT_TYPE }] });
  const coding = portPlugin({
    id: CODING,
    inputs: [{ port: "project", type: PROJECT_TYPE }],
    onReady: (inputs) => {
      deliveries.push(inputs);
    },
  });

  const rig = harness([projects.definition, coding.definition]);
  await rig.start();
  rig.graph.bind({
    board_id: BOARD,
    target_plugin_id: CODING,
    target_port: "project",
    source_plugin_id: PROJECTS,
    source_port: "project",
    origin: "user",
    actor_id: "actor",
  });

  const first = rig.artifacts.put("artifact-project", 1);
  rig.graph.publish({ plugin_id: PROJECTS, port: "project", reference: first });
  rig.graph.evaluate(CODING);
  rig.graph.evaluate(CODING);
  await rig.graph.drain();
  assert.equal(deliveries.length, 1);

  rig.graph.publish({
    plugin_id: PROJECTS,
    port: "project",
    reference: rig.artifacts.put("artifact-project", 2),
  });
  rig.graph.evaluate(CODING);
  await rig.graph.drain();
  assert.equal(deliveries.length, 2);
  assert.equal(deliveries[1]?.project?.version, 2);
});

test("a consumer that is not running is started when its inputs become ready", async () => {
  const deliveries: PluginUpstreamReadyInputs[] = [];
  const projects = portPlugin({ id: PROJECTS, outputs: [{ port: "project", type: PROJECT_TYPE }] });
  const coding = portPlugin({
    id: CODING,
    inputs: [{ port: "project", type: PROJECT_TYPE }],
    onReady: (inputs) => {
      deliveries.push(inputs);
    },
    failUntil: 1,
  });

  const rig = harness([projects.definition, coding.definition]);
  const report = await rig.start();
  assert.deepEqual(report.failed.map((state) => state.plugin_id), [CODING]);

  rig.graph.bind({
    board_id: BOARD,
    target_plugin_id: CODING,
    target_port: "project",
    source_plugin_id: PROJECTS,
    source_port: "project",
    origin: "user",
    actor_id: "actor",
  });
  rig.graph.publish({
    plugin_id: PROJECTS,
    port: "project",
    reference: rig.artifacts.put("artifact-project", 1),
  });
  rig.graph.evaluate(CODING);
  await rig.graph.drain();

  assert.equal(deliveries.length, 1);
  assert.equal(rig.supervisor.state(CODING)?.status, "running");
});

test("content that can no longer be read is reported instead of delivered", async () => {
  const deliveries: PluginUpstreamReadyInputs[] = [];
  const reasons: PluginUpstreamUnavailableReason[] = [];
  const projects = portPlugin({ id: PROJECTS, outputs: [{ port: "project", type: PROJECT_TYPE }] });
  const coding = portPlugin({
    id: CODING,
    inputs: [{ port: "project", type: PROJECT_TYPE }],
    onReady: (inputs) => {
      deliveries.push(inputs);
    },
    onUnavailable: (reason) => {
      reasons.push(reason);
    },
  });

  const rig = harness([projects.definition, coding.definition]);
  await rig.start();
  rig.graph.bind({
    board_id: BOARD,
    target_plugin_id: CODING,
    target_port: "project",
    source_plugin_id: PROJECTS,
    source_port: "project",
    origin: "user",
    actor_id: "actor",
  });
  const reference = rig.artifacts.put("artifact-project", 1);
  rig.graph.publish({ plugin_id: PROJECTS, port: "project", reference });
  rig.graph.evaluate(CODING);
  await rig.graph.drain();
  assert.equal(deliveries.length, 1);

  rig.artifacts.drop(reference);
  rig.graph.evaluate(CODING);
  await rig.graph.drain();

  assert.equal(reasons[0]?.code, "content_unavailable");
  assert.equal(deliveries.length, 1);
});
