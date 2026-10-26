import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { deferredSurfaceClients, pluginOnDemandStylesheet, pluginSurfaceClients } from "@molis-ai/molis-work-app-workbench";

// specs/repository-anti-corruption §4.8/§4.13 (W1-07, decision #17): the page assets the host sends are frozen at their
// current size and may only fall. Each rule is mutation-verified here on a small scratch repository: one violation added
// on a branch makes `--base main` fail, and the laundering move (raising the committed budget to the built size, or
// `--update`) neither makes it pass nor is accepted when it is given the merge-base. Sizes come from a JSON file here
// (`--sizes`); the last two groups run the real measurement, on a fake host build and on this repository's own build.
const script = fileURLToPath(new URL("../scripts/gates/page-assets.mjs", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const BUDGET = "tooling/gates/page-assets.json";
let repo = "";
let work = "";
let sizes: Record<string, number> = {};

const gitAt = (dir: string, ...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args],
  { cwd: dir, encoding: "utf8", stdio: "pipe" });
const git = (...args: string[]) => gitAt(repo, ...args);
const put = (file: string, text: string, dir = repo) => { mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); writeFileSync(path.join(dir, file), text); };
const read = (file: string, dir = repo) => readFileSync(path.join(dir, file), "utf8");
const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", message); };
const budgetText = (assets: Record<string, number>) => `${JSON.stringify({ note: "fixture", assets }, null, 2)}\n`;
const putBudget = (assets: Record<string, number>) => put(BUDGET, budgetText(assets));
const budgetOf = (dir = repo) => (JSON.parse(read(BUDGET, dir)) as { assets: Record<string, number> }).assets;
const run = (dir: string, ...args: string[]) => {
  const result = spawnSync(process.execPath, [script, "--root", dir, ...args], { encoding: "utf8" });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
};
// The measured sizes of the scratch repository: written to a file outside the repository before every run.
const gate = (...args: string[]) => {
  writeFileSync(path.join(work, "sizes.json"), JSON.stringify(sizes));
  return run(repo, "--sizes", path.join(work, "sizes.json"), ...args);
};

const BASE = { "/assets/a.css": 1000, "/assets/b.js": 2000, "/assets/c.png": 3000 };

before(() => {
  work = mkdtempSync(path.join(tmpdir(), "molis-page-assets-"));
  repo = path.join(work, "repo");
  mkdirSync(repo);
  git("init", "-q", "-b", "main");
  putBudget(BASE);
  put("README.md", "fixture\n");
  sizes = { ...BASE };
  commit("base");
});
after(() => { if (work) rmSync(work, { recursive: true, force: true }); });

// Start a branch from the base, change the budget file and/or the measured sizes, commit.
const branch = (name: string, mutate: () => void) => {
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
  git("checkout", "-q", "-B", name);
  sizes = { ...BASE };
  mutate();
  commit(name);
};

test("the base passes: the budget is exactly what is measured", () => {
  git("checkout", "-q", "-f", "main");
  sizes = { ...BASE };
  const plain = gate();
  assert.equal(plain.code, 0, plain.out);
  assert.match(plain.out, /Page asset budgets passed against tooling\/gates\/page-assets\.json \(3 assets, 6000 bytes\)/);
  const based = gate("--base", "main");
  assert.equal(based.code, 0, based.out);
});

type Scenario = {
  name: string;
  mutate: () => void;
  expect: RegExp[];
  // The move that hides the growth: the committed budget is lifted to what is built. The merge-base comparison still fails.
  launder?: { budget: Record<string, number>; expect: RegExp[] };
  // What `--update --base main` says when it refuses to write.
  refused?: RegExp;
};
const violations: Scenario[] = [
  { name: "an asset grows by one byte", mutate: () => { sizes["/assets/a.css"] = 1001; },
    expect: [/\/assets\/a\.css grew: budget 1000 → built 1001 bytes \(\+1\)/], refused: /\/assets\/a\.css grew 1000 → 1001/,
    launder: { budget: { ...BASE, "/assets/a.css": 1001 }, expect: [/raises the budget of \/assets\/a\.css 1000 → 1001/] } },
  { name: "a script grows a lot", mutate: () => { sizes["/assets/b.js"] = 90000; },
    expect: [/\/assets\/b\.js grew: budget 2000 → built 90000 bytes \(\+88000\)/], refused: /\/assets\/b\.js grew 2000 → 90000/,
    launder: { budget: { ...BASE, "/assets/b.js": 90000 }, expect: [/raises the budget of \/assets\/b\.js 2000 → 90000/] } },
  { name: "a new asset is served", mutate: () => { sizes["/assets/d.js"] = 500; },
    expect: [/\/assets\/d\.js \(500 bytes\) has no budget/], refused: /\/assets\/d\.js \(500 bytes\) has no budget to lower/,
    launder: { budget: { ...BASE, "/assets/d.js": 500 }, expect: [/adds \/assets\/d\.js \(500 bytes\)/] } },
  { name: "the budget is raised although nothing grew", mutate: () => putBudget({ ...BASE, "/assets/a.css": 1500 }),
    expect: [/raises the budget of \/assets\/a\.css 1000 → 1500/, /\/assets\/a\.css is 500 bytes under its budget/] },
  { name: "an asset shrinks and its number is not lowered (the slack could be used again)", mutate: () => { sizes["/assets/a.css"] = 900; },
    expect: [/\/assets\/a\.css is 100 bytes under its budget \(1000 → built 900\); lower the budget with/] },
  { name: "an asset is no longer served but keeps its budget", mutate: () => { delete sizes["/assets/c.png"]; },
    expect: [/\/assets\/c\.png has a budget but the host no longer serves it/] },
  { name: "an asset is swapped for another with the same total (the new one has no budget)", mutate: () => { delete sizes["/assets/c.png"]; sizes["/assets/e.png"] = 3000; },
    expect: [/\/assets\/e\.png \(3000 bytes\) has no budget/, /\/assets\/c\.png has a budget but the host no longer serves it/] },
];

for (const scenario of violations) {
  test(`${scenario.name} fails against the merge-base, and --update does not hide it`, () => {
    branch("violation", scenario.mutate);
    const caught = gate("--base", "main");
    assert.equal(caught.code, 1, caught.out);
    for (const pattern of scenario.expect) assert.match(caught.out, pattern);

    if (scenario.refused) {
      const before = read(BUDGET);
      const refused = gate("--update", "--base", "main");
      assert.equal(refused.code, 1, refused.out);
      assert.match(refused.out, /Budget not written/);
      assert.match(refused.out, scenario.refused);
      assert.equal(read(BUDGET), before, "a refused --update leaves the budget file alone");
      assert.equal(git("status", "--porcelain"), "");
    }
    if (scenario.launder) {
      putBudget(scenario.launder.budget);
      commit("raise the budget");
      // Locally the file now agrees with the build, which is exactly the hole the merge-base comparison closes.
      assert.equal(gate().code, 0, "the check against the committed budget alone is satisfied by the rewrite");
      const still = gate("--base", "main");
      assert.equal(still.code, 1, still.out);
      for (const pattern of scenario.launder.expect) assert.match(still.out, pattern);
    }
  });
}

