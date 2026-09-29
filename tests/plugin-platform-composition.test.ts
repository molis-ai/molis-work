import { pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type {
  PluginAppContribution,
  PluginDefinition,
  PluginManifest,
  PluginEventsClient,
  PluginOutputsClient,
  PluginInputDeliveryContext,
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
  const platform = createPluginPlatform({ actions: pluginActions(store, DEMO_BOARD_ID),
    board_id: DEMO_BOARD_ID,
    actor_id: "tester",
    db: store.db,
    journal: store,
    artifacts,
    ui: new UiHost(),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
  });
  return { store, platform, artifacts };
}

test('stopped activation event clients remain revoked after restart and bus close releases a waiting subscriber', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'plugin-event-lifetime-')), { store, platform } = project(directory);
  const clients: PluginEventsClient[] = [], recorder: Recorder = { received: [], delivered: [] };
  const entered = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>(); let writes = 0;
  const producer = definitionFor(manifestFor({ id: PRODUCER, publishes: true }), recorder, services => clients.push((services as { events: PluginEventsClient }).events));
  const base = definitionFor(manifestFor({ id: CONSUMER, subscribes: true }), recorder);
  const consumer: PluginDefinition = { ...base, async start(context) { return { ...await base.start(context) as PluginAppContribution,
    onEvent: async (_event, delivery) => { entered.resolve(); await finish.promise; delivery.beforeEffect(); writes++; } }; } };
  try {
    await platform.start([{ definition: producer }, { definition: consumer }]);
    await platform.supervisor.restart(PRODUCER);
    const input = { event_type_id: EVENT, type_version: 1, payload: {} };
    assert.throws(() => clients[0]!.publish(input), { code: 'actions.forbidden' });
    clients.at(-1)!.publish(input); await entered.promise;
    await platform.events.close();
    assert.throws(() => clients.at(-1)!.publish(input), { code: 'event_identity_invalid' });
    finish.resolve(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(writes, 0);
    assert.equal(platform.events.cursors(DEMO_BOARD_ID, CONSUMER)[0]!.state, 'quarantined');
    assert.equal(platform.events.cursors(DEMO_BOARD_ID, CONSUMER)[0]!.delivered_sequence, 0);
  } finally {
    finish.resolve(); await platform.events.close();
    for (const record of platform.runtime.list()) if (record.state === 'running') await platform.runtime.stop(record.install_id);
    store.close(); rmSync(directory, { recursive: true, force: true });
  }
});

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

