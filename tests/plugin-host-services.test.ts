import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginActions } from "./fixtures/plugin-actions.js";
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
import { MemoryPluginEventsRepository, MemoryPluginWiringRepository, PluginEventBus, PluginInputGraph, PluginRuntime, PluginSupervisor, portArtifactId } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { createShelfPlugin } from "@molis-ai/molis-work-plugin-shelf";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import {
  DEMO_PROJECT_ID,
  LocalProjectDatabase,
  PluginHostExecutor,
  seedDemoBoard,
} from "@molis-ai/molis-work-app-local-host";
import { pinnedArtifact } from "./fixtures/artifacts.js";
import { artifactPreview } from "./fixtures/artifact-preview.js";

const PRODUCER = "io.molis.work.producer";
const CONSUMER = "io.molis.work.consumer";
const TYPE = "demo.payload";
const EVENT = `${PRODUCER}.updated`;

function demoAction(capability_id: string): ActionDefinition<{ value: string }, string> {
  return { capability_id, version: 1, operation: "query", action: { title: capability_id, description: "Demo read", kind: "query", scope: "project",
    audiences: ["plugin"], permissions: [], subject_kinds: [],
    input_schema: { type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false }, output_schema: { type: "string" } } };
}
const CAPABILITY = demoAction("demo.read.v1");
const FORBIDDEN = demoAction("demo.secret.v1");

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
    artifacts: { produces: [], consumes: [] },
    // Port values are process items: exchange data kept out of the 成果库 (artifact-positioning A2).
    process_items: {
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
  actions: ReturnType<typeof pluginActions>;
  runtime: PluginRuntime;
  artifacts: ArtifactsModule;
  processItems: ProcessItemsModule;
  supervisor: PluginSupervisor;
  wiring: PluginInputGraph;
  events: PluginEventBus;
  services: Record<string, PluginHostServices | undefined>;
  invoked: string[];
  received: unknown[];
  delivered: string[][];
  close(): void;
}

function harness(definitions: (register: Harness) => PluginDefinition[], partial = false): Harness {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-services-"));
  const file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const artifacts = new ArtifactsModule({
    db: store.db,
    appendEvent: (event) => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId),
  });
  const processItems = new ProcessItemsModule({ db: store.db, appendEvent: (event) => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) });

  const invoked: string[] = [];
  const actions = pluginActions(store, DEMO_PROJECT_ID);
  // The Host actions a plugin may consume, as a system provider offers them.
  actions.registry.registerProvider({ provider: { provider_id: "demo-host", title: "Demo", kind: "system" }, definitions: [CAPABILITY, FORBIDDEN],
    handlers: [CAPABILITY, FORBIDDEN].map(definition => ({ ...definition, handle: () => { invoked.push(definition.capability_id); return "ok"; } })) });
  const executor = new PluginHostExecutor({ actions: pluginActions(store, DEMO_PROJECT_ID),
    project_id: DEMO_PROJECT_ID,
    actor_id: "tester",
    artifacts,
    processItems,
    ui: new UiHost(),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
  });
  // A plugin that declares actions (the preview of a 成果 type it pins) is installed against the Kernel that holds them.
  const runtime = new PluginRuntime(undefined, executor, { actions: pluginActions(store, DEMO_PROJECT_ID), ...(partial ? { redemption: () => ({ partial: true }) } : {}) });
  const supervisor = new PluginSupervisor(runtime);
  const wiring = new PluginInputGraph({
    projectId: DEMO_PROJECT_ID,
    lifecycle: supervisor,
    repository: new MemoryPluginWiringRepository(),
    artifacts: {
      read: (reference) => processItems.query.getArtifactVersion(DEMO_PROJECT_ID, reference)
        ?? artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, reference),
    },
  });
  const events = new PluginEventBus({
    projectId: DEMO_PROJECT_ID,
    lifecycle: supervisor,
    repository: new MemoryPluginEventsRepository(),
  });
  // The one explicit seam: the services exist only after the lifecycle does.
  executor.attach({
    events,
    wiring,
    dependencyCheck: () => ({ available: true }),
    scopeKey: "workspace-a",
  });

  const rig: Harness = {
    actions: pluginActions(store, DEMO_PROJECT_ID),
    runtime,
    artifacts,
    processItems,
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

function definitionFor(rig: Harness, manifest: PluginManifest, actions: PluginAppContribution["actions"] = []): PluginDefinition {
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
        ...(actions.length > 0 ? { actions } : {}),
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
    assert.ok(producerServices?.actions, "插件经 actions 调用它消费的动作");
    assert.equal(Reflect.get(producerServices!, "capabilities"), undefined, "typed 的 capabilities 通道已删除");
    assert.equal(producerServices?.inputs, undefined, "没有输入端口就不该拿到 inputs");

    const consumerServices = rig.services[CONSUMER];
    assert.ok(consumerServices?.inputs, "声明了输入端口就该拿到 inputs");
    assert.equal(consumerServices?.outputs, undefined, "没有输出端口就不该拿到 outputs");
    assert.equal(consumerServices?.events, undefined, "只订阅不发布就不该拿到发布口");
    assert.equal(Reflect.get(consumerServices!, "capabilities"), undefined, "typed 的 capabilities 通道已删除");
  } finally {
    rig.close();
  }
});

