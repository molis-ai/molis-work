import { TEXT_REF_LIMITS, UI_COMPONENT_VALUES, UI_FILE_LIMITS, UI_FILE_PATTERNS, UI_FONT_METRICS, UI_FONT_ROLE_NAMES, UI_FORMAT_VERSIONS, UI_RESOURCE_KINDS, UI_RESOURCE_LOADS, UI_ROLE_TYPES, UI_ROLE_VARIES_BY, type UiFileResult, type UiFontSchemeFile, type UiResourceRegistry, type UiRoleSpec, type UiSkinFile, type UiSpecFile } from "@molis-ai/molis-work-contracts/platform/ui";
import { isRecord } from "../json-value.js";
import { checkFormatVersion, childPath, finishFile, readObject, readStrictJson, type ProblemSink } from "./file-reader.js";
import { PLUGIN_ICON_NAMES } from "./icon-names.js";
import { textRefProblems } from "./text-ref.js";
import { tokenValueProblem, tokenValueRefs } from "./token-values.js";

// The files of the appearance (specs/font-and-skin-system/a-section-contract.md §3). Each is read the same way: bytes, strict JSON, then its structure, with
// nothing kept that is not asked for. These are the checks a shape cannot make: which roles exist, which may be written, what refers to what.

export interface UiFileOptions {
  /** Which file, for the problems. */
  readonly file?: string;
}

/** Keywords that end a whole `font-family` declaration when written bare, which is how a name without a space is written. */
const CSS_WIDE_KEYWORDS = new Set(["inherit", "initial", "unset", "revert", "revert-layer", "default"]);
/** A package-relative path. Each segment starts with a letter, a digit or `_`, so there is no `..`, no hidden file, no absolute path and no backslash. */
const PATH_SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/u;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const LARGEST_CODE_POINT = 0x10ffff;
const THEME_MAPS = ["light", "dark"] as const;
const TERMINAL_MAPS = ["unset", "light", "dark"] as const;

const isOneOf = <T>(value: unknown, allowed: readonly T[]): value is T => (allowed as readonly unknown[]).includes(value);
const isPositiveInteger = (value: unknown): boolean => Number.isSafeInteger(value) && (value as number) > 0;

function checkPattern(sink: ProblemSink, path: string, value: unknown, pattern: RegExp, what: string): void {
  if (typeof value !== "string" || !pattern.test(value)) sink.add(path, "ui.file_value", `${what}的形状不对：${JSON.stringify(value)?.slice(0, 80) ?? "空"}`, `${what}只用允许的字符，形状见 ${String(pattern)}`);
}

function checkDefinitionRef(sink: ProblemSink, path: string, value: unknown): void {
  const ref = readObject(sink, value, path, ["id", "revision"]);
  if (ref === null) return;
  checkPattern(sink, childPath(path, "id"), ref.id, UI_FILE_PATTERNS.definition_id, "id ");
  if (!isPositiveInteger(ref.revision)) sink.add(childPath(path, "revision"), "ui.file_value", "revision 必须是正整数", "写 1、2 这样的数");
}

function checkIdentity(sink: ProblemSink, file: Record<string, unknown>, current: number): void {
  checkFormatVersion(sink, file, current);
  checkPattern(sink, "$.id", file.id, UI_FILE_PATTERNS.definition_id, "id ");
  if (!isPositiveInteger(file.revision)) sink.add("$.revision", "ui.file_value", "revision 必须是正整数", "写 1、2 这样的数");
}

function checkTextRef(sink: ProblemSink, path: string, value: unknown): void {
  for (const reason of textRefProblems(value)) sink.add(path, "ui.file_text_ref", reason, "内置的写 key，用户起的写 literal");
}

