import assert from "node:assert/strict";
import test from "node:test";
import type {
  PluginAppContribution,
  PluginDefinition,
  PluginEventDeliveryContext,
  PluginEventDeliveryFailure,
  PluginEventRecord,
  PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { PluginEventError } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import {
  MemoryPluginEventsRepository,
  PluginEventBus,
  PluginRuntime,
  PluginSupervisor,
} from "@molis-ai/molis-work-plugin-runtime";

const BOARD = "board-events";

interface EventSpec {
  type: string;
  version: number;
  validate?: (payload: unknown) => unknown;
}

interface SubscribeSpec {
  type: string;
  version: number;
  from: string[];
}

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

function eventPlugin(input: {
  id: string;
  publishes?: EventSpec[];
  subscribes?: SubscribeSpec[];
  onEvent?: (event: PluginEventRecord, context: PluginEventDeliveryContext) => void | Promise<void>;
  failUntil?: number;
}): { definition: PluginDefinition; starts: () => number } {
  const publishes = input.publishes ?? [];
  const subscribes = input.subscribes ?? [];
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
    ...(publishes.length > 0 || subscribes.length > 0
      ? {
        events: {
          publishes: publishes.map((item) => ({
            event_type_id: item.type,
            type_version: item.version,
          })),
          subscribes: subscribes.map((item) => ({
            event_type_id: item.type,
            type_version: item.version,
            from_plugin_ids: item.from,
          })),
        },
      }
      : {}),
  };

  let starts = 0;
  const definition: PluginDefinition = {
    manifest,
    event_types: publishes.map((item) => ({
      event_type_id: item.type,
      type_version: item.version,
      validate: item.validate ?? ((payload: unknown) => payload),
    })),
    async start() {
      starts += 1;
      if (input.failUntil !== undefined && starts <= input.failUntil) {
        throw new Error(`${input.id} 启动失败`);
      }
      const contribution: PluginAppContribution = {
        kind: "app",
        views: [view(input.id)],
        ...(subscribes.length > 0 ? { onEvent: input.onEvent ?? (() => {}) } : {}),
      };
      return contribution;
    },
    async stop() {},
  };
  return { definition, starts: () => starts };
}

function harness(definitions: PluginDefinition[]) {
  const runtime = new PluginRuntime();
  const supervisor = new PluginSupervisor(runtime);
  const repository = new MemoryPluginEventsRepository();
  const bus = new PluginEventBus({ boardId: BOARD, lifecycle: supervisor, repository });
  const failures: PluginEventDeliveryFailure[] = [];
  bus.observeFailures((failure) => failures.push(failure));
  return {
    runtime,
    supervisor,
    repository,
    bus,
    failures,
    start: () => supervisor.start(definitions.map((definition) => ({ definition }))),
    publish: (pluginId: string, type: string, version: number, payload: unknown) => {
      const installId = supervisor.state(pluginId)?.install_id;
      assert.ok(installId, `${pluginId} 应已安装`);
      return bus.publish(
        { board_id: BOARD, plugin_id: pluginId, install_id: installId },
        { event_type_id: type, type_version: version, payload },
      );
    },
  };
}

const FILES = "io.molis.work.files";
const CODING = "io.molis.work.coding";
const BYSTANDER = "io.molis.work.bystander";
const CHANGED = `${CODING}.file-changed`;

test("an event reaches its declared subscriber and nobody else", async () => {
  const received: unknown[] = [];
  const bystanderSaw: unknown[] = [];
  const coding = eventPlugin({ id: CODING, publishes: [{ type: CHANGED, version: 1 }] });
  const files = eventPlugin({
    id: FILES,
    subscribes: [{ type: CHANGED, version: 1, from: [CODING] }],
    onEvent: (event) => {
      received.push(event.payload);
    },
  });
  const bystander = eventPlugin({
    id: BYSTANDER,
    subscribes: [{ type: `${BYSTANDER}.other`, version: 1, from: [CODING] }],
    onEvent: (event) => {
      bystanderSaw.push(event.payload);
    },
  });

  const rig = harness([coding.definition, files.definition, bystander.definition]);
  await rig.start();
  const result = rig.publish(CODING, CHANGED, 1, { path: "src/a.ts" });
  assert.equal(result.accepted, true);
  assert.equal(result.ref.sequence, 1);

  await rig.bus.drain();
  assert.deepEqual(received, [{ path: "src/a.ts" }]);
  assert.deepEqual(bystanderSaw, []);
});

