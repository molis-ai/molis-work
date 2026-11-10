import { TEXT_DATE_STYLES, TEXT_NUMBER_STYLES, TEXT_REF_LIMITS, type OwnedTextRef, type TextArg, type TextArgs, type TextArgValue, type TextDateOptions, type TextDateStyle, type TextNumberStyle, type TextRef } from "@molis-ai/molis-work-contracts/platform/ui";
import { keyOwnerProblem, messageOwnerOf, PLATFORM_TEXT_OWNER, SHARED_OWNER, STABLE_KEY } from "./text-keys.js";
import { uiTextErrors } from "./text-errors.js";
import { isTextTimeZone } from "./message-format.js";

// A piece of text as data (specs/font-and-skin-system/a-section-contract.md §2). `TEXT_REF_SCHEMA` cannot say which fields go together, so
// `textRefProblems` is what refuses a bad reference, and `ownedTextRef` is the one place an owner is written into one.

/**
 * The first segment of every key an owner writes: the last segment of a plugin_id (`io.molis.work.notes` -> `notes`), or a platform owner's own
 * name. One rule for the SDK, the Host's text context and the author's tools; nothing beside it takes a plugin_id apart.
 */
export const textKeyPrefix = (owner: string): string => messageOwnerOf(owner);

/**
 * Where owners are found by the first segment of a key (`t`), two owners of one prefix would answer each other's keys: refuses `owner` when
 * `taken`, the owner that already holds its prefix, is another one.
 */
export function refuseSharedTextPrefix(taken: string | null | undefined, owner: string): void {
  if (taken !== null && taken !== undefined && taken !== owner) {
    throw uiTextErrors.text_owner_conflict(`${taken} 和 ${owner} 的键都以 ${textKeyPrefix(owner)} 开头，t 分不出是谁的：改其中一个的 plugin_id 最后一段`);
  }
}

/** The shape of a placeholder, the same as the locale file parser holds messages to. */
const ARG_NAME = /^[A-Za-z_]\w*$/u;
const REF_FIELDS = new Set(["key", "args", "fallback", "literal"]);
const ARG_VALUE_FIELDS = { text: ["text"], number: ["number", "style"], date: ["at", "style", "time_zone"] } as const;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown, longest: number): value is string => typeof value === "string" && value !== "" && value.length <= longest;

/** The value of a date. Stored as it is and formatted when it is shown. */
export const dateArg = (at: string, style: TextDateStyle, options?: TextDateOptions): TextArgValue => ({
  kind: "date", at, style, ...(options?.time_zone === undefined ? {} : { time_zone: options.time_zone }),
});
/** A number with a style. A plain number needs none of this: `t(key, { count: 3 })`, shown without grouping. */
export const numberArg = (number: number, style?: TextNumberStyle): TextArgValue => ({ kind: "number", number, ...(style === undefined ? {} : { style }) });

/** What business code writes, as a reference stores it. */
export function textArgs(args: TextArgs): TextArg[] {
  return Object.entries(args).map(([name, value]): TextArg => {
    if (typeof value === "number") return { name, kind: "number", number: value };
    return typeof value === "object" && value !== null ? { name, ...value } : { name, kind: "text", text: String(value ?? "") };
  });
}

function argValueProblem(arg: Record<string, unknown>, kind: keyof typeof ARG_VALUE_FIELDS, at: string): string | null {
  if (kind === "text") return typeof arg.text === "string" && arg.text.length <= TEXT_REF_LIMITS.arg_text ? null : `${at} 的 text 必须是最长 ${TEXT_REF_LIMITS.arg_text} 个字符的字符串`;
  if (kind === "number") {
    if (typeof arg.number !== "number" || !Number.isFinite(arg.number)) return `${at} 的 number 必须是有限的数字`;
    return arg.style === undefined || (TEXT_NUMBER_STYLES as readonly unknown[]).includes(arg.style) ? null : `${at} 是 number，style 必须是 ${TEXT_NUMBER_STYLES.join("、")} 之一`;
  }
  if (!isText(arg.at, TEXT_REF_LIMITS.arg_at)) return `${at} 的 at 必须是最长 ${TEXT_REF_LIMITS.arg_at} 个字符的日期`;
  if (arg.time_zone !== undefined && !isTextTimeZone(arg.time_zone)) return `${at} 的 time_zone 必须是支持的时区`;
  return (TEXT_DATE_STYLES as readonly unknown[]).includes(arg.style) ? null : `${at} 是 date，style 必须是 ${TEXT_DATE_STYLES.join("、")} 之一`;
}

function argProblems(arg: unknown, at: string): string[] {
  if (!isObject(arg)) return [`${at} 必须是对象`];
  const kind = arg.kind;
  if (kind !== "text" && kind !== "number" && kind !== "date") return [`${at} 的 kind 必须是 text、number、date 之一`];
  const allowed = new Set<string>(["name", "kind", ...ARG_VALUE_FIELDS[kind]]);
  const problems = Object.keys(arg).filter((field) => !allowed.has(field)).map((field) => `${at} 是 ${kind}，不能写 ${field.slice(0, 40)}`);
  if (typeof arg.name !== "string" || arg.name.length > TEXT_REF_LIMITS.arg_name || !ARG_NAME.test(arg.name)) problems.push(`${at} 的 name 必须以英文字母或下划线开头，最长 ${TEXT_REF_LIMITS.arg_name} 个字符`);
  const value = argValueProblem(arg, kind, at);
  return value === null ? problems : [...problems, value];
}