function checkFollows(sink: ProblemSink, roles: ReadonlyMap<string, { role: UiRoleSpec; path: string }>): void {
  for (const { role, path } of roles.values()) {
    if (role.follows !== undefined && !roles.has(role.follows)) sink.add(childPath(path, "follows"), "ui.spec_unknown_role", `follows 指向的 ${role.follows} 不在规格里`, "写规格里有的角色");
    else if (role.follows !== undefined && roles.get(role.follows)!.role.varies_by !== role.varies_by) sink.add(childPath(path, "follows"), "ui.spec_follows_axis", `${role.name} 和它跟随的 ${role.follows} 分的份数不一样`, "两个角色的 varies_by 要相同");
    if (role.alias_of !== undefined && !roles.has(role.alias_of)) sink.add(childPath(path, "alias_of"), "ui.spec_unknown_role", `alias_of 指向的 ${role.alias_of} 不在规格里`, "写规格里有的角色");
    const seen = new Set([role.name]);
    for (let next = role.follows; next !== undefined; next = roles.get(next)?.role.follows) {
      if (seen.has(next)) {
        sink.add(childPath(path, "follows"), "ui.role_cycle", `follows 成环：${[...seen, next].join(" → ")}`, "断开其中一环");
        break;
      }
      seen.add(next);
    }
  }
}

function readRoles(sink: ProblemSink, groups: unknown): Map<string, { role: UiRoleSpec; path: string }> {
  const roles = new Map<string, { role: UiRoleSpec; path: string }>();
  if (!Array.isArray(groups) || groups.length === 0) {
    sink.add("$.groups", "ui.file_wrong_type", "groups 必须是不空的数组", "写成 [{ \"group\": …, \"roles\": […] }]");
    return roles;
  }
  groups.forEach((value: unknown, groupIndex) => {
    const groupPath = `$.groups[${groupIndex}]`;
    const group = readObject(sink, value, groupPath, ["group", "roles"]);
    if (group === null) return;
    checkPattern(sink, childPath(groupPath, "group"), group.group, UI_FILE_PATTERNS.role_name, "组名");
    if (!Array.isArray(group.roles)) {
      sink.add(childPath(groupPath, "roles"), "ui.file_wrong_type", "roles 必须是数组", "写成 [{ \"name\": …, \"type\": …, \"varies_by\": … }]");
      return;
    }
    group.roles.forEach((entry: unknown, index) => {
      const path = `${groupPath}.roles[${index}]`;
      const role = readObject(sink, entry, path, ["name", "type", "varies_by"], ["follows", "alias_of", "locked"]);
      if (role === null) return;
      checkPattern(sink, childPath(path, "name"), role.name, UI_FILE_PATTERNS.role_name, "角色名");
      if (!isOneOf(role.type, UI_ROLE_TYPES)) sink.add(childPath(path, "type"), "ui.file_value", "type 不认识", `写 ${UI_ROLE_TYPES.join("、")} 之一`);
      if (!isOneOf(role.varies_by, UI_ROLE_VARIES_BY)) sink.add(childPath(path, "varies_by"), "ui.file_value", "varies_by 不认识", `写 ${UI_ROLE_VARIES_BY.join("、")} 之一`);
      if (typeof role.name !== "string") return;
      if (roles.has(role.name)) sink.add(childPath(path, "name"), "ui.spec_repeated_role", `角色 ${role.name} 写了两次`, "只留一个");
      roles.set(role.name, { role: entry as UiRoleSpec, path });
    });
  });
  return roles;
}

