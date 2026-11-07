import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** alchemist/projects/<id>/studio.sqlite */
export default async function ({ call, tag }: GoldenWriteContext) {
  const created = await call("alchemist.directions.create", { description: `金样方向 ${tag}` });
  const id = field(created, "id");
  await call("alchemist.directions.update", { id, expectedEtag: field(await call("alchemist.directions.editing", { id }), "etag"), description: `金样方向 ${tag} 已改` });
  readsBack(await call("alchemist.workspace.read"), `金样方向 ${tag} 已改`);
}
