import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type {
  PluginAppContribution,
  PluginDefinition,
  PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { PLUGIN_ROUTE_PREFIX } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import {
  DEMO_BOARD_ID,
  LocalProjectDatabase,
  createPluginPlatform,
  seedDemoBoard,
} from "@molis-ai/molis-work-app-local-host";

const PRODUCER = "io.molis.work.producer";
const CONSUMER = "io.molis.work.consumer";
const TYPE = "demo.payload";
const EVENT = `${PRODUCER}.updated`;

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
  routes?: boolean;
}): PluginManifest {
  const hasOutputs = (input.outputs ?? []).length > 0;
  const hasInputs = (input.inputs ?? []).length > 0;
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
      ...(hasOutputs ? [{ permission: "artifact:write", required: true, reason: "发布端口值" }] : []),
      ...(hasInputs ? [{ permission: "artifact:read", required: true, reason: "读取输入" }] : []),
    ],
    capabilities: { provides: [], consumes: [] },
    artifacts: {
      produces: hasOutputs ? [{ artifact_type_id: TYPE, schema_version: 1 }] : [],
      consumes: hasInputs ? [{ artifact_type_id: TYPE, schema_version: 1 }] : [],
    },
    ui: {
      contributions: [`${input.id}.main`],
      views: [{ view_id: "main", slot: "stage", title: "Main" }],
    },
    ports: {
      inputs: (input.inputs ?? []).map((port) => ({ port, artifact_type_id: TYPE, schema_version: 1 })),
      outputs: (input.outputs ?? []).map((port) => ({ port, artifact_type_id: TYPE, schema_version: 1 })),
    },
    ...(input.publishes === true || input.subscribes === true
      ? {
        events: {
          publishes: input.publishes === true ? [{ event_type_id: EVENT, type_version: 1 }] : [],
          subscribes: input.subscribes === true
            ? [{ event_type_id: EVENT, type_version: 1, from_plugin_ids: [PRODUCER] }]
            : [],
        },
      }
      : {}),
    ...(input.routes === true
      ? { routes: [{ route_id: "demo.read", method: "GET" as const, path: "/state" }] }
      : {}),
  };
}

interface Recorder {
  received: unknown[];
  delivered: string[][];
}

function definitionFor(
  manifest: PluginManifest,
  recorder: Recorder,
  onStart?: (services: unknown) => void,
): PluginDefinition {
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
      onStart?.(context.services);
      const contribution: PluginAppContribution = {
        kind: "app",
        views: [view(manifest.plugin_id)],
        ...((manifest.events?.subscribes ?? []).length > 0
          ? { onEvent: (event) => { recorder.received.push(event.payload); } }
          : {}),
        ...((manifest.ports?.inputs ?? []).length > 0
          ? {
            onUpstreamReady: (inputs) => { recorder.delivered.push(Object.keys(inputs).sort()); },
            onUpstreamUnavailable: () => {},
          }
          : {}),
        ...(manifest.routes
          ? {
            routes: [{
              route_id: "demo.read",
              handle: () => ({ status: 200, body: { plugin: manifest.plugin_id } }),
            }],
          }
          : {}),
      };
      return contribution;
    },
    async stop() {},
  };
}

function project(directory: string) {
  const file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const artifacts = new ArtifactsModule({
    db: store.db,
    appendEvent: (event) => store.appendEvent(event),
  });
  const platform = createPluginPlatform({
    board_id: DEMO_BOARD_ID,
    actor_id: "tester",
    db: store.db,
    artifacts,
    ui: new UiHost(),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
  });
  return { store, platform };
}

