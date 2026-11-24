import assert from "node:assert/strict";
import test from "node:test";
import { isArtifactCompareAction, isArtifactContinueAction, isArtifactPinAction, isArtifactPreviewAction, intakeMaterial } from "@molis-ai/molis-work-contracts/platform/actions";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { HOST_ARTIFACT_PRODUCERS, artifactTypeDeclarations, copyOutTypes, declaredArtifactTypes, type ArtifactProducerSource } from "@molis-ai/molis-work-app-local-host";

/** Who declares 成果 types: the built-in Manifests, and the Host's own producers (Characters since CHR-1). */
const PRODUCERS = [...BUILTIN_PLUGIN_CATALOG.map(entry => ({ plugin_id: entry.manifest.plugin_id, produces: entry.manifest.artifacts.produces, actions: entry.manifest.actions ?? [] })),
  ...HOST_ARTIFACT_PRODUCERS];

// specs/artifact-positioning A4/A7: every type a plugin pins into the 成果库 names itself and has a preview from its owner,
// so nothing in the 成果库 is a version nobody can read.
test("every 成果 type a built-in plugin or the Host produces declares its display name and an owner preview action", () => {
  const problems: string[] = [];
  for (const producer of PRODUCERS) for (const type of producer.produces) {
    const where = `${producer.plugin_id} ${type.artifact_type_id}`;
    if (!type.title?.trim()) problems.push(`${where}: no title`);
    if (!type.preview) { problems.push(`${where}: no preview`); continue; }
    const action = producer.actions.find(item => item.capability_id === type.preview!.capability_id && item.version === type.preview!.version);
    if (!action) problems.push(`${where}: preview ${type.preview.capability_id} is not one of the plugin's actions`);
    else if (!isArtifactPreviewAction(action.action)) problems.push(`${where}: ${type.preview.capability_id} is not a preview action`);
    // A type that can be pinned on the spot (A5) names a pin action of its own plugin, for exactly one kind of work object.
    if (!type.pin) continue;
    // ...and says whether a pinned version still matches its object (A4b), so the 成果库 can tell 「原文已改」.
    const compare = type.compare ? producer.actions.find(item => item.capability_id === type.compare!.capability_id && item.version === type.compare!.version) : undefined;
    if (!compare || !isArtifactCompareAction(compare.action)) problems.push(`${where}: pinned on the spot but no compare action`);
    const pin = producer.actions.find(item => item.capability_id === type.pin!.capability_id && item.version === type.pin!.version);
    if (!pin) problems.push(`${where}: pin ${type.pin.capability_id} is not one of the plugin's actions`);
    else if (!isArtifactPinAction(pin.action) || pin.action.subject_kinds.length !== 1) problems.push(`${where}: ${type.pin.capability_id} is not a pin action for one kind`);
  }
  assert.deepEqual(problems, []);
});

test("each kind of work object has at most one owner that pins it, and every pin action is declared on a type", () => {
  const pinners = new Map<string, string[]>(), undeclared: string[] = [];
  for (const producer of PRODUCERS) for (const action of producer.actions) {
    if (!isArtifactPinAction(action.action)) continue;
    for (const kind of action.action.subject_kinds) pinners.set(kind, [...pinners.get(kind) ?? [], action.capability_id]);
    if (!producer.produces.some(type => type.pin?.capability_id === action.capability_id)) undeclared.push(action.capability_id);
  }
  assert.deepEqual([...pinners].filter(([, actions]) => actions.length > 1), []);
  assert.deepEqual(undeclared, []);
  assert.deepEqual([...pinners.keys()].sort(), ["dataset", "form", "pages_document", "presentation"]);
});

test("a 成果 type has exactly one owner", () => {
  const owners = new Map<string, string[]>();
  for (const producer of PRODUCERS) for (const type of producer.produces) {
    owners.set(type.artifact_type_id, [...owners.get(type.artifact_type_id) ?? [], producer.plugin_id]);
  }
  assert.deepEqual([...owners].filter(([, plugins]) => plugins.length > 1), []);
  assert.equal(artifactTypeDeclarations().size, owners.size, "every produced type is declared");
  // A Goal's embeds name the types it can show; a Host producer's type (a published Character) is one of them.
  assert.deepEqual(new Set(declaredArtifactTypes().map(type => type.artifact_type_id)), new Set(owners.keys()), "Goal embeds know every produced type");
});

