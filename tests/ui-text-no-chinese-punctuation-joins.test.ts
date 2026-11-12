import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

/**
 * The C-stage punctuation leftover (font-and-skin-system FSS-39, and FSS-36 for English words): a Chinese punctuation
 * mark must not be glued into interface words or their parameters in product source. The words that separate a label
 * from its value, a clause from the next, a quoted value, or a list now live in the platform language files as
 * `common.punctuation.label-separator` (： / ": "), `common.punctuation.clause-separator`, `common.punctuation.semicolon`,
 * `common.punctuation.in-parens`, `common.punctuation.quoted` and `common.list.separator`; code writes the whole sentence
 * as one key with named parameters. This test is the regression guard for that rule.
 *
 * 口径（what is a violation）:
 *  ① a string literal that is only Chinese punctuation (：，、（）「」；！？) and is an operand of `+` whose chain contains
 *     a translation call — `t.text(...) + "："`, `"：" + t.text(...)`, `p.text(...) + "："`;
 *  ② the same literal in a template literal next to an interpolation that carries a translation call —
 *     `` `${t.text(k)}：${value}` ``, `` `（${t.text(k)}）` ``;
 *  ③ `.replace("{x}", ...)` / `.replaceAll(...)` that hand-fills a parameter inside a translated word;
 *  ④ `.join("、")` / `.join("；")` … in product source: recorded per file, only allowed to fall (see JOINED_BASELINE);
 *  ⑤ `"（" + word + "）"` and `"「" + word + "」"` are the same as ① (the punctuation literal is an operand of `+`).
 *  Embedded browser programs written as `String.raw` template strings are scanned line by line for ①/②/⑤: TypeScript
 *  does not parse their interior, so only a line that also names a translation call is examined.
 *
 * 不是违规：中文整句（整句是内容或语言文件里的词，由 ②'=' 之外的规则管）、注释（AST 不读注释）、正则、`.split("：")`
 * 之类读取、CSS、语言文件（`locales/*.json` 不扫）、文档/设计原型/测试。
 *
 * 例外白名单（CONTENT_BODIES）：这些文件的中文是内容正文，不是界面词——模型提示词、Agent 指令、服务端中文错误目录、
 * 导出文档正文。每一行都带理由；新条目必须说明为什么这不是界面文字，否则不加。
 */

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PUNCTUATION = "：，、（）「」；！？";
const PURE_PUNCTUATION = new RegExp(`^(?:\\s*[${PUNCTUATION}])+\\s*$`, "u");
const HAS_PUNCTUATION = new RegExp(`[${PUNCTUATION}]`, "u");

/** The product source this rule is about. Tests, docs, design prototypes, generated and packaged files are not source. */
const SCANNED = [
  /^apps\/workbench\/src\//,
  /^apps\/local-host\/src\//,
  /^packages\/design-system\/src\//,
  /^plugins\/[^/]+\/[^/]+\/src\//,
];
const NOT_SOURCE = /(^|\/)(dist|node_modules|fixtures|resources|tests?)\//;

/** The functions that read a language file: their result is a translated word, so punctuation may not split it. */
const TRANSLATION_CALLEES = new Set([
  "t", "t.text", "t.html", "say", "say.text", "readText", "translate", "L", "LF", "p.text",
  "uiText", "uiText.text", "uiText.html", "globalThis.t", "globalThis.t.text", "globalThis.t.html",
]);
const TRANSLATION_CALL = /(?:\bglobalThis\.t\b|\bt\.(?:text|html)\b|\bsay\b|\breadText\b|\btranslate\b|\buiText\b|\bL\b|\bLF\b|\bp\.text\b)/u;

/**
 * The files whose Chinese is content text, not interface words, and development specimens. The scan is skipped for them:
 * a sentence the assistant/model reads, a validator's own Chinese diagnostic, an exported document's body or the
 * `/__ui/catalog/bar` development board is a different owner from the interface words this rule is about. Each entry
 * must still name a real file: a stale entry fails the last test.
 */
