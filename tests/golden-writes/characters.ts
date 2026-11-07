import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** characters/characters.sqlite */
export default async function ({ call, tag }: GoldenWriteContext) {
  const { draft } = await call("characters.create");
  await call("characters.update", { id: draft.character_id, expected_revision: draft.revision, title: `金样角色 ${tag}`, instructions: "合成的角色指令", host_tools: draft.host_tools, action_tools: [] });
  readsBack(await call("characters.list"), `金样角色 ${tag}`);
}
