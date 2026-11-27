import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/**
 * The personal space's own copies (batch 109-1): `personal-space/libraries/todo.db`, and `personal-space/molis-work.db`, where the person turns
 * Todo on and where a todo with a reminder is the partition's overview row. The same owners' cases prove the project partition's copies.
 */
export default async function ({ personal: { call }, tag }: GoldenWriteContext) {
  const members = await call("partitions.plugins.get") as { plugins: string[]; revision: string };
  if (!members.plugins.includes("todo")) await call("partitions.plugins.set", { changes: [{ plugin_id: "todo", enabled: true }], expected_revision: members.revision });
  const created = await call("todo.items.create", { title: `个人空间金样待办 ${tag}`, remind_at: "2030-01-15T09:00:00+08:00" });
  await call("todo.items.update", { id: field(created, "id"), title: `个人空间金样待办 ${tag} 已改` });
  readsBack(await call("todo.items.get", { id: field(created, "id") }), `个人空间金样待办 ${tag} 已改`);
}
