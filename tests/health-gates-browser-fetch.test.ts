import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

// W3-10-5-01: exercise the production CLI against real Git histories; the expected behavior comes from the spec.
const script = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));
let repo: string;
const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text); };
const read = (file: string) => readFileSync(path.join(repo, file), "utf8");
const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", message); };
const gate = (...args: string[]) => {
  const result = spawnSync(process.execPath, [script, "--root", repo, ...args], { encoding: "utf8" });
  return { code: result.status, out: result.stdout + result.stderr };
};
const reset = () => { git("checkout", "-q", "-f", "main");
  assert.equal(gate("--update").code, 0); git("clean", "-fdq"); git("checkout", "-q", "-B", "candidate"); };

before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-browser-fetch-gate-"));
  git("init", "-q", "-b", "main"); git("config", "user.name", "Gate test"); git("config", "user.email", "gate@example.invalid");
  put("tooling/gates/limits.json", JSON.stringify({ file: 800, classLines: 300, classMethods: 25, functionLines: 150, vendoredPrologueSdk: 2 }));
  put("specs/demo/spec.md", "# Demo\n\n状态：进行中\n");
  put("plugins/native/alpha/src/client.ts", "export const CLIENT_SCRIPT = `fetch('/old');`;\n");
  put("apps/workbench/src/client.ts", "export const CLIENT_SCRIPT = `document.title = 'Molis Work';`;\n");
  // A browser program already kept as text, so the clean-shapes case below edits a program rather than adding one (W4-04 counts new ones).
  put("plugins/native/alpha/src/clean.ts", "export const CLIENT_SCRIPT = `void 0;`;\n");
  put("packages/ui-host/src/request-client.ts", "export const UI_REQUEST_CLIENT_SCRIPT = `const call = createUiRequest({fetch: (input, init) => fetch(input, init)});`;\n");
  put("packages/ui-host/src/client-lifecycle.ts", "export const UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT = `() => {const scope = {async fetch(input, init = {}) {const signal = init.signal; const response = await fetch(input, {...init, signal}); return response;}};return scope;}`;\n");
  git("add", "-A"); assert.equal(gate("--update").code, 0); commit("base");
});
after(() => { if (repo) rmSync(repo, { recursive: true, force: true }); });

const violations: Array<{ name: string; file: string; code: string }> = [
  { name: "bare", file: "plugins/native/alpha/src/new.ts", code: "fetch('/x');" },
  { name: "member", file: "plugins/native/alpha/src/new.ts", code: "window.fetch('/x');" },
  { name: "computed constant", file: "plugins/native/alpha/src/new.ts", code: "const key = 'fet' + 'ch'; globalThis[key]('/x');" },
  { name: "local alias", file: "plugins/native/alpha/src/new.ts", code: "const f = window['fetch']; const send = f; send('/x');" },
  { name: "destructured alias", file: "plugins/native/alpha/src/new.ts", code: "const {fetch: send} = globalThis; send('/x');" },
  { name: "bound alias", file: "plugins/native/alpha/src/new.ts", code: "const send = window.fetch.bind(window); send('/x');" },
  { name: "assigned alias", file: "plugins/native/alpha/src/new.ts", code: "let send; send = globalThis.fetch; send('/x');" },
  { name: "call adapter", file: "plugins/native/alpha/src/new.ts", code: "window.fetch.call(window, '/x');" },
];
for (const scenario of violations) test(`W3-10-5-01: a new ${scenario.name} fetch is refused and update leaves the baseline untouched`, () => {
  reset(); put(scenario.file, `export const CLIENT_SCRIPT = ${JSON.stringify(scenario.code)};\n`); commit(scenario.name);
  const before = read(".git/molis-health-baseline.json"), result = gate("--base", "main");
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /raw fetch calls in a browser program.*0 → 1/);
  assert.equal(gate("--update", "--base", "main").code, 1);
  assert.equal(read(".git/molis-health-baseline.json"), before);
});

test("W3-10-5-01: rewriting the baseline cannot hide growth in an old plugin file", () => {
  reset(); put("plugins/native/alpha/src/client.ts", "export const CLIENT_SCRIPT = `fetch('/old'); fetch('/new');`;\n"); commit("growth");
  assert.equal(gate("--update").code, 0); commit("rewritten baseline");
  assert.equal(gate().code, 0);
  const result = gate("--base", "main"); assert.equal(result.code, 1, result.out);
  assert.match(result.out, /raw fetch calls in a browser program.*1 → 2/);
});

test("W3-10-5-01: Workbench is zero even when base and baseline contain the same call", () => {
  reset(); put("apps/workbench/src/client.ts", "export const CLIENT_SCRIPT = `fetch('/x');`;\n"); commit("bad base");
  const before = read(".git/molis-health-baseline.json");
  for (const args of [["--base", "HEAD"], ["--update"], ["--update", "--base", "HEAD"]]) {
    const result = gate(...args); assert.equal(result.code, 1, result.out); assert.match(result.out, /Workbench raw fetch must be zero/);
  }
  assert.equal(read(".git/molis-health-baseline.json"), before);
});