test("events from one source arrive in publication order", async () => {
  const seen: number[] = [];
  const coding = eventPlugin({ id: CODING, publishes: [{ type: CHANGED, version: 1 }] });
  const files = eventPlugin({
    id: FILES,
    subscribes: [{ type: CHANGED, version: 1, from: [CODING] }],
    onEvent: async (event) => {
      const payload = event.payload as { index: number };
      await new Promise((resolve) => setTimeout(resolve, payload.index === 0 ? 8 : 0));
      seen.push(payload.index);
    },
  });

  const rig = harness([coding.definition, files.definition]);
  await rig.start();
  for (let index = 0; index < 4; index += 1) rig.publish(CODING, CHANGED, 1, { index });
  await rig.bus.drain();

  assert.deepEqual(seen, [0, 1, 2, 3], "慢的第一条不能被后面的插队");
});

test("a subscriber that is not running is started on delivery", async () => {
  const received: unknown[] = [];
  const coding = eventPlugin({ id: CODING, publishes: [{ type: CHANGED, version: 1 }] });
  const files = eventPlugin({
    id: FILES,
    subscribes: [{ type: CHANGED, version: 1, from: [CODING] }],
    onEvent: (event) => {
      received.push(event.payload);
    },
    failUntil: 1,
  });

  const rig = harness([coding.definition, files.definition]);
  const report = await rig.start();
  assert.deepEqual(report.failed.map((state) => state.plugin_id), [FILES]);

  rig.publish(CODING, CHANGED, 1, { path: "src/b.ts" });
  await rig.bus.drain();

  assert.deepEqual(received, [{ path: "src/b.ts" }], "投递时应懒激活失败过的订阅者");
  assert.equal(rig.supervisor.state(FILES)?.status, "running");
});

test("a subscriber that cannot start keeps the event pending and reports why", async () => {
  const coding = eventPlugin({ id: CODING, publishes: [{ type: CHANGED, version: 1 }] });
  const files = eventPlugin({
    id: FILES,
    subscribes: [{ type: CHANGED, version: 1, from: [CODING] }],
    failUntil: 99,
  });

  const rig = harness([coding.definition, files.definition]);
  await rig.start();
  rig.publish(CODING, CHANGED, 1, { path: "src/c.ts" });
  await rig.bus.drain();

  assert.equal(rig.failures.length, 1);
  assert.equal(rig.failures[0]?.code, "subscriber_start_failed");
  assert.equal(rig.failures[0]?.subscriber_plugin_id, FILES);

  const cursors = rig.bus.cursors(BOARD, FILES);
  assert.equal(cursors.length, 1);
  assert.equal(cursors[0]?.delivered_sequence, 0, "未成功投递不能推进游标");
  assert.equal(cursors[0]?.state, "retry_wait");
  assert.equal(rig.bus.log(BOARD).length, 1, "事件仍保留在日志里");
});

test("a restart replays what the subscriber never acknowledged, exactly once", async () => {
  const received: unknown[] = [];
  const coding = eventPlugin({ id: CODING, publishes: [{ type: CHANGED, version: 1 }] });

  const flaky = { fail: true };
  const files: PluginDefinition = {
    ...eventPlugin({
      id: FILES,
      subscribes: [{ type: CHANGED, version: 1, from: [CODING] }],
    }).definition,
    async start() {
      if (flaky.fail) throw new Error("Files 启动失败");
      return {
        kind: "app",
        views: [view(FILES)],
        onEvent: (event: PluginEventRecord) => {
          received.push(event.payload);
        },
      };
    },
  };

  const rig = harness([coding.definition, files]);
  await rig.start();
  rig.publish(CODING, CHANGED, 1, { path: "src/d.ts" });
  rig.publish(CODING, CHANGED, 1, { path: "src/e.ts" });
  await rig.bus.drain();
  assert.deepEqual(received, []);

  flaky.fail = false;
  await rig.supervisor.restart(FILES);
  await rig.bus.resume(BOARD);
  await rig.bus.drain();

  assert.deepEqual(received, [{ path: "src/d.ts" }, { path: "src/e.ts" }]);

  await rig.bus.resume(BOARD);
  await rig.bus.drain();
  assert.equal(received.length, 2, "重复 resume 不应重投已确认的事件");
  assert.equal(rig.bus.cursors(BOARD, FILES)[0]?.delivered_sequence, 2);
});

