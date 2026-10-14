import assert from "node:assert/strict";
import test from "node:test";

import { confirmReferences } from "@molis-ai/molis-work-service-search";
import { person, referenceOwners } from "./fixtures/reference-owners.js";

// S-24 (docs/system/SECURITY-INVARIANTS.md): a reference a person picked is used only while its owner still hands it to them.

test("S-24 a picked object its owner no longer hands to the person is refused", async t => {
  const f = await referenceOwners(t);
  const access = f.access(person("a"));
  assert.deepEqual(await confirmReferences(access, [{ kind: "goal", id: "g1" }, { kind: "page", id: "p1" }], ["goal", "page"]), [true, true]);
  f.goals.delete("g1");
  assert.deepEqual(await confirmReferences(access, [{ kind: "goal", id: "g1" }], ["goal"]), [false], "deleted since it was picked");
  assert.deepEqual(await confirmReferences(access, [{ kind: "goal", id: "g3" }], ["goal"]), [false], "its owner refuses it now");
  assert.deepEqual(await confirmReferences(access, [{ kind: "page", id: "p1" }], ["goal"]), [false], "a kind the question does not allow");
  assert.deepEqual(await confirmReferences(access, [{ kind: "goal", id: "gb" }], ["goal"]), [false], "an object of another project");
  assert.deepEqual(await confirmReferences(access, [{ kind: "goal", id: "made-up" }], ["goal"]), [false], "an id nobody has");
  assert.deepEqual(await confirmReferences(f.access(person("a", ["pages:read", "search:read"])), [{ kind: "goal", id: "g2" }], ["goal"]), [false], "a person who may not read goals");
});

