import assert from "node:assert/strict";
import { ChildProcess, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { effectsFromContract, sandboxPluginManifest, sandboxRequestedPermissions, sandboxOperationPermissions } from "@molis-ai/molis-work-plugin-sdk";
import { connectorPluginSlotActions, CONNECTOR_MANAGEMENT_WRITE, pluginInstallActions, readSandboxPackage, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { newPublisher, packageFiles, payloadOf, signedPackage, type PackageFiles } from "./fixtures/sandbox-package.js";
import { fixture, mac, operate, operationsOf, person, ref } from "./fixtures/home-sandbox.js";
import { serveTestHost } from "./fixtures/test-home.js";
import { signedResourceHttps } from "./fixtures/signed-resource-https.js";

const ID = "io.molis.work.example.resources";
const SCHEMA = "CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL UNIQUE);";
const DB = ["home-database:read", "home-database:write"], FILES = ["owner-files:read", "owner-files:write"];
const ALL = ["storage:private", ...DB, ...FILES, "connections:use", "materials:read", "materials:fetch", "materials:fetch_local", "materials:original"];
const CODE = `async function execute(cmd, sdk) {
  try {
    if (cmd.op === 'db.read') return await sdk.homeDatabase.all('SELECT text FROM notes ORDER BY id');
    if (cmd.op === 'db.write') return await sdk.homeDatabase.transaction(cmd.statements ?? [{ sql: 'INSERT INTO notes(text) VALUES (?)', parameters: [cmd.text] }]);
    if (cmd.op === 'files.read') return await sdk.ownerFiles.read(cmd.path ?? 'notes.txt');
    if (cmd.op === 'files.write') { await sdk.ownerFiles.write(cmd.changes); return 'written'; }
    if (cmd.op === 'connection') return await sdk.connections.request(cmd.slot ?? 'github', { url: cmd.url ?? 'https://api.github.com/user', method: cmd.method ?? 'GET', ...(cmd.record ? {record_key:cmd.record} : {}) });
    if (cmd.op === 'connection.release') { await sdk.connections.release('github', 'record'); return 'released'; }
    if (cmd.op === 'material.read') return await sdk.materials.readDocuments([{ file_name: 'note.txt', data_base64: cmd.bytes }]);
    if (cmd.op === 'material.fetch') return await sdk.materials.readSource(cmd.url);
    if (cmd.op === 'material.local') return await sdk.materials.readLocalPage(cmd.url);
    if (cmd.op === 'material.claim') { await sdk.materials.claimOriginal(cmd.key); return 'claimed'; }
    if (cmd.op === 'material.original') return Array.from((await sdk.materials.readOriginal(cmd.key)).bytes);
    return 'unknown command';
  } catch (error) { return { code: error.code ?? 'error', message: error.message }; }
}
export const operations = {
  'notes.list': async (input, sdk) => [{ id: 'result', text: input.command ? JSON.stringify(await execute(JSON.parse(input.command), sdk)) : (await sdk.storage.get('result')) ?? 'null' }],
  'notes.add': async (input, sdk) => { await sdk.storage.set('result', JSON.stringify(await execute(JSON.parse(input.text), sdk))); return true; },
};`;

function changeResources(files: PackageFiles, manifest: PluginManifest, options: { readonly?: boolean; services?: boolean; scope?: "project" | "home"; schema?: string; projectFiles?: boolean; binding?: "per_record" } = {}) {
  const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
  const read = contract.operations[0]!, write = contract.operations[1]!;
  read.input = { type: "object", properties: { command: { type: "string", maxLength: 600000 } }, required: [], additionalProperties: false };
  write.input = { type: "object", properties: { text: { type: "string", maxLength: 600000 } }, required: ["text"], additionalProperties: false };
  read.effects = { storage: ["read"], homeDatabase: ["read"], ownerFiles: ["read"] };
  write.effects = { storage: ["write"], homeDatabase: options.readonly ? ["read"] : ["read", "write"], ownerFiles: options.readonly ? ["read"] : ["read", "write"] };
  if (options.projectFiles) { delete read.effects.homeDatabase; delete write.effects.homeDatabase; }
  if (options.services) {
    read.effects.connections = ["github"]; write.effects.connections = ["github"];
    read.effects.materials = ["read"]; write.effects.materials = ["read", "fetch", "fetch_local", "original"];
    read.effects.networkDomains = write.effects.networkDomains = ["docs.t397.example"];
  }
  const rebuilt = sandboxPluginManifest({ pluginId: manifest.plugin_id, name: manifest.name, version: manifest.version, publisher: manifest.publisher, presentation: false,
    ...(options.projectFiles ? {} : { runtime: { scope: "home" } as const }), upgradesFrom: ["1.0.0"], effects: effectsFromContract(contract),
    ...(options.projectFiles ? {} : { homeDatabase: { version: 1, schema: options.schema ?? SCHEMA } }), ownerFiles: [{ name: "notes.txt", kind: "file" }, { name: "data", kind: "directory" }],
    ...(options.services ? { connections: { slots: [{ slot_id: "github", service_id: "github", reason: "查看本人账号", ...(options.binding ? { binding: options.binding } : {}) }] } } : {}) });
  Object.assign(manifest, rebuilt);
  if (options.scope === "project") delete manifest.runtime;
  files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract); files[SANDBOX_PACKAGE_FILES.entrypoint] = CODE;
}
const bundle = (publisher = newPublisher(), options: Parameters<typeof changeResources>[2] & { id?: string } = {}) =>
  signedPackage(publisher, (files, manifest) => changeResources(files, manifest, options), { pluginId: options.id ?? ID });

async function rig(t: TestContext) {
  const h = await fixture(t);
  let served = await serveTestHost(null, { home: h.home, host: h.host });
  t.after(() => served.close());
  const caller = (): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: null, permissions: ALL });
  const record = (id = ID) => h.host.homePlugins!.installation(id)!;
  const set = (permission: string, granted: boolean, id = ID) => served.web.post("/api/settings/plugin-permissions/set", { install_id: record(id).install_id, permission, granted });
  const approve = async (id = ID) => {
    const list = await served.web.post<{ plugins: Array<{ plugin_id: string; permissions: Array<{ permission: string; required: boolean; requested: boolean }> }> }>("/api/settings/plugin-permissions/list", {});
    for (const row of list.plugins.find(plugin => plugin.plugin_id === id)!.permissions) if (!row.required && row.requested) await set(row.permission, true, id);
  };
  const query = async (command?: Record<string, unknown>, id = ID, who = caller()) => {
    const client = h.homeClient(), views = await operationsOf(client, who, id);
    const [row] = await operate(client, who, views, "notes.list", command ? { command: JSON.stringify(command) } : {}) as Array<{ text: string }>;
    return JSON.parse(row!.text);
  };
  const call = async (command: Record<string, unknown>, id = ID, who = caller()) => {
    const client = h.homeClient(), views = await operationsOf(client, who, id);
    await operate(client, who, views, "notes.add", { text: JSON.stringify(command) }); return query(undefined, id);
  };
  return { h, record, set, approve, query, call, caller, origin: () => served.origin,
    project: (name: string) => served.createProject(name), projectSet: (projectId: string, input: unknown) => served.web.post(`/projects/${projectId}/api/plugin-trust/permissions/set`, input),
    install: (pkg = bundle()) => h.install(pkg),
    list: () => served.web.post<{ plugins: Array<{ plugin_id: string; permissions: Array<{ permission: string; requested: boolean; granted: boolean }> }> }>("/api/settings/plugin-permissions/list", {}),
    control: (action: string, keep_data?: boolean, id = ID) => served.web.post(`/api/settings/plugin-permissions/${action}`, { plugin_id: id, ...(keep_data === undefined ? {} : { keep_data }) }),
    async reopen() { await served.close(); await h.reopen(); served = await serveTestHost(null, { home: h.home, host: h.host }); } };
}
const writeFile = (text: string, path = "notes.txt", mode = "create") => ({ op: "files.write", changes: [{ op: "write", path, data_base64: Buffer.from(text).toString("base64"), mode }] });

