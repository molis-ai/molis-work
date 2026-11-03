import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { MolisWorkLocalHost, installManagedConnectorTool, removeManagedConnectorTool, connectLocalMcp, connectorManagementActions, connectorLocalActions, connectorSetupIntentAction, holdConnectorAuthorizationsForSession, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";
import { MCP_FIXTURE } from "./fixtures/mcp-notes-server.js";
import { acquireStorageOwner } from "@molis-ai/molis-work-storage";

const execute = promisify(execFile);
const caller: ActionCallContext = { actor_id: "install-person", runtime_session_id: "install-session", audience: "agent", project_id: null, permissions: ["connectors:management:read", "connectors:management:write", "mcp:external"] };
const control = { beforeEffect() {} };
/** Observe only this isolated test process's real children; the ps probe itself is excluded. */
function childProcessIds(): Promise<number[]> {
  return new Promise((resolve,reject)=>{
    const probe=execFile("ps",["-axo","pid=,ppid="],(error,output)=>{
      if(error){reject(error);return;}
      resolve(output.trim().split("\n").map(line=>line.trim().split(/\s+/).map(Number))
        .filter(([pid,parent])=>parent===process.pid&&pid!==probe.pid).map(([pid])=>pid!));
    });
  });
}
async function registry(t: test.TestContext, home: string, kind: "npm" | "python", beforeDownload?: () => Promise<void>) {
  const filename = kind === "npm" ? "package.tgz" : "molis_install_fixture-1.2.3-py3-none-any.whl";
  const bytes = readFileSync(join(home, filename)); let origin = "", downloads = 0;
  const server = createServer((request, response) => {
    if (request.url === `/${filename}`) { downloads++; void Promise.resolve(beforeDownload?.()).then(() => { response.writeHead(200, { "content-type": "application/octet-stream" }); response.end(bytes); }); return; }
    if (kind === "npm" && request.url?.startsWith("/molis-install-fixture")) {
      response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ name: "molis-install-fixture", versions: { "1.2.3": {
        name: "molis-install-fixture", version: "1.2.3", bin: { "molis-notes": "server.mjs" }, dist: { tarball: `${origin}/${filename}`, shasum: createHash("sha1").update(bytes).digest("hex") },
      } } })); return;
    }
    if (kind === "python" && request.url?.startsWith("/simple/molis-install-fixture")) { response.writeHead(200, { "content-type": "text/html" }); response.end(`<a href="${origin}/${filename}">${filename}</a>`); return; }
    response.writeHead(404).end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== "string"); origin = `http://127.0.0.1:${address.port}`;
  return { url: kind === "npm" ? origin : `${origin}/simple/`, downloads: () => downloads };
}

async function useInstalled(t: test.TestContext, home: Awaited<ReturnType<typeof openTestHome>>, installed: Awaited<ReturnType<typeof installManagedConnectorTool>>, tool: string) {
  const work = join(home.home, "business-files"); mkdirSync(work);
  const connected = await connectLocalMcp(home.home, { displayName: "Installed MCP", installationId: installed.id, environment: {},
    launch: { executable: installed.executable, runtime_path: installed.runtime_path, args: [], cwd: work, environment_names: [] } }, controlWithDispatch());
  await home.host.homeActionClient().invoke(caller, connectorManagementActions.check, { connection_id: connected.connectionId });
  const ref = { capability_id: `mcp.connector.${connected.connectionId}.${tool}`, version: 1, provider_id: `system.connectors#mcp:${connected.connectionId}` };
  await home.host.homeActionClient().invoke(caller, ref, { note: "installed package really ran" });
  assert.deepEqual(JSON.parse(readFileSync(join(work, "mcp-notes.jsonl"), "utf8").trim()), { note: "installed package really ran" });
  removeManagedConnectorTool(home.home, installed.id); assert.equal(existsSync(installed.directory), true, "an active connection owns this installation reference");
  const revision = withConnectorConnections(home.home, store => store.require(connected.connectionId).updated_at);
  await home.host.homeActionClient().invoke(caller, connectorManagementActions.remove, { connection_id: connected.connectionId, expected_revision: revision });
  removeManagedConnectorTool(home.home, installed.id);
  assert.equal(existsSync(installed.directory), false); assert.equal(existsSync(join(work, "mcp-notes.jsonl")), true);
  assert.equal(existsSync(installed.runtime_path[0]!), installed.source.kind === "npm", "shared Node stays; a connection's private Python environment is removed");
  t.diagnostic(`${installed.source.kind} package installed, called and removed through the actual owner paths`);
}
const controlWithDispatch = () => ({ beforeDispatch() {} });

