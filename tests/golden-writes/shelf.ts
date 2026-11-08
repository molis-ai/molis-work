import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The Host only registers Shelf's actions with the web surface it serves to a person, and an account Home has none without a signed-in session: root Home only. */
export const webSurface = true;

/** shelf/catalog.json */
export default async function ({ call, tag }: GoldenWriteContext) {
  await call("shelf.clipboard.add", { text: `金样剪贴 ${tag}` });
  readsBack(await call("shelf.snapshot"), `金样剪贴 ${tag}`);
  const item_id = field(await call("shelf.items.admit", { title: `金样条目 ${tag}`, text: `金样条目正文 ${tag}` }), "item_id");
  await call("shelf.items.edit", { item_id, text: `金样条目正文 ${tag} 已改`, expected_content_hash: field(await call("shelf.items.read", { item_id }), "content_hash") });
  readsBack(await call("shelf.items.read", { item_id }), `金样条目正文 ${tag} 已改`);
}
