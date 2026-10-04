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
  PluginInputDeliveryContext,
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
  onReady?: (inputs: PluginUpstreamReadyInputs, context: PluginInputDeliveryContext) => void | Promise<void>;
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
    // Ports imply these declarations; the Manifest validator refuses a Plugin without them.
    permissions: [
      ...(inputs.length > 0 ? [{ permission: "artifact:read", required: true, reason: "读取绑定的上游产出" }] : []),
      ...(outputs.length > 0 ? [{ permission: "artifact:write", required: true, reason: "发布端口产出" }] : []),
    ],
    capabilities: { provides: [], consumes: [] },
    artifacts: {
      produces: outputs.map((port) => ({ artifact_type_id: port.type, schema_version: port.version ?? 1 })),
      consumes: inputs.map((port) => ({ artifact_type_id: port.type, schema_version: port.version ?? 1 })),
    },
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
    runtime,
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

for (const change of ['archive', 'unavailable'] as const) {
  test(`fixed input ${change} is rejected at commit without waiting for a refresh`, async () => {
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    let writes = 0, delivery: PluginInputDeliveryContext | undefined;
    const reasons: PluginUpstreamUnavailableReason[] = [];
    const producer = portPlugin({ id: PROJECTS, outputs: [{ port: 'project', type: PROJECT_TYPE }] });
    const consumer = portPlugin({ id: CODING, inputs: [{ port: 'project', type: PROJECT_TYPE }],
      onReady: async (_inputs, context) => { delivery = context; entered.resolve(); await release.promise; context.beforeEffect(); writes++; },
      onUnavailable: reason => reasons.push(reason) });
    const rig = harness([producer.definition, consumer.definition]);
    await rig.start();
    rig.graph.bind({ board_id: BOARD, target_plugin_id: CODING, target_port: 'project', source_plugin_id: PROJECTS,
      source_port: 'project', origin: 'user', actor_id: 'actor' });
    const reference = rig.artifacts.put('fixed', 1);
    rig.graph.publish({ plugin_id: PROJECTS, port: 'project', reference });
    rig.graph.evaluateAll(); await entered.promise;
    const stored = rig.artifacts.read(reference)!;
    if (change === 'archive') stored.lifecycle_state = 'archived'; else stored.availability = 'unavailable';
    assert.equal(rig.graph.status(CODING).status, 'missing');
    release.resolve(); await rig.graph.drain();
    assert.equal(writes, 0); assert.equal(delivery!.signal.aborted, true);
    rig.graph.evaluateAll(); await rig.graph.drain();
    assert.equal(reasons.length, 1); assert.equal(reasons[0]!.code, 'content_unavailable');
    await rig.graph.close();
  });
}

test('a source invalidated while startup is waiting never reaches the consumer', async () => {
  const producer = portPlugin({ id: PROJECTS, outputs: [{ port: 'project', type: PROJECT_TYPE }] });
  let writes = 0;
  const consumer = portPlugin({ id: CODING, inputs: [{ port: 'project', type: PROJECT_TYPE }], onReady: () => { writes++; } });
  const rig = harness([producer.definition, consumer.definition]); await rig.start();
  const ensure = rig.supervisor.ensureStarted.bind(rig.supervisor), waiting = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  rig.supervisor.ensureStarted = async id => { waiting.resolve(); await release.promise; return ensure(id); };
  rig.graph.bind({ board_id: BOARD, target_plugin_id: CODING, target_port: 'project', source_plugin_id: PROJECTS,
    source_port: 'project', origin: 'user', actor_id: 'actor' });
  const reference = rig.artifacts.put('fixed', 1);
  rig.graph.publish({ plugin_id: PROJECTS, port: 'project', reference });
  rig.graph.evaluateAll(); await waiting.promise;
  rig.artifacts.read(reference)!.availability = 'unavailable';
  release.resolve(); await rig.graph.drain(); assert.equal(writes, 0);
  await rig.graph.close();
});

