import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { SERVED_ROOT, analyse, isProductSource, missingErrors, ownerTable, scanFile, scanTree, summarise, unservedDictionaries, workingTreeSnapshot } from "../scripts/gates/translations.mjs";

// specs/repository-anti-corruption decision #16 (W1-08): the translation check scans every translator call and every
// dictionary instead of a list of files. It is a health-gate metric, so these tests drive scripts/check-health-gates.mjs on a
// small scratch repository, the way tests/health-gates-merge-base.test.ts does: each rule is mutation-verified (one violation
// added on a branch makes `--base main` fail, and rewriting the baseline in that branch hides nothing), and the changes
// that must stay possible (moving a file to stable keys, resolving a conflict, renaming a dictionary) pass.
const script = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));
const cli = fileURLToPath(new URL("../scripts/gates/translations.mjs", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
let repo = "";

const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args], { cwd: repo, encoding: "utf8", stdio: "pipe" });
const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text); };
const read = (file: string) => readFileSync(path.join(repo, file), "utf8");
const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", message); };
const gate = (...args: string[]) => {
  const run = spawnSync(process.execPath, [script, "--root", repo, ...args], { encoding: "utf8" });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
};
const branch = (name: string, mutate: () => void) => {
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
  git("checkout", "-q", "-B", name);
  mutate();
  commit(name);
};

// A scratch product: the Workbench dictionary (apps/workbench/src/i18n/en.ts builds the catalog the Host serves from the two
// plugins' dictionaries and its own entries), two plugins with a dictionary each ("说明" is translated two ways, the one
// frozen conflict), a server-rendered UI, and a browser script in a template literal. "旧的" is a dead key.
const base = () => {
  put("tooling/gates/limits.json", JSON.stringify({ file: 800, classLines: 300, classMethods: 25, functionLines: 150, vendoredPrologueSdk: 2 }, null, 2) + "\n");
  put("specs/demo/spec.md", "# Demo\n\n状态：进行中\n");
  put("apps/workbench/src/i18n/en.ts", [
    'import { ALPHA_EN } from "@scratch/alpha";',
    'import { BETA_EN } from "@scratch/beta";',
    'export const EN: Record<string, string> = {',
    "  ...ALPHA_EN,",
    "  ...BETA_EN,",
    '  "设置": "Settings",',
    '  "保存": "Save",',
    "};",
    'Object.assign(EN, { "关闭": "Close" });',
    "",
  ].join("\n"));
  put("apps/workbench/src/renderer.ts", [
    "export const render = (L: (zh: string) => string) => L(\"设置\") + L('保存') + L(\"关闭\");",
    '// L("只在注释里")',
    'export const name = (L: (zh: string) => string) => L("Gmail");',
    "",
  ].join("\n"));
  put("plugins/native/alpha/src/en.ts", 'export const ALPHA_EN: Record<string, string> = {\n  "打开": "Open",\n  "说明": "Description",\n  "旧的": "Old",\n};\n');
  put("plugins/native/alpha/src/ui.ts", "export const ui = (p: { text(value: string): string }) => p.text(\"打开\") + p.text(\"说明\");\n");
  put("plugins/native/beta/src/en.ts", 'export const BETA_EN: Record<string, string> = {\n  "说明": "Notes",\n  "载入": "Load",\n};\n');
  put("plugins/native/beta/src/client.ts", [
    "export const BETA_CLIENT_SCRIPT = `",
    '  const t = (value) => (typeof L === "function" ? L(value) : value);',
    "  document.title = L('载入') + t('载入') + globalThis.L('载入');",
    "`;",
    "",
  ].join("\n"));
  // Not product source: never scanned.
  put("tests/some.test.ts", 'export const x = L("测试里的字");\n');
  put("plugins/native/alpha/dist/ui.js", 'export const y = L("构建产物里的字");\n');
};

before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-translation-check-"));
  git("init", "-q", "-b", "main");
  base();
  git("add", "-A");
  assert.equal(gate("--update").code, 0);
  commit("base");
});
after(() => { if (repo) rmSync(repo, { recursive: true, force: true }); });

// A third plugin's dictionary, added to the catalog the way a plugin does it: an import and a spread in the Workbench's en.ts.
const gamma = (entries: string) => 'export const GAMMA_EN: Record<string, string> = {\n' + entries + '\n};\n';
const addToRoot = (import_: string, use: string) => put("apps/workbench/src/i18n/en.ts", read("apps/workbench/src/i18n/en.ts").replace('import { ALPHA_EN } from "@scratch/alpha";', `import { ALPHA_EN } from "@scratch/alpha";\n${import_}`).replace("  ...ALPHA_EN,", `  ...ALPHA_EN,\n${use}`));
const addGamma = (entries: string) => { put("plugins/native/gamma/src/en.ts", gamma(entries)); addToRoot('import { GAMMA_EN } from "@scratch/gamma";', "  ...GAMMA_EN,"); };
const messages = (owner: string, entries: string) => `export const ${owner.toUpperCase()}_MESSAGES = {\n${entries}\n};\n`;

// A browser program in three files of the beta plugin: program.ts defines tx and button, and joins the scripts of the files it
// imports (program-views.ts, and program-flows.ts when it has lines). Each file's lines are the body of its template.
const program = (files: { views: string[]; flows?: string[] }) => {
  const script = (name: string, constant: string, lines: string[]) => put(`plugins/native/beta/src/${name}.ts`, [`export const ${constant} = String.raw\``, ...lines, "`;", ""].join("\n"));
  const flows = files.flows !== undefined;
  put("plugins/native/beta/src/program.ts", [
    'import { PROGRAM_VIEWS } from "./program-views.js";',
    ...(flows ? ['import { PROGRAM_FLOWS } from "./program-flows.js";'] : []),
    "export const PROGRAM_SCRIPT = String.raw`",
    "  const tx = (value) => esc(L(value));",
    "  const button = (label, action) => '<button data-action=\"' + action + '\">' + tx(label) + '</button>';",
    `\` + PROGRAM_VIEWS${flows ? " + PROGRAM_FLOWS" : ""};`,
    "",
  ].join("\n"));
  script("program-views", "PROGRAM_VIEWS", ["", ...files.views]);
  if (files.flows) script("program-flows", "PROGRAM_FLOWS", ["", ...files.flows]);
};

