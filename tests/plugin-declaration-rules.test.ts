import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
// Characterisation of the declaration rules a Manifest is held to (W3-03 PR-0). The rules moved out of the contracts
// package into the plugin SDK and the two longest were split by declaration segment (B1, B2); what an author is told, word
// for word and in the order the checks run, came out the same. Every expected value was read off the rule it describes,
// then confirmed against the code as it stood before the move, and is written out in full on purpose: a check that is
// dropped, reworded or reordered fails here, not somewhere downstream.
import assert from "node:assert/strict";
import test from "node:test";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import {
  DUE_REMINDERS_INPUT_TYPE, FILE_ENTRIES_INPUT_TYPE, FRAGMENT_OFFERS_INPUT_TYPE, HOME_EVENTS_INPUT_TYPE, PLACEMENT_MOVE_INPUT_TYPE,
  SEARCH_ENTRIES_INPUT_TYPE, SUBJECT_OFFERS_OUTPUT_TYPE, SUBJECT_REFERENCE_TYPE, WORKFLOW_CONTENT_SCHEMAS,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { defineArtifactPreviewAction, inspectActionDeclarations, parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { DECLARATION_PLUGIN_ID, declarationManifest, manifestProblems } from "./fixtures/declaration-manifest.js";

const KEY = "example.read@1";
const SEPARATOR = "；";

type Part = Record<string, unknown>;

/** A query action that satisfies every rule; `over` replaces fields of its `action`, `top` those of the definition. */
function defined(over: Part = {}, top: Part = {}): Part {
  return {
    capability_id: "example.read", version: 1, operation: "query",
    action: { title: "Read", description: "Reads one thing", kind: "query", scope: "project", permissions: [], subject_kinds: [],
      audiences: ["user"], input_schema: { type: "object" }, ...over },
    ...top,
  };
}

/** A consumption scene that satisfies every rule. */
function scene(over: Part = {}): Part {
  return { scene_id: "example.review", version: 1, title: "Review", description: "Review the note", trigger: "Note submitted",
    scope: "project", subject_kinds: [], permissions: [], input_schema: { type: "object" }, result_schema: { type: "object" }, ...over };
}

// ---- (a) every bundled Manifest -------------------------------------------------------------------------------------

test("every bundled Manifest parses and its action declarations raise no problem", () => {
  const manifests = BUILTIN_PLUGIN_CATALOG.map(entry => entry.manifest);
  const failures = manifests.flatMap(manifest => {
    const problems = inspectActionDeclarations(manifest.actions, manifest.action_scenes);
    return problems.length ? [`${manifest.plugin_id}: ${problems.join(SEPARATOR)}`] : [];
  });
  assert.deepEqual(failures, []);
  assert.deepEqual(manifests.flatMap(manifest => { const verdict = manifestProblems(manifest); return verdict ? [`${manifest.plugin_id}: ${verdict}`] : []; }), []);
  // The sweep means something only while the bundled set exercises every kind of declaration the rules check.
  for (const field of ["actions", "action_scenes", "agent", "methods", "ports", "events"] as const) {
    assert.ok(manifests.some(manifest => manifest[field] !== undefined && (!Array.isArray(manifest[field]) || manifest[field].length > 0)), `no bundled Manifest declares ${field}`);
  }
});

// ---- (d) the fixture itself carries no problem ----------------------------------------------------------------------

test("the fixture Manifest is clean, so a problem in a case below is the case's own", () => {
  assert.equal(manifestProblems(declarationManifest({})), "");
  assert.equal(manifestProblems(declarationManifest({ actions: [defined()], action_scenes: [scene()] })), "");
});

// ---- (b) actions: one rule, one violation ---------------------------------------------------------------------------

const incomplete = [`能力 ${KEY} 的输入输出、权限或展示定义不完整`];
const workflowShape = { id: "example-list", title: "Example", icon: "list", protocol: 1, role: "list" };
/** A `receive` as the protocol declares it now (W4-6-01): version 2 of the input, version 1 of the output. */
const receiveNow = { workflow_content: { ...workflowShape, role: "receive" }, kind: "operation", scope: "project", audiences: ["user", "agent", "workflow", "mcp"],
  input_type: "molis.workflow.content.receive.input.v2", output_type: "molis.workflow.content.receive.output.v1",
  input_schema: WORKFLOW_CONTENT_SCHEMAS.receive.input, output_schema: WORKFLOW_CONTENT_SCHEMAS.receive.output };
const oldReceiveInput = { type: "object", additionalProperties: false, required: ["payload", "context"],
  properties: { payload: WORKFLOW_CONTENT_SCHEMAS.read.output, context: { type: "object" } } };
const { request_id: _requestId, ...flatWithoutRequestId } = (WORKFLOW_CONTENT_SCHEMAS.receive.input as { properties: Record<string, unknown> }).properties;

const ACTION_RULES: ReadonlyArray<{ rule: string; actions: unknown; scenes?: unknown; expected: string[] }> = [
  { rule: "nothing declared", actions: undefined, expected: [] },
  { rule: "an empty list", actions: [], expected: [] },
  { rule: "a conforming definition", actions: [defined()], expected: [] },
  { rule: "actions is not a list", actions: {}, expected: ["actions 必须是数组"] },
  { rule: "no identity", actions: [{}], expected: ["能力需要有效身份和版本"] },
  { rule: "a blank capability id", actions: [defined({}, { capability_id: " " })], expected: ["能力需要有效身份和版本"] },
  { rule: "version zero", actions: [defined({}, { version: 0 })], expected: ["能力需要有效身份和版本"] },
  { rule: "a fractional version", actions: [defined({}, { version: 1.5 })], expected: ["能力需要有效身份和版本"] },
  { rule: "a definition twice", actions: [defined(), defined()], expected: [`能力重复：${KEY}`] },
  { rule: "no action body", actions: [defined({}, { action: 5 })], expected: incomplete },
  { rule: "a blank title", actions: [defined({ title: " " })], expected: incomplete },
  { rule: "no description", actions: [defined({ description: undefined })], expected: incomplete },
  { rule: "an unknown kind", actions: [defined({ kind: "other" })], expected: incomplete },
  { rule: "an unknown scope", actions: [defined({ scope: "global" })], expected: incomplete },
  { rule: "an unknown scheduling", actions: [defined({ scheduling: "serial" })], expected: incomplete },
  { rule: "an unknown authorship", actions: [defined({ authorship: "user" })], expected: incomplete },
  { rule: "permissions that are not strings", actions: [defined({ permissions: [1] })], expected: incomplete },
  { rule: "subject kinds that are not strings", actions: [defined({ subject_kinds: "note" })], expected: incomplete },
  { rule: "no audience", actions: [defined({ audiences: [] })], expected: incomplete },
  { rule: "an unknown audience", actions: [defined({ audiences: ["robot"] })], expected: incomplete },
  { rule: "an unknown effect", actions: [defined({ effect: "danger" })], expected: incomplete },
  { rule: "plugin: true", actions: [defined({ plugin: true })], expected: incomplete },
  { rule: "no input schema", actions: [defined({ input_schema: undefined })], expected: incomplete },
  { rule: "an output schema that is not an object", actions: [defined({ output_schema: "x" })], expected: incomplete },
  { rule: "a result scene without a provider", actions: [defined({ result_scene: { scene_id: "example.review", version: 1 } })], expected: [`能力 ${KEY} 的结果场景引用无效`] },
  { rule: "a conforming result scene", actions: [defined({ result_scene: { scene_id: "example.review", version: 1, provider_id: "io.molis.work.example" } })], expected: [] },
  { rule: "a result view without a summary", actions: [defined({ result_view: { summary: "" } })], expected: [`能力 ${KEY} 的结果展示定义无效`] },
  { rule: "a conforming result view", actions: [defined({ result_view: { summary: "Done" } })], expected: [] },
  { rule: "a zero timeout", actions: [defined({ execution: { timeout_ms: 0 } })], expected: [`能力 ${KEY} 的执行策略无效`] },
  { rule: "a conforming execution policy", actions: [defined({ execution: { timeout_ms: 1000, cost: "none" } })], expected: [] },
  { rule: "a required scene without a version", actions: [defined({ required_scene: { scene_id: "example.review" } })], expected: [`能力 ${KEY} 的消费场景依赖无效`] },
  { rule: "required actions that are not a list", actions: [defined({ required_actions: "x" })], expected: [`能力 ${KEY} 的能力依赖无效`] },
  { rule: "a required action without a version", actions: [defined({ required_actions: [{ capability_id: "other.read" }] })], expected: [`能力 ${KEY} 的能力依赖无效`] },
  { rule: "a required action with a blank provider", actions: [defined({ required_actions: [{ capability_id: "other.read", version: 1, provider_id: " " }] })], expected: [`能力 ${KEY} 的能力依赖无效`] },
  { rule: "conforming required actions", actions: [defined({ required_scene: { scene_id: "example.review", version: 1 }, required_actions: [{ capability_id: "other.read", version: 1, provider_id: "io.molis.work.other" }] })], expected: [] },
  { rule: "the subject context type with the wrong schemas", actions: [defined({ input_type: SUBJECT_REFERENCE_TYPE })], expected: [`能力 ${KEY} 没有兑现对象上下文协议 v1 的输入输出合同`] },
  { rule: "the subject offers type with the wrong schemas", actions: [defined({ output_type: SUBJECT_OFFERS_OUTPUT_TYPE })], expected: [`能力 ${KEY} 没有兑现事项动作协议 v1 的输入输出合同`] },
  { rule: "subject offer choices on an action that is not the offers query", actions: [defined({ subject_offer_choices: [] })], expected: [`能力 ${KEY} 的事项推荐选项必须有唯一标识、名称及本提供方的目标动作版本`] },
  { rule: "the home event type with the wrong schemas", actions: [defined({ input_type: HOME_EVENTS_INPUT_TYPE })], expected: [`${KEY} 首页事件查询必须使用完整规范合同`] },
  { rule: "the due reminder type with the wrong schemas", actions: [defined({ input_type: DUE_REMINDERS_INPUT_TYPE })], expected: [`${KEY} 到期提醒查询必须是 Home 范围、使用完整规范合同`] },
  { rule: "a background job that names nothing", actions: [defined({ background_job: {} })], expected: [`能力 ${KEY} 的后台任务声明必须是命令，并写明状态查询、任务标识与状态的位置和结束状态`] },
  { rule: "an undo that names nothing", actions: [defined({ undo: {} })], expected: [`能力 ${KEY} 的撤销声明必须是可撤回的命令，并写明同一提供方的撤销命令与其输入在本次输出里的位置`] },
  { rule: "a search source declared on a plain action", actions: [defined({ search_source: { kinds: [] } })], expected: [`能力 ${KEY} 没有兑现搜索来源协议 v1：需要规范输入输出、查询类型、对本机用户开放与对应对象种类的打开位置`] },
  { rule: "the search entries type with the wrong schemas", actions: [defined({ input_type: SEARCH_ENTRIES_INPUT_TYPE })], expected: [`能力 ${KEY} 没有兑现搜索来源协议 v1：需要规范输入输出、查询类型、对本机用户开放与对应对象种类的打开位置`] },
  { rule: "fragment offer choices on a plain action", actions: [defined({ fragment_offer_choices: [{}] })], expected: [`能力 ${KEY} 没有兑现片段动作协议 v1 的输入输出合同`, `能力 ${KEY} 的片段动作选项必须有唯一标识、名称、意图、说明及本提供方的目标动作版本`] },
  { rule: "the fragment offers type with the wrong schemas", actions: [defined({ input_type: FRAGMENT_OFFERS_INPUT_TYPE })], expected: [`能力 ${KEY} 没有兑现片段动作协议 v1 的输入输出合同`, `能力 ${KEY} 的片段动作选项必须有唯一标识、名称、意图、说明及本提供方的目标动作版本`] },
  { rule: "a file source declared on a plain action", actions: [defined({ file_source: {} })], expected: [`能力 ${KEY} 没有兑现文件来源协议 v1：需要规范输入输出、查询类型、对本机用户开放、与角色一致的声明和对应文件种类的打开位置`] },
  { rule: "the file entries type with the wrong schemas", actions: [defined({ input_type: FILE_ENTRIES_INPUT_TYPE })], expected: [`能力 ${KEY} 没有兑现文件来源协议 v1：需要规范输入输出、查询类型、对本机用户开放、与角色一致的声明和对应文件种类的打开位置`] },
  { rule: "the placement type with the wrong schemas", actions: [defined({ input_type: PLACEMENT_MOVE_INPUT_TYPE })], expected: [`能力 ${KEY} 没有兑现放置协议 v1：需要规范输入输出、项目作用域（移动也可以是 Home 作用域）、只对本机用户开放的操作，以及对象种类`] },
  { rule: "a workflow content declaration that is not one", actions: [defined({ workflow_content: {} })], expected: [`能力 ${KEY} 的工作流内容合同无效`] },
  { rule: "a workflow content protocol other than 1", actions: [defined({ workflow_content: { ...workflowShape, protocol: 2 } })], expected: [`能力 ${KEY} 的工作流内容合同无效`] },
  { rule: "workflow content that receives while it is the receiver", actions: [defined({ workflow_content: { ...workflowShape, role: "receive", receives: false } })], expected: [`能力 ${KEY} 的工作流内容合同无效`] },
  { rule: "workflow content without the station contract", actions: [defined({ workflow_content: workflowShape })], expected: [`能力 ${KEY} 没有兑现工作流内容协议 list v1 的输入输出合同`] },
  { rule: "W4-6-01 a receive at the current version", actions: [defined(receiveNow, { operation: "command", version: 2 })], expected: [] },
  { rule: "W4-6-01 a receive whose version moved up on its own", actions: [defined(receiveNow, { operation: "command", version: 3 })], expected: [] },
  { rule: "W4-6-01 a receive in the current shape still declared as version 1", actions: [defined(receiveNow, { operation: "command" })],
    expected: [`能力 ${KEY} 的版本低于工作流内容协议 receive 的现行版本 2`] },
  { rule: "W4-6-01 a receive that still takes the v1 input", actions: [defined({ ...receiveNow, input_type: "molis.workflow.content.receive.input.v1", input_schema: oldReceiveInput }, { operation: "command" })],
    expected: [`能力 ${KEY} 没有兑现工作流内容协议 receive v2 的输入合同`] },
  { rule: "W4-6-01 a receive whose flat input has no request id", actions: [defined({ ...receiveNow, input_schema: { ...WORKFLOW_CONTENT_SCHEMAS.receive.input, properties: flatWithoutRequestId, required: ["title", "body"] } }, { operation: "command" })],
    expected: [`能力 ${KEY} 没有兑现工作流内容协议 receive v2 的输入合同`] },
  { rule: "W4-6-01 a receive that names the v2 input type but returns another output", actions: [defined({ ...receiveNow, output_type: "molis.workflow.content.receive.output.v2" }, { operation: "command" })],
    expected: [`能力 ${KEY} 没有兑现工作流内容协议 receive v2 的输出合同`] },
  { rule: "a query whose kind is operation", actions: [defined({ kind: "operation" })], expected: [`能力 ${KEY} 的 operation 与 kind 不一致`] },
  { rule: "a query whose kind is judgment", actions: [defined({ kind: "judgment" })], expected: [`能力 ${KEY} 的 operation 与 kind 不一致`] },
  { rule: "a navigation whose operation is command", actions: [defined({ kind: "navigation" }, { operation: "command" })], expected: [`能力 ${KEY} 的 operation 与 kind 不一致`] },
  { rule: "scenes are not a list", actions: undefined, scenes: {}, expected: ["action_scenes 必须是数组"] },
  { rule: "no scene identity", actions: undefined, scenes: [{}], expected: ["消费场景需要有效身份和版本"] },
  { rule: "a conforming scene", actions: undefined, scenes: [scene()], expected: [] },
  { rule: "a scene event schema that is not an object", actions: undefined, scenes: [scene({ event_schema: "x" })], expected: ["消费场景 example.review 的事件合同无效"] },
  { rule: "an unknown recommendation source", actions: undefined, scenes: [scene({ recommendation_source: "other" })], expected: ["消费场景 example.review 的推荐来源合同无效"] },
  { rule: "a recommendation source without the recommendation result type", actions: undefined, scenes: [scene({ recommendation_source: "subject-offers" })], expected: ["消费场景 example.review 的推荐来源合同无效"] },
  { rule: "recommendation labels that are not an object", actions: undefined, scenes: [scene({ recommendation_labels: [] })], expected: ["消费场景 example.review 的推荐名称必须对应结果合同中的选项"] },
  { rule: "a scene twice", actions: undefined, scenes: [scene(), scene()], expected: ["消费场景重复：example.review@1"] },
  { rule: "a scene without a title", actions: undefined, scenes: [scene({ title: " " })], expected: ["消费场景 example.review@1 的触发、输入输出或权限定义不完整"] },
  { rule: "a scene with an unknown scope", actions: undefined, scenes: [scene({ scope: "global" })], expected: ["消费场景 example.review@1 的触发、输入输出或权限定义不完整"] },
  { rule: "scene permissions that are not strings", actions: undefined, scenes: [scene({ permissions: [1] })], expected: ["消费场景 example.review@1 的触发、输入输出或权限定义不完整"] },
  { rule: "scene configuration permissions that are not strings", actions: undefined, scenes: [scene({ configuration_permissions: "x" })], expected: ["消费场景 example.review@1 的触发、输入输出或权限定义不完整"] },
  { rule: "a scene without a result schema", actions: undefined, scenes: [scene({ result_schema: undefined })], expected: ["消费场景 example.review@1 的触发、输入输出或权限定义不完整"] },
];

for (const { rule, actions, scenes, expected } of ACTION_RULES) {
  test(`action declarations: ${rule}`, () => {
    assert.deepEqual(inspectActionDeclarations(actions, scenes), expected);
  });
}

// ---- (c) several violations at once: the order is part of what the author reads --------------------------------------

// Everything one definition can break that does not depend on its input/output type, in the order the checks run.
const MANY_IN_ONE = defined({
  result_scene: { scene_id: "example.review" },
  result_view: { summary: "" },
  execution: { timeout_ms: 0 },
  required_scene: { scene_id: "example.review" },
  required_actions: "x",
  subject_offer_choices: [],
  background_job: {},
  undo: {},
  search_source: { kinds: [] },
  // An empty list is only checked against the Manifest (an entry's `prepare`, W4-1); a malformed choice is checked here.
  fragment_offer_choices: [{}],
  file_source: {},
  workflow_content: {},
}, { operation: "command" });
const MANY_IN_ONE_EXPECTED = [
  `能力 ${KEY} 的结果场景引用无效`,
  `能力 ${KEY} 的结果展示定义无效`,
  `能力 ${KEY} 的执行策略无效`,
  `能力 ${KEY} 的消费场景依赖无效`,
  `能力 ${KEY} 的能力依赖无效`,
  `能力 ${KEY} 的事项推荐选项必须有唯一标识、名称及本提供方的目标动作版本`,
  `能力 ${KEY} 的后台任务声明必须是命令，并写明状态查询、任务标识与状态的位置和结束状态`,
  `能力 ${KEY} 的撤销声明必须是可撤回的命令，并写明同一提供方的撤销命令与其输入在本次输出里的位置`,
  `能力 ${KEY} 没有兑现搜索来源协议 v1：需要规范输入输出、查询类型、对本机用户开放与对应对象种类的打开位置`,
  `能力 ${KEY} 没有兑现片段动作协议 v1 的输入输出合同`,
  `能力 ${KEY} 的片段动作选项必须有唯一标识、名称、意图、说明及本提供方的目标动作版本`,
  `能力 ${KEY} 没有兑现文件来源协议 v1：需要规范输入输出、查询类型、对本机用户开放、与角色一致的声明和对应文件种类的打开位置`,
  `能力 ${KEY} 的工作流内容合同无效`,
  `能力 ${KEY} 的 operation 与 kind 不一致`,
];

test("action declarations: one definition that breaks every independent segment reports them in the order of the checks", () => {
  assert.deepEqual(inspectActionDeclarations([MANY_IN_ONE], undefined), MANY_IN_ONE_EXPECTED);
});

test("action declarations: the protocol segments follow the generic ones, whichever types the definition names", () => {
  const protocols = defined({
    input_type: SUBJECT_REFERENCE_TYPE, output_type: SUBJECT_OFFERS_OUTPUT_TYPE, result_view: { summary: "" }, undo: {},
  });
  assert.deepEqual(inspectActionDeclarations([protocols], undefined), [
    `能力 ${KEY} 的结果展示定义无效`,
    `能力 ${KEY} 没有兑现对象上下文协议 v1 的输入输出合同`,
    `能力 ${KEY} 没有兑现事项动作协议 v1 的输入输出合同`,
    `能力 ${KEY} 的撤销声明必须是可撤回的命令，并写明同一提供方的撤销命令与其输入在本次输出里的位置`,
  ]);
  const placement = defined({ input_type: PLACEMENT_MOVE_INPUT_TYPE, undo: {}, workflow_content: {} });
  assert.deepEqual(inspectActionDeclarations([placement], undefined), [
    `能力 ${KEY} 的撤销声明必须是可撤回的命令，并写明同一提供方的撤销命令与其输入在本次输出里的位置`,
    `能力 ${KEY} 没有兑现放置协议 v1：需要规范输入输出、项目作用域（移动也可以是 Home 作用域）、只对本机用户开放的操作，以及对象种类`,
    `能力 ${KEY} 的工作流内容合同无效`,
  ]);
});

test("action declarations: definitions are reported one after the other, an incomplete one without the checks that need its body", () => {
  const first = defined({ result_scene: { scene_id: "example.review" } });
  const broken = defined({ title: " ", result_scene: { scene_id: "example.review" } }, { capability_id: "example.broken" });
  const again = defined({ undo: {} });
  assert.deepEqual(inspectActionDeclarations([first, { nothing: true }, broken, again], undefined), [
    `能力 ${KEY} 的结果场景引用无效`,
    "能力需要有效身份和版本",
    "能力 example.broken@1 的输入输出、权限或展示定义不完整",
    `能力重复：${KEY}`,
    `能力 ${KEY} 的撤销声明必须是可撤回的命令，并写明同一提供方的撤销命令与其输入在本次输出里的位置`,
  ]);
});

test("action declarations: definition problems come before scene problems, and a scene reports its checks in order", () => {
  const brokenScene = scene({ event_schema: "x", recommendation_source: "other", recommendation_labels: [], title: " " });
  assert.deepEqual(inspectActionDeclarations([defined({ undo: {} })], [brokenScene, brokenScene]), [
    `能力 ${KEY} 的撤销声明必须是可撤回的命令，并写明同一提供方的撤销命令与其输入在本次输出里的位置`,
    "消费场景 example.review 的事件合同无效",
    "消费场景 example.review 的推荐来源合同无效",
    "消费场景 example.review 的推荐名称必须对应结果合同中的选项",
    "消费场景 example.review@1 的触发、输入输出或权限定义不完整",
    "消费场景 example.review 的事件合同无效",
    "消费场景 example.review 的推荐来源合同无效",
    "消费场景 example.review 的推荐名称必须对应结果合同中的选项",
    "消费场景重复：example.review@1",
    "消费场景 example.review@1 的触发、输入输出或权限定义不完整",
  ]);
  assert.deepEqual(inspectActionDeclarations({}, {}), ["actions 必须是数组", "action_scenes 必须是数组"]);
});

// ---- (b) the Manifest-level checks: what `parsePluginManifest` adds around the action declarations ---------------------

const INPUT_TYPE = { artifact_type_id: "example.input", schema_version: 1 };
const OUTPUT_TYPE = { artifact_type_id: "example.output", schema_version: 1 };
const ARTIFACT_PERMISSIONS = [
  { permission: "artifact:read", required: true, reason: "Read the inputs" },
  { permission: "artifact:write", required: true, reason: "Save the outputs" },
];
// A type pinned into the 成果库 is named and has a preview action of its own plugin (W3-05-2); `OUTPUT_TYPE` itself stays the bare
// type the ports and the process items name.
const OUTPUT_PREVIEW = defineArtifactPreviewAction("example.output.preview", "输出", []);
const PRODUCED_OUTPUT = { ...OUTPUT_TYPE, title: "输出", preview: { capability_id: OUTPUT_PREVIEW.capability_id, version: OUTPUT_PREVIEW.version } };
const CONSUMES_INPUT = { produces: [PRODUCED_OUTPUT], consumes: [INPUT_TYPE] };

/** A Manifest that declares `ports` together with the permissions, types and the preview action they rely on. */
function withPorts(ports: Part, over: Part = {}): Record<string, unknown> {
  return declarationManifest({ permissions: ARTIFACT_PERMISSIONS, artifacts: CONSUMES_INPUT, actions: [OUTPUT_PREVIEW], ports, ...over });
}
const portsOf = (over: Part = {}): Part => ({ inputs: [{ port: "source", ...INPUT_TYPE }], outputs: [{ port: "result", ...OUTPUT_TYPE }], ...over });

const NAMESPACE = DECLARATION_PLUGIN_ID;
const MANIFEST_RULES: ReadonlyArray<{ rule: string; manifest: Record<string, unknown>; expected: string }> = [
  // permissions the declarations use
  { rule: "an action permission the Manifest never declared", manifest: declarationManifest({ actions: [defined({ permissions: ["storage:private"] })] }), expected: "能力 example.read 使用未声明权限 storage:private" },
  { rule: "a declared action permission", manifest: declarationManifest({ permissions: [{ permission: "storage:private", required: true, reason: "Keep notes" }], actions: [defined({ permissions: ["storage:private"] })] }), expected: "" },
  { rule: "scene permissions the Manifest never declared", manifest: declarationManifest({ action_scenes: [scene({ permissions: ["a:one"], configuration_permissions: ["c:two"] })] }), expected: "场景 example.review 使用未声明权限 a:one；场景 example.review 使用未声明权限 c:two" },
  // ports
  { rule: "conforming ports", manifest: withPorts(portsOf({ input_groups: [{ group_id: "only", title: "Only", ports: ["source"] }] })), expected: "" },
  { rule: "an input port with a bad name", manifest: withPorts(portsOf({ inputs: [{ port: "Bad Name", ...INPUT_TYPE }] })), expected: "输入端口名不合法" },
  { rule: "an input port twice", manifest: withPorts(portsOf({ inputs: [{ port: "source", ...INPUT_TYPE }, { port: "source", ...INPUT_TYPE }] })), expected: "输入端口重复：source" },
  { rule: "an input port without a type", manifest: withPorts(portsOf({ inputs: [{ port: "source", schema_version: 1 }] })), expected: "输入端口 source 缺少成果类型；输入端口 source 的类型 undefined@1 没有列入 artifacts.consumes 或 process_items.consumes" },
  { rule: "an input port with schema_version 0", manifest: withPorts(portsOf({ inputs: [{ port: "source", artifact_type_id: "example.input", schema_version: 0 }] })), expected: "输入端口 source 的 schema_version 无效；输入端口 source 的类型 example.input@0 没有列入 artifacts.consumes 或 process_items.consumes" },
  { rule: "an output port with a bad name", manifest: withPorts(portsOf({ outputs: [{ port: "Bad Name", ...OUTPUT_TYPE }] })), expected: "输出端口名不合法" },
  { rule: "an output port twice", manifest: withPorts(portsOf({ outputs: [{ port: "result", ...OUTPUT_TYPE }, { port: "result", ...OUTPUT_TYPE }] })), expected: "输出端口重复：result" },
  { rule: "an output port without a type", manifest: withPorts(portsOf({ outputs: [{ port: "result", schema_version: 1 }] })), expected: "输出端口 result 缺少成果类型；输出端口 result 的类型 undefined@1 没有列入 artifacts.produces 或 process_items.produces" },
  { rule: "an output port with schema_version 0", manifest: withPorts(portsOf({ outputs: [{ port: "result", artifact_type_id: "example.output", schema_version: 0 }] })), expected: "输出端口 result 的 schema_version 无效；输出端口 result 的类型 example.output@0 没有列入 artifacts.produces 或 process_items.produces" },
  { rule: "an input group without an id", manifest: withPorts(portsOf({ input_groups: [{ title: "x", ports: ["source"] }] })), expected: "输入组缺少 ID" },
  { rule: "an input group twice", manifest: withPorts(portsOf({ input_groups: [{ group_id: "g", ports: ["source"] }, { group_id: "g", ports: ["source"] }] })), expected: "输入组重复：g" },
  { rule: "an input group without ports", manifest: withPorts(portsOf({ input_groups: [{ group_id: "g", ports: [] }] })), expected: "输入组 g 必须至少包含一个端口" },
  { rule: "an input group naming an undeclared port", manifest: withPorts(portsOf({ input_groups: [{ group_id: "g", ports: ["source", "nowhere"] }] })), expected: "输入组 g 引用了未声明的输入端口 nowhere" },
  // W4-03-03: a port's default source and the default input group
  { rule: "a default source naming another plugin's output", manifest: withPorts(portsOf({ inputs: [{ port: "source", ...INPUT_TYPE, default_source: { plugin_id: "io.molis.work.files", port: "before" } }] })), expected: "" },
  { rule: "a default source naming the plugin itself", manifest: withPorts(portsOf({ inputs: [{ port: "source", ...INPUT_TYPE, default_source: { plugin_id: DECLARATION_PLUGIN_ID, port: "result" } }] })), expected: "输入端口 source 的默认来源要写另一个插件的 plugin_id 与输出端口名" },
  { rule: "a default source with a plugin id that is not one", manifest: withPorts(portsOf({ inputs: [{ port: "source", ...INPUT_TYPE, default_source: { plugin_id: "files", port: "before" } }] })), expected: "输入端口 source 的默认来源要写另一个插件的 plugin_id 与输出端口名" },
  { rule: "a default source with a bad port name", manifest: withPorts(portsOf({ inputs: [{ port: "source", ...INPUT_TYPE, default_source: { plugin_id: "io.molis.work.files", port: "Before" } }] })), expected: "输入端口 source 的默认来源要写另一个插件的 plugin_id 与输出端口名" },
  { rule: "a default source that is not an object", manifest: withPorts(portsOf({ inputs: [{ port: "source", ...INPUT_TYPE, default_source: "io.molis.work.files" }] })), expected: "输入端口 source 的默认来源要写另一个插件的 plugin_id 与输出端口名" },
  { rule: "one default input group", manifest: withPorts(portsOf({ input_groups: [{ group_id: "a", title: "A", ports: ["source"], default: true }, { group_id: "b", title: "B", ports: ["source"] }] })), expected: "" },
  { rule: "two default input groups", manifest: withPorts(portsOf({ input_groups: [{ group_id: "a", title: "A", ports: ["source"], default: true }, { group_id: "b", title: "B", ports: ["source"], default: true }] })), expected: "最多一个输入组是默认组" },
  { rule: "an input group default that is not a boolean", manifest: withPorts(portsOf({ input_groups: [{ group_id: "a", title: "A", ports: ["source"], default: "yes" }] })), expected: "输入组 a 的 default 必须是布尔值" },
  { rule: "outputs without the write permission", manifest: withPorts(portsOf(), { permissions: [ARTIFACT_PERMISSIONS[0]] }), expected: "声明了输出端口就必须声明 artifact:write 权限" },
  { rule: "inputs without the read permission", manifest: withPorts(portsOf(), { permissions: [ARTIFACT_PERMISSIONS[1]] }), expected: "声明了输入端口就必须声明 artifact:read 权限" },
  { rule: "a type that is both a pinned artifact and a process item", manifest: withPorts(portsOf(), { process_items: { produces: [OUTPUT_TYPE], consumes: [] } }), expected: "类型 example.output@1 不能既是成果又是过程项" },
  { rule: "an output port whose type is only a process item", manifest: withPorts(portsOf(), { artifacts: { produces: [], consumes: [INPUT_TYPE] }, process_items: { produces: [OUTPUT_TYPE], consumes: [] } }), expected: "" },
  { rule: "an output port whose type is declared nowhere", manifest: withPorts(portsOf(), { artifacts: { produces: [], consumes: [INPUT_TYPE] } }), expected: "输出端口 result 的类型 example.output@1 没有列入 artifacts.produces 或 process_items.produces" },
  { rule: "an input port whose type is declared nowhere", manifest: withPorts(portsOf(), { artifacts: { produces: [PRODUCED_OUTPUT], consumes: [] } }), expected: "输入端口 source 的类型 example.input@1 没有列入 artifacts.consumes 或 process_items.consumes" },
  // events
  { rule: "conforming events", manifest: declarationManifest({ events: { publishes: [{ event_type_id: `${NAMESPACE}.changed`, type_version: 1 }], subscribes: [{ event_type_id: "io.molis.work.files.refreshed", type_version: 1, from_plugin_ids: ["io.molis.work.files"] }] } }), expected: "" },
  { rule: "a published event without a valid type id", manifest: declarationManifest({ events: { publishes: [{ event_type_id: "Bad Id", type_version: 1 }] } }), expected: "发布事件缺少合法类型 ID" },
  { rule: "a published event with version 0", manifest: declarationManifest({ events: { publishes: [{ event_type_id: `${NAMESPACE}.changed`, type_version: 0 }] } }), expected: `发布事件 ${NAMESPACE}.changed 的版本无效` },
  { rule: "a published event in a reserved namespace", manifest: declarationManifest({ events: { publishes: [{ event_type_id: "host.stopped", type_version: 1 }] } }), expected: "不能发布宿主保留事件 host.stopped" },
  { rule: "a published event outside the Plugin's namespace", manifest: declarationManifest({ events: { publishes: [{ event_type_id: "io.molis.work.files.refreshed", type_version: 1 }] } }), expected: `事件 io.molis.work.files.refreshed 不属于 ${NAMESPACE} 的命名空间` },
  { rule: "a published event twice", manifest: declarationManifest({ events: { publishes: [{ event_type_id: `${NAMESPACE}.changed`, type_version: 1 }, { event_type_id: `${NAMESPACE}.changed`, type_version: 1 }] } }), expected: `发布事件重复：${NAMESPACE}.changed@1` },
  { rule: "a subscription without a valid type id", manifest: declarationManifest({ events: { subscribes: [{ event_type_id: "Bad Id", type_version: 1, from_plugin_ids: ["io.molis.work.files"] }] } }), expected: "订阅事件缺少合法类型 ID" },
  { rule: "a subscription with version 0", manifest: declarationManifest({ events: { subscribes: [{ event_type_id: "io.molis.work.files.refreshed", type_version: 0, from_plugin_ids: ["io.molis.work.files"] }] } }), expected: "订阅事件 io.molis.work.files.refreshed 的版本无效" },
  { rule: "a subscription without sources", manifest: declarationManifest({ events: { subscribes: [{ event_type_id: "io.molis.work.files.refreshed", type_version: 1, from_plugin_ids: [] }] } }), expected: "订阅 io.molis.work.files.refreshed 必须显式限定来源插件" },
  { rule: "a subscription with a wildcard source", manifest: declarationManifest({ events: { subscribes: [{ event_type_id: "io.molis.work.files.refreshed", type_version: 1, from_plugin_ids: ["*"] }] } }), expected: "订阅 io.molis.work.files.refreshed 的来源声明无效" },
  { rule: "a subscription naming a source twice", manifest: declarationManifest({ events: { subscribes: [{ event_type_id: "io.molis.work.files.refreshed", type_version: 1, from_plugin_ids: ["io.molis.work.files", "io.molis.work.files"] }] } }), expected: "订阅 io.molis.work.files.refreshed 的来源重复：io.molis.work.files" },
  { rule: "a subscription twice", manifest: declarationManifest({ events: { subscribes: [{ event_type_id: "io.molis.work.files.refreshed", type_version: 1, from_plugin_ids: ["io.molis.work.files"] }, { event_type_id: "io.molis.work.files.refreshed", type_version: 1, from_plugin_ids: ["io.molis.work.files"] }] } }), expected: "订阅事件重复：io.molis.work.files.refreshed@1" },
  // methods
  { rule: "conforming methods", manifest: declarationManifest({ methods: [method()] }), expected: "" },
  { rule: "methods that are not a list", manifest: declarationManifest({ methods: {} }), expected: "方法声明必须是列表" },
  { rule: "a method with a bad id", manifest: declarationManifest({ methods: [method({ skill_id: "Bad Id" })] }), expected: "方法声明不合法" },
  { rule: "a method with version 0", manifest: declarationManifest({ methods: [method({ version: 0 })] }), expected: "方法声明不合法" },
  { rule: "a method twice", manifest: declarationManifest({ methods: [method(), method()] }), expected: "方法重复：summarize" },
  { rule: "a method without a name", manifest: declarationManifest({ methods: [method({ name: " " })] }), expected: "方法 summarize 需要名称（80 字以内）" },
  { rule: "a method with a name over 80 characters", manifest: declarationManifest({ methods: [method({ name: "n".repeat(81) })] }), expected: "方法 summarize 需要名称（80 字以内）" },
  { rule: "a method without a summary", manifest: declarationManifest({ methods: [method({ summary: "" })] }), expected: "方法 summarize 需要适用说明（300 字以内）" },
  { rule: "a method with a summary over 300 characters", manifest: declarationManifest({ methods: [method({ summary: "s".repeat(301) })] }), expected: "方法 summarize 需要适用说明（300 字以内）" },
  { rule: "a method without tools", manifest: declarationManifest({ methods: [method({ tools: [] })] }), expected: "方法 summarize 只能使用业务工具：find-capabilities、read-capability、change-capability、suggest-action、ask-user、update-todo、find-tools、context-remaining、board-wait、acknowledge-inputs" },
  { rule: "a method with a tool outside the business set", manifest: declarationManifest({ methods: [method({ tools: ["find-capabilities", "write"] })] }), expected: "方法 summarize 只能使用业务工具：find-capabilities、read-capability、change-capability、suggest-action、ask-user、update-todo、find-tools、context-remaining、board-wait、acknowledge-inputs" },
  { rule: "ASC-19: a business method can declare persistent waiting", manifest: declarationManifest({ methods: [method({ tools: ["board-wait"] })] }), expected: "" },
  // views
  { rule: "conforming views", manifest: declarationManifest({ ui: uiOf() }), expected: "" },
  { rule: "views that are not a list", manifest: declarationManifest({ ui: uiOf({ views: {} }) }), expected: "ui.views 必须为数组" },
  { rule: "a view without an id", manifest: declarationManifest({ ui: uiOf({ views: [{ slot: "stage", title: "Main" }] }) }), expected: "视图缺少 ID；命令 open 打开的视图 main 未声明" },
  { rule: "a view twice", manifest: declarationManifest({ ui: uiOf({ views: [view(), view()] }) }), expected: "视图重复：main" },
  { rule: "a view with an unknown slot", manifest: declarationManifest({ ui: uiOf({ views: [view({ slot: "floating" })] }) }), expected: "视图 main 的 slot 不合法" },
  { rule: "a view without a title", manifest: declarationManifest({ ui: uiOf({ views: [view({ title: " " })] }) }), expected: "视图 main 缺少标题" },
  { rule: "a view whose contribution is not declared", manifest: declarationManifest({ ui: uiOf({ contributions: [] }) }), expected: `视图 main 的 contribution ${NAMESPACE}.main 未在 ui.contributions 声明` },
  // routes
  { rule: "conforming routes", manifest: declarationManifest({ routes: [route()] }), expected: "" },
  { rule: "a route without an id", manifest: declarationManifest({ routes: [route({ route_id: undefined })] }), expected: "路由缺少 ID" },
  { rule: "a route id twice", manifest: declarationManifest({ routes: [route(), route({ path: "/other" })] }), expected: "路由重复：example.list" },
  { rule: "a route with an unknown method", manifest: declarationManifest({ routes: [route({ method: "TRACE" })] }), expected: "路由 example.list 的方法不合法" },
  { rule: "a route path without a leading slash", manifest: declarationManifest({ routes: [route({ path: "items" })] }), expected: "路由 example.list 的路径不合法" },
  { rule: "a route path that climbs out", manifest: declarationManifest({ routes: [route({ path: "/../items" })] }), expected: "路由 example.list 的路径不合法" },
  { rule: "a route path twice under another id", manifest: declarationManifest({ routes: [route(), route({ route_id: "example.again" })] }), expected: "路由路径重复：GET /items" },
  { rule: "a route permission the Manifest never declared", manifest: declarationManifest({ routes: [route({ permission: "storage:private" })] }), expected: "路由 example.list 要求未声明的权限 storage:private" },
  // RAC-21 / RAC-37: explicit limits may reach 45,000,000 bytes, preserving Cognia batch uploads (user decision 2026-10-17).
  { rule: "a route body limit within the bound", manifest: declarationManifest({ routes: [route({ max_body_bytes: 96 * 1024 * 1024 })] }), expected: "" },
  { rule: "a route body limit past the bound", manifest: declarationManifest({ routes: [route({ max_body_bytes: 96 * 1024 * 1024 + 1 })] }), expected: "路由 example.list 的请求体上限不合法（1 到 100663296 字节）" },
  { rule: "a route body limit that is not a whole positive number", manifest: declarationManifest({ routes: [route({ max_body_bytes: 0.5 })] }), expected: "路由 example.list 的请求体上限不合法（1 到 100663296 字节）" },
  // required capabilities
  { rule: "a conforming requirement", manifest: declarationManifest({ capabilities: { provides: [], consumes: ["projects.read.v1"] }, requires: [requirement()] }), expected: "" },
  { rule: "a requirement without a capability id", manifest: declarationManifest({ requires: [requirement({ capability_id: undefined })] }), expected: "依赖缺少 Capability ID" },
  { rule: "a requirement with version 0", manifest: declarationManifest({ capabilities: { provides: [], consumes: ["projects.read.v1"] }, requires: [requirement({ version: 0 })] }), expected: "依赖 projects.read.v1 的版本无效" },
  { rule: "a requirement twice", manifest: declarationManifest({ capabilities: { provides: [], consumes: ["projects.read.v1"] }, requires: [requirement(), requirement()] }), expected: "依赖重复：projects.read.v1@1" },
  { rule: "a requirement without a reason", manifest: declarationManifest({ capabilities: { provides: [], consumes: ["projects.read.v1"] }, requires: [requirement({ reason: " " })] }), expected: "依赖 projects.read.v1@1 必须说明用途" },
  { rule: "a requirement missing from capabilities.consumes", manifest: declarationManifest({ requires: [requirement()] }), expected: "依赖 projects.read.v1@1 未列入 capabilities.consumes" },
];

function method(over: Part = {}): Part {
  return { skill_id: "summarize", version: 1, name: "Summarize", summary: "Summarizes what the person selected", tools: ["find-capabilities"], ...over };
}
function view(over: Part = {}): Part { return { view_id: "main", slot: "stage", title: "Main", ...over }; }
function uiOf(over: Part = {}): Part {
  return { contributions: [`${NAMESPACE}.main`], views: [view()], ...over };
}
function route(over: Part = {}): Part { return { route_id: "example.list", method: "GET", path: "/items", ...over }; }
function requirement(over: Part = {}): Part { return { capability_id: "projects.read.v1", version: 1, reason: "Read the current project", ...over }; }

for (const { rule, manifest, expected } of MANIFEST_RULES) {
  test(`Manifest declarations: ${rule}`, () => {
    assert.equal(manifestProblems(manifest), expected);
  });
}

// ---- (b) the Agent block ---------------------------------------------------------------------------------------------

const reader = { role_id: "reader", version: 1, name: "Reader" };
const readerPrompt = { prompt_id: "reader", version: 1 };
const BUSINESS_TOOLS = "ask-user、update-todo、find-tools、context-remaining、board-wait、acknowledge-inputs";
const TASK_DELEGATE = { role_id: "child", version: 1, name: "Child" };

/** An Agent block that satisfies every rule, with `over` laid over it. */
function agentOf(over: Part = {}): Part { return { roles: [reader], prompts: [readerPrompt], ...over }; }
/** One Agent role, and the prompt it needs when it names none. */
function roleOf(over: Part): Part { return agentOf({ roles: [{ ...reader, ...over }] }); }
const withChild = (child: Part, over: Part = {}): Part => agentOf({
  prompts: [readerPrompt, { prompt_id: "child", version: 1 }],
  subagents: { parent_role_ids: ["reader"], roles: [{ ...TASK_DELEGATE, ...child }] }, ...over,
});

const AGENT_RULES: ReadonlyArray<{ rule: string; agent: Part; ports?: Part; expected: string }> = [
  { rule: "a conforming Agent block", agent: agentOf(), expected: "" },
  { rule: "no roles", agent: { roles: [], prompts: [] }, expected: "Agent 至少需要一个角色" },
  { rule: "a directory port that is not a declared input", agent: agentOf({ directory_input_port: "elsewhere" }), expected: "Agent 的 directory_input_port elsewhere 不是已声明输入端口" },
  { rule: "a directory port that is a declared input", agent: agentOf({ directory_input_port: "source" }), ports: portsOf(), expected: "" },
  { rule: "a text source on an undeclared input with schema_version 0", agent: agentOf({ text_sources: [{ input_port: "nowhere", output_port: "text", artifact_type_id: "example.text", schema_version: 0 }] }), expected: "Agent 文本来源引用了未声明输入端口 nowhere；Agent 文本来源 nowhere 的 schema_version 无效" },
  { rule: "a role naming a prompt that is not declared", agent: roleOf({ prompts: ["nowhere"] }), expected: "角色 reader 引用了未声明的 Prompt nowhere" },
  { rule: "a prompt with a bad id", agent: agentOf({ prompts: [readerPrompt, { prompt_id: "Bad", version: 1 }] }), expected: "Agent Prompt 声明不合法" },
  { rule: "a prompt with version 0", agent: agentOf({ prompts: [readerPrompt, { prompt_id: "other", version: 0 }] }), expected: "Agent Prompt 声明不合法" },
  { rule: "a prompt twice", agent: agentOf({ prompts: [readerPrompt, readerPrompt] }), expected: "Agent Prompt 重复：reader" },
  { rule: "a prompt in an unknown layer", agent: agentOf({ prompts: [{ ...readerPrompt, layer: "system" }] }), expected: "Agent Prompt reader 的层级不合法：system" },
  { rule: "a prompt in the task layer", agent: agentOf({ prompts: [{ ...readerPrompt, layer: "task" }] }), expected: "Agent Prompt reader 不能声明为 task 层：任务是用户这一次写的" },
  { rule: "a role with a bad id", agent: agentOf({ roles: [reader, { role_id: "Bad", version: 1, name: "Bad" }] }), expected: "Agent 角色声明不合法" },
  { rule: "a role twice", agent: agentOf({ roles: [reader, reader] }), expected: "Agent 角色重复：reader" },
  { rule: "a role with an unknown workspace", agent: roleOf({ workspace: "elsewhere" }), expected: "Agent 角色 reader 的工作区声明无效" },
  { rule: "a business role that writes", agent: roleOf({ workspace: "business", execution: "workspace-write" }), expected: `业务角色 reader 只能只读或经审查操作，工具限于 ${BUSINESS_TOOLS}，不能分派子任务` },
  { rule: "a business role with a tool outside the business set", agent: roleOf({ workspace: "business", host_tools: ["write"] }), expected: `业务角色 reader 只能只读或经审查操作，工具限于 ${BUSINESS_TOOLS}，不能分派子任务` },
  { rule: "a business role that dispatches sub-tasks", agent: withChild({}, { roles: [{ ...reader, workspace: "business" }] }), expected: `业务角色 reader 只能只读或经审查操作，工具限于 ${BUSINESS_TOOLS}，不能分派子任务` },
  { rule: "a conforming operating business role", agent: roleOf({ workspace: "business", execution: "operate", host_tools: ["ask-user"] }), expected: "" },
  { rule: "ASC-19: a business role can declare persistent waiting", agent: roleOf({ workspace: "business", execution: "operate", host_tools: ["board-wait"] }), expected: "" },
  { rule: "operate outside a business role", agent: roleOf({ execution: "operate" }), expected: "Agent 角色 reader 的 operate 执行方式只用于业务角色" },
  { rule: "a no-workspace role that writes", agent: roleOf({ workspace: "none", execution: "text-edit" }), expected: "无工作区角色 reader 必须为不使用工具或子任务的只读推理" },
  { rule: "a no-workspace role with tools", agent: roleOf({ workspace: "none", host_tools: ["read-file"] }), expected: "无工作区角色 reader 必须为不使用工具或子任务的只读推理" },
  { rule: "a role with no prompt of its own and none named", agent: { roles: [reader], prompts: [] }, expected: "Agent 角色 reader 既没有声明 prompts，也没有同名 Prompt" },
  { rule: "a role that names its prompts", agent: { roles: [{ ...reader, prompts: ["shared"] }], prompts: [{ prompt_id: "shared", version: 1 }] }, expected: "" },
  { rule: "a parent of own workspaces that is not read-only", agent: roleOf({ subagent_workspaces: "required", execution: "text-edit" }), expected: "Agent 角色 reader 要求独立子目录时必须是只读父角色" },
  { rule: "characters with another selection", agent: agentOf({ characters: { selection: "any", scope: "project-owner", role_ids: ["reader"] } }), expected: "Agent Character 必须声明本项目本人范围、精确版本选择和已声明的角色" },
  { rule: "characters naming no role", agent: agentOf({ characters: { selection: "optional-exact-artifact", scope: "project-owner", role_ids: [] } }), expected: "Agent Character 必须声明本项目本人范围、精确版本选择和已声明的角色" },
  { rule: "characters naming a role twice", agent: agentOf({ characters: { selection: "optional-exact-artifact", scope: "project-owner", role_ids: ["reader", "reader"] } }), expected: "Agent Character 必须声明本项目本人范围、精确版本选择和已声明的角色" },
  { rule: "characters naming an undeclared role", agent: agentOf({ characters: { selection: "optional-exact-artifact", scope: "project-owner", role_ids: ["nowhere"] } }), expected: "Agent Character 必须声明本项目本人范围、精确版本选择和已声明的角色" },
  { rule: "conforming characters", agent: agentOf({ characters: { selection: "optional-exact-artifact", scope: "project-owner", role_ids: ["reader"] } }), expected: "" },
  { rule: "a compaction prompt that is not declared", agent: agentOf({ compaction: { prompt_id: "nowhere", above_tokens: 1000 } }), expected: "Agent 压缩 Prompt nowhere 未声明" },
  { rule: "a compaction threshold of 0", agent: agentOf({ compaction: { prompt_id: "reader", above_tokens: 0 } }), expected: "Agent 压缩阈值无效" },
  { rule: "a skill with a bad id", agent: agentOf({ skills: [{ skill_id: "Bad", version: 1, name: "Bad", summary: "x", tools: ["t"] }] }), expected: "Agent 方法声明不合法" },
  { rule: "a skill twice", agent: agentOf({ skills: [method(), method()] }), expected: "Agent 方法重复：summarize" },
  { rule: "a skill without tools", agent: agentOf({ skills: [method({ tools: [] })] }), expected: "Agent 方法 summarize 必须声明可用工具" },
  { rule: "a sub-Agent parent that is not a declared role", agent: withChild({}, { subagents: { parent_role_ids: ["nowhere"], roles: [] } }), expected: "子 Agent 父角色 nowhere 未声明" },
  { rule: "a sub-Agent role with a bad id", agent: withChild({ role_id: "Bad" }), expected: "子 Agent 角色声明不合法" },
  { rule: "a sub-Agent role twice", agent: agentOf({ prompts: [readerPrompt, { prompt_id: "child", version: 1 }], subagents: { parent_role_ids: ["reader"], roles: [TASK_DELEGATE, TASK_DELEGATE] } }), expected: "子 Agent 角色重复：child" },
  { rule: "a sub-Agent role without a prompt of its id", agent: agentOf({ subagents: { parent_role_ids: ["reader"], roles: [TASK_DELEGATE] } }), expected: "子 Agent 角色 child 没有对应 Prompt 声明" },
  { rule: "a sub-Agent role naming a parent the block did not register", agent: withChild({ parent_role_ids: ["other"] }), expected: "子 Agent 角色 child 引用了未登记的父角色 other" },
  { rule: "a sub-Agent that writes under a parent without own directories", agent: withChild({ execution: "workspace-write" }), expected: "可写子 Agent child 只能属于要求独立子目录的父角色" },
  { rule: "a sub-Agent that writes under a parent with own directories", agent: withChild({ execution: "workspace-write" }, { roles: [{ ...reader, subagent_workspaces: "required" }] }), expected: "" },
  { rule: "a sub-Agent that only runs commands", agent: withChild({ execution: "workspace-write", host_tools: ["read-file", "run-command"] }), expected: "" },
];

for (const { rule, agent, ports, expected } of AGENT_RULES) {
  test(`Agent declarations: ${rule}`, () => {
    assert.equal(manifestProblems(declarationManifest({ agent, ...(ports ? { ports } : {}), ...(ports ? { permissions: ARTIFACT_PERMISSIONS, artifacts: CONSUMES_INPUT, actions: [OUTPUT_PREVIEW] } : {}) })), expected);
  });
}

// ---- (c) several violations at once, across the whole Manifest ---------------------------------------------------------

test("Agent declarations: a block that breaks every segment reports them in the order of the checks", () => {
  const agent = {
    directory_input_port: "elsewhere",
    text_sources: [{ input_port: "nowhere", output_port: "text", artifact_type_id: "example.text", schema_version: 0 }],
    prompts: [{ prompt_id: "Bad", version: 1 }, { prompt_id: "reader", version: 1, layer: "task" }, { prompt_id: "reader", version: 1, layer: "system" }],
    roles: [{ ...reader, prompts: ["nowhere"], workspace: "none", execution: "text-edit" }, { role_id: "Bad2", version: 1, name: "Bad" }, reader],
    characters: { selection: "any", scope: "project-owner", role_ids: ["reader"] },
    compaction: { prompt_id: "nowhere", above_tokens: 0 },
    skills: [method({ skill_id: "tooling", tools: [] })],
    subagents: { parent_role_ids: ["nowhere"], roles: [{ ...TASK_DELEGATE, parent_role_ids: ["other"] }] },
  };
  assert.equal(manifestProblems(declarationManifest({ agent })), [
    "Agent 的 directory_input_port elsewhere 不是已声明输入端口",
    "Agent 文本来源引用了未声明输入端口 nowhere",
    "Agent 文本来源 nowhere 的 schema_version 无效",
    "角色 reader 引用了未声明的 Prompt nowhere",
    "Agent Prompt 声明不合法",
    "Agent Prompt reader 不能声明为 task 层：任务是用户这一次写的",
    "Agent Prompt 重复：reader",
    "Agent Prompt reader 的层级不合法：system",
    "无工作区角色 reader 必须为不使用工具或子任务的只读推理",
    "Agent 角色声明不合法",
    "Agent 角色重复：reader",
    "Agent Character 必须声明本项目本人范围、精确版本选择和已声明的角色",
    "Agent 压缩 Prompt nowhere 未声明",
    "Agent 压缩阈值无效",
    "Agent 方法 tooling 必须声明可用工具",
    "子 Agent 父角色 nowhere 未声明",
    "子 Agent 角色 child 没有对应 Prompt 声明",
    "子 Agent 角色 child 引用了未登记的父角色 other",
  ].join(SEPARATOR));
});

test("Manifest declarations: a v2 Manifest that breaks every section reports them in the order the sections are checked", () => {
  const broken = declarationManifest({
    actions: [defined({ permissions: ["storage:private"], result_scene: { scene_id: "example.review" } })],
    action_scenes: [scene({ permissions: ["a:one"], configuration_permissions: ["c:two"] })],
    ports: { inputs: [{ port: "Bad Name", ...INPUT_TYPE }], outputs: [] },
    events: { publishes: [{ event_type_id: "host.stopped", type_version: 1 }] },
    agent: { roles: [], prompts: [] },
    methods: {},
    ui: uiOf({ contributions: [] }),
    routes: [route({ method: "TRACE" })],
    requires: [requirement()],
  });
  assert.equal(manifestProblems(broken), [
    `能力 ${KEY} 的结果场景引用无效`,
    "能力 example.read 使用未声明权限 storage:private",
    "场景 example.review 使用未声明权限 a:one",
    "场景 example.review 使用未声明权限 c:two",
    "输入端口名不合法",
    "不能发布宿主保留事件 host.stopped",
    "Agent 至少需要一个角色",
    "方法声明必须是列表",
    `视图 main 的 contribution ${NAMESPACE}.main 未在 ui.contributions 声明`,
    "路由 example.list 的方法不合法",
    "依赖 projects.read.v1@1 未列入 capabilities.consumes",
    "声明了输入端口就必须声明 artifact:read 权限",
    "输入端口 Bad Name 的类型 example.input@1 没有列入 artifacts.consumes 或 process_items.consumes",
  ].join(SEPARATOR));
});

// ---- (b) v1 Manifests may not carry v2 blocks -----------------------------------------------------------------------------

type V1Manifest = Record<string, unknown> & { ui: Record<string, unknown> };
const V1_BLOCKS: ReadonlyArray<readonly [string, (manifest: V1Manifest) => void]> = [
  ["ports", manifest => { manifest.ports = { inputs: [], outputs: [] }; }],
  ["events", manifest => { manifest.events = {}; }],
  ["routes", manifest => { manifest.routes = []; }],
  ["requires", manifest => { manifest.requires = []; }],
  ["agent", manifest => { manifest.agent = { roles: [], prompts: [] }; }],
  ["actions", manifest => { manifest.actions = []; }],
  ["action_scenes", manifest => { manifest.action_scenes = []; }],
  ["ui.embedded_plugins", manifest => { manifest.ui.embedded_plugins = ["io.molis.work.other"]; }],
  ["ui.views", manifest => { manifest.ui.views = []; }],
];

function v1Manifest(): V1Manifest {
  return { ...declarationManifest(), ui: { contributions: [] }, schema_version: 1, host_api_version: 1 };
}

test("a v1 Manifest is refused for each v2 block, naming the first block it carries", () => {
  for (const [name, add] of V1_BLOCKS) {
    const manifest = v1Manifest();
    add(manifest);
    assert.equal(manifestProblems(manifest), `${name} 需要 schema_version 2；请递增 Manifest 版本而不是混用`, name);
  }
  assert.equal(manifestProblems(v1Manifest()), "");
  // With every block present the first in the list is named; take them away one by one and the next one is.
  const everything = v1Manifest();
  for (const [, add] of V1_BLOCKS) add(everything);
  for (const [name] of V1_BLOCKS) {
    const [field, nested] = name.split(".");
    assert.equal(manifestProblems(everything), `${name} 需要 schema_version 2；请递增 Manifest 版本而不是混用`);
    if (nested) delete everything.ui[nested]; else delete everything[field!];
  }
  assert.equal(manifestProblems(everything), "");
});

test("a Manifest of either version that still declares ui.commands is refused: nothing calls them any more (BL-363)", () => {
  for (const manifest of [v1Manifest(), { ...declarationManifest({}), ui: { contributions: [] } } as V1Manifest]) {
    manifest.ui.commands = [];
    assert.match(manifestProblems(manifest), /^ui\.commands 已取消/);
  }
});

// ---- (e) the shape checks that run before any declaration is read ---------------------------------------------------------

/** A background job the fixture Manifest may declare: it names no permission, since the fixture declares none. */
const JOB = { job_id: "follow", reason: "Follow what was accepted", permissions: [] };
type ManifestCode = "plugin.manifest_invalid" | "plugin.entrypoint_missing" | "plugin.permission_invalid" | "plugin.declaration_invalid";
const SHAPE_RULES: ReadonlyArray<{ rule: string; input: unknown; code: ManifestCode; message: string }> = [
  { rule: "not an object", input: null, code: "plugin.manifest_invalid", message: "Manifest 必须为对象" },
  { rule: "an array", input: [], code: "plugin.manifest_invalid", message: "Manifest 必须为对象" },
  { rule: "no publisher", input: declarationManifest({ publisher: undefined }), code: "plugin.manifest_invalid", message: "publisher 必须为对象" },
  { rule: "schema_version 3", input: declarationManifest({ schema_version: 3, host_api_version: 3 }), code: "plugin.manifest_invalid", message: "Plugin Manifest schema_version 必须是 1 或 2，且 host_api_version 与之相同" },
  { rule: "a host_api_version that differs", input: declarationManifest({ host_api_version: 1 }), code: "plugin.manifest_invalid", message: "Plugin Manifest schema_version 必须是 1 或 2，且 host_api_version 与之相同" },
  { rule: "a plugin id outside the namespace", input: declarationManifest({ plugin_id: "io.example.thing" }), code: "plugin.manifest_invalid", message: "Plugin Manifest 身份、名称、类型或版本不合法" },
  { rule: "a version that is not SemVer", input: declarationManifest({ version: "1.0" }), code: "plugin.manifest_invalid", message: "Plugin Manifest 身份、名称、类型或版本不合法" },
  { rule: "a numeric prerelease with a leading zero", input: declarationManifest({ version: "1.0.0-01" }), code: "plugin.manifest_invalid", message: "Plugin Manifest 身份、名称、类型或版本不合法" },
  { rule: "a blank name", input: declarationManifest({ name: " " }), code: "plugin.manifest_invalid", message: "Plugin Manifest 身份、名称、类型或版本不合法" },
  { rule: "an empty signature", input: declarationManifest({ publisher: { publisher_id: "molis", signature: "" } }), code: "plugin.manifest_invalid", message: "Plugin Manifest 身份、名称、类型或版本不合法" },
  { rule: "an unknown kind", input: declarationManifest({ kind: "service" }), code: "plugin.manifest_invalid", message: "Plugin Manifest 身份、名称、类型或版本不合法" },
  { rule: "an app on schema_version 1", input: declarationManifest({ kind: "app", schema_version: 1, host_api_version: 1 }), code: "plugin.manifest_invalid", message: "app Plugin 必须使用 schema_version 2" },
  { rule: "no entrypoint", input: declarationManifest({ entrypoints: [] }), code: "plugin.entrypoint_missing", message: "Plugin 至少需要一个 entrypoint" },
  { rule: "an entrypoint for an unknown deployment", input: declarationManifest({ entrypoints: [{ deployment: "edge", entrypoint: "./entry.mjs" }] }), code: "plugin.entrypoint_missing", message: "同一部署环境只能声明一个有效 entrypoint" },
  { rule: "two entrypoints for one deployment", input: declarationManifest({ entrypoints: [{ deployment: "local", entrypoint: "./a.mjs" }, { deployment: "local", entrypoint: "./b.mjs" }] }), code: "plugin.entrypoint_missing", message: "同一部署环境只能声明一个有效 entrypoint" },
  { rule: "permissions that are not a list", input: declarationManifest({ permissions: {} }), code: "plugin.permission_invalid", message: "Plugin permissions 必须为数组" },
  { rule: "a permission without a reason", input: declarationManifest({ permissions: [{ permission: "artifact:read", required: true }] }), code: "plugin.permission_invalid", message: "Plugin permission 必须唯一并说明用途及是否必需" },
  { rule: "a permission whose required is not a boolean", input: declarationManifest({ permissions: [{ permission: "artifact:read", required: "yes", reason: "x" }] }), code: "plugin.permission_invalid", message: "Plugin permission 必须唯一并说明用途及是否必需" },
  { rule: "a permission twice", input: declarationManifest({ permissions: [ARTIFACT_PERMISSIONS[0], ARTIFACT_PERMISSIONS[0]] }), code: "plugin.permission_invalid", message: "Plugin permission 必须唯一并说明用途及是否必需" },
  { rule: "surface:browser without origins", input: declarationManifest({ permissions: [{ permission: "surface:browser", required: false, reason: "Show a site" }] }), code: "plugin.permission_invalid", message: "surface:browser 的 origins 必须列出完整的网站来源（如 https://example.com），不带路径、查询串或片段" },
  { rule: "surface:browser with an origin that has a path", input: declarationManifest({ permissions: [{ permission: "surface:browser", required: false, reason: "Show a site", origins: ["https://example.com/docs"] }] }), code: "plugin.permission_invalid", message: "surface:browser 的 origins 必须列出完整的网站来源（如 https://example.com），不带路径、查询串或片段" },
  { rule: "origins on another permission", input: declarationManifest({ permissions: [{ ...ARTIFACT_PERMISSIONS[0], origins: ["https://example.com"] }] }), code: "plugin.permission_invalid", message: "只有 surface:browser 可以列出 origins" },
  { rule: "no capabilities object", input: declarationManifest({ capabilities: undefined }), code: "plugin.manifest_invalid", message: "capabilities 必须为对象" },
  { rule: "capabilities.provides that is not a list of strings", input: declarationManifest({ capabilities: { provides: "x", consumes: [] } }), code: "plugin.manifest_invalid", message: "capabilities.provides 必须为非空字符串数组（可为空数组）" },
  { rule: "capabilities.consumes with a blank entry", input: declarationManifest({ capabilities: { provides: [], consumes: [" "] } }), code: "plugin.manifest_invalid", message: "capabilities.consumes 必须为非空字符串数组（可为空数组）" },
  { rule: "artifacts.produces that is not a list", input: declarationManifest({ artifacts: { produces: "x", consumes: [] } }), code: "plugin.manifest_invalid", message: "artifacts.produces 必须为数组" },
  { rule: "an artifact type without an id", input: declarationManifest({ artifacts: { produces: [{ schema_version: 1 }], consumes: [] } }), code: "plugin.manifest_invalid", message: "类型必须声明 type ID 与正整数 schema_version" },
  { rule: "an artifact type with schema_version 0", input: declarationManifest({ artifacts: { produces: [], consumes: [{ artifact_type_id: "example.input", schema_version: 0 }] } }), code: "plugin.manifest_invalid", message: "类型必须声明 type ID 与正整数 schema_version" },
  { rule: "process_items that are not an object", input: declarationManifest({ process_items: "x" }), code: "plugin.manifest_invalid", message: "process_items 必须为对象" },
  { rule: "a process item type with schema_version 0", input: declarationManifest({ process_items: { produces: [{ artifact_type_id: "example.item", schema_version: 0 }], consumes: [] } }), code: "plugin.manifest_invalid", message: "类型必须声明 type ID 与正整数 schema_version" },
  { rule: "ui that is not an object", input: declarationManifest({ ui: "x" }), code: "plugin.manifest_invalid", message: "ui 必须为对象" },
  { rule: "ui.contributions that is not a list of strings", input: declarationManifest({ ui: { contributions: [1] } }), code: "plugin.manifest_invalid", message: "ui.contributions 必须为非空字符串数组（可为空数组）" },
  { rule: "embedded plugins naming itself", input: declarationManifest({ ui: { contributions: [], embedded_plugins: [DECLARATION_PLUGIN_ID] } }), code: "plugin.manifest_invalid", message: "ui.embedded_plugins 必须为不含自身、重复项或首尾空白的 Plugin ID" },
  { rule: "embedded plugins listing one twice", input: declarationManifest({ ui: { contributions: [], embedded_plugins: ["io.molis.work.other", "io.molis.work.other"] } }), code: "plugin.manifest_invalid", message: "ui.embedded_plugins 必须为不含自身、重复项或首尾空白的 Plugin ID" },
  { rule: "embedded plugins naming something that is not a plugin id", input: declarationManifest({ ui: { contributions: [], embedded_plugins: ["other"] } }), code: "plugin.manifest_invalid", message: "ui.embedded_plugins 必须为不含自身、重复项或首尾空白的 Plugin ID" },
  { rule: "background that is not an object", input: declarationManifest({ background: [] }), code: "plugin.declaration_invalid", message: "background 必须为对象" },
  { rule: "background with a field it does not know", input: declarationManifest({ background: { jobs: [JOB], extra: 1 } }), code: "plugin.declaration_invalid", message: "background 不认这些字段：extra" },
  { rule: "background without jobs", input: declarationManifest({ background: { jobs: [] } }), code: "plugin.declaration_invalid", message: "background.jobs 或 background.wakeups 至少要声明一项" },
  { rule: "a job_id that is not a lowercase name", input: declarationManifest({ background: { jobs: [{ ...JOB, job_id: "Follow" }] } }), code: "plugin.declaration_invalid", message: "后台作业的 job_id 必须是小写字母开头、只含小写字母、数字和连字符的名字" },
  { rule: "a job declared twice", input: declarationManifest({ background: { jobs: [JOB, JOB] } }), code: "plugin.declaration_invalid", message: "后台作业重复：follow" },
  { rule: "a job with a field it does not know", input: declarationManifest({ background: { jobs: [{ ...JOB, schedule: "hourly" }] } }), code: "plugin.declaration_invalid", message: "后台作业 follow 不认这些字段：schedule" },
  { rule: "a job without a reason", input: declarationManifest({ background: { jobs: [{ ...JOB, reason: " " }] } }), code: "plugin.declaration_invalid", message: "后台作业 follow 要写明用途（reason）" },
  { rule: "a job whose permissions are not strings", input: declarationManifest({ background: { jobs: [{ ...JOB, permissions: [1] }] } }), code: "plugin.declaration_invalid", message: "后台作业 follow 的 permissions 必须为字符串数组" },
  { rule: "a job naming a permission the Manifest does not declare", input: declarationManifest({ background: { jobs: [{ ...JOB, permissions: ["storage:private"] }] } }), code: "plugin.declaration_invalid", message: "后台作业 follow 使用未声明权限 storage:private" },
  { rule: "a declaration problem is its own code", input: declarationManifest({ routes: [route({ method: "TRACE" })] }), code: "plugin.declaration_invalid", message: "路由 example.list 的方法不合法" },
];

function parseFailure(input: unknown): { code: string; message: string } | null {
  try { parsePluginManifest(input); return null; }
  catch (error) {
    if ((error instanceof ActionError && ["plugin.manifest_invalid","plugin.entrypoint_missing","plugin.permission_invalid","plugin.declaration_invalid"].includes(error.code) && error.kind === "invalid")) return { code: error.code, message: error.message };
    throw error;
  }
}

for (const { rule, input, code, message } of SHAPE_RULES) {
  test(`Manifest shape: ${rule}`, () => {
    assert.deepEqual(parseFailure(input), { code, message });
  });
}

test("Manifest shape: a v2 Manifest with every optional block spelled out parses and comes back as the same value", () => {
  const input = declarationManifest({
    permissions: [...ARTIFACT_PERMISSIONS, { permission: "surface:browser", required: false, reason: "Show a site", origins: ["https://example.com", "http://localhost:3000"] }],
    artifacts: CONSUMES_INPUT, actions: [OUTPUT_PREVIEW], process_items: { produces: [], consumes: [] }, ports: portsOf(),
    ui: { contributions: [], embedded_plugins: ["io.molis.work.other"] },
  });
  assert.equal(manifestProblems(input), "");
  assert.deepEqual(parsePluginManifest(input), input);
});

// ---- (e) upgrade sources are ordered by SemVer precedence: the rule `comparePluginVersions` decides -----------------------

const UPGRADE_NEEDS_EARLIER = "升级来源版本必须早于当前 Manifest 版本";
const UPGRADE_BAD_SOURCE = "升级来源必须是不重复的精确 SemVer；每个来源只能声明为兼容或可迁移之一";
const UPGRADES: ReadonlyArray<{ rule: string; version: string; compatibility: unknown; message: string | null }> = [
  { rule: "an earlier release", version: "1.0.0", compatibility: { compatible_from_versions: ["0.9.0"] }, message: null },
  { rule: "numeric parts compared as numbers", version: "1.0.0", compatibility: { compatible_from_versions: ["0.9.0", "0.10.0"], migratable_from_versions: ["0.2.0"] }, message: null },
  { rule: "a core part past the safe integer range", version: "1.0.0", compatibility: { compatible_from_versions: ["0.0.99999999999999999999"] }, message: null },
  { rule: "the next major above ten", version: "10.0.0", compatibility: { compatible_from_versions: ["9.0.0"] }, message: null },
  { rule: "a prerelease before its release", version: "1.0.0", compatibility: { compatible_from_versions: ["1.0.0-rc.1"] }, message: null },
  { rule: "the release as a source of its own prerelease", version: "1.0.0-rc.1", compatibility: { compatible_from_versions: ["1.0.0"] }, message: UPGRADE_NEEDS_EARLIER },
  { rule: "prerelease identifiers compared as text", version: "1.0.0-rc.1", compatibility: { compatible_from_versions: ["1.0.0-beta.11"] }, message: null },
  { rule: "prerelease identifiers that are numbers compared as numbers", version: "1.0.0-beta.10", compatibility: { compatible_from_versions: ["1.0.0-beta.2"] }, message: null },
  { rule: "the larger number as a source", version: "1.0.0-beta.2", compatibility: { compatible_from_versions: ["1.0.0-beta.10"] }, message: UPGRADE_NEEDS_EARLIER },
  { rule: "a numeric identifier before a text one", version: "1.0.0-alpha", compatibility: { compatible_from_versions: ["1.0.0-1"] }, message: null },
  { rule: "the longer prerelease as a source", version: "1.0.0-beta", compatibility: { compatible_from_versions: ["1.0.0-beta.1"] }, message: UPGRADE_NEEDS_EARLIER },
  { rule: "the shorter prerelease as a source", version: "1.0.0-beta.1", compatibility: { compatible_from_versions: ["1.0.0-beta"] }, message: null },
  { rule: "build metadata ignored: the same release is not earlier", version: "1.0.0+build.2", compatibility: { compatible_from_versions: ["1.0.0"] }, message: UPGRADE_NEEDS_EARLIER },
  { rule: "the later release", version: "1.0.0", compatibility: { compatible_from_versions: ["1.0.1"] }, message: UPGRADE_NEEDS_EARLIER },
  { rule: "the same version, directly compatible", version: "1.0.0", compatibility: { compatible_from_versions: ["1.0.0"] }, message: null },
  { rule: "the same version, to be migrated", version: "1.0.0", compatibility: { migratable_from_versions: ["1.0.0"] }, message: "同版本 Manifest 只能声明为直接兼容，不能声明为可迁移" },
  { rule: "a source that is not an exact SemVer", version: "1.0.0", compatibility: { compatible_from_versions: ["0.9"] }, message: UPGRADE_BAD_SOURCE },
  { rule: "a source that is not a string", version: "1.0.0", compatibility: { compatible_from_versions: [9] }, message: UPGRADE_BAD_SOURCE },
  { rule: "a source listed twice", version: "1.0.0", compatibility: { compatible_from_versions: ["0.9.0", "0.9.0"] }, message: UPGRADE_BAD_SOURCE },
  { rule: "a source both compatible and migratable", version: "1.0.0", compatibility: { compatible_from_versions: ["0.9.0"], migratable_from_versions: ["0.9.0"] }, message: UPGRADE_BAD_SOURCE },
  { rule: "sources that are not a list", version: "1.0.0", compatibility: { compatible_from_versions: "0.9.0" }, message: "upgrade_compatibility.compatible_from_versions 必须为数组" },
  { rule: "migratable sources that are not a list", version: "1.0.0", compatibility: { migratable_from_versions: {} }, message: "upgrade_compatibility.migratable_from_versions 必须为数组" },
  { rule: "no source at all", version: "1.0.0", compatibility: {}, message: "upgrade_compatibility 至少要声明一个兼容或可迁移来源版本" },
  { rule: "the declaration is not an object", version: "1.0.0", compatibility: "0.9.0", message: "upgrade_compatibility 必须为对象" },
];

for (const { rule, version, compatibility, message } of UPGRADES) {
  test(`upgrade compatibility: ${rule}`, () => {
    const failure = parseFailure(declarationManifest({ version, upgrade_compatibility: compatibility }));
    assert.deepEqual(failure, message === null ? null : { code: "plugin.manifest_invalid", message });
  });
}
