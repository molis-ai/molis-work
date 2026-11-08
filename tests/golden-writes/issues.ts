import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** issues/issues.db */
export default async function ({ call, tag }: GoldenWriteContext) {
  const created = await call("issues.create", { title: `金样问题 ${tag}`, type: "feature", description: "合成的问题描述" });
  await call("issues.update", { id: field(created, "id"), expected_version: field(created, "version"), title: `金样问题 ${tag} 已改` });
  readsBack(await call("issues.read", { id: field(created, "id") }), `金样问题 ${tag} 已改`);
}
