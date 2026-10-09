import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eventCrashDefinition, EVENT_BOARD, EVENT_SOURCE, EVENT_SUBSCRIBER } from './fixtures/plugin-event-crash.js';
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
  SqlitePluginEventsRepository,
  SqlitePluginRuntimeRepository,
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
  const bus = new PluginEventBus({ projectId: BOARD, lifecycle: supervisor, repository });
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
        { project_id: BOARD, plugin_id: pluginId, install_id: installId },
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

test("a later event cannot acknowledge an earlier activation failure", async () => {
  const seen: unknown[] = [];
  const coding = eventPlugin({ id: CODING, publishes: [{ type: CHANGED, version: 1 }] });
  const files = eventPlugin({ id: FILES, subscribes: [{ type: CHANGED, version: 1, from: [CODING] }],
    failUntil: 2, onEvent: event => { seen.push(event.payload); } });
  const rig = harness([coding.definition, files.definition]);
  await rig.start();
  rig.publish(CODING, CHANGED, 1, { index: 1 });
  rig.publish(CODING, CHANGED, 1, { index: 2 });
  await rig.bus.drain();
  assert.deepEqual(seen, []);
  assert.equal(rig.bus.cursors(BOARD, FILES)[0]?.delivered_sequence, 0);
  await rig.bus.resume(BOARD); await rig.bus.drain();
  assert.deepEqual(seen, [{ index: 1 }, { index: 2 }]);
  assert.equal(rig.bus.cursors(BOARD, FILES)[0]?.delivered_sequence, 2);
  await rig.bus.resume(BOARD); await rig.bus.drain();
  assert.equal(seen.length, 2);
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

test("a failed delivering write cannot acknowledge an event whose handler never ran", async () => {
  const seen: unknown[] = [];
  const coding = eventPlugin({ id: CODING, publishes: [{ type: CHANGED, version: 1 }] });
  const files = eventPlugin({ id: FILES, subscribes: [{ type: CHANGED, version: 1, from: [CODING] }],
    onEvent: event => { seen.push(event.payload); } });
  const rig = harness([coding.definition, files.definition]); await rig.start();
  const save = rig.repository.saveCursor.bind(rig.repository); let unavailable = true;
  rig.repository.saveCursor = record => {
    if (unavailable && record.state === "delivering") { unavailable = false; throw new Error("storage unavailable"); }
    save(record);
  };
  rig.publish(CODING, CHANGED, 1, { path: "not-lost.txt" }); await rig.bus.drain();
  assert.deepEqual(seen, []);
  assert.equal(rig.bus.cursors(BOARD, FILES)[0]!.delivered_sequence, 0);
  assert.equal(rig.bus.cursors(BOARD, FILES)[0]!.state, "retry_wait");
  await rig.bus.resume(BOARD); await rig.bus.drain();
  assert.deepEqual(seen, [{ path: "not-lost.txt" }]);
  assert.equal(rig.bus.cursors(BOARD, FILES)[0]!.delivered_sequence, 1);
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

test("publish refuses foreign boards, stale installs and stopped publishers", async () => {
  const coding = eventPlugin({ id: CODING, publishes: [{ type: CHANGED, version: 1 }] });
  const rig = harness([coding.definition]); await rig.start();
  const install = rig.supervisor.installation(CODING)!;
  const input = { event_type_id: CHANGED, type_version: 1, payload: {} };
  for (const identity of [ { project_id: 'elsewhere', plugin_id: CODING, install_id: install.install_id }, { project_id: BOARD, plugin_id: CODING, install_id: 'old' } ]) {
    assert.throws(() => rig.bus.publish(identity, input), { code: 'event_identity_invalid' });
  }
  await rig.runtime.stop(install.install_id);
  assert.throws(() => rig.publish(CODING, CHANGED, 1, {}), { code: 'event_identity_invalid' });
  assert.deepEqual(rig.bus.log(BOARD), []);
});

test("a revoked delivery has its own identity, refuses late effects and never acknowledges success", async () => {
  const entered = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>(); let writes = 0;
  const coding = eventPlugin({ id: CODING, publishes: [{ type: CHANGED, version: 1 }] });
  const files = eventPlugin({ id: FILES, subscribes: [{ type: CHANGED, version: 1, from: [CODING] }], onEvent: async (_event, context) => {
    assert.equal(context.actor_id, 'plugin:' + FILES);
    assert.equal(context.installation_generation, rig.supervisor.installation(FILES)!.installation_generation);
    entered.resolve(); await finish.promise; context.beforeEffect(); writes++;
  } });
  const rig = harness([coding.definition, files.definition]); await rig.start();
  rig.publish(CODING, CHANGED, 1, {}); await entered.promise;
  assert.equal(rig.bus.cursors(BOARD, FILES)[0]!.state, 'delivering');
  rig.supervisor.revoke(FILES); finish.resolve(); await rig.bus.drain();
  assert.equal(writes, 0);
  assert.equal(rig.bus.cursors(BOARD, FILES)[0]!.delivered_sequence, 0);
  assert.equal(rig.bus.cursors(BOARD, FILES)[0]!.state, 'quarantined');
  await rig.supervisor.enable(FILES); await rig.bus.resume(BOARD); await rig.bus.drain();
  assert.equal(writes, 0, 'enable cannot automatically retry an uncertain delivery');
});

test('stop withdraws an activation before awaiting its cleanup hook', async () => {
  const entered = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>(), stopping = Promise.withResolvers<void>(), stopped = Promise.withResolvers<void>();
  let writes = 0;
  const coding = eventPlugin({ id: CODING, publishes: [{ type: CHANGED, version: 1 }] });
  const files = eventPlugin({ id: FILES, publishes: [{ type: FILES + '.changed', version: 1 }], subscribes: [{ type: CHANGED, version: 1, from: [CODING] }],
    onEvent: async (_event, context) => { entered.resolve(); await finish.promise; context.beforeEffect(); writes++; } });
  files.definition.stop = async () => { stopping.resolve(); await stopped.promise; };
  const rig = harness([coding.definition, files.definition]); await rig.start();
  rig.publish(CODING, CHANGED, 1, {}); await entered.promise;
  const stop = rig.runtime.stop(rig.supervisor.installation(FILES)!.install_id); await stopping.promise;
  assert.throws(() => rig.publish(FILES, FILES + '.changed', 1, {}), { code: 'event_identity_invalid' });
  finish.resolve(); await rig.bus.drain(); assert.equal(writes, 0);
  assert.equal(rig.bus.cursors(BOARD, FILES)[0]!.state, 'quarantined');
  stopped.resolve(); await stop;
});

test("reinstall binds a new cursor and cannot inherit pending work or late acknowledgements", async () => {
  const entered = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>(); const seen: string[] = [];
  const coding = eventPlugin({ id: CODING, publishes: [{ type: CHANGED, version: 1 }] });
  const files = eventPlugin({ id: FILES, subscribes: [{ type: CHANGED, version: 1, from: [CODING] }], onEvent: async (event, context) => {
    if (event.payload === 'old') { entered.resolve(); await finish.promise; }
    context.beforeEffect(); seen.push(event.payload as string);
  } });
  const rig = harness([coding.definition, files.definition]); await rig.start();
  const old = rig.supervisor.installation(FILES)!;
  rig.publish(CODING, CHANGED, 1, 'old'); await entered.promise;
  rig.supervisor.revoke(FILES); await rig.runtime.uninstall(old.install_id);
  rig.runtime.install({ definition: files.definition, deployment: 'local', grants: [] });
  await rig.start(); await rig.supervisor.enable(FILES);
  const current = rig.supervisor.installation(FILES)!;
  assert.notEqual(current.installation_generation, old.installation_generation);
  await rig.bus.resume(BOARD); finish.resolve(); await rig.bus.drain();
  rig.publish(CODING, CHANGED, 1, 'new'); await rig.bus.drain();
  assert.deepEqual(seen, ['new']);
  const cursors = rig.bus.cursors(BOARD, FILES);
  assert.equal(cursors.find(cursor => cursor.subscriber_generation === old.installation_generation)!.delivered_sequence, 0);
  assert.equal(cursors.find(cursor => cursor.subscriber_generation === current.installation_generation)!.delivered_sequence, 2);
});

test("subscriber and log readers cannot mutate another subscriber's durable payload", async () => {
  const seen: unknown[] = [], coding = eventPlugin({ id: CODING, publishes: [{ type: CHANGED, version: 1 }] });
  const first = eventPlugin({ id: FILES, subscribes: [{ type: CHANGED, version: 1, from: [CODING] }], onEvent: event => { (event.payload as { nested: { value: string } }).nested.value = 'changed'; } });
  const second = eventPlugin({ id: BYSTANDER, subscribes: [{ type: CHANGED, version: 1, from: [CODING] }], onEvent: event => { seen.push(event.payload); } });
  const rig = harness([coding.definition, first.definition, second.definition]); await rig.start();
  rig.publish(CODING, CHANGED, 1, { nested: { value: 'original' } });
  (rig.bus.log(BOARD)[0]!.payload as { nested: { value: string } }).nested.value = 'reader';
  await Promise.all([rig.bus.resume(BOARD), rig.bus.resume(BOARD)]); await rig.bus.drain();
  assert.deepEqual(seen, [{ nested: { value: 'original' } }]);
  assert.deepEqual(rig.bus.log(BOARD)[0]!.payload, { nested: { value: 'original' } });
});

test('an upgrade during subscriber activation hands pending events to the new version without gaps', async () => {
  const seen: unknown[] = [], entered = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>();
  const coding = eventPlugin({ id: CODING, publishes: [{ type: CHANGED, version: 1 }] });
  const files = eventPlugin({ id: FILES, subscribes: [{ type: CHANGED, version: 1, from: [CODING] }], onEvent: (event, context) => { context.beforeEffect(); seen.push(event.payload); } });
  const rig = harness([coding.definition, files.definition]); await rig.start();
  const ensure = rig.supervisor.ensureStarted.bind(rig.supervisor); let hold = true;
  rig.supervisor.ensureStarted = async id => { if (id === FILES && hold) { hold = false; entered.resolve(); await finish.promise; } return ensure(id); };
  rig.publish(CODING, CHANGED, 1, 'first'); await entered.promise;
  const upgraded = { ...files.definition, manifest: { ...files.definition.manifest, version: '2.0.0', upgrade_compatibility: { compatible_from_versions: ['1.0.0'] } } };
  assert.equal((await rig.supervisor.upgrade(FILES, upgraded))?.status, 'running');
  await rig.bus.resume(BOARD); rig.publish(CODING, CHANGED, 1, 'second'); finish.resolve(); await rig.bus.drain();
  assert.deepEqual(seen, ['first', 'second']);
  assert.equal(rig.bus.cursors(BOARD, FILES)[0]!.delivered_sequence, 2);
});

test('a real process killed after subscriber commit leaves an uncertain delivery that restart never replays', { timeout: 15_000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'plugin-event-crash-')), file = join(directory, 'events.db');
  const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/plugin-event-crash.ts', import.meta.url)), file], { stdio: ['ignore', 'pipe', 'pipe'] });
  const committed = Promise.withResolvers<void>(), ended = Promise.withResolvers<void>(); let output = '', errors = '';
  child.stdout.on('data', chunk => { output += String(chunk); if (output.includes('committed\n')) committed.resolve(); });
  child.stderr.on('data', chunk => { errors += String(chunk); });
  child.once('error', error => { committed.reject(error); ended.resolve(); });
  child.once('exit', () => { if (!output.includes('committed\n')) committed.reject(new Error(errors || 'child exited before commit')); ended.resolve(); });
  t.after(async () => { child.kill('SIGKILL'); await ended.promise; rmSync(directory, { recursive: true, force: true }); });
  await committed.promise; child.kill('SIGKILL'); await ended.promise;
  const db = new Database(file), repository = new SqlitePluginEventsRepository(db), runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(db)), supervisor = new PluginSupervisor(runtime);
  const bus = new PluginEventBus({ projectId: EVENT_BOARD, lifecycle: supervisor, repository });
  try {
    assert.equal(repository.listCursors(EVENT_BOARD, EVENT_SUBSCRIBER)[0]!.state, 'delivering');
    await supervisor.start([{ definition: eventCrashDefinition(EVENT_SOURCE) }, { definition: eventCrashDefinition(EVENT_SUBSCRIBER, context => {
      context.beforeEffect(); db.prepare('INSERT INTO effects VALUES (?)').run('repeated');
    }) }]);
    await bus.resume(EVENT_BOARD); await bus.drain(); await bus.resume(EVENT_BOARD); await bus.drain();
    assert.deepEqual(db.prepare('SELECT * FROM effects').all(), [{ value: 'committed' }]);
    assert.equal(repository.listCursors(EVENT_BOARD, EVENT_SUBSCRIBER)[0]!.state, 'quarantined');
    assert.equal(repository.listCursors(EVENT_BOARD, EVENT_SUBSCRIBER)[0]!.last_error_code, 'subscriber_outcome_unknown');
    assert.equal(repository.listCursors(EVENT_BOARD, EVENT_SUBSCRIBER)[0]!.delivered_sequence, 0);
  } finally { await bus.close(); for (const record of runtime.list()) if (record.state === 'running') await runtime.stop(record.install_id); db.close(); }
});
