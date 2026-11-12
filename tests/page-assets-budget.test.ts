import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { deferredSurfaceClients, pluginOnDemandStylesheet, pluginSurfaceClients } from "@molis-ai/molis-work-app-workbench";
import { assetProblems } from "../scripts/gates/page-assets-policy.mjs";
import { buildBaseline, command, cachedMeasurement, reportMatches, trustedRun } from "../scripts/gates/page-assets-baseline.mjs";
const script = fileURLToPath(new URL("../scripts/gates/page-assets.mjs", import.meta.url));
const measurer = fileURLToPath(new URL("../scripts/gates/page-assets-measure.mjs", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const work = mkdtempSync(path.join(tmpdir(), "molis-page-assets-"));
after(() => rmSync(work, { recursive: true, force: true }));
const put = (file: string, text: string, dir: string) => { mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); writeFileSync(path.join(dir, file), text); };
const read = (file: string, dir: string) => readFileSync(path.join(dir, file), "utf8");
const gitAt = (dir: string, ...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args], { cwd: dir, encoding: "utf8", stdio: "pipe" });
const run = (dir: string, ...args: string[]) => {
  const result = spawnSync(process.execPath, [script, "--root", dir, ...args], { encoding: "utf8" });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
};
const BASE = { "/assets/a.css": 1000, "/assets/b.js": 2000 };
const allowance = (bytes: number, userApproval?: string) => JSON.stringify({ assets: { "/assets/a.css": bytes }, reason: "necessary feature", review: "review #123", ...(userApproval ? { userApproval } : {}) });
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


