import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** mainline/mainline.db: a light work item on the person's mainline in the project, moved to another group, read back. */
export default async function ({ call, tag }: GoldenWriteContext) {
  const made = await call("mainline.items.create", { name: `金样事项 ${tag}` }) as { item: { item_id: string }; mainline: { revision: string } };
  await call("mainline.items.move", { expected_revision: made.mainline.revision, item_id: made.item.item_id, group_id: "next", index: 0 });
  readsBack(await call("mainline.read"), `金样事项 ${tag}`);
}
