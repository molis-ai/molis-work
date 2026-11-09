import { PRESENTATION_ATTENTION_STATES, PRESENTATION_FIELD_ROLES, PRESENTATION_FORM_KINDS, PRESENTATION_LIMITS, PRESENTATION_OVERVIEW_INPUT_SCHEMA,
  PRESENTATION_OVERVIEW_OUTPUT_SCHEMA, PRESENTATION_OVERVIEW_OUTPUT_TYPE, PRESENTATION_VALUES_INPUT_SCHEMA, PRESENTATION_VALUES_INPUT_TYPE,
  PRESENTATION_VALUES_OUTPUT_SCHEMA, PRESENTATION_VALUES_OUTPUT_TYPE, SURFACE_SLOT_KINDS } from "@molis-ai/molis-work-contracts/platform/presentation";
import { STATE_RING_FAMILIES, type TextRef } from "@molis-ai/molis-work-contracts/platform/ui";
import { canonicalJsonText, isRecord } from "./json-value.js";
import { textRefProblems, tryOwnedTextRef } from "./ui/text-ref.js";

// The one check of a Manifest's `presentation` (specs/shared-sources-and-surfaces §5, §7): `parsePluginManifest` runs it at install for
// every plugin alike, and an author runs the same function on its own Manifest (SSC-06, IUI-01, IUI-22). Each problem names the part by
// its path, so a refused install says which item is wrong. A word a person reads (`label`, `note`) is checked by `wordProblems`.

/** What the directory says of one action reference: it is there, it is not, or this check cannot tell (another provider's action). */
export type PresentationCatalogAnswer = "present" | "absent" | "unknown";
export type PresentationCatalog = (capabilityId: string, version: number) => PresentationCatalogAnswer;

/**
 * A catalog over a list of action definitions. `parsePluginManifest` passes this Manifest's own: a reference to one of its own actions has to
 * name a version it declares, and one to another provider is 「不知道」 and passes; the install-time check against the whole directory is
 * the composition service's (batch 15 S-1). `complete` says the list is the whole directory, so whatever is not in it is absent.
 */
export function presentationCatalog(actions: unknown, complete = false): PresentationCatalog {
  const versions = new Map<string, Set<unknown>>();
  for (const action of Array.isArray(actions) ? actions : []) {
    if (isRecord(action) && typeof action.capability_id === "string") versions.set(action.capability_id, (versions.get(action.capability_id) ?? new Set()).add(action.version));
  }
  return (capabilityId, version) => versions.get(capabilityId)?.has(version) ? "present" : complete || versions.has(capabilityId) ? "absent" : "unknown";
}

const FIELD_KEY = /^[a-z][a-z0-9_]*$/u;
const ACTION_REF = /^([^@\s]+)@([1-9]\d*)$/u;
const ROLES: ReadonlySet<string> = new Set(PRESENTATION_FIELD_ROLES);
const RING_STATES: ReadonlySet<string> = new Set(STATE_RING_FAMILIES.flatMap(family => [...family.states]));
const ATTENTION: ReadonlySet<string> = new Set(PRESENTATION_ATTENTION_STATES);
const SLOTS: ReadonlySet<string> = new Set(SURFACE_SLOT_KINDS);

const member = (set: ReadonlySet<string>, value: unknown): value is string => typeof value === "string" && set.has(value);
const sameJson = (left: unknown, right: unknown) => canonicalJsonText(left) === canonicalJsonText(right);
const metadataOf = (action: Record<string, unknown>) => isRecord(action.action) ? action.action : {};
const isFieldKey = (value: unknown): value is string => typeof value === "string" && value.length <= PRESENTATION_LIMITS.field_key && FIELD_KEY.test(value);

function extraKeys(value: Record<string, unknown>, allowed: readonly string[], at: string): string[] {
  const extra = Object.keys(value).filter(key => !allowed.includes(key));
  return extra.length > 0 ? [`${at} 不认这些字段：${extra.join("、")}`] : [];
}

/** A word a person reads, written in a declaration, has to be a text reference; `wordProblems` checks what it says. */
function textProblems(value: unknown, at: string): string[] {
  return isRecord(value) ? [] : [`${at} 必须是文字引用`];
}

interface ObjectContext {
  readonly kinds: ReadonlySet<string>;
  readonly valued: ReadonlySet<string>;
  readonly seen: Set<string>;
  readonly catalog: PresentationCatalog;
}

/**
 * The problems of a Manifest's `presentation`, empty when it has none or it is right. `catalog` answers for each action an object names;
 * left out, it is this Manifest's own actions. The overview action and the `start` it offers are always this Manifest's own (SSC-18).
 */