test('committed Artifact changes refresh existing inputs across connections and stop at project close', { timeout: 18000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'artifact-input-journal-'));
  const { store, platform, artifacts } = project(directory);
  const other = new LocalProjectDatabase(join(directory, 'board.db'));
  const remote = new ArtifactsModule({ db: other.db, appendEvent: event => other.appendEvent(event) });
  const recorder: Recorder = { received: [], delivered: [] };
  let outputs!: PluginOutputsClient;
  const contexts: PluginInputDeliveryContext[] = [];
  let unavailable = 0;
  let onUnavailable = Promise.withResolvers<void>();
  const base = definitionFor(manifestFor({ id: CONSUMER, inputs: ['payload'] }), recorder);
  const consumer: PluginDefinition = { ...base, async start(context) { return { ...await base.start(context) as PluginAppContribution,
    onUpstreamReady: (_inputs, delivery) => { delivery.beforeEffect(); contexts.push(delivery); },
    onUpstreamUnavailable: () => { unavailable++; onUnavailable.resolve(); } }; } };
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  try {
    await platform.start([
      { definition: definitionFor(manifestFor({ id: PRODUCER, outputs: ['payload'] }), recorder, services => { outputs = (services as { outputs: PluginOutputsClient }).outputs; }) },
      { definition: consumer },
    ]);
    platform.wiring.bind({ board_id: DEMO_BOARD_ID, target_plugin_id: CONSUMER, target_port: 'payload',
      source_plugin_id: PRODUCER, source_port: 'payload', origin: 'user', actor_id: 'tester' });
    const first = outputs.publish({ port: 'payload', content: { kind: 'inline', payload: 'first' } }).artifact;
    await platform.wiring.drain(); assert.equal(contexts.length, 1);
    // Let the watcher establish its cursor; repeating the current projection is idempotent.
    await delay(1100); assert.equal(contexts.length, 1);
    store.db.prepare('INSERT INTO boards (board_id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('other-board', 'Other', new Date().toISOString(), new Date().toISOString());
    const originalEvaluate = platform.wiring.evaluateAll.bind(platform.wiring); let refreshes = 0;
    platform.wiring.evaluateAll = () => { refreshes++; originalEvaluate(); };
    store.appendEvent({ eventId: 'other-project-artifact', boardId: 'other-board', actorId: 'tester', type: 'artifact.published',
      objectType: 'artifact', objectId: 'unrelated@1', reason: 'Other project', payload: {}, at: new Date().toISOString() });
    await delay(1100); assert.equal(refreshes, 0, 'another project does not invalidate this input graph');
    assert.throws(() => createPluginPlatform({ actions: pluginActions(store, DEMO_BOARD_ID), board_id: DEMO_BOARD_ID,
      actor_id: 'tester', db: store.db, journal: other, artifacts, ui: new UiHost(),
      privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) }), /当前项目连接/u);
    store.db.exec('BEGIN IMMEDIATE');
    artifacts.commands.markUnavailable({ board_id: DEMO_BOARD_ID, actor_id: 'tester', ...first, reason: 'rolled back' });
    await delay(1100);
    assert.equal(unavailable, 0); assert.equal(contexts[0]!.signal.aborted, false);
    store.db.exec('ROLLBACK'); await delay(1100);
    assert.equal(unavailable, 0); contexts[0]!.beforeEffect();
    assert.equal(artifacts.query.getArtifactVersion(DEMO_BOARD_ID, first)!.availability, 'available');

    other.db.exec('BEGIN IMMEDIATE');
    remote.commands.markUnavailable({ board_id: DEMO_BOARD_ID, actor_id: 'tester', ...first, reason: 'removed remotely' });
    await delay(1100); assert.equal(unavailable, 0, 'uncommitted work on another connection is invisible');
    other.db.exec('COMMIT'); await onUnavailable.promise;
    assert.equal(unavailable, 1); assert.equal(contexts[0]!.signal.aborted, true);
    assert.equal(platform.wiring.status(CONSUMER).status, 'missing');

    const second = outputs.publish({ port: 'payload', content: { kind: 'inline', payload: 'second' } }).artifact;
    await platform.wiring.drain(); assert.equal(contexts.length, 2);
    onUnavailable = Promise.withResolvers<void>();
    remote.commands.archiveVersion({ board_id: DEMO_BOARD_ID, actor_id: 'tester', ...second });
    await onUnavailable.promise; assert.equal(unavailable, 2);
    assert.equal(artifacts.query.getArtifactVersion(DEMO_BOARD_ID, second)!.lifecycle_state, 'archived');
    outputs.publish({ port: 'payload', content: { kind: 'inline', payload: 'third' } });
    await platform.wiring.drain(); assert.equal(contexts.length, 3);
    await platform.supervisor.restart(CONSUMER); await platform.wiring.drain();
    assert.equal(contexts.length, 4, 'a new activation receives the existing fixed input');
    assert.throws(() => contexts[2]!.beforeEffect()); contexts[3]!.beforeEffect();
    await platform.closeCoordination(); assert.equal(contexts[3]!.signal.aborted, true);
    outputs.publish({ port: 'payload', content: { kind: 'inline', payload: 'after close' } });
    await delay(1100); assert.equal(contexts.length, 4); assert.equal(unavailable, 2);
  } finally {
    if (store.db.inTransaction) store.db.exec('ROLLBACK');
    if (other.db.inTransaction) other.db.exec('ROLLBACK');
    await platform.closeCoordination(); other.close(); store.close(); rmSync(directory, { recursive: true, force: true });
  }
});