const EXEMPT: ReadonlyArray<{ readonly file: RegExp; readonly reason: string }> = [
  // 助理/模型材料正文：给模型读的句子，不是界面文字（Lead 2026-11-11 允许）。
  { file: /^plugins\/native\/todo\/src\/browser\/detail\.ts$/u, reason: "the assistant material of `page.material`, read by the model, not interface words" },
  { file: /^apps\/local-host\/src\/assistant\/assistant-threads\.ts$/u, reason: "the thread material's title text handed to the assistant, not interface words" },
  { file: /^plugins\/native\/cognia\/src\/ai\.ts$/u, reason: "the Cognia assistant prompt material, read by the model" },
  { file: /^plugins\/native\/schedule\/src\/reply\.ts$/u, reason: "the Schedule assistant reply material, read by the model" },
  { file: /^apps\/local-host\/src\/assistant\/assistant-round-materials\.ts$/u, reason: "the round's material text built for the model (the fixed date was W4's; the Chinese material is content)" },
  // Agent 提示词与校验报错目录：给 Agent 读的指令/诊断，不是界面文字。
  { file: /^apps\/local-host\/src\/agent-definitions\/(?:agent-definitions|builtin-instructions)\.ts$/u, reason: "agent instructions and their names, read by the model" },
  { file: /^plugins\/native\/plugin-builder\/src\/agent-(?:authoring|validation|workflow)\.ts$/u, reason: "the builder agent's prompt/validation diagnostics, read by the model" },
  { file: /^plugins\/native\/[^/]+\/src\/prompts\.ts$/u, reason: "a plugin's model prompts, read by the model" },
  // 开发工具：`/__ui/catalog/bar` 的静态标本，不是产品界面（W4 会记 BL）。
  { file: /^apps\/workbench\/src\/primitive-catalog\.ts$/u, reason: "the `/__ui/catalog/bar` development specimen board, not a product surface (W4 records it in a BL)" },
];

/**
 * The two existing two-pass templates (server words with a `{time}`/`{version}` placeholder, filled by the page):
 * Lead 2026-11-11 confirmed they stay; each is documented where it sits. The allowlist names file and placeholder.
 */
const TWO_PASS: ReadonlyArray<{ readonly file: RegExp; readonly placeholder: string; readonly reason: string }> = [
  { file: /^apps\/workbench\/src\/scripts\/connectors-settings\.ts$/u, placeholder: "{time}",
    reason: "the connector progress sentence is rendered by the server with `{time}`; the page fills the value (W1 report §4)" },
  { file: /^apps\/workbench\/src\/judgment-rules\/client-keep\.ts$/u, placeholder: "{version}",
    reason: "`{version}` is written by the page into the alert title (`judgment-rules/ui.ts` documents it); W1 report §4" },
];

/**
 * A list join inside a page program written as a `String.raw` template is interface assembly and must use
 * `common.list.separator`; these are the files where it is accepted, each with its why.
 */
const EMBEDDED_JOIN_ALLOWED: ReadonlyArray<{ readonly file: RegExp; readonly reason: string }> = [];

/**
 * `.join("、")`/`.join("；")` in ordinary product code, per file: mostly server-side Chinese messages and Chinese content
 * builders outside this fix's ownership (Lead/W5 records the follow-ups). The measured numbers are the allowance: a file
 * may not grow and a new file may not appear, and a fall must be written down here (the last test fails while it is stale).
 */
