import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** functions/functions.db */
export default async function ({ call, tag }: GoldenWriteContext) {
  const created = await call("functions.authoring.create", { name: `金样判断 ${tag}` });
  await call("functions.authoring.update", { id: field(created, "id"), expected_updated_at: field(created, "updated_at"), patch: { name: `金样判断 ${tag} 已改` } });
  readsBack(await call("functions.authoring.list"), `金样判断 ${tag} 已改`);
}
