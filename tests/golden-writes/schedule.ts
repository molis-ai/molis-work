import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The project tables of Schedule. */
export default async function ({ call, tag }: GoldenWriteContext) {
  await call("schedule.tasks.create", { title: `金样定时 ${tag}`, instructions: "合成的说明", time: "09:00" });
  readsBack(await call("schedule.tasks.list"), `金样定时 ${tag}`);
}