test("RAC2865 real signed read-only resources distinguish Declared, Requested and operation grants; shape-only Host grants and a query's writes are refused", mac, async t => {
  const r = await rig(t), pkg = bundle(newPublisher(), { readonly: true });
  const { preview } = await r.install(pkg);
  const view = preview as typeof preview & { preview: { permissions: Array<{ permission: string; required: boolean; requested: boolean }> } };
  assert.deepEqual(view.preview.permissions.filter(row => [...DB, ...FILES].includes(row.permission)).map(row => [row.permission, row.required, row.requested]),
    [[DB[0], false, true], [DB[1], false, false], [FILES[0], false, true], [FILES[1], false, false]]);
  assert.deepEqual(r.record().grants, ["storage:private"]);
  assert.equal((await r.query({ op: "db.read" })).code, "actions.forbidden");
  await r.approve();
  assert.deepEqual(await r.query({ op: "db.read" }), []);
  assert.equal(await r.query({ op: "files.read" }), null);
  for (const permission of [DB[1]!, FILES[1]!]) await assert.rejects(r.set(permission, true), { code: "plugin.grant_denied" });
  assert.equal((await r.query({ op: "db.write", text: "forbidden" })).code, "sandbox.not_authorized");
  assert.equal((await r.call(writeFile("forbidden"))).code, "sandbox.not_authorized");
  assert.deepEqual(await r.query({ op: "db.read" }), []);
  await r.reopen();
  assert.equal(r.record().grants.some(permission => permission.endsWith(":write")), false);
  const rows = (await r.list()).plugins.find(plugin => plugin.plugin_id === ID)!.permissions;
  assert.equal(rows.find(row => row.permission === DB[1])!.requested, false);
  const project = await r.project("Requested project files"), client = r.h.host.actionClient(project.reference), who = person(project.project_id);
  const projectId = "io.molis.work.example.projectfiles397";
  const projectPreview = await client.invoke(who, ref(pluginInstallActions.preview), { bundle: bundle(newPublisher(), { id: projectId, readonly: true, projectFiles: true }) }) as { preview_id: string };
  await client.invoke(who, ref(pluginInstallActions.confirm), { preview_id: projectPreview.preview_id, consent: true, pin_label: "Project files" });
  const installed = await client.invoke(who, ref(pluginInstallActions.installed), {}) as { plugins: Array<{ plugin_id: string; install_id: string }> };
  const projectInstall = installed.plugins.find(plugin => plugin.plugin_id === projectId)!;
  await r.projectSet(project.project_id, { install_id: projectInstall.install_id, permission: FILES[0], granted: true });
  const projectCaller = { ...who, permissions: ["storage:private", FILES[0]!] };
  const projectViews = await operationsOf(client, projectCaller, projectId);
  assert.deepEqual(await operate(client, projectCaller, projectViews, "notes.list", { command: JSON.stringify({ op: "files.read" }) }), [{ id: "result", text: "null" }]);
  await assert.rejects(r.projectSet(project.project_id, { install_id: projectInstall.install_id, permission: FILES[1], granted: true }), { code: "plugin.grant_denied" });
});