test("an action the Manifest never listed is refused before the Host is asked", async () => {
  const rig = harness(() => []);
  try {
    await rig.supervisor.start([{
      definition: definitionFor(rig, manifestFor({ id: PRODUCER, consumes: ["demo.read.v1"] })),
    }]);
    const actions = rig.services[PRODUCER]?.actions;
    assert.ok(actions);
    const control = { beforeEffect: async () => {} };

    assert.deepEqual(actions.availability(FORBIDDEN), { available: false, code: "plugin.capability_denied", reason: "插件未声明消费此动作", kind: "invalid" });
    await assert.rejects(
      () => actions.invoke(FORBIDDEN, { value: "x" }, control),
      (error: unknown) => (error instanceof ActionError && error.code === "actions.forbidden"),
    );
    assert.deepEqual(rig.invoked, [], "被拒绝的调用不该到达宿主");

    assert.deepEqual(actions.availability(CAPABILITY), { available: true });
    assert.equal(await actions.invoke(CAPABILITY, { value: "x" }, control), "ok");
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
      project_id: DEMO_PROJECT_ID,
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
      project_id: DEMO_PROJECT_ID,
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


test("a 成果 port carries a pinned version by selection: exact identity, no copy, and only the producer's own available version of its type", async () => {
  const rig = harness(() => []);
  try {
    const REPORT = "demo.report";
    const producer = manifestFor({ id: PRODUCER, outputs: ["payload"] });
    producer.permissions.push({ permission: "artifact:read", required: true, reason: "读取自己的固定成果" });
    producer.ports!.outputs.push({ port: "report", artifact_type_id: REPORT, schema_version: 1 });
    // Each 成果 type a plugin pins is named and has a preview action of its own plugin.
    const reportPreview = artifactPreview(PRODUCER, REPORT), otherPreview = artifactPreview(PRODUCER, "other.type"), consumerPreview = artifactPreview(CONSUMER, REPORT);
    producer.actions = [reportPreview.definition, otherPreview.definition];
    producer.artifacts.produces.push(reportPreview.type, otherPreview.type);
    producer.artifacts.consumes.push({ artifact_type_id: REPORT, schema_version: 1 }, { artifact_type_id: "other.type", schema_version: 1 });
    const consumer = manifestFor({ id: CONSUMER, inputs: ["payload"] });
    consumer.ports!.inputs.push({ port: "report", artifact_type_id: REPORT, schema_version: 1, optional: true });
    consumer.artifacts.consumes.push({ artifact_type_id: REPORT, schema_version: 1 });
    consumer.actions = [consumerPreview.definition];
    consumer.artifacts.produces.push(consumerPreview.type);
    consumer.permissions.push({ permission: "artifact:write", required: true, reason: "发布自己的成果" });
    await rig.supervisor.start([{ definition: definitionFor(rig, producer, [reportPreview.handler, otherPreview.handler]) }, { definition: definitionFor(rig, consumer, [consumerPreview.handler]) }]);
    rig.wiring.bind({ project_id: DEMO_PROJECT_ID, target_plugin_id: CONSUMER, target_port: "report", source_plugin_id: PRODUCER, source_port: "report", origin: "user", actor_id: "tester" });
    const services = rig.services[PRODUCER]!, outputs = services.outputs!;
    const fixed = { artifact_id: "fixed-report-one", version: 1 };
    const original = services.artifacts.publish({ ...fixed, artifact_type_id: REPORT, schema_version: 1, content: { kind: "inline", payload: { note: "不可改写的原报告" } }, ...pinnedArtifact("原报告") });
    const count = rig.artifacts.query.listArtifacts(DEMO_PROJECT_ID).length;
    assert.deepEqual(outputs.select({ port: "report", reference: fixed, expected_reference: null }), fixed);
    await rig.wiring.drain();
    assert.deepEqual(rig.services[CONSUMER]!.inputs!.reference("report"), fixed);
    assert.deepEqual(rig.services[CONSUMER]!.artifacts.read(fixed), original.artifact);
    assert.equal(rig.artifacts.query.listArtifacts(DEMO_PROJECT_ID).length, count, "selection does not copy the report");
    assert.deepEqual(outputs.select({ port: "report", reference: fixed, expected_reference: null }), fixed, "lost-response retry is harmless");
    assert.throws(() => outputs.publish({ port: "report", content: { kind: "inline", payload: { note: "直接写进端口" } } }), /请先固定再选择/,
      "a 成果 reaches a port only after it is pinned");
    const foreign = rig.services[CONSUMER]!.artifacts.publish({ artifact_id: "foreign-report", version: 1, artifact_type_id: REPORT, schema_version: 1, content: { kind: "inline", payload: { note: "另一个生产者" } }, ...pinnedArtifact("另一个生产者") }).artifact;
    assert.throws(() => outputs.select({ port: "report", reference: foreign, expected_reference: fixed }), /自己的/);
    const wrong = services.artifacts.publish({ artifact_id: "other-kind", version: 1, artifact_type_id: "other.type", schema_version: 1, content: { kind: "inline", payload: {} }, ...pinnedArtifact("另一种成果") }).artifact;
    assert.throws(() => outputs.select({ port: "report", reference: wrong, expected_reference: fixed }), /类型/);
    rig.artifacts.commands.archiveVersion({ project_id: DEMO_PROJECT_ID, actor_id: "tester", ...fixed });
    // The person reads why in words; the reason stays machine-readable in the details.
    assert.throws(() => outputs.select({ port: "report", reference: fixed, expected_reference: null }),
      (error: { code?: string; message?: string; details?: { reason?: string } }) => error.code === "artifacts.plugin_incompatible"
        && error.details?.reason === "artifact_archived" && /已归档/u.test(error.message ?? ""));
  } finally { rig.close(); }
});

test("W4-04-01 a plugin reads the head of its own line of 成果; another producer's line and a plugin without artifact:read are refused", async () => {
  const rig = harness(() => []);
  try {
    const REPORT = "demo.report";
    const reader = manifestFor({ id: CONSUMER, inputs: ["payload"] }), writer = manifestFor({ id: PRODUCER, outputs: ["payload"] });
    reader.permissions.push({ permission: "artifact:write", required: true, reason: "固定自己的成果" });
    const readerPreview = artifactPreview(CONSUMER, REPORT), writerPreview = artifactPreview(PRODUCER, REPORT);
    reader.actions = [readerPreview.definition]; reader.artifacts.produces.push(readerPreview.type);
    writer.actions = [writerPreview.definition]; writer.artifacts.produces.push(writerPreview.type);
    await rig.supervisor.start([{ definition: definitionFor(rig, writer, [writerPreview.handler]) }, { definition: definitionFor(rig, reader, [readerPreview.handler]) }]);
    const own = rig.services[CONSUMER]!.artifacts, other = rig.services[PRODUCER]!.artifacts;
    const pin = (artifacts: typeof own, artifact_id: string, version: number, revision: string) => artifacts.publish({ artifact_id, version,
      artifact_type_id: REPORT, schema_version: 1, content: { kind: "inline", payload: { version } }, supersedes_version: version > 1 ? version - 1 : null,
      ...pinnedArtifact("报告", { kind: "report", id: artifact_id }, revision) });
    assert.equal(own.head("report-a"), null, "a line the project does not hold yet");
    pin(own, "report-a", 1, "3"); pin(own, "report-a", 2, "7");
    assert.deepEqual(own.head("report-a"), { version: 2, source_revision: 7 });
    pin(other, "report-b", 1, "1");
    assert.throws(() => own.head("report-b"), (error: { code?: string }) => error.code === "artifacts.plugin_denied", "another producer's line");
    assert.throws(() => other.head("report-b"), /未声明/u, "a plugin that does not declare artifact:read");
  } finally { rig.close(); }
});

test("W4-04-02 a plugin reads back a version it pinned itself, archived and not consumed; read still refuses it, and another producer's version is refused", async () => {
  const rig = harness(() => []);
  try {
    const REPORT = "demo.report";
    const reader = manifestFor({ id: CONSUMER, inputs: ["payload"] }), writer = manifestFor({ id: PRODUCER, outputs: ["payload"] });
    reader.permissions.push({ permission: "artifact:write", required: true, reason: "固定自己的成果" });
    const readerPreview = artifactPreview(CONSUMER, REPORT), writerPreview = artifactPreview(PRODUCER, REPORT);
    reader.actions = [readerPreview.definition]; reader.artifacts.produces.push(readerPreview.type);
    writer.actions = [writerPreview.definition]; writer.artifacts.produces.push(writerPreview.type);
    await rig.supervisor.start([{ definition: definitionFor(rig, writer, [writerPreview.handler]) }, { definition: definitionFor(rig, reader, [readerPreview.handler]) }]);
    const own = rig.services[CONSUMER]!.artifacts, other = rig.services[PRODUCER]!.artifacts;
    const pin = (artifacts: typeof own, artifact_id: string) => artifacts.publish({ artifact_id, version: 1,
      artifact_type_id: REPORT, schema_version: 1, content: { kind: "inline", payload: { note: artifact_id } }, supersedes_version: null,
      ...pinnedArtifact("报告", { kind: "report", id: artifact_id }, "1") });
    assert.equal(own.readOwn({ artifact_id: "report-a", version: 1 }), null, "a version the project does not hold");
    pin(own, "report-a"); pin(other, "report-b");
    rig.artifacts.commands.archiveVersion({ project_id: DEMO_PROJECT_ID, artifact_id: "report-a", version: 1, actor_id: "tester" });
    const back = own.readOwn({ artifact_id: "report-a", version: 1 });
    assert.equal(back?.lifecycle_state, "archived");
    assert.deepEqual(back?.payload, { note: "report-a" });
    assert.throws(() => own.read({ artifact_id: "report-a", version: 1 }), (error: { code?: string }) => error.code === "artifacts.plugin_incompatible",
      "read answers only what the plugin consumes and can still use");
    assert.throws(() => own.readOwn({ artifact_id: "report-b", version: 1 }), (error: { code?: string }) => error.code === "artifacts.plugin_denied", "another producer's version");
    assert.throws(() => other.readOwn({ artifact_id: "report-b", version: 1 }), /未声明/u, "a plugin that does not declare artifact:read");
  } finally { rig.close(); }
});

test("W5-01-D1-06: a process item port keeps its own version sequence: selecting an older version guards stale choices and never rewinds generation", async () => {
  const rig = harness(() => []);
  try {
    const producer = manifestFor({ id: PRODUCER, outputs: ["payload"] });
    producer.permissions.push({ permission: "artifact:read", required: true, reason: "读取自己的过程项" });
    producer.process_items!.consumes.push({ artifact_type_id: TYPE, schema_version: 1 });
    await rig.supervisor.start([
      { definition: definitionFor(rig, producer) },
      { definition: definitionFor(rig, manifestFor({ id: CONSUMER, inputs: ["payload"], outputs: ["other"] })) },
    ]);
    rig.wiring.bind({ project_id: DEMO_PROJECT_ID, target_plugin_id: CONSUMER, target_port: "payload", source_plugin_id: PRODUCER, source_port: "payload", origin: "user", actor_id: "tester" });
    const outputs = rig.services[PRODUCER]!.outputs!;
    const first = outputs.publish({ port: "payload", content: { kind: "inline", payload: { note: "端口第一版" } } }).artifact;
    assert.equal(first.version, 1);
    assert.equal(rig.artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, first), null, "port values never land in the 成果库");
    const second = outputs.publish({ port: "payload", content: { kind: "inline", payload: { note: "下一版" } } }).artifact;
    assert.equal(second.version, 2);
    assert.throws(() => outputs.select({ port: "payload", reference: first, expected_reference: first }), /已变化/);
    outputs.select({ port: "payload", reference: first, expected_reference: second });
    await rig.wiring.drain();
    assert.deepEqual(rig.services[CONSUMER]!.inputs!.reference("payload"), { artifact_id: first.artifact_id, version: 1 });
    const third = outputs.publish({ port: "payload", content: { kind: "inline", payload: { note: "第三版" } } }).artifact;
    assert.equal(third.version, 3, "selecting an old version must not rewind generation");
    const process = rig.services[PRODUCER]!.processItems!;
    assert.deepEqual(process.head(first.artifact_id), { version: 3 });
    assert.deepEqual(process.readOwn(first), first);
    assert.deepEqual(process.readOwn(third), third);
    const unbound = process.record({ artifact_id: "unbound-process", version: 1, artifact_type_id: TYPE, schema_version: 1,
      content: { kind: "inline", payload: { note: "未连端口也能读取" } }, metadata: { title: "独立过程项" } }).artifact;
    const catalogue = rig.services[CONSUMER]!.artifacts!.listConsumable();
    assert.deepEqual(catalogue.map(row => [row.artifact_id, row.version]), rig.processItems.query.listArtifacts(DEMO_PROJECT_ID).map(row => [row.artifact_id, row.version]));
    assert.equal(catalogue.find(row => row.artifact_id === unbound.artifact_id)?.title, "独立过程项");
    const foreign = rig.services[CONSUMER]!.outputs!.publish({ port: "other", content: { kind: "inline", payload: { note: "另一个生产者" } } }).artifact;
    assert.throws(() => outputs.select({ port: "payload", reference: foreign, expected_reference: outputs.reference("payload") }), /自己的/);
    assert.throws(() => outputs.select({ port: "undeclared", reference: first, expected_reference: null }), /没有输出/);
    await rig.runtime.stop(rig.supervisor.state(PRODUCER)!.install_id!);
    assert.deepEqual(rig.services[CONSUMER]!.artifacts!.read(first), first, "producer stop does not invalidate a fixed consumable version");
    assert.ok(rig.services[CONSUMER]!.artifacts!.listConsumable().some(row => row.artifact_id === unbound.artifact_id));
    // BL-411: outside every call the stopped producer's handles are refused and answer nothing (they answered both above).
    assert.equal(process.readOwn(first), undefined);
    assert.equal(process.head(first.artifact_id), undefined);
  } finally { rig.close(); }
});


// W3-02-F-INTEGRATION: C's owner binding and foreign-IO refusal survive the migration of Shelf's own declared errors.
test("Shelf's Runtime action wraps an outside IO error before the SDK route can trust its forged code or diagnostic id", async () => {
  // Shelf's personal actions are its Home half's; this project's half redeems only the Coding-result ones.
  const rig = harness(() => [], true);
  let reads = 0;
  rig.artifacts.query.getArtifactVersion = () => {
    reads++;
    throw Object.assign(new Error("外部读取被拒绝"), {
      code: "outside.denied", kind: "forbidden", call_id: "forged-call-id",
      details: { code: "outside.denied", call_id: "forged-call-id" },
    });
  };
  try {
    const definition = createShelfPlugin();
    // Shelf is a 常开插件: only an install that ships with the Host may carry the mark (S-34).
    await rig.supervisor.start([{ definition, bundled: true, dual_instance: true }]);
    const contribution = rig.supervisor.contribution(definition.manifest.plugin_id);
    assert.equal(contribution?.kind, "app", JSON.stringify(rig.supervisor.state(definition.manifest.plugin_id)));
    if (contribution?.kind !== "app") throw new Error("Expected Shelf app contribution");
    const route = contribution.routes?.find(row => row.route_id === "shelf.project-result-preview");
    assert.ok(route);
    const result = await route.handle({ actor_id: "tester", method: "GET", pathname: "/api/plugins/io.molis.work.shelf/project-result",
      params: {}, query: { artifact_id: "coding-report:outside:run", version: "1" } });
    assert.equal(reads, 1, "the real action reached the outside artifact IO port");
    assert.deepEqual(result, { status: 400, body: { error: "外部读取被拒绝", code: "shelf.invalid" } },
      "an outside code, kind and call_id cannot become Shelf's response or fake a recorded diagnostic id");
  } finally { rig.close(); }
});

// The actual Runtime action scope, rather than a supplied author callback, must determine attribution through the Host.
test("W5-01-D1-04 W5-01-D1-06: Host services retain the current action author and reject another actor's personal process recovery", async () => {
  const rig = harness(() => []);
  try {
    const producer = manifestFor({ id: PRODUCER, inputs: ["input"], outputs: ["payload"] });
    const preview = artifactPreview(PRODUCER, "example.note");
    const record: ActionDefinition = { capability_id: `${PRODUCER}.record`, version: 1, operation: "command", action: {
      title: "记下当前调用者", description: "用宿主绑定的身份固定结果", kind: "operation", scope: "project", audiences: ["user"],
      permissions: ["artifact:write"], subject_kinds: [], input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
      output_schema: { type: "null" },
    } };
    producer.actions = [preview.definition, record];
    producer.artifacts.produces = [preview.type];
    const handlers: NonNullable<PluginAppContribution["actions"]> = [preview.handler, { ...record, execution: "sync", handle() {
      const services = rig.services[PRODUCER]!;
      services.artifacts!.publish({ artifact_id: "host-authored-report", version: 1, artifact_type_id: "example.note", schema_version: 1,
        ...pinnedArtifact("Action report"), content: { kind: "inline", payload: {} } });
      services.processItems!.record({ artifact_id: "host-authored-process", version: 1, artifact_type_id: TYPE, schema_version: 1,
        content: { kind: "inline", payload: {} } });
      return null;
    } }];
    await rig.supervisor.start([{ definition: definitionFor(rig, producer, handlers) }]);
    await rig.actions.client.invoke({ actor_id: "actual-caller", project_id: DEMO_PROJECT_ID, audience: "user", permissions: ["artifact:write"] }, record, {});
    const report = rig.artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, { artifact_id: "host-authored-report", version: 1 });
    const process = rig.processItems.query.getArtifactVersion(DEMO_PROJECT_ID, { artifact_id: "host-authored-process", version: 1 });
    assert.ok(report && process);
    assert.equal(report.created_by, "actual-caller");
    assert.equal(report.owner_actor_id, "actual-caller", "without Home owner, the Module keeps its existing author default");
    assert.equal(process.created_by, "actual-caller");
    assert.equal(process.owner_actor_id, "actual-caller");
    const services = rig.services[PRODUCER]!;
    assert.deepEqual(services.artifacts!.readOwn(report), report, "artifact own is not tightened to the installation actor");
    assert.throws(() => services.processItems!.head(process.artifact_id), { code: "artifacts.plugin_denied" });
    assert.throws(() => services.processItems!.readOwn(process), { code: "artifacts.plugin_denied" });
    assert.equal(services.artifacts!.listConsumable().some(row => row.artifact_id === process.artifact_id), false);
  } finally { rig.close(); }
});
