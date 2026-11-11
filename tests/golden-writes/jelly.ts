import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** jelly/jelly.db */
export default async function ({ call, tag }: GoldenWriteContext) {
  const before = await call("jelly.workspace.get");
  const created = await call("jelly.note.create", { expected_revision: field(before, "revision"), title: `金样便笺 ${tag}` });
  const note = created.state.notes.find((item: { title: string }) => item.title === `金样便笺 ${tag}`);
  await call("jelly.note.update", { id: note.id, patch: { title: `金样便笺 ${tag} 已改` }, expected_revision: created.state.revision });
  readsBack(await call("jelly.workspace.get"), `金样便笺 ${tag} 已改`);
}
