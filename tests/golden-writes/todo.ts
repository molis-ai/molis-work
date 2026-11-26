import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/**
 * The partition's `libraries/todo.db`, and `due-registry/due-registry.db`: a todo with a reminder is an overview row with that time, which the
 * platform reads into the due registry (batch 108).
 */
export default async function ({ call, tag }: GoldenWriteContext) {
  const created = await call("todo.items.create", { title: `金样待办 ${tag}`, remind_at: "2030-01-15T09:00:00+08:00" });
  await call("todo.items.update", { id: field(created, "id"), title: `金样待办 ${tag} 已改` });
  readsBack(await call("todo.items.get", { id: field(created, "id") }), `金样待办 ${tag} 已改`);
}
