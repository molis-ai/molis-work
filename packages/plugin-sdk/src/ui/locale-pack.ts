import { LOCALE_TAG, TEXT_REF_LIMITS, UI_FILE_LIMITS, UI_FORMAT_VERSIONS, type UiFileResult, type UiLocalePack, type UiMessage } from "@molis-ai/molis-work-contracts/platform/ui";
import { keyOwnerProblem, messageOwnerOf, PLATFORM_TEXT_OWNER, SHARED_OWNER, STABLE_KEY } from "../message-declarations.js";
import { checkFormatVersion, childPath, finishFile, isObject, readObject, readStrictJson, type ProblemSink } from "./file-reader.js";
import { localeChain } from "./text-lookup.js";

// A language file (specs/font-and-skin-system/a-section-contract.md §3.5, §5). `parseLocalePack` reads one file; `inspectLocaleSet` compares the
// languages of one owner. An author's tool and the platform call the same two functions, so they see the same result.

const PLURAL_FORMS = new Set(["zero", "one", "two", "few", "many", "other"]);
const ARG_NAME = /^[A-Za-z_]\w*$/u;
const BRACED = /\{([^{}]*)\}/gu;
const MARKUP = /[<>&"']/u;
const MARKUP_FIX = "换成 ’、“ ”、and、›，或者把这部分写成字符串参数";

export interface LocalePackOptions {
  /** Which file, for the problems. */
  readonly file?: string;
  /**
   * `true` only for a content pack, decided by its parsed `manifest.kind === "content"` and never by the language file. Everywhere else a word has to be
   * free of `<`, `>`, `&`, `"`, `'`, which is what lets `${t()}` go straight into HTML. A content pack's words come from Skill frontmatter and from a
   * person's own text, where `don't`, `<file>` and `R&D` are ordinary. They never reach `t`'s index, and `say` and `createTextReader` escape the whole text.
   */
  readonly contentPack?: boolean;
}

function textProblems(sink: ProblemSink, path: string, text: unknown, contentPack: boolean): void {
  if (typeof text !== "string" || text === "" || text.length > TEXT_REF_LIMITS.literal) {
    sink.add(path, "ui.locale_text", `文字必须是 1 到 ${TEXT_REF_LIMITS.literal} 个字符的字符串`, "改成一句不为空的文字");
    return;
  }
  for (const [, inner] of text.matchAll(BRACED)) {
    if (inner!.includes("|")) sink.add(path, "ui.locale_old_plural", `{${inner}} 是旧的单复数写法，语言文件不收`, `写成 { "plural_arg": "<参数名>", "forms": { "one": "…", "other": "…" } }，每种形式写整句`);
    else if (!ARG_NAME.test(inner!)) sink.add(path, "ui.locale_placeholder", `占位符 {${inner}} 不合规`, "参数名用英文字母、数字和下划线，以字母或下划线开头");
  }
  if (!contentPack && MARKUP.test(text)) sink.add(path, "ui.locale_markup", "文字里不许有 <、>、&、\"、'：t 的结果要能直接拼进 HTML", MARKUP_FIX);
}

function messageProblems(sink: ProblemSink, path: string, message: unknown, contentPack: boolean): void {
  if (!isObject(message)) {
    textProblems(sink, path, message, contentPack);
    return;
  }
  const plural = readObject(sink, message, path, ["plural_arg", "forms"]);
  if (plural === null) return;
  if (typeof plural.plural_arg !== "string" || !ARG_NAME.test(plural.plural_arg)) sink.add(childPath(path, "plural_arg"), "ui.locale_placeholder", "plural_arg 必须是参数名", "写这句话按哪个数字选形式，如 count");
  const forms = readObject(sink, plural.forms, childPath(path, "forms"), ["other"], [...PLURAL_FORMS].filter((form) => form !== "other"));
  for (const [form, text] of Object.entries(forms ?? {})) textProblems(sink, childPath(childPath(path, "forms"), form), text, contentPack);
}

function keyProblems(sink: ProblemSink, path: string, key: string, owner: unknown): void {
  if (key.length > TEXT_REF_LIMITS.key || !STABLE_KEY.test(key)) {
    sink.add(path, "ui.locale_key", `键最长 ${TEXT_REF_LIMITS.key} 个字符，形状是 <主人>.<区域>.<名称>（小写，2～5 段）`, "按这个形状改");
    return;
  }
  if (typeof owner !== "string") return;
  const prefix = key.split(".")[0];
  const allowed = prefix === messageOwnerOf(owner) || (prefix === SHARED_OWNER && owner === PLATFORM_TEXT_OWNER);
  if (!allowed) sink.add(path, "ui.locale_key_owner", `键要以主人的名字 ${messageOwnerOf(owner)} 开头`, prefix === SHARED_OWNER ? `${SHARED_OWNER} 的词归 ${PLATFORM_TEXT_OWNER}，直接用，不要自己写` : `改成 ${messageOwnerOf(owner)}.…`);
}

function packFieldProblems(sink: ProblemSink, pack: Record<string, unknown>): void {
  checkFormatVersion(sink, pack, UI_FORMAT_VERSIONS.locale);
  if (typeof pack.owner !== "string" || pack.owner === "" || pack.owner.length > TEXT_REF_LIMITS.owner) sink.add("$.owner", "ui.locale_owner", `owner 必须是 1 到 ${TEXT_REF_LIMITS.owner} 个字符的字符串`, "写 plugin_id，平台主人写它的名字");
  else {
    const problem = keyOwnerProblem(pack.owner);
    if (problem !== null) sink.add("$.owner", "ui.locale_owner", problem, "改了以后键的第一段跟着改");
  }
  if (typeof pack.locale !== "string" || !LOCALE_TAG.test(pack.locale)) sink.add("$.locale", "ui.locale_tag", "locale 不是语言标记", "写 zh、en、zh-Hant、pt-BR 这样的标记");
  if (pack.direction !== undefined && pack.direction !== "ltr" && pack.direction !== "rtl") sink.add("$.direction", "ui.locale_direction", "direction 只能是 ltr 或 rtl", "改成其中一个，从左到右可以不写");
  if (pack.revision !== undefined && (!Number.isSafeInteger(pack.revision) || (pack.revision as number) < 1)) sink.add("$.revision", "ui.locale_revision", "revision 必须是正整数", "随包的文件不写它");
}

/** One language file. `pack.owner` is what the file says of itself: a caller compares it with the owner from the trusted catalog, and it grants nothing. */
export function parseLocalePack(source: string, options: LocalePackOptions = {}): UiFileResult<UiLocalePack> {
  const read = readStrictJson(source, options.file ?? "locale.json", UI_FILE_LIMITS.locale);
  if (!read.ok) return read;
  const { sink, value } = read;
  const pack = readObject(sink, value, "$", ["format_version", "owner", "locale", "messages"], ["direction", "revision"]);
  if (pack === null) return finishFile(sink, value);
  packFieldProblems(sink, pack);
  if (pack.messages !== undefined && !isObject(pack.messages)) sink.add("$.messages", "ui.file_wrong_type", "messages 必须是对象", "写成 { \"<键>\": \"<文字>\" }");
  for (const [key, message] of isObject(pack.messages) ? Object.entries(pack.messages) : []) {
    const path = childPath("$.messages", key);
    keyProblems(sink, path, key, pack.owner);
    messageProblems(sink, path, message, options.contentPack === true);
  }
  return finishFile(sink, value);
}

const textsOf = (message: UiMessage): readonly string[] => (typeof message === "string" ? [message] : Object.values(message.forms));

/** Every argument a message reads. */
function argsOf(message: UiMessage): readonly string[] {
  const names = textsOf(message).flatMap((text) => [...text.matchAll(BRACED)].map(([, name]) => name!));
  return [...new Set(typeof message === "string" ? names : [message.plural_arg, ...names])].sort();
}

export interface LocaleSetProblem {
  readonly file: string;
  readonly code: string;
  readonly locale: string;
  readonly key: string | null;
  readonly reason: string;
  readonly fix: string;
  /** The platform refuses the set. A language short of a key is coverage, not a fault: that language shows the default's word. */
  readonly blocking: boolean;
}

export interface LocaleSetOptions {
  /** The owner's default language, the one every other language is compared with. */
  readonly default: string;
  /** As in `parseLocalePack`, and only for a content pack. */
  readonly contentPack?: boolean;
  /** Where the files are, for the problems. Left out, `locales`. */
  readonly directory?: string;
}

function messageSetProblems(message: UiMessage, locale: string, contentPack: boolean): ReadonlyArray<Pick<LocaleSetProblem, "code" | "reason" | "fix" | "blocking">> {
  const problems: Array<Pick<LocaleSetProblem, "code" | "reason" | "fix" | "blocking">> = [];
  if (!contentPack && textsOf(message).some((text) => MARKUP.test(text))) problems.push({ code: "ui.locale_markup", reason: "文字里有 <、>、&、\"、'", fix: MARKUP_FIX, blocking: true });
  if (typeof message === "string") return problems;
  const missing = new Intl.PluralRules(locale).resolvedOptions().pluralCategories.filter((form) => message.forms[form] === undefined);
  if (missing.length > 0) problems.push({ code: "ui.locale_plural_forms", reason: `${locale} 还缺 ${missing.join("、")} 这几种形式，缺的会用 other`, fix: "补上这几种形式", blocking: false });
  const hidden = Object.entries(message.forms).filter(([, text]) => !text.includes(`{${message.plural_arg}}`)).map(([form]) => form);
  if (hidden.length > 0) problems.push({ code: "ui.hidden_number", reason: `${hidden.join("、")} 这几种形式没有写出 {${message.plural_arg}}，读的人看不到数字`, fix: `每种形式都写出 {${message.plural_arg}}`, blocking: false });
  return problems;
}

/**
 * The languages of one owner against each other: a key short in another language, a key only another language has (so the default is short of it), arguments that
 * differ, plural forms the language needs, a plural that hides its number, markup characters. The default short of a key, differing arguments and
 * markup characters are `blocking`.
 */
export function inspectLocaleSet(packs: readonly UiLocalePack[], options: LocaleSetOptions): readonly LocaleSetProblem[] {
  const file = (locale: string) => `${options.directory ?? "locales"}/${locale}.json`;
  const problems: LocaleSetProblem[] = [];
  const base = packs.find((pack) => pack.locale === options.default);
  if (base === undefined) problems.push({ file: file(options.default), code: "ui.locale_default_missing", locale: options.default, key: null, reason: `没有默认语言 ${options.default} 的语言文件`, fix: `加上 ${file(options.default)}`, blocking: true });
  for (const pack of packs) {
    const add = (key: string | null, problem: Pick<LocaleSetProblem, "code" | "reason" | "fix" | "blocking">) => problems.push({ file: file(pack.locale), locale: pack.locale, key, ...problem });
    if (base !== undefined && pack.owner !== base.owner) add(null, { code: "ui.locale_owner", reason: `owner 是 ${pack.owner}，默认语言的文件写的是 ${base.owner}`, fix: "同一个主人的语言文件 owner 要相同", blocking: true });
    for (const [key, message] of Object.entries(pack.messages)) {
      for (const problem of messageSetProblems(message, pack.locale, options.contentPack === true)) add(key, problem);
      if (base === undefined || pack === base) continue;
      const original = Object.hasOwn(base.messages, key) ? base.messages[key] : undefined;
      if (original === undefined) add(key, { code: "ui.locale_extra_key", reason: `默认语言 ${base.locale} 没有这个键`, fix: `在 ${file(base.locale)} 加上它，或删掉这一行`, blocking: true });
      else if (argsOf(original).join() !== argsOf(message).join()) add(key, { code: "ui.locale_args", reason: `参数和默认语言不一样：${argsOf(message).join("、") || "没有"} 对 ${argsOf(original).join("、") || "没有"}`, fix: "两边写一样的参数", blocking: true });
    }
    if (base === undefined || pack === base) continue;
    for (const key of Object.keys(base.messages)) {
      if (!Object.hasOwn(pack.messages, key)) add(key, { code: "ui.locale_missing_key", reason: `${pack.locale} 还没有这个键，会显示默认语言的文字`, fix: "补上译文", blocking: false });
    }
  }
  return problems;
}

/** Which of the available languages answers a request: the tag, then its base inside its own language (zh-CN to zh), then `fallback`. */
export function matchLocale(requested: string | null, available: readonly string[], fallback: string): string {
  return (requested === null ? [] : localeChain(requested)).find((tag) => available.includes(tag)) ?? fallback;
}
