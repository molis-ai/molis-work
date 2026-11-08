import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** memory/memory.db and the Prologue memory entry it records. */
export default async function ({ call, tag }: GoldenWriteContext) {
  const written = await call("memory.write", { scope: "personal", text: `金样记忆 ${tag}` });
  await call("memory.change", { memory_id: field(written, "memory_id"), expected_version: field(written, "version"), action: "update", text: `金样记忆 ${tag} 已改` });
  readsBack(await call("memory.list"), `金样记忆 ${tag} 已改`);
}
