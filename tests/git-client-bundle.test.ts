import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isProductSource, scanTree, workingTreeSnapshot } from "../scripts/gates/translations.mjs";

import { GIT_CLIENT_FACTORY_SCRIPT, GIT_MESSAGES, GIT_SENTENCE_TABLE } from "@molis-ai/molis-work-plugin-git";

const SRC = "plugins/native/git/src";
const BROWSER = join(SRC, "browser");
const browserFiles = () => readdirSync(BROWSER).map(file => join(BROWSER, file));

test("RAC-167 every word the Git page says has a stable key with both languages", () => {
  const scan = scanTree(workingTreeSnapshot(process.cwd()), isProductSource);
  const owns = (file: string) => file.startsWith(SRC + "/");
  const calls = scan.calls.filter(call => owns(call.file));
  assert.ok(calls.some(call => call.file.startsWith(BROWSER + "/")), "the actual scanner sees browser words");
  assert.ok(calls.some(call => call.file === join(SRC, "ui.ts")), "the actual scanner sees server-drawn words");
  assert.deepEqual(calls.filter(call => /\p{Script=Han}/u.test(call.key)), [], "no Chinese key: every word the page says is a stable key");
  // (The Host's sentences are said from a table by `say.ts` and `ui.ts`, which hand the translator what the table finds: those few calls are dynamic by design.)
  assert.deepEqual(scan.dynamicCalls.filter(call => call.file.startsWith(BROWSER + "/")), [], "all dynamic stable-key choices in the browser code are enumerated by the real scanner");
  // The words that are not chosen from the table are data: a refusal or a sentence the Host or an action wrote. They reach the
  // translator in one place, `S` of the page, so a new site that forwards something else cannot hide among them.
  const forwarding = browserFiles().flatMap(file => readFileSync(file, "utf8").split("\n").map((text, index) => ({ file, line: index + 1, text })))
    .filter(({ text }) => /\bL\((?!["'`])|\bsayHostSentence\(/u.test(text));
  assert.deepEqual(forwarding.map(({ file, text }) => `${file}: ${text.trim()}`), [`${join(BROWSER, "page.ts")}: S: (sentence) => sayHostSentence(L, sentences, sentence),`], "one place hands the Host's sentences to the translator");
  const used = new Set<string>(calls.map(call => call.key));
  assert.deepEqual([...used].filter(key => !(key in GIT_MESSAGES)), [], "every key the page asks for is defined");
  const names = (value: string) => [...new Set([...value.matchAll(/\{([a-z]+)[|}]/gu)].map(match => match[1]))].sort();
  for (const [key, text] of Object.entries(GIT_MESSAGES)) {
    assert.ok(text.zh && text.en, `${key} has Chinese and English`);
    assert.deepEqual(names(text.zh), names(text.en), `${key} uses the same placeholders in both languages`);
  }
  // The Host's sentence templates are said by the page from the table it is handed, not asked for by key: the bundle carries none.
  assert.ok(GIT_SENTENCE_TABLE.length > 0);
  for (const [key] of GIT_SENTENCE_TABLE) assert.ok(key in GIT_MESSAGES, `${key} is defined`);
});

test("RAC-168 the Git page's client is typed browser code bundled by esbuild, asks only through the host's request and names no route", () => {
  for (const file of browserFiles()) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\bfetch\(/u, `${file} calls fetch directly`);
    assert.doesNotMatch(source, /:\s*any\b|as any\b|as unknown as|catch\s*(\([^)]*\))?\s*\{\s*\}/u, `${file} has an untyped escape or an empty catch`);
    assert.doesNotMatch(source, /window\.(confirm|alert|prompt)\(/u, `${file} opens a browser dialog`);
    assert.doesNotMatch(source, /\/api\/plugins\/|molisWorkRequest|io\.molis\.work\./u, `${file} writes a route prefix or asks the Host itself: Coding's bundle owns the request`);
    assert.doesNotMatch(source, /\.toLocaleString\(\)/u, `${file} shows a time in the browser's language, not the page's`);
  }
  assert.match(readFileSync(join(BROWSER, "page.ts"), "utf8"), /toLocaleString\(document\.documentElement\.lang/, "the times the page shows follow the page's language");
  const pkg = JSON.parse(readFileSync("plugins/native/git/package.json", "utf8")) as { scripts: Record<string, string>; devDependencies?: Record<string, string> };
  assert.match(pkg.scripts.build, /tsc -p tsconfig\.browser\.json/, "the build type-checks the browser code");
  assert.match(pkg.scripts.build, /esbuild src\/browser\/factory\.ts --bundle/, "and bundles it");
  assert.match(pkg.scripts.typecheck, /tsc -p tsconfig\.browser\.json/, "and so does the type check");
  const root = JSON.parse(readFileSync("package.json", "utf8")) as { devDependencies: Record<string, string> };
  assert.equal(pkg.devDependencies?.esbuild, root.devDependencies.esbuild, "esbuild is the package's own dev dependency, at the root's version");
  assert.doesNotThrow(() => new Function(`return ${GIT_CLIENT_FACTORY_SCRIPT}`), "the bundle is a function expression");
  assert.match(GIT_CLIENT_FACTORY_SCRIPT, /^\(host\) => \(\(host, sentences, git\) => \{/u, "it takes the host, is given the sentence table and hands back what it mounted");
  for (const mark of ["/view-revision", "/prepare-index", "/pr-support", "molis-commit-draft:", "data-git-conflict-resolve", "git.decision.settled", "<<<<<<<"]) {
    assert.ok(GIT_CLIENT_FACTORY_SCRIPT.includes(mark), `the bundle carries ${mark}`);
  }
  assert.ok(GIT_CLIENT_FACTORY_SCRIPT.includes(JSON.stringify(GIT_SENTENCE_TABLE)), "the table of the Host's sentence templates comes with it");
  assert.doesNotMatch(GIT_CLIENT_FACTORY_SCRIPT, /git\.outcome\.succeeded.*"zh"|"en":/u, "the bundle carries no dictionary");
  // Hand it a root without Git's elements: it mounts nothing and hands back nothing.
  const factory = new Function(`return ${GIT_CLIENT_FACTORY_SCRIPT}`)() as (host: unknown) => unknown;
  assert.equal(factory({ root: { querySelector: () => null }, translate: (key: string) => key }), null);
});
