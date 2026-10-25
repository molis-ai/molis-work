import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { grantLocalTools, localToolsProbe } from "./fixtures/plugin-local-tools.js";

// specs/repository-anti-corruption/slices/platform-local-tools-home-scope.md, PG-112: the Host looks for the tools a Manifest declares,
// with file-system queries only, and gives the answer to a plugin that holds the permission and is still running.

const PATH_ENV = "MOLIS_WORK_LOCAL_TOOLS_PATH", SWITCH_ENV = "MOLIS_WORK_LOCAL_TOOLS";

function pinned(t: TestContext, ...names: string[]) {
  const directory = mkdtempSync(join(tmpdir(), "local-tools-")), prior = { path: process.env[PATH_ENV], off: process.env[SWITCH_ENV] };
  for (const name of names) { writeFileSync(join(directory, name), "#!/bin/sh\n", { mode: 0o755 }); }
  process.env[PATH_ENV] = directory; delete process.env[SWITCH_ENV];
  t.after(() => {
    for (const [name, value] of [[PATH_ENV, prior.path], [SWITCH_ENV, prior.off]] as const) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

async function started(t: TestContext, probe = localToolsProbe()) {
  const served = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
  const granted = await grantLocalTools(served.host, probe), action = served.host.homeActionClient();
  return { ...served, ...granted, probe, find: () => action.invoke(probe.caller(), probe.find, {}) as Promise<{ tool_id: string; executable: string | null }[]>,
    check: (path: string) => action.invoke(probe.caller(), probe.check, { path }), refresh: () => action.invoke(probe.caller(), probe.refresh, {}) };
}

test("RAC-662 a plugin that declares no local_tools is given no service, and one that declares them is given it", async t => {
  const none = localToolsProbe("toolsnone", null);
  const served = await serveHomeRuntime(t, { pluginFixtures: { home: [none.entry()] } });
  await served.host.homePlugins!.ready();
  assert.equal(none.contexts.at(-1)?.services?.localTools, undefined);
  const withTools = await started(t);
  assert.ok(withTools.probe.contexts.at(-1)?.services?.localTools);
});

test("RAC-662 find answers each declared tool with the runnable file in the pinned directory, and null where there is none or the file is not runnable", async t => {
  const directory = pinned(t, "alpha-cli");
  writeFileSync(join(directory, "beta-cli"), "not runnable", { mode: 0o644 });
  mkdirSync(join(directory, "alpha"));
  const f = await started(t);
  assert.deepEqual(await f.find(), [{ tool_id: "alpha", executable: join(directory, "alpha-cli") }, { tool_id: "beta", executable: null }]);
});

test("RAC-662 isExecutable answers yes or no for a path the person gave, and refuses what is not an absolute path or when the Manifest did not declare custom_executables", async t => {
  const directory = pinned(t, "mine");
  const f = await started(t);
  assert.equal(await f.check(join(directory, "mine")), true);
  assert.equal(await f.check(join(directory, "missing")), false, "no reason is given for a no");
  assert.equal(await f.check(directory), false, "a directory is not a runnable file");
  symlinkSync(join(directory, "mine"), join(directory, "link"));
  assert.equal(await f.check(join(directory, "link")), true, "a link to a runnable file is what the person's shell would run too");
  for (const path of ["mine", "./mine", "", `${directory}/mine\u0000`, "/" + "a".repeat(4100)]) {
    await assert.rejects(f.check(path), { code: "plugin.local_tools_input_invalid" }, JSON.stringify(path.slice(0, 20)));
  }
  const closed = await started(t, localToolsProbe("toolsclosed", { tools: [{ tool_id: "alpha", binaries: ["alpha"] }] }));
  await assert.rejects(closed.check(join(directory, "mine")), { code: "plugin.local_tools_custom_undeclared" });
});

// BL-411: once the instance has stopped, a service call its left-running code makes does nothing: a promise that never settles, or
// nothing at all for a synchronous method (`inertAfterStop`), instead of an error nobody catches.
test("RAC-662 a plugin that is stopped gets nothing back: no answer, no search", async t => {
  pinned(t, "alpha-cli");
  const f = await started(t), client = f.probe.client();
  assert.equal((await client.find()).length, 2);
  await f.platform.runtime.stop(f.install.install_id);
  const settled = (promise: Promise<unknown>) => Promise.race([promise.then(() => true, () => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 200))]);
  assert.equal(await settled(client.find()), false, "a stopped plugin's find never answers");
  assert.equal(await settled(client.isExecutable("/bin/sh")), false, "a stopped plugin's isExecutable never answers");
  assert.equal(client.refresh(), undefined);
});

test("RAC-662 a plugin the person did not grant local-tools:read is refused", async t => {
  pinned(t, "alpha-cli");
  const probe = localToolsProbe("toolsnogrant"), served = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
  await served.host.homePlugins!.ready();
  await assert.rejects(probe.client().find(), { code: "actions.forbidden" });
  await assert.rejects(probe.client().isExecutable("/bin/sh"), { code: "actions.forbidden" });
});

test("RAC-663 the answer is kept for a while and asked again after refresh or when the pinned directory changes; concurrent asks share one search", async t => {
  const directory = pinned(t, "alpha-cli");
  const f = await started(t);
  const [first, second] = await Promise.all([f.find(), f.find()]);
  assert.deepEqual(first, second);
  writeFileSync(join(directory, "beta-cli"), "#!/bin/sh\n", { mode: 0o755 });
  assert.equal((await f.find()).find(entry => entry.tool_id === "beta")?.executable, null, "a recent answer is reused");
  await f.refresh();
  assert.equal((await f.find()).find(entry => entry.tool_id === "beta")?.executable, join(directory, "beta-cli"));
  const other = mkdtempSync(join(tmpdir(), "local-tools-other-"));
  t.after(() => rmSync(other, { recursive: true, force: true }));
  process.env[PATH_ENV] = other;
  assert.deepEqual((await f.find()).map(entry => entry.executable), [null, null], "a different pin is a different question");
});

test("RAC-664 MOLIS_WORK_LOCAL_TOOLS=off finds nothing and says no to every path", async t => {
  const directory = pinned(t, "alpha-cli");
  const f = await started(t);
  process.env[SWITCH_ENV] = "off";
  assert.deepEqual((await f.find()).map(entry => entry.executable), [null, null]);
  assert.equal(await f.check(join(directory, "alpha-cli")), false);
});

test("RAC-663 RAC-665 the Host's service only queries the file system, and neither the plugin package nor the Module reads the environment or starts a process", () => {
  const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  assert.doesNotMatch(source("apps/local-host/src/plugin-local-tools-service.ts"), /child_process|spawn|exec(File)?\(/u);
  assert.doesNotMatch(source("packages/plugin-runtime/src/local-tools.ts"), /child_process|spawn|process\.env|node:fs/u);
  // The only file reads left are the two page-client wrappers reading their own bundle that sits beside them.
  const ownBundle = /\/plugins\/native\/shelf\/src\/(?:settings-)?client\.ts$/u;
  for (const directory of ["modules/shelf/src", "plugins/native/shelf/src"]) {
    for (const file of listSources(new URL(`../${directory}/`, import.meta.url))) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /process\.env|child_process|node:os|homedir\(/u, file.pathname);
      if (!ownBundle.test(file.pathname)) assert.doesNotMatch(text, /node:fs/u, file.pathname);
    }
  }
});

function listSources(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const next = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    return entry.isDirectory() ? listSources(next) : entry.name.endsWith(".ts") ? [next] : [];
  });
}
