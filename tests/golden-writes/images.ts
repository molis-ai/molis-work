import assert from "node:assert/strict";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { installIdentity } from "@molis-ai/molis-work-plugin-runtime";
import { imagesManifest } from "@molis-ai/molis-work-plugin-images";
import { openPersonSettings } from "@molis-ai/molis-work-service-person-settings";
import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** `person-settings/person-settings.db`: the image services follow the person (batch 108). A connection only: the address is the loopback discard port, and no job is started, so nothing is ever requested. */
export default async function ({ call, home, tag }: GoldenWriteContext) {
  const connection = { api_format: "openai-images", base_url: "http://127.0.0.1:9/v1", model: "golden-model" };
  const saved = await call("images.connections.save", { ...connection, name: `金样图片连接 ${tag}` });
  await call("images.connections.save", { ...connection, id: field(saved, "id"), name: `金样图片连接 ${tag} 已改` });
  const name = `金样图片连接 ${tag} 已改`;
  readsBack(await call("images.connections.list"), name);
  const settings = openPersonSettings(home);
  try {
    const row = settings.get({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user" }, installIdentity(imagesManifest), imagesManifest.person_settings, "connections");
    assert.equal(row?.portable, true, "the saved non-secret service configuration follows its owner");
    readsBack(row?.value, name);
  } finally { settings.close(); }
}
