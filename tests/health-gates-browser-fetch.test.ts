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
const reset = () => { git("checkout", "-q", "-f", "main"); git("clean", "-fdq"); git("checkout", "-q", "-B", "candidate"); };

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
  const before = read("tooling/gates/baseline.json"), result = gate("--base", "main");
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /raw fetch calls in a browser program.*0 → 1/);
  assert.equal(gate("--update", "--base", "main").code, 1);
  assert.equal(read("tooling/gates/baseline.json"), before);
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
  const before = read("tooling/gates/baseline.json");
  for (const args of [["--base", "HEAD"], ["--update"], ["--update", "--base", "HEAD"]]) {
    const result = gate(...args); assert.equal(result.code, 1, result.out); assert.match(result.out, /Workbench raw fetch must be zero/);
  }
  assert.equal(read("tooling/gates/baseline.json"), before);
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
  put("plugins/native/alpha/src/clean.ts", "export const text = 'fetch(\"/text\")'; export async function server() {return fetch('/server');} export const CLIENT_SCRIPT = `// fetch('/comment')\nconst label = \"window.fetch('/label')\"; function fetch() {return Promise.resolve();} fetch();`;\n");
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
    const before = read("tooling/gates/baseline.json"), result = gate("--update", "--base", "main");
    assert.equal(result.code, 1, result.out); assert.match(result.out, /rawFetchInScripts:.*(?:cannot statically expand|parse failed)/);
    assert.equal(read("tooling/gates/baseline.json"), before);
  }
});

for (const [name, source] of [
  ["String", "export const CLIENT_SCRIPT = String(\"fetch('/x');\");"],
  ["replacement", "export const CLIENT_SCRIPT = \"noop('/x');\".replace('noop', 'fetch');"],
  ["conditional return", "function script(){if(true)return \"fetch('/x');\";return \"void 0;\";} export const CLIENT_SCRIPT=script();"],
  ["formatter body", "function script(source){return \"noop('/x');\".replace('noop','fetch');} export const CLIENT_SCRIPT=script('void 0;');"],
]) test(`W3-10-5-01: the ${name} program transformation cannot silently count zero`, () => {
  reset(); put("plugins/native/alpha/src/transform.ts", source + "\n"); commit(name);
  const before = read("tooling/gates/baseline.json"), result = gate("--base", "main");
  assert.equal(result.code, 1, result.out); assert.match(result.out, /raw fetch calls in a browser program.*0 → 1/);
  assert.equal(gate("--update", "--base", "main").code, 1); assert.equal(read("tooling/gates/baseline.json"), before);
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
  reset(); put("apps/workbench/src/terminal-client.ts", "import type {Ref} from './effect.js'; import {type Ref as Local} from './effect.js'; export type {Ref} from './effect.js'; export {type Ref as Other} from './effect.js';\n");
  put("apps/workbench/src/effect.ts", "export type Ref = string; export const server = () => fetch('/server');\n"); commit("type-only edges");
  const result = gate("--base", "main"); assert.equal(result.code, 0, result.out);
});

test("W3-10-5-01: a data formatter used as a whole executable program is refused", () => {
  reset(); put("plugins/native/alpha/src/data.ts", "export const CLIENT_SCRIPT = L(\"fetch('/x');\");\n"); commit("data formatter");
  const before = read("tooling/gates/baseline.json"), result = gate("--update", "--base", "main");
  assert.equal(result.code, 1, result.out); assert.match(result.out, /data formatter cannot be treated as executable program text/);
  assert.equal(read("tooling/gates/baseline.json"), before);
});

test("W3-10-5-01: a shared formatter keeps each input owner and cannot deduplicate a new fragment", () => {
  reset();
  put("plugins/native/alpha/src/a.ts", "export const A_SCRIPT = `fetch('/a');`;\n");
  put("plugins/native/alpha/src/format.ts", "export function format(source){return source.replace('noop','noop');}\n");
  put("plugins/native/alpha/src/joined.ts", "import {A_SCRIPT} from './a.js';import {format} from './format.js';export const CLIENT_SCRIPT = format(A_SCRIPT);\n");
  assert.equal(gate("--update").code, 0); commit("formatter base"); git("branch", "-f", "format-base", "HEAD");
  put("plugins/native/alpha/src/b.ts", "export const B_SCRIPT = `fetch('/b');`;\n");
  put("plugins/native/alpha/src/joined.ts", "import {A_SCRIPT} from './a.js';import {B_SCRIPT} from './b.js';import {format} from './format.js';export const CLIENT_SCRIPT = [format(A_SCRIPT),format(B_SCRIPT)].join(';');\n");
  commit("second input"); const before = read("tooling/gates/baseline.json"), result = gate("--base", "format-base");
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /raw fetch calls in a browser program in plugins\/native\/alpha\/src\/b\.ts 0 → 1/);
  assert.equal(gate("--update", "--base", "format-base").code, 1); assert.equal(read("tooling/gates/baseline.json"), before);
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
  const before = read("tooling/gates/baseline.json"), result = gate("--update", "--base", "compact-base");
  assert.equal(result.code, 1, result.out); assert.match(result.out, /raw fetch calls.*close\.ts 0 → 1/);
  assert.doesNotMatch(result.out, /browser program parse failed/); assert.equal(read("tooling/gates/baseline.json"), before);
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