test("W3-10-5-01: a call assembled across files is attributed to its original fragment", () => {
  reset();
  put("plugins/native/alpha/src/open.ts", "export const OPEN_SCRIPT = `(() => { const key = 'fetch';`;\n");
  put("plugins/native/alpha/src/close.ts", "export const CLOSE_SCRIPT = `globalThis[key]('/x'); })();`;\n");
  put("plugins/native/alpha/src/joined.ts", "import {OPEN_SCRIPT} from './open.js'; import {CLOSE_SCRIPT} from './close.js'; export const CLIENT_SCRIPT = [OPEN_SCRIPT, CLOSE_SCRIPT].join('');\n");
  commit("fragments"); const result = gate("--base", "main"); assert.equal(result.code, 1, result.out);
  assert.match(result.out, /raw fetch calls in a browser program in plugins\/native\/alpha\/src\/close\.ts 0 → 1/);
  assert.doesNotMatch(result.out, /browser program parse failed/);
});

test("W3-10-5-01: toString reads a function AST without executing its server module", () => {
  reset();
  put("plugins/native/alpha/src/fn.ts", "throw new Error('must never run'); export function client() {return fetch('/x');}\n");
  put("plugins/native/alpha/src/serialized.ts", "import {client} from './fn.js'; export const CLIENT_SCRIPT = `(${client.toString()})();`;\n");
  commit("serialize"); const result = gate("--base", "main"); assert.equal(result.code, 1, result.out);
  assert.match(result.out, /raw fetch calls in a browser program in plugins\/native\/alpha\/src\/fn\.ts 0 → 1/);
  assert.doesNotMatch(result.out, /must never run/);
});

test("W3-10-5-01: inline HTML only counts executing scripts", () => {
  reset();
  put("plugins/native/alpha/src/page.ts", "export const html = `<p>fetch('/text')</p><script type=\"application/json\">{\"text\":\"fetch('/data')\"}</script><script>window['fetch']('/run');</script>`;\n");
  commit("html"); const result = gate("--base", "main"); assert.equal(result.code, 1, result.out);
  assert.match(result.out, /raw fetch calls in a browser program in plugins\/native\/alpha\/src\/page\.ts 0 → 1/);
});

test("W3-10-5-01: comments, ordinary strings, server fetch and a locally shadowed fetch do not count", () => {
  reset();
  put("plugins/native/alpha/src/clean.ts", [
    "export const text = 'fetch(\"/text\")';",
    "export async function server() {return fetch('/server');}",
    "export const CLIENT_SCRIPT = `// fetch('/comment')\nconst label = \"window.fetch('/label')\"; function fetch() {return Promise.resolve();} fetch();`;",
    "",
  ].join("\n"));
  commit("clean"); const result = gate("--base", "main"); assert.equal(result.code, 0, result.out);
});

test("W3-10-5-01: only the original transport site is exempt, including in its own file", () => {
  reset();
  put("packages/ui-host/src/request-client.ts", read("packages/ui-host/src/request-client.ts") + "export const OTHER_CLIENT_SCRIPT = `fetch('/new');`;\n");
  commit("neighbor"); const result = gate("--base", "main"); assert.equal(result.code, 1, result.out);
  assert.match(result.out, /raw fetch calls in a browser program in packages\/ui-host\/src\/request-client\.ts 0 → 1/);
});

test("W3-10-5-01: typed browser dependencies follow actual package subpaths", () => {
  reset();
  put("apps/workbench/package.json", JSON.stringify({name:"@test/workbench",exports:{"./terminal":{import:"./dist/terminal/index.js"}}}));
  put("apps/workbench/src/terminal/client.ts", "export const start = () => window.fetch('/terminal');\n");
  put("apps/workbench/src/terminal/index.ts", "export {start} from './client.js';\n");
  put("apps/workbench/src/terminal-client.ts", "import {start} from '@test/workbench/terminal'; start();\n");
  commit("typed entry"); const result = gate("--base", "main"); assert.equal(result.code, 1, result.out);
  assert.match(result.out, /Workbench raw fetch must be zero: apps\/workbench\/src\/terminal\/client\.ts has 1/);
});

test("W3-10-5-01: an unexpandable or unparsable recognized program refuses update", () => {
  for (const code of ["makeProgram()", "`if ( {`"]) {
    reset(); put("plugins/native/alpha/src/broken.ts", `export const CLIENT_SCRIPT = ${code};\n`); commit("broken");
    const before = read(".git/molis-health-baseline.json"), result = gate("--update", "--base", "main");
    assert.equal(result.code, 1, result.out); assert.match(result.out, /rawFetchInScripts:.*(?:cannot statically expand|parse failed)/);
    assert.equal(read(".git/molis-health-baseline.json"), before);
  }
});

