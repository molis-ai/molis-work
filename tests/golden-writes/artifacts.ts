import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The library tables of the project library, through the one entry a person imports a file by. */
export default async function ({ call, tag }: GoldenWriteContext) {
  await call("artifacts.import.file", { source: "file", filename: `golden-${tag}.md`, title: `金样成果 ${tag}`, content: "合成的成果正文" });
  readsBack(await call("artifacts.content.list"), `金样成果 ${tag}`);
}
