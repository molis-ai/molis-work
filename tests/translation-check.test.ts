import assert from "node:assert/strict";
import test from "node:test";
import { scanFile, scanTree, summarise, workingTreeSnapshot } from "../scripts/gates/translations.mjs";

const DIR = "plugins/native/alpha", ID = "example.publisher.alpha";
const ZH = DIR + "/locales/zh.json", EN = DIR + "/locales/en.json", UI = DIR + "/src/ui.ts";
const manifest = DIR + "/src/manifest.ts";
const messages = (locale: string, words: Record<string, unknown>, owner = ID) =>
  JSON.stringify({ format_version: 1, owner, locale, messages: words });
const core = () => ({
  [manifest]: 'import { OWNER as id } from "./id.js"; export const manifest = { plugin_id: id, ui: { contributions: [], locales: { default: "zh", available: ["en", "zh"] } } };',
  [DIR + "/src/id.ts"]: 'export const OWNER = "example.publisher.alpha";',
  [ZH]: messages("zh", { "alpha.page.open": "打开{name}", "alpha.page.close": "关闭", "alpha.page.unused": "旧" }),
  [EN]: messages("en", { "alpha.page.open": "Open {name}", "alpha.page.close": "Close", "alpha.page.unused": "Old" }),
  [UI]: [
    'import { t as sayOwn } from "@molis-ai/molis-work-plugin-sdk/ui";',
    'const labels = Object.freeze({ open: "alpha.page.open", close: "alpha.page.close" });',
    'export const render = (opened: boolean) => sayOwn.text(opened ? labels.open : labels.close);',
    '// sayOwn("alpha.page.comment")',
  ].join("\n"),
  "tests/skip.test.ts": 'L("source from a test")',
  [DIR + "/dist/built.ts"]: 'L("built file")',
});
function read(files: Record<string, string>) {
  return scanTree({ files: Object.keys(files), read: (file: string) => files[file] ?? null });
}

test("FSS-53 the locale gate reads the declared owner, t aliases, constants and both languages", () => {
  const result = read(core());
  assert.deepEqual(result.problems, []);
  assert.deepEqual(new Set(result.calls.map(call => call.key)), new Set(["alpha.page.open", "alpha.page.close"]));
  assert.deepEqual(result.dead, ["alpha.page.unused"]);
});

test("FSS-53 the locale gate refuses missing English, invalid key shapes and dropped declarations", () => {
  const files = core();
  const missing = read({ ...files, [EN]: messages("en", { "alpha.page.close": "Close", "alpha.page.unused": "Old" }) }).problems;
  assert.equal(missing.length, 1);
  assert.match(missing[0], /ui\.locale_missing_key alpha\.page\.open/);
  assert.ok(read({ ...files, [UI]: files[UI] + '\nsayOwn("原文"); sayOwn("alpha.page.absent");' }).problems
    .some(problem => problem.includes('expected a stable text key at sayOwn: "原文"')));
  const dropped = read({ ...files, [manifest]: files[manifest].replace(/, locales: \{.*?\}/u, "") });
  assert.ok(dropped.problems.some(problem => problem.includes("declare the owner's ui.locales")));
  assert.ok(dropped.problems.some(problem => problem.includes(EN + ": no locale declaration")));
});

test("FSS-53 duplicate words, argument mismatches and a foreign file fail the locale gate", () => {
  const files = core();
  const duplicate = files[EN].replace('"alpha.page.close":"Close"', '"alpha.page.close":"Close","alpha.page.close":"Other"');
  assert.ok(read({ ...files, [EN]: duplicate }).problems.some(problem => problem.includes("alpha.page.close") && problem.includes("ui.json_repeated_name")));
  const wrongArgs = files[EN].replace("{name}", "{person}");
  assert.ok(read({ ...files, [EN]: wrongArgs }).problems.some(problem => problem.includes("ui.locale_args alpha.page.open")));
  const wrongOwner = files[EN].replace(ID, "example.another.alpha");
  assert.ok(read({ ...files, [EN]: wrongOwner }).problems.some(problem => problem.endsWith("wrong owner or language")));
  assert.ok(read({ ...files, [EN]: files[EN].replace("alpha.page.close", "beta.page.close") }).problems
    .some(problem => problem.includes("beta.page.close") && problem.includes("ui.locale_key_owner")));
});

test("FSS-53 a browser program's forwarded title and hint count, independently of script escaping", () => {
  const frame = DIR + "/src/frame.ts", view = DIR + "/src/frame-view.ts";
  const files = core();
  const result = read({ ...files,
    [frame]: 'import { VIEW } from "./frame-view.js";\nexport const FRAME = String.raw`\nconst words = (title,hint) => globalThis.t(title) + globalThis.t.text(hint);\n` + VIEW;',
    [view]: 'export const VIEW = String.raw`\nconst urls = /^https?:\\/\\//; const line = "\\n";\nwords("alpha.page.open", "alpha.page.missing");\n`;',
    [DIR + "/src/other.ts"]: 'export const OTHER = `words("alpha.page.unrelated", "alpha.page.unrelated")`;',
  });
  assert.deepEqual(result.problems, [view + ":3: no registered default word for alpha.page.missing"]);
  assert.ok(result.calls.some(call => call.file === view && call.key === "alpha.page.open" && call.embedded));
});

