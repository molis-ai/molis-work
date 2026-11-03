import { LocalProjectDatabase } from '@molis-ai/molis-work-app-local-host';
import { wakeupInstallation } from './scheduler-owner.js';
import { SCHEDULE_PLUGIN_ID, SCHEDULE_OPERATION_WAKEUP, prepareScheduledOperation, runScheduledOperation } from '@molis-ai/molis-work-plugin-schedule';

const [path, at, mode] = process.argv.slice(2);
if (!path || !at || !mode || !process.send) throw new Error('Expected an isolated project, clock, crash phase and IPC');
const store = new LocalProjectDatabase(path), installation = wakeupInstallation(SCHEDULE_PLUGIN_ID), clock = new Date(at);
installation.action(SCHEDULE_OPERATION_WAKEUP, async (input, control) => {
  prepareScheduledOperation(store.db, input);
  if (mode === 'before-dispatch') { process.send!('prepared'); await new Promise(() => {}); }
  const result = await runScheduledOperation(store.db, input, control, {
    currentInstallation: () => true, now: () => clock,
    executor: () => ({ signal: control.signal, beforeEffect() {}, async invoke(current) {
      store.db.transaction(() => {
        current.beforeEffect();
        store.db.prepare('UPDATE scheduled_test_effects SET n = n + 1').run();
      }).immediate();
      if (mode === 'after-dispatch') { process.send!('dispatched'); await new Promise(() => {}); }
      return { state: 'succeeded', value: 'committed result' };
    } }),
    deliver() { throw new Error('fixture never requests Inbox'); },
  });
  process.send!('committed');
  await new Promise(() => {}); // Stop between domain commit and the Scheduler's technical receipt.
  return result;
});
await installation.scheduler(store.db, { now: () => clock }).tick(clock);