function readFontRoles(sink: ProblemSink, fontRoles: unknown, roles: ReadonlyMap<string, unknown>): Set<string> {
  const tokens = new Set<string>();
  if (!Array.isArray(fontRoles)) {
    sink.add("$.font_roles", "ui.file_wrong_type", "font_roles 必须是数组", `列出 ${UI_FONT_ROLE_NAMES.join("、")}`);
    return tokens;
  }
  const named = new Set<unknown>();
  fontRoles.forEach((value: unknown, index) => {
    const path = `$.font_roles[${index}]`;
    const fontRole = readObject(sink, value, path, ["name", "tokens"]);
    if (fontRole === null) return;
    if (!isOneOf(fontRole.name, UI_FONT_ROLE_NAMES)) sink.add(childPath(path, "name"), "ui.file_value", "字体角色不认识", `写 ${UI_FONT_ROLE_NAMES.join("、")} 之一`);
    if (named.has(fontRole.name)) sink.add(childPath(path, "name"), "ui.spec_repeated_role", `字体角色 ${String(fontRole.name)} 写了两次`, "只留一个");
    named.add(fontRole.name);
    const declared = readObject(sink, fontRole.tokens, childPath(path, "tokens"), [], ["family", "weight", "tracking", "size", "line_height"]);
    for (const [field, token] of Object.entries(declared ?? {})) {
      const tokenPath = childPath(childPath(path, "tokens"), field);
      checkPattern(sink, tokenPath, token, UI_FILE_PATTERNS.role_name, "令牌名");
      if (roles.has(token as string) || tokens.has(token as string)) sink.add(tokenPath, "ui.spec_repeated_role", `令牌 ${String(token)} 已经有别的角色在用`, "换一个名字：一个令牌只有一个来源");
      tokens.add(token as string);
    }
  });
  for (const name of UI_FONT_ROLE_NAMES) if (!named.has(name)) sink.add("$.font_roles", "ui.file_missing_field", `缺少字体角色 ${name}`, `加上 ${name}`);
  return tokens;
}

function checkLocked(sink: ProblemSink, roles: ReadonlyMap<string, { role: UiRoleSpec; path: string }>, tokens: ReadonlySet<string>): void {
  for (const { role, path } of roles.values()) {
    if (role.locked === undefined || !isOneOf(role.type, UI_ROLE_TYPES)) continue;
    const lockedPath = childPath(path, "locked");
    const problem = tokenValueProblem(role.locked, role.type);
    if (problem !== null) {
      sink.add(lockedPath, "ui.file_token_value", problem, "写成规格第 3.2 节的结构");
      continue;
    }
    for (const ref of tokenValueRefs(role.locked)) if (!roles.has(ref) && !tokens.has(ref)) sink.add(lockedPath, "ui.spec_unknown_role", `引用的 ${ref} 不在规格里`, "写规格里有的角色");
  }
}

function checkComponents(sink: ProblemSink, components: unknown): void {
  if (!Array.isArray(components) || !components.length) {
    sink.add("$.components", "ui.file_wrong_type", "components 必须是不空的数组", "列出规格板实际实现的组件");
    return;
  }
  const seen = new Set<string>();
  const { groups, uses, intents, data } = UI_COMPONENT_VALUES;
  const choices = { group: groups, use: uses, data, icon: PLUGIN_ICON_NAMES };
  components.forEach((entry: unknown, index) => {
    const path = `$.components[${index}]`;
    const row = readObject(sink, entry, path, ["kind", "catalog", "name", "description", "group", "use", "intents", "data", "icon"]);
    if (!row) return;
    const kind = childPath(path, "kind");
    checkPattern(sink, kind, row.kind, UI_FILE_PATTERNS.definition_id, "组件 kind ");
    if (typeof row.kind === "string") {
      if (seen.has(row.kind)) sink.add(kind, "ui.spec_repeated_component", `组件 ${row.kind} 写了两次`, "一个 kind 只登记一条");
      seen.add(row.kind);
    }
    if (typeof row.catalog !== "string" || !row.catalog.trim() || row.catalog.length > 80) sink.add(childPath(path, "catalog"), "ui.file_value", "catalog 必须是 1 到 80 字符的组件名", "写对应原语的名称");
    checkTextRef(sink, childPath(path, "name"), row.name);
    checkTextRef(sink, childPath(path, "description"), row.description);
    for (const [field, allowed] of Object.entries(choices)) {
      if (!isOneOf<unknown>(row[field], allowed)) sink.add(childPath(path, field), "ui.file_value", `${field} 的取值不认识`, "使用共同规格允许的值");
    }
    if (!Array.isArray(row.intents) || row.intents.some(intent => !isOneOf(intent, intents)) || new Set(row.intents).size !== row.intents.length
      || (row.use === "part" && !row.intents.length)) {
      sink.add(childPath(path, "intents"), "ui.file_value", "intents 须列出互不重复的用途，可装入的组件至少有一种", "按组件能承担的用途填写");
    }
  });
}

