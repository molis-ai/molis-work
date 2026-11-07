import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** dataset/dataset.db */
export default async function ({ call, tag }: GoldenWriteContext) {
  const created = await call("dataset.create", { title: `金样数据集 ${tag}` });
  await call("dataset.update", { id: field(created, "id"), title: `金样数据集 ${tag} 已改` });
  readsBack(await call("dataset.get", { id: field(created, "id") }), `金样数据集 ${tag} 已改`);
}
