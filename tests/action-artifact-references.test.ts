import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
// W3-05-2: a 成果 type is declared with a display name and the plugin's own actions (AGENTS.md「成果库」, specs/artifact-positioning
// A1/A4b/A7). Until now only the built-in plugins were held to it, and only by a test (`artifact-type-gate`); a Manifest parsed
// anywhere else - a Runtime install, a generated plugin, the CLI, the sample - could produce a type nobody could read. The rule is
// now part of Manifest parsing, so every route that reads a Manifest applies it. It adds no error code: the author gets
// `plugin.declaration_invalid` with the problems joined, like every other declaration rule.
import assert from "node:assert/strict";
import test from "node:test";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { defineArtifactCompareAction, defineArtifactContinueAction, defineArtifactPinAction, defineArtifactPreviewAction, parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { artifactPreview } from "./fixtures/artifact-preview.js";
import { DECLARATION_PLUGIN_ID, declarationManifest, manifestProblems } from "./fixtures/declaration-manifest.js";

type Part = Record<string, unknown>;
const ID = DECLARATION_PLUGIN_ID;
const SEPARATOR = "；";
const TYPE_ID = "example.note";
const KEY = `${TYPE_ID}@1`;

const preview = defineArtifactPreviewAction(`${ID}.preview`, 1, "笔记", []);
const pin = defineArtifactPinAction(`${ID}.pin`, 1, "note", "笔记", []);
const compare = defineArtifactCompareAction(`${ID}.compare`, 1, "笔记", []);
const resume = defineArtifactContinueAction(`${ID}.continue`, 1, "笔记", []);
const reference = (action: { capability_id: string; version: number }) => ({ capability_id: action.capability_id, version: action.version });
const ref = (action: { capability_id: string; version: number }) => `${action.capability_id}@${action.version}`;
/** A copy of an action definition with fields of its `action` replaced. */
const altered = (definition: { action: object }, over: Part, top: Part = {}): Part => ({ ...definition, ...top, action: { ...definition.action, ...over } });
/** The same action as the other operation, consistent in itself (an operation that disagrees with its kind is a shape problem of its own). */
const asCommand = (definition: { action: object }): Part => altered(definition, { kind: "operation" }, { operation: "command" });
const asQuery = (definition: { action: object }): Part => altered(definition, { kind: "query" }, { operation: "query" });

const ALL = [preview, pin, compare, resume];
/** A type that names every action it can: the baseline each rule below breaks in one place. */
const noteType = (over: Part = {}): Part => ({
  artifact_type_id: TYPE_ID, schema_version: 1, title: "笔记",
  preview: reference(preview), pin: reference(pin), compare: reference(compare), continue: reference(resume), ...over,
});
/** A Manifest producing the type (and consuming `consumes`), with `actions` as its action list. */
function producing(type: Part, actions: ReadonlyArray<unknown> = ALL, consumes: ReadonlyArray<unknown> = []): Record<string, unknown> {
  return declarationManifest({ actions, artifacts: { produces: [type], consumes } });
}
/** The code and message a Manifest is refused with, or null when it parses. */
function refusal(input: unknown): { code: string; message: string } | null {
  try { parsePluginManifest(input); return null; } catch (error) {
    if ((error instanceof ActionError && ["plugin.manifest_invalid","plugin.entrypoint_missing","plugin.permission_invalid","plugin.declaration_invalid"].includes(error.code) && error.kind === "invalid")) return { code: error.code, message: error.message };
    throw error;
  }
}
function assertRefused(input: unknown, problems: string[]): void {
  assert.deepEqual(refusal(input), { code: "plugin.declaration_invalid", message: problems.join(SEPARATOR) });
}

test("a type with every action it can name, produced and consumed, parses", () => {
  assert.equal(manifestProblems(producing(noteType())), "");
  assert.equal(manifestProblems(producing({ artifact_type_id: TYPE_ID, schema_version: 1, title: "笔记", preview: reference(preview) }, [preview])), "", "name and preview are all a type needs");
  assert.equal(manifestProblems(declarationManifest({ actions: [resume], artifacts: { produces: [], consumes: [{ artifact_type_id: "other.file", schema_version: 1, continue: reference(resume) }] } })), "", "a plugin can continue from a type it only reads");
});

// ---- (a) the name and the preview ------------------------------------------------------------------------------------

test("a produced type without a display name is refused", () => {
  assertRefused(producing(noteType({ title: undefined })), [`成果类型 ${KEY} 缺少显示名（title）`]);
  assertRefused(producing(noteType({ title: "  " })), [`成果类型 ${KEY} 缺少显示名（title）`]);
  assertRefused(producing(noteType({ title: 7 })), [`成果类型 ${KEY} 缺少显示名（title）`]);
});

test("a produced type without a preview action is refused", () => {
  assertRefused(producing(noteType({ preview: undefined })), [`成果类型 ${KEY} 缺少预览动作（preview）`]);
  assertRefused(producing(noteType({ preview: "preview" })), [`成果类型 ${KEY} 缺少预览动作（preview）`]);
});

test("a preview that is not one of the plugin's own preview queries is refused", () => {
  const wrong = (action: Part) => `成果类型 ${KEY} 的预览动作 ${action.capability_id}@1 不是本插件声明的预览查询`;
  assertRefused(producing(noteType({ preview: { capability_id: `${ID}.nowhere`, version: 1 } })), [`成果类型 ${KEY} 的预览动作 ${ID}.nowhere@1 不是本插件声明的预览查询`]);
  assertRefused(producing(noteType({ preview: { capability_id: preview.capability_id, version: 2 } })), [`成果类型 ${KEY} 的预览动作 ${preview.capability_id}@2 不是本插件声明的预览查询`]);
  assertRefused(producing(noteType({ preview: reference(compare) })), [wrong(compare)]);
  assertRefused(producing(noteType({ preview: reference(pin) })), [wrong(pin)]);
  assertRefused(producing(noteType({ preview: reference(preview) }), [asCommand(preview), pin, compare, resume]), [wrong(preview)]);
  assertRefused(producing(noteType({ preview: reference(preview) }), [pin, compare, resume]), [wrong(preview)]);
});

// ---- (b) fixing on the spot, comparing and continuing -----------------------------------------------------------------

test("a type that can be pinned on the spot has a compare action, and the pin is for one kind of object", () => {
  assertRefused(producing(noteType({ compare: undefined })), [`成果类型 ${KEY} 可以当场固定，必须声明比较动作（compare）`]);
  const twoKinds = altered(pin, { subject_kinds: ["note", "page"] });
  assertRefused(producing(noteType(), [preview, twoKinds, compare, resume]), [`成果类型 ${KEY} 的固定动作 ${ref(pin)} 必须恰好对一种对象`]);
  assertRefused(producing(noteType(), [preview, altered(pin, { subject_kinds: [] }), compare, resume]), [`成果类型 ${KEY} 的固定动作 ${ref(pin)} 必须恰好对一种对象`]);
  assert.equal(manifestProblems(producing(noteType({ pin: undefined, compare: undefined, continue: undefined }), [preview])), "", "a type nobody pins on the spot needs no compare");
});

test("a pin, compare or continue that is not the plugin's own action of that kind is refused", () => {
  assertRefused(producing(noteType({ pin: reference(preview) })), [`成果类型 ${KEY} 的固定动作 ${ref(preview)} 不是本插件声明的固定命令`]);
  assertRefused(producing(noteType({ pin: { capability_id: `${ID}.nowhere`, version: 1 } })), [`成果类型 ${KEY} 的固定动作 ${ID}.nowhere@1 不是本插件声明的固定命令`]);
  assertRefused(producing(noteType({ compare: reference(preview) })), [`成果类型 ${KEY} 的比较动作 ${ref(preview)} 不是本插件声明的比较查询`]);
  assertRefused(producing(noteType({ continue: reference(compare) })), [`成果类型 ${KEY} 的继续动作 ${ref(compare)} 不是本插件声明的继续命令`]);
  assertRefused(producing(noteType(), [preview, pin, asCommand(compare), resume]), [`成果类型 ${KEY} 的比较动作 ${ref(compare)} 不是本插件声明的比较查询`]);
  assertRefused(producing(noteType(), [preview, asQuery(pin), compare, resume]), [`成果类型 ${KEY} 的固定动作 ${ref(pin)} 不是本插件声明的固定命令`]);
});

test("a continue action on a type the plugin only reads must be its own continue command", () => {
  const consumed = (over: Part = {}) => ({ artifact_type_id: "other.file", schema_version: 2, continue: reference(resume), ...over });
  const read = (type: Part, actions: ReadonlyArray<unknown> = [resume]) => declarationManifest({ actions, artifacts: { produces: [], consumes: [type] } });
  assertRefused(read(consumed({ continue: reference(preview) }), [preview]), [`成果类型 other.file@2 的继续动作 ${ref(preview)} 不是本插件声明的继续命令`]);
  assertRefused(read(consumed({ continue: { capability_id: `${ID}.nowhere`, version: 1 } })), [`成果类型 other.file@2 的继续动作 ${ID}.nowhere@1 不是本插件声明的继续命令`]);
  assert.equal(manifestProblems(read({ artifact_type_id: "other.file", schema_version: 2 }, [])), "", "a type that is only read needs nothing");
});

// ---- (c) the reasons come together, in the order the type is read -------------------------------------------------------

test("every problem of every type is reported, produced types first, each in the order name, preview, pin, compare, continue", () => {
  const second = { artifact_type_id: "example.other", schema_version: 3, title: "", compare: reference(preview), continue: reference(pin) };
  const input = declarationManifest({
    actions: ALL,
    artifacts: {
      produces: [noteType({ title: undefined, preview: undefined, pin: reference(compare), compare: undefined, continue: reference(preview) }), second],
      consumes: [{ artifact_type_id: "other.file", schema_version: 1, continue: reference(compare) }],
    },
  });
  assertRefused(input, [
    `成果类型 ${KEY} 缺少显示名（title）`,
    `成果类型 ${KEY} 缺少预览动作（preview）`,
    `成果类型 ${KEY} 的固定动作 ${ref(compare)} 不是本插件声明的固定命令`,
    `成果类型 ${KEY} 可以当场固定，必须声明比较动作（compare）`,
    `成果类型 ${KEY} 的继续动作 ${ref(preview)} 不是本插件声明的继续命令`,
    "成果类型 example.other@3 缺少显示名（title）",
    "成果类型 example.other@3 缺少预览动作（preview）",
    `成果类型 example.other@3 的比较动作 ${ref(preview)} 不是本插件声明的比较查询`,
    `成果类型 example.other@3 的继续动作 ${ref(pin)} 不是本插件声明的继续命令`,
    `成果类型 other.file@1 的继续动作 ${ref(compare)} 不是本插件声明的继续命令`,
  ]);
});

test("the artifact problems come after the ones the other declarations raise, in the same message", () => {
  const input = declarationManifest({
    actions: [preview, { capability_id: `${ID}.broken`, version: 1, action: 5 }],
    artifacts: { produces: [noteType({ title: undefined })], consumes: [] },
  });
  assertRefused(input, [
    `能力 ${ID}.broken@1 的输入输出、权限或展示定义不完整`,
    `成果类型 ${KEY} 缺少显示名（title）`,
    `成果类型 ${KEY} 的固定动作 ${ref(pin)} 不是本插件声明的固定命令`,
    `成果类型 ${KEY} 的比较动作 ${ref(compare)} 不是本插件声明的比较查询`,
    `成果类型 ${KEY} 的继续动作 ${ref(resume)} 不是本插件声明的继续命令`,
  ]);
});

test("declarations that are not what the shape rules expect do not make the check throw", () => {
  for (const actions of [undefined, [], {}, [null], [5], [{ capability_id: preview.capability_id, version: 1 }], [{ ...preview, action: null }]]) {
    const verdict = refusal(declarationManifest({ ...(actions === undefined ? {} : { actions }), artifacts: { produces: [noteType()], consumes: [] } }));
    assert.equal(verdict?.code, "plugin.declaration_invalid", JSON.stringify(actions));
  }
  assert.equal(refusal(declarationManifest({ artifacts: { produces: [noteType({ preview: null, pin: 1, compare: [], continue: "x" })], consumes: [] }, actions: ALL }))?.code, "plugin.declaration_invalid");
});

test("N26: produced and consumed types require declarations for the actions they name", () => {
  const input = (artifacts: Part) => declarationManifest({ artifacts, actions: [] });
  const result = (artifacts: Part) => manifestProblems(input(artifacts));
  assert.match(result({ produces: [{ artifact_type_id: TYPE_ID, schema_version: 1 }], consumes: [] }), /缺少显示名/);
  assert.match(result({ produces: [noteType()], consumes: [] }), /不是本插件声明的预览查询/);
  assert.match(result({ produces: [noteType({ preview: undefined })], consumes: [] }), /预览/);
  assert.equal(result({ produces: [], consumes: [{ artifact_type_id: "other.file", schema_version: 1 }] }), "");
  assert.equal(result({ produces: [], consumes: [] }), "");
  assert.match(result({ produces: [], consumes: [{ artifact_type_id: "other.file", schema_version: 1, continue: reference(resume) }] }), /不是本插件声明的继续命令/);
});

// ---- (e) Runtime applies it on install, from the same parser ------------------------------------------------------------

function definitionOf(manifest: Record<string, unknown>): PluginDefinition {
  return { manifest: manifest as PluginManifest, async start() { return { contribution_id: ID }; } } as PluginDefinition;
}

test("Runtime refuses to install a plugin whose type has no preview, and installs one that has", () => {
  const unreadable = definitionOf(declarationManifest({ artifacts: { produces: [{ artifact_type_id: TYPE_ID, schema_version: 1, title: "笔记" }], consumes: [] } }));
  assert.throws(() => new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS }).install({ trust: { level: "unsigned" }, definition: unreadable, deployment: "local" }),
    (error: unknown) => (error instanceof ActionError && error.kind === "invalid") && error.code === "plugin.manifest_invalid" && error.message.includes(`成果类型 ${KEY} 缺少预览动作（preview）`));
  const note = artifactPreview(ID, TYPE_ID);
  const readable = definitionOf(declarationManifest({ actions: [note.definition], artifacts: { produces: [note.type], consumes: [] } }));
  assert.equal(new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS }).install({ trust: { level: "unsigned" }, definition: readable, deployment: "local" }).install.plugin_id, ID);
});

// ---- (f) the bundled plugins already meet it ----------------------------------------------------------------------------

test("every bundled Manifest parses under the rule, and the sweep covers every kind of type action", () => {
  const manifests = BUILTIN_PLUGIN_CATALOG.map(entry => entry.manifest);
  assert.deepEqual(manifests.flatMap(manifest => { const verdict = manifestProblems(manifest); return verdict ? [`${manifest.plugin_id}: ${verdict}`] : []; }), []);
  const types = manifests.flatMap(manifest => [...manifest.artifacts.produces, ...manifest.artifacts.consumes]) as Array<Part>;
  for (const action of ["preview", "pin", "compare", "continue"]) assert.ok(types.some(type => type[action] !== undefined), `no bundled type declares ${action}`);
});
