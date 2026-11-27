import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";
import assert from "node:assert/strict";

// Studio belongs to the project Web surface. A draft can be saved without a model or an image connection.
export const webSurface = true;

export default async function ({ http, projectId, tag }: GoldenWriteContext) {
  const base = "/projects/" + encodeURIComponent(projectId) + "/api/plugin-builder/studio";
  const brief = "A notebook for coastal bird counts (" + tag + ")";
  const created = await http(base + "/builds", { body: { brief } });
  const id = field(created, "id");
  assert.equal(typeof id, "string");
  readsBack(await http(base + "/builds/" + encodeURIComponent(String(id))), brief);
}