test("a failing handler does not block the next event and is reported", async () => {
  const seen: number[] = [];
  const coding = eventPlugin({ id: CODING, publishes: [{ type: CHANGED, version: 1 }] });
  const files = eventPlugin({
    id: FILES,
    subscribes: [{ type: CHANGED, version: 1, from: [CODING] }],
    onEvent: (event) => {
      const payload = event.payload as { index: number };
      if (payload.index === 0) throw new Error("处理失败");
      seen.push(payload.index);
    },
  });

  const rig = harness([coding.definition, files.definition]);
  await rig.start();
  rig.publish(CODING, CHANGED, 1, { index: 0 });
  rig.publish(CODING, CHANGED, 1, { index: 1 });
  await rig.bus.drain();

  assert.deepEqual(seen, [1]);
  assert.equal(rig.failures[0]?.code, "subscriber_handler_failed");
  assert.equal(rig.bus.cursors(BOARD, FILES)[0]?.delivered_sequence, 2);
});

test("publishing is refused outside the Plugin's own declared contract", async () => {
  const coding = eventPlugin({
    id: CODING,
    publishes: [{
      type: CHANGED,
      version: 1,
      validate: (payload) => {
        const value = payload as { path?: unknown };
        if (typeof value?.path !== "string") throw new Error("path 必须是字符串");
        return value;
      },
    }],
  });
  const rig = harness([coding.definition]);
  await rig.start();

  const cases: Array<[string, () => void, string]> = [
    ["未声明的版本", () => rig.publish(CODING, CHANGED, 2, { path: "a" }), "event_not_declared"],
    ["别人的命名空间", () => rig.publish(CODING, `${FILES}.refreshed`, 1, {}), "event_type_not_owned"],
    ["宿主保留前缀", () => rig.publish(CODING, "host.shutdown", 1, {}), "event_type_reserved"],
    ["校验器拒绝", () => rig.publish(CODING, CHANGED, 1, { path: 42 }), "event_payload_invalid"],
    [
      "超过正文上限",
      () => rig.publish(CODING, CHANGED, 1, { path: "x".repeat(20_000) }),
      "event_payload_too_large",
    ],
  ];
  for (const [label, run, code] of cases) {
    assert.throws(
      run,
      (error: unknown) => error instanceof PluginEventError && error.code === code,
      label,
    );
  }
  assert.equal(rig.bus.log(BOARD).length, 0, "被拒绝的发布不应进入日志");
});

test("a Plugin whose event validators disagree with its Manifest never runs", async () => {
  const broken: PluginDefinition = {
    ...eventPlugin({ id: CODING, publishes: [{ type: CHANGED, version: 1 }] }).definition,
    event_types: [],
  };
  const rig = harness([broken]);
  const report = await rig.start();

  assert.deepEqual(report.running, []);
  assert.equal(report.failed[0]?.code, "plugin_event_type_missing");
  assert.match(report.failed[0]?.message ?? "", /没有对应的类型校验器/u);
});

test("revoking a Plugin drops what was queued for its old enablement", async () => {
  const received: unknown[] = [];
  const coding = eventPlugin({ id: CODING, publishes: [{ type: CHANGED, version: 1 }] });
  const files = eventPlugin({
    id: FILES,
    subscribes: [{ type: CHANGED, version: 1, from: [CODING] }],
    onEvent: (event) => {
      received.push(event.payload);
    },
  });

  const rig = harness([coding.definition, files.definition]);
  await rig.start();
  rig.publish(CODING, CHANGED, 1, { path: "src/f.ts" });
  rig.supervisor.revoke(FILES);
  await rig.bus.drain();

  assert.deepEqual(received, [], "已撤销启用的插件不应再收到旧世代的事件");
  assert.equal(rig.bus.log(BOARD).length, 1, "事件本身仍然留在日志里");
});