export function validatePresentationDeclaration(manifest: { readonly presentation?: unknown; readonly actions?: unknown; readonly plugin_id?: unknown },
  catalog: PresentationCatalog = presentationCatalog(manifest.actions)): string[] {
  const declaration = manifest.presentation;
  if (declaration === undefined) return [];
  if (!isRecord(declaration)) return ["presentation 必须是对象"];
  const actions = Array.isArray(manifest.actions) ? manifest.actions.filter(isRecord) : [];
  const problems = [...extraKeys(declaration, ["objects", "overview"], "presentation"), ...valuesActionProblems(actions)];
  if (!Array.isArray(declaration.objects) || declaration.objects.length > PRESENTATION_LIMITS.objects) {
    problems.push(`presentation.objects 必须是数组，至多 ${PRESENTATION_LIMITS.objects} 个对象`);
  } else {
    const context: ObjectContext = { kinds: declaredKinds(actions), valued: valuedKinds(actions), seen: new Set(), catalog };
    declaration.objects.forEach((object, index) => problems.push(...objectProblems(object, `presentation.objects[${index}]`, context)));
  }
  if (declaration.overview !== undefined) problems.push(...overviewProblems(declaration.overview, actions));
  return [...problems, ...wordProblems(declaration, manifest.plugin_id)];
}

/**
 * The words a declaration writes (`label`, `note`), with the text tools of `/ui` (a-section §2.3, §2.4): never a `literal`, so no word of
 * the interface is written past translation, and a key under this plugin's own prefix or `common.`, so a plugin cannot show its words as
 * another owner's. One that is not a text reference at all is reported where it is written.
 */
function wordProblems(declaration: Record<string, unknown>, pluginId: unknown): string[] {
  const words: Array<readonly [string, Record<string, unknown>]> = [];
  (Array.isArray(declaration.objects) ? declaration.objects : []).forEach((object, index) => {
    (isRecord(object) && Array.isArray(object.fields) ? object.fields : []).forEach((field, at) => {
      if (isRecord(field) && isRecord(field.label)) words.push([`presentation.objects[${index}].fields[${at}].label`, field.label]);
    });
    (isRecord(object) && Array.isArray(object.actions) ? object.actions : []).forEach((action, at) => {
      if (isRecord(action) && isRecord(action.unavailable) && isRecord(action.unavailable.reason)) {
        words.push([`presentation.objects[${index}].actions[${at}].unavailable.reason`, action.unavailable.reason]);
      }
    });
  });
  if (isRecord(declaration.overview) && isRecord(declaration.overview.note)) words.push(["presentation.overview.note", declaration.overview.note]);
  return words.flatMap(([at, ref]) => {
    const problems = textRefProblems(ref, { literal: false });
    if (problems.length > 0) return problems.map(problem => `${at}：${problem}`);
    return typeof pluginId === "string" && tryOwnedTextRef(ref as TextRef, pluginId) === null ? [`${at} 的键要用本插件自己的文字前缀，或平台共有的 common.`] : [];
  });
}

const isValuesAction = (metadata: Record<string, unknown>) => metadata.input_type === PRESENTATION_VALUES_INPUT_TYPE && metadata.output_type === PRESENTATION_VALUES_OUTPUT_TYPE;

/** The object kinds this plugin already declares, by a search source or an action's subjects. A values action does not count: it would let a declaration bring its own type. */
function declaredKinds(actions: readonly Record<string, unknown>[]): ReadonlySet<string> {
  const kinds = new Set<string>();
  for (const metadata of actions.map(metadataOf).filter(metadata => !isValuesAction(metadata))) {
    for (const kind of Array.isArray(metadata.subject_kinds) ? metadata.subject_kinds : []) if (typeof kind === "string") kinds.add(kind);
    const source = isRecord(metadata.search_source) && Array.isArray(metadata.search_source.kinds) ? metadata.search_source.kinds : [];
    for (const entry of source) if (isRecord(entry) && typeof entry.kind === "string") kinds.add(entry.kind);
  }
  return kinds;
}

/** The kinds this plugin's values actions answer for: the owner gives the values each time it is asked, so a declared object needs one. */
function valuedKinds(actions: readonly Record<string, unknown>[]): ReadonlySet<string> {
  const subjects = actions.map(metadataOf).filter(isValuesAction).flatMap(metadata => Array.isArray(metadata.subject_kinds) ? metadata.subject_kinds : []);
  return new Set(subjects.filter((kind): kind is string => typeof kind === "string"));
}

