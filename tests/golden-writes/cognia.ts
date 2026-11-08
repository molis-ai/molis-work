import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** cognia/cognia.db */
export default async function ({ call, tag }: GoldenWriteContext) {
  await call("cognia.domain.create", { name: `金样领域 ${tag}` });
  const created = await call("cognia.material.create", { title: `金样材料 ${tag}`, body: "合成的材料正文" });
  const id = field(created, "id");
  await call("cognia.material.update", { id, etag: field(await call("cognia.material.get", { id }), "etag"), title: `金样材料 ${tag} 已改`, body: "合成的材料正文" });
  readsBack(await call("cognia.workspace.get"), `金样材料 ${tag} 已改`);
}