test('closing the input graph releases a waiting handler and refuses its late commit', async () => {
  const producer = portPlugin({ id: PROJECTS, outputs: [{ port: 'project', type: PROJECT_TYPE }] });
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), finished = Promise.withResolvers<void>();
  let writes = 0;
  const consumer = portPlugin({ id: CODING, inputs: [{ port: 'project', type: PROJECT_TYPE }], onReady: async (_inputs, context) => {
    entered.resolve(); await release.promise;
    try { context.beforeEffect(); writes++; } finally { finished.resolve(); }
  } });
  const rig = harness([producer.definition, consumer.definition]); await rig.start();
  rig.graph.bind({ board_id: BOARD, target_plugin_id: CODING, target_port: 'project', source_plugin_id: PROJECTS,
    source_port: 'project', origin: 'user', actor_id: 'actor' });
  rig.graph.publish({ plugin_id: PROJECTS, port: 'project', reference: rig.artifacts.put('fixed', 1) });
  rig.graph.evaluateAll(); await entered.promise;
  await rig.graph.close(); release.resolve(); await finished.promise;
  rig.graph.evaluateAll(); await rig.graph.drain(); assert.equal(writes, 0);
});

// A fixed 成果 version given to an input port (artifact-positioning, 2026-10-04): it is delivered as is until someone changes
// the port; only 成果库 versions of the port's type that can still be read are accepted; a plugin source on the same port
// replaces it, and unbinding clears either kind.
test("an input port can be given a fixed 成果 version instead of another plugin's output", async () => {
  const deliveries: PluginUpstreamReadyInputs[] = [];
  const projects = portPlugin({ id: PROJECTS, outputs: [{ port: "project", type: PROJECT_TYPE }] });
  const coding = portPlugin({ id: CODING, inputs: [{ port: "project", type: PROJECT_TYPE }], onReady: (inputs) => { deliveries.push(inputs); } });
  const runtime = new PluginRuntime(), supervisor = new PluginSupervisor(runtime), store = artifactStore(), library = new Set<string>();
  const graph = new PluginInputGraph({ boardId: BOARD, lifecycle: supervisor, repository: new MemoryPluginWiringRepository(),
    artifacts: { read: (reference) => store.read(reference),
      library: (reference) => library.has(`${reference.artifact_id}@${reference.version}`) ? store.read(reference) : null } });
  await supervisor.start([projects.definition, coding.definition].map((definition) => ({ definition })));
  const give = (reference: ArtifactReference, port = "project") => graph.bindArtifact({ target_plugin_id: CODING, target_port: port, ...reference, actor_id: "actor" });
  const refused = (code: string) => (error: unknown) => error instanceof PluginWiringError && error.code === code;
  const port = () => graph.view().plugins.find((plugin) => plugin.plugin_id === CODING)!.ports[0]!;

  const pinned = store.put("report", 2); library.add("report@2");
  const exchanged = store.put("exchange", 1);
  const otherType = store.put("selection", 1); library.add("selection@1"); store.read(otherType)!.artifact_type_id = FILES_TYPE;
  assert.throws(() => give(exchanged), refused("port_artifact_invalid"), "a process item is not a 成果 version");
  assert.throws(() => give(otherType), refused("port_type_mismatch"));
  assert.throws(() => give(pinned, "missing"), refused("port_unknown"));
  assert.equal(port().state, "missing");

  give(pinned);
  graph.evaluate(CODING);
  await graph.drain();
  assert.deepEqual(graph.status(CODING), { status: "ready", ports: ["project"] });
  assert.deepEqual([deliveries.length, deliveries[0]?.project?.artifact_id, deliveries[0]?.project?.version], [1, "report", 2]);
  assert.deepEqual([port().state, port().artifact, port().source], ["selected", { artifact_id: "report", version: 2 }, undefined]);

  // A version that can no longer be read stops being delivered, and the port says so.
  store.read(pinned)!.lifecycle_state = "archived";
  graph.evaluate(CODING);
  await graph.drain();
  const status = graph.status(CODING);
  assert.equal(status.status, "missing");
  assert.equal(status.status === "missing" && status.reason?.code, "content_unavailable");
  assert.equal(port().state, "unavailable");
  store.read(pinned)!.lifecycle_state = "active";
  assert.throws(() => { store.read(pinned)!.availability = "unavailable"; give(pinned); }, refused("port_artifact_invalid"));
  store.read(pinned)!.availability = "available";

  // Another plugin's output on the same port replaces the fixed version; unbinding clears whichever is there.
  graph.bind({ board_id: BOARD, target_plugin_id: CODING, target_port: "project", source_plugin_id: PROJECTS, source_port: "project", origin: "user", actor_id: "actor" });
  assert.deepEqual([port().artifact, port().source?.source_plugin_id], [undefined, PROJECTS]);
  give(pinned);
  assert.deepEqual([port().artifact?.artifact_id, port().source], ["report", undefined]);
  graph.unbind(CODING, "project");
  assert.deepEqual([port().state, port().artifact, port().source], ["missing", undefined, undefined]);
});