for (const [name, source] of [
  ["String", "export const CLIENT_SCRIPT = String(\"fetch('/x');\");"],
  ["replacement", "export const CLIENT_SCRIPT = \"noop('/x');\".replace('noop', 'fetch');"],
  ["conditional return", "function script(){if(true)return \"fetch('/x');\";return \"void 0;\";} export const CLIENT_SCRIPT=script();"],
  ["formatter body", "function script(source){return \"noop('/x');\".replace('noop','fetch');} export const CLIENT_SCRIPT=script('void 0;');"],
]) test(`W3-10-5-01: the ${name} program transformation cannot silently count zero`, () => {
  reset(); put("plugins/native/alpha/src/transform.ts", source + "\n"); commit(name);
  const before = read(".git/molis-health-baseline.json"), result = gate("--base", "main");
  assert.equal(result.code, 1, result.out); assert.match(result.out, /raw fetch calls in a browser program.*0 → 1/);
  assert.equal(gate("--update", "--base", "main").code, 1); assert.equal(read(".git/molis-health-baseline.json"), before);
});

for (const edge of ["import './effect.js';", "export {start} from './effect.js';", "export * from './effect.js';"]) {
  test(`W3-10-5-01: typed browser closure includes the runtime edge ${edge}`, () => {
    reset(); put("apps/workbench/src/terminal-client.ts", edge + "\n");
    put("apps/workbench/src/effect.ts", "export const start = () => fetch('/runtime');\n"); commit("runtime edge");
    const result = gate("--base", "main"); assert.equal(result.code, 1, result.out);
    assert.match(result.out, /raw fetch calls in a browser program in apps\/workbench\/src\/effect\.ts 0 → 1/);
  });
}

test("W3-10-5-01: type-only browser edges do not execute server fetch", () => {
  reset();
  put("apps/workbench/src/terminal-client.ts", [
    "import type {Ref} from './effect.js';",
    "import {type Ref as Local} from './effect.js';",
    "export type {Ref} from './effect.js';",
    "export {type Ref as Other} from './effect.js';",
    "",
  ].join("\n"));
  put("apps/workbench/src/effect.ts", [
    "export type Ref = string;",
    "export const server = () => fetch('/server');",
    "",
  ].join("\n"));
  commit("type-only edges");
  const result = gate("--base", "main"); assert.equal(result.code, 0, result.out);
});

test("W3-10-5-01: a data formatter used as a whole executable program is refused", () => {
  reset(); put("plugins/native/alpha/src/data.ts", "export const CLIENT_SCRIPT = L(\"fetch('/x');\");\n"); commit("data formatter");
  const before = read(".git/molis-health-baseline.json"), result = gate("--update", "--base", "main");
  assert.equal(result.code, 1, result.out); assert.match(result.out, /data formatter cannot be treated as executable program text/);
  assert.equal(read(".git/molis-health-baseline.json"), before);
});

test("W3-10-5-01: a shared formatter keeps each input owner and cannot deduplicate a new fragment", () => {
  reset();
  put("plugins/native/alpha/src/a.ts", "export const A_SCRIPT = `fetch('/a');`;\n");
  put("plugins/native/alpha/src/format.ts", "export function format(source){return source.replace('noop','noop');}\n");
  put("plugins/native/alpha/src/joined.ts", "import {A_SCRIPT} from './a.js';import {format} from './format.js';export const CLIENT_SCRIPT = format(A_SCRIPT);\n");
  assert.equal(gate("--update").code, 0); commit("formatter base"); git("branch", "-f", "format-base", "HEAD");
  put("plugins/native/alpha/src/b.ts", "export const B_SCRIPT = `fetch('/b');`;\n");
  put("plugins/native/alpha/src/joined.ts", "import {A_SCRIPT} from './a.js';import {B_SCRIPT} from './b.js';import {format} from './format.js';export const CLIENT_SCRIPT = [format(A_SCRIPT),format(B_SCRIPT)].join(';');\n");
  commit("second input"); const before = read(".git/molis-health-baseline.json"), result = gate("--base", "format-base");
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /raw fetch calls in a browser program in plugins\/native\/alpha\/src\/b\.ts 0 → 1/);
  assert.equal(gate("--update", "--base", "format-base").code, 1); assert.equal(read(".git/molis-health-baseline.json"), before);
});

test("W3-10-5-01: a serialized literal computed property still identifies fetch", () => {
  reset(); put("plugins/native/alpha/src/property.ts", "const KEY = 'fetch'; export const CLIENT_SCRIPT = `globalThis[${JSON.stringify(KEY)}]('/x');`;\n"); commit("serialized property");
  const result = gate("--base", "main"); assert.equal(result.code, 1, result.out);
  assert.match(result.out, /raw fetch calls in a browser program.*0 → 1/);
});


test("BROWSER-FORMAT-01/02: the current line compactor expands joined fragments and preserves the new fetch owner", () => {
  reset();
  put("plugins/native/alpha/src/format.ts", 'export const compactScript = source => source.split("\\n").map(line => line.trimStart()).filter(line => line && !line.startsWith("//")).join("\\n");\n');
  put("plugins/native/alpha/src/open.ts", "export const OPEN_SCRIPT = `(() => {\n  const text = 'a  b';\n`;\n");
  put("plugins/native/alpha/src/close.ts", "export const CLOSE_SCRIPT = `  void text;\n})();`;\n");
  put("plugins/native/alpha/src/joined.ts", "import {compactScript} from './format.js';import {OPEN_SCRIPT} from './open.js';import {CLOSE_SCRIPT} from './close.js';export const CLIENT_SCRIPT = compactScript([OPEN_SCRIPT,CLOSE_SCRIPT].join(''));\n");
  assert.equal(gate("--update").code, 0); commit("compacted base"); git("branch", "-f", "compact-base", "HEAD");
  put("plugins/native/alpha/src/close.ts", "export const CLOSE_SCRIPT = `  fetch('/new');\n})();`;\n"); commit("new raw fetch");
  const before = read(".git/molis-health-baseline.json"), result = gate("--update", "--base", "compact-base");
  assert.equal(result.code, 1, result.out); assert.match(result.out, /raw fetch calls.*close\.ts 0 → 1/);
  assert.doesNotMatch(result.out, /browser program parse failed/); assert.equal(read(".git/molis-health-baseline.json"), before);
});

