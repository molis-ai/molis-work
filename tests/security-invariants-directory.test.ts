import assert from "node:assert/strict";
import test from "node:test";
import { syncBuiltinESMExports } from "node:module";
import { promises as fs } from "node:fs";
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { directoryForHome, projectDeletedHooksFor } from "@molis-ai/molis-work-app-local-host";
import type { PluginDirectoryReadRequest, PluginDirectoryReadResult } from "@molis-ai/molis-work-contracts/platform/plugin-directory";
import { deferred, grantHomeProbe, homeProbe, person, serveHomeRuntime } from "./fixtures/home-runtime.js";

function directoryProbe(name: string) {
  const probe = homeProbe(name);
  probe.permissions.push("directory:read");
  probe.definition.manifest.permissions = [...probe.definition.manifest.permissions, { permission: "directory:read", reason: "Read a selected folder", required: false }];
  let request: PluginDirectoryReadRequest = { grant_id: "missing" };
  probe.behavior.ask = async context => JSON.stringify(await context.services!.directory!.read(request));
  return { ...probe, reading: (value: PluginDirectoryReadRequest) => { request = value; } };
}

async function fixture(t: Parameters<typeof serveHomeRuntime>[0]) {
  const a = directoryProbe("directorya"), b = directoryProbe("directoryb");
  let chosen: string | null = null, prompt = "", picks = 0;
  let choose = async () => chosen;
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [a.definition, b.definition] } }, { chooseDirectory: async title => {
    picks++; prompt = title ?? ""; const path = await choose(); return path ? { status: "picked", path } : { status: "cancelled" };
  } });
  await grantHomeProbe(f.host, a); await grantHomeProbe(f.host, b);
  const vault = join(f.home, "vault"), outside = join(f.home, "outside"); mkdirSync(vault); mkdirSync(outside);
  writeFileSync(join(vault, "inside.md"), "inside"); writeFileSync(join(outside, "secret.md"), "secret"); symlinkSync(outside, join(vault, "escape")); chosen = vault;
  const select = (prefix = "", body: unknown = { plugin_id: a.id }) => f.request(prefix + "/api/host/directory-grants", { method: "POST", body });
  const read = async (probe = a, caller = person(probe.permissions), project?: Awaited<ReturnType<typeof f.project>>) => JSON.parse(
    await (project ? f.host.actionClient(project.reference) : f.host.homeActionClient()).invoke<string>(caller, probe.ask, {})) as PluginDirectoryReadResult;
  return { ...f, a, b, vault, select, read, choice: (next: () => Promise<string | null>) => { choose = next; }, prompt: () => prompt, picks: () => picks };
}

test("SYS-15 S-47 OS selection is the only grant source; real Runtime reads reject traversal, symlinks and other identities", async t => {
  const f = await fixture(t);
  assert.equal((await f.select("", { path: f.home })).status, 400);
  assert.equal((await f.select("", { plugin_id: f.a.id, path: f.home })).status, 400);
  assert.equal(f.picks(), 0, "untrusted paths never reach the system picker");
  const response = await f.select(); assert.equal(response.status, 200, await response.clone().text());
  const grant = await response.json(); assert.equal(grant.root, realpathSync(f.vault)); assert.match(f.prompt(), /directorya/);
  f.a.reading({ grant_id: grant.grant_id, path: ["inside.md"], kind: "text" });
  assert.deepEqual(await f.read(), { outcome: "text", text: "inside", bytes: 6 });
  for (const path of [["..", "outside", "secret.md"], ["escape", "secret.md"], ["/etc"]]) {
    f.a.reading({ grant_id: grant.grant_id, path, kind: "text" }); assert.equal((await f.read()).outcome, "denied");
  }
  f.a.reading({ grant_id: grant.grant_id, path: ["inside.md"], kind: "bytes" });
  assert.deepEqual(await f.read(), { outcome: "bytes", data: Buffer.from("inside").toString("base64"), bytes: 6 });
  f.b.reading({ grant_id: grant.grant_id }); assert.equal((await f.read(f.b)).outcome, "denied");
  assert.equal((await f.read(f.a, { ...person(f.a.permissions), actor_id: "another-person" })).outcome, "denied");
  assert.equal((await f.a.contexts.at(-1)!.services!.directory!.read({ grant_id: grant.grant_id })).outcome, "denied", "outside a Runtime invocation");
  f.choice(async () => "relative"); assert.equal((await f.select()).status, 400);
  f.choice(async () => join(f.vault, "escape")); assert.equal((await f.select()).status, 400);
});