/**
 * 「从这一版继续」 (A4b): every type people can keep in the 成果库 can be continued somewhere, except records that are not
 * work to carry on — kept here by name, with why, so a new type cannot slip through.
 */
const NO_CONTINUE: Record<string, string> = {
  "io.molis.work.feed.capture": "捕获的消息是收到的内容记录，不是可以接着编辑的工作",
  "character.definition.v1": "角色版本由 Characters 自己的版本历史管理，固定版本只供引用与回看",
  "coding.report.v1": "执行报告是一次运行的记录；接着做是在 Coding 里新开任务，不从报告编辑",
  "io.molis.work.work-brief.brief": "固定的简报版本是某一刻的记录，用来回看和引用（WBR-04）；接着做是在简报里刷新或修改，不从固定版本另起一份",
};
test("every visible 成果 type can be continued from, by a plugin that declares a continue action, or is a named exception", () => {
  const continued = new Set<string>(), problems: string[] = [];
  // Batch 44 (contract-design §2.3): 「从这一版继续」 is the continue action's own intake, which names the types it continues from.
  for (const entry of BUILTIN_PLUGIN_CATALOG) for (const action of entry.manifest.actions ?? []) {
    const material = intakeMaterial(action.action.intake, "artifact");
    if (!material) continue;
    const declared = new Set([...entry.manifest.artifacts.produces, ...entry.manifest.artifacts.consumes].map(type => type.artifact_type_id));
    for (const type of material.artifact_types) {
      if (!isArtifactContinueAction(action.action)) problems.push(`${entry.manifest.plugin_id} ${type.artifact_type_id}: ${action.capability_id} is not a continue action`);
      else if (!declared.has(type.artifact_type_id)) problems.push(`${entry.manifest.plugin_id} ${type.artifact_type_id}: ${action.capability_id} continues a type its Manifest does not declare`);
      else continued.add(type.artifact_type_id);
    }
  }
  for (const type of artifactTypeDeclarations().keys()) if (!continued.has(type) && !NO_CONTINUE[type]) problems.push(`${type}: nothing continues from it`);
  for (const type of Object.keys(NO_CONTINUE)) if (continued.has(type) || !artifactTypeDeclarations().has(type)) problems.push(`${type}: stale exception`);
  assert.deepEqual(problems, []);
});

test("P-07 Shelf gets only the types their producers mark copy_out, and only the marker's own versions of them", () => {
  const source = (plugin_id: string, report: boolean, item: boolean): ArtifactProducerSource => ({ plugin_id, name: plugin_id, surface: plugin_id, actions: [],
    artifacts: { produces: [{ artifact_type_id: `${plugin_id}.report.v1`, schema_version: 1, ...(report ? { copy_out: true as const } : {}) }], consumes: [] },
    process_items: { produces: [{ artifact_type_id: "shared.item.v1", schema_version: 1, ...(item ? { copy_out: true as const } : {}) }], consumes: [] } });
  const marked = source("io.example.marked", true, true), unmarked = source("io.example.unmarked", false, false);
  const copy = copyOutTypes([marked, unmarked]);
  assert.deepEqual(copy.artifacts, [{ artifact_type_id: "io.example.marked.report.v1", schema_version: 1 }], "an unmarked type is not given");
  assert.deepEqual(copy.process_items, [{ artifact_type_id: "shared.item.v1", schema_version: 1 }]);
  assert.equal(copy.allows({ artifact_type_id: "shared.item.v1", producer_plugin_id: "io.example.marked" }), true);
  // A process item type may have several producers (BL-375): one producer's mark does not take another's items out of the project.
  assert.equal(copy.allows({ artifact_type_id: "shared.item.v1", producer_plugin_id: "io.example.unmarked" }), false);
  // A producer no longer in effect is not among the sources (`artifactProducerSources`), so nothing of its is given.
  const gone = copyOutTypes([unmarked]);
  assert.deepEqual([gone.artifacts, gone.process_items], [[], []]);
  assert.equal(gone.allows({ artifact_type_id: "shared.item.v1", producer_plugin_id: "io.example.marked" }), false);
  // As built: Coding marks its report and its change set, and nothing else of any producer is marked.
  const shipped = copyOutTypes();
  assert.deepEqual([...shipped.artifacts, ...shipped.process_items].map(type => type.artifact_type_id).sort(), ["coding.changeset.v1", "coding.report.v1"]);
});
