import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";
import assert from "node:assert/strict";

// Studio uses the same local model selected in the golden settings. Saving a draft makes no model request.
export const webSurface = true;

export default async function ({ http, projectId, tag }: GoldenWriteContext) {
  const base = "/projects/" + encodeURIComponent(projectId) + "/api/plugin-builder/studio";
  const brief = "A notebook for coastal bird counts (" + tag + ")";
  await http(base + "/settings", { body: { provider_id: "golden-model-" + tag, model_id: "golden-model" } });
  const created = await http(base + "/builds", { body: { brief } });
  const id = field(created, "id");
  assert.equal(typeof id, "string");
  readsBack(await http(base + "/builds/" + encodeURIComponent(String(id)), { method: "GET" }), brief);
}
