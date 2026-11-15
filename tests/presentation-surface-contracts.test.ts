import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { definePresentationOverviewAction, definePresentationValuesAction, bindPresentationValuesHandler, inspectActionDeclarations, isPresentationValuesAction,
  parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { assertSurfaceDescription, presentationCatalog, presentationFormFields, presentationOverviewProblems, presentationText, presentationValuesProblems,
  validatePresentationDeclaration } from "@molis-ai/molis-work-plugin-sdk/presentation";
import { installTextForTest, say } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ActionError, defineSearchEntriesAction, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { CONTEXT_RELATION_TYPES } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { PRESENTATION_OVERVIEW_INPUT_SCHEMA, PRESENTATION_OVERVIEW_OUTPUT_SCHEMA, PRESENTATION_LIMITS, type OwnedPresentationObject, type PresentationObject,
  type PresentationValueItem, type PresentationValues } from "@molis-ai/molis-work-contracts/platform/presentation";
import { SURFACES_PROVIDER_ID, surfaceCompositionActions, type SurfaceDescription } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { DECLARATION_PLUGIN_ID, declarationManifest, manifestProblems } from "./fixtures/declaration-manifest.js";

// specs/shared-sources-and-surfaces §5–§7 (C-2, C-3): the contracts and the SDK's shared checks. Nothing registers these actions in the
// product yet, so the providers here are stand-ins answering what each test gives them; the refusals are the Kernel's schema checks and
// the SDK's own. Proven here: SSC-06 (a wrong declaration is refused at install, saying which item), SSC-10 (the assistant's choice is held
// to its candidates), SSC-13 (a stale value says when it was read, by schema and by the shared check), SSC-18 (the overview action's
// schemas, its declared starts and the starts it returns), and the contract half of SSC-07 (a description holds references, never values).
// What a person reads (`label`, `note`, a surface's words) is checked with batch 14's text tools, and `presentationText` writes the text form.
// Moved to batch 15 item 2: SSC-14 (`renderPresentationForm`). Left to batch 15 S-1: SSC-07's determinism, SSC-08, SSC-09, SSC-11 and SSC-19 (SCS-01,
// SCS-03, SCS-05, SCS-07).
const context = (audience: ActionCallContext["audience"]): ActionCallContext => ({ actor_id: `${audience}:someone`, project_id: "p", audience, permissions: [] });
const code = (expected: string) => (error: unknown) => (error as ActionError).code === expected;
const reference = (definition: ActionDefinition) => ({ capability_id: definition.capability_id, version: definition.version });

function serving(providerId: string, definitions: ActionDefinition[], handlers: ActionHandlerBinding[]) {
  const service = new ActionService();
  service.registerProvider({ provider: { provider_id: providerId, title: "替身", kind: "system", project_id: "p" }, definitions, handlers });
  return service;
}
const answering = (definition: ActionDefinition, answer: (input: unknown) => unknown): ActionHandlerBinding =>
  ({ capability_id: definition.capability_id, version: definition.version, handle: (_caller, input) => answer(input) });

const values = definePresentationValuesAction("notes.presentation.values", 1, ["note"], "笔记的显示字段", ["notes:read"]);
const overview = definePresentationOverviewAction("notes.presentation.overview", 1, "笔记概况", ["notes:read"]);
const note = { kind: "note", id: "n1" };

test("the values and overview helpers give declarations the SDK's action checks accept, and a Home-level overview reaches projects through the person", () => {
  assert.deepEqual(inspectActionDeclarations([values, overview], undefined), []);
  assert.equal(isPresentationValuesAction(values.action), true);
  assert.equal(isPresentationValuesAction(overview.action), false);
  assert.equal(values.action.execution?.cost, "none");
  for (const execution of [undefined, {}, { cost: "unknown" }, { cost: "metered" }]) assert.equal(isPresentationValuesAction({ ...values.action, execution }), false);
  assert.deepEqual([values.action.scheduling, values.action.effect, values.action.subject_kinds, values.action.audiences], ["concurrent", "read", ["note"], ["user", "plugin", "agent", "mcp"]]);
  const home = definePresentationOverviewAction("todo.presentation.overview", 1, "待办概况", [], "home");
  assert.deepEqual([home.action.scope, home.action.project_reach, home.action.effect, overview.action.project_reach], ["home", "person", "read", undefined]);
  assert.deepEqual(inspectActionDeclarations([home], undefined), []);
});

test("SSC-13 (contract half): a value the owner cannot read now comes back stale with when it was read; the schema holds the states and the limits", async () => {
  let answer: PresentationValues = { items: [] };
  const service = serving("notes", [values], [bindPresentationValuesHandler(values, () => answer)]);
  const ask = (input: unknown, audience: ActionCallContext["audience"] = "user") => service.invoke({ ...context(audience), permissions: ["notes:read"] }, reference(values), input);
  answer = { items: [{ subject: note, revision: "r1", state: "stale", values: { title: "周报" }, read_at: "2026-11-08T09:00:00.000Z" }] };
  assert.deepEqual(await ask({ subjects: [note], fields: ["title"] }), answer);
  for (const audience of ["plugin", "agent", "mcp"] as const) await ask({ subjects: [note], fields: ["title"] }, audience);
  answer = { items: [{ subject: note, revision: "r1", state: "stale", values: { title: "周报" }, read_at: "上午九点" }] };
  await assert.rejects(ask({ subjects: [note], fields: ["title"] }), code("actions.output_invalid"), "read_at is a date-time");
  answer = { items: [{ subject: note, revision: "r1", state: "unknown" as "ok" }] };
  await assert.rejects(ask({ subjects: [note], fields: [] }), code("actions.output_invalid"), "four states only");
  const many = Array.from({ length: PRESENTATION_LIMITS.values_subjects + 1 }, (_, index) => ({ kind: "note", id: `n${index}` }));
  await assert.rejects(ask({ subjects: many, fields: ["title"] }), code("actions.input_invalid"), "at most 50 objects a call");
  await assert.rejects(ask({ subjects: [], fields: ["title"] }), code("actions.input_invalid"), "at least one object");
  await assert.rejects(ask({ subjects: [note], fields: ["title"], project_id: "other" }), code("actions.input_invalid"), "no project in the input");
});

test("the values handler gives only the fields asked for, and nothing but the state for an object the caller cannot see or that is gone", async () => {
  const service = serving("notes", [values], [bindPresentationValuesHandler(values, () => ({ items: [
    { subject: note, revision: "r1", state: "ok", values: { title: "周报", body: "正文", status: "draft" } },
    { subject: { kind: "note", id: "n2" }, revision: "r2", state: "forbidden", values: { title: "别人的" }, read_at: "2026-11-08T09:00:00.000Z" },
    { subject: { kind: "note", id: "n3" }, revision: "r3", state: "deleted", values: { title: "删掉的" } },
  ] }))]);
  const read = await service.invoke({ ...context("user"), permissions: ["notes:read"] }, reference(values), { subjects: [note, { kind: "note", id: "n2" }, { kind: "note", id: "n3" }], fields: ["title", "status"] });
  assert.deepEqual(read, { items: [
    { subject: note, revision: "r1", state: "ok", values: { title: "周报", status: "draft" } },
    { subject: { kind: "note", id: "n2" }, revision: "r2", state: "forbidden" },
    { subject: { kind: "note", id: "n3" }, revision: "r3", state: "deleted" },
  ] });
});

test("SSC-18 (schema half): the overview action carries the platform's two schemas; a summary naming its own owner, or too many objects or starts, is refused", async () => {
  assert.deepEqual([overview.action.input_schema, overview.action.output_schema], [PRESENTATION_OVERVIEW_INPUT_SCHEMA, PRESENTATION_OVERVIEW_OUTPUT_SCHEMA]);
  let answer: unknown;
  const service = serving("notes", [overview], [answering(overview, () => answer)]);
  const ask = () => service.invoke({ ...context("user"), permissions: ["notes:read"] }, reference(overview), {});
  const start = [{ capability_id: "notes.create", version: 1 }];
  answer = { summary: { key: "notes.overview.summary", args: [{ name: "count", kind: "number", number: 3 }] }, subjects: [note], start };
  assert.deepEqual(await ask(), answer);
  answer = { summary: { literal: "三篇草稿" }, subjects: [], start: [] };
  await ask();
  const refused: ReadonlyArray<readonly [string, unknown]> = [
    ["an owner in the summary", { summary: { owner: "notes", key: "notes.overview.summary" }, subjects: [], start: [] }],
    ["six objects", { summary: { literal: "x" }, subjects: Array.from({ length: 6 }, (_, index) => ({ kind: "note", id: `n${index}` })), start: [] }],
    ["four starts", { summary: { literal: "x" }, subjects: [], start: Array.from({ length: 4 }, () => start[0]) }],
    ["no start list", { summary: { literal: "x" }, subjects: [] }],
    ["a start without its version", { summary: { literal: "x" }, subjects: [], start: [{ capability_id: "notes.create" }] }],
  ];
  for (const [what, value] of refused) {
    answer = value;
    await assert.rejects(ask(), code("actions.output_invalid"), what);
  }
  await assert.rejects(service.invoke({ ...context("user"), permissions: ["notes:read"] }, reference(overview), { project_id: "other" }), code("actions.input_invalid"));
});

const search = defineSearchEntriesAction("notes.search.entries", 1, [{ kind: "note", title: "笔记", surface: "notes" }], "笔记", []);
const command = (capabilityId: string, kinds: string[]) => ({ capability_id: capabilityId, version: 1, operation: "command", action: { title: "笔记操作",
  description: "改一篇笔记", kind: "operation", scope: "project", effect: "write", permissions: [], subject_kinds: kinds, audiences: ["user"], input_schema: { type: "object" } } });
const ownValues = definePresentationValuesAction("notes.presentation.values", 1, ["note"], "笔记的显示字段", []);
const ownOverview = definePresentationOverviewAction("notes.presentation.overview", 1, "笔记概况", []);
const ownActions: unknown[] = [search, ownValues, ownOverview, command("notes.publish", ["note"]), command("notes.create", [])];
const noteObject = {
  kind: "note",
  fields: [{ key: "title", role: "title", label: { key: "declaration-rules.note.title" } }, { key: "state", role: "status" }, { key: "summary", role: "summary" }],
  status: { field: "state", map: { draft: { ring: "draft", attention: "needs_acceptance" }, published: { ring: "done" } } },
  forms: { chip: { fields: ["title"] }, row: { fields: ["title", "summary"] } },
  // `goals.attach@1` is another provider's: this Manifest cannot tell whether it exists, so it passes here and is checked against the whole directory by S-1.
  actions: [{ ref: "notes.publish@1", primary: true, when: { status: ["draft"], slots: ["plugin-slot", "attention"] }, input_from: { note_id: "title" } }, { ref: "goals.attach@1" }],
  text: { lines: ["title", "state"] },
};
const ownStart = { capability_id: "notes.create", version: 1 };
const declaration = { objects: [noteObject], overview: { capability_id: "notes.presentation.overview", version: 1, note: { key: "declaration-rules.overview.note" }, start: [ownStart] } };
const presenting = (presentation: unknown, actions: unknown[] = ownActions) => manifestProblems(declarationManifest({ actions, presentation }));
const withObject = (part: Record<string, unknown>) => ({ objects: [{ ...noteObject, ...part }] });
const withOverview = (part: Record<string, unknown>) => ({ ...declaration, overview: { ...declaration.overview, ...part } });

test("IUI-01 SSC-06: a right declaration parses for every plugin alike, and an author's own check of it finds nothing; a Manifest without one is unchanged", () => {
  assert.equal(presenting(declaration), "");
  assert.deepEqual(parsePluginManifest(declarationManifest({ actions: ownActions, presentation: declaration })).presentation, declaration);
  assert.deepEqual(validatePresentationDeclaration({ plugin_id: DECLARATION_PLUGIN_ID, actions: ownActions, presentation: declaration }), []);
  assert.equal(presenting({ objects: [] }), "");
  assert.equal(manifestProblems(declarationManifest()), "");
});

test("SCS-15 notices use the object's own actions and text keys; external effects are explicit", () => {
  const reason = { key: "declaration-rules.note.locked" };
  const unavailable = { when: { status: ["draft"], codes: ["notes.locked"] }, reason, next: "goals.attach@1" };
  const actions = [{ ...noteObject.actions[0], unavailable }, noteObject.actions[1]];
  assert.equal(presenting(withObject({ actions })), "");
  for (const invalid of [{ ...unavailable, when: {} }, { ...unavailable, when: { status: [] } },
    { ...unavailable, when: { codes: [""] } }, { ...unavailable, reason: { literal: "locked" } },
    { ...unavailable, reason: { key: "other.note.locked" } }, { ...unavailable, next: "notes.publish@1" },
    { ...unavailable, next: "elsewhere.read@1" }]) {
    assert.match(presenting(withObject({ actions: [{ ...actions[0], unavailable: invalid }, actions[1]] })), /\.unavailable/u);
  }
  const definition = command("notes.publish", ["note"]);
  const sending = (external: unknown) => ({ ...definition, action: { ...definition.action, external } });
  assert.deepEqual(inspectActionDeclarations([sending(true)], undefined), []);
  for (const invalid of [false, "true", 1]) assert.ok(inspectActionDeclarations([sending(invalid)], undefined).length > 0);
});

test("SCS-09 values declarations refuse metered, external and model-backed reads", () => {
  const manifest = (extra: Record<string, unknown>) => ({ actions: [search, { ...ownValues, action: { ...ownValues.action, ...extra } }],
    presentation: withObject({ actions: [] }) });
  for (const extra of [{ permissions: ["model:invoke"] }, { external: true }, { execution: undefined }, { execution: { cost: "unknown" } }, { execution: { cost: "metered" } }]) {
    assert.match(validatePresentationDeclaration(manifest(extra)).join("\n"), /不调用模型、不外发或计费/u);
  }
});

test("IUI-01 SSC-06: a wrong declaration is refused at install and the author is told which item is wrong", () => {
  const at = "presentation.objects[0]";
  const fields = noteObject.fields;
  const refused: ReadonlyArray<readonly [unknown, string, unknown[]?]> = [
    [{ ...declaration, mounts: [] }, "presentation 不认这些字段：mounts"],
    [withObject({ owner: "notes" }), `${at} 不认这些字段：owner`],
    [withObject({ kind: "task" }), `${at}.kind 要是本插件的搜索来源或动作已经声明的对象种类`],
    // A values action listing a kind does not declare it: the object kind is the plugin's own already, never one the declaration brings.
    [withObject({ kind: "memo" }), `${at}.kind 要是本插件的搜索来源或动作已经声明的对象种类`, [...ownActions, definePresentationValuesAction("notes.memo.values", 1, ["memo"], "备忘", [])]],
    [declaration, `${at}.kind note 没有给值的动作：用 definePresentationValuesAction 声明一个列出这种对象的读取动作`, ownActions.filter(action => action !== ownValues)],
    [{ objects: [noteObject, noteObject] }, "presentation.objects[1].kind note 重复声明"],
    [withObject({ fields: [...fields, { key: "body", role: "body" }] }), `${at}.fields[3].role 不是平台的字段角色`],
    [withObject({ fields: [...fields, { key: "2nd", role: "excerpt" }] }), `${at}.fields[3].key 要以小写字母开头，只用 a-z、0-9 和 _，至多 64 个字符`],
    [withObject({ fields: [...fields, { key: "title", role: "excerpt" }] }), `${at}.fields[3].key title 重复`],
    [withObject({ forms: { row: { fields: ["title", "body"] } } }), `${at}.forms.row.fields 列了没有声明的字段：body`],
    [withObject({ forms: { page: { fields: ["title"] } } }), `${at}.forms 不认这些字段：page`],
    [withObject({ status: { ...noteObject.status, field: "title" } }), `${at}.status.field 要是本对象一个角色为 status 的字段`],
    [withObject({ status: { field: "state", map: { draft: { ring: "pending" } } } }), `${at}.status.map.draft.ring 不是状态环的状态`],
    [withObject({ status: { field: "state", map: { draft: { ring: "draft", attention: "urgent" } } } }), `${at}.status.map.draft.attention 不是平台的提醒标记`],
    [withObject({ actions: [{ ref: "notes.publish@2" }] }), `${at}.actions[0].ref notes.publish@2 不在动作目录里（本插件的动作要写声明过的版本）`],
    [withObject({ actions: [{ ref: "notes.publish" }] }), `${at}.actions[0].ref 要写成 capability_id@version`],
    [withObject({ actions: [{ ref: "notes.publish@1" }, { ref: "notes.publish@1" }] }), `${at}.actions[1].ref 重复`],
    [withObject({ actions: [{ ref: "notes.publish@1", when: { status: ["archived"] } }] }), `${at}.actions[0].when.status 只能列本对象 status.map 里的状态`],
    [withObject({ actions: [{ ref: "notes.publish@1", when: { slots: ["page"] } }] }), `${at}.actions[0].when.slots 只能列平台的位置`],
    [withObject({ actions: [{ ref: "notes.publish@1", input_from: { note_id: "body" } }] }), `${at}.actions[0].input_from.note_id 要指向本对象声明的字段`],
    [withObject({ text: { lines: ["title", "body"] } }), `${at}.text.lines 列了没有声明的字段：body`],
    [{ objects: [{ kind: "note", fields: [{ key: "title", role: "title", label: "标题" }], forms: {} }] }, `${at}.fields[0].label 必须是文字引用`],
  ];
  for (const [presentation, problem, actions] of refused) assert.equal(presenting(presentation, actions), problem, problem);
  assert.throws(() => parsePluginManifest(declarationManifest({ actions: ownActions, presentation: withObject({ kind: "task" }) })), code("plugin.declaration_invalid"));
});

test("SSC-18 (install half): the overview names one of this Manifest's own actions with the platform's schemas, and offers only its own actions to start from", () => {
  const changed = { ...ownOverview, action: { ...ownOverview.action, output_schema: { ...ownOverview.action.output_schema, required: ["summary"] } } };
  const fixedSchemas = (id: string) => `presentation.overview 指向的动作 ${id} 要用 definePresentationOverviewAction 定义：只读 query，不调用模型、不外发或计费，输入输出 schema 与平台定的一样`;
  assert.equal(presenting(declaration, ownActions.map(action => action === ownOverview ? changed : action)), fixedSchemas("notes.presentation.overview"));
  assert.equal(presenting(withOverview({ capability_id: "notes.publish" })), fixedSchemas("notes.publish"));
  assert.equal(presenting(withOverview({ capability_id: "goals.overview" })), "presentation.overview 要指向本 Manifest 自己的一个动作（capability_id 和 version 都要对上）");
  assert.equal(presenting(withOverview({ version: 2 })), "presentation.overview 要指向本 Manifest 自己的一个动作（capability_id 和 version 都要对上）");
  const notOwn = "presentation.overview.start[0] 要是本 Manifest 自己的一个动作（capability_id 和 version 都要对上）";
  assert.equal(presenting(withOverview({ start: [{ capability_id: "goals.create", version: 1 }] })), notOwn);
  assert.equal(presenting(withOverview({ start: [{ ...ownStart, provider_id: "notes" }] })), notOwn);
  assert.equal(presenting(withOverview({ start: [ownStart, ownStart] })), "presentation.overview.start[1] 重复");
  assert.equal(presenting(withOverview({ start: Array.from({ length: 4 }, () => ownStart) })), "presentation.overview.start 要列 1 到 3 个入口");
  const changedValues = { ...ownValues, action: { ...ownValues.action, output_schema: { type: "object" } } };
  assert.equal(presenting(declaration, ownActions.map(action => action === ownValues ? changedValues : action)),
    "给值的动作 notes.presentation.values 要用 definePresentationValuesAction 定义：只读 query，不调用模型、不外发或计费，输入输出 schema 与平台定的一样");
});

test("the catalog answers present, absent or unknown: this Manifest's own actions at their versions, and the whole directory once S-1 passes it", () => {
  const own = presentationCatalog(ownActions);
  assert.deepEqual([own("notes.publish", 1), own("notes.publish", 2), own("goals.attach", 1)], ["present", "absent", "unknown"]);
  const directory = presentationCatalog(ownActions, true);
  assert.deepEqual([directory("notes.publish", 1), directory("goals.attach", 1)], ["present", "absent"]);
  assert.deepEqual(validatePresentationDeclaration({ plugin_id: DECLARATION_PLUGIN_ID, actions: ownActions, presentation: declaration }, directory),
    ["presentation.objects[0].actions[1].ref goals.attach@1 不在动作目录里（本插件的动作要写声明过的版本）"]);
});

test("SSC-18 (runtime half): the starts an overview returns only pick among the declared ones, each once", () => {
  const summary = { literal: "三篇草稿" };
  assert.deepEqual(presentationOverviewProblems(declaration.overview, { summary, subjects: [note], start: [ownStart] }), []);
  assert.deepEqual(presentationOverviewProblems(declaration.overview, { summary, subjects: [], start: [] }), []);
  assert.deepEqual(presentationOverviewProblems(declaration.overview, { summary, subjects: [], start: [ownStart, { capability_id: "notes.publish", version: 1 }, ownStart] }),
    ["start[1] notes.publish@1 不在声明的 overview.start 里", "start[2] notes.create@1 重复"]);
  assert.deepEqual(presentationOverviewProblems({ capability_id: "notes.presentation.overview", version: 1 }, { summary, subjects: [], start: [ownStart] }),
    ["start[0] notes.create@1 不在声明的 overview.start 里"]);
});

test("SSC-13 (code half): an answer whose stale item has no read_at, or that says more than was asked, has a problem the page shows as unreadable", () => {
  const asked = { subjects: [note, { kind: "note", id: "n2" }], fields: ["title"] };
  assert.deepEqual(presentationValuesProblems(asked, { items: [{ subject: note, revision: "r1", state: "stale", values: { title: "周报" }, read_at: "2026-11-08T09:00:00.000Z" },
    { subject: { kind: "note", id: "n2" }, revision: "r2", state: "forbidden" }] }), []);
  assert.deepEqual(presentationValuesProblems(asked, { items: [
    { subject: note, revision: "r1", state: "stale", values: { title: "周报" } },
    { subject: { kind: "note", id: "n2" }, revision: "r2", state: "deleted", values: { title: "删掉的" } },
    { subject: note, revision: "r1", state: "ok", values: { title: "周报", body: "正文" } },
    { subject: { kind: "note", id: "n9" }, revision: "r9", state: "ok" },
  ] }), ["items[0] 是 stale，要写 read_at", "items[1] 是 deleted，只能给状态", "items[2] 重复回答了同一个对象", "items[2] 给了没有问到的字段", "items[3] 不是问到的对象"]);
});

// What a person reads, checked with batch 14's text tools (a-section §2.3, §2.4). These need T4's `/ui` (`textRefProblems`,
// `tryOwnedTextRef`, `say`, `installTextForTest`): they compile once batch 14 is in.
const owned = (ref: unknown) => withObject({ fields: [{ key: "title", role: "title", label: ref }, ...noteObject.fields.slice(1)] });

test("SSC-06 (words): a label or note is a key of the plugin's own words or common., never a literal; a wrong one is refused saying where", () => {
  assert.equal(presenting(owned({ key: "common.title" })), "");
  assert.match(presenting(owned({ literal: "标题" })), /^presentation\.objects\[0\]\.fields\[0\]\.label：/u);
  assert.match(presenting(owned({ key: "declaration-rules.note.title", literal: "标题" })), /^presentation\.objects\[0\]\.fields\[0\]\.label：/u);
  assert.equal(presenting(owned({ key: "goals.note.title" })), "presentation.objects[0].fields[0].label 的键要用本插件自己的文字前缀，或平台共有的 common.");
  assert.match(presenting(withOverview({ note: { literal: "同步来的资料不算你接下的工作" } })), /^presentation\.overview\.note：/u);
  assert.equal(presenting(withOverview({ note: { key: "feed.overview.note" } })), "presentation.overview.note 的键要用本插件自己的文字前缀，或平台共有的 common.");
});

test("SSC-10 (words): every word on a composed surface is bound to its owner, or the choice is malformed and the candidates are shown", () => {
  const candidates = description([{ kind: "attention", state: "ok", items: [] }]);
  const group = { kind: "attention", state: "ok", items: [] };
  for (const [what, value] of [
    ["a title without its owner", { ...candidates, groups: [{ ...group, title: { key: "notes.surface.title" } }] }],
    ["a reason with both a key and a literal", { ...candidates, reason: { owner: "notes", key: "notes.surface.why", literal: "因为" } }],
  ] as const) assert.throws(() => assertSurfaceDescription(value, candidates), code("actions.output_invalid"), what);
  // The hidden-above label is the candidates' (the value's does not count), so it is checked there: the service's self-check refuses one without its owner.
  const unbound = description([{ ...group, hidden_above: { count: 2, label: { key: "common.surface.hidden-above" } } }]);
  assert.throws(() => assertSurfaceDescription(unbound, unbound), code("actions.output_invalid"), "a hidden-above label without its owner");
  assert.deepEqual(assertSurfaceDescription({ ...candidates, reason: { literal: "按你上次的调整排" } }, candidates).description.reason, { literal: "按你上次的调整排" });
});

test("presentationText: one line per text line from the owner's values, its words bound to the owner without throwing; stale values say so", () => {
  const messages = { "declaration-rules.note.title": "标题", "declaration-rules.note.edited": "改了正文", "declaration-rules.note.kept": "留着" };
  const revoke = installTextForTest({ locale: "zh-CN", packs: [{ format_version: 1, owner: DECLARATION_PLUGIN_ID, locale: "zh-CN", messages }] });
  try {
    const object: OwnedPresentationObject = { ...noteObject, owner: DECLARATION_PLUGIN_ID,
      fields: [...noteObject.fields, { key: "activity", role: "activity" }, { key: "call", role: "judgment" }] as OwnedPresentationObject["fields"],
      text: { lines: ["title", "state", "activity", "call", "summary"] } } as OwnedPresentationObject;
    const values = { title: "周报", state: "draft", activity: { key: "declaration-rules.note.edited" }, call: { label: { key: "declaration-rules.note.kept" }, reason: { literal: "下周还要用" } } };
    const item: PresentationValueItem = { subject: note, revision: "r1", state: "ok", values };
    assert.equal(presentationText(object, item, "zh-CN"), "标题：周报\ndraft\n改了正文\n留着（下周还要用）");
    const unavailable = say.text({ owner: "workbench", key: "common.text.unavailable" }, { locale: "zh-CN" });
    const forged = presentationText(object, { ...item, values: { ...values, activity: { key: "goals.note.edited" } } }, "zh-CN");
    assert.equal(forged.split("\n")[2], unavailable, "a word under another owner's prefix shows as unavailable, never as that owner's");
    const stale = presentationText(object, { ...item, state: "stale", read_at: "2026-11-08T09:00:00.000Z" }, "zh-CN").split("\n");
    assert.deepEqual([stale.length, stale.slice(1)], [5, ["标题：周报", "draft", "改了正文", "留着（下周还要用）"]]);
    assert.equal(presentationText(object, { subject: note, revision: "r1", state: "forbidden" }, null), "");
    assert.equal(presentationText(object, { subject: note, revision: "r1", state: "deleted" }, null), "");
  } finally {
    revoke();
  }
});

test("a form the object does not declare steps down to the next simpler one it does; with none left the platform draws its fallback", () => {
  const object: PresentationObject = {
    kind: "note",
    fields: [{ key: "title", role: "title" }, { key: "state", role: "status" }, { key: "summary", role: "summary" }],
    status: { field: "state", map: { draft: { ring: "draft", attention: "needs_acceptance" }, done: { ring: "done" } } },
    forms: { chip: { fields: ["title"] }, card: { fields: ["title", "summary", "state"] } },
  };
  assert.deepEqual(presentationFormFields(object, "chip"), { form: "chip", fields: ["title", "state"] });
  assert.deepEqual(presentationFormFields(object, "row"), { form: "chip", fields: ["title", "state"] });
  assert.deepEqual(presentationFormFields(object, "card"), { form: "card", fields: ["title", "summary", "state"] });
  assert.deepEqual(presentationFormFields(object, "peek"), { form: "card", fields: ["title", "summary", "state"] });
  const withoutStatus: PresentationObject = { kind: "note", fields: [{ key: "title", role: "title" }], forms: { card: { fields: ["title"] } } };
  assert.equal(presentationFormFields(withoutStatus, "row"), null);
  assert.deepEqual(presentationFormFields(withoutStatus, "peek"), { form: "card", fields: ["title"] });
});

const composeRequest = (slot: Record<string, unknown>) => ({ slot, subjects: [note] });
const item = { subject: note, owner_plugin_id: "notes", form: "row", state: "ok", fields: [{ key: "title", role: "title" }],
  actions: [{ ref: "notes.publish@1", provider_id: "notes", primary: true, prepared_input: { note_id: "id" }, consequence: ["external"] }, { ref: "open", primary: false }] };
const description = (groups: unknown[]): SurfaceDescription => ({ composed_by: "rules", revision: "d1", corrections_revision: "0", groups } as SurfaceDescription);
const otherNote = { ...item, subject: { kind: "note", id: "n2" }, actions: [{ ref: "open", primary: true }] };
const todo = { ...item, subject: { kind: "todo", id: "t1" }, owner_plugin_id: "todo", actions: [] };
const notesGroup = { kind: "plugin", owner_plugin_id: "notes", state: "ok", items: [item, otherNote] };
const attentionGroup = { kind: "attention", state: "ok", items: [todo] };

test("surfaces.compose@1: a plugin-slot names the plugin and its slot and no other place does; the first slice answers the person and plugins", async () => {
  const { compose, correct } = surfaceCompositionActions;
  assert.deepEqual(inspectActionDeclarations([compose, correct], undefined), []);
  assert.deepEqual([compose.operation, compose.action.scheduling, compose.action.audiences, correct.operation, correct.action.audiences, correct.action.effect],
    ["query", "concurrent", ["user", "plugin"], "command", ["user"], "write"]);
  const service = serving(SURFACES_PROVIDER_ID, [compose], [answering(compose, () => description([]))]);
  const ask = (input: unknown, audience: ActionCallContext["audience"] = "user") => service.invoke(context(audience), reference(compose), input);
  await ask(composeRequest({ kind: "plugin-slot", plugin_id: "goals", slot_id: "goals.detail.evidence" }));
  await ask(composeRequest({ kind: "conversation" }), "plugin");
  await ask({ ...composeRequest({ kind: "conversation" }), delivery_subjects: [note], expanded: true });
  await ask({ ...composeRequest({ kind: "discussion" }), expanded: true });
  await ask({ slot: { kind: "attention" }, task: "reviewing" });
  for (const [what, input] of [
    ["a plugin-slot without its slot", composeRequest({ kind: "plugin-slot", plugin_id: "goals" })],
    ["the old name of the place", composeRequest({ kind: "plugin-mount", plugin_id: "goals", slot_id: "goals.detail.evidence" })],
    ["the old name of the slot", composeRequest({ kind: "plugin-slot", plugin_id: "goals", mount_id: "goals.detail.evidence" })],
    ["a conversation naming a plugin", composeRequest({ kind: "conversation", plugin_id: "goals" })],
    ["an unknown place", composeRequest({ kind: "page" })],
    ["an unknown task", { slot: { kind: "home" }, task: "playing" }],
    ["a caller named in the input", { slot: { kind: "home" }, actor_id: "someone-else" }],
    ["deliveries in a discussion", { ...composeRequest({ kind: "discussion" }), delivery_subjects: [note] }],
    ["deliveries without a requested list", { slot: { kind: "conversation" }, delivery_subjects: [note] }],
    ["a repeated delivery", { ...composeRequest({ kind: "conversation" }), delivery_subjects: [note, { id: note.id, kind: note.kind }] }],
    ["expanding a plugin slot", { ...composeRequest({ kind: "plugin-slot", plugin_id: "notes", slot_id: "notes.own" }), expanded: true }],
    ["a false expansion flag", { ...composeRequest({ kind: "discussion" }), expanded: false }],
  ] as const) await assert.rejects(ask(input), code("actions.input_invalid"), what);
  for (const audience of ["agent", "mcp", "workflow"] as const) await assert.rejects(ask({ slot: { kind: "home" } }, audience), code("actions.forbidden"), audience);
});

test("SSC-07 (contract half): a composed description holds references and forms, never a field's value; a merge names only a platform relation type", async () => {
  const { compose } = surfaceCompositionActions;
  let answer: unknown;
  const service = serving(SURFACES_PROVIDER_ID, [compose], [answering(compose, () => answer)]);
  const ask = () => service.invoke(context("user"), reference(compose), { slot: { kind: "attention" } });
  const title = { owner: "workbench", key: "common.surface.attention" };
  const merged = [{ subject: { kind: "todo", id: "t1" }, owner_plugin_id: "todo", relation: CONTEXT_RELATION_TYPES.created_from }];
  answer = description([{ kind: "attention", state: "ok", title, items: [{ ...item, merged }],
    hidden_above: { count: 2, label: { owner: "workbench", key: "common.surface.hidden-above", args: [{ name: "count", kind: "number", number: 2 }] } } }]);
  assert.deepEqual(await ask(), answer);
  answer = { ...description([]), reason: { literal: "按你上次的调整排" } };
  await ask();
  const refused: ReadonlyArray<readonly [string, unknown]> = [
    ["a field's value in an item", description([{ kind: "attention", state: "ok", items: [{ ...item, values: { title: "周报" } }] }])],
    ["a prepared value instead of a field reference", description([{ kind: "attention", state: "ok", items: [{ ...item, actions: [{ ref: "notes.publish@1", provider_id: "notes", primary: true, prepared_input: { note_id: 7 } }] }] }])],
    ["a directory action without its provider", description([{ ...notesGroup, items: [{ ...item, actions: [{ ref: "notes.publish@1", primary: true }] }] }])],
    ["a generic operation with a provider", description([{ ...notesGroup, items: [{ ...item, actions: [{ ref: "open", provider_id: "notes", primary: true }] }] }])],
    ["an old timestamp on a current item", description([{ ...notesGroup, items: [{ ...item, read_at: "2026-11-08T09:00:00.000Z" }] }])],
    ["a relation type outside the table", description([{ kind: "attention", state: "ok", items: [{ ...item, merged: [{ ...merged[0], relation: "placement.used_in" }] }] }])],
    ["an unknown consequence", description([{ kind: "attention", state: "ok", items: [{ ...item, actions: [{ ref: "open", primary: false, consequence: ["slow"] }] }] }])],
    ["an unknown form", description([{ kind: "attention", state: "ok", items: [{ ...item, form: "page" }] }])],
    ["no corrections revision", { composed_by: "rules", revision: "d1", groups: [] }],
  ];
  for (const [what, value] of refused) {
    answer = value;
    await assert.rejects(ask(), code("actions.output_invalid"), what);
  }
});

test("a group leaves out only disabled plugins: the person's description may say how many and whose, a plugin's only that some were left out", async () => {
  const { compose } = surfaceCompositionActions;
  let answer: unknown;
  const service = serving(SURFACES_PROVIDER_ID, [compose], [answering(compose, () => answer)]);
  const ask = (audience: ActionCallContext["audience"]) => service.invoke(context(audience), reference(compose), { slot: { kind: "attention" } });
  // What each audience is given is the service's to decide (batch 15 S-1); the contract carries both shapes and nothing else.
  answer = description([{ kind: "attention", state: "ok", items: [], excluded: [{ reason: "disabled", count: 3, owner_plugin_id: "inbox" }] }]);
  assert.deepEqual(await ask("user"), answer);
  answer = description([{ kind: "attention", state: "ok", items: [], excluded: [{ reason: "disabled" }] }]);
  assert.deepEqual(await ask("plugin"), answer);
  for (const [what, excluded] of [
    ["forbidden, which would tell what the caller cannot see", { reason: "forbidden", count: 1 }],
    ["a count of none", { reason: "disabled", count: 0 }],
    ["anything else about the plugin", { reason: "disabled", title: "Inbox" }],
  ] as const) {
    answer = description([{ kind: "attention", state: "ok", items: [], excluded: [excluded] }]);
    await assert.rejects(ask("user"), code("actions.output_invalid"), what);
  }
});

test("SSC-10: the assistant's choice keeps only what the candidates have, records what it dropped, and shows the candidates when it is malformed", () => {
  const candidates = description([notesGroup, attentionGroup]);
  assert.deepEqual(assertSurfaceDescription(candidates, candidates), { description: candidates, dropped: [] });
  const chosen = { ...candidates, composed_by: "assistant", revision: "a1", reason: { owner: "workbench", key: "common.surface.reason" }, groups: [
    // The assistant may order the groups, and pick and order the items of each among that group's candidates.
    attentionGroup,
    { ...notesGroup, items: [
      // It may say which actions and which one leads; the prepared input and the consequences stay the candidate's.
      { ...item, actions: [{ ref: "notes.publish@1", provider_id: "notes", primary: false, prepared_input: { note_id: "summary" } }, { ref: "notes.delete@1", provider_id: "notes", primary: true }] },
      { ...item, subject: { kind: "note", id: "n9" } },
      { ...otherNote, form: "card" },
    ] },
  ] };
  const checked = assertSurfaceDescription(chosen, candidates);
  assert.deepEqual(checked.description, { ...chosen, groups: [attentionGroup, { ...notesGroup, items: [{ ...item, actions: [{ ...item.actions[0], primary: false }] }] }] });
  assert.deepEqual(checked.dropped, [{ subject: note, action: "notes.delete@1" }, { subject: { kind: "note", id: "n9" } }, { subject: { kind: "note", id: "n2" } }]);
  const malformed: ReadonlyArray<readonly [string, unknown]> = [
    ["a group the candidates do not have", { ...chosen, groups: [{ kind: "continue", state: "ok", items: [] }] }],
    ["an owner on an attention group", { ...chosen, groups: [{ ...attentionGroup, owner_plugin_id: "todo" }] }],
    ["a plugin group without its owner", { ...chosen, groups: [{ kind: "plugin", state: "ok", items: [] }] }],
    ["another plugin's group", { ...chosen, groups: [{ ...notesGroup, owner_plugin_id: "todo", items: [] }] }],
    ["one group twice", { ...chosen, groups: [attentionGroup, { ...attentionGroup, items: [] }] }],
    ["two primary actions", { ...chosen, groups: [{ ...notesGroup, items: [{ ...item, actions: item.actions.map(action => ({ ...action, primary: true })) }] }] }],
    ["one object twice", { ...chosen, groups: [{ ...attentionGroup, items: [todo, todo] }] }],
    ["another corrections revision", { ...chosen, corrections_revision: "7" }],
    ["a key outside the contract", { ...chosen, values: {} }],
  ];
  for (const [what, value] of malformed) assert.throws(() => assertSurfaceDescription(value, candidates), code("actions.output_invalid"), what);
  // What the composition service does with it (batch 15 S-1): a malformed choice shows the candidates instead.
  const shown = (value: unknown) => {
    try {
      return assertSurfaceDescription(value, candidates).description;
    } catch (error) {
      if (error instanceof ActionError && error.code === "actions.output_invalid") return candidates;
      throw error;
    }
  };
  assert.equal(shown(malformed[0]?.[1]), candidates);
});

test("SCS-14 SCS-15 the assistant cannot redirect a provider, rewrite a notice or change the folded count", () => {
  const notices = [{ reason: { owner: "notes", key: "notes.locked" }, next: { ref: "notes.read@1", provider_id: "notes", primary: false } }];
  const candidate = { ...item, notices };
  const group = { ...notesGroup, overflow: { count: 2 }, items: [candidate] };
  const candidates = description([group]);
  const [publish] = item.actions;
  const forged = { ...candidates, groups: [{ ...group, overflow: { count: 7 }, items: [{ ...candidate,
    actions: [{ ...publish, provider_id: "another" }], notices: [{ reason: { owner: "another", key: "another.fake" } }],
  }] }] };
  const checked = assertSurfaceDescription(forged, candidates);
  assert.deepEqual(checked.description.groups, [{ ...group, items: [{ ...candidate, actions: [] }] }]);
  assert.deepEqual(checked.dropped, [{ subject: note, action: "notes.publish@1" }]);
  const self = description([{ ...group, items: [{ ...candidate, actions: [publish, { ...publish, provider_id: "another", primary: false }] }] }]);
  assert.deepEqual(assertSurfaceDescription(self, self).dropped, []);
});

test("SSC-10 (IUI-05): a group's facts are the candidates'; the value's state, read_at, excluded and hidden_above do not take effect", () => {
  const candidates = description([attentionGroup]);
  const forged = { ...attentionGroup, state: "stale", read_at: "2026-11-08T09:00:00.000Z", excluded: [{ reason: "disabled", count: 3, owner_plugin_id: "todo" }],
    hidden_above: { count: 9, label: { owner: "workbench", key: "common.surface.hidden-above" } } };
  assert.deepEqual(assertSurfaceDescription({ ...candidates, groups: [forged] }, candidates).description.groups, [attentionGroup], "the assistant cannot say a value is old, or that something was left out");
  const held = description([{ ...attentionGroup, state: "stale", read_at: "2026-11-08T09:00:00.000Z", excluded: [{ reason: "disabled" }],
    hidden_above: { count: 2, label: { owner: "workbench", key: "common.surface.hidden-above" } } }]);
  assert.deepEqual(assertSurfaceDescription({ ...held, groups: [attentionGroup] }, held).description.groups, held.groups, "nor leave out what the service says");
  // The group rules hold on the candidates themselves, so the service's self-check (the candidates as the value) refuses a misplaced state.
  const wrong: ReadonlyArray<readonly [string, unknown]> = [
    ["disabled outside a plugin group", { ...attentionGroup, state: "disabled" }],
    ["undeclared outside a plugin group", { ...attentionGroup, state: "undeclared" }],
    ["an owner on an attention group", { ...attentionGroup, owner_plugin_id: "todo" }],
    ["a plugin group without its owner", { ...attentionGroup, kind: "plugin" }],
    ["a plugin group holding another plugin's item", { ...attentionGroup, kind: "plugin", owner_plugin_id: "notes" }],
    ["stale without read_at", { ...attentionGroup, state: "stale" }],
    ["read_at on a group that is not stale", { ...attentionGroup, read_at: "2026-11-08T09:00:00.000Z" }],
  ];
  for (const [what, group] of wrong) {
    const composed = description([group]);
    assert.throws(() => assertSurfaceDescription(composed, composed), code("actions.output_invalid"), what);
  }
});

test("SSC-10 (IUI-05): an object stays only in the group its candidate is in; put in another, the attention group among them, it is dropped and recorded", () => {
  const candidates = description([notesGroup, attentionGroup]);
  const checked = assertSurfaceDescription({ ...candidates, groups: [{ ...attentionGroup, items: [item] }, { ...notesGroup, items: [todo, otherNote] }] }, candidates);
  assert.deepEqual(checked.description.groups, [{ ...attentionGroup, items: [] }, { ...notesGroup, items: [otherNote] }],
    "a note is not waiting for you because the assistant put it there, and Notes' group holds only Notes' things");
  assert.deepEqual(checked.dropped, [{ subject: note }, { subject: todo.subject }]);
});

test("IUI-06 surfaces.correct@1 commits from the corrections revision: only the person can set a form, remove, pin or reset", async () => {
  const { correct } = surfaceCompositionActions;
  const service = serving(SURFACES_PROVIDER_ID, [correct], [answering(correct, () => ({ corrections_revision: "1" }))]);
  const ask = (input: Record<string, unknown>, audience: ActionCallContext["audience"] = "user") => service.invoke(context(audience), reference(correct), { slot: { kind: "attention" }, expected_revision: "0", ...input });
  assert.deepEqual(await ask({ correction: "form", form: "card" }), { corrections_revision: "1" });
  await ask({ correction: "form", form: "chip", subject: note });
  await ask({ correction: "remove", subject: note });
  await ask({ correction: "pin", subject: note, position: 0 });
  await ask({ correction: "reset", subject: note });
  await ask({ correction: "reset" });
  for (const [what, input] of [
    ["a form correction without its form", { correction: "form" }],
    ["a form correction with a position", { correction: "form", form: "card", position: 1 }],
    ["a removal of the whole place", { correction: "remove" }],
    ["a removal with a form", { correction: "remove", subject: note, form: "row" }],
    ["a pin without its position", { correction: "pin", subject: note }],
    ["a pin past the last position", { correction: "pin", subject: note, position: PRESENTATION_LIMITS.values_subjects }],
    ["a reset with a form", { correction: "reset", form: "row" }],
    ["a reset with a position", { correction: "reset", subject: note, position: 0 }],
    ["an unknown correction", { correction: "hide", subject: note }],
  ] as const) await assert.rejects(ask(input), code("actions.input_invalid"), what);
  await assert.rejects(service.invoke(context("user"), reference(correct), { slot: { kind: "attention" }, correction: "remove", subject: note }), code("actions.input_invalid"), "no expected revision");
  await assert.rejects(ask({ correction: "remove", subject: note }, "plugin"), code("actions.forbidden"), "a plugin does not rearrange the person's layout");
});

test("the platform relation types keep placement's own names and add created_from", () => {
  assert.deepEqual(CONTEXT_RELATION_TYPES, { copied_from: "placement.copied_from", derived_from: "placement.derived_from", created_from: "created_from" });
});