type Scenario = { name: string; mutate: () => void; expect: RegExp[] };
// Missing English is absolute: it fails at the head whatever the baseline says.
const missing: Scenario[] = [
  { name: "a double-quoted L() with no entry", mutate: () => put("apps/workbench/src/renderer.ts", `${read("apps/workbench/src/renderer.ts")}export const more = (L: (zh: string) => string) => L("新的");\n`),
    expect: [/no English for "新的" \(apps\/workbench\/src\/renderer\.ts:4\); add its English to apps\/workbench\/src\/i18n\/en\.ts/] },
  { name: "a p.text() with no entry", mutate: () => put("plugins/native/alpha/src/ui.ts", `${read("plugins/native/alpha/src/ui.ts")}export const more = (p: { text(value: string): string }) => p.text("新的");\n`),
    expect: [/no English for "新的" \(plugins\/native\/alpha\/src\/ui\.ts:2\); add its English to plugins\/native\/alpha\/src\/en\.ts/] },
  { name: "a single-quoted L() in a browser script", mutate: () => put("plugins/native/beta/src/client.ts", read("plugins/native/beta/src/client.ts").replace("document.title", "document.body.title = L('新的');\n  document.title")),
    expect: [/no English for "新的" \(plugins\/native\/beta\/src\/client\.ts:\d+\); add its English to plugins\/native\/beta\/src\/en\.ts/] },
  { name: "a wrapper defined inside the browser script", mutate: () => put("plugins/native/beta/src/client.ts", read("plugins/native/beta/src/client.ts").replace("document.title", "document.body.title = t('新的');\n  document.title")),
    expect: [/no English for "新的" \(plugins\/native\/beta\/src\/client\.ts/] },
  { name: "a globalThis.L() in a browser script", mutate: () => put("plugins/native/beta/src/client.ts", read("plugins/native/beta/src/client.ts").replace("document.title", "document.body.title = globalThis.L('新的');\n  document.title")),
    expect: [/no English for "新的" \(plugins\/native\/beta\/src\/client\.ts/] },
  { name: "a wrapper function that forwards a parameter to p.text()", mutate: () => put("plugins/native/alpha/src/ui.ts", [
    "export const ui = (p: { text(value: string): string; escape(value: string): string }) => {",
    "  const t = (value: string) => p.escape(p.text(value));",
    '  const button = (label: string, attr: string) => `<button ${attr}>${t(label)}</button>`;',
    '  return t("打开") + t("说明") + button("新的", "x");',
    "};",
    "",
  ].join("\n")), expect: [/no English for "新的" \(plugins\/native\/alpha\/src\/ui\.ts:4\)/] },
  { name: "one branch of a conditional key", mutate: () => put("apps/workbench/src/renderer.ts", `${read("apps/workbench/src/renderer.ts")}export const pick = (L: (zh: string) => string, flag: boolean) => L(flag ? "设置" : "新的");\n`),
    expect: [/no English for "新的"/] },
  { name: "a value of a constant table that is passed to L()", mutate: () => put("apps/workbench/src/renderer.ts", `${read("apps/workbench/src/renderer.ts")}const LABEL = { ready: "设置", broken: "新的" } as const;\nexport const label = (L: (zh: string) => string, state: keyof typeof LABEL) => L(LABEL[state]);\n`),
    expect: [/no English for "新的"/] },
  { name: "a stable key in a constant table that is passed to L()", mutate: () => put("plugins/native/alpha/src/ui.ts", `${read("plugins/native/alpha/src/ui.ts")}const STATUS = { running: "alpha.status.running" } as const;\nexport const status = (L: (key: string) => string, state: keyof typeof STATUS) => L(STATUS[state]);\n`),
    expect: [/no English for "alpha\.status\.running" \(plugins\/native\/alpha\/src\/ui\.ts:\d+\); define it with \{ zh, en \} in the alpha dictionary/] },
  { name: "a translator injected as a typed parameter", mutate: () => put("plugins/native/alpha/src/ui.ts", `${read("plugins/native/alpha/src/ui.ts")}export const injected = (text: (value: string, values?: Record<string, string | number>) => string) => text("新的");\n`),
    expect: [/no English for "新的" \(plugins\/native\/alpha\/src\/ui\.ts:2\)/] },
  { name: "a translate() call", mutate: () => put("plugins/native/alpha/src/ui.ts", `${read("plugins/native/alpha/src/ui.ts")}export const viaTranslate = (translate: (value: string) => string) => translate("新的");\n`),
    expect: [/no English for "新的"/] },
  // Under String.raw the browser gets the text as written. Read as cooked text, `'\n'` is a real line break inside a quoted
  // string and `\/\/` loses its backslashes, so `/^https?:\/\//` turns into a `//` comment: the parse breaks there and every
  // call after it on the line is lost.
  { name: "an L() after '\\n' and a regular expression in a String.raw browser script", mutate: () => put("plugins/native/beta/src/raw-client.ts", [
    "export const RAW_SCRIPT = String.raw`",
    "  const parts = text.split('\\n');",
    "  const web = /^https?:\\/\\//.test(value); document.title = L('新的');",
    "  console.log(parts, web);",
    "`;",
    "",
  ].join("\n")), expect: [/no English for "新的" \(plugins\/native\/beta\/src\/raw-client\.ts:3\); add its English to plugins\/native\/beta\/src\/en\.ts/] },
  { name: "an L() after '\\n' in a String.raw browser script with a substitution", mutate: () => put("plugins/native/beta/src/raw-client.ts", [
    "const ID = 'x';",
    "export const RAW_SCRIPT = String.raw`",
    "  const parts = text.split('\\n'), id = '${ID}'; note = L('新的');",
    "  const again = L('载入') + /\\d+\\/\\//.test(id) + L('也新的');",
    "`;",
    "",
  ].join("\n")), expect: [/no English for "新的" \(plugins\/native\/beta\/src\/raw-client\.ts:3\)/, /no English for "也新的" \(plugins\/native\/beta\/src\/raw-client\.ts:4\)/] },
  { name: "an L() after an escaped newline in an ordinary template", mutate: () => put("plugins/native/beta/src/cooked-client.ts", [
    "export const COOKED_SCRIPT = `",
    "  const parts = text.split('\\\\n'); document.title = L('新的');",
    "`;",
    "",
  ].join("\n")), expect: [/no English for "新的" \(plugins\/native\/beta\/src\/cooked-client\.ts:2\)/] },
  // A wrapper that translates two of its parameters has two keys at every call (`relationGroup(title, hint)`); a gate that reads
  // only the first lets the second reach the English interface as Chinese.
  { name: "the second label of a wrapper that translates two parameters", mutate: () => put("plugins/native/alpha/src/ui.ts", [
    "export const ui = (p: { text(value: string): string }) => {",
    "  const group = (title: string, hint: string) => `<h3>${p.text(title)}</h3><p>${p.text(hint)}</p>`;",
    '  return group("打开", "新的");',
    "};",
    "",
  ].join("\n")), expect: [/no English for "新的" \(plugins\/native\/alpha\/src\/ui\.ts:3\)/] },
  // `group` is read before `describe`, the function its second parameter goes to: that parameter becomes a key only on a later
  // round, once `describe` is known to translate. A single pass loses it.
  { name: "a second parameter that reaches the translator through a function defined after the wrapper", mutate: () => put("plugins/native/alpha/src/ui.ts", [
    "export const ui = (p: { text(value: string): string }) => {",
    "  const group = (title: string, hint: string) => p.text(title) + describe(hint);",
    "  const describe = (value: string) => p.text(value);",
    '  return group("打开", "新的");',
    "};",
    "",
  ].join("\n")), expect: [/no English for "新的" \(plugins\/native\/alpha\/src\/ui\.ts:4\)/] },
  { name: "a parameter after an untranslated one (the first is a name, the second a label)", mutate: () => put("plugins/native/alpha/src/ui.ts", [
    "export const ui = (p: { text(value: string): string }) => {",
    "  const toggle = (name: string, label: string, description: string) => `<input name=\"${name}\"><b>${p.text(label)}</b><i>${p.text(description)}</i>`;",
    '  return toggle("approval", "打开", "新的");',
    "};",
    "",
  ].join("\n")), expect: [/no English for "新的" \(plugins\/native\/alpha\/src\/ui\.ts:3\)/] },
  { name: "the placeholder of a field wrapper in a browser script (the second parameter reaches the translator)", mutate: () => put("plugins/native/beta/src/client.ts", read("plugins/native/beta/src/client.ts").replace("document.title", "const field = (name, label, placeholder) => '<input name=\"' + name + '\" placeholder=\"' + t(placeholder) + '\">' + t(label);\n  document.body.innerHTML = field('a', '载入', '新的');\n  document.title")),
    expect: [/no English for "新的" \(plugins\/native\/beta\/src\/client\.ts:\d+\)/] },
  // One browser program in several files: `program.ts` defines `tx` and `button`, joins the script constants of the files it
  // imports, and those files call the wrappers without defining them.
  { name: "a wrapper defined in the file that joins the script (the other file calls it)", mutate: () => program({
    views: ["  document.title = L('载入') + tx('新的') + button('也新的', 'go');"],
  }), expect: [/no English for "新的" \(plugins\/native\/beta\/src\/program-views\.ts:3\)/, /no English for "也新的" \(plugins\/native\/beta\/src\/program-views\.ts:3\)/] },
  { name: "a wrapper another file defines, in a file that has no L() of its own", mutate: () => program({
    views: ["  document.title = tx('新的');"],
  }), expect: [/no English for "新的" \(plugins\/native\/beta\/src\/program-views\.ts:3\)/] },
  { name: "a wrapper of one imported file that calls a wrapper of the joining file (a chain over two files)", mutate: () => program({
    views: ["  const section = (title, body) => '<h3>' + tx(title) + '</h3>' + body;", "  document.title = L('载入') + section('新的', '');"],
  }), expect: [/no English for "新的" \(plugins\/native\/beta\/src\/program-views\.ts:4\)/] },
  { name: "a wrapper of a third file that is built on the second file's wrapper", mutate: () => program({
    views: ["  const section = (title, body) => '<h3>' + tx(title) + '</h3>' + body;", "  document.title = L('载入');"],
    flows: ["  document.body.title = L('载入') + card('新的');", "  const card = (title) => section(title, '');"],
  }), expect: [/no English for "新的" \(plugins\/native\/beta\/src\/program-flows\.ts:3\)/] },
  { name: "a key with placeholders that no dictionary has", mutate: () => put("apps/workbench/src/renderer.ts", `${read("apps/workbench/src/renderer.ts")}export const n = (L: (zh: string, vars?: Record<string, number>) => string) => L("共 {count} 项", { count: 3 });\n`),
    expect: [/no English for "共 \{count\} 项"/] },
];

const failsAndStaysFailing = (scenario: Scenario) => {
  test(`${scenario.name} fails, and --update does not hide it`, () => {
    branch("absolute", scenario.mutate);
    const caught = gate("--base", "main");
    assert.equal(caught.code, 1, caught.out);
    for (const pattern of scenario.expect) assert.match(caught.out, pattern);
    gate("--update");
    commit("update baseline");
    const still = gate("--base", "main");
    assert.equal(still.code, 1, still.out);
    for (const pattern of scenario.expect) assert.match(still.out, pattern);
  });
};
for (const scenario of missing) failsAndStaysFailing(scenario);

// The sharing stops where the program stops: a file that neither imports a script nor is imported by one keeps its own names (its
// own `tx` is not the program's), and so does a file of another plugin, even when it imports the program.
test("a wrapper is followed only into the files of its own browser program", () => {
  branch("lonely", () => {
    program({ views: ["  document.title = L('载入') + tx('载入');"] });
    put("plugins/native/beta/src/lonely.ts", "export const LONELY = String.raw`\n  document.title = L('载入') + tx('孤独') + button('更孤独', 'go');\n`;\n");
    put("plugins/native/alpha/src/outside.ts", 'import { PROGRAM_SCRIPT } from "../../beta/src/program.js";\nexport const OUTSIDE = String.raw`\n  document.title = L(\'打开\') + tx(\'外面\');\n` + PROGRAM_SCRIPT;\n');
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  const calls = JSON.parse(gate("--report", "--json").out).head.translations;
  assert.equal(calls.missingKeys, 0);
});

test("a program whose files all have English passes, and the wrapper calls in every file are counted", () => {
  branch("program", () => program({
    views: ["  const section = (title, body) => '<h3>' + tx(title) + '</h3>' + body;", "  document.title = L('载入') + section('设置', '');"],
    flows: ["  document.body.title = L('载入') + button('保存', 'go');"],
  }));
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  const calls = scanFile("plugins/native/beta/src/program-views.ts", read("plugins/native/beta/src/program-views.ts"), new Map([["tx", new Set([0])]])).calls;
  assert.deepEqual(calls.filter((call: { callee: string }) => call.callee === "section").map((call: { key: string }) => call.key), ["设置"]);
  assert.deepEqual(scanFile("plugins/native/beta/src/program-views.ts", read("plugins/native/beta/src/program-views.ts")).calls.filter((call: { callee: string }) => call.callee === "section"), [], "alone, the file does not know tx");
});

// A dictionary only counts when the English catalog the Host serves (`EN`, built in apps/workbench/src/i18n/en.ts) reaches it:
// writing `FOO_EN` and never adding it there leaves the English interface showing Chinese, which no test of the key set sees.
const gammaText = gamma('  "伽马": "Gamma",');
const rootText = () => read("apps/workbench/src/i18n/en.ts");
const unserved: Scenario[] = [
  { name: "a dictionary that no served dictionary imports", mutate: () => put("plugins/native/gamma/src/en.ts", gammaText),
    expect: [/dictionary GAMMA_EN \(plugins\/native\/gamma\/src\/en\.ts:1\) is not part of the English the Host serves, so its texts are never shown in English; import GAMMA_EN in apps\/workbench\/src\/i18n\/en\.ts/] },
  { name: "a dictionary that is imported but never added to EN", mutate: () => { put("plugins/native/gamma/src/en.ts", gammaText); addToRoot('import { GAMMA_EN } from "@scratch/gamma";', ""); },
    expect: [/dictionary GAMMA_EN \(plugins\/native\/gamma\/src\/en\.ts:1\) is not part of the English the Host serves/] },
  { name: "a dictionary that is only re-exported by a barrel file", mutate: () => { put("plugins/native/gamma/src/en.ts", gammaText); put("plugins/native/gamma/src/index.ts", 'export { GAMMA_EN } from "./en.js";\n'); },
    expect: [/dictionary GAMMA_EN \(plugins\/native\/gamma\/src\/en\.ts:1\) is not part of the English the Host serves/] },
  { name: "a dictionary that a served dictionary's file only re-exports", mutate: () => { put("plugins/native/gamma/src/en.ts", gammaText); put("plugins/native/alpha/src/en.ts", `${read("plugins/native/alpha/src/en.ts")}export { GAMMA_EN } from "@scratch/gamma";\n`); },
    expect: [/dictionary GAMMA_EN \(plugins\/native\/gamma\/src\/en\.ts:1\) is not part of the English the Host serves/] },
  { name: "a dictionary that another file only fills with Object.assign", mutate: () => { put("plugins/native/gamma/src/en.ts", gammaText); put("plugins/native/gamma/src/more.ts", 'import { GAMMA_EN } from "./en.js";\nObject.assign(GAMMA_EN, { "更多伽马": "More gamma" });\n'); },
    expect: [/dictionary GAMMA_EN \(plugins\/native\/gamma\/src\/en\.ts:1\) is not part of the English the Host serves/] },
  { name: "a second dictionary in a served file that nothing uses", mutate: () => put("plugins/native/alpha/src/en.ts", `${read("plugins/native/alpha/src/en.ts")}export const ALPHA_LATER_EN: Record<string, string> = { "更晚": "Later" };\n`),
    expect: [/dictionary ALPHA_LATER_EN \(plugins\/native\/alpha\/src\/en\.ts:\d+\) is not part of the English the Host serves/] },
];
for (const scenario of unserved) failsAndStaysFailing(scenario);

// The three ways a dictionary does reach EN: spread by the root, merged by it, or spread by a dictionary the root imports.
const served: Array<{ name: string; mutate: () => void }> = [
  { name: "spread into EN", mutate: () => addGamma('  "伽马": "Gamma",') },
  { name: "merged into EN with Object.assign, under another name", mutate: () => { put("plugins/native/gamma/src/en.ts", gammaText); put("apps/workbench/src/i18n/en.ts", `import { GAMMA_EN as G } from "@scratch/gamma";\n${rootText()}Object.assign(EN, G);\n`); } },
  { name: "spread by a served dictionary of another plugin", mutate: () => {
    put("plugins/native/gamma/src/en.ts", gammaText);
    put("plugins/native/alpha/src/en.ts", `import { GAMMA_EN } from "@scratch/gamma";\n${read("plugins/native/alpha/src/en.ts").replace('export const ALPHA_EN: Record<string, string> = {', "export const ALPHA_EN: Record<string, string> = {\n  ...GAMMA_EN,")}`);
  } },
];
for (const scenario of served) {
  test(`a dictionary ${scenario.name} is served`, () => {
    branch("served", scenario.mutate);
    const run = gate("--base", "main");
    assert.equal(run.code, 0, run.out);
    assert.match(gate("--report").out, /unserved dictionaries: 0/);
  });
}

// Conflicts are frozen: the baseline lists today's, a new one or one more variant fails, and rewriting the baseline in the
// same branch does not help because --base compares with the merge-base's own scan.
const conflicts: Scenario[] = [
  { name: "a new conflict between two dictionaries", mutate: () => put("plugins/native/beta/src/en.ts", 'export const BETA_EN: Record<string, string> = {\n  "说明": "Notes",\n  "载入": "Load",\n  "保存": "Store",\n};\n'),
    expect: [/new translation conflict: "保存" is translated 2 ways: "Save" \(apps\/workbench\/src\/i18n\/en\.ts:\d+\) \| "Store" \(plugins\/native\/beta\/src\/en\.ts:\d+\)/] },
  { name: "one more variant of the frozen conflict", mutate: () => addGamma('  "说明": "Caption",'),
    expect: [/translation conflict grew: "说明" has 3 different English texts, was 2/] },
  { name: "a new conflict inside one file (a later block overrides)", mutate: () => put("apps/workbench/src/i18n/en.ts", `${read("apps/workbench/src/i18n/en.ts")}Object.assign(EN, { "设置": "Preferences" });\n`),
    expect: [/new translation conflict: "设置" is translated 2 ways: "Settings" \(apps\/workbench\/src\/i18n\/en\.ts:\d+\) \| "Preferences"/] },
];

for (const scenario of conflicts) {
  test(`${scenario.name} fails against the merge-base, and --update does not hide it`, () => {
    branch("conflict", scenario.mutate);
    const caught = gate("--base", "main");
    assert.equal(caught.code, 1, caught.out);
    for (const pattern of scenario.expect) assert.match(caught.out, pattern);
    const refused = gate("--update", "--base", "main");
    assert.equal(refused.code, 1, refused.out);
    assert.match(refused.out, /Baseline not written/);
    assert.equal(git("status", "--porcelain"), "", "a refused --update leaves baseline.json alone");
    assert.equal(gate("--update").code, 0);
    commit("update baseline");
    assert.equal(gate().code, 0, "the committed baseline now agrees with the head, which is the hole the merge-base comparison closes");
    const still = gate("--base", "main");
    assert.equal(still.code, 1, still.out);
    for (const pattern of scenario.expect) assert.match(still.out, pattern);
  });
}

test("a third dictionary that repeats an existing English text adds no conflict", () => {
  branch("same-english", () => addGamma('  "说明": "Notes",'));
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
});

// The target scheme (decision #16): `owner.area.name` with { zh, en } in the owner's dictionary, checked as soon as one exists.
const stableAlpha = messages("alpha", '  "alpha.ui.open": { zh: "打开", en: "Open" },\n  "alpha.ui.saved": { zh: "已保存 {count} 项", en: "Saved {count} items" },');
const stable: Scenario[] = [
  { name: "a stable key defined twice", mutate: () => { put("plugins/native/alpha/src/messages.ts", stableAlpha); put("plugins/native/alpha/src/more-messages.ts", messages("alpha", '  "alpha.ui.open": { zh: "打开", en: "Open" },')); },
    expect: [/stable key alpha\.ui\.open is defined 2 times \(plugins\/native\/alpha\/src\/messages\.ts:\d+, plugins\/native\/alpha\/src\/more-messages\.ts:\d+\); one key, one definition/] },
  { name: "a stable key that does not start with its owner", mutate: () => put("plugins/native/beta/src/messages.ts", messages("beta", '  "alpha.ui.open": { zh: "打开", en: "Open" },')),
    expect: [/stable key alpha\.ui\.open \(plugins\/native\/beta\/src\/messages\.ts:\d+\) must start with its owner: beta/] },
  { name: "a stable key without English", mutate: () => put("plugins/native/alpha/src/messages.ts", messages("alpha", '  "alpha.ui.open": { zh: "打开" },')),
    expect: [/stable key alpha\.ui\.open \(plugins\/native\/alpha\/src\/messages\.ts:\d+\) needs both zh and en as non-empty literal text/] },
  { name: "a stable key whose zh and en use different placeholders", mutate: () => put("plugins/native/alpha/src/messages.ts", messages("alpha", '  "alpha.ui.saved": { zh: "已保存 {count} 项", en: "Saved {total} items" },')),
    expect: [/stable key alpha\.ui\.saved \(plugins\/native\/alpha\/src\/messages\.ts:\d+\): zh and en use different \{placeholders\}/] },
  { name: "a call to a stable key nobody defines", mutate: () => put("plugins/native/alpha/src/ui.ts", `${read("plugins/native/alpha/src/ui.ts")}export const gone = (p: { text(value: string): string }) => p.text("alpha.ui.gone");\n`),
    expect: [/no English for "alpha\.ui\.gone" \(plugins\/native\/alpha\/src\/ui\.ts:2\); define it with \{ zh, en \} in the alpha dictionary/] },
  { name: "a plugin using another owner's stable key", mutate: () => {
    put("plugins/native/alpha/src/messages.ts", stableAlpha);
    put("plugins/native/beta/src/client.ts", `${read("plugins/native/beta/src/client.ts")}export const borrowed = (L: (key: string) => string) => L("alpha.ui.open");\n`);
  }, expect: [/plugins\/native\/beta\/src\/client\.ts:\d+ uses alpha\.ui\.open, which belongs to alpha; a key is used by its owner only/] },
];

for (const scenario of stable) {
  test(`${scenario.name} fails`, () => {
    branch("stable", scenario.mutate);
    const caught = gate("--base", "main");
    assert.equal(caught.code, 1, caught.out);
    for (const pattern of scenario.expect) assert.match(caught.out, pattern);
  });
}

test("a file moves to stable keys while the rest stays on Chinese keys", () => {
  branch("moved", () => {
    // Alpha's UI moves: its keys, their English and the owner's dictionary entry go together, nothing else changes.
    put("plugins/native/alpha/src/messages.ts", messages("alpha", '  "alpha.ui.open": { zh: "打开", en: "Open" },\n  "alpha.ui.description": { zh: "说明", en: "Description" },'));
    put("plugins/native/alpha/src/ui.ts", "export const ui = (p: { text(value: string): string }) => p.text(\"alpha.ui.open\") + p.text(\"alpha.ui.description\");\n");
    put("plugins/native/alpha/src/en.ts", 'export const ALPHA_EN: Record<string, string> = {\n  "旧的": "Old",\n};\n');
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  // The conflict on "说明" is gone with the Chinese key: one fewer, which the hint says.
  assert.match(run.out, /Lower than the merge-base: translations/);
  assert.match(run.out, /0 translation conflicts, 0 missing English/);
  const report = JSON.parse(gate("--report", "--json", "--base", "main").out);
  assert.equal(report.head.translations.stableKeys, 2);
  assert.equal(report.base.translations.stableKeys, 0);
  assert.deepEqual(report.head.translations.conflicts, {});
  assert.deepEqual(report.base.translations.conflicts, { "说明": 2 });
});

test("resolving a conflict lowers the number and --update --base accepts it", () => {
  branch("resolved", () => put("plugins/native/beta/src/en.ts", 'export const BETA_EN: Record<string, string> = {\n  "说明": "Description",\n  "载入": "Load",\n};\n'));
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.match(run.out, /Lower than the merge-base: translations/);
  assert.equal(gate("--update", "--base", "main").code, 0);
  assert.deepEqual(JSON.parse(read("tooling/gates/baseline.json")).translationConflicts, {});
});

test("renaming or moving a dictionary does not make its frozen conflict new", () => {
  branch("moved-dictionary", () => {
    git("mv", "plugins/native/beta/src/en.ts", "plugins/native/beta/src/translations.ts");
    put("plugins/native/beta/src/translations.ts", read("plugins/native/beta/src/translations.ts").replace("BETA_EN", "BETA_FIXED_EN"));
    put("apps/workbench/src/i18n/en.ts", read("apps/workbench/src/i18n/en.ts").replaceAll("BETA_EN", "BETA_FIXED_EN"));
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
});

test("dead keys, comments, tests and build output are reported or ignored, never failures", () => {
  branch("quiet", () => {
    put("plugins/native/alpha/src/en.ts", 'export const ALPHA_EN: Record<string, string> = {\n  "打开": "Open",\n  "说明": "Description",\n  "旧的": "Old",\n  "更旧的": "Older",\n};\n');
    put("apps/workbench/src/renderer.ts", `${read("apps/workbench/src/renderer.ts")}// L("评论里的字")\nexport const text = "L('字符串里的字')";\n`);
    put("tests/other.test.ts", 'export const y = L("另一个测试里的字");\n');
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  const report = JSON.parse(gate("--report", "--json").out);
  assert.equal(report.head.translations.deadKeys, 2, "旧的 and 更旧的 are mentioned nowhere");
  assert.equal(report.head.translations.missingKeys, 0);
  assert.match(gate("--report").out, /missing English: 0; unserved dictionaries: 0; stable-key problems: 0; dead keys \(reported only\): 2/);
});

test("a key built from a stable prefix keeps the keys of that family from being dead", () => {
  branch("family", () => {
    put("plugins/native/alpha/src/messages.ts", messages("alpha", '  "alpha.status.running": { zh: "进行中", en: "Running" },\n  "alpha.status.stopped": { zh: "已停止", en: "Stopped" },\n  "alpha.other.unused": { zh: "没人用", en: "Unused" },'));
    put("plugins/native/alpha/src/ui.ts", `${read("plugins/native/alpha/src/ui.ts")}export const status = (L: (key: string) => string, state: string) => L(\`alpha.status.\${state}\`);\n`);
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  const report = JSON.parse(gate("--report", "--json").out);
  assert.equal(report.head.translations.stableKeys, 3);
  assert.equal(report.head.translations.dynamicCalls, 1);
  // 旧的 (legacy) and alpha.other.unused (not under the family) are dead; the two alpha.status.* keys are not.
  assert.equal(report.head.translations.deadKeys, 2);
});

test("the report prints the numbers and the biggest conflicts; an old-shaped baseline asks for --update", () => {
  git("checkout", "-q", "-f", "main");
  const text = gate("--report", "--top", "1").out;
  assert.match(text, /Translations: 3 dictionaries, 8 entries \(7 distinct keys, 1 defined more than once\), 0 stable keys/);
  assert.match(text, /conflicting keys: 1;/);
  assert.match(text, /\s2\s+"说明"/);
  assert.equal(JSON.parse(read("tooling/gates/baseline.json")).translationConflictTotal, 1);
  const baseline = JSON.parse(read("tooling/gates/baseline.json"));
  delete baseline.translationConflicts;
  put("tooling/gates/baseline.json", `${JSON.stringify(baseline, null, 2)}\n`);
  const old = gate();
  assert.equal(old.code, 2, old.out);
  assert.match(old.out, /translationConflicts is missing or has an old shape; regenerate it/);
  git("checkout", "-q", "-f", "main");
});

// ---- this repository ----------------------------------------------------------------------------------------------------------
// The scan has to read the real tree, not only fixtures: these are canaries for each kind of call and for the dictionaries.
const real = (() => { const scan = scanTree(workingTreeSnapshot(repoRoot), isProductSource); return { scan, summary: summarise(scan) }; })();

test("this repository: nothing is missing, and the scan covers every kind of call the product uses", () => {
  const { scan, summary } = real;
  assert.deepEqual(summary.detail.missing.map((item: { key: string; sites: Array<{ file: string; line: number }> }) => `${item.key} ${item.sites[0]!.file}:${item.sites[0]!.line}`), [], "every translator call has English");
  assert.deepEqual(scan.stableErrors, []);
  assert.ok(summary.dictionaries >= 40 && summary.entries >= 9000, `dictionaries ${summary.dictionaries}, entries ${summary.entries}`);
  assert.ok(summary.calls >= 7000 && summary.callFiles >= 150, `calls ${summary.calls} in ${summary.callFiles} files`);
  // One floor per kind of call (about half of what the tree has today), so a refactor that moves a file does not break this,
  // while a rule that stops reading a whole kind of call does.
  const count = (match: (call: { callee: string; embedded: boolean }) => boolean) => scan.calls.filter(match).length;
  const roots = new Set(["L", "p.text", "p.L", "primitives.text", "globalThis.L", "this.t", "translate"]);
  assert.ok(count((call) => call.callee === "L") > 3000, "L(…) in server renderers and browser scripts");
  assert.ok(count((call) => call.callee === "p.text") > 600, "p.text(…) in plugin UI files");
  assert.ok(count((call) => call.embedded) > 1500, "calls inside the browser scripts that live in template literals");
  assert.ok(count((call) => call.callee === "globalThis.L" && call.embedded) >= 1, "globalThis.L(…) inside a browser script");
  assert.ok(count((call) => !roots.has(call.callee)) > 250, "calls of wrappers and of translators injected as typed parameters");
  assert.ok(count((call) => call.callee === "this.t") > 20 && count((call) => call.callee === "p.L") > 20, "this.t(…) and p.L(…)");
  assert.ok(count((call) => call.callee === "text") > 10, "an injected translator typed as a parameter (text: (value: string, values?: Record<string, string | number>) => string)");
});

test("this repository: wrappers are followed through every forwarded parameter and into the other files of a browser program", () => {
  const keys = (file: string, callee: string) => real.scan.calls.filter((call: { file: string; callee: string }) => call.file === file && call.callee === callee).map((call: { key: string }) => call.key);
  // two labels, one call: the title and the hint (relationGroup, renderPolicyToggle), and a placeholder after a label (field)
  assert.ok(keys("plugins/native/goals/src/relation-ui.ts", "relationGroup").includes("上游") && keys("plugins/native/goals/src/relation-ui.ts", "relationGroup").includes("这个 Goal 的归属与完成依赖"));
  assert.ok(keys("plugins/native/goals/src/policy-ui.ts", "renderPolicyToggle").includes("完成前必须由用户确认工作结果"));
  assert.ok(keys("plugins/native/workflows/src/client.ts", "field").includes("标题规则") && keys("plugins/native/workflows/src/client.ts", "field").includes("{标题}"));
  // Alchemist: tx and button are defined in client.ts, section in client-views.ts, and the three other script files call them
  assert.ok(keys("plugins/native/alchemist/src/client-views.ts", "button").includes("归档方向"));
  assert.ok(keys("plugins/native/alchemist/src/client-views.ts", "tx").includes("实际使用次数"));
  assert.ok(keys("plugins/native/alchemist/src/client-flows.ts", "field").includes("探索描述"));
  assert.ok(keys("plugins/native/alchemist/src/work-reuse/client.ts", "section").includes("适用条件"), "section is defined in client-views.ts and calls tx from client.ts");
  // Jelly: btn, empty and openGeneric are defined in client.ts, and five script files call them
  assert.ok(keys("plugins/native/jelly/src/client-calendar.ts", "btn").length >= 20);
  assert.ok(keys("plugins/native/jelly/src/client-model.ts", "tx").includes("拆成任务时，原文会发送给所选模型。保存设置不会发送内容。"));
});

test("this repository: every dictionary is part of the English the Host serves, and the rule is really looking at it", () => {
  const { scan, summary } = real;
  assert.deepEqual(scan.unserved, []);
  assert.equal(summary.unservedDictionaries, 0);
  // The rule is off when its root cannot be found, so pin the root: it exists, builds `EN`, and uses the dictionaries.
  const root = scan.files.find((file: { file: string }) => file.file === SERVED_ROOT);
  assert.ok(root, `${SERVED_ROOT} is not a scanned file: move SERVED_ROOT in scripts/gates/translations.mjs with it`);
  assert.ok(root.dictionaries.some((item: { name: string }) => item.name === "EN"));
  const rootUses = new Set([...root.usesBy.values()].flatMap((names: Set<string>) => [...names]));
  assert.ok(rootUses.size >= 30 && rootUses.has("IMAGES_EN") && rootUses.has("FUNCTIONS_EN"), `the root uses ${rootUses.size} dictionaries`);
  // Mutations on the real tree: the root stops using a plugin's dictionary, or a new dictionary appears that nothing uses.
  const without = (name: string) => scan.files.map((file: { file: string; usesBy: Map<string, Set<string>> }) => (file.file === SERVED_ROOT
    ? { ...file, usesBy: new Map([...file.usesBy].map(([owner, names]) => [owner, new Set([...names].filter((use) => use !== name))])) } : file));
  assert.deepEqual(unservedDictionaries(without("IMAGES_EN")).map((item: { name: string; file: string }) => `${item.name} ${item.file}`), ["IMAGES_EN plugins/native/images/src/en.ts"]);
  const extra = scanFile("plugins/native/images/src/more-en.ts", 'export const IMAGES_MORE_EN: Record<string, string> = { "更多": "More" };\n');
  assert.deepEqual(unservedDictionaries([...scan.files, extra]).map((item: { name: string }) => item.name), ["IMAGES_MORE_EN"]);
  const spread = scanFile("plugins/native/images/src/en.ts", `${readFileSync(path.join(repoRoot, "plugins/native/images/src/en.ts"), "utf8")}\nexport const IMAGES_LATER_EN = { ...IMAGES_MORE_EN, "后来": "Later" };\n`);
  assert.deepEqual(unservedDictionaries([...scan.files.filter((file: { file: string }) => file.file !== spread.file), spread, extra]).map((item: { name: string }) => item.name).sort(), ["IMAGES_LATER_EN", "IMAGES_MORE_EN"]);
});

test("without the catalog root there is nothing to serve from, and the rule stays quiet", () => {
  const files = [scanFile("plugins/native/gamma/src/en.ts", 'export const GAMMA_EN: Record<string, string> = { "伽马": "Gamma" };\n')];
  assert.deepEqual(unservedDictionaries(files), []);
  assert.deepEqual(unservedDictionaries([...files, scanFile(SERVED_ROOT, "export const NOT_THE_CATALOG = 1;\n")]), []);
  const withRoot = [...files, scanFile(SERVED_ROOT, 'export const EN: Record<string, string> = { "设置": "Settings" };\n')];
  assert.deepEqual(unservedDictionaries(withRoot).map((item: { name: string }) => item.name), ["GAMMA_EN"]);
});

test("this repository: every dictionary file is found, wherever it lives", () => {
  const listed = workingTreeSnapshot(repoRoot).files.filter((file) => isProductSource(file) && /(^|\/)(en|[a-z-]+-en)\.ts$/.test(file));
  assert.ok(listed.length >= 40);
  assert.deepEqual(listed.filter((file) => !real.scan.dictionaryFiles.has(file)), [], "a *-en.ts file the scan could not read as a dictionary");
});

test("this repository: scanning a file twice gives the same facts, and the owners table names the plugins", () => {
  const text = readFileSync(path.join(repoRoot, "plugins/native/images/src/ui.ts"), "utf8");
  assert.deepEqual(scanFile("plugins/native/images/src/ui.ts", text).calls, scanFile("plugins/native/images/src/ui.ts", text).calls);
  const owners = new Map(ownerTable(real.scan).map((row: { owner: string }) => [row.owner, row]));
  for (const owner of ["workbench", "goals", "images", "schedule", "todo"]) assert.ok(owners.has(owner), owner);
});

test("a missing key says which dictionary its English belongs in", () => {
  const dictionary = (file: string, name: string) => scanFile(file, `export const ${name}: Record<string, string> = { "已有": "Present" };\n`);
  const result = summarise(analyse([
    dictionary("apps/workbench/src/i18n/en.ts", "EN"), dictionary("apps/workbench/src/i18n/renderer-gap-en.ts", "RENDERER_GAP_EN"), dictionary("apps/workbench/src/functions/en.ts", "FUNCTIONS_EN"),
    dictionary("plugins/native/goals/src/status-en.ts", "GOALS_STATUS_EN"), dictionary("plugins/native/goals/src/tree-en.ts", "GOALS_TREE_EN"),
    scanFile("apps/workbench/src/settings.ts", 'export const a = L("新一");\n'), scanFile("apps/workbench/src/functions/client.ts", 'export const b = L("新二");\n'),
    scanFile("apps/local-host/src/host.ts", 'export const c = L("新三");\n'), scanFile("plugins/native/goals/src/tree-ui.ts", 'export const d = L("新四");\n'),
  ]));
  const hint = Object.fromEntries(missingErrors(result).map((line: string) => [/no English for "(.+?)"/.exec(line)![1], /add its English to (.+)$/.exec(line)![1]]));
  assert.deepEqual(hint, {
    "新一": "apps/workbench/src/i18n/renderer-gap-en.ts", "新二": "apps/workbench/src/functions/en.ts",
    "新三": "apps/workbench/src/i18n/renderer-gap-en.ts", "新四": "plugins/native/goals/src/tree-en.ts",
  });
});

test("the command line lists missing keys, conflicts, dead keys and owners; a bad flag is an error", () => {
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  const all = run("--conflicts", "--owners", "--dead");
  assert.equal(all.status, 0, all.stdout + all.stderr);
  assert.match(all.stdout, /Translations: \d+ dictionaries/);
  assert.match(all.stdout, /"说明": \d+ English texts/);
  assert.match(all.stdout, /^owner\s+files\s+calls/m);
  assert.match(all.stdout, /^dead: /m);
  assert.equal(run("--bogus").status, 2);
});
