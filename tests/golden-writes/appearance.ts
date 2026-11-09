import assert from "node:assert/strict";
import { field, type GoldenWriteContext } from "../fixtures/golden-write.ts";

export default async function ({ call, tag }: GoldenWriteContext) {
  const original = await call("appearance.selection.get");
  const expected_revision = field(original, "selection_revision");
  assert.equal(typeof expected_revision, "number");
  const request_id = `appearance-${tag}`;
  const selection = { skin: { id: "folio", revision: 1 }, font: { policy: "follow-skin" }, mono: { id: "system-menlo", revision: 1 } };
  const receipt = await call("appearance.selection.apply", { expected_revision, request_id, choice: { kind: "selection", selection } });
  const written = await call("appearance.selection.get", { request_id });
  assert.deepEqual(field(written, "selection"), selection);
  assert.deepEqual(field(written, "applied"), receipt);
}
