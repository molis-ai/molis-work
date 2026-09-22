import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type {
  PluginAppContribution,
  PluginDefinition,
  PluginHostServices,
  PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import type { HostCapabilityDefinition } from "@molis-ai/molis-work-contracts/platform/app-host";
import {
  MemoryPluginEventsRepository,
  MemoryPluginWiringRepository,
  PluginCapabilityAccessError,
  PluginEventBus,
  PluginInputGraph,
  PluginRuntime,
  PluginSupervisor,
  portArtifactId,
} from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import {
  DEMO_BOARD_ID,
  LocalProjectDatabase,
  PluginHostExecutor,
  seedDemoBoard,
} from "@molis-ai/molis-work-app-local-host";

const PRODUCER = "io.molis.work.producer";
const CONSUMER = "io.molis.work.consumer";
const TYPE = "demo.payload";
const EVENT = `${PRODUCER}.updated`;

const CAPABILITY: HostCapabilityDefinition<[string], string> = {
  capability_id: "demo.read.v1",
  version: 1,
  operation: "query",
};
const FORBIDDEN: HostCapabilityDefinition<[string], string> = {
  capability_id: "demo.secret.v1",
  version: 1,
  operation: "query",
};

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

function manifestFor(input: {
  id: string;
  inputs?: string[];
  outputs?: string[];
  publishes?: boolean;
  subscribes?: boolean;
  consumes?: string[];
}): PluginManifest {
  const events = input.publishes === true || input.subscribes === true
    ? {
      events: {
        publishes: input.publishes === true ? [{ event_type_id: EVENT, type_version: 1 }] : [],
        subscribes: input.subscribes === true
          ? [{ event_type_id: EVENT, type_version: 1, from_plugin_ids: [PRODUCER] }]
          : [],
      },
    }
    : {};
  return {
    schema_version: 2,
    host_api_version: 2,
    plugin_id: input.id,
    version: "1.0.0",
    name: input.id,
    kind: "app",
    publisher: { publisher_id: "molis", signature: `${input.id}-binding` },
    entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [
      { permission: "ui:register", required: true, reason: "注册视图" },
      ...((input.outputs ?? []).length > 0
        ? [{ permission: "artifact:write", required: true, reason: "发布端口值" }]
        : []),
      ...((input.inputs ?? []).length > 0
        ? [{ permission: "artifact:read", required: true, reason: "读取输入" }]
        : []),
    ],
    capabilities: { provides: [], consumes: input.consumes ?? [] },
    artifacts: {
      produces: (input.outputs ?? []).length > 0
        ? [{ artifact_type_id: TYPE, schema_version: 1 }]
        : [],
      consumes: (input.inputs ?? []).length > 0
        ? [{ artifact_type_id: TYPE, schema_version: 1 }]
        : [],
    },
    ui: {
      contributions: [`${input.id}.main`],
      views: [{ view_id: "main", slot: "stage", title: "Main" }],
    },
    ports: {
      inputs: (input.inputs ?? []).map((port) => ({
        port,
        artifact_type_id: TYPE,
        schema_version: 1,
      })),
      outputs: (input.outputs ?? []).map((port) => ({
        port,
        artifact_type_id: TYPE,
        schema_version: 1,
      })),
    },
    ...events,
  };
}

interface Harness {
  artifacts: ArtifactsModule;
  supervisor: PluginSupervisor;
  wiring: PluginInputGraph;
  events: PluginEventBus;
  services: Record<string, PluginHostServices | undefined>;
  invoked: string[];
  received: unknown[];
  delivered: string[][];
  close(): void;
}

function harness(definitions: (register: Harness) => PluginDefinition[]): Harness {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-services-"));
  const file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const artifacts = new ArtifactsModule({
    db: store.db,
    appendEvent: (event) => store.appendEvent(event),
  });

  const invoked: string[] = [];
  const executor = new PluginHostExecutor({
    board_id: DEMO_BOARD_ID,
    actor_id: "tester",
    artifacts,
    ui: new UiHost(),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
  });
  const runtime = new PluginRuntime(undefined, executor);
  const supervisor = new PluginSupervisor(runtime);
  const wiring = new PluginInputGraph({
    boardId: DEMO_BOARD_ID,
    lifecycle: supervisor,
    repository: new MemoryPluginWiringRepository(),
    artifacts: {
      read: (reference) => artifacts.query.getArtifactVersion(DEMO_BOARD_ID, reference),
    },
  });
  const events = new PluginEventBus({
    boardId: DEMO_BOARD_ID,
    lifecycle: supervisor,
    repository: new MemoryPluginEventsRepository(),
  });
  // The one explicit seam: the services exist only after the lifecycle does.
  executor.attach({
    events,
    wiring,
    capabilities: {
      async invoke(definition) {
        invoked.push(definition.capability_id);
        return "ok" as never;
      },
    },
    scopeKey: "workspace-a",
  });

  const rig: Harness = {
    artifacts,
    supervisor,
    wiring,
    events,
    services: {},
    invoked,
    received: [],
    delivered: [],
    close() {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
  void definitions;
  return rig;
}

function definitionFor(rig: Harness, manifest: PluginManifest): PluginDefinition {
  return {
    manifest,
    ...((manifest.events?.publishes ?? []).length > 0
      ? {
        event_types: [{
          event_type_id: EVENT,
          type_version: 1,
          validate: (payload: unknown) => payload,
        }],
      }
      : {}),
    async start(context) {
      rig.services[manifest.plugin_id] = context.services;
      const contribution: PluginAppContribution = {
        kind: "app",
        views: [view(manifest.plugin_id)],
        ...((manifest.events?.subscribes ?? []).length > 0
          ? { onEvent: (event) => { rig.received.push(event.payload); } }
          : {}),
        ...((manifest.ports?.inputs ?? []).length > 0
          ? {
            onUpstreamReady: (inputs) => { rig.delivered.push(Object.keys(inputs).sort()); },
            onUpstreamUnavailable: () => {},
          }
          : {}),
      };
      return contribution;
    },
    async stop() {},
  };
}

test("a Plugin receives exactly the services its Manifest declared", async () => {
  const rig = harness(() => []);
  try {
    const producer = manifestFor({
      id: PRODUCER,
      outputs: ["payload"],
      publishes: true,
      consumes: ["demo.read.v1"],
    });
    const consumer = manifestFor({ id: CONSUMER, inputs: ["payload"], subscribes: true });
    await rig.supervisor.start([
      { definition: definitionFor(rig, producer) },
      { definition: definitionFor(rig, consumer) },
    ]);

    const producerServices = rig.services[PRODUCER];
    assert.ok(producerServices?.outputs, "声明了输出端口就该拿到 outputs");
    assert.ok(producerServices?.events, "声明了发布事件就该拿到 events");
    assert.ok(producerServices?.capabilities, "声明了消费 Capability 就该拿到 capabilities");
    assert.equal(producerServices?.inputs, undefined, "没有输入端口就不该拿到 inputs");

    const consumerServices = rig.services[CONSUMER];
    assert.ok(consumerServices?.inputs, "声明了输入端口就该拿到 inputs");
    assert.equal(consumerServices?.outputs, undefined, "没有输出端口就不该拿到 outputs");
    assert.equal(consumerServices?.events, undefined, "只订阅不发布就不该拿到发布口");
    assert.equal(consumerServices?.capabilities, undefined, "没声明消费就不该拿到 capabilities");
  } finally {
    rig.close();
  }
});

test("a Capability the Manifest never listed is refused before the Host is asked", async () => {
  const rig = harness(() => []);
  try {
    await rig.supervisor.start([{
      definition: definitionFor(rig, manifestFor({ id: PRODUCER, consumes: ["demo.read.v1"] })),
    }]);
    const capabilities = rig.services[PRODUCER]?.capabilities;
    assert.ok(capabilities);

    await assert.rejects(
      () => capabilities.invoke(FORBIDDEN, ["x"]),
      (error: unknown) => error instanceof PluginCapabilityAccessError,
    );
    assert.deepEqual(rig.invoked, [], "被拒绝的调用不该到达宿主");

    assert.equal(await capabilities.invoke(CAPABILITY, ["x"]), "ok");
    assert.deepEqual(rig.invoked, ["demo.read.v1"]);
  } finally {
    rig.close();
  }
});

test("publishing on an output port feeds a bound consumer a real Artifact version", async () => {
  const rig = harness(() => []);
  try {
    const producer = manifestFor({ id: PRODUCER, outputs: ["payload"] });
    const consumer = manifestFor({ id: CONSUMER, inputs: ["payload"] });
    await rig.supervisor.start([
      { definition: definitionFor(rig, producer) },
      { definition: definitionFor(rig, consumer) },
    ]);
    rig.wiring.bind({
      board_id: DEMO_BOARD_ID,
      target_plugin_id: CONSUMER,
      target_port: "payload",
      source_plugin_id: PRODUCER,
      source_port: "payload",
      origin: "user",
      actor_id: "tester",
    });

    const outputs = rig.services[PRODUCER]?.outputs;
    assert.ok(outputs);
    const result = outputs.publish({
      port: "payload",
      content: { kind: "inline", payload: { note: "第一版" } },
    });
    assert.equal(result.artifact.artifact_id, portArtifactId(PRODUCER, "payload"));
    assert.equal(result.artifact.version, 1);
    await rig.wiring.drain();
    assert.deepEqual(rig.delivered, [["payload"]]);

    const inputs = rig.services[CONSUMER]?.inputs;
    assert.ok(inputs);
    assert.deepEqual(inputs.status(), { status: "ready", ports: ["payload"] });
    assert.deepEqual(inputs.read("payload")?.payload, { note: "第一版" });

    // A second publish advances the same Artifact identity, so the port has a history.
    outputs.publish({ port: "payload", content: { kind: "inline", payload: { note: "第二版" } } });
    await rig.wiring.drain();
    assert.equal(inputs.reference("payload")?.version, 2);
    assert.deepEqual(rig.delivered, [["payload"], ["payload"]]);
  } finally {
    rig.close();
  }
});

test("invalidating an output withdraws it from the consumer", async () => {
  const rig = harness(() => []);
  try {
    await rig.supervisor.start([
      { definition: definitionFor(rig, manifestFor({ id: PRODUCER, outputs: ["payload"] })) },
      { definition: definitionFor(rig, manifestFor({ id: CONSUMER, inputs: ["payload"] })) },
    ]);
    rig.wiring.bind({
      board_id: DEMO_BOARD_ID,
      target_plugin_id: CONSUMER,
      target_port: "payload",
      source_plugin_id: PRODUCER,
      source_port: "payload",
      origin: "user",
      actor_id: "tester",
    });
    const outputs = rig.services[PRODUCER]!.outputs!;
    outputs.publish({ port: "payload", content: { kind: "inline", payload: { note: "x" } } });
    await rig.wiring.drain();
    assert.equal(rig.delivered.length, 1);

    outputs.invalidate("payload", "项目已切换");
    await rig.wiring.drain();
    assert.equal(rig.services[CONSUMER]!.inputs!.status().status, "missing");
    assert.equal(rig.services[CONSUMER]!.inputs!.read("payload"), null);
  } finally {
    rig.close();
  }
});

test("a published event reaches a subscriber through the real Host services", async () => {
  const rig = harness(() => []);
  try {
    await rig.supervisor.start([
      { definition: definitionFor(rig, manifestFor({ id: PRODUCER, publishes: true })) },
      { definition: definitionFor(rig, manifestFor({ id: CONSUMER, subscribes: true })) },
    ]);
    const events = rig.services[PRODUCER]?.events;
    assert.ok(events);

    const accepted = events.publish({
      event_type_id: EVENT,
      type_version: 1,
      payload: { note: "有变化" },
    });
    assert.equal(accepted.accepted, true);
    await rig.events.drain();
    assert.deepEqual(rig.received, [{ note: "有变化" }]);
  } finally {
    rig.close();
  }
});


test("selecting an owned fixed output keeps exact identity, guards stale choices and preserves generated version history", async () => {
  const rig = harness(() => []);
  try {
    const producer = manifestFor({ id: PRODUCER, outputs: ["payload"] });
    producer.permissions.push({ permission: "artifact:read", required: true, reason: "读取自己的固定成果" });
    producer.artifacts.consumes.push({ artifact_type_id: TYPE, schema_version: 1 }, { artifact_type_id: "other.type", schema_version: 1 });
    producer.artifacts.produces.push({ artifact_type_id: "other.type", schema_version: 1 });
    await rig.supervisor.start([
      { definition: definitionFor(rig, producer) },
      { definition: definitionFor(rig, manifestFor({ id: CONSUMER, inputs: ["payload"], outputs: ["other"] })) },
    ]);
    rig.wiring.bind({ board_id: DEMO_BOARD_ID, target_plugin_id: CONSUMER, target_port: "payload", source_plugin_id: PRODUCER, source_port: "payload", origin: "user", actor_id: "tester" });
    const services = rig.services[PRODUCER]!, outputs = services.outputs!;
    const fixed = { artifact_id: "fixed-report-one", version: 1 };
    const original = services.artifacts.publish({ ...fixed, artifact_type_id: TYPE, schema_version: 1, content: { kind: "inline", payload: { note: "不可改写的原报告" } } });
    const count = rig.artifacts.query.listArtifacts(DEMO_BOARD_ID).length;
    assert.deepEqual(outputs.select({ port: "payload", reference: fixed, expected_reference: null }), fixed);
    await rig.wiring.drain();
    assert.deepEqual(rig.services[CONSUMER]!.inputs!.reference("payload"), fixed);
    assert.deepEqual(rig.services[CONSUMER]!.inputs!.read("payload"), original.artifact);
    assert.equal(rig.artifacts.query.listArtifacts(DEMO_BOARD_ID).length, count, "selection does not copy the report");
    assert.deepEqual(outputs.select({ port: "payload", reference: fixed, expected_reference: null }), fixed, "lost-response retry is harmless");
    const first = outputs.publish({ port: "payload", content: { kind: "inline", payload: { note: "端口新版本" } } }).artifact;
    assert.equal(first.version, 1, "fixed report version is not the generated output sequence");
    assert.throws(() => outputs.select({ port: "payload", reference: fixed, expected_reference: null }), /已变化/);
    outputs.select({ port: "payload", reference: fixed, expected_reference: first });
    const second = outputs.publish({ port: "payload", content: { kind: "inline", payload: { note: "下一版" } } }).artifact;
    assert.equal(second.version, 2);
    outputs.select({ port: "payload", reference: first, expected_reference: second });
    assert.equal(outputs.publish({ port: "payload", content: { kind: "inline", payload: { note: "第三版" } } }).artifact.version, 3, "selecting an old version must not rewind generation");
    const foreign = rig.services[CONSUMER]!.outputs!.publish({ port: "other", content: { kind: "inline", payload: { note: "另一个生产者" } } }).artifact;
    assert.throws(() => outputs.select({ port: "payload", reference: foreign, expected_reference: outputs.reference("payload") }), /自己的/);
    const wrong = services.artifacts.publish({ artifact_id: "other-kind", version: 1, artifact_type_id: "other.type", schema_version: 1, content: { kind: "inline", payload: {} } }).artifact;
    assert.throws(() => outputs.select({ port: "payload", reference: wrong, expected_reference: outputs.reference("payload") }), /类型/);
    rig.artifacts.commands.archiveVersion({ board_id: DEMO_BOARD_ID, actor_id: "tester", ...fixed });
    assert.throws(() => outputs.select({ port: "payload", reference: fixed, expected_reference: outputs.reference("payload") }), /artifact_archived/);
    assert.throws(() => outputs.select({ port: "undeclared", reference: first, expected_reference: null }), /没有输出/);
  } finally { rig.close(); }
});
