#!/usr/bin/env node
// Read-only UI microcopy style, beginner-comprehension, cross-language leak, terminology & source multi-locale hygiene audit
// against skills/molis-plugin-dev/text-and-appearance.md and docs/system/GLOSSARY.md.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { isMainScript } from "./script-paths.mjs";

const CATALOG_SPECIMEN_KEY = /(?:^workbench\.env\.|\b(?:catalog|specimens?|board-frame|style-probe)\b)/u;
const LOCALE_JSON_FILE = /(?:^|\/)locales\/(?:[^/]+\/)*[^/]+\.json$/u;
const WORKBENCH_MAIN_PACK = /^apps\/workbench\/resources\/locales\/[^/]+\.json$/u;
const CATALOG_SUBPACK_FILE = /\/locales\/catalog\/[^/]+\.json$/u;

// Developer-focused surfaces (Tier B in text-and-appearance.md): retain standard developer nouns (Git, MCP, CLI, API Key) while banning internal/retired jargon.
const TIER_B_FILE = /^(?:plugins\/native\/(?:coding|git|diff)\/|plugins\/official-integrations\/|plugins\/content\/)/u;
const TIER_B_KEY = /^(?:common\.connector\.|workbench\.(?:mcp-access|settings-agent-diagnostics|settings-call-diagnostics|settings-work-records|settings-connector|connector-|connection-service|call-row|agent-[a-z-]+-prompt|settings-prompts)\.)/u;

const ZH_RULES = [
  {
    id: "zh.arch-jargon",
    label: "内部架构黑话外露",
    pattern: /宿主|权威(?:状态|记录|事件|存储)|视图投影|幂等运行|游标|落盘|终端通道|对象挂载位|异步上下文|门禁\s*G1|父子\s*Contract|Runtime\s+payload|出站动作未兑现/iu,
  },
  {
    id: "zh.retired-term",
    label: "退役或禁用界面术语",
    pattern: /\bFunctions\b|判断函数|动作库|共同目录|消费场景|\bBoard\b|能力板|原生\s*Agent|本地\s*Agent|本机\s*Agent|终端\s*Agent|Agent\s*CLI|\bConnectors\b|原子任务|子代理|\bCharacters?\b|(?:执行|停止|命令|写入|原)回执/u,
  },
  {
    id: "zh.beginner-jargon",
    label: "日常界面暴露 AI / 计算机高门槛术语",
    tierAOnly: true,
    pattern: /(?<!Pi\s)\bRuntime\b|(?<!插件)运行时|(?<!Pi\s)\bAgent\b(?!S?\.md)|\bPrompt\b|上下文窗口|放进上下文|整理上下文|调用方|调用者|提供方|规格校验|规格板|不是副本沙箱|不开放任意\s*Shell|(?:新建|创建|恢复|升格为|推进这个|给这个|条|个)\s*Goal\b|(?:这条|使用)\s*Item\b/u,
  },
  {
    id: "zh.im-thread-term",
    label: "讨论界面中文文案不要保留英文 Thread（应改用「话题」或「讨论串」）",
    filePattern: /^packages\/im-ui\//u,
    pattern: /\bThreads?\b/iu,
  },
  {
    id: "zh.bureaucratic-tone",
    label: "官腔或生硬行政措辞（应改用自然、温和的人话）",
    pattern: /未能完成操作|已被拒绝|予以|该操作|尚未|暂无(?!$|(?:数据|内容|记录)?。?$)/u,
  },
  {
    id: "zh.colloquial-or-filler",
    label: "口语俚语或冗余套话",
    pattern: /连看都不看|你够不到它|还没有叫醒过|AI\s*自己说的(?!，Molis\s*没有核对)|您可以在|你可以通?过|请点击|点击此处|当前尚未|暂无任何|正在为您|本页面用于/u,
  },
  { id: "zh.bare-empty", label: "空洞的空状态文案", pattern: /^(?:暂无(?:数据|内容|记录)?。?|无数据。?|列表为空。?)$/u },
  { id: "zh.bent-quotes", label: "中文界面混用弯引号（应统一用「…」）", pattern: /(?<!\\|\[)[“”](?!\])/u },
  { id: "zh.arrow-path", label: "菜单或设置路径使用箭头（应统一用 › ）", pattern: /(?:设置|个人|项目|偏好|模型|记忆|能力|插件|工作台|目录|入口)\s*(?:->|→)\s*/u },
];

