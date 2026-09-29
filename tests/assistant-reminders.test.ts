import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { assertDueReminderWindow, defineDueRemindersAction, inspectActionDeclarations, withinDueReminderWindow, type ActionCallContext, type DueReminder, type DueReminderWindow } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { AssistantStore } from "../apps/local-host/src/assistant/assistant-store.js";
import { AssistantService } from "../apps/local-host/src/assistant/assistant-service.js";

const due = defineDueRemindersAction("fixture.todo.reminders.due", ["todo"], "到期提醒", ["todo:read"]);

test("a due-reminders query is declared in the Home with the whole contract", () => {
  assert.deepEqual(inspectActionDeclarations([due], undefined), []);
  const inProject = { ...due, action: { ...due.action, scope: "project" as const } };
  assert.match(inspectActionDeclarations([inProject], undefined).join(), /到期提醒查询/);
  const loose = { ...due, action: { ...due.action, output_schema: { type: "object" } } };
  assert.match(inspectActionDeclarations([loose], undefined).join(), /到期提醒查询/);
  assert.throws(() => assertDueReminderWindow({ from: "2026-09-29T10:00:00Z", to: "2026-09-29T09:00:00Z" }), /窗口无效/);
  assert.equal(withinDueReminderWindow("2026-09-29T09:30:00Z", { from: "2026-09-29T09:00:00Z", to: "2026-09-29T10:00:00Z" }), true);
});

test("a reminder the person set is told once when it comes due, where to open it, under their rules; one missed while off says so", async () => {
  let clock = new Date("2026-09-29T09:00:00Z");
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  // Two reminders the person set: one at 09:03 in a project, one at 09:30 in the personal space.
  const reminders: DueReminder[] = [
    { reminder_id: "t1@0903", due_at: "2026-09-29T09:03:00Z", title: "给王总回电话", subject: { kind: "todo", id: "t1" }, project_id: "project-a", open: { surface: "todo", id: "t1" } },
    { reminder_id: "t2@0930", due_at: "2026-09-29T09:30:00Z", title: "交报销单", subject: { kind: "todo", id: "t2" }, project_id: null, open: { surface: "todo", id: "t2" } },
  ];
  const asked: DueReminderWindow[] = [];
  let failing = false;
  const unregister = local.actionRegistry().registerProvider({ provider: { provider_id: "fixture.todo", kind: "plugin", title: "待办" }, definitions: [due],
    handlers: [{ ...due, handle(_context, input) {
      const window = input as DueReminderWindow;
      assertDueReminderWindow(window);
      asked.push(window);
      if (failing) throw new Error("待办暂时读不到");
      return { source: { surface: "todo", title: "待办" }, reminders: reminders.filter(item => withinDueReminderWindow(item.due_at, window)) };
    } }] });
  const person: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: ["todo:read"] };
  const store = new AssistantStore(new DatabaseSync(":memory:"), () => clock);
  const service = new AssistantService(store, { host: async () => { throw new Error("no rounds here"); }, authority: async () => { throw new Error("no rounds here"); },
    homeActions: async () => ({ discover: () => local.homeActionClient().discover(person), invoke: (action, input) => local.homeActionClient().invoke(person, action, input) }),
    timeZone: "Asia/Shanghai" }, "web-user", () => clock);
  try {
    // Nothing is due yet; the first look reaches back only a few minutes.
    assert.equal(await service.sweepReminders(), 0);
    assert.equal(asked[0]!.from, "2026-09-29T08:50:00.000Z");
    clock = new Date("2026-09-29T09:04:00Z");
    assert.equal(await service.sweepReminders(), 1);
    assert.equal(asked[1]!.from, "2026-09-29T09:00:00.000Z", "each look starts where the last stopped");
    let notices = service.notices("pages");
    assert.deepEqual(notices.map(notice => [notice.kind, notice.work_id, notice.text, notice.open]), [["reminder", "", "提醒（待办 · 17:03）：给王总回电话", { surface: "todo", id: "t1", title: "给王总回电话", project_id: "project-a" }]]);
    // Told once, however often it is looked at.
    assert.equal(await service.sweepReminders(), 0);

    // The person's quiet rule holds it on that page unless reminders are an exception.
    service.saveRule({ kind: "quiet", surfaces: ["pages"], except: [], label: "写文档时不要提醒" });
    assert.equal(service.notices("pages")[0]!.held?.reason, "写文档时不要提醒");
    assert.equal(service.notices("goals")[0]!.held, undefined);
    service.saveRule({ kind: "quiet", surfaces: ["goals"], except: ["reminder"], label: "看目标时不要提醒，我设的提醒除外" });
    assert.equal(service.notices("goals")[0]!.held, undefined);

    // Settling a reminder settles only it: it belongs to no work.
    assert.equal(service.settleNotices({ work_id: "" }, "seen"), 0);
    assert.equal(service.settleNotices({ notice_id: notices[0]!.notice_id }, "seen"), 1);

    // A Plugin that cannot answer is asked again for the same stretch; once it answers, a reminder missed meanwhile says so.
    failing = true;
    clock = new Date("2026-09-29T09:50:00Z");
    assert.equal(await service.sweepReminders(), 0);
    failing = false;
    clock = new Date("2026-09-29T09:51:00Z");
    assert.equal(await service.sweepReminders(), 1);
    assert.equal(asked.at(-1)!.from, "2026-09-29T09:04:00.000Z");
    notices = service.notices("goals");
    assert.deepEqual(notices.map(notice => [notice.text, notice.open?.project_id]), [["错过的提醒（待办 · 17:30）：交报销单", null]]);
  } finally { unregister(); await local.close(); }
});