test("ASC-06 ASC-17: a pinned npm MCP installs with real npm, skips lifecycle scripts, actually runs, and preserves business files on removal", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), pkg = join(home.home, "package"); mkdirSync(pkg);
  writeFileSync(join(pkg, "server.mjs"), `#!/usr/bin/env node\n${MCP_FIXTURE}`, { mode: 0o755 });
  const marker = join(home.home, "install-script-ran");
  writeFileSync(join(pkg, "postinstall.cjs"), `require('node:fs').writeFileSync(${JSON.stringify(marker)},'unexpected');`);
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "molis-install-fixture", version: "1.2.3", bin: { "molis-notes": "server.mjs" },
    scripts: { postinstall: "node postinstall.cjs" } }));
  await execute("/usr/bin/tar", ["-czf", join(home.home, "package.tgz"), "package"], { cwd: home.home });
  const source = await registry(t, home.home, "npm");
  const input = { kind: "npm" as const, package: "molis-install-fixture", version: "1.2.3", bin: "molis-notes", node_version: process.versions.node, registry: source.url };
  const installed = await installManagedConnectorTool(home.home, input, control);
  assert.ok(source.downloads() > 0); assert.equal(existsSync(marker), false);
  assert.ok(existsSync(join(installed.directory, "package-lock.json")));
  const before = readdirSync(join(home.home, "runtime/connectors/installs"));
  await assert.rejects(installManagedConnectorTool(home.home, { ...input, bin: "missing-command" }, control), /没有提供所选命令/);
  assert.deepEqual(readdirSync(join(home.home, "runtime/connectors/installs")), before, "a failed candidate removes only its own files");
  await useInstalled(t, home, installed, "record_review_note");
});