test("RAC2866 RAC2870 real signed Home databases persist and remain isolated; invalid scope/names/DDL fail at preview before any owner record", mac, async t => {
  const r = await rig(t), publisher = newPublisher(), pkg = bundle(publisher);
  await r.install(pkg); await r.approve();
  assert.deepEqual(await r.call({ op: "db.write", text: "one" }), [{ changes: 1 }]);
  assert.equal((await r.query({ op: "db.write", text: "query cannot borrow write" })).code, "sandbox.not_authorized");
  const who = { ...r.caller(), permissions: ALL.filter(permission => permission !== DB[1]) }, client = r.h.homeClient();
  const available = await operationsOf(client, r.caller(), ID), write = available.find(view => view.action.local_id === "notes.add")!;
  await assert.rejects(client.invoke(who, { capability_id: write.capability_id, version: write.version, provider_id: write.provider.provider_id }, { text: JSON.stringify({ op: "db.write", text: "caller lacks write" }) }));
  assert.deepEqual(await r.query({ op: "db.read" }), [{ text: "one" }]);
  const second = ID + ".second"; await r.install(bundle(publisher, { id: second })); await r.approve(second);
  assert.deepEqual(await r.query({ op: "db.read" }, second), []);
  await r.call({ op: "db.write", text: "two" }, second);
  await r.reopen();
  assert.deepEqual(await r.query({ op: "db.read" }), [{ text: "one" }]);
  assert.deepEqual(await r.query({ op: "db.read" }, second), [{ text: "two" }]);
  const store = "sbxdb-" + createHash("sha256").update(ID).digest("hex").slice(0, 32);
  const ledger = new DatabaseSync(homeSqlitePath(r.h.home, "plugin-libraries"), { readOnly: true });
  assert.equal(ledger.prepare("SELECT publisher_signature FROM plugin_home_libraries WHERE plugin_id=?").get(ID)!.publisher_signature, publisher.identity); ledger.close();
  assert.equal(readFileSync(homeSqlitePath(r.h.home, store)).length > 0, true);
  await assert.rejects(r.install(bundle(newPublisher())), { code: "plugin.definition_conflict" });
  for (const wrong of [bundle(publisher, { id: ID + ".project", scope: "project" }), bundle(publisher, { id: ID + ".bad", schema: "CREATE TABLE own(id); ATTACH DATABASE '/tmp/forbidden' AS other;" })]) {
    await assert.rejects(r.install(wrong), { code: "plugin.declaration_invalid" });
  }
  await assert.rejects(r.install(bundle(publisher, { id: ID + ".foreign", schema: "CREATE TABLE own(id REFERENCES project_root(project_id));" })), { code: "plugin.project_database.declaration_invalid" });
  assert.deepEqual(await r.query({ op: "db.read" }), [{ text: "one" }]);
});