const JOINED_BASELINE: Readonly<Record<string, number>> = {
  "apps/local-host/src/assistant/assistant-delegation.ts": 1,
  "apps/local-host/src/assistant/assistant-directory.ts": 4,
  "apps/local-host/src/assistant/assistant-followups.ts": 2,
  "apps/local-host/src/assistant/assistant-present.ts": 2,
  "apps/local-host/src/assistant/assistant-review-words.ts": 2,
  "apps/local-host/src/assistant/assistant-rule-actions.ts": 1,
  "apps/local-host/src/browser/surface-driver.ts": 1,
  "apps/local-host/src/character-native-execution.ts": 1,
  "apps/local-host/src/cli-project-maintenance.ts": 2,
  "apps/local-host/src/computer/computer-desk.ts": 1,
  "apps/local-host/src/computer/computer-driver.ts": 2,
  "apps/local-host/src/computer/computer-windows.ts": 1,
  "apps/local-host/src/connector-plugin-requests.ts": 1,
  "apps/local-host/src/connector-words.ts": 1,
  "apps/local-host/src/context-onboarding-documents.ts": 1,
  "apps/local-host/src/goal-callers.ts": 1,
  "apps/local-host/src/installer/uninstall.ts": 1,
  "apps/local-host/src/installer/web-service-operations.ts": 1,
  "apps/local-host/src/managed-project-deletion.ts": 1,
  "apps/local-host/src/model-connection-usages.ts": 1,
  "apps/local-host/src/plugin-development.ts": 1,
  "apps/local-host/src/project-deleted-hooks.ts": 2,
  "apps/local-host/src/task-grant-categories.ts": 1,
  "apps/local-host/src/workspace-git-operations.ts": 1,
  "apps/workbench/src/browser/knowledge/detail.ts": 2,
  "apps/workbench/src/home-flow.ts": 1,
  "packages/design-system/src/baseline.ts": 1,
  "packages/design-system/src/primitives/catalog-appearance-looks.ts": 1,
  "plugins/native/alchemist/src/studio/server/services/calibration-memory.ts": 2,
  "plugins/native/alchemist/src/studio/server/services/create-research-plan.ts": 1,
  "plugins/native/coding/src/continuation.ts": 1,
  "plugins/native/coding/src/history-digest.ts": 3,
  "plugins/native/coding/src/report-inputs.ts": 2,
  "plugins/native/coding/src/report.ts": 7,
  "plugins/native/coding/src/routes-sessions.ts": 1,
  "plugins/native/dataset/src/search.ts": 1,
  "plugins/native/goals/src/decision-results.ts": 1,
  "plugins/native/goals/src/event-forms-record.ts": 1,
  "plugins/native/goals/src/fragment-offers.ts": 1,
  "plugins/native/goals/src/goal-event-application.ts": 1,
  "plugins/native/goals/src/goal-tree-decision-followup.ts": 1,
  "plugins/native/goals/src/governance/provenance.ts": 1,
  "plugins/native/goals/src/http/create.ts": 1,
  "plugins/native/goals/src/http/event-decisions.ts": 1,
  "plugins/native/goals/src/http/events.ts": 1,
  "plugins/native/goals/src/module/event-facts-validation.ts": 2,
  "plugins/native/goals/src/module/event-state-completion.ts": 1,
  "plugins/native/goals/src/module/event-state-effects.ts": 1,
  "plugins/native/goals/src/module/goal-commands.ts": 2,
  "plugins/native/goals/src/module/planning/goal-graph.ts": 2,
  "plugins/native/goals/src/module/planning/method-packs.ts": 3,
  "plugins/native/goals/src/planning-actions.ts": 1,
  "plugins/native/goals/src/proposal-normalizer.ts": 2,
  "plugins/native/goals/src/terminal-actions.ts": 3,
  "plugins/native/inbox/src/home-events.ts": 2,
  "plugins/native/pages/src/actions.ts": 1,
  "plugins/native/shelf/src/ai.ts": 1,
  "plugins/native/todo/src/browser/list-rows.ts": 1,
  "plugins/native/todo/src/browser/review-choices.ts": 1,
  "plugins/native/todo/src/organize-model.ts": 1,
  "plugins/native/todo/src/search.ts": 2,
  "plugins/native/workflows/src/actions.ts": 2,
};

const exempt = (file: string): boolean => EXEMPT.some(row => row.file.test(file));
const twoPass = (file: string, placeholder: string): boolean => TWO_PASS.some(row => row.file.test(file) && row.placeholder === placeholder);

interface Violation { readonly file: string; readonly line: number; readonly kind: string; readonly snippet: string }

