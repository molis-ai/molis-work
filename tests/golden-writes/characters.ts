import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** characters/characters.sqlite: a role saved as its first version, then a second, read back from the role list. */
export default async function ({ call, tag }: GoldenWriteContext) {
  const { draft } = await call("characters.create", { title: `金样角色 ${tag}`, instructions: "合成的角色指令", host_tools: null }) as { draft: { character_id: string; revision: number } };
  await call("characters.update", { id: draft.character_id, expected_revision: draft.revision, title: `金样角色 ${tag}`, instructions: "合成的角色指令，第二版" });
  readsBack(await call("characters.roles.list"), `金样角色 ${tag}`);
}
