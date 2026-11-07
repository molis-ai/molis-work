import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The project tables of Coding. */
export default async function ({ call, tag }: GoldenWriteContext) {
  await call("coding.sessions.create", { title: `金样编码会话 ${tag}` });
  readsBack(await call("coding.state"), `金样编码会话 ${tag}`);
}