test("CCR-02 shrink needs no shared file; subsequent growth starts from the smaller actual build", () => {
  assert.deepEqual(assetProblems({ ...BASE, "/assets/a.css": 900 }, BASE, {}, {}), []);
  assert.match(assetProblems({ ...BASE, "/assets/a.css": 901 }, { ...BASE, "/assets/a.css": 900 }, {}, {}).join(), /grew 900 → 901/);
});
test("CCR-03 allowances survive unrelated base changes, are bounded and spent on adoption", () => {
  const current = { "task-a.json": allowance(10) };
  assert.deepEqual(assetProblems({ ...BASE, "/assets/a.css": 710 }, { ...BASE, "/assets/a.css": 700 }, current, {}), []);
  assert.match(assetProblems({ ...BASE, "/assets/a.css": 1011 }, BASE, current, {}).join(), /cover 10 bytes/);
  assert.match(assetProblems({ ...BASE, "/assets/a.css": 1011 }, { ...BASE, "/assets/a.css": 1010 }, current, current).join(), /cover 0 bytes/);
  assert.match(assetProblems(BASE, BASE, { "task-a.json": allowance(20) }, current).join(), /cannot be changed/);
  assert.match(assetProblems(BASE, BASE, {}, current).join(), /cannot be changed/);
  assert.match(assetProblems(BASE, BASE, { "bad.json": "{}" }, {}).join(), /missing reason/);
});
test("CCR-03/04 new assets and cumulative large growth require user approval; groups sum new allowances", () => {
  const current = { "task-a.json": allowance(6000), "task-b.json": allowance(5000) };
  assert.match(assetProblems({ ...BASE, "/assets/a.css": 12000 }, BASE, current, {}).join(), /requires userApproval/);
  const approved = { "task-a.json": allowance(6000, "user decision a"), "task-b.json": allowance(5000, "user decision b") };
  assert.deepEqual(assetProblems({ ...BASE, "/assets/a.css": 12000 }, BASE, approved, {}), []);
  assert.match(assetProblems({ ...BASE, "/assets/a.css": 12001 }, BASE, approved, {}).join(), /cover 11000 bytes/);
  const fresh = { "new.json": JSON.stringify({ reason: "new", review: "review", assets: { "/assets/new.js": 7 } }) };
  assert.match(assetProblems({ ...BASE, "/assets/new.js": 7 }, BASE, fresh, {}).join(), /userApproval/);
  fresh["new.json"] = JSON.stringify({ ...JSON.parse(fresh["new.json"]), userApproval: "user decision" });
  assert.deepEqual(assetProblems({ ...BASE, "/assets/new.js": 7 }, BASE, fresh, {}), []);
});
// CCR-04: the merge group sums both new changes and rejects the next byte.
test("CCR-03/04 two independent Git branches merge allowances without editing the gate or absolute budgets", () => {
  const root = path.join(work, "parallel"); mkdirSync(root);
  gitAt(root, "init", "-q", "-b", "main"); put("README.md", "base", root); gitAt(root, "add", "."); gitAt(root, "commit", "-qm", "base");
  gitAt(root, "checkout", "-qb", "a"); put("tooling/gates/page-asset-allowances/a.json", allowance(10), root); gitAt(root, "add", "."); gitAt(root, "commit", "-qm", "a");
  gitAt(root, "checkout", "-qb", "b", "main"); put("tooling/gates/page-asset-allowances/b.json", allowance(20), root); gitAt(root, "add", "."); gitAt(root, "commit", "-qm", "b");
  gitAt(root, "merge", "--no-edit", "a");
  put("base.json", JSON.stringify(BASE), work); put("head.json", JSON.stringify({ ...BASE, "/assets/a.css": 1030 }), work);
  const args = ["--base", "main", "--base-sizes", path.join(work, "base.json"), "--sizes", path.join(work, "head.json")];
  assert.equal(run(root, ...args).code, 0);
  put("head.json", JSON.stringify({ ...BASE, "/assets/a.css": 1031 }), work);
  assert.equal(run(root, ...args).code, 1);
  assert.equal(run(root, ...args, "--output", path.join(work, "not-an-artifact.json")).code, 1);
});
test("R7-N2-01 CCR-03/04 CLI bounds the first allowance for a new asset and refuses reuse", () => {
  const root = path.join(work, "new-asset"); mkdirSync(root);
  gitAt(root, "init", "-q", "-b", "main");
  gitAt(root, "commit", "--allow-empty", "-qm", "base");
  gitAt(root, "checkout", "-qb", "new-asset");
  const file = "tooling/gates/page-asset-allowances/new-asset.json";
  const record = { reason: "add a page script", review: "review fixture", assets: { "/assets/new.js": 7 } };
  put(file, JSON.stringify(record), root);
  gitAt(root, "add", file);

  const baseSizes = path.join(root, "base-sizes.json");
  const headSizes = path.join(root, "head-sizes.json");
  writeFileSync(baseSizes, JSON.stringify(BASE));
  writeFileSync(headSizes, JSON.stringify({ ...BASE, "/assets/new.js": 7 }));
  const args = ["--base", "main", "--base-sizes", baseSizes, "--sizes", headSizes];
  const unapproved = run(root, ...args);
  assert.equal(unapproved.code, 1, unapproved.out);
  assert.match(unapproved.out, /new-asset\.json: \/assets\/new\.js is new or over 10 KB; userApproval is required/);

  put(file, JSON.stringify({ ...record, userApproval: "user decision fixture" }), root);
  gitAt(root, "add", file);
  gitAt(root, "commit", "-qm", "add the approved asset");
  const approved = run(root, ...args);
  assert.equal(approved.code, 0, approved.out);

  writeFileSync(headSizes, JSON.stringify({ ...BASE, "/assets/new.js": 8 }));
  const excess = run(root, ...args);
  assert.equal(excess.code, 1, excess.out);
  assert.match(excess.out, /\/assets\/new\.js grew 0 → 8 \(\+8\); new allowances cover 7 bytes/);

  // Adopt the allowance into main before comparing a later increase.
  gitAt(root, "branch", "-f", "main", "HEAD");
  gitAt(root, "commit", "--allow-empty", "-qm", "later growth");
  writeFileSync(baseSizes, JSON.stringify({ ...BASE, "/assets/new.js": 7 }));
  const reused = run(root, ...args);
  assert.equal(reused.code, 1, reused.out);
  assert.match(reused.out, /\/assets\/new\.js grew 7 → 8 \(\+1\); new allowances cover 0 bytes/);
});
test("CCR-05 artifact requires exact commit, collector and successful trusted workflow", async () => {
  const sha = "a".repeat(40), key = "collector", report = { sha, key, measured: BASE, misses: [] };
  assert.equal(reportMatches(report, sha, key), true);
  for (const changed of [{ ...report, sha: "b" }, { ...report, key: "old" }, { ...report, measured: {} }, { ...report, misses: ["/assets/x"] }]) assert.equal(reportMatches(changed, sha, key), false);
  const valid = { head_sha: sha, path: ".github/workflows/ci.yml", conclusion: "success", event: "merge_group" };
  assert.equal(trustedRun(valid, sha), true);
  for (const invalid of [{ ...valid, event: "pull_request" }, { ...valid, conclusion: "failure" }, { ...valid, head_sha: "b" }, { ...valid, event: "push", head_branch: "feature" }]) assert.equal(trustedRun(invalid, sha), false);
  let requests = 0;
  assert.equal(await cachedMeasurement({ sha, key, repo: "example/repo", token: "fixture", fetch: async () => { requests++; return { ok: true, json: async () => ({ workflow_runs: [{ ...valid, event: "pull_request" }] }) }; } }), null);
  assert.equal(requests, 1, "PR artifacts never fetched");
  assert.equal(await cachedMeasurement({ sha, key, repo: "example/repo", token: "fixture", fetch: async () => { throw new Error("offline"); } }), null);
});
test("CCR-07 base checkout is removed after build failure and cancellation", async () => {
  const root = path.join(work, "cleanup"); mkdirSync(root); gitAt(root, "init", "-q", "-b", "main");
  put("README.md", "fixture", root); gitAt(root, "add", "."); gitAt(root, "commit", "-qm", "base");
  let checkout = "";
  await assert.rejects(buildBaseline(root, "HEAD", undefined, async (_name: string, _args: string[], options: { cwd: string }) => { checkout = options.cwd; throw new Error("install failed"); }), /install failed/);
  assert.equal(existsSync(checkout), false);
  const abort = new AbortController();
  await assert.rejects(buildBaseline(root, "HEAD", abort.signal, async (_name: string, _args: string[], options: { cwd: string; signal: AbortSignal }) => {
    checkout = options.cwd;
    const timer = setTimeout(() => abort.abort(), 100);
    try { await command(process.execPath, ["-e", "setInterval(() => {}, 1000)"], options); } finally { clearTimeout(timer); }
  }), /cancelled/);
  assert.equal(existsSync(checkout), false);
  assert.equal(gitAt(root, "worktree", "list", "--porcelain").match(/^worktree /gm)?.length, 1);
});
test("CCR-06 measurement uses the actual Host bytes including UTF-8 plugin packs", () => {
  const root = freshHost("host", { routes: FAKE_ROUTES, packs: FAKE_PACKS });
  const result = run(root, "--report", "--json"); assert.equal(result.code, 0, result.out);
  assert.deepEqual(JSON.parse(result.out).measured, { "/assets/font.woff2": 77, "/assets/molis-work-arrival.css": 300, "/assets/molis-work-plugins/alpha.js": 20, "/assets/molis-work-settings.css": 400, "/assets/molis-work-workbench.css": 100, "/assets/molis-work-workbench.js": 200 });
  put("apps/local-host/src/web-assets.ts", SOURCE_ROUTES(FAKE_ROUTES).replace('"/assets/font.woff2"', '"/ass" + "ets/font.woff2"'), root);
  const probe = path.join(work, "probe.json"); writeFileSync(probe, JSON.stringify(["/assets/font.woff2"]));
  const measured = JSON.parse(execFileSync(process.execPath, [measurer, root, probe], { encoding: "utf8" }));
  assert.deepEqual(measured.misses, ["/assets/font.woff2"]);
  assert.equal(measured.measured["/assets/font.woff2"], 77);
});
test("CCR-06 route discovery refuses unreadable spellings, missing routes and broken builds", () => {
  const root = freshHost("refusals", { routes: FAKE_ROUTES, packs: FAKE_PACKS });
  const source = read("apps/local-host/src/web-assets.ts", root);
  for (const extra of ['const a = "/assets/" + name;', 'if (pathname === FONT) {}', 'if (FONT === pathname) {}', String.raw`const route = /\/assets\/other/;`, 'const a = `/assets/${id}.js`;']) {
    put("apps/local-host/src/web-assets.ts", source + "\n" + extra, root);
    assert.equal(run(root, "--report").code, 2, extra);
  }
  put("apps/local-host/src/web-assets.ts", source.replace('"/assets/font.woff2"', "'/assets/font.woff2'"), root);
  assert.equal(run(root, "--report").code, 0);
  put("apps/local-host/src/web-assets.ts", SOURCE_ROUTES([...FAKE_ROUTES, "/assets/missing.js"]), root);
  assert.match(run(root, "--report").out, /does not serve/);
  put("apps/local-host/src/web-assets.ts", source, root); rmSync(path.join(root, "apps/workbench/dist"), { recursive: true });
  assert.match(run(root, "--report").out, /is missing.*build the workspace/);
});
test("CCR-06 actual repository build measures all served workbench and plugin paths (RAC-44/55/60, PG-070)", () => {
  const result = run(repoRoot, "--report", "--json"); assert.equal(result.code, 0, result.out);
  const report = JSON.parse(result.out); assert.deepEqual(report.discoveryMisses, []);
  for (const asset of ["/assets/molis-work-workbench.css", "/assets/molis-work-workbench.js", "/assets/molis-work-arrival.css", "/assets/molis-work-settings.css", "/assets/molis-work-pages-editor.js"]) assert.ok(report.measured[asset] > 0);
  const bundles = [...new Set([...deferredSurfaceClients().map(client => `/assets/molis-work-plugins/${client.bundle}.js`), ...pluginSurfaceClients().filter(client => pluginOnDemandStylesheet(client.id)).map(client => `/assets/molis-work-plugins/${client.id}.css`)])].sort();
  assert.ok(bundles.length > 0); assert.deepEqual(Object.keys(report.measured).filter(asset => asset.startsWith("/assets/molis-work-plugins/")).sort(), bundles);
});

