import assert from "node:assert/strict";
import { openDueRegistry } from "@molis-ai/molis-work-service-scheduler";
import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/**
 * The partition's `libraries/todo.db`, and `due-registry/due-registry.db`: a todo with a reminder is an overview row with that time, which the
 * platform reads into the due registry (batch 108).
 */
export default async function ({ call, tag, home, projectId }: GoldenWriteContext) {
  const created = await call("todo.items.create", { title: `金样待办 ${tag}`, remind_at: "2030-01-15T09:00:00+08:00" });
  await call("todo.items.update", { id: field(created, "id"), title: `金样待办 ${tag} 已改` });
  const saved = await call("todo.items.get", { id: field(created, "id") });
  readsBack(saved, `金样待办 ${tag} 已改`);
  const dueAt = new Date("2030-01-15T09:00:00+08:00").toISOString();
  assert.equal(new Date(String(field(saved, "remind_at"))).toISOString(), dueAt);
  const registry = openDueRegistry(home);
  try {
    const entry = registry.entries(projectId).find(row => row.plugin_id === "io.molis.work.todo" && row.source === "overview"
      && row.entry_key === "task:" + field(saved, "id"));
    assert.equal(entry?.due_at, dueAt, "the owner's projected reminder reached the scheduler");
  } finally { registry.close(); }
}