/** `resources/ui-spec.json`: every role, its type and what may vary. */
export function parseUiSpecFile(source: string, options: UiFileOptions = {}): UiFileResult<UiSpecFile> {
  const read = readStrictJson(source, options.file ?? "ui-spec.json", UI_FILE_LIMITS.spec);
  if (!read.ok) return read;
  const { sink, value } = read;
  const spec = readObject(sink, value, "$", ["format_version", "id", "revision", "baseline_skin", "baseline_font", "groups", "font_roles", "components"]);
  if (spec === null) return finishFile(sink, value);
  checkIdentity(sink, spec, UI_FORMAT_VERSIONS.spec);
  checkDefinitionRef(sink, "$.baseline_skin", spec.baseline_skin);
  checkDefinitionRef(sink, "$.baseline_font", spec.baseline_font);
  const roles = readRoles(sink, spec.groups);
  const tokens = readFontRoles(sink, spec.font_roles, roles);
  checkComponents(sink, spec.components);
  checkFollows(sink, roles);
  checkLocked(sink, roles, tokens);
  return finishFile(sink, value);
}

function checkSkinRole(sink: ProblemSink, path: string, name: string, value: unknown, where: UiRoleSpec["varies_by"], roles: ReadonlyMap<string, UiRoleSpec>, tokens: ReadonlySet<string>, isBaseline: boolean): void {
  checkPattern(sink, path, name, UI_FILE_PATTERNS.role_name, "角色名");
  const role = roles.get(name);
  if (role === undefined) {
    sink.add(path, "ui.skin_unknown_role", `规格里没有角色 ${name.slice(0, 60)}`, "只写规格里有的角色，皮肤不能加令牌");
    return;
  }
  if (role.locked !== undefined) sink.add(path, "ui.skin_locked_role", `${name} 不可定制：触控和焦点底线不能被皮肤改`, "删掉这一行");
  if (role.alias_of !== undefined && !isBaseline) sink.add(path, "ui.skin_alias_role", `${name} 在后层样式里绑到了 ${role.alias_of}，写了不会生效`, `删掉这一行，改 ${role.alias_of}`);
  if (role.varies_by !== where) sink.add(path, "ui.skin_wrong_axis", `${name} 的 varies_by 是 ${role.varies_by}，不该写在这里`, role.varies_by === "theme" ? "写进 light 和 dark" : role.varies_by === "none" ? "写进 shared" : "写进 terminal");
  const problem = tokenValueProblem(value, role.type);
  if (problem !== null) {
    sink.add(path, "ui.file_token_value", problem, "写成规格第 3.2 节的结构");
    return;
  }
  for (const ref of tokenValueRefs(value as Parameters<typeof tokenValueRefs>[0])) if (!roles.has(ref) && !tokens.has(ref)) sink.add(path, "ui.skin_unknown_role", `引用的 ${ref} 不在规格里`, "写规格里有的角色");
}

const specRoles = (spec: UiSpecFile): ReadonlyMap<string, UiRoleSpec> => new Map(spec.groups.flatMap((group) => group.roles.map((role) => [role.name, role] as const)));
const specFontTokens = (spec: UiSpecFile): ReadonlySet<string> => new Set(spec.font_roles.flatMap((role) => Object.values(role.tokens)));

/**
 * A skin. It is read against the one spec it names, because a role a skin may not write is the spec's to say: a `locked` role, or an `alias_of` role outside
 * the baseline, where the value would silently do nothing.
 */
