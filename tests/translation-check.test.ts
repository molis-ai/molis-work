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
  assert.deepEqual(read({ ...files, [EN]: messages("en", { "alpha.page.close": "Close" }) }).problems,
    [UI + ":3: no English word for alpha.page.open"]);
  assert.ok(read({ ...files, [UI]: files[UI] + '\nsayOwn("原文"); sayOwn("alpha.page.absent");' }).problems
    .some(problem => problem.includes('expected a stable text key at sayOwn: "原文"')));
  const dropped = read({ ...files, [manifest]: files[manifest].replace(/, locales: \{.*?\}/u, "") });
  assert.ok(dropped.problems.some(problem => problem.includes("declare the owner's ui.locales")));
  assert.ok(dropped.problems.some(problem => problem.includes(EN + ": no locale declaration")));
});

test("FSS-53 duplicate words, argument mismatches and a foreign file fail the locale gate", () => {
  const files = core();
  const duplicate = files[EN].replace('"alpha.page.close":"Close"', '"alpha.page.close":"Close","alpha.page.close":"Other"');
  assert.ok(read({ ...files, [EN]: duplicate }).problems.some(problem => problem.endsWith("repeated key alpha.page.close")));
  const wrongArgs = files[EN].replace("{name}", "{person}");
  assert.ok(read({ ...files, [EN]: wrongArgs }).problems.some(problem => problem.endsWith("arguments differ for alpha.page.open")));
  const wrongOwner = files[EN].replace(ID, "example.another.alpha");
  assert.ok(read({ ...files, [EN]: wrongOwner }).problems.some(problem => problem.endsWith("wrong owner, language or message table")));
  assert.ok(read({ ...files, [EN]: files[EN].replace("alpha.page.close", "beta.page.close") }).problems
    .some(problem => problem.endsWith("invalid or foreign key beta.page.close")));
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

test("FSS-53 only platform common words cross a plugin owner boundary", () => {
  const registry = "packages/design-system/resources/registry.json", owner = "apps/workbench/resources/locales/";
  const file = core()[UI] + '\nsayOwn("workbench.control.private"); sayOwn("common.control.save");';
  const platform = (locale: string) => messages(locale, { "workbench.control.private": "Private", "common.control.save": "Save" }, "workbench");
  const result = read({ ...core(), [UI]: file,
    [registry]: JSON.stringify({ resources: [{ kind: "locale", owner: "workbench", package: "@molis/workbench", path: "resources/locales" }] }),
    "apps/workbench/package.json": JSON.stringify({ name: "@molis/workbench" }),
    "packages/contracts/src/platform/ui-text.ts": 'const UI_LANGUAGES = [{tag: "zh"}, {tag: "en"}] as const;',
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

test("FSS-53 the real working tree has registered packs and no translation violations", () => {
  const result = summarise(scanTree(workingTreeSnapshot(process.cwd())));
  assert.ok(result.packs > 2);
  assert.ok(result.calls > 100);
  assert.deepEqual(result.errors, []);
});