test("ASC-06 ASC-17: a pinned Python MCP installs into a real isolated environment and runs without global package changes", { timeout: 60_000 }, async t => {
  await execute("uv", ["--version"]); // This local integration test requires uv; it must not bootstrap from the public internet.
  const home = await openTestHome(t), python = await execute("python3", ["-c", "import sys;print('.'.join(map(str,sys.version_info[:3])))"]);
  const code = `import sys,json,pathlib\ndef main():\n for line in sys.stdin:\n  m=json.loads(line)\n  if 'id' not in m: continue\n  if m['method']=='initialize': r={'protocolVersion':m['params']['protocolVersion'],'capabilities':{'tools':{}},'serverInfo':{'name':'python-fixture','version':'1'}}\n  elif m['method']=='tools/list': r={'tools':[{'name':'record','inputSchema':{'type':'object','properties':{'note':{'type':'string'}},'required':['note'],'additionalProperties':False}}]}\n  elif m['method']=='tools/call':\n   with open('mcp-notes.jsonl','a') as f: f.write(json.dumps(m['params']['arguments'])+'\\n')\n   r={'content':[{'type':'text','text':'Saved'}]}\n  else: continue\n  print(json.dumps({'jsonrpc':'2.0','id':m['id'],'result':r}),flush=True)\n`;
  const files = { "molis_install_fixture.py": code,
    "molis_install_fixture-1.2.3.dist-info/METADATA": "Metadata-Version: 2.1\nName: molis-install-fixture\nVersion: 1.2.3\n",
    "molis_install_fixture-1.2.3.dist-info/WHEEL": "Wheel-Version: 1.0\nRoot-Is-Purelib: true\nTag: py3-none-any\n",
    "molis_install_fixture-1.2.3.dist-info/entry_points.txt": "[console_scripts]\nmolis-notes=molis_install_fixture:main\n" };
  writeFileSync(join(home.home, "wheel-files.json"), JSON.stringify(files));
  await execute("python3", ["-c", "import json,zipfile,sys;f=json.load(open(sys.argv[1]));f['molis_install_fixture-1.2.3.dist-info/RECORD']=''.join(k+',,\\n' for k in f);z=zipfile.ZipFile(sys.argv[2],'w');[z.writestr(k,v) for k,v in f.items()];z.close()", join(home.home, "wheel-files.json"), join(home.home, "molis_install_fixture-1.2.3-py3-none-any.whl")]);
  const source = await registry(t, home.home, "python");
  const requestedPython = process.env.MOLIS_WORK_TEST_PYTHON_VERSION ?? python.stdout.trim();
  const installed = await installManagedConnectorTool(home.home, { kind: "python", package: "molis-install-fixture", version: "1.2.3", bin: "molis-notes", python_version: requestedPython, registry: source.url }, control);
  const interpreter = realpathSync(join(installed.directory, ".venv/bin/python"));
  if (requestedPython === python.stdout.trim()) {
    const original = (await execute("python3", ["-c", "import os,sys;print(os.path.realpath(sys.executable))"])).stdout.trim();
    assert.equal(interpreter, original, "an exact existing interpreter is reused, including one outside the installer's clean PATH");
  }
  assert.equal((await execute(interpreter, ["--version"])).stdout.trim(), `Python ${requestedPython}`);
  assert.ok(source.downloads() > 0); assert.match(readFileSync(join(installed.directory, "requirements.lock"), "utf8"), /molis-install-fixture==1.2.3/);
  await useInstalled(t, home, installed, "record");
  assert.equal(existsSync(interpreter), true, "removing a tool never removes its shared or system interpreter");
});

async function packagePlan(t: test.TestContext, home: string, beforeDownload?: () => Promise<void>) {
  const pkg = join(home, "package"); mkdirSync(pkg);
  writeFileSync(join(pkg, "server.mjs"), `#!/usr/bin/env node\n${MCP_FIXTURE}`, { mode: 0o755 });
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "molis-install-fixture", version: "1.2.3", bin: { "molis-notes": "server.mjs" } }));
  await execute("/usr/bin/tar", ["-czf", join(home, "package.tgz"), "package"], { cwd: home });
  const server = await registry(t, home, "npm", beforeDownload);
  return { display_name: "Prepared package", expected_revision: null as string | null,
    source: { kind: "npm", package: "molis-install-fixture", version: "1.2.3", bin: "molis-notes", node_version: process.versions.node, registry: server.url },
    args: [], cwd: realpathSync(home), environment_names: [] };
}