const rel = (file: string): string => path.relative(ROOT, file);
const files = execFileSync("git", ["-c", "core.quotepath=off", "ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 30 })
  .split("\0").filter(Boolean)
  .filter(file => /\.(ts|mts)$/u.test(file) && !file.endsWith(".d.ts") && SCANNED.some(area => area.test(file)) && !NOT_SOURCE.test(file));

const read = (file: string): string => readFileSync(path.join(ROOT, file), "utf8");

function calleeName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) {
    const base = calleeName(expression.expression);
    return base === null ? null : `${base}.${expression.name.text}`;
  }
  return null;
}

const isTranslation = (node: ts.Node): boolean => ts.isCallExpression(node) && TRANSLATION_CALLEES.has(calleeName(node.expression) ?? "");

/** Whether a `+` chain (or the arguments of a formatter call) reads a language word anywhere in it. */
function chainReadsWords(node: ts.Node): boolean {
  let found = false;
  const walk = (current: ts.Node): void => {
    if (found) return;
    if (isTranslation(current)) { found = true; return; }
    if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.PlusToken) { walk(current.left); walk(current.right); return; }
    if (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isNonNullExpression(current)) { walk(current.expression); return; }
    if (ts.isCallExpression(current)) for (const argument of current.arguments) walk(argument);
    if (ts.isTemplateExpression(current)) for (const span of current.templateSpans) walk(span.expression);
  };
  walk(node);
  return found;
}

