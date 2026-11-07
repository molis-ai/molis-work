import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** todo/todo.db */
export default async function ({ call, tag }: GoldenWriteContext) {
  const created = await call("todo.items.create", { title: `金样待办 ${tag}` });
  await call("todo.items.update", { id: field(created, "id"), title: `金样待办 ${tag} 已改` });
  readsBack(await call("todo.items.get", { id: field(created, "id") }), `金样待办 ${tag} 已改`);
}
