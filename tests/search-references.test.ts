import assert from "node:assert/strict";
import test from "node:test";

import { searchActions } from "@molis-ai/molis-work-contracts/services/search";
import { inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";
import { findReferenceCandidates } from "@molis-ai/molis-work-service-search";
import { person, referenceOwners as fixture } from "./fixtures/reference-owners.js";

// specs/ai-interaction-experience H3: the objects a person may pick for a question that asks for one. The Host's read of a
// picked one before the answer goes on is S-26 (security-invariants-object-references).

test("AC-24 the candidates are objects of the asked kinds in the caller's project, each as its owner has it now", async t => {
  const f = await fixture(t);
  const found = await findReferenceCandidates(f.search, f.access(person("a")), { kinds: ["goal"], query: "试用" });
  assert.deepEqual(found.candidates.map(item => item.id).sort(), ["g1", "g2"], "a page is not a goal, another project's goal is not offered, a locked one is left out");
  const g1 = found.candidates.find(item => item.id === "g1")!;
  assert.deepEqual([g1.kind, g1.label, g1.revision, g1.plugin_title], ["goal", "内部试用上线", "3", "Goals"]);
  // Renamed since it was indexed: the label is the owner's current title, not the index's.
  f.goals.set("g2", { ...f.goals.get("g2")!, title: "试用反馈（改名）", version: 2 });
  const again = await findReferenceCandidates(f.search, f.access(person("a")), { kinds: ["goal"], query: "反馈" });
  assert.deepEqual(again.candidates.map(item => [item.label, item.revision]), [["试用反馈（改名）", "2"]]);
});

test("AC-24 a caller who cannot read a kind is offered none of it", async t => {
  const f = await fixture(t);
  const found = await findReferenceCandidates(f.search, f.access(person("a", ["pages:read", "search:read"])), { kinds: ["goal", "page"], query: "试用" });
  assert.deepEqual(found.candidates.map(item => item.id), ["p1"]);
});

test("AC-24 the candidate search is a read for people and their pages, never offered to a model", () => {
  assert.deepEqual(inspectActionDeclarations([searchActions.references], undefined), []);
  assert.equal(searchActions.references.action.kind, "query");
  assert.deepEqual(searchActions.references.action.audiences, ["user", "plugin"]);
});
