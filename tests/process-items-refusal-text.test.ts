import assert from "node:assert/strict";
import test from "node:test";
import { adoptionRefusalText } from "@molis-ai/molis-work-app-local-host";

// BL-adoption-refusal-text: the sync settings say these in the person's language; the raw diagnostic remains the report's `refused`.
test("BL-adoption-refusal-text adoption refusals become codes and parameters for the workbench", () => {
  assert.deepEqual(adoptionRefusalText("layout mixed"), { code: "layout", params: { layout: "mixed" }, detail: "layout mixed" });
  assert.deepEqual(adoptionRefusalText("output brief: pages/doc is not a Files process item"),
    { code: "output", params: { port: "brief", artifact: "pages/doc" }, detail: "output brief: pages/doc is not a Files process item" });
  assert.deepEqual(adoptionRefusalText("3 process item change(s) not yet uploaded from the original journal").params, { count: 3 });
  assert.equal(adoptionRefusalText("private value materials:s9 is not readable").code, "private_value");
  assert.equal(adoptionRefusalText("reading position points outside the workspace").code, "position");
  assert.equal(adoptionRefusalText("retired install record is still bound").code, "retired");
  assert.deepEqual(adoptionRefusalText("something else"), { code: "other", params: {}, detail: "something else" });
});