test("one factory composes the whole v2 platform and it works end to end", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-platform-"));
  try {
    const { store, platform } = project(directory);
    const recorder: Recorder = { received: [], delivered: [] };
    let producerServices: { outputs?: unknown; events?: unknown } | undefined;

    const producer = manifestFor({
      id: PRODUCER,
      outputs: ["payload"],
      publishes: true,
      routes: true,
    });
    const consumer = manifestFor({ id: CONSUMER, inputs: ["payload"], subscribes: true });

    const report = await platform.start([
      { definition: definitionFor(producer, recorder, (services) => {
        producerServices = services as { outputs?: unknown; events?: unknown };
      }) },
      { definition: definitionFor(consumer, recorder) },
    ]);
    assert.deepEqual(report.failed, []);
    assert.deepEqual(report.blocked, []);
    assert.deepEqual(report.running.sort(), [CONSUMER, PRODUCER]);

    // Ports, events and routes all reach the Plugin through one composition.
    assert.ok(producerServices?.outputs);
    assert.ok(producerServices?.events);

    platform.wiring.bind({
      board_id: DEMO_BOARD_ID,
      target_plugin_id: CONSUMER,
      target_port: "payload",
      source_plugin_id: PRODUCER,
      source_port: "payload",
      origin: "user",
      actor_id: "tester",
    });
    const outputs = producerServices!.outputs as {
      publish(input: unknown): { artifact: { version: number } };
    };
    outputs.publish({ port: "payload", content: { kind: "inline", payload: { note: "v1" } } });
    await platform.wiring.drain();
    assert.deepEqual(recorder.delivered, [["payload"]]);

    const events = producerServices!.events as {
      publish(input: unknown): { accepted: boolean };
    };
    events.publish({ event_type_id: EVENT, type_version: 1, payload: { note: "changed" } });
    await platform.events.drain();
    assert.deepEqual(recorder.received, [{ note: "changed" }]);

    const response = await platform.router().dispatch({
      method: "GET",
      pathname: `${PLUGIN_ROUTE_PREFIX}/${PRODUCER}/state`,
      actor_id: "tester",
    });
    assert.deepEqual(response, { status: 200, body: { plugin: PRODUCER } });

    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("bindings, port values and undelivered events survive reopening the project", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-platform-restart-"));
  try {
    const producer = manifestFor({ id: PRODUCER, outputs: ["payload"], publishes: true });
    const consumer = manifestFor({ id: CONSUMER, inputs: ["payload"], subscribes: true });

    // First process: the consumer cannot start, so nothing reaches it.
    const first = project(directory);
    const firstRecorder: Recorder = { received: [], delivered: [] };
    let outputs: { publish(input: unknown): unknown } | undefined;
    let events: { publish(input: unknown): unknown } | undefined;
    const brokenConsumer: PluginDefinition = {
      ...definitionFor(consumer, firstRecorder),
      async start() {
        throw new Error("Consumer 启动失败");
      },
    };
    await first.platform.start([
      { definition: definitionFor(producer, firstRecorder, (services) => {
        const bound = services as { outputs: typeof outputs; events: typeof events };
        outputs = bound.outputs;
        events = bound.events;
      }) },
      { definition: brokenConsumer },
    ]);
    first.platform.wiring.bind({
      board_id: DEMO_BOARD_ID,
      target_plugin_id: CONSUMER,
      target_port: "payload",
      source_plugin_id: PRODUCER,
      source_port: "payload",
      origin: "user",
      actor_id: "tester",
    });
    outputs!.publish({ port: "payload", content: { kind: "inline", payload: { note: "v1" } } });
    events!.publish({ event_type_id: EVENT, type_version: 1, payload: { note: "changed" } });
    await first.platform.wiring.drain();
    await first.platform.events.drain();
    assert.deepEqual(firstRecorder.received, [], "消费者起不来就什么都收不到");
    first.store.close();

    // Second process over the same database: the consumer starts, and the
    // binding, the port's current version and the pending event all come back.
    const second = project(directory);
    const secondRecorder: Recorder = { received: [], delivered: [] };
    await second.platform.start([
      { definition: definitionFor(producer, secondRecorder) },
      { definition: definitionFor(consumer, secondRecorder) },
    ]);
    await second.platform.wiring.drain();
    await second.platform.events.drain();

    assert.deepEqual(secondRecorder.delivered, [["payload"]], "连线和端口版本应从库里恢复");
    assert.deepEqual(secondRecorder.received, [{ note: "changed" }], "欠着的事件应补投一次");

    await second.platform.events.resume(DEMO_BOARD_ID);
    await second.platform.events.drain();
    assert.equal(secondRecorder.received.length, 1, "再次 resume 不应重复投递");
    second.store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