test("shrinking passes against the merge-base once the budget is lowered, and --update does it", () => {
  branch("shrink", () => { sizes["/assets/a.css"] = 900; sizes["/assets/b.js"] = 1500; });
  assert.equal(gate("--base", "main").code, 1);
  const lowered = gate("--update", "--base", "main");
  assert.equal(lowered.code, 0, lowered.out);
  assert.deepEqual(budgetOf(), { "/assets/a.css": 900, "/assets/b.js": 1500, "/assets/c.png": 3000 });
  assert.match(read(BUDGET), /"note": "Only decreases\./, "the written file explains itself");
  commit("lower the budget");
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.match(run.out, /passed against merge-base [0-9a-f]{8} \(main\) \(3 assets, 5400 bytes\)/);
});

test("dropping an asset together with its budget entry passes", () => {
  branch("drop", () => { delete sizes["/assets/c.png"]; putBudget({ "/assets/a.css": 1000, "/assets/b.js": 2000 }); });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
});

test("--update drops the entries of assets that are gone", () => {
  branch("gone", () => { delete sizes["/assets/c.png"]; });
  assert.equal(gate("--base", "main").code, 1);
  assert.equal(gate("--update", "--base", "main").code, 0);
  assert.deepEqual(Object.keys(budgetOf()), ["/assets/a.css", "/assets/b.js"]);
});

test("--update without --base compares with the committed budget, so it cannot raise it either", () => {
  branch("local-update", () => { sizes["/assets/a.css"] = 1200; });
  const before = read(BUDGET);
  const refused = gate("--update");
  assert.equal(refused.code, 1, refused.out);
  assert.match(refused.out, /Budget not written: something grew relative to tooling\/gates\/page-assets\.json/);
  assert.equal(read(BUDGET), before);
});

test("the first freeze: a merge-base without the budget file compares nothing, --update writes it", () => {
  const first = path.join(work, "first");
  mkdirSync(first);
  gitAt(first, "init", "-q", "-b", "main");
  put("README.md", "no budget yet\n", first);
  gitAt(first, "add", "-A");
  gitAt(first, "commit", "-q", "-m", "base");
  gitAt(first, "checkout", "-q", "-B", "freeze");
  writeFileSync(path.join(work, "first-sizes.json"), JSON.stringify({ "/assets/z.css": 700 }));
  const sizesArgs = ["--sizes", path.join(work, "first-sizes.json")];
  assert.equal(run(first, ...sizesArgs).code, 2, "without a budget file the plain check is unusable, not a pass");
  const written = run(first, ...sizesArgs, "--update", "--base", "main");
  assert.equal(written.code, 0, written.out);
  assert.deepEqual(budgetOf(first), { "/assets/z.css": 700 });
  gitAt(first, "add", "-A");
  gitAt(first, "commit", "-q", "-m", "freeze");
  const checked = run(first, ...sizesArgs, "--base", "main");
  assert.equal(checked.code, 0, checked.out);
  assert.match(checked.out, /Note: the merge-base has no tooling\/gates\/page-assets\.json, so the budget was not compared with it/);
});

test("--report lists every asset with its size and budget, --json carries the same numbers", () => {
  git("checkout", "-q", "-f", "main");
  sizes = { ...BASE, "/assets/a.css": 1100 };
  const text = gate("--report");
  assert.equal(text.code, 0, text.out);
  assert.match(text.out, /Page assets: 3 served paths, 6100 bytes/);
  assert.match(text.out, /3000\s+-\s+3000\s+\/assets\/c\.png/);
  assert.match(text.out, /1100\s+-\s+1000\s+\/assets\/a\.css/);
  const json = JSON.parse(gate("--report", "--json").out);
  assert.equal(json.measured["/assets/a.css"], 1100);
  assert.equal(json.budget["/assets/a.css"], 1000);
});

test("an unusable command or budget file is exit 2, never a pass", () => {
  git("checkout", "-q", "-f", "main");
  sizes = { ...BASE };
  assert.equal(gate("--no-such-flag").code, 2);
  assert.equal(gate("--json").code, 2, "--json goes with --report");
  const unknown = gate("--base", "no-such-ref");
  assert.equal(unknown.code, 2, unknown.out);
  assert.match(unknown.out, /is not a commit in this clone/);

  for (const [name, text, message] of [
    ["not JSON", "{", /is not valid JSON/],
    ["no assets object", "{}\n", /needs an "assets" object/],
    ["a zero budget", budgetText({ "/assets/a.css": 0 }), /positive whole number of bytes/],
    ["a fractional budget", budgetText({ "/assets/a.css": 1.5 }), /positive whole number of bytes/],
    ["a path outside /assets/", budgetText({ "/elsewhere/a.css": 10 }), /is not an \/assets\/ path/],
  ] as const) {
    put(BUDGET, text);
    const broken = gate();
    assert.equal(broken.code, 2, `${name}: ${broken.out}`);
    assert.match(broken.out, message, name);
  }
  rmSync(path.join(repo, BUDGET));
  const missing = gate();
  assert.equal(missing.code, 2, missing.out);
  assert.match(missing.out, /page-assets\.json is missing/);
  git("checkout", "-q", "-f", "main");
});

test("a sizes file that is not valid is exit 2", () => {
  git("checkout", "-q", "-f", "main");
  writeFileSync(path.join(work, "bad-sizes.json"), JSON.stringify({ "/assets/a.css": -3 }));
  const bad = run(repo, "--sizes", path.join(work, "bad-sizes.json"));
  assert.equal(bad.code, 2, bad.out);
});

// ---- the measurement: a fake host build ------------------------------------------------------------------------------
// The fake dist has the same entry points as the real build (the host's createLocalWebAssets, the workbench's page assets
// and registered plugin packs); the gate reads the routes from the fake host source, asks the fake host for each path and
// takes the length of the body in bytes.
const SOURCE_ROUTES = (routes: string[]) => `${routes.map(route => `if (pathname === "${route}") { /* */ }`).join("\n")}\nconst packs = /^\\/assets\\/molis-work-plugins\\/([a-z0-9-]+)\\.(js|css)$/;\n`;
const fakeHost = (root: string, { routes, packs, unserved = [] as string[] }: { routes: string[]; packs: Array<{ project_plugin_id: string; clientFactory?: string }>; unserved?: string[] }) => {
  put("package.json", '{ "type": "module" }\n', root);
  put("apps/local-host/src/web-assets.ts", SOURCE_ROUTES(routes), root);
  put("apps/local-host/dist/web-assets.js", `import { readFileSync } from "node:fs";
const unserved = ${JSON.stringify(unserved)};
export function createLocalWebAssets(ports) {
  const bodies = {
    "/assets/molis-work-workbench.css": () => ports.renderer.renderMolisWorkWorkbenchStylesheet(),
    "/assets/molis-work-workbench.js": () => ports.renderer.renderMolisWorkWorkbenchClientScript(),
    "/assets/molis-work-arrival.css": () => ports.renderer.renderMolisWorkArrivalStylesheet(),
    "/assets/molis-work-settings.css": () => ports.renderer.renderMolisWorkSettingsStylesheet(),
    "/assets/font.woff2": () => readFileSync(new URL("../../../font.woff2", import.meta.url)),
  };
  return {
    serveWorkbenchAsset(request, response, pathname) {
      if (request.method !== "GET" || unserved.includes(pathname)) return false;
      const pack = pathname.match(/^\\/assets\\/molis-work-plugins\\/([a-z0-9-]+)\\.js$/);
      const body = pack ? "pack:" + pack[1] + ":" + readFileSync(new URL("../../../pack-" + pack[1] + ".txt", import.meta.url), "utf8") : bodies[pathname]?.();
      if (body === undefined) return false;
      response.writeHead(200, {});
      response.end(body);
      return true;
    },
  };
}
`, root);
  put("apps/workbench/dist/page-assets.js", `import { readFileSync } from "node:fs";
const text = name => readFileSync(new URL("../../../" + name, import.meta.url), "utf8");
export const renderMolisWorkWorkbenchStylesheet = () => text("workbench.css");
export const renderMolisWorkWorkbenchClientScript = () => text("workbench.js");
export const renderMolisWorkArrivalStylesheet = () => text("arrival.css");
export const renderMolisWorkSettingsStylesheet = () => text("settings.css");
`, root);
  put("apps/workbench/dist/plugin-workbench.js", `export const BUILTIN_PLUGIN_WORKBENCH = ${JSON.stringify(packs)};\nexport const pluginOnDemandStylesheet = () => null;\n`, root);
  for (const [name, text] of Object.entries({ "workbench.css": "a".repeat(100), "workbench.js": "b".repeat(200), "arrival.css": "c".repeat(300), "settings.css": "d".repeat(400) })) put(name, text, root);
  writeFileSync(path.join(root, "font.woff2"), Buffer.alloc(77, 1));
};
const FAKE_ROUTES = ["/assets/molis-work-workbench.css", "/assets/molis-work-workbench.js", "/assets/molis-work-arrival.css", "/assets/molis-work-settings.css", "/assets/font.woff2"];
const FAKE_PACKS = [{ project_plugin_id: "alpha", clientFactory: "()=>1" }, { project_plugin_id: "plain" }];
const freshHost = (name: string, host: Parameters<typeof fakeHost>[1]) => {
  const root = path.join(work, name);
  mkdirSync(root);
  fakeHost(root, host);
  put("pack-alpha.txt", "中中中", root); // 3 characters, 9 bytes
  return root;
};

test("the real measurement takes the byte length of what the host sends, packs included, from the host's own routes", () => {
  const root = freshHost("fake-host", { routes: FAKE_ROUTES, packs: FAKE_PACKS });
  const written = run(root, "--update");
  assert.equal(written.code, 0, written.out);
  assert.deepEqual(budgetOf(root), {
    "/assets/font.woff2": 77,
    "/assets/molis-work-arrival.css": 300,
    "/assets/molis-work-plugins/alpha.js": "pack:alpha:".length + 9, // bytes, not characters
    "/assets/molis-work-settings.css": 400,
    "/assets/molis-work-workbench.css": 100,
    "/assets/molis-work-workbench.js": 200,
  });
  const checked = run(root);
  assert.equal(checked.code, 0, checked.out);

  put("workbench.css", "a".repeat(101), root);
  const grew = run(root);
  assert.equal(grew.code, 1, grew.out);
  assert.match(grew.out, /\/assets\/molis-work-workbench\.css grew: budget 100 → built 101 bytes \(\+1\)/);
  put("workbench.css", "a".repeat(100), root);

  put("pack-alpha.txt", "中中中中", root);
  const packGrew = run(root);
  assert.equal(packGrew.code, 1, packGrew.out);
  assert.match(packGrew.out, /\/assets\/molis-work-plugins\/alpha\.js grew: budget 20 → built 23 bytes \(\+3\)/);
  put("pack-alpha.txt", "中中中", root);

  const report = run(root, "--report");
  assert.equal(report.code, 0, report.out);
  assert.match(report.out, /Page assets: 6 served paths/);
  assert.match(report.out, /\/assets\/molis-work-plugins\/alpha\.js/);
  assert.doesNotMatch(report.out, /plain\.js/, "a pack without a client is not served and is not measured");
});

test("a route the host source declares is measured and needs a budget", () => {
  const root = freshHost("fake-new-route", { routes: FAKE_ROUTES, packs: FAKE_PACKS });
  assert.equal(run(root, "--update").code, 0);
  put("apps/local-host/src/web-assets.ts", SOURCE_ROUTES([...FAKE_ROUTES, "/assets/molis-work-extra.js"]), root);
  const extra = run(root);
  assert.equal(extra.code, 2, "a declared route the build does not serve is unusable, not a pass");
  assert.match(extra.out, /does not serve \/assets\/molis-work-extra\.js from this build/);
});

test("a route whose asset the host serves but the budget lacks fails like any new asset", () => {
  const root = freshHost("fake-unbudgeted", { routes: FAKE_ROUTES, packs: FAKE_PACKS });
  assert.equal(run(root, "--update").code, 0);
  const budget = budgetOf(root);
  delete budget["/assets/font.woff2"];
  put(BUDGET, budgetText(budget), root);
  const lacking = run(root);
  assert.equal(lacking.code, 1, lacking.out);
  assert.match(lacking.out, /\/assets\/font\.woff2 \(77 bytes\) has no budget/);
});

test("a path the build does not serve is exit 2 and says to build the workspace", () => {
  const root = freshHost("fake-unserved", { routes: FAKE_ROUTES, packs: FAKE_PACKS, unserved: ["/assets/font.woff2"] });
  const unserved = run(root, "--update");
  assert.equal(unserved.code, 2, unserved.out);
  assert.match(unserved.out, /does not serve \/assets\/font\.woff2 from this build.*pnpm workspace:build/);
});

test("a missing build is exit 2 and says to build the workspace", () => {
  const root = freshHost("fake-unbuilt", { routes: FAKE_ROUTES, packs: FAKE_PACKS });
  rmSync(path.join(root, "apps/workbench/dist"), { recursive: true });
  const unbuilt = run(root);
  assert.equal(unbuilt.code, 2, unbuilt.out);
  assert.match(unbuilt.out, /apps\/workbench\/dist\/page-assets\.js is missing.*pnpm workspace:build/);
});

test("a host source that names no asset route, or no plugin packs, is exit 2", () => {
  const root = freshHost("fake-no-routes", { routes: FAKE_ROUTES, packs: FAKE_PACKS });
  put("apps/local-host/src/web-assets.ts", "export {};\n", root);
  const none = run(root);
  assert.equal(none.code, 2, none.out);
  assert.match(none.out, /names no "\/assets\/\.\.\." route any more/);
  put("apps/local-host/src/web-assets.ts", FAKE_ROUTES.map(route => `x("${route}");`).join("\n"), root);
  const noPacks = run(root);
  assert.equal(noPacks.code, 2, noPacks.out);
  assert.match(noPacks.out, /no longer serves plugin packs/);
});

test("a dist whose entry points moved is exit 2 and names the entry point", () => {
  const root = freshHost("fake-moved", { routes: FAKE_ROUTES, packs: FAKE_PACKS });
  put("apps/workbench/dist/plugin-workbench.js", "export const somethingElse = [];\n", root);
  const moved = run(root);
  assert.equal(moved.code, 2, moved.out);
  assert.match(moved.out, /no longer exports BUILTIN_PLUGIN_WORKBENCH/);
});

// ---- discovery: the budget does not depend on the gate's reading of the host source --------------------------------------
// The gate reads the host's routes from the string literals in apps/local-host/src/web-assets.ts. A refactor can move a
// route out of what that reading sees while the host still sends the asset; the budget must hold anyway. These cases run on
// a fake host build that is a git repository, with a base commit and a feature branch like a pull request.
const HOST_SOURCE = "apps/local-host/src/web-assets.ts";
const hostRepo = (name: string) => {
  const root = freshHost(name, { routes: FAKE_ROUTES, packs: FAKE_PACKS });
  gitAt(root, "init", "-q", "-b", "main");
  assert.equal(run(root, "--update").code, 0);
  gitAt(root, "add", "-A");
  gitAt(root, "commit", "-q", "-m", "base");
  gitAt(root, "checkout", "-q", "-b", "feature");
  return root;
};
const commitAt = (root: string, message: string) => { gitAt(root, "add", "-A"); gitAt(root, "commit", "-q", "--allow-empty", "-m", message); };
const respell = (root: string, from: string, to: string) => {
  const before = read(HOST_SOURCE, root);
  assert.ok(before.includes(from), `${from} is in the fixture host source`);
  put(HOST_SOURCE, before.replace(from, to), root);
};
const dropBudgetEntry = (root: string, asset: string) => {
  const budget = budgetOf(root);
  delete budget[asset];
  put(BUDGET, budgetText(budget), root);
};
// A spelling the gate's reading of the source cannot see and that raises none of its other alarms: no "/assets/" text at all.
const WORKBENCH_CSS_ROUTE = '"/assets/molis-work-workbench.css"';
const CONCATENATED_ROUTE = '"/ass" + "ets/molis-work-workbench.css"';

test("an asset grown while its route is rewritten out of the gate's reading and its budget entry deleted is still caught", () => {
  // The laundering move found in review: grow workbench.css, spell its route so that the reading of web-assets.ts misses it,
  // delete its entry (removing an entry was always allowed), commit. Before the probe this passed both `--base <M>` and the
  // CI merge base: the asset was no longer measured, so nothing compared it with anything.
  const root = hostRepo("discovery-laundering");
  put("workbench.css", "a".repeat(110), root);
  respell(root, WORKBENCH_CSS_ROUTE, CONCATENATED_ROUTE);
  dropBudgetEntry(root, "/assets/molis-work-workbench.css");
  commitAt(root, "grow, hide the route, drop the entry");

  const caught = run(root, "--base", "main");
  assert.equal(caught.code, 1, caught.out);
  assert.match(caught.out, /\/assets\/molis-work-workbench\.css \(110 bytes\) is sent by the host, but apps\/local-host\/src\/web-assets\.ts no longer declares it as a string literal/);
  assert.match(caught.out, /removing its budget entry does not stop the host from sending it/);
  assert.match(caught.out, /\/assets\/molis-work-workbench\.css \(110 bytes\) is still sent by the host but its entry was deleted from tooling\/gates\/page-assets\.json \(the merge-base budgets 100 bytes\)/, "the asset is measured, so it needs its entry back");

  // `--update` writes nothing until the discovery is taught.
  const before = read(BUDGET, root);
  const refused = run(root, "--update", "--base", "main");
  assert.equal(refused.code, 1, refused.out);
  assert.match(refused.out, /Budget not written: the gate's route discovery is out of date/);
  assert.equal(read(BUDGET, root), before);
});

test("the same rewrite with the entry kept fails as a discovery miss, not as a pass, even when nothing grew", () => {
  const root = hostRepo("discovery-miss");
  respell(root, WORKBENCH_CSS_ROUTE, CONCATENATED_ROUTE);
  commitAt(root, "harmless refactor of the routes");

  const caught = run(root, "--base", "main");
  assert.equal(caught.code, 1, caught.out);
  assert.match(caught.out, /\/assets\/molis-work-workbench\.css \(100 bytes\) is sent by the host, but apps\/local-host\/src\/web-assets\.ts no longer declares it as a string literal/);
  assert.doesNotMatch(caught.out, /grew|has no budget|was deleted|under its budget/, "the number itself is fine, only the discovery is stale");
  assert.equal(run(root).code, 1, "the paths of the committed budget are asked of the host as well, with no --base");

  const report = run(root, "--report");
  assert.equal(report.code, 0, report.out);
  assert.match(report.out, /1 discovery miss: the host sends \/assets\/molis-work-workbench\.css/);
  assert.match(report.out, /molis-work-workbench\.css {2}\(route not found in the host source\)/);
  const json = JSON.parse(run(root, "--report", "--json").out) as { discoveryMisses: string[]; measured: Record<string, number> };
  assert.deepEqual(json.discoveryMisses, ["/assets/molis-work-workbench.css"]);
  assert.equal(json.measured["/assets/molis-work-workbench.css"], 100, "a miss is measured, not skipped");
});

test("an asset the host stopped sending is dropped with its entry, and cannot keep a stale one", () => {
  const root = hostRepo("discovery-gone");
  respell(root, 'if (pathname === "/assets/font.woff2") { /* */ }', "");
  put("apps/local-host/dist/web-assets.js", read("apps/local-host/dist/web-assets.js", root).replace("const unserved = [];", 'const unserved = ["/assets/font.woff2"];'), root);
  commitAt(root, "the host no longer sends the font");

  const stale = run(root, "--base", "main");
  assert.equal(stale.code, 1, stale.out);
  assert.match(stale.out, /\/assets\/font\.woff2 has a budget but the host no longer serves it/);
  assert.doesNotMatch(stale.out, /discovery/, "the built host sends nothing for it, so this is not a miss");

  dropBudgetEntry(root, "/assets/font.woff2");
  commitAt(root, "drop the entry too");
  const dropped = run(root, "--base", "main");
  assert.equal(dropped.code, 0, dropped.out);
});

test("routes written with single quotes or a template literal are read like double-quoted ones", () => {
  const root = hostRepo("discovery-quotes");
  respell(root, '"/assets/molis-work-arrival.css"', "'/assets/molis-work-arrival.css'");
  respell(root, '"/assets/font.woff2"', "`/assets/font.woff2`");
  commitAt(root, "respell the routes");
  const respelled = run(root, "--base", "main");
  assert.equal(respelled.code, 0, respelled.out);

  // An asset spelled that way is found by the reading and needs its budget like any other (here the budget lacks the font).
  dropBudgetEntry(root, "/assets/font.woff2");
  commitAt(root, "no budget for the font");
  const lacking = run(root);
  assert.equal(lacking.code, 1, lacking.out);
  assert.match(lacking.out, /\/assets\/font\.woff2 \(77 bytes\) has no budget/);
  assert.doesNotMatch(lacking.out, /discovery/, "it was read from the source, not found by the probe");
});

test("a route the gate cannot read as one string literal is exit 2, never skipped", () => {
  const root = hostRepo("discovery-unreadable");
  const original = read(HOST_SOURCE, root);
  for (const [name, text] of [
    ["a template with an expression", "const packFile = (id) => `/assets/molis-work-plugins/${id}.js`;"],
    ["a concatenation", 'const file = "/assets/" + name;'],
    ["a prefix", 'const prefix = "/assets/molis-work-plugins/";\nconst bare = "/assets/";'],
  ] as const) {
    put(HOST_SOURCE, `${original}\n${text}\n`, root);
    const unreadable = run(root);
    assert.equal(unreadable.code, 2, `${name}: ${unreadable.out}`);
    assert.match(unreadable.out, /mentions "\/assets\/" \d+ times but only \d+ of them are whole string literals/, name);
  }
  // Comments are not code.
  put(HOST_SOURCE, `${original}\n// the old route was "/assets/ghost.css" and pathname === ghost\n/* /assets/ghost-\${x}.js too */\n`, root);
  const commented = run(root);
  assert.equal(commented.code, 0, commented.out);
});

test("a route compared with a constant instead of a literal is exit 2, in either order", () => {
  const root = hostRepo("discovery-constant");
  const original = read(HOST_SOURCE, root);
  for (const [name, text] of [
    ["the path on the left", 'import { FONT } from "./font.js";\nif (pathname === FONT) { /* */ }'],
    ["the path on the right", 'import { FONT } from "./font.js";\nif (FONT === pathname) { /* */ }'],
    ["not equal", "if (pathname !== FONT) { /* */ }"],
  ] as const) {
    put(HOST_SOURCE, `${original}\n${text}\n`, root);
    const constant = run(root);
    assert.equal(constant.code, 2, `${name}: ${constant.out}`);
    assert.match(constant.out, /compares the request path with something that is not a string literal/, name);
  }
  // Comparisons with literals, in any quote style, are what the gate reads.
  put(HOST_SOURCE, `${original}\nif (pathname !== 'x' && "y" === pathname && pathname == \`z\`) { /* */ }\n`, root);
  assert.equal(run(root).code, 0);
});

test("a route spelled as a regular expression or with escaped slashes is exit 2 wherever the word assets sits; the plugin pack pattern is the only one the gate knows", () => {
  // Found in review: the escaped `\/assets\/` of a regex literal is not a whole "/assets/", so it raised neither the mention
  // count nor the comparison check, and a route spelled that way (say a per-plugin stylesheet family) was never measured.
  const root = hostRepo("discovery-regex");
  const original = read(HOST_SOURCE, root);
  const known = String.raw`const packs = /^\/assets\/molis-work-plugins\/([a-z0-9-]+)\.(js|css)$/;`;
  assert.ok(original.includes(known), "the fixture spells the plugin pack route like the real host");
  for (const [name, text] of [
    ["a stylesheet family as a regex literal", String.raw`const sheet = pathname.match(/^\/assets\/molis-work-plugin-styles\/([a-z0-9-]+)\.css$/);`],
    ["a regex with one escaped slash", String.raw`const sheet = /^\/assets\/styles.css$/;`],
    ["a regex with the slashes in character classes", String.raw`const sheet = /^[/]assets[/]styles\.css$/;`],
    ["a regex with the slashes escaped inside character classes", String.raw`const sheet = pathname.match(/^[\/]assets[\/]molis-work-plugin-styles[\/]([a-z0-9-]+)\.css$/);`],
    ["a regex with the word in a group", String.raw`const sheet = pathname.match(/^\/(assets)\/molis-work-plugin-styles\/([a-z0-9-]+)\.css$/);`],
    ["a regex with the word in a group and no escaped slash next to it", String.raw`const sheet = pathname.match(/^[/](assets)[/]styles\.css$/);`],
    ["the pack pattern widened to another extension", String.raw`const packs = /^\/assets\/molis-work-plugins\/([a-z0-9-]+)\.(js|css|map)$/;`],
    ["the pack pattern pointed at another folder", String.raw`const packs = /^\/assets\/molis-work-styles\/([a-z0-9-]+)\.js$/;`],
    ["a plain string with escaped slashes", String.raw`const font = "\/assets\/inter.woff2";`],
    ["a string with only the closing slash escaped", String.raw`const sheet = "/assets\/styles.css";`],
    ["new RegExp with a string", 'const sheet = new RegExp("^/assets/molis-work-styles/[a-z]+\\\\.css$");'],
  ] as const) {
    put(HOST_SOURCE, `${original}\n${text}\n`, root);
    const hidden = run(root);
    assert.equal(hidden.code, 2, `${name}: ${hidden.out}`);
    assert.match(hidden.out, /has the word "assets" outside a whole "\/assets\/…" string literal|mentions "\/assets\/" \d+ times but only \d+ of them are whole string literals/, name);
  }
  // The message names the text it found and the one pattern it accepts.
  put(HOST_SOURCE, `${original}\n${String.raw`const sheet = pathname.match(/^\/assets\/molis-work-plugin-styles\/([a-z0-9-]+)\.css$/);`}\n`, root);
  const named = run(root);
  assert.match(named.out, /plugin-styles/);
  assert.match(named.out, /the only regular expression the gate knows is the plugin pack pattern/);
  // The known pattern, however often it is written, and a regex in a comment are not alarms.
  put(HOST_SOURCE, `${original}\n${known}\n// the old family was /^\\/assets\\/molis-work-old\\/x\\.css$/\n/* and \\/assets\\/ghost */\n`, root);
  const fine = run(root);
  assert.equal(fine.code, 0, fine.out);
});

// ---- this repository's own build -------------------------------------------------------------------------------------
// The committed budget against the build in this working tree (the gate CI runs after `pnpm workspace:verify`). Needs the
// workspace built, like the other tests that read build output: `pnpm workspace:build`.
// RAC-44, RAC-55, RAC-60: the resource part of each (Cognia's client, the background-execution prerequisite, Images' stable
// keys): the served assets measured from this tree's build equal the committed budget, and no unbudgeted asset is served.
// That the budget only fell against the merge-base is the CI step's `--base` comparison, not this test.
test("this repository's build is within the committed page asset budget, which holds every served asset", () => {
  assert.ok(existsSync(path.join(repoRoot, BUDGET)), `${BUDGET} is committed`);
  const real = run(repoRoot);
  assert.equal(real.code, 0, real.out);
  assert.match(real.out, /Page asset budgets passed/);
  const report = JSON.parse(run(repoRoot, "--report", "--json").out) as { measured: Record<string, number>; budget: Record<string, number>; discoveryMisses: string[] };
  assert.deepEqual(Object.keys(report.measured).sort(), Object.keys(report.budget).sort());
  assert.deepEqual(report.discoveryMisses, [], "every budgeted path is a route the gate reads from apps/local-host/src/web-assets.ts or a registered plugin pack");
  for (const asset of ["/assets/molis-work-workbench.css", "/assets/molis-work-workbench.js", "/assets/molis-work-arrival.css", "/assets/molis-work-settings.css", "/assets/molis-work-pages-editor.js"]) {
    assert.ok(report.measured[asset] > 0, `${asset} is measured`);
  }
  // Exactly the client bundles the workbench serves: one per plugin with its own client, none for a surface that borrows
  // another's (W4-03: Files, Git, Diff and Text Stats load Coding's), and the Host's own surfaces' (RAC-73: 角色 since CHR-1).
  // PG-070: and the sheet a framed plugin brings (its namespace's rules), for each plugin that has one.
  const bundles = [...new Set([...deferredSurfaceClients().map(client => `/assets/molis-work-plugins/${client.bundle}.js`),
    ...pluginSurfaceClients().filter(client => pluginOnDemandStylesheet(client.id)).map(client => `/assets/molis-work-plugins/${client.id}.css`)])].sort();
  assert.ok(bundles.length > 0);
  assert.deepEqual(Object.keys(report.measured).filter(asset => asset.startsWith("/assets/molis-work-plugins/")).sort(), bundles, "the plugin client packs are measured");
});

// ISSUE-06: the Issue client's first ceiling (24,000 bytes, user-approved) was a one-time admission for a path the merge-base did not
// budget. It is in the base now, so the gate has no exception left: adding it again, growing it, or adding any other path all fail.
test("no new asset path is admitted, the Issue client included, and an established asset may only fall", () => {
  const asset = "/assets/molis-work-plugins/issues.js";
  branch("issue-first-asset", () => { sizes[asset] = 24000; putBudget(sizes); });
  assert.equal(gate("--base", "main").code, 1);
  assert.equal(gate("--update", "--base", "main").code, 1);
  branch("issue-established", () => { sizes[asset] = 9000; putBudget(sizes); });
  git("checkout", "-q", "-b", "issue-established-growth");
  sizes[asset]++; putBudget(sizes); commit("attempt to regrow an existing Issue resource");
  assert.equal(gate("--base", "issue-established").code, 1);
  assert.equal(gate("--update", "--base", "issue-established").code, 1);
  branch("another-new-plugin", () => { sizes["/assets/molis-work-plugins/unreviewed.js"] = 10; putBudget(sizes); });
  assert.equal(gate("--base", "main").code, 1);
});

// ISSUE-45/46 spent their one approved increase (23,451 → 24,379 measured, under the 24 KiB the user allowed on 2026-10-15,
// specs/issue-home-v0): the Issue client, even back at its old size, grows under the same rule as every asset.
test("the spent Issue draft/preview increase leaves no allowance, even at the Issue client's old size", () => {
  const asset = "/assets/molis-work-plugins/issues.js";
  branch("issue-draft-old", () => { sizes[asset] = 23451; putBudget(sizes); });
  git("checkout", "-q", "-b", "issue-draft-regrow");
  sizes[asset]++;
  assert.equal(gate("--update", "--base", "issue-draft-old").code, 1);
  putBudget(sizes); commit("attempt to regrow from the old Issue size");
  assert.equal(gate("--base", "issue-draft-old").code, 1);
  sizes[asset] = 23451; sizes["/assets/a.css"]++; putBudget(sizes);
  assert.equal(gate("--base", "issue-draft-old").code, 1, "other assets remain frozen");
});

// Each one-time increase the user approved on 2026-10-15 is spent; back at the old size, the asset grows under the same rule as
// every asset. ISSUE-48 took issues.js from 24,378 (#521) and the I8 fixes the Pages editor from 698,574 (#522). W3-B1 (#553,
// context-program §21.8) took the Pages editor, the Pages client and the workbench script, and receipts 1d (#564,
// specs/ai-input-receipts) the Coding bundle and both stylesheets, from the sizes below; W4-03 removed those allowances with
// the companions' copies of Coding's bundle. Receipts 1e (#589, specs/ai-input-receipts RC-14–RC-16) took the workbench script,
// the three stylesheets and the Coding bundle from the next five sizes; W5-05 slice 1 removed that allowance. T2 (AC-28,
// specs/ai-interaction-experience D36) took the workbench script and the three stylesheets from the next four; receipts 3b-2a
// replaced that allowance. Receipts 3b-2a (#667, specs/ai-input-receipts D37–D40) took the arrival sheet, the Coding bundle,
// the workbench sheet and the workbench script from the next four; re-ask (#669, D5, D37) replaced that allowance. Re-ask
// took Coding's bundle and the workbench script from the next two; receipts 3b-2b replaced that allowance. Receipts 3b-2b
// (#671, RCPT-331–333) took the three stylesheets and the workbench script from the next four; receipts 3b-2c replaced that allowance.
// Receipts 3b-2c (#687, RCPT-334–337) took the workbench script from the next size; W3-A3c replaced that allowance. W3-A3c
// (#691, specs/context-program §21.6) took the workbench script from the next size; receipts 3d-2 replaced that allowance.
// Receipts 3d-2 (#688, RCPT-344–348) took Coding's bundle and the workbench script from the next two; receipts 3d-3 replaced that allowance.
// Receipts 3d-3 (#700, RCPT-349–353) took Coding's bundle, both stylesheets and the workbench script from the next four; AC-03 (R4) replaced that allowance.
// AC-03 (#702, specs/ai-interaction-experience R4) took the workbench script from the next sizes; receipts 3d-4 replaced that allowance.
// Receipts 3d-4 (#706, RCPT-354–356) then used 1109913→1110802; W5-01 keeps both that spent start and its ceiling frozen.
// W5-01 (#684) used 1110329→1110357 on main; receipts 3e-1 replaced that allowance.
// Receipts 3e-1 (#714) then used 1110357→1111791, and W3-C2 replaced that allowance.
// W3-C2 (#720) then used 1111791→1111910, and W4-1 replaced that allowance.
// W5-01 Lingguang then used 1113068→1115299, and plugin tab groups replaced that allowance.
// Plugin tab groups (#765) then used 1115299→1129841 on the script and 1589812→1593165 on the sheet; receipts review fixes replaced that allowance.
// Receipts review fixes (#778) then used 1129841→1130036, and the outcome slot with the delivery note replaced that allowance.
for (const [asset, old] of [
  ["/assets/molis-work-plugins/issues.js", 24378], ["/assets/molis-work-pages-editor.js", 698574],
  ["/assets/molis-work-pages-editor.js", 703633], ["/assets/molis-work-plugins/pages.js", 48441], ["/assets/molis-work-workbench.js", 1097484],
  ["/assets/molis-work-plugins/coding.js", 432277], ["/assets/molis-work-settings.css", 1115127], ["/assets/molis-work-workbench.css", 1701600],
  ["/assets/molis-work-arrival.css", 821387], ["/assets/molis-work-plugins/coding.js", 434028], ["/assets/molis-work-settings.css", 1113186],
  ["/assets/molis-work-workbench.css", 1699659], ["/assets/molis-work-workbench.js", 1095606],
  ["/assets/molis-work-arrival.css", 744923], ["/assets/molis-work-settings.css", 1034948], ["/assets/molis-work-workbench.css", 1624532],
  ["/assets/molis-work-workbench.js", 1101126],
  ["/assets/molis-work-arrival.css", 705879], ["/assets/molis-work-plugins/coding.js", 373429], ["/assets/molis-work-workbench.css", 1596754],
  ["/assets/molis-work-workbench.js", 1099839],
  ["/assets/molis-work-plugins/coding.js", 374113], ["/assets/molis-work-workbench.js", 1104882],
  ["/assets/molis-work-arrival.css", 703658], ["/assets/molis-work-settings.css", 989905], ["/assets/molis-work-workbench.css", 1592688],
  ["/assets/molis-work-workbench.js", 1105153],
  ["/assets/molis-work-workbench.js", 1107936],
  ["/assets/molis-work-workbench.js", 1108184],
  ["/assets/molis-work-plugins/coding.js", 373784], ["/assets/molis-work-workbench.js", 1108502],
  ["/assets/molis-work-plugins/coding.js", 373970], ["/assets/molis-work-settings.css", 988484], ["/assets/molis-work-workbench.css", 1591639],
  ["/assets/molis-work-workbench.js", 1109302],
  ["/assets/molis-work-workbench.js", 1109312], ["/assets/molis-work-workbench.js", 1109918],
  ["/assets/molis-work-workbench.js", 1109913], ["/assets/molis-work-workbench.js", 1110802],
  ["/assets/molis-work-workbench.js", 1110187], ["/assets/molis-work-workbench.js", 1110215],
  ["/assets/molis-work-workbench.js", 1110056], ["/assets/molis-work-workbench.js", 1110084],
  ["/assets/molis-work-workbench.js", 1109330], ["/assets/molis-work-workbench.js", 1110329],
  ["/assets/molis-work-workbench.js", 1110357],
  ["/assets/molis-work-workbench.js", 1110116],
  ["/assets/molis-work-workbench.js", 1111561],
  ["/assets/molis-work-workbench.js", 1112315],
  ["/assets/molis-work-workbench.js", 1112375],
  // W5-10 preview extraction is smaller than the combined main baseline; its intermediate allowance is retired.
  ["/assets/molis-work-pages-editor.js", 706825], ["/assets/molis-work-pages-editor.js", 706928],
  ["/assets/molis-work-workbench.js", 1111791], ["/assets/molis-work-workbench.js", 1114022],
  ["/assets/molis-work-workbench.js", 1111910], ["/assets/molis-work-workbench.js", 1114141],
  ["/assets/molis-work-workbench.js", 1113068],
  // W5-01-ALC-RES08 the Alchemist continuation allowance (50,619 → 52,373, user approved 2026-10-18) is spent.
  ["/assets/molis-work-plugins/alchemist.js", 50619],
  ["/assets/molis-work-workbench.js", 1115299], ["/assets/molis-work-workbench.css", 1589812],
  ["/assets/molis-work-workbench.js", 1129841],
  // The outcome slot's +442 B (#789 with #803) is spent; main's budget has since fallen below its start.
  ["/assets/molis-work-workbench.js", 1130033],
  // The project-knowledge allowances (#839) are spent.
  ["/assets/molis-work-workbench.js", 1128644], ["/assets/molis-work-workbench.css", 1593165], ["/assets/molis-work-settings.css", 982397],
  // The overflow-fade slice's intermediate starts (#856, VUX-27) are retired into the branch's one admission.
  ["/assets/molis-work-workbench.js", 1130116], ["/assets/molis-work-workbench.css", 1603099], ["/assets/molis-work-settings.css", 988881],
  ["/assets/molis-work-arrival.css", 698467],
  // The copy, disclosure and live-number allowances (#860, VUX-19, VUX-22, VUX-42) are spent.
  ["/assets/molis-work-workbench.js", 1130995], ["/assets/molis-work-workbench.css", 1603559], ["/assets/molis-work-settings.css", 989369],
  ["/assets/molis-work-arrival.css", 698955], ["/assets/molis-work-pages-editor.js", 706942],
  // The branch's one admission from main (#851, VUX-19, VUX-27, VUX-35) is spent.
  ["/assets/molis-work-workbench.js", 1129525], ["/assets/molis-work-workbench.css", 1603154], ["/assets/molis-work-settings.css", 988933],
  ["/assets/molis-work-arrival.css", 698519], ["/assets/molis-work-pages-editor.js", 706933],
  // The scroll-owner and side-group allowances (#861, VUX-26, VUX-08) are spent.
  ["/assets/molis-work-workbench.js", 1132686], ["/assets/molis-work-workbench.css", 1604785], ["/assets/molis-work-settings.css", 990560],
  ["/assets/molis-work-arrival.css", 700146],
  // The Coding scroll-owner allowance (#864, VUX-26) is spent.
  ["/assets/molis-work-workbench.js", 1134508],
  // The remaining copy and scroll consumers' allowances (#866, VUX-19, VUX-26) are spent.
  ["/assets/molis-work-workbench.js", 1134824], ["/assets/molis-work-plugins/shelf.js", 75673],
  ["/assets/molis-work-plugins/lingguang.js", 25265],
  // The show-more allowances (#868, VUX-08) are spent.
  ["/assets/molis-work-workbench.js", 1135021], ["/assets/molis-work-workbench.css", 1605196], ["/assets/molis-work-settings.css", 990971],
  ["/assets/molis-work-arrival.css", 700557],
  // The 产出 split allowance (#869, VUX-08) is spent.
  ["/assets/molis-work-workbench.js", 1135978],
  // The 上下文 allowance (#871, VUX-08/09) is spent.
  ["/assets/molis-work-workbench.js", 1136122],
  // The 工作环境 and 连接与工具 allowance (#873, VUX-08/09) is spent.
  ["/assets/molis-work-workbench.js", 1138483], ["/assets/molis-work-workbench.css", 1605291], ["/assets/molis-work-settings.css", 991066],
  ["/assets/molis-work-arrival.css", 700652],
  // The 用量 allowance (#874, VUX-11) is spent.
  ["/assets/molis-work-workbench.js", 1143359], ["/assets/molis-work-workbench.css", 1605330], ["/assets/molis-work-settings.css", 991105],
  ["/assets/molis-work-arrival.css", 700691],
  // The Coding MCP tools allowance (#876, VUX-08/09) is spent.
  ["/assets/molis-work-workbench.js", 1146308],
  // The text-wrap allowances (#900, VUX-04) are spent.
  ["/assets/molis-work-workbench.js", 1158399], ["/assets/molis-work-workbench.css", 1607761], ["/assets/molis-work-settings.css", 991786],
  ["/assets/molis-work-arrival.css", 702081],
  // The roving-focus allowance (#902, VUX-28) is spent.
  ["/assets/molis-work-workbench.js", 1158426],
  // The layers allowance (#904, VUX-29) is spent.
  ["/assets/molis-work-workbench.js", 1161486],
  // The tooltip allowances (#906, VUX-05) are spent.
  ["/assets/molis-work-workbench.js", 1161761], ["/assets/molis-work-workbench.css", 1607833], ["/assets/molis-work-settings.css", 991858],
  ["/assets/molis-work-arrival.css", 702153],
  // The hover-action allowances (#907, VUX-06) are spent.
  ["/assets/molis-work-workbench.js", 1162964], ["/assets/molis-work-workbench.css", 1607967], ["/assets/molis-work-settings.css", 991992],
  ["/assets/molis-work-arrival.css", 702287],
  // The sizing-keys allowance (#908, VUX-06) is spent.
  ["/assets/molis-work-pages-editor.js", 707306],
  // The size-announcement allowances (#910, VUX-06) are spent.
  ["/assets/molis-work-pages-editor.js", 708886], ["/assets/molis-work-workbench.js", 1163017],
  // The narrow-container allowances (#911, VUX-30) are spent.
  ["/assets/molis-work-workbench.css", 1608756], ["/assets/molis-work-settings.css", 992244], ["/assets/molis-work-workbench.js", 1163042],
  // The drop-zone allowances (#912, VUX-18) are spent.
  ["/assets/molis-work-workbench.js", 1163079], ["/assets/molis-work-plugins/shelf.js", 75771],
  // The attachment-chip allowances (#913, VUX-16, VUX-18) are spent.
  ["/assets/molis-work-workbench.js", 1163656], ["/assets/molis-work-workbench.css", 1608984], ["/assets/molis-work-settings.css", 992398], ["/assets/molis-work-arrival.css", 702433],
  // The patch-copy allowance (#914, VUX-33) is spent.
  ["/assets/molis-work-plugins/coding.js", 373159],
  // The @-list allowances (#915, VUX-17) are spent.
  ["/assets/molis-work-workbench.js", 1167224], ["/assets/molis-work-workbench.css", 1609383], ["/assets/molis-work-settings.css", 992797], ["/assets/molis-work-arrival.css", 702832],
  // The no-accumulation allowance (#918, VUX-36) is spent.
  ["/assets/molis-work-workbench.js", 1167962],
  // The English-page allowances (#920, VUX-40) are spent.
  ["/assets/molis-work-plugins/jelly.js", 91179], ["/assets/molis-work-plugins/coding.js", 373460],
] as const) {
  test(`the spent increase of ${asset} leaves no allowance, even at its old size ${old}`, () => {
    const name = `${asset.replace(/\W+/g, "-").replace(/^-/, "")}-${old}`;
    branch(`${name}-old`, () => { sizes[asset] = old; putBudget(sizes); });
    git("checkout", "-q", "-B", `${name}-regrow`);
    sizes[asset]++;
    assert.equal(gate("--update", "--base", `${name}-old`).code, 1);
    putBudget(sizes); commit("attempt to regrow from the old size");
    assert.equal(gate("--base", `${name}-old`).code, 1);
  });
}

// specs/visual-ui-experience (2026-10-20): each slice's growth is admitted once, from exactly the merge-base budget to the
// measured size. The allowance is read from the gate as it stands, so the test follows the slice that wrote it rather than
// naming one slice's numbers. One byte more, another asset, or growth from the new baseline still fails.
const currentCeilings = () => {
  const block = /const APPROVED_CEILINGS = \{([\s\S]*?)\};/.exec(readFileSync(script, "utf8"))?.[1] ?? "";
  return Object.fromEntries([...block.matchAll(/"([^"]+)":\s*\[(\d+),\s*(\d+)\]/g)].map(([, asset, start, ceiling]) => [asset, [Number(start), Number(ceiling)]])) as Record<string, [number, number]>;
};
test("VUX the current one-time allowance is bounded and spent once; other assets and later growth still fail", () => {
  const allowed = currentCeilings();
  const assets = Object.keys(allowed);
  // An empty allowance (a slice that only made things lighter) is `{}`: anything else in it is an entry.
  assert.ok(assets.length > 0 || !/APPROVED_CEILINGS = \{\s*[^\s}]/.test(readFileSync(script, "utf8")), "every entry in the gate's allowance is read");
  branch("vux-base", () => { for (const asset of assets) sizes[asset] = allowed[asset][0]; putBudget(sizes); });
  git("checkout", "-q", "-B", "vux-change");
  for (const asset of assets) sizes[asset] = allowed[asset][1];
  assert.equal(gate("--update", "--base", "vux-base").code, 0);
  assert.equal(gate("--base", "vux-base").code, 0);
  for (const asset of assets) {
    sizes[asset]++;
    assert.equal(gate("--update", "--base", "vux-base").code, 1, `${asset}: one byte over its allowance`);
    sizes[asset]--;
  }
  sizes["/assets/a.css"]++;
  assert.equal(gate("--update", "--base", "vux-base").code, 1, "other assets stay frozen");
  sizes["/assets/a.css"]--; assert.equal(gate("--update", "--base", "vux-base").code, 0);
  commit("freeze the measured sizes"); git("branch", "-f", "vux-frozen");
  for (const asset of assets) {
    sizes[asset]++; putBudget(sizes);
    assert.equal(gate("--base", "vux-frozen").code, 1, `${asset}: the new baseline has no allowance`);
    assert.equal(gate("--update", "--base", "vux-frozen").code, 1);
    sizes[asset]--; putBudget(sizes);
  }
});

// The user approved one new asset on 2026-10-22, the isolated plugin frame client, at its measured size. No other asset may be added,
// it may not come in a byte larger, and once budgeted it only falls.
test("SYS-15 the approved plugin frame asset may be added once at its measured size; no other new asset, no growth after", () => {
  const asset = "/assets/molis-work-plugin-frame.js";
  branch("plugin-frame-base", () => { putBudget(sizes); });
  git("checkout", "-q", "-B", "plugin-frame-change");
  (sizes as Record<string, number>)[asset] = 187121;
  assert.equal(gate("--update", "--base", "plugin-frame-base").code, 1, "a byte over the approved size");
  (sizes as Record<string, number>)[asset] = 187120;
  assert.equal(gate("--update", "--base", "plugin-frame-base").code, 0);
  assert.equal(gate("--base", "plugin-frame-base").code, 0);
  (sizes as Record<string, number>)["/assets/molis-work-other.js"] = 10;
  assert.equal(gate("--update", "--base", "plugin-frame-base").code, 1, "no other asset may be added");
  delete (sizes as Record<string, number>)["/assets/molis-work-other.js"];
  assert.equal(gate("--update", "--base", "plugin-frame-base").code, 0);
  commit("budget the approved plugin frame asset"); git("branch", "-f", "plugin-frame-frozen");
  (sizes as Record<string, number>)[asset] = 187120 + 1; putBudget(sizes);
  assert.equal(gate("--base", "plugin-frame-frozen").code, 1, "once budgeted it only falls");
  assert.equal(gate("--update", "--base", "plugin-frame-frozen").code, 1);
});
