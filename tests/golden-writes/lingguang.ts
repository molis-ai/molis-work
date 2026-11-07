import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** lingguang/lingguang.db */
export default async function ({ call, tag }: GoldenWriteContext) {
  const created = await call("lingguang.create", { title: `金样灵光 ${tag}`, body: "合成的灵光正文" });
  await call("lingguang.update", { id: field(created, "id"), title: `金样灵光 ${tag} 已改` });
  readsBack(await call("lingguang.get", { id: field(created, "id") }), `金样灵光 ${tag} 已改`);
}
