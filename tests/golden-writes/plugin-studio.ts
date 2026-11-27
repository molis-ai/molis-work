import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";
import assert from "node:assert/strict";

// Opening a draft also starts its design job. The golden model declines that job.
export const webSurface = true;

export default async function ({ http, projectId, tag }: GoldenWriteContext) {
  const base = "/projects/" + encodeURIComponent(projectId) + "/api/plugin-builder/studio";
  const brief = "A notebook for coastal bird counts (" + tag + ")";
  await http(base + "/settings", { body: { provider_id: "golden-model-" + tag, model_id: "golden-model" } });
  const created = await http(base + "/builds", { body: { brief } });
  const id = field(created, "id");
  assert.equal(typeof id, "string");
  const route = base + "/builds/" + encodeURIComponent(String(id));
  let detail = await http(route, { method: "GET" });
  // The golden clock moves by write case. Finish the job and its runtime records in this case.
  for (let poll = 0; field(detail, "active") && poll < 300; poll++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    detail = await http(route, { method: "GET" });
  }
  assert.equal(field(detail, "active"), null);
  assert.equal(field(detail, "phase"), "failed");
  readsBack(detail, brief);
}
