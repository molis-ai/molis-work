import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/**
 * Platform requirements & acceptance in the project library (`acceptance_requirements`, `acceptance_deliveries`,
 * `acceptance_reports`, `acceptance_decisions`): independent of Goals since batch 44 (specs/plugin-equal-standing/contract-design.md §10).
 * Creates a real Todo item, sets a requirement, records a concrete delivery version, and reads it back through `acceptance.read@1`.
 */
export default async function ({ call, tag }: GoldenWriteContext) {
  const created = await call("todo.items.create", { title: `金样验收对象 ${tag}` });
  const subject = {
    provider_id: "io.molis.work.todo",
    subject: { kind: "todo_item", id: field(created, "id") },
  };
  await call("acceptance.requirements.set", {
    subject,
    requirements: [{ id: "req-1", statement: `金样交付要求 ${tag}`, requires_person: true }],
  });
  await call("acceptance.deliveries.record", {
    subject,
    version: `v1-${tag}`,
    summary: `金样交付 ${tag}`,
  });
  readsBack(await call("acceptance.read", { subjects: [subject] }), `金样交付要求 ${tag}`);
}
