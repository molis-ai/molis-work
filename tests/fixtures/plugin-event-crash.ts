import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PluginEventBus, PluginRuntime, PluginSupervisor, SqlitePluginEventsRepository, SqlitePluginRuntimeRepository } from '@molis-ai/molis-work-plugin-runtime';
import type { PluginDefinition, PluginEventDeliveryContext } from '@molis-ai/molis-work-contracts/platform/plugin';

export const EVENT_BOARD = 'crash-board', EVENT_SOURCE = 'io.molis.work.event-source', EVENT_SUBSCRIBER = 'io.molis.work.event-subscriber', EVENT_TYPE = EVENT_SOURCE + '.changed';
export function eventCrashDefinition(id: string, handler?: (context: PluginEventDeliveryContext) => void | Promise<void>): PluginDefinition {
  const publishes = id === EVENT_SOURCE ? [{ event_type_id: EVENT_TYPE, type_version: 1 }] : [];
  return { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version: '1.0.0', name: id, kind: 'app',
    publisher: { publisher_id: 'fixture', signature: id }, entrypoints: [{ deployment: 'local', entrypoint: './event.mjs' }], permissions: [],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
    ui: { contributions: [id + '.main'], views: [{ view_id: 'main', slot: 'stage', title: 'Main' }] },
    events: { publishes, subscribes: id === EVENT_SUBSCRIBER ? [{ event_type_id: EVENT_TYPE, type_version: 1, from_plugin_ids: [EVENT_SOURCE] }] : [] } },
    event_types: publishes.map(type => ({ ...type, validate: payload => payload })),
    async start() { return { kind: 'app', views: [{ descriptor: { contribution_id: id + '.main', plugin_id: id, kind: 'primary-page', label: 'Main', slots: [] }, render: () => '' }],
      ...(handler ? { onEvent: (_event, context) => handler(context) } : {}) }; }, async stop() {} };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = new Database(process.argv[2]!);
  db.exec('CREATE TABLE effects (value TEXT)');
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(db)), supervisor = new PluginSupervisor(runtime);
  const bus = new PluginEventBus({ boardId: EVENT_BOARD, lifecycle: supervisor, repository: new SqlitePluginEventsRepository(db) });
  await supervisor.start([{ definition: eventCrashDefinition(EVENT_SOURCE) }, { definition: eventCrashDefinition(EVENT_SUBSCRIBER, async context => {
    context.beforeEffect(); db.prepare('INSERT INTO effects VALUES (?)').run('committed');
    process.stdout.write('committed\n'); await new Promise(() => {});
  }) }]);
  await bus.resume(EVENT_BOARD);
  bus.publish({ board_id: EVENT_BOARD, plugin_id: EVENT_SOURCE, install_id: supervisor.installation(EVENT_SOURCE)!.install_id }, { event_type_id: EVENT_TYPE, type_version: 1, payload: {} });
  // Keep a real process alive until the parent kills it after the business commit.
  setInterval(() => {}, 1000);
  await bus.drain();
}
