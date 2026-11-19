import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The Host only serves its pages to an account Home with a signed-in session, and a golden Home never signs in: root Home only. */
export const webSurface = true;

/** model_providers in the catalog and its reference in feed/secrets.json, and jelly/preferences.json choosing that model. The address is the loopback discard port; what answers there is the scripted model of the next case. */
export default async function ({ call, http, tag }: GoldenWriteContext) {
  const id = `golden-model-${tag}`;
  const provider = (display_name: string) => http(`/api/settings/models/${id}`, { body: { display_name, base_url: "http://127.0.0.1:9/v1", api_format: "openai-chat-completions", prompt_cache: "off", enabled: true, api_key: "golden-model-test-value", models: [{ model_id: "golden-model", enabled: true }] } });
  await provider(`金样模型 ${tag}`);
  await provider(`金样模型 ${tag} 已改`);
  readsBack(await http("/api/settings/models", { method: "GET" }), `金样模型 ${tag} 已改`);
  const key = "jelly.model_selection";
  const { values } = await call("jelly.preferences.read", { keys: [key] }) as import("@molis-ai/molis-work-contracts/platform/settings").SettingsValues;
  await call("jelly.preferences.write", { key, layer: "personal", expected_revision: values[0]!.revision,
    request_id: "golden-model-" + tag, change: { set: { provider_id: id, model_id: "golden-model" } } });
  readsBack(await call("jelly.model.settings"), id);
}
