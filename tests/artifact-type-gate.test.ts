import assert from "node:assert/strict";
import test from "node:test";
import { isArtifactPreviewAction } from "@molis-ai/molis-work-contracts/platform/actions";
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
  }
  assert.deepEqual(problems, []);
});

test("a 成果 type has exactly one owner", () => {
  const owners = new Map<string, string[]>();
  for (const entry of BUILTIN_PLUGIN_CATALOG) for (const type of entry.manifest.artifacts.produces) {
    owners.set(type.artifact_type_id, [...owners.get(type.artifact_type_id) ?? [], entry.manifest.plugin_id]);
  }
  assert.deepEqual([...owners].filter(([, plugins]) => plugins.length > 1), []);
  assert.equal(artifactTypeDeclarations().size, owners.size, "every produced type is declared");
});