export function parseSkinFile(source: string, spec: UiSpecFile, options: UiFileOptions = {}): UiFileResult<UiSkinFile> {
  const read = readStrictJson(source, options.file ?? "skin.json", UI_FILE_LIMITS.skin);
  if (!read.ok) return read;
  const { sink, value } = read;
  const skin = readObject(sink, value, "$", ["format_version", "id", "revision", "spec", "name", "recommended_font", "light", "dark", "shared", "terminal"]);
  if (skin === null) return finishFile(sink, value);
  checkIdentity(sink, skin, UI_FORMAT_VERSIONS.skin);
  checkDefinitionRef(sink, "$.spec", skin.spec);
  checkDefinitionRef(sink, "$.recommended_font", skin.recommended_font);
  checkTextRef(sink, "$.name", skin.name);
  const named = isRecord(skin.spec) ? skin.spec : {};
  if (named.id !== spec.id || named.revision !== spec.revision) sink.add("$.spec", "ui.skin_spec_mismatch", `这款皮肤写给 ${String(named.id)} 第 ${String(named.revision)} 版，现在的规格是 ${spec.id} 第 ${spec.revision} 版`, "按现在的规格改好，再改 spec");
  const isBaseline = skin.id === spec.baseline_skin.id && skin.revision === spec.baseline_skin.revision;
  const roles = specRoles(spec);
  const tokens = specFontTokens(spec);
  const checkMap = (path: string, map: unknown, where: UiRoleSpec["varies_by"]) => {
    for (const [name, token] of Object.entries(readObject(sink, map, path, [], Object.keys(isRecord(map) ? map : {})) ?? {})) checkSkinRole(sink, childPath(path, name), name, token, where, roles, tokens, isBaseline);
  };
  for (const theme of THEME_MAPS) checkMap(`$.${theme}`, skin[theme], "theme");
  checkMap("$.shared", skin.shared, "none");
  const terminal = readObject(sink, skin.terminal, "$.terminal", [], TERMINAL_MAPS);
  for (const name of TERMINAL_MAPS) if (terminal?.[name] !== undefined) checkMap(`$.terminal.${name}`, terminal[name], "terminal");
  return finishFile(sink, value);
}

function checkFontName(sink: ProblemSink, path: string, value: unknown): void {
  checkPattern(sink, path, value, UI_FILE_PATTERNS.font_name, "字体名");
  if (typeof value === "string" && CSS_WIDE_KEYWORDS.has(value.toLowerCase())) sink.add(path, "ui.font_keyword", `${value} 是 CSS 关键字，不是字体名：写进去整条 font-family 都会失效`, "写真实的字体名");
}

function checkFontRole(sink: ProblemSink, path: string, value: unknown, faces: ReadonlySet<unknown>): void {
  const role = readObject(sink, value, path, [], ["families", "weight", "tracking_em", "size_px", "line_height"]);
  if (role === null) return;
  if (role.weight !== undefined && !(Number.isInteger(role.weight) && (role.weight as number) >= 1 && (role.weight as number) <= 1000)) sink.add(childPath(path, "weight"), "ui.file_value", "weight 必须是 1 到 1000 的整数", "写 400、500 这样的数");
  if (role.tracking_em !== undefined && !(typeof role.tracking_em === "number" && Math.abs(role.tracking_em) <= 1)) sink.add(childPath(path, "tracking_em"), "ui.file_value", "tracking_em 必须是 -1 到 1 的数", "写 -0.011 这样的数");
  for (const [field, [min, max]] of Object.entries(UI_FONT_METRICS)) {
    const metric = role[field];
    if (metric !== undefined && !(typeof metric === "number" && metric >= min && metric <= max)) {
      sink.add(childPath(path, field), "ui.file_value", `${field} 必须是 ${min} 到 ${max} 的数`, `填写 ${min} 到 ${max} 之间的数`);
    }
  }
  if (role.families === undefined) return;
  if (!Array.isArray(role.families) || role.families.length === 0) {
    sink.add(childPath(path, "families"), "ui.file_wrong_type", "families 必须是不空的数组", "写成 [{ \"system\": … }, { \"face\": … }]");
    return;
  }
  role.families.forEach((entry: unknown, index) => {
    const entryPath = `${path}.families[${index}]`;
    const family = readObject(sink, entry, entryPath, [], ["system", "face"]);
    if (family === null) return;
    if ((family.system === undefined) === (family.face === undefined)) sink.add(entryPath, "ui.file_value", "system 和 face 只能写一个", "系统字体写 system，方案自带的字体写 face");
    if (family.system !== undefined) checkFontName(sink, childPath(entryPath, "system"), family.system);
    if (family.face === undefined) return;
    checkFontName(sink, childPath(entryPath, "face"), family.face);
    if (!faces.has(family.face)) sink.add(childPath(entryPath, "face"), "ui.font_unknown_face", `faces 里没有 ${String(family.face).slice(0, 60)}`, "在 faces 里加上它，或写 system");
  });
}