test("ASC-17 ASC-19 ASC-34: managed update failures preserve the active package; held candidates cancel or replace without leaked installs", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), input = await packagePlan(t, home.home), actions = home.host.homeActionClient();
  const prepare = (value: typeof input & { connection_id?: string }) => actions.invoke(caller, connectorLocalActions.prepare, value) as Promise<{ authorization_id: string }>;
  const run = (id: string) => actions.invoke(caller, connectorLocalActions.execute, { authorization_id: id }) as Promise<{ status: string; connectionId: string; awaiting_intent?: boolean }>;
  const directories = () => readdirSync(join(home.home, "runtime/connectors/installs"));
  const original = await run((await prepare(input)).authorization_id), owned = directories(); assert.equal(owned.length, 1);
  const revision = () => withConnectorConnections(home.home, store => store.require(original.connectionId).updated_at);
  const update = { ...input, connection_id: original.connectionId, expected_revision: revision() };
  const failed = await prepare({ ...update, source: { ...input.source, bin: "not-a-command" } });
  await assert.rejects(run(failed.authorization_id), /没有提供/); assert.deepEqual(directories(), owned); assert.equal(revision(), update.expected_revision);
  const submitHeld = async (id: string) => {
    const held = await run(id);
    assert.equal(held.status, "pending"); assert.equal(held.awaiting_intent, true);
    assert.deepEqual(directories(), owned, "the model cannot install against the changed intent"); assert.equal(revision(), update.expected_revision);
    const submitted = await home.web.post<{ status: string; awaiting_intent?: boolean }>("/api/settings/connectors/methods/local/connect", { setup_id: id, environment: {} });
    assert.equal(submitted.status, "pending"); assert.equal(submitted.awaiting_intent, true);
    assert.equal(directories().length, 2, "the person's completed candidate is held without replacing the active package"); assert.equal(revision(), update.expected_revision);
  };
  const discarded = await prepare(update); holdConnectorAuthorizationsForSession(home.home, caller.runtime_session_id!, caller.actor_id, "cancel-version");
  await submitHeld(discarded.authorization_id);
  await actions.invoke(caller, connectorManagementActions.cancel, { authorization_id: discarded.authorization_id });
  assert.deepEqual(directories(), owned); assert.equal(revision(), update.expected_revision);
  const kept = await prepare(update); holdConnectorAuthorizationsForSession(home.home, caller.runtime_session_id!, caller.actor_id, "keep-version");
  await submitHeld(kept.authorization_id);
  await actions.invoke(caller, connectorSetupIntentAction, { authorization_id: kept.authorization_id, intent_revision: "keep-version", decision: "retain" });
  assert.equal(directories().length, 1); assert.notDeepEqual(directories(), owned);
  await actions.invoke(caller, { capability_id: `mcp.connector.${original.connectionId}.record_review_note`, version: 1, provider_id: `system.connectors#mcp:${original.connectionId}` }, { note: "updated package" });
  await actions.invoke(caller, connectorManagementActions.remove, { connection_id: original.connectionId, expected_revision: revision() });
  assert.deepEqual(directories(), []); assert.deepEqual(JSON.parse(readFileSync(join(home.home, "mcp-notes.jsonl"), "utf8")), { note: "updated package" });
});

test("S-36 ASC-25: cancelling during a real package download terminates its installer and removes only its candidate", { timeout: 30_000 }, async t => {
  const home = await openTestHome(t), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const input = await packagePlan(t, home.home, async () => { entered.resolve(); await release.promise; }), actions = home.host.homeActionClient();
  const request = await actions.invoke(caller, connectorLocalActions.prepare, input) as { authorization_id: string };
  const running = actions.invoke(caller, connectorLocalActions.execute, { authorization_id: request.authorization_id });
  const rejected = assert.rejects(running);
  try {
    await entered.promise;
    await actions.invoke(caller, connectorManagementActions.cancel, { authorization_id: request.authorization_id });
    await rejected;
    assert.deepEqual(readdirSync(join(home.home, "runtime/connectors/installs")), []);
    assert.deepEqual(withConnectorConnections(home.home, store => store.list()), []);
    const status = await actions.invoke(caller, connectorManagementActions.authorization, { authorization_id: request.authorization_id }) as { status: string };
    assert.equal(status.status, "cancelled");
  } finally { release.resolve(); }
});

