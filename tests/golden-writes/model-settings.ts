import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The Host only serves its pages to an account Home with a signed-in session, and a golden Home never signs in: root Home only. */
export const webSurface = true;

/** model_providers in the catalog and its reference in feed/secrets.json. The address is the loopback discard port and nothing asks it anything. */
export default async function ({ http, tag }: GoldenWriteContext) {
  const id = `golden-model-${tag}`;
  await http(`/api/settings/models/${id}`, { body: { display_name: `金样模型 ${tag}`, base_url: "http://127.0.0.1:9/v1", api_format: "openai-chat-completions", prompt_cache: "off", enabled: true, api_key: "golden-model-test-value", models: [{ model_id: "golden-model", enabled: true }] } });
  readsBack(await http("/api/settings/models", { method: "GET" }), `金样模型 ${tag}`);
}
