import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The project half of Goals: its tables in the project library. */
export default async function ({ call, tag }: GoldenWriteContext) {
  const created = await call("goals.create", { title: `金样目标 ${tag}`, idempotency_key: `golden-goal-${tag}` });
  await call("goals.active.set", { goal_id: field(created, "goal_id"), reason: "合成的理由", idempotency_key: `golden-goal-active-${tag}` });
  readsBack(await call("goals.list"), `金样目标 ${tag}`);
}
