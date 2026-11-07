import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** alchemist/projects/<id>/studio.sqlite */
export default async function ({ call, tag }: GoldenWriteContext) {
  await call("alchemist.directions.create", { description: `金样方向 ${tag}` });
  readsBack(await call("alchemist.workspace.read"), `金样方向 ${tag}`);
}