/** A values action is the platform's shape: read-only, with the schemas `definePresentationValuesAction` gives, so the service can ask any owner alike. */
export function isPresentationValuesReader(action: unknown): boolean {
  if (!isRecord(action)) return false;
  const metadata = metadataOf(action);
  return isValuesAction(metadata) && action.operation === "query" && metadata.kind === "query" && metadata.effect === "read"
    && Array.isArray(metadata.permissions) && !metadata.permissions.includes("model:invoke")
    && isRecord(metadata.execution) && metadata.execution.cost === "none"
    && sameJson(metadata.input_schema, PRESENTATION_VALUES_INPUT_SCHEMA) && sameJson(metadata.output_schema, PRESENTATION_VALUES_OUTPUT_SCHEMA);
}

function valuesActionProblems(actions: readonly Record<string, unknown>[]): string[] {
  return actions.filter(action => isValuesAction(metadataOf(action)) && !isPresentationValuesReader(action))
    .map(action => `给值的动作 ${String(action.capability_id)} 要用 definePresentationValuesAction 定义：只读 query，不调用模型或计费，输入输出 schema 与平台定的一样`);
}

function objectProblems(object: unknown, at: string, context: ObjectContext): string[] {
  if (!isRecord(object)) return [`${at} 必须是对象`];
  const problems = extraKeys(object, ["kind", "fields", "status", "forms", "actions", "text"], at);
  const kind = object.kind;
  if (!member(context.kinds, kind)) problems.push(`${at}.kind 要是本插件的搜索来源或动作已经声明的对象种类`);
  else if (context.seen.has(kind)) problems.push(`${at}.kind ${kind} 重复声明`);
  else if (!context.valued.has(kind)) problems.push(`${at}.kind ${kind} 没有给值的动作：用 definePresentationValuesAction 声明一个列出这种对象的读取动作`);
  if (typeof kind === "string") context.seen.add(kind);
  const fields = declaredFields(object.fields, `${at}.fields`, problems);
  const states = statusStates(object.status, `${at}.status`, fields, problems);
  if (!isRecord(object.forms)) problems.push(`${at}.forms 必须是对象`);
  else problems.push(...formProblems(object.forms, `${at}.forms`, fields));
  problems.push(...objectActionProblems(object.actions, `${at}.actions`, { fields, states, catalog: context.catalog }));
  if (object.text !== undefined) {
    if (!isRecord(object.text)) problems.push(`${at}.text 必须是对象`);
    else problems.push(...extraKeys(object.text, ["lines"], `${at}.text`), ...keyListProblems(object.text.lines, `${at}.text.lines`, fields, PRESENTATION_LIMITS.text_lines));
  }
  return problems;
}

/** The declared fields by key, with their role. A field whose key is wrong is reported and left out, so it is not reported again where it is used. */
function declaredFields(value: unknown, at: string, problems: string[]): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  if (!Array.isArray(value) || value.length === 0 || value.length > PRESENTATION_LIMITS.fields) {
    problems.push(`${at} 要写 1 到 ${PRESENTATION_LIMITS.fields} 个字段`);
    return fields;
  }
  value.forEach((field, index) => {
    const path = `${at}[${index}]`;
    if (!isRecord(field)) { problems.push(`${path} 必须是对象`); return; }
    problems.push(...extraKeys(field, ["key", "role", "label"], path));
    if (!member(ROLES, field.role)) problems.push(`${path}.role 不是平台的字段角色`);
    if (field.label !== undefined) problems.push(...textProblems(field.label, `${path}.label`));
    if (!isFieldKey(field.key)) problems.push(`${path}.key 要以小写字母开头，只用 a-z、0-9 和 _，至多 ${PRESENTATION_LIMITS.field_key} 个字符`);
    else if (fields.has(field.key)) problems.push(`${path}.key ${field.key} 重复`);
    else fields.set(field.key, String(field.role));
  });
  return fields;
}