test("ASC-15 ASC-19 ASC-22: a failed MCP installation survives Host restart, retries verification without downloading, and remains cancellable", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), input = await packagePlan(t, home.home); let actions = home.host.homeActionClient();
  // The fixture starts only after a prerequisite file appears in its chosen working directory.
  const file = join(home.home, "package/server.mjs");
  writeFileSync(file, `#!/usr/bin/env node\nimport {existsSync} from 'node:fs';if(!existsSync('prerequisite-ready'))process.exit(2);\n${MCP_FIXTURE}`, { mode: 0o755 });
  await execute("/usr/bin/tar", ["-czf", join(home.home, "package.tgz"), "package"], { cwd: home.home });
  const served = await registry(t, home.home, "npm"); input.source.registry = served.url;
  const request = await actions.invoke(caller, connectorLocalActions.prepare, input) as { authorization_id: string };
  const run = () => actions.invoke(caller, connectorLocalActions.execute, { authorization_id: request.authorization_id });
  await assert.rejects(run(), /安装与方案已保留/);
  assert.equal(withConnectorConnections(home.home, store => store.list().length), 0);
  const installed = readdirSync(join(home.home, "runtime/connectors/installs")); assert.equal(installed.length, 1);
  const downloads = served.downloads();
  const state = await actions.invoke(caller, connectorManagementActions.authorization, { authorization_id: request.authorization_id }) as { status: string; installation_ready?: boolean };
  assert.equal(state.status, "failed"); assert.equal(state.installation_ready, true);
  await home.close(); await home.host.close();
  const restored = new MolisWorkLocalHost({ homeDirectory: home.home, completeText: null });
  const server = await serveTestHost(null, { home: home.home, host: restored });
  try {
  actions = restored.homeActionClient();
  const reopened = await actions.invoke(caller, connectorManagementActions.authorization, { authorization_id: request.authorization_id }) as { status: string; installation_ready?: boolean };
  assert.equal(reopened.status, "failed"); assert.equal(reopened.installation_ready, true);
  writeFileSync(join(home.home, "prerequisite-ready"), "ready");
  const result = await run() as { status: string; connectionId: string };
  assert.equal(result.status, "connected"); assert.equal(served.downloads(), downloads);
  assert.deepEqual(readdirSync(join(home.home, "runtime/connectors/installs")), installed);
  assert.deepEqual(await actions.invoke(caller, connectorLocalActions.cleanup, { installation_id: installed[0] }), { status: "in-use" });
  unlinkSync(join(home.home, "prerequisite-ready"));
  const failed = await actions.invoke(caller, connectorLocalActions.prepare, { ...input, display_name: "Failure retained for cancellation" }) as { authorization_id: string };
  await assert.rejects(actions.invoke(caller, connectorLocalActions.execute, { authorization_id: failed.authorization_id }), /安装与方案已保留/);
  assert.equal(readdirSync(join(home.home, "runtime/connectors/installs")).length, 2);
  await actions.invoke(caller, connectorManagementActions.cancel, { authorization_id: failed.authorization_id });
  assert.deepEqual(readdirSync(join(home.home, "runtime/connectors/installs")), installed);
  } finally { await server.close(); await restored.close(); }
});


test("ASC-19 ASC-25: closing the Host interrupts a protected-page package install and leaves no late connection or child", { timeout: 30_000 }, async t => {
  // RAC-105-A-20: keep the Web open and the real npm download blocked; Host.close must break that dependency cycle.
  const home = await openTestHome(t), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const input = await packagePlan(t, home.home, async () => { entered.resolve(); await release.promise; });
  const request = await home.host.homeActionClient().invoke(caller, connectorLocalActions.prepare, input) as { authorization_id: string };
  const before=new Set(await childProcessIds());
  const running = home.web.post("/api/settings/connectors/methods/local/connect", { setup_id: request.authorization_id, environment: {} });
  const rejected = assert.rejects(running);
  try {
    await entered.promise;
    const installers=(await childProcessIds()).filter(pid=>!before.has(pid));
    assert.ok(installers.length>0,"a real installer process is blocked in the package download");
    assert.throws(()=>acquireStorageOwner(join(home.home,"agent-runtime")),{code:"storage.owner.busy"});
    await home.host.close(); await rejected;
    for(const pid of installers)assert.throws(()=>process.kill(pid,0),{code:"ESRCH"},"Host.close waits for the installer child to exit");
    const released=acquireStorageOwner(join(home.home,"agent-runtime"));released.release();
    release.resolve();await new Promise<void>(resolve=>setImmediate(resolve));
    assert.deepEqual(readdirSync(join(home.home, "runtime/connectors/installs")), []);
    assert.deepEqual(withConnectorConnections(home.home, store => store.list()), []);
  } finally { release.resolve(); }
});
