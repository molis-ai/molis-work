import assert from "node:assert/strict";
import test from "node:test";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { isSubjectReader, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

// A workflow station's content is a kind of object, and that kind must be one a subject reader reads back: the Assistant
// links a station's result to its object, and actions offered on an object are found by its kind. A station id ("pages",
// "inbox") is not an object kind; before 2026-10-04 four stations declared theirs by default.
test("every bundled workflow station declares the kind of object its content is, and that kind can be read back", () => {
  const actions = BUILTIN_PLUGIN_CATALOG.flatMap(entry => (entry.manifest.actions ?? []) as readonly ActionDefinition[]);
  const readable = new Set(actions.filter(definition => isSubjectReader(definition.action)).flatMap(definition => definition.action.subject_kinds));
  const stations = actions.filter(definition => (definition.action as { workflow_content?: unknown }).workflow_content);
  assert.ok(stations.length >= 9, "the bundled stations are found");
  const wrong = stations.filter(definition => definition.action.subject_kinds.length !== 1 || !readable.has(definition.action.subject_kinds[0]!))
    .map(definition => `${definition.capability_id}: ${JSON.stringify(definition.action.subject_kinds)}`);
  assert.deepEqual(wrong, []);
});
