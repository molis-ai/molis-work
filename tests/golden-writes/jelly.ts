import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** jelly/jelly.db */
export default async function ({ call, tag }: GoldenWriteContext) {
  const before = await call("jelly.workspace.get");
  await call("jelly.note.create", { expected_revision: field(before, "revision"), title: `金样便笺 ${tag}` });
  readsBack(await call("jelly.workspace.get"), `金样便笺 ${tag}`);
}
