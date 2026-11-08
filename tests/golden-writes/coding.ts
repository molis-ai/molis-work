import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The project tables of Coding. */
export default async function ({ call, tag }: GoldenWriteContext) {
  const created = await call("coding.sessions.create", { title: `金样编码会话 ${tag}` });
  await call("coding.sessions.update", { session_id: field(created, "session_id"), title: `金样编码会话 ${tag} 已改` });
  readsBack(await call("coding.state"), `金样编码会话 ${tag} 已改`);
}