test("BROWSER-FORMAT-02: whitespace inside the compactor's string argument is syntax data and cannot identify another formatter", () => {
  reset();
  put("plugins/native/alpha/src/new.ts", String.raw`const compact = source => source.split("\n").map(line => line.trimStart()).filter(line => line && !line.startsWith("/ /" )).join("\n");export const CLIENT_SCRIPT = compact("fetch(\'/x\');");`);
  commit("different filter"); const result = gate("--base", "main");
  assert.equal(result.code, 1, result.out); assert.match(result.out, /cannot statically expand browser program/);
});


test("BROWSER-FORMAT-01/02: mapped string and function parts serialize their actual syntax without running the module", () => {
  reset();
  put("plugins/native/alpha/src/functions.ts", "throw new Error('must never execute');export function draw(){fetch('/new');}\n");
  put("plugins/native/alpha/src/mapped.ts", String.raw`import {draw} from './functions.js';export const CLIENT_SCRIPT = ['const GAP=8;',draw].map(part=>typeof part==='string'?part:part.toString().replace(/^[ \t]+/gm,'')).join('\n');`);
  commit("mapped function"); const result = gate("--base", "main");
  assert.equal(result.code, 1, result.out); assert.match(result.out, /raw fetch calls.*functions\.ts 0 → 1/);
  assert.doesNotMatch(result.out, /cannot statically expand|must never execute/);
});

test("BROWSER-FORMAT-02: mapped array elements share the actual joined program scope", () => {
  reset();
  put("plugins/native/alpha/src/mapped.ts", String.raw`export const CLIENT_SCRIPT = ['const key="fetch";', 'globalThis[key]("/x");'].map(part=>part).join('\n');`);
  commit("mapped cross-element alias"); const result = gate("--base", "main");
  assert.equal(result.code, 1, result.out); assert.match(result.out, /raw fetch calls.*mapped\.ts 0 → 1/);
  assert.doesNotMatch(result.out, /cannot statically expand/);
});

test("BROWSER-FORMAT-02: a numeric mapped value takes the non-string branch", () => {
  reset();
  put("plugins/native/alpha/src/mapped.ts", String.raw`export const CLIENT_SCRIPT = [1].map(part=>typeof part==='string'?'void 0':"fetch('/x');").join('\n');`);
  commit("mapped numeric conditional"); const result = gate("--base", "main");
  assert.equal(result.code, 1, result.out); assert.match(result.out, /raw fetch calls.*mapped\.ts 0 → 1/);
  assert.doesNotMatch(result.out, /cannot statically expand/);
});

for (const source of [
  String.raw`['a','b'].map(()=>'void 0').join(';fetch("/x");')`,
  String.raw`['a','b'].flatMap(()=>'void 0').join(';fetch("/x");')`,
  String.raw`['void 0','void 0'].join(flag ? ';' : ';fetch("/x");')`,
  String.raw`['a','b'].map(part=>'void 0').join(flag ? ';' : ';fetch("/x");')`,
]) test(`BROWSER-FORMAT-02: every actual join separator branch is scanned: ${source}`, () => {
  reset(); put("plugins/native/alpha/src/mapped.ts", `export const CLIENT_SCRIPT = ${source};`);
  commit("joined separator call"); const result = gate("--base", "main");
  assert.equal(result.code, 1, result.out); assert.match(result.out, /raw fetch calls.*mapped\.ts 0 → 1/);
  assert.doesNotMatch(result.out, /cannot statically expand/);
});

test("BROWSER-FORMAT-02: a reassigned local type cannot prune a browser program branch", () => {
  reset(); put("plugins/native/alpha/src/mapped.ts", String.raw`let part='a';part=1;export const CLIENT_SCRIPT=typeof part==='string'?'void 0;':'fetch("/x");';`);
  commit("reassigned conditional input"); const result = gate("--base", "main");
  assert.equal(result.code, 1, result.out); assert.match(result.out, /raw fetch calls.*mapped\.ts 0 → 1/);
  assert.doesNotMatch(result.out, /cannot statically expand/);
});

