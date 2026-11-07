import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The Host only serves its pages to an account Home with a signed-in session, and a golden Home never signs in: root Home only. */
export const webSurface = true;

/** agent-definitions/agent-definitions.db, through the settings entry: a person editing a prompt is the only writer. */
export default async function ({ http, tag }: GoldenWriteContext) {
  const { prompts } = await http("/api/agent-definitions/prompts", { method: "GET" });
  const key = field(prompts, "key"), route = `/api/agent-definitions/prompt?key=${encodeURIComponent(key)}`, body = `金样提示词 ${tag}`;
  await http("/api/agent-definitions/prompt", { body: { key, body, expected_revision: field(await http(route, { method: "GET" }), "revision") ?? null } });
  readsBack(await http(route, { method: "GET" }), body);
}