test("RAC2868 true signed slots use the person's existing service binding over controlled HTTPS, and materials read/fetch/local/original retain their real Host gates", mac, async t => {
  const tls = await signedResourceHttps(t), r = await rig(t), publisher = newPublisher();
  await r.install(bundle(publisher, { services: true })); await r.approve();
  const connection = withConnectorConnections(r.h.home, store => store.createToken({ serviceId: "github", displayName: "Isolated GitHub", token: "dummy-t397-resource-credential" }));
  await r.h.homeClient().invoke({ ...person(null), permissions: [CONNECTOR_MANAGEMENT_WRITE] }, ref(connectorPluginSlotActions.bind), {
    install_id: r.record().install_id, plugin_id: ID, slot_id: "github", service_id: "github", connection_id: connection.connection_id });
  await assert.rejects(r.h.homeClient().invoke({ ...person(null), permissions: [CONNECTOR_MANAGEMENT_WRITE] }, ref(connectorPluginSlotActions.bind), {
    install_id: r.record().install_id, plugin_id: ID, slot_id: "github", service_id: "gmail", connection_id: connection.connection_id }), { code: "connector.plugin_slots.slot_undeclared" });
  const result = await r.query({ op: "connection" });
  assert.equal(result.authenticated, true); assert.equal(JSON.parse(result.body).login, "resource-user");
  assert.equal(tls.seen.at(-1)!.authorized, true); assert.doesNotMatch(JSON.stringify(result), /dummy-t397-resource-credential|set-cookie/u);
  const sent = tls.seen.length;
  for (const [command, code] of [[{ op: "connection", slot: "wrong" }, "sandbox.not_authorized"], [{ op: "connection", method: "POST" }, "sandbox.not_authorized"],
    [{ op: "connection", url: "https://outside.t397.example/" }, "sandbox.host_service_error"], [{ op: "connection.release" }, "sandbox.not_authorized"]] as const) {
    assert.equal((await r.query(command)).code, code); assert.equal(tls.seen.length, sent);
  }
  // The runner intentionally hides Host error details; broker-owned refusals keep their specific sandbox code.
  assert.equal((await r.query({ op: "connection", url: "https://api.github.com/large" })).code, "sandbox.host_service_error");
  const words = "Text supplied by the signed package and read by the Host's document service.";
  assert.match(JSON.stringify(await r.query({ op: "material.read", bytes: Buffer.from(words).toString("base64") })), /Text supplied by the signed package/u);
  assert.match(JSON.stringify(await r.call({ op: "material.fetch", url: "https://docs.t397.example/article" })), /real article served through TLS/u);
  assert.equal((await r.call({ op: "material.fetch", url: "https://outside.t397.example/" })).code, "sandbox.not_authorized");
  assert.equal((await r.call({ op: "material.fetch", url: "https://docs.t397.example/redirect" })).code, "sandbox.host_service_error");
  const local = createServer((_request, response) => response.end(`<article>${tls.article}</article>`));
  await new Promise<void>(resolve => local.listen(0, "127.0.0.1", resolve));
  t.after(() => { local.closeAllConnections(); return new Promise<void>(resolve => local.close(() => resolve())); });
  const address = local.address(); assert.ok(address && typeof address === "object");
  assert.match(JSON.stringify(await r.call({ op: "material.local", url: `http://127.0.0.1:${address.port}/` })), /real article served through TLS/u);
  assert.equal((await r.call({ op: "material.local", url: r.origin() + "/" })).code, "sandbox.host_service_error");
  assert.equal((await r.call({ op: "material.claim", key: "missing-offer" })).code, "sandbox.host_service_error");
  const offered = join(r.h.home, "offered.txt"); writeFileSync(offered, "original only for this installation");
  const caller = { ...r.caller(), original_file: { path: offered, install_id: r.record().install_id } };
  assert.equal(await r.call({ op: "material.claim", key: "original" }, ID, caller), "claimed");
  assert.equal(Buffer.from(await r.call({ op: "material.original", key: "original" })).toString(), "original only for this installation");
  await r.set("connections:use", false);
  const count = tls.seen.length; assert.equal((await r.query({ op: "connection" })).code, "sandbox.host_service_error"); assert.equal(tls.seen.length, count);
  await r.reopen();
  assert.equal(Buffer.from(await r.call({ op: "material.original", key: "original" })).toString(), "original only for this installation");
  const isolated = ID + ".recordslot";
  await r.install(bundle(publisher, { id: isolated, services: true, binding: "per_record" })); await r.approve(isolated);
  assert.equal((await r.call({ op: "connection", record: "record" }, isolated)).code, "sandbox.host_service_error");
  assert.equal((await r.call({ op: "material.original", key: "original" }, isolated)).code, "sandbox.host_service_error");
});