function checkUnicodeRange(sink: ProblemSink, path: string, entry: unknown): void {
  checkPattern(sink, path, entry, UI_FILE_PATTERNS.unicode_range, "unicode_range ");
  if (typeof entry !== "string") return;
  const [start, end = start] = entry.slice(2).split("-").map((digits) => Number.parseInt(digits, 16));
  if (start! > LARGEST_CODE_POINT || end! > LARGEST_CODE_POINT || start! > end!) sink.add(path, "ui.file_value", `${entry} 不是有效的码位范围`, `码位不超过 U+10FFFF，范围从小到大`);
}

function checkFontFace(sink: ProblemSink, path: string, value: unknown): void {
  const face = readObject(sink, value, path, ["family", "weight", "unicode_range", "resource"]);
  if (face === null) return;
  checkFontName(sink, childPath(path, "family"), face.family);
  const weight = Array.isArray(face.weight) && face.weight.length === 2 && (face.weight[0] as number) <= (face.weight[1] as number) ? face.weight : [face.weight];
  if (!weight.every((one: unknown) => Number.isInteger(one) && (one as number) >= 1 && (one as number) <= 1000)) sink.add(childPath(path, "weight"), "ui.file_value", "weight 必须是 1 到 1000 的整数，或从小到大的两个整数", "写 400 或 [100, 900]");
  checkPattern(sink, childPath(path, "resource"), face.resource, UI_FILE_PATTERNS.resource_id, "资源 id ");
  if (!Array.isArray(face.unicode_range) || face.unicode_range.length === 0) sink.add(childPath(path, "unicode_range"), "ui.file_wrong_type", "unicode_range 必须是不空的数组", "写 [\"U+0000-00FF\"] 这样的范围");
  else face.unicode_range.forEach((entry: unknown, index) => checkUnicodeRange(sink, `${path}.unicode_range[${index}]`, entry));
}

/** A font scheme: the families, weights and tracking of each role, and the faces it brings. */
export function parseFontScheme(source: string, options: UiFileOptions = {}): UiFileResult<UiFontSchemeFile> {
  const read = readStrictJson(source, options.file ?? "font-scheme.json", UI_FILE_LIMITS.font);
  if (!read.ok) return read;
  const { sink, value } = read;
  const scheme = readObject(sink, value, "$", ["format_version", "id", "revision", "name", "roles", "faces"]);
  if (scheme === null) return finishFile(sink, value);
  checkIdentity(sink, scheme, UI_FORMAT_VERSIONS.font);
  checkTextRef(sink, "$.name", scheme.name);
  const faces = Array.isArray(scheme.faces) ? scheme.faces : [];
  if (!Array.isArray(scheme.faces)) sink.add("$.faces", "ui.file_wrong_type", "faces 必须是数组", "没有自带字体就写 []");
  faces.forEach((face: unknown, index) => checkFontFace(sink, `$.faces[${index}]`, face));
  const declared = new Set(faces.map((face: unknown) => (isRecord(face) ? face.family : undefined)));
  const roles = readObject(sink, scheme.roles, "$.roles", UI_FONT_ROLE_NAMES);
  for (const name of UI_FONT_ROLE_NAMES) if (roles?.[name] !== undefined) checkFontRole(sink, `$.roles.${name}`, roles[name], declared);
  return finishFile(sink, value);
}

