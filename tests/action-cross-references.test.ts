import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
// W3-05-1: the cross-reference checks on a group of action declarations (`inspectActionCrossReferences`, plugin SDK). A declaration
// that points at another action (undo, background job, fragment and subject options) or into its own output (the result object)
// is held to what it points at: the target is in the same registration, is the kind of action the pointer needs, is in the same
// scope, and the places named inside an input or an output are in the schema. Each rule has a group that passes and a group that
// breaks only that rule; what an author is told is written out in full, so a rule that is dropped or reworded fails here.
// The tests after the rule table show where the pass runs: a registration with the Kernel, and a Manifest when it is parsed, which is
// also how a plugin is installed and defined. The last test sweeps every bundled Manifest.
import assert from "node:assert/strict";
import test from "node:test";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import {
  ActionError, FRAGMENT_ANY_OBJECT, defineFragmentOffersAction, defineSubjectOffersAction,
  type ActionDefinition, type FragmentOfferChoice, type SubjectOfferChoice,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { inspectActionCrossReferences, inspectActionDeclarations, parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { declarationManifest, manifestProblems } from "./fixtures/declaration-manifest.js";

type Part = Record<string, unknown>;

/** A definition that passes every rule on its own; `over` replaces fields of its `action`, `top` those of the definition. */
function defined(id: string, operation: "command" | "query", over: Part = {}, top: Part = {}): Part {
  return {
    capability_id: id, version: 1, operation,
    action: { title: id, description: id, kind: operation === "query" ? "query" : "operation", scope: "project", permissions: [], subject_kinds: [],
      audiences: ["user"], input_schema: { type: "object" }, ...over },
    ...top,
  };
}

const ID = { type: "string" };
const NOTE_OUTPUT = { type: "object", properties: { note: { type: "object", properties: { id: ID, version: { type: "integer" } } } } };
const REMOVE_INPUT = { type: "object", properties: { note_id: ID }, required: ["note_id"] };
const undo = (over: Part = {}) => ({ capability_id: "notes.remove", version: 1, input: { note_id: "note.id" }, ...over });
const add = (over: Part = {}) => defined("notes.add", "command", { output_schema: NOTE_OUTPUT, undo: undo(), ...over });
const remove = (over: Part = {}, top: Part = {}) => defined("notes.remove", "command", { input_schema: REMOVE_INPUT, ...over }, top);

const JOB_OUTPUT = { type: "object", properties: { run: { type: "object", properties: { jobId: ID } } } };
const job = (over: Part = {}) => ({ status: { capability_id: "jobs.status", version: 1 }, id: "run.jobId", input: "id", state: "status", done: ["done"], failed: ["failed"], ...over });
const start = (over: Part = {}) => defined("jobs.start", "command", { output_schema: JOB_OUTPUT, background_job: job(), ...over });
const status = (over: Part = {}, top: Part = {}) => defined("jobs.status", "query", {
  input_schema: { type: "object", properties: { id: ID }, required: ["id"] }, output_schema: { type: "object", properties: { status: ID } }, ...over }, top);

const problems = (...definitions: unknown[]) => inspectActionCrossReferences(definitions);

// ---- undo ---------------------------------------------------------------------------------------------------------------------

test("an undo names another command of the same registration, fills its inputs from the output of the change, and a group that does is accepted", () => {
  assert.deepEqual(problems(add(), remove()), []);
  const many = defined("notes.remove-many", "command", { input_schema: { type: "object", properties: { ids: { type: "array", items: ID } }, required: ["ids"] } });
  assert.deepEqual(problems(add({ undo: undo({ capability_id: "notes.remove-many", input: { ids: ["note.id"] } }) }), many), [], "a one-item list wraps the value");
  assert.deepEqual(problems(add({ undo: undo({ capability_id: "notes.remove-many", input: { ids: ["note.key"] } }) }), many),
    ["能力 notes.add@1 的撤销输入位置 note.key 不在本次输出的合同里"], "the path inside the list is the one looked up");
  assert.deepEqual(problems(add({ undo: undo({ input: { note_id: "note.id", reason: "note.version" } }) }), remove({ input_schema: { ...REMOVE_INPUT, properties: { note_id: ID, reason: ID } } })), [],
    "an input the undo command takes but does not need may be filled");
});

test("an undo whose command is not in the group, or is the change itself, is refused", () => {
  assert.deepEqual(problems(add()), ["能力 notes.add@1 的撤销命令 notes.remove@1 不在同一提供方的声明里"]);
  assert.deepEqual(problems(add(), remove({}, { version: 2 })), ["能力 notes.add@1 的撤销命令 notes.remove@1 不在同一提供方的声明里"], "another version is another action");
  assert.deepEqual(problems(add({ undo: undo({ capability_id: "notes.add" }) })), ["能力 notes.add@1 的撤销命令不能是它自己"]);
});

test("an undo command that is a query, or lives in another scope, is refused", () => {
  assert.deepEqual(problems(add(), remove({ kind: "query" }, { operation: "query" })), ["能力 notes.add@1 的撤销命令 notes.remove@1 不是同一范围的命令"]);
  assert.deepEqual(problems(add(), remove({ scope: "home" })), ["能力 notes.add@1 的撤销命令 notes.remove@1 不是同一范围的命令"]);
});

test("an undo fills exactly the inputs its command takes: no field it does not take, none left out that it requires", () => {
  assert.deepEqual(problems(add({ undo: undo({ input: { note_id: "note.id", extra: "note.id" } }) }), remove()), ["能力 notes.add@1 的撤销输入字段 extra 不是 notes.remove@1 的输入"]);
  assert.deepEqual(problems(add(), remove({ input_schema: { ...REMOVE_INPUT, properties: { note_id: ID, version: ID }, required: ["note_id", "version"] } })),
    ["能力 notes.add@1 的撤销输入缺少 notes.remove@1 的必填输入 version"]);
  assert.deepEqual(problems(add({ undo: undo({ input: { note_id: "note.id" } }) }), remove({ input_schema: { type: "object" } })),
    ["能力 notes.add@1 的撤销输入字段 note_id 不是 notes.remove@1 的输入"], "an input that is not described is not an input");
});

test("the inputs an undo command takes and requires are read through its schema's branches: a branch's own requirement is no one's", () => {
  const branches = (required: boolean) => remove({ input_schema: { anyOf: [{ properties: { note_id: ID }, ...(required ? { required: ["note_id"] } : {}) }, { properties: { other: ID }, required: ["other"] }] } });
  assert.deepEqual(problems(add(), branches(true)), [], "a field of one branch is an input, and what only a branch requires is not required of every value");
  assert.deepEqual(problems(add({ undo: undo({ input: { other: "note.id" } }) }), branches(false)), []);
  const together = remove({ input_schema: { type: "object", allOf: [{ properties: { note_id: ID, reason: ID }, required: ["note_id", "reason"] }] } });
  assert.deepEqual(problems(add(), together), ["能力 notes.add@1 的撤销输入缺少 notes.remove@1 的必填输入 reason"], "what every branch of an allOf requires is required");
  const referenced = remove({ input_schema: { $ref: "#/definitions/input", definitions: { input: REMOVE_INPUT } } });
  assert.deepEqual(problems(add(), referenced), []);
  assert.deepEqual(problems(add({ undo: undo({ input: { extra: "note.id" } }) }), referenced),
    ["能力 notes.add@1 的撤销输入字段 extra 不是 notes.remove@1 的输入", "能力 notes.add@1 的撤销输入缺少 notes.remove@1 的必填输入 note_id"], "a reference is followed for both properties and requirements");
});

test("an undo reads its inputs from places the change's output declares", () => {
  const missing = "能力 notes.add@1 的撤销输入位置 note.id 不在本次输出的合同里";
  assert.deepEqual(problems(add({ output_schema: undefined }), remove()), [missing], "no output schema, nothing to read from");
  assert.deepEqual(problems(add({ output_schema: { type: "object" } }), remove()), [missing], "an open object declares no field");
  assert.deepEqual(problems(add({ output_schema: { type: "object", properties: { note: { type: "object", properties: { key: ID } } } } }), remove()), [missing]);
  assert.deepEqual(problems(add({ undo: undo({ input: { note_id: ["note.title"] } }) }), remove()), ["能力 notes.add@1 的撤销输入位置 note.title 不在本次输出的合同里"]);
});

// ---- background jobs ----------------------------------------------------------------------------------------------------------

test("a background job names a status query of the same registration that takes the job id and reports the state, and a group that does is accepted", () => {
  assert.deepEqual(problems(start(), status()), []);
});

test("a status query that is missing, is a command, or lives in another scope is refused", () => {
  const refused = "能力 jobs.start@1 的后台任务状态查询 jobs.status@1 不在同一提供方的声明里，或不是同一范围的查询";
  assert.deepEqual(problems(start()), [refused]);
  assert.deepEqual(problems(start(), status({ kind: "operation" }, { operation: "command" })), [refused]);
  assert.deepEqual(problems(start(), status({ scope: "home" })), [refused]);
});

test("the job id is read from the output of the command; the status query takes it in the named input and reports the state in the named output", () => {
  assert.deepEqual(problems(start({ output_schema: { type: "object", properties: { run: { type: "object" } } } }), status()), ["能力 jobs.start@1 的任务标识位置 run.jobId 不在本次输出的合同里"]);
  assert.deepEqual(problems(start({ background_job: job({ input: "job_id" }) }), status()), ["能力 jobs.start@1 的状态查询输入位置 job_id 不在 jobs.status@1 的输入合同里"]);
  assert.deepEqual(problems(start({ background_job: job({ state: "phase" }) }), status()), ["能力 jobs.start@1 的状态位置 phase 不在 jobs.status@1 的输出合同里"]);
  assert.deepEqual(problems(start(), status({ output_schema: undefined })), ["能力 jobs.start@1 的状态位置 status 不在 jobs.status@1 的输出合同里"]);
});

// ---- fragment and subject options ---------------------------------------------------------------------------------------------

const fragmentChoice: FragmentOfferChoice = { offer_id: "make", title: "Make", intent: "organize", apply: "record", hint: "Make something", action: { capability_id: "notes.make", version: 1 } };
const fragments = (...choices: FragmentOfferChoice[]) => defineFragmentOffersAction("notes.fragments", [FRAGMENT_ANY_OBJECT], "Fragments", [], choices);
const subjectChoice: SubjectOfferChoice = { offer_id: "open", title: "Open", action: { capability_id: "notes.open", version: 1 } };
const subjects = (...choices: SubjectOfferChoice[]) => defineSubjectOffersAction("notes.offers", ["note"], "Offers", [], choices);

test("each fragment option points at an action of the same registration and scope", () => {
  const make = defined("notes.make", "command");
  assert.deepEqual(problems(fragments(fragmentChoice), make), []);
  const refused = "能力 notes.fragments@1 的片段选项 make 的目标动作 notes.make@1 不在同一提供方的声明里，或范围不同";
  assert.deepEqual(problems(fragments(fragmentChoice)), [refused]);
  assert.deepEqual(problems(fragments(fragmentChoice), defined("notes.make", "command", { scope: "home" })), [refused]);
  assert.deepEqual(problems(fragments(fragmentChoice, { ...fragmentChoice, offer_id: "second", action: { capability_id: "notes.other", version: 1 } }), make),
    ["能力 notes.fragments@1 的片段选项 second 的目标动作 notes.other@1 不在同一提供方的声明里，或范围不同"], "every option is read");
});

test("each subject option points at an action of the same registration and scope that handles the option's subject kinds", () => {
  const open = defined("notes.open", "command", { subject_kinds: ["note"] });
  assert.deepEqual(problems(subjects(subjectChoice), open), []);
  const refused = "能力 notes.offers@1 的事项选项 open 的目标动作 notes.open@1 不在同一提供方的声明里，或范围不同";
  assert.deepEqual(problems(subjects(subjectChoice)), [refused]);
  assert.deepEqual(problems(subjects(subjectChoice), defined("notes.open", "command", { subject_kinds: ["note"], scope: "home" })), [refused]);
  const unsupported = "能力 notes.offers@1 的事项选项 open 的目标动作 notes.open@1 不支持声明的事项类型";
  assert.deepEqual(problems(subjects(subjectChoice), defined("notes.open", "command", { subject_kinds: ["page"] })), [unsupported]);
  assert.deepEqual(problems(subjects(subjectChoice), defined("notes.open", "command", { subject_kinds: [] })), [], "a target that names no kinds handles any");
  assert.deepEqual(problems(subjects({ ...subjectChoice, subject_kinds: ["note"] }), defined("notes.open", "command", { subject_kinds: ["note", "page"] })), [], "it may handle more");
});

test("a subject option offered for fewer kinds than its query is held to those kinds", () => {
  const query = defined("notes.offers", "query", { subject_kinds: ["note", "page"], subject_offer_choices: [{ ...subjectChoice, subject_kinds: ["page"] }] });
  assert.deepEqual(problems(query, defined("notes.open", "command", { subject_kinds: ["page"] })), []);
  assert.deepEqual(problems(query, defined("notes.open", "command", { subject_kinds: ["note"] })),
    ["能力 notes.offers@1 的事项选项 open 的目标动作 notes.open@1 不支持声明的事项类型"]);
});

test("a subject option offered for kinds its query does not have is the shape check's to report, not reported again here", () => {
  const open = defined("notes.open", "command", { subject_kinds: ["page"] });
  assert.deepEqual(problems(subjects({ ...subjectChoice, subject_kinds: ["undeclared-kind"] }), open), []);
  assert.deepEqual(problems(subjects({ ...subjectChoice, subject_kinds: [] }), open), []);
  assert.deepEqual(problems(subjects({ ...subjectChoice, subject_kinds: "note" as never }), open), []);
  assert.deepEqual(problems(defined("notes.offers", "query", { subject_kinds: "note", subject_offer_choices: [subjectChoice] }), open), []);
});

// ---- the result object --------------------------------------------------------------------------------------------------------

const subject = (resultSubject: unknown, over: Part = {}) => defined("notes.save", "command", { output_schema: NOTE_OUTPUT, result_subject: resultSubject, ...over });

test("a result object is read from places the output declares", () => {
  assert.deepEqual(problems(subject({ id: "note.id" })), []);
  assert.deepEqual(problems(subject({ id: "note.id", revision: "note.version" })), []);
  assert.deepEqual(problems(subject({ id: "note.key" })), ["能力 notes.save@1 的结果对象位置 note.key 不在输出合同里"]);
  assert.deepEqual(problems(subject({ id: "note.id", revision: "note.rev" })), ["能力 notes.save@1 的结果对象位置 note.rev 不在输出合同里"]);
  assert.deepEqual(problems(subject({ id: "note.key", revision: "note.rev" })), ["能力 notes.save@1 的结果对象位置 note.key 不在输出合同里", "能力 notes.save@1 的结果对象位置 note.rev 不在输出合同里"]);
  assert.deepEqual(problems(subject({ id: "note.id" }, { output_schema: undefined })), ["能力 notes.save@1 的结果对象位置 note.id 不在输出合同里"], "no output schema declares nothing");
  assert.deepEqual(problems(subject({ revision: "note.version" })), ["能力 notes.save@1 的结果对象位置必须写成输出里的路径"]);
  assert.deepEqual(problems(subject({ id: "note.id", revision: 3 })), ["能力 notes.save@1 的结果对象位置必须写成输出里的路径"]);
});

test("a result object that is not an object is refused, whatever it is: nothing else reports it, and at use the string would stop the Assistant after the change was made", () => {
  const notAnObject = "能力 notes.save@1 的结果对象声明必须是对象，写明 id（可加 revision）在输出里的路径";
  for (const declared of ["note.id", "", true, false, 0, 3, ["note.id"], []]) assert.deepEqual(problems(subject(declared)), [notAnObject], JSON.stringify(declared));
  for (const absent of [undefined, null]) assert.deepEqual(problems(subject(absent)), [], `${absent}: not declared`);
  assert.deepEqual(problems(subject("note.id", { output_schema: undefined })), [notAnObject], "an output the declaration could not be found in does not add a second problem");
  assert.deepEqual(problems(subject("note.id", { title: "" })), [notAnObject], "it is reported with the body incomplete too: the shape check reports the body, not this");
});

test("a path is found through properties, branches and references inside the schema, and only there", () => {
  const found = (schema: unknown) => problems(subject({ id: "note.id" }, { output_schema: schema }));
  const note = { type: "object", properties: { id: ID } };
  assert.deepEqual(found({ anyOf: [{ type: "null" }, { type: "object", properties: { note } }] }), []);
  assert.deepEqual(found({ oneOf: [{ type: "object", properties: { note } }] }), []);
  assert.deepEqual(found({ allOf: [{ type: "object" }, { properties: { note } }] }), []);
  assert.deepEqual(found({ type: "object", properties: { note: { $ref: "#/definitions/note" } }, definitions: { note } }), []);
  assert.deepEqual(found({ type: "object", properties: { note: { $ref: "#/$defs/note" } }, $defs: { note } }), []);
  assert.deepEqual(found({ type: "object", properties: { note: { anyOf: [{ $ref: "#/$defs/note" }] } }, $defs: { note } }), []);
  assert.deepEqual(found({ $ref: "#/definitions/root", definitions: { root: { type: "object", properties: { note } } } }), []);
  assert.deepEqual(found({ type: "object", properties: { note: { $ref: "#/properties/other" }, other: note } }), [], "a pointer into the schema's own properties");
  assert.deepEqual(found({ type: "object", properties: { id: ID, note: { $ref: "#" } } }), [], "a schema that contains itself");
  assert.deepEqual(found({ type: "object", properties: { note: { $ref: "#/definitions/wrapper/properties/note" } }, definitions: { wrapper: { properties: { note } } } }), [], "a pointer of several steps");
  assert.deepEqual(found({ type: "object", properties: { note: { $ref: "#/definitions/a~1b" } }, definitions: { "a/b": note } }), [], "~1 is a slash in a pointer");
  assert.deepEqual(found({ type: "object", properties: { note: { $ref: "#/definitions/a~0b" } }, definitions: { "a~b": note } }), [], "~0 is a tilde");
  assert.deepEqual(found({ type: "object", properties: { note: { $ref: "#/definitions/a%20b" } }, definitions: { "a b": note } }), [], "a pointer in a URI is percent-decoded");
  const missing = ["能力 notes.save@1 的结果对象位置 note.id 不在输出合同里"];
  assert.deepEqual(found({ type: "object", properties: { note: { $ref: "other.json#/note" } } }), missing, "another document is not followed");
  assert.deepEqual(found({ type: "object", properties: { note: { $ref: "#/definitions/absent" } } }), missing);
  assert.deepEqual(found({ type: "object", properties: { note: { $ref: "#/definitions/%zz" } } }), missing, "a pointer that cannot be decoded names nothing");
  assert.deepEqual(found({ type: "object", patternProperties: { "^n": note } }), missing);
  assert.deepEqual(found({ type: "object", additionalProperties: note }), missing);
  assert.deepEqual(found({ type: "object", properties: { note: { type: "string" } } }), missing, "a leaf has no fields");
  assert.deepEqual(found({ $ref: "#", type: "object" }), missing, "a reference to itself ends");
  assert.deepEqual(found({ anyOf: [{ $ref: "#/anyOf/0" }] }), missing, "a reference loop ends");
});

// ---- shapes this pass leaves to the shape checks ----------------------------------------------------------------------------

test("a definition or a reference that is incomplete is skipped, never reported here or thrown on", () => {
  for (const whole of [undefined, null, 5, "actions", {}, [], [null, 5, "x", [], {}], [{ capability_id: "a", version: 1 }], [{ capability_id: "a", version: 1, action: 7 }],
    [{ capability_id: "a", version: 0, action: {} }], [{ capability_id: "bad id!", version: 1, action: {} }]]) {
    assert.deepEqual(inspectActionCrossReferences(whole), []);
  }
  const incomplete: Part[] = [
    add({ undo: undo({ input: {} }) }), add({ undo: undo({ input: { note_id: "not a path" } }) }), add({ undo: undo({ capability_id: 7 }) }),
    add({ undo: undo({ version: "1" }) }), add({ undo: "notes.remove" }), add({ undo: undo({ input: [] }) }), add({ undo: undo({ input: { note_id: ["a.b", "c.d"] } }) }),
    { ...add(), operation: "query" },
    start({ background_job: job({ status: "jobs.status" }) }), start({ background_job: job({ id: 7 }) }), start({ background_job: job({ input: "not a path" }) }),
    start({ background_job: job({ state: undefined }) }), { ...start(), operation: "query" },
    defined("notes.offers", "query", { fragment_offer_choices: "all", subject_offer_choices: [null, 5, {}, { offer_id: "x" }, { offer_id: "x", action: {} }, { offer_id: "x", action: { capability_id: "a" } }, { action: { capability_id: "a", version: 1 } }] }),
  ];
  for (const definition of incomplete) {
    assert.deepEqual(problems(definition), [], JSON.stringify(definition));
    assert.notDeepEqual(inspectActionDeclarations([definition], undefined), [], `the shape check reports it: ${JSON.stringify(definition)}`);
  }
});

test("problems come in the order of the definitions, then undo, job, fragment options, subject options, result object; the first of a repeated definition counts", () => {
  const everything = defined("notes.all", "command", {
    output_schema: { type: "object" }, undo: undo({ capability_id: "notes.gone" }), background_job: job(), result_subject: { id: "note.id" },
    fragment_offer_choices: [fragmentChoice], subject_offer_choices: [subjectChoice],
  });
  assert.deepEqual(problems(everything, add()), [
    "能力 notes.all@1 的撤销命令 notes.gone@1 不在同一提供方的声明里",
    "能力 notes.all@1 的撤销输入位置 note.id 不在本次输出的合同里",
    "能力 notes.all@1 的后台任务状态查询 jobs.status@1 不在同一提供方的声明里，或不是同一范围的查询",
    "能力 notes.all@1 的任务标识位置 run.jobId 不在本次输出的合同里",
    "能力 notes.all@1 的片段选项 make 的目标动作 notes.make@1 不在同一提供方的声明里，或范围不同",
    "能力 notes.all@1 的事项选项 open 的目标动作 notes.open@1 不在同一提供方的声明里，或范围不同",
    "能力 notes.all@1 的结果对象位置 note.id 不在输出合同里",
    "能力 notes.add@1 的撤销命令 notes.remove@1 不在同一提供方的声明里",
  ]);
  assert.deepEqual(problems(add(), remove(), add({ undo: undo({ capability_id: "notes.gone" }) })), [], "a repeat is the shape check's to report");
});

// ---- where the pass runs ------------------------------------------------------------------------------------------------------

const provider = { provider_id: "notes", title: "Notes", kind: "plugin" as const };
/** Registers the definitions with a Kernel the way a provider does, handlers that do nothing; returns what the Kernel says. */
function registered(...definitions: Part[]): ActionError | undefined {
  const typed = definitions as ActionDefinition[];
  try { new ActionService().registerProvider({ provider, definitions: typed, handlers: typed.map(definition => ({ ...definition, handle: () => ({}) })) }); return undefined; }
  catch (error) { if (error instanceof ActionError) return error; throw error; }
}

test("the Kernel refuses a registration whose references do not hold, with the problems found", () => {
  assert.equal(registered(add(), remove()), undefined);
  assert.equal(registered(start(), status()), undefined);
  const refused = (...definitions: Part[]) => { const error = registered(...definitions); assert.equal(error?.code, "actions.definition_invalid"); return error!.message; };
  assert.equal(refused(add()), "能力 notes.add@1 的撤销命令 notes.remove@1 不在同一提供方的声明里");
  assert.equal(refused(add(), remove({ scope: "home" })), "能力 notes.add@1 的撤销命令 notes.remove@1 不是同一范围的命令");
  assert.equal(refused(add({ output_schema: undefined }), remove()), "能力 notes.add@1 的撤销输入位置 note.id 不在本次输出的合同里");
  assert.equal(refused(start()), "能力 jobs.start@1 的后台任务状态查询 jobs.status@1 不在同一提供方的声明里，或不是同一范围的查询");
  assert.equal(refused(fragments(fragmentChoice)), "能力 notes.fragments@1 的片段选项 make 的目标动作 notes.make@1 不在同一提供方的声明里，或范围不同");
  assert.equal(refused(subjects(subjectChoice)), "能力 notes.offers@1 的事项选项 open 的目标动作 notes.open@1 不在同一提供方的声明里，或范围不同");
  assert.equal(refused(subject({ id: "note.key" })), "能力 notes.save@1 的结果对象位置 note.key 不在输出合同里");
  assert.equal(refused(subject("note.id")), "能力 notes.save@1 的结果对象声明必须是对象，写明 id（可加 revision）在输出里的路径");
});

test("the Kernel reports a shape problem and a reference problem together, shape first, and a shape problem alone when the definition is incomplete", () => {
  const untitled = defined("notes.untitled", "command", { title: "" });
  assert.equal(registered(untitled)?.message, "能力 notes.untitled@1 的输入输出、权限或展示定义不完整");
  assert.equal(registered(untitled, add())?.message, "能力 notes.untitled@1 的输入输出、权限或展示定义不完整；能力 notes.add@1 的撤销命令 notes.remove@1 不在同一提供方的声明里");
  assert.equal(registered(add({ undo: undo({ input: { note_id: "not a path" } }) }), remove())?.message, "能力 notes.add@1 的撤销声明必须是可撤回的命令，并写明同一提供方的撤销命令与其输入在本次输出里的位置");
});

test("a Manifest whose references do not hold is not a Manifest: parsing it names the problems, and a group that holds parses", () => {
  assert.equal(manifestProblems(declarationManifest({ actions: [add(), remove()] })), "");
  assert.equal(manifestProblems(declarationManifest({ actions: [add()] })), "能力 notes.add@1 的撤销命令 notes.remove@1 不在同一提供方的声明里");
  assert.equal(manifestProblems(declarationManifest({ actions: [start(), status({ output_schema: undefined })] })),
    "能力 jobs.start@1 的状态位置 status 不在 jobs.status@1 的输出合同里");
  assert.equal(manifestProblems(declarationManifest({ actions: [defined("notes.untitled", "command", { title: "" }), add()] })),
    "能力 notes.untitled@1 的输入输出、权限或展示定义不完整；能力 notes.add@1 的撤销命令 notes.remove@1 不在同一提供方的声明里");
  assert.equal(manifestProblems(declarationManifest({ actions: [subject("note.id")] })), "能力 notes.save@1 的结果对象声明必须是对象，写明 id（可加 revision）在输出里的路径");
  assert.throws(() => parsePluginManifest(declarationManifest({ actions: [add()] })), (error: unknown) => (error instanceof ActionError && error.kind === "invalid") && error.code === "plugin.declaration_invalid");
});

test("the Plugin Runtime does not install a plugin whose Manifest has a reference that does not hold", () => {
  const definition = (...actions: Part[]) => ({ manifest: declarationManifest({ actions }) as never, start: async () => ({ kind: "app" as const, actions: [] }) });
  const runtime = new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS });
  assert.doesNotThrow(() => runtime.install({ trust: { level: "unsigned" }, definition: definition(add(), remove()), deployment: "local", grants: [] }));
  assert.throws(() => new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS }).install({ trust: { level: "unsigned" }, definition: definition(add()), deployment: "local", grants: [] }),
    (error: unknown) => (error instanceof ActionError && error.kind === "invalid") && error.code === "plugin.manifest_invalid" && /撤销命令 notes\.remove@1 不在同一提供方的声明里/.test(error.message));
});

// ---- the bundled Manifests ----------------------------------------------------------------------------------------------------

test("every bundled Manifest's references hold, and the sweep sees each kind of reference", () => {
  const manifests = BUILTIN_PLUGIN_CATALOG.map(entry => entry.manifest);
  const failures = manifests.flatMap(manifest => inspectActionCrossReferences(manifest.actions).map(problem => `${manifest.plugin_id}: ${problem}`));
  assert.deepEqual(failures, []);
  // The sweep means something only while the bundled set exercises each kind of reference the rules check.
  const actions = manifests.flatMap(manifest => (manifest.actions ?? []).map(definition => definition.action));
  const seen = {
    undo: actions.filter(action => action.undo).length,
    background_job: actions.filter(action => action.background_job).length,
    fragment_offer_choices: actions.flatMap(action => action.fragment_offer_choices ?? []).length,
    subject_offer_choices: actions.flatMap(action => action.subject_offer_choices ?? []).length,
    result_subject: actions.filter(action => action.result_subject).length,
  };
  for (const [kind, count] of Object.entries(seen)) assert.ok(count > 0, `no bundled Manifest declares ${kind}`);
});