for (const source of [
  String.raw`function format(part){part=1;return typeof part==='string'?'void 0;':'fetch("/x");';} export const CLIENT_SCRIPT=format('a');`,
  String.raw`function part(){};part='a';export const CLIENT_SCRIPT=typeof part==='string'?'fetch("/x");':'void 0;';`,
  String.raw`function format(part){[...part]=[1];return typeof part==='string'?'void 0;':'fetch("/x");';} export const CLIENT_SCRIPT=format('a');`,
  String.raw`function format(part){({...part}={value:1});return typeof part==='string'?'void 0;':'fetch("/x");';} export const CLIENT_SCRIPT=format('a');`,
]) test("BROWSER-FORMAT-02: reassigned parameters and function declarations cannot prune a program branch", () => {
  reset(); put("plugins/native/alpha/src/mapped.ts", source);
  commit("reassigned declared input"); const result = gate("--base", "main");
  assert.equal(result.code, 1, result.out); assert.match(result.out, /raw fetch calls.*mapped\.ts 0 → 1/);
  assert.doesNotMatch(result.out, /cannot statically expand/);
});

// W4-04: a program the package bundles from TypeScript is read as typed source: the constant reads `dist/<name>.js`, and the
// package's build script makes it with esbuild from an entry. A raw fetch anywhere the entry imports counts; a read that no build
// step produces cannot be expanded and fails.
const bundled = (build: string) => {
  put("plugins/native/beta/package.json", JSON.stringify({ name: "@test/beta", scripts: { build } }));
  put("plugins/native/beta/src/browser/entry.ts", "import {send} from './send.js'; send();\n");
  put("plugins/native/beta/src/browser/send.ts", "export const send = () => window.fetch('/bundled');\n");
  put("plugins/native/beta/src/client.ts", "import {readFileSync} from 'node:fs'; export const BETA_CLIENT_FACTORY_SCRIPT = readFileSync(new URL('./beta-client.js', import.meta.url), 'utf8').trim();\n");
  put("apps/workbench/src/client.ts", "import {BETA_CLIENT_FACTORY_SCRIPT} from '../../../plugins/native/beta/src/client.js';\nexport const CLIENT_SCRIPT = `const factory = ${BETA_CLIENT_FACTORY_SCRIPT}; document.title = 'Molis Work';`;\n");
};
test("W4-04: a raw fetch in the TypeScript a bundle is built from counts in its own file", () => {
  reset(); bundled("tsc -p tsconfig.json && esbuild src/browser/entry.ts --bundle --format=iife '--banner:js=(host) => {' --footer:js=} --outfile=dist/beta-client.js"); commit("bundled");
  const result = gate("--base", "main"); assert.equal(result.code, 1, result.out);
  assert.match(result.out, /raw fetch calls in a browser program in plugins\/native\/beta\/src\/browser\/send\.ts 0 → 1/);
  assert.doesNotMatch(result.out, /cannot statically expand/);
});
test("W4-04: reading a bundle that no build step makes cannot be expanded", () => {
  reset(); bundled("tsc -p tsconfig.json && esbuild src/browser/entry.ts --bundle --outfile=dist/other-client.js"); commit("unbuilt bundle");
  const result = gate("--base", "main"); assert.equal(result.code, 1, result.out);
  assert.match(result.out, /plugins\/native\/beta\/src\/client\.ts:1:\d+: cannot statically expand browser program \(unsupported call readFileSync/);
});
test("102-1: a raw fetch in a bundle built by tooling/build-*.mjs still counts in its source file", () => {
  reset();
  bundled("tsc -p tsconfig.json && node tooling/build-client.mjs");
  put("plugins/native/beta/tooling/build-client.mjs", [
    'import { build } from "esbuild";',
    'const DEFAULT_BROWSER = { bundle: true, format: "iife", platform: "browser" };',
    'const BUNDLES = [{ ...DEFAULT_BROWSER, entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" }];',
    'await Promise.all([',
    '  Promise.all(BUNDLES.map((o) => build(o))),',
    '  build({ ...DEFAULT_BROWSER, entryPoints: [new URL("../src/browser/entry.ts", import.meta.url).pathname], write: false }),',
    ']);',
    "",
  ].join("\n"));
  commit("script-built bundle");
  const result = gate("--base", "main"); assert.equal(result.code, 1, result.out);
  assert.match(result.out, /raw fetch calls in a browser program in plugins\/native\/beta\/src\/browser\/send\.ts 0 → 1/);
  assert.doesNotMatch(result.out, /cannot statically expand/);
});
test("102-1: reading a bundle omitted from tooling/build-*.mjs cannot be expanded", () => {
  reset();
  bundled("tsc -p tsconfig.json && node tooling/build-client.mjs");
  put("plugins/native/beta/tooling/build-client.mjs", [
    'import { build } from "esbuild";',
    'const BUNDLES = [{ entryPoints: ["src/browser/entry.ts"], outfile: "dist/other-client.js" }];',
    'await Promise.all(BUNDLES.map((o) => build(o)));',
    "",
  ].join("\n"));
  commit("script-unbuilt bundle");
  const result = gate("--base", "main"); assert.equal(result.code, 1, result.out);
  assert.match(result.out, /plugins\/native\/beta\/src\/client\.ts:1:\d+: cannot statically expand browser program \(unsupported call readFileSync/);
});

// 102-1 P2-4: static tooling/build-*.mjs resolution must accept only real imported esbuild build/buildSync calls
// with unambiguous immutable static options, and fail closed on bait literals, shadowing, mutations, or escaped esbuild refs.
for (const [label, script] of [
  [
    "unreferenced bait literal",
    'export const BUNDLES = [{ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" }];\n',
  ],
  [
    "shadowed local fake build()",
    [
      'function build(_opts) {}',
      'build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
      "",
    ].join("\n"),
  ],
  [
    "bait static build plus dynamic build(opts)",
    [
      'import { build } from "esbuild";',
      'const dynamicOpts = { entryPoints: [process.env.ENTRY || "src/browser/entry.ts"], outfile: "dist/beta-client.js" };',
      'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
      'await build(dynamicOpts);',
      "",
    ].join("\n"),
  ],
  [
    "conflicting outfiles across normalized paths",
    [
      'import { build } from "esbuild";',
      'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "./dist/beta-client.js" });',
      'await build({ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" });',
      "",
    ].join("\n"),
  ],
  [
    "trailing opaque spread overriding static option",
    [
      'import { build } from "esbuild";',
      'const extra = globalThis.extraOpts ?? {};',
      'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js", ...extra });',
      "",
    ].join("\n"),
  ],
  [
    "mutated top-level const array via push",
    [
      'import { build } from "esbuild";',
      'const BUNDLES = [{ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" }];',
      'BUNDLES.push({ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" });',
      'await Promise.all(BUNDLES.map((o) => build(o)));',
      "",
    ].join("\n"),
  ],
  [
    "aliased top-level const array mutated via alias",
    [
      'import { build } from "esbuild";',
      'const BUNDLES = [{ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" }];',
      'const alias = BUNDLES;',
      'alias.push({ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" });',
      'await Promise.all(BUNDLES.map((o) => build(o)));',
      "",
    ].join("\n"),
  ],
  [
    "top-level const passed into unknown mutating helper",
    [
      'import { build } from "esbuild";',
      'function tweak(arr) { arr[0].entryPoints = ["src/browser/entry.ts"]; }',
      'const BUNDLES = [{ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" }];',
      'tweak(BUNDLES);',
      'await Promise.all(BUNDLES.map((o) => build(o)));',
      "",
    ].join("\n"),
  ],
  [
    "callback mutates iterated option before calling build(o)",
    [
      'import { build } from "esbuild";',
      'const BUNDLES = [{ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" }];',
      'await Promise.all(BUNDLES.map((o) => { o.entryPoints = ["src/browser/entry.ts"]; return build(o); }));',
      "",
    ].join("\n"),
  ],
  [
    "callback shallow-copies and escapes option before calling build(o)",
    [
      'import { build } from "esbuild";',
      'const BUNDLES = [{ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" }];',
      'await Promise.all(BUNDLES.map((o) => { const c = { ...o }; c.entryPoints[0] = "src/browser/entry.ts"; return build(o); }));',
      "",
    ].join("\n"),
  ],
  [
    "for-let loop variable reassigned before build(o)",
    [
      'import { build } from "esbuild";',
      'const BUNDLES = [{ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" }];',
      'for (let o of BUNDLES) { o = { entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" }; await build(o); }',
      "",
    ].join("\n"),
  ],
  [
    "escaped esbuild function alias",
    [
      'import { build } from "esbuild";',
      'const run = build;',
      'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
      'await run({ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" });',
      "",
    ].join("\n"),
  ],
  [
    "esbuild bracket access escape",
    [
      'import * as esbuild from "esbuild";',
      'await esbuild.build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
      'await esbuild["build"]({ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" });',
      "",
    ].join("\n"),
  ],
  [
    "esbuild.context opaque call",
    [
      'import * as esbuild from "esbuild";',
      'await esbuild.build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
      'const ctx = await esbuild.context({ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" });',
      'await ctx.rebuild();',
      "",
    ].join("\n"),
  ],
  [
    "outdir build option fails closed even with write: false",
    [
      'import { build } from "esbuild";',
      'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
      'await build({ entryPoints: ["src/browser/entry.ts"], outdir: "dist", write: false });',
      "",
    ].join("\n"),
  ],
  [
    "dynamic import of esbuild fails closed",
    [
      'import { build } from "esbuild";',
      'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
      'const eb = await import("esbuild");',
      'await eb.build({ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" });',
      "",
    ].join("\n"),
  ],
  [
    "node:module createRequire import fails closed",
    [
      'import { createRequire } from "node:module";',
      'import { build } from "esbuild";',
      'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
      'createRequire(import.meta.url)("esbuild").buildSync({ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" });',
      "",
    ].join("\n"),
  ],
  [
    "catch parameter cannot shadow build in enclosing block (P0-2)",
    [
      'import { build } from "esbuild";',
      'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
      '{',
      '  await build({ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" });',
      '  try {} catch (build) {}',
      '}',
      "",
    ].join("\n"),
  ],
  [
    "switch CaseBlock declaration cannot shadow build in enclosing block (P0-2)",
    [
      'import { build } from "esbuild";',
      'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
      '{',
      '  await build({ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" });',
      '  switch (0) { case 1: let build = 1; }',
      '}',
      "",
    ].join("\n"),
  ],
  [
    "setter and constructor params cannot shadow build in enclosing block (P0-2)",
    [
      'import { build } from "esbuild";',
      'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
      '{',
      '  await build({ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" });',
      '  const o = { set x(build) {} };',
      '  class C { constructor(build) {} }',
      '  void o; void C;',
      '}',
      "",
    ].join("\n"),
  ],
  [
    "mutating forEach without build invalidates top-level const BUNDLES (P0-3)",
    [
      'import { build } from "esbuild";',
      'const BUNDLES = [{ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" }];',
      'BUNDLES.forEach((o) => { o.entryPoints = ["src/browser/entry.ts"]; });',
      'await Promise.all(BUNDLES.map((o) => build(o)));',
      "",
    ].join("\n"),
  ],
  [
    "mutating for-of without build invalidates top-level const BUNDLES (P0-3)",
    [
      'import { build } from "esbuild";',
      'const BUNDLES = [{ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" }];',
      'for (const o of BUNDLES) o.entryPoints = ["src/browser/entry.ts"];',
      'await Promise.all(BUNDLES.map((o) => build(o)));',
      "",
    ].join("\n"),
  ],
  [
    "non-arrow function callback using arguments[0] fails closed (P0-4)",
    [
      'import { build } from "esbuild";',
      'const BUNDLES = [{ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" }];',
      'await Promise.all(BUNDLES.map(function (o) { arguments[0].entryPoints = ["src/browser/entry.ts"]; return build(o); }));',
      "",
    ].join("\n"),
  ],
  [
    "getter on unchecked option property fails closed (P0-5)",
    [
      'import { build } from "esbuild";',
      'const BUNDLES = [{',
      '  get bundle() { this.entryPoints = ["src/browser/entry.ts"]; return true; },',
      '  entryPoints: ["src/browser/clean.ts"],',
      '  outfile: "dist/beta-client.js",',
      '}];',
      'for (const opt of BUNDLES) { await build({ ...opt }); }',
      "",
    ].join("\n"),
  ],
  [
    "esbuild inject option fails closed (P0-5)",
    [
      'import { build } from "esbuild";',
      'await build({ entryPoints: ["src/browser/clean.ts"], inject: ["src/browser/send.ts"], outfile: "dist/beta-client.js", bundle: true });',
      "",
    ].join("\n"),
  ],
  [
    "esbuild plugins option fails closed (P0-5)",
    [
      'import { build } from "esbuild";',
      'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js", plugins: [] });',
      "",
    ].join("\n"),
  ],
  [
    "esbuild alias option fails closed (P0-5)",
    [
      'import { build } from "esbuild";',
      'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js", alias: { "./a": "./send.ts" } });',
      "",
    ].join("\n"),
  ],
  [
    "named default import from esbuild is tracked (P0-6)",
    [
      'import { build, default as eb } from "esbuild";',
      'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
      'await eb.build({ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" });',
      "",
    ].join("\n"),
  ],
  [
    'named "module.exports" import from esbuild is tracked (P0-6)',
    [
      'import { build, "module.exports" as eb } from "esbuild";',
      'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
      'await eb.build({ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" });',
      "",
    ].join("\n"),
  ],
  [
    "re-export from esbuild fails closed (P0-6)",
    [
      'import { build as b } from "esbuild";',
      'export { build as run } from "esbuild";',
      'import { run } from "./build-client.mjs";',
      'await b({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
      'await run({ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" });',
      "",
    ].join("\n"),
  ],
  [
    "process.getBuiltinModule fails closed (P0-6)",
    [
      'import { build } from "esbuild";',
      'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
      'const { createRequire } = process.getBuiltinModule("module");',
      'createRequire(import.meta.url)("esbuild").buildSync({ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" });',
      "",
    ].join("\n"),
  ],
  [
    "subpath esbuild import fails closed (P0-6)",
    [
      'import { build } from "esbuild";',
      'import eb from "../../../node_modules/esbuild/lib/main.js";',
      'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
      'await eb.build({ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" });',
      "",
    ].join("\n"),
  ],
  [
    "empty array iteration calling build fails closed (P1-1)",
    [
      'import { build } from "esbuild";',
      'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
      'const EMPTY = [];',
      'EMPTY.map((o) => build(o));',
      "",
    ].join("\n"),
  ],
  [
    "syntax error in build script fails closed (P1-3)",
    [
      'import { build } from "esbuild";',
      'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
      'function broken( {',
      "",
    ].join("\n"),
  ],
  [
    "function body var cannot shadow build in formal parameter default (P0-2b)",
    [
      'import { build } from "esbuild";',
      'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
      'function run(x = build({ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" })) {',
      '  var build = 1;',
      '  return x;',
      '}',
      'await run();',
      "",
    ].join("\n"),
  ],
  [
    "data: URL dynamic import fails closed (P1-1b)",
    [
      'import { build } from "esbuild";',
      'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
      'const { createRequire } = await import("data:text/javascript,export { createRequire } from \'node:module\';");',
      'createRequire(import.meta.url)("esbuild").buildSync({ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" });',
      "",
    ].join("\n"),
  ],
  [
    "data: URL static import fails closed (P1-1b)",
    [
      'import { build } from "esbuild";',
      'import { createRequire } from "data:text/javascript,export { createRequire } from \'node:module\';";',
      'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
      'createRequire(import.meta.url)("esbuild").buildSync({ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" });',
      "",
    ].join("\n"),
  ],
  [
    "string-key and shorthand destructuring of process.getBuiltinModule fails closed (P1-2b)",
    [
      'import { build } from "esbuild";',
      'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
      'const { "getBuiltinModule": g } = process;',
      'g("module").createRequire(import.meta.url)("esbuild").buildSync({ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" });',
      "",
    ].join("\n"),
  ],
] as const) test(`102-1 P2-4: tooling/build-*.mjs fails closed on ${label}`, () => {
  reset();
  bundled("tsc -p tsconfig.json && node tooling/build-client.mjs");
  put("plugins/native/beta/src/browser/clean.ts", "export const ok = 1;\n");
  put("plugins/native/beta/tooling/build-client.mjs", script);
  commit(`opaque build script: ${label}`);
  const result = gate("--base", "main");
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /plugins\/native\/beta\/src\/client\.ts:1:\d+: cannot statically expand browser program \(unsupported call readFileSync/);
});

test("102-1 P2-4: switch CaseBlock const cannot clobber top-level BUNDLES (P0-2)", () => {
  reset();
  bundled("tsc -p tsconfig.json && node tooling/build-client.mjs");
  put("plugins/native/beta/src/browser/clean.ts", "export const ok = 1;\n");
  put("plugins/native/beta/tooling/build-client.mjs", [
    'import { build } from "esbuild";',
    'const BUNDLES = [{ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" }];',
    'switch (0) { case 1: const BUNDLES = [{ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" }]; }',
    'await Promise.all(BUNDLES.map((o) => build(o)));',
    "",
  ].join("\n"));
  commit("switch case const does not clobber top-level BUNDLES");
  const result = gate("--base", "main");
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /raw fetch calls in a browser program in plugins\/native\/beta\/src\/browser\/send\.ts 0 → 1/);
  assert.doesNotMatch(result.out, /cannot statically expand/);
});

for (const [label, buildCmd] of [
  [
    "extra quoted tooling/build-*.mjs behind node flag (P1-2)",
    'tsc -p tsconfig.json && node tooling/build-client.mjs && node --no-warnings "tooling/build-missing.mjs"',
  ],
  [
    "esbuild CLI with --outfile space syntax (P1-2)",
    "tsc -p tsconfig.json && esbuild src/browser/clean.ts --outfile=dist/beta-client.js && esbuild src/browser/entry.ts --outfile dist/beta-client.js",
  ],
  [
    "esbuild CLI with --inject flag (P1-2)",
    "tsc -p tsconfig.json && esbuild src/browser/clean.ts --bundle --inject:src/browser/send.ts --outfile=dist/beta-client.js",
  ],
] as const) test(`102-1 P2-4: package.json build command fails closed on ${label}`, () => {
  reset();
  bundled(buildCmd);
  put("plugins/native/beta/src/browser/clean.ts", "export const ok = 1;\n");
  put("plugins/native/beta/tooling/build-client.mjs", [
    'import { build } from "esbuild";',
    'await build({ entryPoints: ["src/browser/clean.ts"], outfile: "dist/beta-client.js" });',
    "",
  ].join("\n"));
  commit(`opaque build command: ${label}`);
  const result = gate("--base", "main");
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /plugins\/native\/beta\/src\/client\.ts:1:\d+: cannot statically expand browser program \(unsupported call readFileSync/);
});

for (const [label, script] of [
  [
    "namespace esbuild.buildSync passed directly to BUNDLES.map",
    [
      'import * as esbuild from "esbuild";',
      'const BUNDLES = [{ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" }];',
      'BUNDLES.map(esbuild.buildSync);',
      "",
    ].join("\n"),
  ],
  [
    "for-const-of loop spreading DEFAULT_BROWSER and option",
    [
      'import esbuild from "esbuild";',
      'const DEFAULT_BROWSER = { bundle: true, format: "iife" };',
      'const BUNDLES = [{ entryPoints: ["src/browser/entry.ts"], outfile: "dist/beta-client.js" }];',
      'for (const opt of BUNDLES) { await esbuild.build({ ...DEFAULT_BROWSER, ...opt }); }',
      "",
    ].join("\n"),
  ],
  [
    "aliased named build import with write: false and explicit outfile",
    [
      'import { build as runEsbuild } from "esbuild";',
      'const OUT = "dist/beta-client.js";',
      'await runEsbuild({ entryPoints: ["src/browser/entry.ts"], outfile: OUT, write: false });',
      'console.log(OUT);',
      "",
    ].join("\n"),
  ],
] as const) test(`102-1 P2-4: tooling/build-*.mjs resolves legitimate ${label}`, () => {
  reset();
  bundled("tsc -p tsconfig.json && node tooling/build-client.mjs");
  put("plugins/native/beta/tooling/build-client.mjs", script);
  commit(`legitimate build script: ${label}`);
  const result = gate("--base", "main");
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /raw fetch calls in a browser program in plugins\/native\/beta\/src\/browser\/send\.ts 0 → 1/);
  assert.doesNotMatch(result.out, /cannot statically expand/);
});
