import {
  FRAGMENT_OFFERS_INPUT_TYPE, ITEM_ATTACH_POSITIONS, ITEM_DECLARATION_LIMITS, actionEffect, isSubjectReader, type ActionMetadata,
} from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SURFACE_PLACES } from "@molis-ai/molis-work-contracts/services/contextual";

// The checks for what a plugin declares about being put things into (context-program §3.3, §3.4, §4): creation entries
// (`intake`), appends (`attach`), the places an offer applies in (`places`) and the object kinds a right-panel cell shows
// (`ui.views[].objects`). Two layers, as for the other declarations: `contextDeclarationProblems` reads one action by itself
// when it registers, `inspectContextDeclarations` reads the whole Manifest for what refers across actions and views. Both
// return every problem and never throw, and both append to the older checks, so the order an author reads does not change.

const ID_PATTERN = /^[a-z][a-z0-9_.-]*$/u;
const PLACES: ReadonlySet<string> = new Set(SURFACE_PLACES);
const POSITIONS: ReadonlySet<string> = new Set(ITEM_ATTACH_POSITIONS);
const LIMITS = ITEM_DECLARATION_LIMITS;

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const words = (value: unknown, max: number): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const ownId = (value: unknown): value is string => words(value, LIMITS.id) && ID_PATTERN.test(value);
const reference = (value: unknown): value is { capability_id: string; version: number } => isObject(value) && words(value.capability_id, 200)
  && typeof value.version === "number" && Number.isSafeInteger(value.version) && value.version > 0 && Object.keys(value).length === 2;

/** `places`, when declared, is a non-empty set of the places that exist. */
function placesValid(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length > 0 && value.every(place => PLACES.has(String(place))) && new Set(value).size === value.length);
}

function inputFields(action: Record<string, unknown>): Record<string, unknown> {
  const properties = isObject(action.input_schema) ? action.input_schema.properties : undefined;
  return isObject(properties) ? properties : {};
}

/** The part both declarations share: its words, the field that takes the selected text, and which places it applies in. */
function destinationValid(value: Record<string, unknown>): boolean {
  return words(value.title, LIMITS.title) && words(value.verb, LIMITS.verb) && words(value.describe, LIMITS.describe)
    && (value.material_field === undefined || typeof value.material_field === "string")
    && (value.prepare === undefined || reference(value.prepare)) && placesValid(value.places);
}

/** A destination writes: a command that can be taken back or confirmed, never one that cannot be undone. */
function writes(key: string, operation: unknown, action: Record<string, unknown>): boolean {
  const effect = action.effect === "read" || action.effect === "write" || action.effect === "irreversible" ? action.effect : undefined;
  return operation === "command" && actionEffect({ kind: action.kind as ActionMetadata["kind"], ...(effect ? { effect } : {}) }, key.split("@")[0]!) !== "irreversible";
}

function intakeProblems(key: string, operation: unknown, action: Record<string, unknown>): string[] {
  const intake = action.intake;
  if (intake === undefined) return [];
  const value = isObject(intake) ? intake : {};
  const examples = Array.isArray(value.examples) ? value.examples : [];
  const valid = isObject(intake) && destinationValid(value) && ownId(value.intake_id) && words(value.item_kind, 80)
    && examples.length >= 1 && examples.length <= LIMITS.examples && examples.every(example => words(example, LIMITS.example))
    && (value.effect === undefined || value.effect === "creates" || value.effect === "proposes")
    && (value.multiple === undefined || typeof value.multiple === "boolean");
  const problems = valid ? [] : [`能力 ${key} 的创建入口声明无效：需要稳定的 id、对象种类、名称、动词、说明与一到三条示例，字段都有长度上限`];
  if (!writes(key, operation, action)) problems.push(`能力 ${key} 的创建入口必须声明在写入动作（command）上，且不能是不可撤回的`);
  if (isObject(intake) && typeof value.material_field === "string" && !(value.material_field in inputFields(action))) problems.push(`能力 ${key} 的创建入口的 material_field 必须是输入里的顶层字段`);
  return problems;
}

function attachProblems(key: string, operation: unknown, action: Record<string, unknown>): string[] {
  const attach = action.attach;
  if (attach === undefined) return [];
  const value = isObject(attach) ? attach : {};
  const positions = value.positions;
  const positionsValid = positions === undefined || (Array.isArray(positions) && positions.length > 0 && positions.every(position => POSITIONS.has(String(position))) && new Set(positions).size === positions.length);
  const valid = isObject(attach) && destinationValid(value) && ownId(value.attach_id) && words(value.item_kind, 80) && positionsValid;
  const problems = valid ? [] : [`能力 ${key} 的追加声明无效：需要稳定的 id、对象种类、名称、动词与说明，位置只能是光标、选区、文末`];
  if (!writes(key, operation, action)) problems.push(`能力 ${key} 的追加必须声明在写入动作（command）上，且不能是不可撤回的`);
  if (isObject(attach) && typeof value.material_field === "string" && !(value.material_field in inputFields(action))) problems.push(`能力 ${key} 的追加的 material_field 必须是输入里的顶层字段`);
  // A write at a cursor or over a selection is only safe against the document the person was looking at.
  if (positionsValid && Array.isArray(positions) && (positions.includes("cursor") || positions.includes("selection")) && !("expected_version" in inputFields(action))) {
    problems.push(`能力 ${key} 的追加到光标或选区必须在输入里带 expected_version，文档变了就拒绝写入`);
  }
  return problems;
}

