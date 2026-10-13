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
  put("plugins/native/work/package.json", JSON.stringify({name:"@test/work",exports:{"./terminal-client":{import:"./dist/terminal/client.js"}}}));
  put("plugins/native/work/src/terminal/client.ts", "export const start = () => window.fetch('/terminal');\n");
  put("apps/workbench/src/terminal-client.ts", "import {start} from '@test/work/terminal-client'; start();\n");
  commit("typed entry"); const result = gate("--base", "main"); assert.equal(result.code, 1, result.out);
  assert.match(result.out, /raw fetch calls in a browser program in plugins\/native\/work\/src\/terminal\/client\.ts 0 → 1/);
});

test("W3-10-5-01: an unexpandable or unparsable recognized program refuses update", () => {
  for (const code of ["makeProgram()", "`if ( {`"]) {
    reset(); put("plugins/native/alpha/src/broken.ts", `export const CLIENT_SCRIPT = ${code};\n`); commit("broken");
    const before = read("tooling/gates/baseline.json"), result = gate("--update", "--base", "main");
    assert.equal(result.code, 1, result.out); assert.match(result.out, /rawFetchInScripts:.*(?:cannot statically expand|parse failed)/);
    assert.equal(read("tooling/gates/baseline.json"), before);
  }
});
