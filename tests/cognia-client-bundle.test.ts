import { scanTree, workingTreeSnapshot, isProductSource } from "../scripts/gates/translations.mjs";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { L, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { COGNIA_CLIENT_FACTORY_SCRIPT, COGNIA_EN, COGNIA_MESSAGES, renderCogniaWorkbench } from "@molis-ai/molis-work-plugin-cognia";

const SRC = "plugins/native/cognia/src";
const BROWSER = join(SRC, "browser");
const WIRE = join(BROWSER, "wire.ts");
const browserFiles = () => readdirSync(BROWSER).map(file => join(BROWSER, file));
const isPage = (file: string) => file === join(SRC, "ui.ts") || file.startsWith(BROWSER + "/");

test("RAC-144 every word the Cognia page says has a stable key with both languages, and none is a Chinese key", () => {
  const scan = scanTree(workingTreeSnapshot(process.cwd()), isProductSource);
  const calls = scan.calls.filter(call => isPage(call.file));
  assert.ok(calls.some(call => call.file === join(SRC, "ui.ts")), "the server-drawn page's translator calls are seen");
  assert.ok(calls.some(call => call.file.startsWith(BROWSER + "/")), "the browser code's translator calls are seen");
  assert.deepEqual(calls.filter(call => /\p{Script=Han}/u.test(call.key)), [], "the real scanner sees no Chinese translator key, including wrappers");
  // Keys are asked for by call, or named in a table the page looks them up in (the role and status words).
  const named = new Set<string>();
  for (const file of [join(SRC, "ui.ts"), ...browserFiles()]) for (const match of readFileSync(file, "utf8").matchAll(/"(cognia(?:\.[a-z0-9_-]+)+)"/gu)) named.add(match[1]);
  const used = new Set<string>([...calls.map(call => call.key), ...named]);
  assert.deepEqual([...used].filter(key => !(key in COGNIA_MESSAGES)), [], "every key the page asks for is defined");
  assert.deepEqual(Object.keys(COGNIA_MESSAGES).filter(key => !used.has(key)), [], "every defined key is asked for");
  const names = (value: string) => [...new Set([...value.matchAll(/\{([a-z]+)[|}]/gu)].map(match => match[1]))].sort();
  for (const [key, text] of Object.entries(COGNIA_MESSAGES)) {
    assert.ok(text.zh && text.en, `${key} has Chinese and English`);
    assert.deepEqual(names(text.zh), names(text.en), `${key} uses the same placeholders in both languages`);
  }
  for (const file of browserFiles().filter(file => file !== WIRE)) assert.doesNotMatch(readFileSync(file, "utf8"), /[一-鿿]/u, `${file} writes Chinese where a stable key belongs`);
  const html = renderCogniaWorkbench({ primitives: { escape: String, text: key => `«${key}»` } });
  assert.match(html, /placeholder="«cognia\.search\.placeholder»"/u, "the server-drawn page speaks through the translator");
  assert.doesNotMatch(html, /[一-鿿]/u, "no Chinese is drawn into the page directly");
  assert.deepEqual([...scan.missing.keys()], [], "moving words out of Cognia's dictionary cannot leave another owner's live call untranslated");
});

test("RAC-144 what stays in COGNIA_EN is raised by Cognia's Host side as Chinese text; the page's words and the dead ones are gone", () => {
  const scan = scanTree(workingTreeSnapshot(process.cwd()), isProductSource);
  const raisers = scan.files.filter(file => file.file.startsWith(SRC + "/") && !isPage(file.file) && !["en.ts", "messages.ts"].includes(file.file.slice(SRC.length + 1)) || file.file === WIRE);
  for (const key of Object.keys(COGNIA_EN)) {
    assert.ok(raisers.some(file => file.mentions.has(key)), `${key} must be raised by Cognia's Host side or be a wire reason`);
  }
  const moved = ["导入知识库", "添加材料", "新建领域", "审阅草稿", "检索问答", "正在读取资料…", "目录授权失败", "预览导入", "查看原文", "尚未配置文字模型，导入、搜索和阅读仍可使用。"];
  assert.deepEqual(moved.filter(key => key in COGNIA_EN), [], "page words are stable keys now, not entries of the dictionary the Host looks up by text");
  const dead = ["Cognia 请求失败", "请输入绝对目录路径", "符号链接未读取", "Prologue 返回空内容，请重试。", "或输入本机绝对目录路径", "请选择目录或填写本机路径"];
  assert.deepEqual(dead.filter(key => key in COGNIA_EN), [], "entries nothing asks for cannot return");
});

test("RAC-144 the Cognia words keep the English the page showed before they became keys", () => {
  // Migration reference: the served EN on origin/main aa4de404f, including the dictionaries that override COGNIA_EN. These differ from
  // COGNIA_EN's own values; copying that dictionary alone would have changed what people saw.
  const shown: Record<string, string> = {
    "cognia.status.update": "Update", "cognia.status.new": "Add", "cognia.status.skipped": "skipped", "cognia.role.log": "Logs",
    "cognia.reading.heading": "Materials", "cognia.manage.title": "Manage categories", "cognia.action.edit": "Edit",
    "cognia.notice.retry": "Retry reading", "cognia.action.add": "Add material", "cognia.domain.unfiled": "Unclassified",
    "cognia.dialog.processing": "Processing…",
  };
  runWithLocale("en", () => {
    for (const [key, expected] of Object.entries(shown)) assert.equal(L(key), expected, key);
    assert.equal(L("cognia.selection.count", { count: 2 }), "Selected 2 / 5");
    assert.equal(L("cognia.import.domain-line", { name: "Tools" }), "Domain: Tools");
  });
  runWithLocale("zh", () => assert.equal(L("cognia.selection.count", { count: 2 }), "已选 2 / 5"));
});

test("RAC-145 the Cognia page's client is typed browser code bundled by esbuild, and asks the Host only through the shared request helper", () => {
  for (const file of browserFiles()) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\bfetch\(/u, `${file} calls fetch directly`);
    assert.doesNotMatch(source, /:\s*any\b|as any\b|as unknown as|catch\s*(\([^)]*\))?\s*\{\s*\}/u, `${file} has an untyped escape or an empty catch`);
    assert.doesNotMatch(source, /window\.(?:confirm|alert|prompt)\(|(?<![.\w])(?:confirm|alert|prompt)\(/u, `${file} opens a browser dialog of its own`);
    assert.doesNotMatch(source, /io\.molis\.work\.cognia/u, `${file} writes the plugin's id instead of taking it from the host`);
  }
  assert.match(readFileSync(join(BROWSER, "request.ts"), "utf8"), /molisWorkRequest/);
  const manifest = readFileSync("plugins/native/cognia/package.json", "utf8");
  assert.match(manifest, /tsc -p tsconfig\.browser\.json/, "the build type-checks the browser code");
  assert.match(manifest, /esbuild src\/browser\/factory\.ts/, "the build bundles the browser code");
  assert.match(manifest, /"devDependencies": \{\s*"esbuild"/, "esbuild is the package's own dependency");
  assert.match(readFileSync("plugins/native/cognia/tsconfig.json", "utf8"), /"src\/browser\/\*\*"/, "the server build leaves the browser code to its own configuration");
  assert.doesNotThrow(() => new Function(`return ${COGNIA_CLIENT_FACTORY_SCRIPT}`), "the bundle is a function expression");
  assert.match(COGNIA_CLIENT_FACTORY_SCRIPT, /^\(host\) => \{/u);
  for (const mark of ["data-assistant-context", "molis-work:model-ready", "webkitdirectory", "cognia.import.nothing", "/import/preview", "/directory-grants"]) {
    assert.ok(COGNIA_CLIENT_FACTORY_SCRIPT.includes(mark), `the bundle carries ${mark}`);
  }
  assert.doesNotMatch(COGNIA_CLIENT_FACTORY_SCRIPT, /scope\.fetch|window\.confirm|window\.alert|window\.prompt|io\.molis\.work\.cognia/u);
});