/** The plugin's own states the status map names; `when.status` may name only these. The status field is one whose role is `status`. */
function statusStates(value: unknown, at: string, fields: ReadonlyMap<string, string>, problems: string[]): ReadonlySet<string> {
  if (value === undefined) return new Set();
  if (!isRecord(value)) { problems.push(`${at} 必须是对象`); return new Set(); }
  problems.push(...extraKeys(value, ["field", "map"], at));
  if (typeof value.field !== "string" || fields.get(value.field) !== "status") problems.push(`${at}.field 要是本对象一个角色为 status 的字段`);
  const entries = isRecord(value.map) ? Object.entries(value.map) : [];
  if (entries.length === 0 || entries.length > PRESENTATION_LIMITS.status_values) problems.push(`${at}.map 要写 1 到 ${PRESENTATION_LIMITS.status_values} 个状态`);
  for (const [state, mapping] of entries) {
    const path = `${at}.map.${state}`;
    if (state.length === 0 || state.length > PRESENTATION_LIMITS.field_key) problems.push(`${at}.map 的状态名要写 1 到 ${PRESENTATION_LIMITS.field_key} 个字符`);
    if (!isRecord(mapping)) { problems.push(`${path} 必须是对象`); continue; }
    problems.push(...extraKeys(mapping, ["ring", "attention"], path));
    if (!member(RING_STATES, mapping.ring)) problems.push(`${path}.ring 不是状态环的状态`);
    if (mapping.attention !== undefined && !member(ATTENTION, mapping.attention)) problems.push(`${path}.attention 不是平台的提醒标记`);
  }
  return new Set(entries.map(([state]) => state));
}

function formProblems(forms: Record<string, unknown>, at: string, fields: ReadonlyMap<string, string>): string[] {
  const problems = extraKeys(forms, PRESENTATION_FORM_KINDS, at);
  for (const kind of PRESENTATION_FORM_KINDS) {
    const form = forms[kind];
    if (form === undefined) continue;
    if (!isRecord(form)) problems.push(`${at}.${kind} 必须是对象`);
    else problems.push(...extraKeys(form, ["fields"], `${at}.${kind}`), ...keyListProblems(form.fields, `${at}.${kind}.fields`, fields, PRESENTATION_LIMITS.fields));
  }
  return problems;
}

/** A list of this object's field keys, each declared and listed once. */
function keyListProblems(value: unknown, at: string, fields: ReadonlyMap<string, string>, max: number): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) return [`${at} 要列 1 到 ${max} 个字段键`];
  const undeclared = value.filter(key => typeof key !== "string" || !fields.has(key)).map(String);
  return [...(undeclared.length > 0 ? [`${at} 列了没有声明的字段：${undeclared.join("、")}`] : []), ...(new Set(value).size < value.length ? [`${at} 有重复的字段`] : [])];
}

interface ActionContext { readonly fields: ReadonlyMap<string, string>; readonly states: ReadonlySet<string>; readonly catalog: PresentationCatalog }

function objectActionProblems(value: unknown, at: string, context: ActionContext): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > PRESENTATION_LIMITS.actions) return [`${at} 必须是数组，至多 ${PRESENTATION_LIMITS.actions} 个动作`];
  const refs = new Set<unknown>();
  return value.flatMap((action, index) => {
    const path = `${at}[${index}]`;
    if (!isRecord(action)) return [`${path} 必须是对象`];
    const problems = [...extraKeys(action, ["ref", "primary", "when", "input_from", "unavailable"], path), ...refProblems(action.ref, `${path}.ref`, context.catalog)];
    if (refs.has(action.ref)) problems.push(`${path}.ref 重复`);
    refs.add(action.ref);
    if (action.primary !== undefined && typeof action.primary !== "boolean") problems.push(`${path}.primary 必须是 true 或 false`);
    return [...problems, ...whenProblems(action.when, `${path}.when`, context.states), ...inputFromProblems(action.input_from, `${path}.input_from`, context.fields),
      ...unavailableProblems(action, value, `${path}.unavailable`, context.states)];
  });
}

function refProblems(value: unknown, at: string, catalog: PresentationCatalog): string[] {
  const match = typeof value === "string" && value.length <= PRESENTATION_LIMITS.action_ref ? ACTION_REF.exec(value) : null;
  if (!match) return [`${at} 要写成 capability_id@version`];
  return catalog(match[1], Number(match[2])) === "absent" ? [`${at} ${String(value)} 不在动作目录里（本插件的动作要写声明过的版本）`] : [];
}

function whenProblems(value: unknown, at: string, states: ReadonlySet<string>): string[] {
  if (value === undefined) return [];
  if (!isRecord(value)) return [`${at} 必须是对象`];
  const problems = extraKeys(value, ["status", "slots"], at);
  const listed = (list: unknown, allowed: ReadonlySet<string>) => Array.isArray(list) && list.length > 0 && list.every(entry => member(allowed, entry));
  if (value.status !== undefined && !listed(value.status, states)) problems.push(`${at}.status 只能列本对象 status.map 里的状态`);
  if (value.slots !== undefined && !listed(value.slots, SLOTS)) problems.push(`${at}.slots 只能列平台的位置`);
  return problems;
}

