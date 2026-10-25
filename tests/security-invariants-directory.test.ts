import assert from "node:assert/strict";
import test from "node:test";
import { syncBuiltinESMExports } from "node:module";
import { promises as fs } from "node:fs";
import { mkdirSync, realpathSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
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
  const listed = () => directoryForHome(f.home).list();
  return { ...f, a, b, vault, select, read, listed, choice: (next: () => Promise<string | null>) => { choose = next; }, prompt: () => prompt, picks: () => picks };
}

test("S-72 SYS-15 OS selection is the only grant source; real Runtime reads reject traversal, symlinks and other identities", async t => {
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

// RAC-664: a new activation of the same installation (a restart, an upgrade) keeps the person's grant (user 2026-10-25, decision 3).
test("S-72 SYS-15 RAC-664 grants stay in the selected project, go with its deletion, and outlive a new activation", async t => {
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
  assert.equal((await f.read()).outcome, "directory", "same installation, new activation: the grant stands until the person takes it back");
});

test("S-72 SYS-15 cancel, revoke and project deletion during selection cannot create a usable late grant", async t => {
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

for (const invalidation of ["cancel", "revoke", "withdraw"] as const) {
  test(`S-72 SYS-15 RAC-662 ${invalidation} during real file I/O never delivers the buffered file`, async t => {
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
      else if (invalidation === "revoke") (await f.host.homePlugins!.ready()).supervisor.revoke(f.a.id);
      else assert.equal((await f.request(`/api/host/directory-grants/grant/${grant.grant_id}`, { method: "DELETE" })).status, 200);
    } finally { release.resolve(); }
    await rejected;
    assert.deepEqual(f.listed().flatMap(item => item.reads), [], "what was not delivered is not recorded");
  });
}

const notices = (home: string) => {
  const db = new DatabaseSync(join(home, "assistant", "assistant.db"));
  try { return db.prepare("SELECT body FROM assistant_notices WHERE kind = 'directory-read'").all().map(row => JSON.parse(String(row.body)) as { text: string }); }
  finally { db.close(); }
};

test("S-72 RAC-662 the person takes a grant back at once, and only on the platform's own page", async t => {
  const f = await fixture(t), grant = await (await f.select()).json(), p = await f.project("Grant list");
  f.a.reading({ grant_id: grant.grant_id });
  assert.equal((await f.read()).outcome, "directory");
  assert.equal((await f.select()).status, 200);
  assert.equal(f.listed().length, 1, "choosing the same folder again reuses the grant");
  for (const [path, method] of [[`/projects/${p.project_id}/api/host/directory-grants`, "GET"], [`/projects/${p.project_id}/api/host/directory-grants/grant/${grant.grant_id}`, "DELETE"]] as const) {
    assert.notEqual((await f.request(path, { method })).status, 200, `${method} from a project page`);
  }
  assert.equal((await f.request("/api/host/directory-grants/other/x", { method: "DELETE" })).status, 400);
  const listed = await (await f.request("/api/host/directory-grants")).json();
  assert.deepEqual(listed.grants.map((item: { grant_id: string; root: string }) => [item.grant_id, item.root]), [[grant.grant_id, realpathSync(f.vault)]]);
  assert.equal("install_id" in listed.grants[0] || "inode" in listed.grants[0], false, "the page is not given the binding's internals");
  assert.deepEqual(await (await f.request(`/api/host/directory-grants/grant/${grant.grant_id}`, { method: "DELETE" })).json(), { revoked: 1 });
  assert.equal((await f.read()).outcome, "denied", "taken back: refused at once");
  const again = await (await f.select()).json(); f.a.reading({ grant_id: again.grant_id });
  assert.notEqual(again.grant_id, grant.grant_id);
  assert.deepEqual(await (await f.request(`/api/host/directory-grants/plugin/${encodeURIComponent(f.a.id)}`, { method: "DELETE" })).json(), { revoked: 1 });
  assert.equal((await f.read()).outcome, "denied", "all of the plugin's taken back");
});

test("S-72 RAC-663 a background caller reads with the grant; every read is recorded and told, another person or plugin gets nothing", async t => {
  const f = await fixture(t), grant = await (await f.select()).json();
  f.a.reading({ grant_id: grant.grant_id, path: ["inside.md"], kind: "text" });
  assert.equal((await f.read()).outcome, "text");
  assert.equal((await f.read(f.a, { ...person(f.a.permissions), audience: "mcp", actor_id: "mcp-client" })).outcome, "text", "an MCP client acting for the person (user 2026-10-25, B)");
  f.a.reading({ grant_id: grant.grant_id, path: ["..", "outside", "secret.md"], kind: "text" });
  assert.equal((await f.read()).outcome, "denied", "outside the folder");
  f.a.reading({ grant_id: grant.grant_id, path: ["inside.md"], kind: "text" });
  assert.equal((await f.read(f.a, { ...person(f.a.permissions), actor_id: "another-person" })).outcome, "denied");
  f.b.reading({ grant_id: grant.grant_id, path: ["inside.md"], kind: "text" });
  assert.equal((await f.read(f.b)).outcome, "denied");
  const [listed] = f.listed();
  assert.equal(listed!.read_count, 3, "the refused callers left no read on the grant");
  assert.deepEqual(listed!.reads.map(read => [read.origin, read.caller, read.outcome]),
    [["person", person([]).actor_id, "denied"], ["mcp", "mcp-client", "text"], ["person", person([]).actor_id, "text"]]);
  const told = notices(f.home);
  assert.equal(told.length, 3, "one notice for each call that read");
  assert.match(told.map(notice => notice.text).join("\n"), /外部客户端（MCP）/);
  assert.doesNotMatch(JSON.stringify([listed, told]), /inside\.md|secret/, "no file names or content in the record or the notice");
});

test("S-72 RAC-665 a folder moved, swapped or replaced by a link is no longer the granted one", async t => {
  const f = await fixture(t), grant = await (await f.select()).json();
  f.a.reading({ grant_id: grant.grant_id });
  renameSync(f.vault, f.vault + "-moved"); mkdirSync(f.vault);
  assert.equal((await f.read()).outcome, "changed");
  assert.equal((await f.read()).outcome, "denied", "the changed grant is void");
  assert.deepEqual(f.listed(), []);
});

test("S-72 RAC-664 a disabled installation reads nothing, an uninstall takes its grants", async t => {
  const f = await fixture(t), grant = await (await f.select()).json();
  f.a.reading({ grant_id: grant.grant_id });
  const platform = await f.host.homePlugins!.ready();
  assert.equal((await f.request(`/api/plugins/${f.a.id}/disable`, { method: "POST", body: {} })).status, 200);
  await assert.rejects(f.read(), "a disabled plugin's action is not called");
  assert.equal(f.listed().length, 1, "the grant waits for the next activation");
  await platform.supervisor.enable(f.a.id); await grantHomeProbe(f.host, f.a);
  assert.equal((await f.read()).outcome, "directory");
  await platform.runtime.uninstall(f.host.homePlugins!.installation(f.a.id)!.install_id, { retain_private_data: true });
  assert.deepEqual(f.listed(), [], "kept data does not keep a directory grant");
});
