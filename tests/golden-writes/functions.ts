import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** functions/functions.db */
export default async function ({ call, tag }: GoldenWriteContext) {
  await call("functions.authoring.create", { name: `金样判断 ${tag}` });
  readsBack(await call("functions.authoring.list"), `金样判断 ${tag}`);
}
