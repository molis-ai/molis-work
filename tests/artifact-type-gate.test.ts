import assert from "node:assert/strict";
import test from "node:test";
import { isArtifactCompareAction, isArtifactPinAction, isArtifactPreviewAction } from "@molis-ai/molis-work-contracts/platform/actions";
import { BUILTIN_PLUGIN_CATALOG, artifactTypeDeclarations } from "@molis-ai/molis-work-app-workbench";

// specs/artifact-positioning A4/A7: every type a plugin pins into the 成果库 names itself and has a preview from its owner,
// so nothing in the 成果库 is a version nobody can read.
test("every 成果 type a built-in plugin produces declares its display name and an owner preview action", () => {
  const problems: string[] = [];
  for (const entry of BUILTIN_PLUGIN_CATALOG) for (const type of entry.manifest.artifacts.produces) {
    const where = `${entry.manifest.plugin_id} ${type.artifact_type_id}`;
    if (!type.title?.trim()) problems.push(`${where}: no title`);
    if (!type.preview) { problems.push(`${where}: no preview`); continue; }
    const action = entry.manifest.actions?.find(item => item.capability_id === type.preview!.capability_id && item.version === type.preview!.version);
    if (!action) problems.push(`${where}: preview ${type.preview.capability_id} is not one of the plugin's actions`);
    else if (!isArtifactPreviewAction(action.action)) problems.push(`${where}: ${type.preview.capability_id} is not a preview action`);
    // A type that can be pinned on the spot (A5) names a pin action of its own plugin, for exactly one kind of work object.
    if (!type.pin) continue;
    // ...and says whether a pinned version still matches its object (A4b), so the 成果库 can tell 「原文已改」.
    const compare = type.compare ? entry.manifest.actions?.find(item => item.capability_id === type.compare!.capability_id && item.version === type.compare!.version) : undefined;
    if (!compare || !isArtifactCompareAction(compare.action)) problems.push(`${where}: pinned on the spot but no compare action`);
    const pin = entry.manifest.actions?.find(item => item.capability_id === type.pin!.capability_id && item.version === type.pin!.version);
    if (!pin) problems.push(`${where}: pin ${type.pin.capability_id} is not one of the plugin's actions`);
    else if (!isArtifactPinAction(pin.action) || pin.action.subject_kinds.length !== 1) problems.push(`${where}: ${type.pin.capability_id} is not a pin action for one kind`);
  }
  assert.deepEqual(problems, []);
});

test("each kind of work object has at most one owner that pins it, and every pin action is declared on a type", () => {
  const pinners = new Map<string, string[]>(), undeclared: string[] = [];
  for (const entry of BUILTIN_PLUGIN_CATALOG) for (const action of entry.manifest.actions ?? []) {
    if (!isArtifactPinAction(action.action)) continue;
    for (const kind of action.action.subject_kinds) pinners.set(kind, [...pinners.get(kind) ?? [], action.capability_id]);
    if (!entry.manifest.artifacts.produces.some(type => type.pin?.capability_id === action.capability_id)) undeclared.push(action.capability_id);
  }
  assert.deepEqual([...pinners].filter(([, actions]) => actions.length > 1), []);
  assert.deepEqual(undeclared, []);
  assert.deepEqual([...pinners.keys()].sort(), ["dataset", "form", "pages_document", "presentation"]);
});

test("a 成果 type has exactly one owner", () => {
  const owners = new Map<string, string[]>();
  for (const entry of BUILTIN_PLUGIN_CATALOG) for (const type of entry.manifest.artifacts.produces) {
    owners.set(type.artifact_type_id, [...owners.get(type.artifact_type_id) ?? [], entry.manifest.plugin_id]);
  }
  assert.deepEqual([...owners].filter(([, plugins]) => plugins.length > 1), []);
  assert.equal(artifactTypeDeclarations().size, owners.size, "every produced type is declared");
});
