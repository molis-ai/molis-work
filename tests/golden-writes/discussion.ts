import assert from "node:assert/strict";
import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The Host only serves its pages to an account Home with a signed-in session, and a golden Home never signs in: root Home only. */
export const webSurface = true;

/**
 * server/server.sqlite, the discussion panel of a project: its owner, a room and a message. A project that has an owner recovers them from the first
 * connect; one that has none asks for a name first.
 */
export default async function ({ http, call, projectId, tag }: GoldenWriteContext) {
  const project = encodeURIComponent(projectId), connect = () => http(`/projects/${project}/api/im/connect`, { body: {} });
  await connect();
  if (!(await http("/im/api/session", { method: "GET" })).member) {
    await http("/im/api/session", { body: { display_name: `金样成员 ${tag}`, client_id: crypto.randomUUID() } });
    await connect();
  }
  const { room } = await http(`/im/api/projects/${project}/room`, { body: {} });
  const base = `/im/api/rooms/${encodeURIComponent(room.id)}`, title = `金样讨论引用 ${tag}`;
  const goal = field(await call("goals.create", { title, idempotency_key: `golden-discussion-goal-${tag}` }), "goal_id");
  assert.equal(typeof goal, "string");
  const result = await http(base + "/messages", { body: { client_id: crypto.randomUUID(), body: `金样讨论 ${tag}`, subjects: [{ kind: "goal", id: goal }] } });
  const history = await http(base + "/messages", { method: "GET" });
  readsBack(history, `金样讨论 ${tag}`);
  assert.ok(!JSON.stringify(history).includes(goal as string));
  readsBack(await http(base + "/surfaces", { body: { views: [{ message_id: field(result, "id"), part: "message" }] } }), title);
}