test("SYS-15 S-47 grants remain in the selected project and expire on deletion or activation restart", async t => {
  const f = await fixture(t), p = await f.project("Directory owner"), q = await f.project("Other project");
  const response = await f.select(`/projects/${p.project_id}`); assert.equal(response.status, 200, await response.clone().text());
  const grant = await response.json(); f.a.reading({ grant_id: grant.grant_id });
  assert.equal((await f.read(f.a, person(f.a.permissions, p.project_id), p)).outcome, "directory");
  assert.equal((await f.read(f.a, person(f.a.permissions, q.project_id), q)).outcome, "denied");
  assert.equal((await f.read()).outcome, "denied");
  await projectDeletedHooksFor(f.home).clear("directory-grants", p.project_id);
  assert.equal((await f.read(f.a, person(f.a.permissions, p.project_id), p)).outcome, "denied");
  const homeGrant = await (await f.select()).json(); f.a.reading({ grant_id: homeGrant.grant_id });
  await grantHomeProbe(f.host, f.a);
  assert.equal((await f.read()).outcome, "denied", "same installation id, different activation");
});

test("SYS-15 S-47 cancel, revoke and project deletion during selection cannot create a usable late grant", async t => {
  const f = await fixture(t);
  f.choice(async () => null); assert.deepEqual(await (await f.select()).json(), { status: "cancelled" });
  const entered = deferred(), release = deferred();
  f.choice(async () => { entered.resolve(); await release.promise; return f.vault; });
  const pending = f.select(); await entered.promise;
  const platform = await f.host.homePlugins!.ready(); platform.supervisor.revoke(f.a.id); release.resolve();
  assert.equal((await pending).status, 403);
  await platform.supervisor.enable(f.a.id);
  await grantHomeProbe(f.host, f.a);
  const project = await f.project("Deleted during selection"), began = deferred(), done = deferred();
  const service = directoryForHome(f.home);
  const waiting = service.select({ plugin_id: f.a.id, actor_id: person([]).actor_id, project_id: project.project_id }, async () => {
    began.resolve(); await done.promise; return { status: "picked", path: f.vault };
  });
  await began.promise; await projectDeletedHooksFor(f.home).clear("directory-grants", project.project_id); done.resolve();
  await assert.rejects(waiting, { code: "actions.forbidden" });
});

for (const invalidation of ["cancel", "revoke"] as const) {
  test(`SYS-15 S-47 ${invalidation} during real file I/O never delivers the buffered file`, async t => {
    const f = await fixture(t), grant = await (await f.select()).json(), entered = deferred(), release = deferred();
    f.a.reading({ grant_id: grant.grant_id, path: ["inside.md"], kind: "text" });
    const originalOpen = fs.open;
    t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
      const handle = await originalOpen(...args);
      if (String(args[0]) === join(realpathSync(f.vault), "inside.md")) {
        const originalRead = handle.read.bind(handle);
        t.mock.method(handle, "read", async (...input: Parameters<typeof handle.read>) => {
          const result = await originalRead(...input); entered.resolve(); await release.promise; return result;
        });
      }
      return handle;
    });
    syncBuiltinESMExports(); t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
    const controller = new AbortController();
    const pending = f.read(f.a, { ...person(f.a.permissions), signal: controller.signal });
    const rejected = assert.rejects(pending);
    try {
      await entered.promise;
      if (invalidation === "cancel") controller.abort(new Error("directory read cancelled"));
      else (await f.host.homePlugins!.ready()).supervisor.revoke(f.a.id);
    } finally { release.resolve(); }
    await rejected;
  });
}