/** The places an offer's choices apply in. */
function choicePlaceProblems(key: string, action: Record<string, unknown>): string[] {
  const choices = [action.subject_offer_choices, action.fragment_offer_choices].flatMap(list => Array.isArray(list) ? list : []);
  return choices.some(choice => isObject(choice) && !placesValid(choice.places)) ? [`能力 ${key} 的选项范围 places 无效：只能是左边、右栏、助理面板，不重复`] : [];
}

/** What one action says about being put things into, read by itself. */
export function contextDeclarationProblems(key: string, operation: unknown, action: Record<string, unknown>): string[] {
  return [...intakeProblems(key, operation, action), ...attachProblems(key, operation, action), ...choicePlaceProblems(key, action)];
}

/** The kinds this Manifest reads objects of: each has a reader in its own actions. Entries that are not shaped like actions read as none. */
function ownKinds(manifest: Pick<PluginManifest, "actions">): ReadonlySet<string> {
  const kinds = new Set<string>();
  for (const definition of Array.isArray(manifest.actions) ? manifest.actions : []) {
    if (!isObject(definition) || !isObject(definition.action) || !isSubjectReader(definition.action) || !Array.isArray(definition.action.subject_kinds)) continue;
    for (const kind of definition.action.subject_kinds) if (typeof kind === "string") kinds.add(kind);
  }
  return kinds;
}

/** Declarations that refer to other declarations of the same Manifest: unique ids, a `prepare` that exists, kinds it owns. */
export function inspectContextDeclarations(manifest: Pick<PluginManifest, "actions"> & { readonly ui: Pick<PluginManifest["ui"], "views"> }): string[] {
  const problems: string[] = [];
  const definitions = Array.isArray(manifest.actions) ? manifest.actions : [];
  const kinds = ownKinds(manifest);
  const seen = { intake: new Set<string>(), attach: new Set<string>() };
  for (const definition of definitions) {
    if (!isObject(definition) || !isObject(definition.action)) continue;
    const key = `${definition.capability_id}@${definition.version}`, action: Record<string, unknown> = definition.action;
    for (const [name, id, declared] of [["创建入口", "intake_id", action.intake], ["追加声明", "attach_id", action.attach]] as const) {
      if (!isObject(declared)) continue;
      const set = id === "intake_id" ? seen.intake : seen.attach, own = declared[id];
      if (typeof own === "string") {
        if (set.has(own)) problems.push(`${name}重复：${own}`);
        set.add(own);
      }
      const prepare = declared.prepare;
      if (reference(prepare) && !definitions.some(target => isObject(target) && target.capability_id === prepare.capability_id && target.version === prepare.version
        && target.operation === "query" && isObject(target.action) && target.action.input_type === FRAGMENT_OFFERS_INPUT_TYPE)) {
        problems.push(`能力 ${key} 的${name}的 prepare ${prepare.capability_id}@${prepare.version} 不是本插件的选区动作查询（defineFragmentOffersAction）`);
      }
    }
    const attach = action.attach;
    if (isObject(attach) && typeof attach.item_kind === "string" && !kinds.has(attach.item_kind)) {
      problems.push(`能力 ${key} 的追加对象种类 ${attach.item_kind} 不是本插件拥有的种类：没有它的对象读取器，插件不能写进别的插件的对象`);
    }
  }
  for (const view of Array.isArray(manifest.ui.views) ? manifest.ui.views : []) {
    if (!isObject(view) || view.objects === undefined) continue;
    if (view.slot !== "side") problems.push(`视图 ${view.view_id} 的 objects 只能用在 side 视图上`);
    else if (!Array.isArray(view.objects) || view.objects.length === 0 || view.objects.length > 8 || view.objects.some(kind => !words(kind, 80)) || new Set(view.objects).size !== view.objects.length) {
      problems.push(`视图 ${view.view_id} 的 objects 无效：一到八个不重复的对象种类`);
    } else for (const kind of view.objects) if (!kinds.has(kind)) problems.push(`视图 ${view.view_id} 的对象种类 ${kind} 没有对象读取器`);
  }
  return problems;
}