test("RAC2867 a true signed Home transaction rolls back a real COMMIT refusal; losing a successful COMMIT reply remains trusted unknown and is never replayed", mac, async t => {
  const r = await rig(t);
  await r.install(bundle(newPublisher(), { schema: "CREATE TABLE parents(id INTEGER PRIMARY KEY); CREATE TABLE notes(id INTEGER PRIMARY KEY, text TEXT NOT NULL UNIQUE, parent INTEGER REFERENCES parents(id) DEFERRABLE INITIALLY DEFERRED);" }));
  await r.approve();
  const refusal = await r.call({ op: "db.write", statements: [
    { sql: "INSERT INTO notes(text) VALUES ('rolled back with COMMIT')", parameters: [] },
    { sql: "INSERT INTO notes(text,parent) VALUES ('deferred refusal',42)", parameters: [] },
  ] });
  assert.equal(refusal.code, "sandbox.database_error");
  assert.match(refusal.message, /FOREIGN KEY/iu);
  assert.deepEqual(await r.query({ op: "db.read" }), [], "the successful first statement rolled back with the refused COMMIT");
  await r.control("disable"); await r.control("enable");
  const emit = ChildProcess.prototype.emit;
  let dropped = false;
  ChildProcess.prototype.emit = function(event, ...values) {
    const reply = values[0] as { id?: number; ok?: boolean };
    // The fresh actual statement process answers open/BEGIN/two INSERTs/COMMIT, in that order. The real engine has committed before this reply.
    if (!dropped && event === "message" && this.spawnargs.some(arg => arg.endsWith("/project-statement-worker.js")) && reply?.id === 5 && reply.ok) {
      dropped = true; this.kill("SIGKILL"); return true;
    }
    return emit.call(this, event, ...values);
  };
  try {
    await assert.rejects(r.call({ op: "db.write", statements: [
      { sql: "INSERT INTO notes(text) VALUES ('unknown one')", parameters: [] }, { sql: "INSERT INTO notes(text) VALUES ('unknown two')", parameters: [] },
    ] }), { code: "actions.outcome_unknown" });
  } finally { ChildProcess.prototype.emit = emit; }
  assert.equal(dropped, true);
  assert.deepEqual(await r.query({ op: "db.read" }), [{ text: "unknown one" }, { text: "unknown two" }]);
  await r.call({ op: "db.write", text: "independent next" });
  assert.deepEqual(await r.query({ op: "db.read" }), [{ text: "unknown one" }, { text: "unknown two" }, { text: "independent next" }]);
});

