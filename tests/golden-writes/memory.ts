import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** memory/memory.db and the Prologue memory entry it records. */
export default async function ({ call, tag }: GoldenWriteContext) {
  await call("memory.write", { scope: "personal", text: `金样记忆 ${tag}` });
  readsBack(await call("memory.list"), `金样记忆 ${tag}`);
}