test("FSS-53 SDK translator aliases cannot hide a missing or source-language key", () => {
  const files = core();
  const result = read({ ...files, [UI]: files[UI] + '\n' + [
    'export const renderPage = () => { const words = sayOwn; return `<p>${words("原句")}</p>`; };',
    'export const program = String.raw`const words = globalThis.t; const draw = words.text; draw("alpha.page.missing");`;',
  ].join('\n') });
  assert.ok(result.problems.some(problem => problem.includes('expected a stable text key at words: "原句"')));
  assert.ok(result.calls.some(call => call.embedded && call.key === "alpha.page.missing"));
  assert.ok(result.problems.some(problem => problem.includes('no registered default word for alpha.page.missing')));
});

test("FSS-53 only platform common words cross a plugin owner boundary", () => {
  const registry = "packages/design-system/resources/registry.json", owner = "apps/workbench/resources/locales/";
  const file = core()[UI] + '\nsayOwn("workbench.control.private"); sayOwn("common.control.save");';
  const platform = (locale: string) => messages(locale, { "workbench.control.private": "Private", "common.control.save": "Save" }, "workbench");
  const result = read({ ...core(), [UI]: file,
    [registry]: JSON.stringify({ resources: [{ kind: "locale", owner: "workbench", package: "@molis/workbench", path: "resources/locales" }] }),
    "apps/workbench/package.json": JSON.stringify({ name: "@molis/workbench" }),
    "apps/workbench/resources/languages.json": JSON.stringify({ format_version: 1, default: "zh", languages: [
      { tag: "zh", html_lang: "zh-CN", intl: "zh-CN", direction: "ltr", name: "简体中文" },
      { tag: "en", html_lang: "en", intl: "en-US", direction: "ltr", name: "English" },
    ] }),
    [owner + "zh.json"]: platform("zh"), [owner + "en.json"]: platform("en"),
  });
  assert.deepEqual(result.problems, [UI + ":5: workbench.control.private belongs to another producer"]);
});

test("FSS-52 the gate flags the removed translator and manifest fields even with an otherwise valid pack", () => {
  const files = core();
  const result = read({ ...files, [UI]: files[UI] + '\nLF("alpha", "中文"); globalThis.L("中文");',
    [manifest]: files[manifest].replace("contributions: []", 'contributions: [], messages: {}, translations: {}'),
  });
  assert.equal(result.problems.filter(problem => problem.includes("retired translator")).length, 2);
  assert.ok(result.problems.some(problem => problem.includes("replaced by ui.locales")));
  assert.equal(scanFile(UI, '// L("a comment")').retired.length, 0);
});

test("FSS-53 typed translators and dynamic English coverage fail on their own", () => {
  const port = DIR + "/src/words.ts", files = core();
  const typed = read({ ...files,
    [port]: 'export type Wording = (key: string, values?: Record<string, string | number>) => string;',
    [UI]: [
      'import type { Wording as Words } from "./words.js";',
      'function render(word: Words) { return word("还在使用原句"); }',
      'function inline(say: (key: string, args?: Record<string, string | number>) => string) { return say("alpha.page.absent"); }',
      'function dynamic(word: Words, status: string) { return word("alpha.page." + status); }',
    ].join("\n"),
    [EN]: messages("en", { "alpha.page.open": "Open {name}", "alpha.page.close": "Close" }),
  });
  assert.ok(typed.problems.some(problem => problem.includes("expected a stable text key at word")));
  assert.ok(typed.problems.some(problem => problem.includes("no registered default word for alpha.page.absent")));
  assert.ok(typed.dynamicCalls.some(call => call.prefix === "alpha.page."));
  assert.ok(typed.problems.some(problem => problem.includes("ui.locale_missing_key alpha.page.unused")));
});

test("FSS-53 the build-free gate refuses the same malformed packs as the SDK", () => {
  const files = core(), values = { "alpha.page.open": "Open {name}", "alpha.page.close": "Close", "alpha.page.unused": "Old" };
  for (const [raw, code] of [
    [JSON.stringify({ ...JSON.parse(files[EN]), format_version: 2 }), "ui.file_format_version"],
    [JSON.stringify({ ...JSON.parse(files[EN]), ui_messages: {} }), "ui.file_unknown_field"],
    [messages("en", { ...values, "alpha.page.open": { plural_arg: "x-y", forms: { other: "Open {name}" } } }), "ui.locale_placeholder"],
    [messages("en", { ...values, "alpha.page.open": { plural_arg: "name", forms: { dual: "Open {name}", other: "Open {name}" } } }), "ui.file_unknown_field"],
    [messages("en", { ...values, "alpha.page.open": "Open {name|file|files}" }), "ui.locale_old_plural"],
  ]) assert.ok(read({ ...files, [EN]: raw }).problems.some(problem => problem.includes(code)), code);
});

test("FSS-53 the real working tree has registered packs and no translation violations", () => {
  const result = summarise(scanTree(workingTreeSnapshot(process.cwd())));
  assert.ok(result.packs > 2);
  assert.ok(result.calls > 100);
  assert.deepEqual(result.errors, []);
});
