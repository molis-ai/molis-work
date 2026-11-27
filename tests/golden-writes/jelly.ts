import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The partition's `libraries/jelly.db` (batch 108): one note row, saved new and then changed at the revision it was read with (batch 112-2). */
export default async function ({ call, tag }: GoldenWriteContext) {
  const created = field(await call("jelly.note.save", { expected_revision: 0, title: `金样便笺 ${tag}`, body: "" }), "note");
  await call("jelly.note.save", { id: field(created, "id"), expected_revision: field(created, "revision"), title: `金样便笺 ${tag} 已改` });
  readsBack(await call("jelly.note.list", {}), `金样便笺 ${tag} 已改`);
}
