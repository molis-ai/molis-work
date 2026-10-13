import assert from "node:assert/strict";
import test from "node:test";
import { isArtifactCompareAction, isArtifactContinueAction, isArtifactPinAction, isArtifactPreviewAction } from "@molis-ai/molis-work-contracts/platform/actions";
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

/**
 * 「从这一版继续」 (A4b): every type people can keep in the 成果库 can be continued somewhere, except records that are not
 * work to carry on — kept here by name, with why, so a new type cannot slip through.
 */
const NO_CONTINUE: Record<string, string> = {
  "io.molis.work.feed.capture": "捕获的消息是收到的内容记录，不是可以接着编辑的工作",
  "character.definition.v1": "角色版本由角色插件自己的版本历史管理，固定版本只供引用与回看",
  "coding.report.v1": "执行报告是一次运行的记录；接着做是在 Coding 里新开任务，不从报告编辑",
};
test("every visible 成果 type can be continued from, by a plugin that declares a continue action, or is a named exception", () => {
  const continued = new Set<string>(), problems: string[] = [];
  for (const entry of BUILTIN_PLUGIN_CATALOG) for (const type of [...entry.manifest.artifacts.produces, ...entry.manifest.artifacts.consumes]) {
    if (!type.continue) continue;
    const action = entry.manifest.actions?.find(item => item.capability_id === type.continue!.capability_id && item.version === type.continue!.version);
    if (!action || !isArtifactContinueAction(action.action)) problems.push(`${entry.manifest.plugin_id} ${type.artifact_type_id}: ${type.continue.capability_id} is not a continue action`);
    else continued.add(type.artifact_type_id);
  }
  for (const type of artifactTypeDeclarations().keys()) if (!continued.has(type) && !NO_CONTINUE[type]) problems.push(`${type}: nothing continues from it`);
  for (const type of Object.keys(NO_CONTINUE)) if (continued.has(type) || !artifactTypeDeclarations().has(type)) problems.push(`${type}: stale exception`);
  assert.deepEqual(problems, []);
});