function unavailableProblems(action: Record<string, unknown>, actions: readonly unknown[], at: string, states: ReadonlySet<string>): string[] {
  const notice = action.unavailable;
  if (notice === undefined) return [];
  if (!isRecord(notice)) return [`${at} 必须是对象`];
  const problems = [...extraKeys(notice, ["when", "reason", "next"], at), ...textProblems(notice.reason, `${at}.reason`)];
  const when = notice.when;
  if (!isRecord(when)) problems.push(`${at}.when 必须是对象`);
  else {
    problems.push(...extraKeys(when, ["status", "codes"], `${at}.when`));
    if (when.status === undefined && when.codes === undefined) problems.push(`${at}.when 要列出状态或不可用原因码`);
    if (when.status !== undefined && (!Array.isArray(when.status) || !when.status.length || !when.status.every(status => member(states, status)))) {
      problems.push(`${at}.when.status 只能列本对象 status.map 里的状态`);
    }
    if (when.codes !== undefined && (!Array.isArray(when.codes) || !when.codes.length || !when.codes.every(code => typeof code === "string" && code.trim().length > 0))) {
      problems.push(`${at}.when.codes 要列非空的不可用原因码`);
    }
  }
  if (notice.next !== undefined && (typeof notice.next !== "string" || notice.next === action.ref
    || !actions.some(candidate => isRecord(candidate) && candidate.ref === notice.next))) problems.push(`${at}.next 必须引用本对象声明的另一个动作`);
  return problems;
}

/** Input key → field key. The input keys are the target action's: its input schema checks them when the person acts. */
function inputFromProblems(value: unknown, at: string, fields: ReadonlyMap<string, string>): string[] {
  if (value === undefined) return [];
  if (!isRecord(value) || Object.keys(value).length === 0) return [`${at} 要写成「输入键 → 字段键」的对象`];
  return Object.entries(value).flatMap(([input, field]) => input.length > 0 && typeof field === "string" && fields.has(field) ? [] : [`${at}.${input} 要指向本对象声明的字段`]);
}

const ownAction = (actions: readonly Record<string, unknown>[], capabilityId: unknown, version: unknown) =>
  actions.find(action => typeof capabilityId === "string" && action.capability_id === capabilityId && action.version === version);

/** The overview names one of this Manifest's actions, defined with `definePresentationOverviewAction`: its schemas are the platform's, exactly (SSC-18). */
function overviewProblems(value: unknown, actions: readonly Record<string, unknown>[]): string[] {
  const at = "presentation.overview";
  if (!isRecord(value)) return [`${at} 必须是对象`];
  const problems = extraKeys(value, ["capability_id", "version", "note", "start"], at);
  const action = ownAction(actions, value.capability_id, value.version);
  const metadata = action ? metadataOf(action) : undefined;
  if (!action || !metadata) problems.push(`${at} 要指向本 Manifest 自己的一个动作（capability_id 和 version 都要对上）`);
  else if (action.operation !== "query" || metadata.effect !== "read" || metadata.output_type !== PRESENTATION_OVERVIEW_OUTPUT_TYPE
    || !sameJson(metadata.input_schema, PRESENTATION_OVERVIEW_INPUT_SCHEMA) || !sameJson(metadata.output_schema, PRESENTATION_OVERVIEW_OUTPUT_SCHEMA)) {
    problems.push(`${at} 指向的动作 ${String(value.capability_id)} 要用 definePresentationOverviewAction 定义：只读 query，输入输出 schema 与平台定的一字不差`);
  }
  if (value.note !== undefined) problems.push(...textProblems(value.note, `${at}.note`));
  return [...problems, ...startProblems(value.start, `${at}.start`, actions)];
}

/** Where the person may start from: at most 3, each one of this Manifest's own actions, listed once (SSC-18, install half). */
function startProblems(value: unknown, at: string, actions: readonly Record<string, unknown>[]): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length === 0 || value.length > PRESENTATION_LIMITS.overview_start) return [`${at} 要列 1 到 ${PRESENTATION_LIMITS.overview_start} 个入口`];
  const seen = new Set<string>();
  return value.flatMap((entry, index) => {
    const path = `${at}[${index}]`;
    if (!isRecord(entry) || extraKeys(entry, ["capability_id", "version"], path).length > 0 || !ownAction(actions, entry.capability_id, entry.version)) {
      return [`${path} 要是本 Manifest 自己的一个动作，只写 capability_id 和 version`];
    }
    const key = `${String(entry.capability_id)}@${String(entry.version)}`;
    if (seen.has(key)) return [`${path} 重复`];
    seen.add(key);
    return [];
  });
}
