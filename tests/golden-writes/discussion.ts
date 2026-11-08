import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The Host only serves its pages to an account Home with a signed-in session, and a golden Home never signs in: root Home only. */
export const webSurface = true;

/**
 * server/server.sqlite, the discussion panel of a project: its owner, a room and a message. A project that has an owner recovers them from the first
 * connect; one that has none asks for a name first.
 */
export default async function ({ http, projectId, tag }: GoldenWriteContext) {
  const project = encodeURIComponent(projectId), connect = () => http(`/projects/${project}/api/im/connect`, { body: {} });
  await connect();
  if (!(await http("/im/api/session", { method: "GET" })).member) {
    await http("/im/api/session", { body: { display_name: `金样成员 ${tag}`, client_id: crypto.randomUUID() } });
    await connect();
  }
  const { room } = await http(`/im/api/projects/${project}/room`, { body: {} });
  const messages = `/im/api/rooms/${encodeURIComponent(room.id)}/messages`;
  await http(messages, { body: { client_id: crypto.randomUUID(), body: `金样讨论 ${tag}` } });
  readsBack(await http(messages, { method: "GET" }), `金样讨论 ${tag}`);
}
