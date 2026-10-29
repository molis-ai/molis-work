import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import Database from 'better-sqlite3';
import { assertActionInput } from '@molis-ai/molis-work-kernel';
import { createScheduleReminders, getScheduleReminder, reminderActions, SCHEDULE_PLUGIN_ID, SCHEDULE_PROJECT_DATABASE,
  SCHEDULE_REMINDER_WAKEUP } from '@molis-ai/molis-work-plugin-schedule';
import { wakeupInstallation } from './fixtures/scheduler-owner.js';

const at = '2026-09-28T00:00:00.000Z';
const identity = { projectId: 'p', pluginId: 'io.molis.work.test.reminders', installationId: 'installed' };
const schema = reminderActions.add.action.input_schema;
const takes = (text: string) => assert.doesNotThrow(() => assertActionInput(schema, { at, text }), 'the action schema takes it');
const refuses = (text: string) => assert.throws(() => assertActionInput(schema, { at, text }), { code: 'actions.input_invalid' });
// The schema counts characters (Ajv counts code points). This family is 7 of them, 11 UTF-16 units, and one grapheme.
const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}';

/** Schedule's real reminder service over one in-memory library with its wakeup offered, as tests/schedule-operations.test.ts builds it. */
function reminderService(t: TestContext) {
  const db = new Database(':memory:'), now = Date.parse(at);
  db.exec(SCHEDULE_PROJECT_DATABASE.schema);
  const wake = wakeupInstallation(SCHEDULE_PLUGIN_ID);
  wake.action(SCHEDULE_REMINDER_WAKEUP, async () => {});
  const schedule = wake.scheduler(db, { now: () => new Date(now) });
  t.after(async () => { await schedule.close(); db.close(); });
  const reminders = createScheduleReminders({ db, projectId: identity.projectId, schedule, now: () => now,
    describe: () => ({ title: '定时笔记', link: '/original-plugin', generation: 'first' }) });
  return {
    add: (text: string) => reminders.add(identity, { at, text }).reminderId,
    stored: (id: string) => getScheduleReminder(db, id)!,
    jobTitle: (id: string) => schedule.get(getScheduleReminder(db, id)!.jobId)?.title,
    count: () => (db.prepare('SELECT COUNT(*) AS n FROM schedule_plugin_reminders').get() as { n: number }).n,
  };
}

const ACCEPTED = [
  ['100 emoji', '😀'.repeat(100)],
  ['199 a and an emoji', 'a'.repeat(199) + '😀'],
  ['200 emoji', '😀'.repeat(200)],
  ['200 提', '提'.repeat(200)],
  ['100 a and 100 emoji', 'a'.repeat(100) + '😀'.repeat(100)],
  ['199 a and a space', 'a'.repeat(199) + ' '],
] as const;

test('RAC-1885 a reminder text of at most 200 characters is taken, however many UTF-16 units it is', async t => {
  const service = reminderService(t);
  for (const [name, text] of ACCEPTED) await t.test(name, () => {
    takes(text);
    const id = service.add(text);
    assert.equal(service.stored(id).text, text);
    const title = service.jobTitle(id);
    assert.ok(title && title.length <= 120 && text.startsWith(title), 'the job is named after the start of the text');
  });
});

// The last row is blank: the schema takes it, so only the code refuses it. The others are over the schema's 200 characters.
const REFUSED = [
  ['201 emoji', '😀'.repeat(201), true],
  ['200 a and an emoji', 'a'.repeat(200) + '😀', true],
  ['201 提', '提'.repeat(201), true],
  ['200 a and a space', 'a'.repeat(200) + ' ', true],
  ['three spaces', '   ', false],
] as const;

test('RAC-1886 a reminder text of more than 200 characters, or a blank one, is refused in Schedule\'s own words and nothing is kept', async t => {
  const service = reminderService(t);
  for (const [name, text, overSchema] of REFUSED) await t.test(name, () => {
    if (overSchema) refuses(text); else takes(text);
    assert.throws(() => service.add(text), { code: 'schedule.job_invalid', kind: 'invalid', message: '提醒文字需要 1 到 200 字' });
  });
  assert.equal(service.count(), 0);
});

test('RAC-1887 the limit counts characters as the schema does, not graphemes: a family emoji is 7 characters and 11 units', async t => {
  const service = reminderService(t);
  await t.test('28 families, 196 characters, are taken', () => {
    takes(FAMILY.repeat(28));
    assert.equal(service.stored(service.add(FAMILY.repeat(28))).text, FAMILY.repeat(28));
  });
  await t.test('29 families, 203 characters, are refused', () => {
    refuses(FAMILY.repeat(29));
    assert.throws(() => service.add(FAMILY.repeat(29)), { code: 'schedule.job_invalid', kind: 'invalid' });
  });
});
