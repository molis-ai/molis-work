import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** ppt/ppt.db */
export default async function ({ call, tag }: GoldenWriteContext) {
  const created = await call("ppt.create", { title: `金样演示 ${tag}` });
  await call("ppt.update", { id: field(created, "id"), title: `金样演示 ${tag} 已改` });
  readsBack(await call("ppt.get", { id: field(created, "id") }), `金样演示 ${tag} 已改`);
}
