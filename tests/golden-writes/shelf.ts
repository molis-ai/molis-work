import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The Host only registers Shelf's actions with the web surface it serves to a person, and an account Home has none without a signed-in session: root Home only. */
export const webSurface = true;

/** shelf/catalog.json */
export default async function ({ call, tag }: GoldenWriteContext) {
  await call("shelf.clipboard.add", { text: `金样剪贴 ${tag}` });
  readsBack(await call("shelf.snapshot"), `金样剪贴 ${tag}`);
}