test("CCR-05 valid CI artifact reuses bytes; expired and corrupt artifacts fall back", async () => {
  const sha = "a".repeat(40), key = "collector", directory = path.join(work, "artifact"); mkdirSync(directory);
  const report = { sha, key, measured: BASE, misses: [] }, file = path.join(directory, "measurement.json"), archive = path.join(directory, "valid.zip");
  writeFileSync(file, JSON.stringify(report)); execFileSync("zip", ["-q", "-j", archive, file]);
  const data = readFileSync(archive);
  const valid = { id: 1, head_sha: sha, path: ".github/workflows/ci.yml", conclusion: "success", event: "merge_group" };
  const fetcher = (expired = false, corrupt = false) => async (url: string) => {
    if (url.includes("/workflows/")) return { ok: true, json: async () => ({ workflow_runs: [valid] }) };
    if (url.endsWith("/zip")) return { ok: true, arrayBuffer: async () => corrupt ? Buffer.from("not a zip") : data };
    return { ok: true, json: async () => ({ artifacts: [{ id: 2, name: `page-assets-${sha}-${key}`, expired, size_in_bytes: data.length }] }) };
  };
  const args = { sha, key, repo: "example/repo", token: "fixture" };
  assert.deepEqual(await cachedMeasurement({ ...args, fetch: fetcher() }), report);
  assert.equal(await cachedMeasurement({ ...args, fetch: fetcher(true) }), null);
  assert.equal(await cachedMeasurement({ ...args, fetch: fetcher(false, true) }), null);
});
test("CCR-05/07 successful cold baseline measures the built checkout and removes it", async () => {
  const root = freshHost("base-success", { routes: FAKE_ROUTES, packs: FAKE_PACKS });
  gitAt(root, "init", "-q", "-b", "main"); gitAt(root, "add", "."); gitAt(root, "commit", "-qm", "base");
  const calls: string[][] = []; let checkout = "";
  const base = await buildBaseline(root, "HEAD", undefined, async (name: string, args: string[], options: { cwd: string }) => {
    checkout = options.cwd; calls.push([name, ...args]);
    if (args[0] === "workspace:build") writeFileSync(path.join(checkout, "workbench.css"), "x".repeat(91));
  });
  assert.equal(base.measured["/assets/molis-work-workbench.css"], 91, "measured the cold checkout's produced bytes, not the candidate");
  assert.equal(read("workbench.css", root).length, 100);
  assert.deepEqual(calls.map(call => call.slice(0, 2)), [["pnpm", "install"], ["pnpm", "workspace:build"]]);
  assert.equal(existsSync(checkout), false);
});