function checkPackagePath(sink: ProblemSink, path: string, value: unknown): void {
  if (typeof value !== "string" || !value.split("/").every((segment) => PATH_SEGMENT.test(segment))) sink.add(path, "ui.registry_path", `路径 ${JSON.stringify(value)?.slice(0, 80) ?? "空"} 不是包内相对路径`, "写 fonts/a.woff2 这样的路径，不以 / 开头，不写 ..，不写反斜杠");
}

function checkResourceRow(sink: ProblemSink, path: string, value: unknown, ids: Set<unknown>): void {
  const binary = isRecord(value) && (value.kind === "font" || value.kind === "asset");
  const row = readObject(sink, value, path, ["id", "owner", "package", "path", "load", "kind", ...(binary ? ["sha256", "license"] : [])], ["route"]);
  if (row === null) return;
  checkPattern(sink, childPath(path, "id"), row.id, UI_FILE_PATTERNS.resource_id, "资源 id ");
  if (ids.has(row.id)) sink.add(childPath(path, "id"), "ui.registry_repeated_id", `资源 ${String(row.id)} 登记了两次`, "只留一行");
  ids.add(row.id);
  if (!isOneOf(row.kind, UI_RESOURCE_KINDS)) sink.add(childPath(path, "kind"), "ui.file_value", "kind 不认识：这张表只收随产品发行、有包内路径的文件", `写 ${UI_RESOURCE_KINDS.join("、")} 之一`);
  if (!isOneOf(row.load, UI_RESOURCE_LOADS)) sink.add(childPath(path, "load"), "ui.file_value", "load 不认识", `写 ${UI_RESOURCE_LOADS.join("、")} 之一`);
  if (typeof row.owner !== "string" || row.owner === "" || row.owner.length > TEXT_REF_LIMITS.owner) sink.add(childPath(path, "owner"), "ui.file_value", `owner 必须是 1 到 ${TEXT_REF_LIMITS.owner} 个字符的字符串`, "写主人的名字");
  checkPattern(sink, childPath(path, "package"), row.package, PACKAGE_NAME, "包名");
  checkPackagePath(sink, childPath(path, "path"), row.path);
  if (row.route !== undefined) checkPattern(sink, childPath(path, "route"), row.route, UI_FILE_PATTERNS.route, "route ");
  if (!binary) return;
  checkPattern(sink, childPath(path, "sha256"), row.sha256, SHA256, "sha256 ");
  const license = readObject(sink, row.license, childPath(path, "license"), ["spdx", "source"], ["notice_path"]);
  if (license === null) return;
  for (const name of ["spdx", "source"]) if (license[name] !== undefined && (typeof license[name] !== "string" || license[name] === "")) sink.add(childPath(childPath(path, "license"), name), "ui.file_value", `${name} 必须是不空的字符串`, "写清楚许可和来源");
  if (license.notice_path !== undefined) checkPackagePath(sink, childPath(childPath(path, "license"), "notice_path"), license.notice_path);
}

/** `resources/registry.json`: what ships with the product, and where it is in its package. */
export function parseResourceRegistry(source: string, options: UiFileOptions = {}): UiFileResult<UiResourceRegistry> {
  const read = readStrictJson(source, options.file ?? "registry.json", UI_FILE_LIMITS.registry);
  if (!read.ok) return read;
  const { sink, value } = read;
  const registry = readObject(sink, value, "$", ["format_version", "resources"]);
  if (registry === null) return finishFile(sink, value);
  checkFormatVersion(sink, registry, UI_FORMAT_VERSIONS.registry);
  if (registry.resources !== undefined && !Array.isArray(registry.resources)) sink.add("$.resources", "ui.file_wrong_type", "resources 必须是数组", "一行一个资源");
  const ids = new Set<unknown>();
  (Array.isArray(registry.resources) ? registry.resources : []).forEach((row: unknown, index) => checkResourceRow(sink, `$.resources[${index}]`, row, ids));
  return finishFile(sink, value);
}
