import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** projects/<project_id>/libraries/pages.db (the primary project's partition library) */
export default async function ({ call, tag }: GoldenWriteContext) {
  const created = await call("pages.create", { title: `金样页面 ${tag}` });
  await call("pages.update", { id: field(created, "id"), title: `金样页面 ${tag} 已改` });
  readsBack(await call("pages.get", { id: field(created, "id") }), `金样页面 ${tag} 已改`);
}