/** ①/⑤: a punctuation-only string literal glued with `+` where the expression reads a translated word. */
function plusGlueViolations(source: ts.SourceFile, file: string): Violation[] {
  const out: Violation[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      for (const side of [node.left, node.right]) {
        if (ts.isStringLiteralLike(side) && PURE_PUNCTUATION.test(side.text) && chainReadsWords(node)) {
          out.push(at(source, file, side, "punctuation-glued-to-word"));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

const at = (source: ts.SourceFile, file: string, node: ts.Node, kind: string): Violation => {
  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
  return { file, line: line + 1, kind, snippet: node.getText(source).replace(/\s+/gu, " ").slice(0, 160) };
};

/** ②: a punctuation-only template span/head/tail beside an interpolation that reads a translated word. */
function templateViolations(source: ts.SourceFile, file: string): Violation[] {
  const out: Violation[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isTemplateExpression(node) && node.templateSpans.some(span => chainReadsWords(span.expression))) {
      if (PURE_PUNCTUATION.test(node.head.text)) out.push(at(source, file, node.head, "punctuation-in-template"));
      for (const span of node.templateSpans) if (PURE_PUNCTUATION.test(span.literal.text)) out.push(at(source, file, span.literal, "punctuation-in-template"));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/** The raw regions of browser programs written as big `String.raw` templates; TypeScript never parses inside. */
function embeddedRegions(source: ts.SourceFile): Array<{ start: number; end: number }> {
  const regions: Array<{ start: number; end: number }> = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.getEnd() - node.getStart(source) > 2_000) {
      regions.push({ start: node.getStart(source), end: node.getEnd() });
      return; // its interior is handled by the line scan, not this walk
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return regions;
}

/** ①/⑤ inside a browser program: a punctuation literal on a line that also names a translation call. */
function embeddedPlusGlue(line: string): boolean {
  if (!TRANSLATION_CALL.test(line)) return false;
  for (const match of line.matchAll(/"[^"\n]*"|'[^'\n]*'/gu)) {
    if (!PURE_PUNCTUATION.test(match[0].slice(1, -1))) continue;
    const before = line.slice(0, match.index).trimEnd(), after = line.slice(match.index + match[0].length).trimStart();
    if (before.endsWith("+") || after.startsWith("+")) return true;
  }
  return false;
}

/** ② inside a browser program: punctuation between `${…}` interpolations, at a template start or end. */
function embeddedTemplateGlue(line: string): boolean {
  if (!TRANSLATION_CALL.test(line)) return false;
  return new RegExp(`\\}\\s*[${PUNCTUATION}]+\\s*\\$\\{`, "u").test(line)
    || new RegExp("`\\s*[：，、（）「」；！？]+\\s*\\$\\{", "u").test(line)
    || new RegExp(`\\}\\s*[${PUNCTUATION}]+\\s*\``, "u").test(line);
}

/** ③: `.replace("{name}", …)` hand-fills a parameter inside a word that belongs in the language file. */
const HAND_FILLED_REPLACE = /\.replace(?:All)?\(\s*["'](\{[A-Za-z_]\w*\})[^"']*["']/u;

/** ④: `.join("、")` and the other Chinese punctuation list separators. */
const JOINED = new RegExp(`\\.join\\(\\s*"((?:[\\s]*[${PUNCTUATION}])+)"\\s*\\)`, "u");

interface Scan {
  readonly violations: Violation[];
  readonly joined: Map<string, number>;
  readonly embeddedJoined: Violation[];
  readonly handFilled: Violation[];
}

function scan(): Scan {
  const violations: Violation[] = [], handFilled: Violation[] = [], embeddedJoined: Violation[] = [];
  const joined = new Map<string, number>();
  for (const file of files) {
    const text = read(file);
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const lines = text.split("\n"), lineStarts: number[] = [0];
    for (let index = 0; index < text.length; index += 1) if (text[index] === "\n") lineStarts.push(index + 1);
    const regions = embeddedRegions(source);
    const inProgram = (lineIndex: number): boolean => regions.some(region => lineStarts[lineIndex]! >= region.start && lineStarts[lineIndex]! <= region.end);
    for (let index = 0; index < lines.length; index += 1) {
      const lineText = lines[index]!;
      const handFilledMatch = HAND_FILLED_REPLACE.exec(lineText);
      if (handFilledMatch && !(exempt(file) || twoPass(file, handFilledMatch[1]!))) handFilled.push({ file, line: index + 1, kind: "hand-filled-parameter", snippet: lineText.trim().slice(0, 160) });
      if (exempt(file)) continue;
      if (inProgram(index)) {
        if (embeddedPlusGlue(lineText) || embeddedTemplateGlue(lineText)) {
          violations.push({ file, line: index + 1, kind: "punctuation-joined-in-browser-program", snippet: lineText.trim().slice(0, 160) });
        }
        const embeddedMatches = [...lineText.matchAll(new RegExp(JOINED.source, "gu"))];
        if (embeddedMatches.length) embeddedJoined.push({ file, line: index + 1, kind: "chinese-list-separator-in-browser-program", snippet: lineText.trim().slice(0, 160) });
      }
      const matches = [...lineText.matchAll(new RegExp(JOINED.source, "gu"))];
      if (matches.length) joined.set(file, (joined.get(file) ?? 0) + matches.length);
    }
    if (!exempt(file)) violations.push(...plusGlueViolations(source, file), ...templateViolations(source, file));
  }
  return { violations, joined, embeddedJoined, handFilled };
}

const scanned = (() => { const result = scan(); return result; })();

const describe = (violations: readonly Violation[]): string =>
  violations.map(({ file, line, kind, snippet }) => `${file}:${line} [${kind}] ${snippet}`).join("\n");

test("the detector catches every pattern of the fix and leaves a whole sentence alone", () => {
  const sourceOf = (text: string) => ts.createSourceFile("synthetic.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const caught = (text: string) => [...plusGlueViolations(sourceOf(text), "synthetic.ts"), ...templateViolations(sourceOf(text), "synthetic.ts")];
  const patterns = [
    'const a = t.text("workbench.x.y") + "：" + value;',
    'const b = "：" + t.text("workbench.x.y");',
    'const c = "（" + uiText("workbench.x.y") + "）";',
    'const d = "「" + say.text({ owner: "workbench", key: "workbench.x.y" }) + "」";',
    'const e = `（${t.text("workbench.x.y")}）`;',
    'const f = `${t.text("workbench.x.y")}：${value}`;',
    'const g = `${value}，${t.text("workbench.x.y")}`;',
  ];
  for (const source of patterns) assert.ok(caught(source).length > 0, `not caught: ${source}`);
  const fine = [
    '// t.text("workbench.x.y") + "：" + value in a comment is not code',
    'const a = "已保存：" + value;', // a whole Chinese sentence, not a punctuation-only glue literal
    'const b = keys.join("、");', // the list rule sees this one; it is not a translation glue
    'const c = t.text("workbench.x.y", { title: "甲：乙" });', // the punctuation is inside a value, the word is whole
    'const d = text.split("：")[0];', // reading, not joining
  ];
  for (const source of fine) assert.deepEqual(caught(source), [], `false positive: ${source}`);
});

test("the scan reads the real product source and ignores tests, resources and dist", () => {
  assert.ok(files.length > 2_000, `expected the product source (${files.length} files)`);
  assert.ok(files.includes("apps/workbench/src/settings-memory.ts"));
  assert.ok(!files.includes("apps/workbench/resources/locales/zh.json"));
  assert.ok(!files.some(file => /(^|\/)(dist|node_modules|tests?)\//u.test(file)));
});

test("FSS-39 no Chinese punctuation is glued to a translated word in product source", { timeout: 180_000 }, () => {
  const violations = scanned.violations.sort((one, other) => one.file.localeCompare(other.file) || one.line - other.line);
  if (violations.length) process.stderr.write(`\n[W6] remaining punctuation joins (${violations.length}):\n${describe(violations)}\n`);
  assert.deepEqual(violations, [], `write the sentence as one key with parameters, or take the punctuation from common.punctuation.*:\n${describe(violations)}`);
});

test("FSS-39 no parameter is hand-filled into a translated word with .replace()", { timeout: 180_000 }, () => {
  const violations = scanned.handFilled.sort((one, other) => one.file.localeCompare(other.file) || one.line - other.line);
  if (violations.length) process.stderr.write(`\n[W6] remaining hand-filled parameters (${violations.length}):\n${describe(violations)}\n`);
  assert.deepEqual(violations, [], `pass the value as a named parameter instead of .replace("{…}"):\n${describe(violations)}`);
});

test("the exemption lists still name real product source", () => {
  for (const row of EXEMPT) assert.ok(files.some(file => row.file.test(file)), `stale exemption: ${row.file} (${row.reason})`);
  for (const row of TWO_PASS) {
    const named = files.filter(file => row.file.test(file));
    assert.ok(named.length > 0, `stale two-pass allowance: ${row.file} (${row.reason})`);
    assert.ok(named.some(file => read(file).includes(row.placeholder)), `two-pass allowance no longer used: ${row.file} ${row.placeholder}`);
  }
});

test("FSS-39 a page program joins its list with common.list.separator, not a Chinese mark", () => {
  const allowed = (file: string): boolean => EMBEDDED_JOIN_ALLOWED.some(row => row.file.test(file));
  const violations = scanned.embeddedJoined.filter(row => !allowed(row.file));
  if (violations.length) process.stderr.write(`\n[W6] Chinese list separators inside page programs (${violations.length}):\n${describe(violations)}\n`);
  assert.deepEqual(violations, [], `join with common.list.separator inside a page program:\n${describe(violations)}`);
  for (const row of EMBEDDED_JOIN_ALLOWED) assert.ok(files.some(file => row.file.test(file)), `stale embedded join allowance: ${row.file} (${row.reason})`);
});

test("FSS-39 the recorded .join(\"、\") list separators only fall", () => {
  const grown = [...scanned.joined].filter(([file, count]) => count > (JOINED_BASELINE[file] ?? 0)).map(([file, count]) => `${file}: ${count} > ${JOINED_BASELINE[file] ?? 0}`);
  if (grown.length) process.stderr.write(`\n[W6] grown list separators:\n${grown.join("\n")}\n`);
  assert.deepEqual(grown, [], "use common.list.separator for a described list; a grown or new Chinese list separator is not allowed");
  const gone = Object.keys(JOINED_BASELINE).filter(file => (scanned.joined.get(file) ?? 0) < JOINED_BASELINE[file]!);
  assert.deepEqual(gone, [], `the baseline is out of date for these files; lower it to the measured numbers: ${gone.map(file => `${file}: ${scanned.joined.get(file) ?? 0} < ${JOINED_BASELINE[file]}`).join(", ")}`);
});
