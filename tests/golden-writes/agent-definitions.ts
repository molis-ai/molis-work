import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The Host only serves its pages to an account Home with a signed-in session, and a golden Home never signs in: root Home only. */
export const webSurface = true;

function editablePrompts(prompts: unknown): unknown[] {
  if (!Array.isArray(prompts)) {
    throw new Error(`金样写入期望 prompts 数组，但收到：${JSON.stringify(prompts)}`);
  }
  const editable = prompts.filter(entry =>
    typeof entry === "object" && entry !== null && Reflect.get(entry, "override_policy") !== "protected",
  );
  if (editable.length === 0) {
    throw new Error("金样写入找不到任何可编辑的 Prompt（全部均为 protected）");
  }
  return editable;
}

/** agent-definitions/agent-definitions.db, through the settings entry: a person editing a prompt is the only writer. */
export default async function ({ http, tag }: GoldenWriteContext) {
  const { prompts } = await http("/api/agent-definitions/prompts", { method: "GET" });
  const key = field(editablePrompts(prompts), "key");
  const route = `/api/agent-definitions/prompt?key=${encodeURIComponent(key)}`;
  const body = `金样提示词 ${tag}`;
  await http("/api/agent-definitions/prompt", { body: { key, body, expected_revision: field(await http(route, { method: "GET" }), "revision") ?? null } });
  readsBack(await http(route, { method: "GET" }), body);
}