const EN_PROPER_NOUNS = new Set([
  "Molis", "Work", "Goal", "Goals", "Frame", "Inbox", "Feed", "Schedule", "Coding", "Git", "Diff",
  "Cognia", "Jelly", "Shelf", "Pages", "Forms", "Dataset", "PPT", "PowerPoint", "Issue", "Brief",
  "Alchemist", "Studio", "Prologue", "AI", "Runtime", "Agent", "Agents", "Skill", "Skills", "Character", "Characters",
  "TypeSafe", "MCP", "OAuth", "API", "CLI", "TUI", "SSH", "HTTP", "HTTPS", "JSON", "CSV", "PDF", "Markdown", "Word", "ID",
  "GitHub", "GitLab", "Bitbucket", "Gmail", "Google", "Drive", "Calendar", "Microsoft", "Outlook", "OneDrive", "SharePoint", "Teams",
  "Slack", "Discord", "Notion", "Linear", "Jira", "Confluence", "Asana", "Monday", "ClickUp", "Trello", "Atlassian", "X",
  "Figma", "Canva", "Adobe", "Loom", "Dropbox", "Box", "Airtable", "Supabase", "Vercel", "Cloudflare", "Stripe", "Sentry",
  "HubSpot", "Salesforce", "Intercom", "LinkedIn", "WeChat", "Feishu", "Lark", "Zoom", "Hugging", "Face",
  "OpenAI", "Anthropic", "Claude", "Code", "Codex", "Cursor", "OpenCode", "Grok", "Build", "Pi", "MiniMax",
  "Console", "Developer", "Platform", "Portal", "App", "Hub", "Open", "Marketplace",
]);

const EN_RULES = [
  { id: "en.arch-jargon", label: "English internal architecture jargon", pattern: /\b(?:host execution bounds|idempotent run ledger|canonical state|runtime payload)\b/iu },
  { id: "en.retired-term", label: "English retired or drifted term", pattern: /\b(?:Functions|subtasks?|native agent|local agent|terminal agent|Agent CLI|atomic tasks?)\b/u },
  { id: "en.beginner-jargon", label: "Everyday surface exposes technical AI jargon", tierAOnly: true, pattern: /\b(?:local runtime|terminal runtime|Runtime Prompt|context window)\b/iu },
  { id: "en.round-drift", label: "Use 'turn' instead of 'round' for AI turns", pattern: /\b(?:this|next|previous|last|each|every)\s+round\b|\bby\s+round\b/iu },
];

const CJK_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const EN_CJK_LANGUAGE_NAMES = /^(?:日本語|简体中文|繁體中文|繁体中文|中文)$/u;
const EN_CJK_TYPOGRAPHY_PROOF_KEYS = new Set([
  "workbench.catalog-appearance.on-4-november-2026-1-284-notes",
  "workbench.env.add-user",
]);
const EN_CJK_TYPOGRAPHY_PROOF_PHRASES = /中\u2060?文\s+mixed\s+with\s+English|日本語|简体中文|繁體中文/gu;

// Unambiguous Simplified-Chinese-only characters (not standard Japanese Joyo/UI kanji), Chinese `没` outside Japanese compounds,
// and Chinese possessive/attributive `的` phrases (excluding standard Japanese `-的` adjectives like 具体的/自動的/目的).
const JA_SC_LEAK = /[请这吗吧们还给让个无页读删设击错误败经过时间话说关闭开结获验证权记录检查确认编辑创执发连账码钥夹项题链试图网络务应统环输异态进详筛销导评论历级启继续您哪么什为从对你咱呢啊哦啦呗]|(?<![日水埋沈隠])没(?!収|頭|後|落|年|入|交渉|個性)|(?:我|你|您|他|她|它|这|那|谁|什|么|哪|们|所有|全部|更多|其他|新|旧|大|小|好|坏|里|上|下|前|后|已|未|不|很|最|都|还|被|把|跟|和|或|与|之|每|各|某|另|该|此)的/u;

