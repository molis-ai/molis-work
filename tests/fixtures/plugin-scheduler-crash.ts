import test from "node:test";
import { pluginSchedulerFixture } from "./plugin-scheduler.js";

test("claimed action process fixture", async t => {
  if (!process.argv[2] || !process.send) throw new Error("Requires a temporary project and IPC");
  const f = await pluginSchedulerFixture(t, { directory: process.argv[2] }), owner = await f.start("scheduler_a");
  await owner.database.transaction(async () => {}, tx => owner.schedule.join(tx, writer => writer.register({
    action: { capability_id: "scheduler-a.wakeup", version: 1 }, object_ref: "crashed-before-prepare", title: "Recover me", due_at: new Date(Date.now() - 1000).toISOString(),
  })));
  owner.onWake(async () => {
    process.send!({ phase: "claimed", job: owner.schedule.list()[0]!.job_id });
    await new Promise(() => {});
    return {};
  });
  await f.scheduler.tick();
});
