import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The project tables of Schedule. */
export default async function ({ call, tag }: GoldenWriteContext) {
  const task = { instructions: "合成的说明", time: "09:00" };
  const created = await call("schedule.tasks.create", { ...task, title: `金样定时 ${tag}` });
  await call("schedule.tasks.update", { ...task, task_id: field(created, "task_id"), title: `金样定时 ${tag} 已改` });
  readsBack(await call("schedule.tasks.list"), `金样定时 ${tag} 已改`);
}