const JA_RULES = [
  { id: "ja.raw-markup", label: "Japanese copy contains raw HTML/quote markup (<>&\"')", pattern: /[<>&"']/u },
  { id: "ja.simplified-chinese-leak", label: "Japanese copy contains Simplified-Chinese character or phrasing leak", pattern: JA_SC_LEAK },
  { id: "ja.bent-quotes", label: "Japanese copy uses curly quotes instead of 「…」", pattern: /(?<!\\|\[)[“”](?!\])/u },
  { id: "ja.chinese-semicolon", label: "Japanese copy uses Chinese fullwidth semicolon ； (use 、 or ／)", pattern: /；/u },
  {
    id: "ja.telegraphic-ending",
    label: "Japanese copy uses clipped telegraphic compression ending instead of polite です・ます",
    pattern: /(?:不可|未保存|未確認|なし)。|（[^（）]*保持）。|残存）。/u,
  },
  {
    id: "ja.dropped-particle",
    label: "Japanese copy drops grammatical particles (e.g. この操作する / 確認し再試行 / 調整し続行)",
    pattern: /この(?:操作|変更)する|確認し再試行|調整し続行/u,
  },
];

const PROD_SOURCE_ROOT = /^(?:apps|horizontal|modules|packages|plugins|server\/src)\//u;
const UI_LOCALE_FORMAT_ROOT = /^(?:apps\/workbench\/src|horizontal|modules|packages|plugins)\//u;
const PROD_JS_TS_EXT = /\.(?:ts|mts|tsx|js|mjs)$/u;
const PROD_NATIVE_EXT = /\.(?:rs|swift)$/u;
const PROD_HTML_EXT = /\.html?$/iu;
const EXCLUDED_SOURCE_PATH = /(?:^|\/)(?:tests?|dist|node_modules|fixtures)\/|\.test\.(?:ts|mts|js|mjs)$|\.d\.ts$/u;
const SOURCE_PREFILTER = /(?:AtomicBool|ENGLISH|isEnglish|Intl\.|<html\b|zh(?:-CN|-Hans)?|toLocale(?:Date|Time)?String\s*\(|startsWith\s*\(\s*["'](?:en|zh)|(?:===|!==|==|!=)\s*["'](?:en|zh))/iu;

const NATIVE_BINARY_LOCALE_FLAG = /\b(?:IS_)?ENGLISH\s*:\s*AtomicBool\b|\bstatic\s+(?:mut\s+)?(?:IS_)?ENGLISH\b|\b(?:var|let)\s+isEnglish\s*(?::\s*Bool)?\s*=/u;
const LOCALE_EXPR = String.raw`(?:\b(?:currentLocale|activeLocale|pageLocale|baseLanguageOf|getLocale|resolveLocale)\s*\([^)\n]*\)|\b(?:locale|lang|language|uiLocale|webLocale|activeLang|tag|base)\b)`;
const BINARY_LOCALE_TERNARY_LINE = new RegExp(
  `${LOCALE_EXPR}\\s*(?:===|!==|==|!=)\\s*["'](?:en|zh)(?:-[A-Za-z]+)?["']\\s*\\?`,
  "u",
);
const BINARY_LOCALE_TERNARY_HEAD = new RegExp(
  `${LOCALE_EXPR}\\s*(?:===|!==|==|!=)\\s*["'](?:en|zh)(?:-[A-Za-z]+)?["']\\s*$`,
  "u",
);
const BINARY_LOCALE_CONDITIONAL = new RegExp(
  `\\bif\\s*\\([^)\\n]*${LOCALE_EXPR}\\s*(?:===|!==|==|!=)\\s*["'](?:en|zh)(?:-[A-Za-z]+)?["']`,
  "u",
);
const BINARY_STARTSWITH_TERNARY = new RegExp(
  `!?\\s*${LOCALE_EXPR}[^;\\n]{0,60}\\.startsWith\\(\\s*["'](?:en|zh)["']\\s*\\)\\s*\\?`,
  "u",
);
const BINARY_STARTSWITH_ARROW = new RegExp(
  `=>\\s*(?:\\{\\s*return\\s+)?!?\\s*(?:Boolean\\s*\\(\\s*)?${LOCALE_EXPR}[^;\\n]{0,60}\\.startsWith\\(\\s*["'](?:en|zh)["']\\s*\\)`,
  "u",
);
const BINARY_LOCALE_VAR = /\b(?:const|let|var)\s+(?:en|isEn|english|isEnglish|zh|isZh|chinese|nonZh|notZh|nonEn|notEn)\s*=\s*[^;\n]*(?:lang|locale|language|tag|base)[^;\n]*(?:===|!==|\.startsWith)\s*\(?\s*["'](?:en|zh)(?:-[A-Za-z]+)?["']/u;
const THREE_WAY_JA_CHECK = /["']ja(?:-[A-Za-z]+)?["']/u;
const BCP47_LITERAL = String.raw`["'][a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*["']`;
const HARDCODED_INTL_LOCALE = new RegExp(
  `\\bIntl\\.(?:DateTimeFormat|NumberFormat|Collator|RelativeTimeFormat|ListFormat)\\(\\s*${BCP47_LITERAL}`,
  "u",
);
const HARDCODED_HTML_LANG = new RegExp(`<html\\b[^>]*\\blang\\s*=\\s*${BCP47_LITERAL}`, "iu");
const BARE_TO_LOCALE_STRING = new RegExp(
  `\\.toLocale(?:Date|Time)?String\\(\\s*(?:\\)|\\[\\s*\\]\\s*[,)]|${BCP47_LITERAL})`,
  "u",
);

// Narrow, explicitly documented exemptions ONLY for legitimate multi-locale or non-UI machine helpers (never masking real binary UI bugs).
const BINARY_LOCALE_EXEMPTIONS = [
  {
    file: "apps/local-host/src/material-source-providers.ts",
    pattern: /if\s*\(\s*base\s*===\s*["']en["']\s*\)\s*return\s*`\$\{intl\},en;q=0\.9`/u,
  },
];

const HARDCODED_INTL_EXEMPTIONS = [
  {
    // Machine-only ISO YYYY-MM-DD calendar day key (never shown to the user).
    file: "packages/plugin-sdk/src/action-cards.ts",
    pattern: /new\s+Intl\.DateTimeFormat\(\s*["']en-CA["']/u,
  },
  {
    // Machine-only wall-clock formatToParts (hourCycle h23) and IANA timeZone validation.
    file: "packages/plugin-sdk/src/card-values.ts",
    pattern: /new\s+Intl\.DateTimeFormat\(\s*["']en(?:-US)?["']/u,
  },
  {
    // IANA timeZone validation (no formatted output).
    file: "packages/plugin-sdk/src/ui/message-format.ts",
    pattern: /new\s+Intl\.DateTimeFormat\(\s*["']en["']\s*,\s*\{\s*timeZone\s*:/u,
  },
];

function isExemptBinaryLocaleLine(file, line) {
  return BINARY_LOCALE_EXEMPTIONS.some((entry) => entry.file === file && entry.pattern.test(line));
}

function isExemptHardcodedIntlLine(file, line) {
  return HARDCODED_INTL_EXEMPTIONS.some((entry) => entry.file === file && entry.pattern.test(line));
}

function stripHtmlComments(source) {
  return source.replace(/<!--[\s\S]*?-->/gu, (match) => maskPreservingNewlines(match));
}

function isTitleCaseButton(key, text) {
  if (!/\.(?:btn|button|cta|submit|create|open|add|save|delete|remove)(?:$|-)/u.test(key)) return false;
  const words = text.trim().split(/\s+/u);
  if (words.length < 2 || words.length > 5) return false;
  if (!words.every((w) => /^[A-Z][A-Za-z0-9-]*$/u.test(w))) return false;
  return words.slice(1).some((w) => !EN_PROPER_NOUNS.has(w));
}

function isAllowedEnCjk(key, text) {
  if (EN_CJK_LANGUAGE_NAMES.test(text.trim())) return true;
  if (EN_CJK_TYPOGRAPHY_PROOF_KEYS.has(key)) return true;
  const stripped = text.replace(EN_CJK_TYPOGRAPHY_PROOF_PHRASES, "");
  return !CJK_SCRIPT.test(stripped);
}

function maskPreservingNewlines(text) {
  return text.replace(/[^\n]/gu, " ");
}

function stripTsJsComments(source, file) {
  const variant = file.endsWith(".tsx") ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard;
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, variant, source);
  const parts = [];
  let cursor = 0;
  for (;;) {
    const token = scanner.scan();
    if (token === ts.SyntaxKind.EndOfFileToken) break;
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
      const start = scanner.getTokenPos();
      const end = scanner.getTextPos();
      if (start > cursor) parts.push(source.slice(cursor, start));
      parts.push(maskPreservingNewlines(source.slice(start, end)));
      cursor = end;
    }
  }
  if (cursor < source.length) parts.push(source.slice(cursor));
  return parts.join("");
}

function stripNativeComments(source) {
  let out = "";
  let inString = false;
  let blockDepth = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (blockDepth > 0) {
      if (ch === "/" && next === "*") { blockDepth++; out += "  "; i++; }
      else if (ch === "*" && next === "/") { blockDepth--; out += "  "; i++; }
      else out += ch === "\n" ? "\n" : " ";
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === "\\" && i + 1 < source.length) { out += next; i++; }
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") { inString = true; out += ch; continue; }
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") { out += " "; i++; }
      if (i < source.length) out += "\n";
      continue;
    }
    if (ch === "/" && next === "*") { blockDepth = 1; out += "  "; i++; continue; }
    out += ch;
  }
  return out;
}

export function auditLocaleText({ file, locale, key, text, categoryFilter = null }) {
  const findings = [];
  const base = String(locale ?? "").split("-")[0];
  const isTierB = TIER_B_FILE.test(file) || TIER_B_KEY.test(key);
  const rules = base === "zh" ? ZH_RULES : base === "en" ? EN_RULES : base === "ja" ? JA_RULES : [];
  for (const rule of rules) {
    if (rule.tierAOnly && isTierB) continue;
    if (rule.filePattern && !rule.filePattern.test(file)) continue;
    if (categoryFilter && rule.id !== categoryFilter) continue;
    if (rule.pattern.test(text)) findings.push({ file, key, rule: rule.id, label: rule.label, text });
  }
  if (base === "en") {
    if ((!categoryFilter || categoryFilter === "en.title-case-cta") && isTitleCaseButton(key, text)) {
      findings.push({ file, key, rule: "en.title-case-cta", label: "Button/CTA uses Title Case instead of Sentence case", text });
    }
    if ((!categoryFilter || categoryFilter === "en.cjk-leak") && CJK_SCRIPT.test(text) && !isAllowedEnCjk(key, text)) {
      findings.push({ file, key, rule: "en.cjk-leak", label: "English copy contains unexpected CJK characters", text });
    }
  }
  return findings;
}

export function auditSourceText(file, source, options = {}) {
  const categoryFilter = options.category ?? null;
  if (!SOURCE_PREFILTER.test(source)) return [];
  const isNative = PROD_NATIVE_EXT.test(file);
  const isJsTs = PROD_JS_TS_EXT.test(file);
  const isHtml = PROD_HTML_EXT.test(file);
  if (!isNative && !isJsTs && !isHtml) return [];
  const stripped = isNative ? stripNativeComments(source) : isHtml ? stripHtmlComments(source) : stripTsJsComments(source, file);
  const lines = stripped.split("\n");
  const checkBareToLocale = isJsTs && UI_LOCALE_FORMAT_ROOT.test(file);
  const findings = [];
  const emit = (lineIndex, rule, label, rawLine) => {
    if (categoryFilter && rule !== categoryFilter) return;
    findings.push({ file, key: `L${lineIndex + 1}`, line: lineIndex + 1, rule, label, text: rawLine.trim() });
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (isHtml) {
      if (HARDCODED_HTML_LANG.test(line)) {
        emit(i, "src.hardcoded-html-lang-zh", "Hardcoded <html lang=\"...\"> in production HTML (use active htmlLang())", line);
      }
      continue;
    }
    if (isNative) {
      if (NATIVE_BINARY_LOCALE_FLAG.test(line)) {
        emit(i, "src.binary-locale-flag", "Binary English-only flag in native source (must support 3+ locales)", line);
      }
      continue;
    }
    const windowText = lines.slice(Math.max(0, i - 2), i + 5).join("\n");
    const nextTrimmed = (lines[i + 1] ?? "").trimStart();
    const isBinaryTernary = BINARY_LOCALE_TERNARY_LINE.test(line)
      || (BINARY_LOCALE_TERNARY_HEAD.test(line) && nextTrimmed.startsWith("?"))
      || BINARY_STARTSWITH_TERNARY.test(line)
      || BINARY_STARTSWITH_ARROW.test(line);
    const isBinaryConditional = BINARY_LOCALE_CONDITIONAL.test(line);
    if ((isBinaryTernary || isBinaryConditional) && !THREE_WAY_JA_CHECK.test(windowText) && !isExemptBinaryLocaleLine(file, line)) {
      emit(i, "src.binary-locale-switch", "Binary zh/en locale switch in production source (must handle 3+ locales)", line);
    } else if (BINARY_LOCALE_VAR.test(line) && !THREE_WAY_JA_CHECK.test(windowText) && !isExemptBinaryLocaleLine(file, line)) {
      emit(i, "src.binary-locale-switch", "Binary zh/en locale flag in production source (must handle 3+ locales)", line);
    }
    if (HARDCODED_INTL_LOCALE.test(line) && !isExemptHardcodedIntlLine(file, line)) {
      emit(i, "src.hardcoded-intl-zh", "Hardcoded locale literal in Intl formatter in production source (use active locale)", line);
    }
    if (HARDCODED_HTML_LANG.test(line)) {
      emit(i, "src.hardcoded-html-lang-zh", "Hardcoded <html lang=\"...\"> in production UI source (use active htmlLang())", line);
    }
    if (checkBareToLocale && BARE_TO_LOCALE_STRING.test(line)) {
      emit(i, "src.bare-to-locale-string", "UI .toLocaleString() omits active locale or hardcodes a locale literal (pass active locale or use SDK format)", line);
    }
  }
  return findings;
}

export function auditRepositoryCopy(root, options = {}) {
  const includeCatalog = Boolean(options.includeCatalog);
  const ownerFilter = options.owner ?? null;
  const categoryFilter = options.category ?? null;
  const tracked = execFileSync("git", ["-c", "core.quotepath=off", "ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 })
    .split("\0")
    .filter(Boolean);

  const localeFiles = tracked
    .filter((f) => LOCALE_JSON_FILE.test(f))
    .filter((f) => !f.startsWith("examples/") && !f.startsWith("tests/") && !/(?:^|\/)fixtures\//u.test(f));

  const findings = [];
  for (const file of localeFiles.sort()) {
    if (ownerFilter && !file.includes(ownerFilter)) continue;
    const parsed = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
    const locale = typeof parsed.locale === "string" ? parsed.locale : path.basename(file, ".json");
    const checkEveryKey = includeCatalog || WORKBENCH_MAIN_PACK.test(file) || CATALOG_SUBPACK_FILE.test(file);
    const messages = parsed.messages ?? {};
    for (const [key, entry] of Object.entries(messages)) {
      if (!checkEveryKey && CATALOG_SPECIMEN_KEY.test(key)) continue;
      const texts = typeof entry === "string" ? [entry] : Object.values(entry?.forms ?? {});
      for (const text of texts) {
        if (typeof text !== "string") continue;
        findings.push(...auditLocaleText({ file, locale, key, text, categoryFilter }));
      }
    }
  }

  const sourceFiles = tracked
    .filter((f) => PROD_SOURCE_ROOT.test(f) && (PROD_JS_TS_EXT.test(f) || PROD_NATIVE_EXT.test(f) || PROD_HTML_EXT.test(f)) && !EXCLUDED_SOURCE_PATH.test(f));
  for (const file of sourceFiles.sort()) {
    if (ownerFilter && !file.includes(ownerFilter)) continue;
    const source = fs.readFileSync(path.join(root, file), "utf8");
    findings.push(...auditSourceText(file, source, { category: categoryFilter }));
  }

  return findings;
}

export function main(argv) {
  let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  let owner = null, category = null, json = false, strict = false, includeCatalog = false, limit = 15;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root") root = path.resolve(argv[++i]);
    else if (arg === "--owner") owner = argv[++i];
    else if (arg === "--category") category = argv[++i];
    else if (arg === "--limit") limit = Number(argv[++i]);
    else if (arg === "--json") json = true;
    else if (arg === "--strict") strict = true;
    else if (arg === "--include-catalog") includeCatalog = true;
    else { process.stderr.write(`unknown option: ${arg}\n`); return 2; }
  }
  const findings = auditRepositoryCopy(root, { owner, category, includeCatalog });
  if (json) {
    process.stdout.write(JSON.stringify({ count: findings.length, findings }, null, 2) + "\n");
  } else {
    const byRule = new Map();
    for (const item of findings) {
      if (!byRule.has(item.rule)) byRule.set(item.rule, { label: item.label, items: [] });
      byRule.get(item.rule).items.push(item);
    }
    process.stdout.write(`UI copy audit: ${findings.length} finding(s) across ${byRule.size} rule(s)\n`);
    for (const [ruleId, group] of byRule) {
      process.stdout.write(`\n[${ruleId}] ${group.label}: ${group.items.length}\n`);
      for (const item of group.items.slice(0, limit)) {
        process.stdout.write(`  ${item.file} (${item.key}): ${JSON.stringify(item.text)}\n`);
      }
      if (group.items.length > limit) process.stdout.write(`  ... and ${group.items.length - limit} more\n`);
    }
  }
  return strict && findings.length > 0 ? 1 : 0;
}

if (isMainScript(import.meta.url)) process.exitCode = main(process.argv.slice(2));
