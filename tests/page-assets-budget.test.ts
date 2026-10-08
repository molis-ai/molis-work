import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

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
const SOURCE_ROUTES = (routes: string[]) => `${routes.map(route => `if (pathname === "${route}") { /* */ }`).join("\n")}\nconst packs = /^\\/assets\\/molis-work-plugins\\/([a-z0-9-]+)\\.js$/;\n`;
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
  put("apps/workbench/dist/plugin-workbench.js", `export const BUILTIN_PLUGIN_WORKBENCH = ${JSON.stringify(packs)};\n`, root);
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

// ---- this repository's own build -------------------------------------------------------------------------------------
// The committed budget against the build in this working tree (the gate CI runs after `pnpm workspace:verify`). Needs the
// workspace built, like the other tests that read build output: `pnpm workspace:build`.
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
  assert.ok(Object.keys(report.measured).filter(asset => asset.startsWith("/assets/molis-work-plugins/")).length >= 20, "the plugin client packs are measured");
});