function argsProblems(args: unknown): string[] {
  if (args === undefined) return [];
  if (!Array.isArray(args)) return ["args 必须是数组"];
  if (args.length > TEXT_REF_LIMITS.args) return [`args 最多 ${TEXT_REF_LIMITS.args} 个`];
  const names = args.map((arg: unknown) => (isObject(arg) ? arg.name : undefined));
  const repeated = names.some((name, index) => name !== undefined && names.indexOf(name) !== index);
  return [...args.flatMap((arg: unknown, index) => argProblems(arg, `args[${index}]`)), ...(repeated ? ["args 里有重复的 name"] : [])];
}

function keyRefProblems(ref: Record<string, unknown>, owned: boolean): string[] {
  const problems: string[] = [];
  if (typeof ref.key !== "string" || ref.key.length > TEXT_REF_LIMITS.key || !STABLE_KEY.test(ref.key)) problems.push(`key 必须是 <主人>.<区域>.<名称>（小写，2～5 段），最长 ${TEXT_REF_LIMITS.key} 个字符`);
  if (ref.fallback !== undefined && !isText(ref.fallback, TEXT_REF_LIMITS.fallback)) problems.push(`fallback 必须是 1 到 ${TEXT_REF_LIMITS.fallback} 个字符的字符串`);
  if (owned && !isText(ref.owner, TEXT_REF_LIMITS.owner)) problems.push(`绑过主人的引用，owner 必须是 1 到 ${TEXT_REF_LIMITS.owner} 个字符的字符串`);
  return [...problems, ...argsProblems(ref.args)];
}

function literalRefProblems(ref: Record<string, unknown>): string[] {
  const problems = isText(ref.literal, TEXT_REF_LIMITS.literal) ? [] : [`literal 必须是 1 到 ${TEXT_REF_LIMITS.literal} 个字符的字符串`];
  const beside = ["args", "fallback", "owner"].filter((field) => ref[field] !== undefined);
  return beside.length === 0 ? problems : [...problems, `literal 不翻译，不能同时写 ${beside.join("、")}`];
}

export interface TextRefCheck {
  /** `false`: this position takes no `literal`, so a word cannot be written in to get around translation. */
  readonly literal?: boolean;
  /** `false`: this position has no owner, as in a draft, so it takes no key. */
  readonly key?: boolean;
  /** `true`: this position holds a bound reference, so a key needs its `owner`. By default it is a declaration, where an `owner` is refused. */
  readonly owned?: boolean;
}

/** What is wrong with a reference; empty when it is sound. The schema lets through `{}`, `{ key, literal }`, an argument without its value and a style of the wrong kind: all of them stop here. */
export function textRefProblems(value: unknown, check: TextRefCheck = {}): readonly string[] {
  if (!isObject(value)) return ["文字引用必须是对象"];
  const owned = check.owned === true;
  const stray = Object.keys(value).filter((field) => !REF_FIELDS.has(field) && !(owned && field === "owner"));
  const problems = stray.map((field) => (field === "owner" ? "声明里不能写 owner：主人由平台从可信目录填" : `文字引用不认识 ${field.slice(0, 40)}`));
  const hasKey = value.key !== undefined;
  const hasLiteral = value.literal !== undefined;
  if (hasKey === hasLiteral) return [...problems, hasKey ? "key 和 literal 只能写一个" : "key 和 literal 必须写一个"];
  if (hasLiteral && check.literal === false) return [...problems, "这个位置不收 literal：写键，词放进语言文件"];
  if (hasKey && check.key === false) return [...problems, "这个位置没有主人，不收键：写 literal"];
  return [...problems, ...(hasKey ? keyRefProblems(value, owned) : literalRefProblems(value))];
}

function bindingProblems(ref: unknown, owner: unknown): readonly string[] {
  if (!isText(owner, TEXT_REF_LIMITS.owner)) return [`主人必须是 1 到 ${TEXT_REF_LIMITS.owner} 个字符的字符串`];
  const problems = textRefProblems(ref);
  if (problems.length > 0 || !isObject(ref) || ref.literal !== undefined) return problems;
  const ownerProblem = keyOwnerProblem(owner);
  if (ownerProblem !== null) return [ownerProblem];
  const prefix = String(ref.key).split(".")[0];
  return prefix === SHARED_OWNER || prefix === messageOwnerOf(owner) ? [] : [`键 ${String(ref.key)} 必须以主人的名字 ${messageOwnerOf(owner)} 开头，通用词以 ${SHARED_OWNER} 开头`];
}

function bound(ref: TextRef, owner: string): OwnedTextRef {
  if ("literal" in ref && ref.literal !== undefined) return { literal: ref.literal };
  // A `literal` written as undefined beside a key is not one, and is not carried along.
  const { key, args, fallback } = ref as Extract<TextRef, { key: string }>;
  return { key, ...(args === undefined ? {} : { args }), ...(fallback === undefined ? {} : { fallback }), owner: key.startsWith(`${SHARED_OWNER}.`) ? PLATFORM_TEXT_OWNER : owner };
}

/**
 * Binds a declared reference to the owner from the trusted catalog: the only gate of a value an action returned. `common.*` goes to the platform's
 * owner; any other key has to start with the owner's own name, so a plugin cannot show its words as another's.
 */
export function ownedTextRef(ref: TextRef, owner: string): OwnedTextRef {
  const problems = bindingProblems(ref, owner);
  if (problems.length > 0) throw uiTextErrors.text_ref_invalid(`文字引用不合规：${problems.join("；")}`);
  return bound(ref, owner);
}

/** The same check for a page reading a value: a bad reference gives `null`, and the page shows the unavailable text rather than failing. */
export function tryOwnedTextRef(ref: unknown, owner: string): OwnedTextRef | null {
  return bindingProblems(ref, owner).length === 0 ? bound(ref as TextRef, owner) : null;
}