test("RAC2869 true signed owner files survive keep/reinstall; links, traversal and oversize never change an external file, and discard cleanup can be retried", mac, async t => {
  const r = await rig(t), publisher = newPublisher(), pkg = bundle(publisher);
  await r.install(pkg); await r.approve();
  assert.equal(await r.call(writeFile("kept")), "written");
  assert.equal(Buffer.from((await r.query({ op: "files.read" })).data_base64, "base64").toString(), "kept");
  const beside = ID + ".files-beside";
  await r.install(bundle(publisher, { id: beside })); await r.approve(beside); await r.call(writeFile("beside"), beside);
  const otherFile = join(r.h.home, "plugin-files", r.record(beside).install_id, "files", "notes.txt");
  const external = mkdtempSync(join(tmpdir(), "t397-outside-")); t.after(() => rmSync(external, { recursive: true, force: true }));
  const sentinel = join(external, "sentinel"); writeFileSync(sentinel, "untouched");
  const owned = join(r.h.home, "plugin-files", r.record().install_id, "files", "notes.txt");
  for (const link of [() => symlinkSync(sentinel, owned), () => linkSync(sentinel, owned)]) {
    unlinkSync(owned); link();
    assert.equal((await r.call(writeFile("forbidden", "notes.txt", "replace"))).code, "sandbox.host_service_error");
    assert.equal(readFileSync(sentinel, "utf8"), "untouched");
    unlinkSync(owned); writeFileSync(owned, "kept");
  }
  unlinkSync(owned); execFileSync("mkfifo", [owned]);
  assert.equal((await r.call(writeFile("forbidden", "notes.txt", "replace"))).code, "sandbox.host_service_error");
  unlinkSync(owned); writeFileSync(owned, "kept");
  for (const path of ["../sentinel", "/etc/hosts", "undeclared.txt", `../../${r.record(beside).install_id}/files/notes.txt`]) assert.equal((await r.call(writeFile("forbidden", path))).code, "sandbox.host_service_error");
  assert.equal(readFileSync(otherFile, "utf8"), "beside");
  assert.equal((await r.call(writeFile("x".repeat(256 * 1024 + 1), "notes.txt", "replace"))).code, "sandbox.owner_file_too_large");
  assert.equal(readFileSync(owned, "utf8"), "kept");
  await r.control("uninstall", true); await r.install(pkg); await r.approve();
  assert.equal(Buffer.from((await r.query({ op: "files.read" })).data_base64, "base64").toString(), "kept");
  const installId = r.record().install_id;
  const parent = join(r.h.home, "plugin-files"), root = join(parent, installId), moved = parent + "-held";
  mkdirSync(join(external, installId));
  renameSync(parent, moved); symlinkSync(external, parent);
  await assert.rejects(r.control("uninstall", false), { code: "plugin.declaration_invalid" });
  const removed = (await r.h.host.homePlugins!.ready()).runtime.get(installId); assert.equal(removed.state, "uninstalled");
  assert.equal(r.h.host.homePlugins!.hasPackage(ID), false, "the retired row is not an ordinary package or an enable target");
  await assert.rejects(r.control("enable"), { code: "plugin.state_invalid" });
  assert.equal(readFileSync(sentinel, "utf8"), "untouched");
  unlinkSync(parent); renameSync(moved, parent); await r.reopen();
  assert.equal((await r.h.host.homePlugins!.ready()).runtime.get(installId).installation_generation, removed.installation_generation);
  await r.control("uninstall", false);
  assert.equal(existsSync(root), false);
  assert.equal(readFileSync(otherFile, "utf8"), "beside");
  assert.equal(readFileSync(sentinel, "utf8"), "untouched");
});

test("RAC2865 RAC2870 the SDK and saved-package reader use one deterministic resource projection and reject altered names, permissions, slots or entries", () => {
  const { files, manifest } = packageFiles(newPublisher().identity, (f, m) => changeResources(f, m, { readonly: true }), { pluginId: ID });
  const pkg = readSandboxPackage(payloadOf(manifest, files));
  assert.deepEqual(sandboxOperationPermissions(pkg.contract.operations[0]!.effects), ["storage:private", DB[0], FILES[0]]);
  assert.equal(sandboxRequestedPermissions(pkg.permissions).includes(DB[1]!), false);
  for (const mutate of [
    (m: PluginManifest) => { m.databases!.home!.store_name = "arbitrary"; },
    (m: PluginManifest) => { m.databases!.home!.write_permission = DB[0]!; },
    (m: PluginManifest) => { m.databases!.home!.partition = "project"; },
    (m: PluginManifest) => { m.owner_files = { ...m.owner_files!, store_name: "other" }; },
    (m: PluginManifest) => { m.owner_files = { ...m.owner_files!, entries: [{ name: "..", kind: "directory" }] }; },
    (m: PluginManifest) => { m.owner_files = { ...m.owner_files!, entries: [...m.owner_files!.entries, m.owner_files!.entries[0]!] }; },
  ]) { const changed = structuredClone(manifest); mutate(changed); assert.throws(() => readSandboxPackage(payloadOf(changed, files)), { code: "plugin.declaration_invalid" }); }
});
