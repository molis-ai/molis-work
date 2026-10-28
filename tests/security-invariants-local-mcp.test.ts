import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { connectLocalMcp, connectorLocalActions, connectorManagementActions, connectorProtocolSecrets, withConnectorConnections, withConnectorProtocols, type ConnectorProtocolConfiguration } from "@molis-ai/molis-work-app-local-host";
import { openTestHome } from "./fixtures/test-home.js";

const caller: ActionCallContext = { actor_id: "local-mcp-person", audience: "agent", project_id: null,
  permissions: ["connectors:management:read", "connectors:management:write", "mcp:external"] };
const source = `import {createInterface} from 'node:readline';
import {appendFileSync,writeFileSync} from 'node:fs';
if(process.env.ASC_PARENT_PRIVATE||process.env.SERVICE_KEY!=='fixture-local-credential')process.exit(3);
writeFileSync('child-pid',String(process.pid));
for await(const line of createInterface({input:process.stdin})){const m=JSON.parse(line);if(m.id===undefined)continue;let result;
if(m.method==='initialize')result={protocolVersion:m.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'local-fixture',version:'1.0.0'}};
else if(m.method==='tools/list')result={tools:[{name:'record',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false}}]};
else if(m.method==='tools/call'){appendFileSync('calls.jsonl',JSON.stringify(m.params.arguments)+'\\n');if(m.params.arguments.text==='hold')await new Promise(r=>setTimeout(r,120000));result={content:[{type:'text',text:'Recorded: '+m.params.arguments.text}]};}
else {process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'Unsupported'}})+'\\n');continue;}
process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');}
`;
function input(home: string) {
  writeFileSync(join(home, "local.mjs"), source);
  return { displayName: "Local notes", launch: { executable: realpathSync(process.execPath), args: ["local.mjs"], cwd: realpathSync(home), environment_names: ["SERVICE_KEY"] },
    environment: { SERVICE_KEY: "fixture-local-credential" } };
}
const calls = (home: string) => existsSync(join(home, "calls.jsonl")) ? readFileSync(join(home, "calls.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line)) : [];
const reference = (id: string) => ({ capability_id: `mcp.connector.${id}.record`, version: 1, provider_id: `system.connectors#mcp:${id}` });
async function waitFor(check: () => boolean) { const end = Date.now() + 5000; while (!check() && Date.now() < end) await delay(20); assert.equal(check(), true); }

test("ASC-06 ASC-14: actual local stdio setup, discovery and one directory call keep credentials out of metadata and inherited environment", async t => {
  const home = await openTestHome(t), plan = input(home.home);
  const original = process.env.ASC_PARENT_PRIVATE; process.env.ASC_PARENT_PRIVATE = "must-not-inherit";
  try {
    const result = await connectLocalMcp(home.home, plan, { beforeDispatch() {} });
    assert.equal(result.status, "connected"); assert.equal(result.tools[0]?.name, "record"); assert.deepEqual(calls(home.home), []);
    await home.host.homeActionClient().invoke(caller, connectorManagementActions.check, { connection_id: result.connectionId });
    const output = await home.host.homeActionClient().invoke(caller, reference(result.connectionId), { text: "one approved note" });
    assert.match(JSON.stringify(output), /one approved note/); assert.deepEqual(calls(home.home), [{ text: "one approved note" }]);
    const listed = await home.host.homeActionClient().invoke(caller, connectorManagementActions.list, {});
    assert.doesNotMatch(JSON.stringify(listed), /fixture-local-credential|SERVICE_KEY|must-not-inherit/);
    const pid = Number(readFileSync(join(home.home, "child-pid"), "utf8"));
    await waitFor(() => { try { process.kill(pid, 0); return false; } catch { return true; } });
  } finally { if (original === undefined) delete process.env.ASC_PARENT_PRIVATE; else process.env.ASC_PARENT_PRIVATE = original; }
});

test("ASC-15 ASC-17 ASC-19: a failed local update preserves the working configuration; stale revisions cannot start a replacement", async t => {
  const home = await openTestHome(t), plan = input(home.home);
  const result = await connectLocalMcp(home.home, plan, { beforeDispatch() {} });
  const original = withConnectorConnections(home.home, store => store.require(result.connectionId));
  writeFileSync(join(home.home, "bad.mjs"), "process.stderr.write('fixture-local-credential');process.exit(3);");
  await assert.rejects(connectLocalMcp(home.home, { ...plan, connectionId: result.connectionId, expectedRevision: original.updated_at,
    launch: { ...plan.launch, args: ["bad.mjs"] } }, { beforeDispatch() {} }), error => error instanceof Error && /未完成启动/.test(error.message) && !error.message.includes("fixture-local-credential"));
  assert.deepEqual(withConnectorConnections(home.home, store => store.require(result.connectionId)), original);
  await home.host.homeActionClient().invoke(caller, connectorManagementActions.check, { connection_id: result.connectionId });
  await home.host.homeActionClient().invoke(caller, reference(result.connectionId), { text: "old remains usable" });
  withConnectorConnections(home.home, store => store.rename(result.connectionId, "Renamed"));
  let dispatched = false;
  await assert.rejects(connectLocalMcp(home.home, { ...plan, connectionId: result.connectionId, expectedRevision: original.updated_at }, { beforeDispatch() { dispatched = true; } }));
  assert.equal(dispatched, false); assert.deepEqual(calls(home.home), [{ text: "old remains usable" }]);
});

test("S-36 ASC-25: revoked or cancelled local setup never commits, and disabled connections stop their actual child", async t => {
  const home = await openTestHome(t), plan = input(home.home);
  await assert.rejects(connectLocalMcp(home.home, plan, { beforeDispatch() { throw new ActionError("actions.forbidden", "Revoked"); } }));
  assert.equal(existsSync(join(home.home, "child-pid")), false);
  const controller = new AbortController(); let checks = 0;
  await assert.rejects(connectLocalMcp(home.home, plan, { signal: controller.signal, beforeDispatch() { if (++checks === 2) controller.abort(); } }));
  assert.equal(withConnectorConnections(home.home, store => store.list().length), 0); assert.deepEqual(calls(home.home), []);
  const result = await connectLocalMcp(home.home, plan, { beforeDispatch() {} });
  await home.host.homeActionClient().invoke(caller, connectorManagementActions.check, { connection_id: result.connectionId });
  const running = home.host.homeActionClient().invoke(caller, reference(result.connectionId), { text: "hold" });
  const refused = assert.rejects(running); await waitFor(() => calls(home.home).length === 1);
  const pid = Number(readFileSync(join(home.home, "child-pid"), "utf8"));
  withConnectorConnections(home.home, store => store.setEnabled(result.connectionId, false));
  await refused; await waitFor(() => { try { process.kill(pid, 0); return false; } catch { return true; } });
  await assert.rejects(home.host.homeActionClient().invoke(caller, reference(result.connectionId), { text: "must not run" }));
  assert.deepEqual(calls(home.home), [{ text: "hold" }]);
});

const LOADER_FAMILIES = {
  Java: ["JAVA_TOOL_OPTIONS", "JAVA_HOME", "_JAVA_OPTIONS", "CLASSPATH"], JDK: ["JDK_JAVA_OPTIONS"],
  Python: ["PYTHONPATH", "PYTHONUSERBASE", "PYTHONSTARTUP"], Perl: ["PERL5OPT", "PERL5LIB"], Ruby: ["RUBYOPT", "RUBYLIB"],
  Node: ["NODE_OPTIONS", "NODE_PATH", "NODE_EXTRA_CA_CERTS"],
  // RAC-1350 (BL-181): one more name per family than that line lists, so a passing case proves the prefix is refused rather
  // than the names themselves. Zsh and glibc take a single name each; .NET, PHP, Lua and npm are prefix families.
  Zsh: ["ZDOTDIR"], Glibc: ["GCONV_PATH"],
  ".NET": ["DOTNET_STARTUP_HOOKS", "DOTNET_ADDITIONAL_DEPS"],
  PHP: ["PHPRC", "PHP_INI_SCAN_DIR"],
  Lua: ["LUA_INIT", "LUA_INIT_5_4", "LUA_PATH"],
  npm: ["NPM_CONFIG_SCRIPT_SHELL", "NPM_CONFIG_PREFIX"],
};
// The fixture's own key goes along, and every loader name gets a value node itself accepts, so a launch that got past the rule would start
// and write child-pid.
const withLoader = (plan: ReturnType<typeof input>, name: string) => ({ ...plan, launch: { ...plan.launch, environment_names: ["SERVICE_KEY", name] },
  environment: { ...plan.environment, [name]: "--no-warnings" } });
for (const [family, names] of Object.entries(LOADER_FAMILIES)) {
  test(`S-36 local launch refuses the ${family} loader environment by its prefix before executing`, async t => {
    const home = await openTestHome(t), plan = input(home.home);
    for (const name of names) {
      await assert.rejects(connectLocalMcp(home.home, withLoader(plan, name), { beforeDispatch() {} }), { code: "connector.mcp.configuration" }, name);
      assert.equal(existsSync(join(home.home, "child-pid")), false, name);
    }
  });
}

test("S-36 preparing a local launch refuses every loader family by the same prefix rule", async t => {
  const home = await openTestHome(t), plan = input(home.home), actions = home.host.homeActionClient();
  for (const name of Object.values(LOADER_FAMILIES).flat())
    await assert.rejects(actions.invoke(caller, connectorLocalActions.prepare, { display_name: "Loader", expected_revision: null,
      source: { kind: "executable", executable: plan.launch.executable }, args: plan.launch.args, cwd: plan.launch.cwd, environment_names: [name] }), { code: "connector.mcp.configuration" }, name);
});

test("S-36 ASC-14: local launch rejects relative executables and loader environment injection before executing", async t => {
  const home = await openTestHome(t), plan = input(home.home);
  const reserved = ["NODE_OPTIONS", "JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS", "RUBYOPT", "PERL5OPT"];
  for (const launched of [{ ...plan, launch: { ...plan.launch, executable: "node" } }, ...reserved.map(name => withLoader(plan, name))]) {
    await assert.rejects(connectLocalMcp(home.home, launched, { beforeDispatch() {} }), /程序、参数/);
    assert.equal(existsSync(join(home.home, "child-pid")), false);
  }
});

test("RAC-1351 credential-looking names that are not loader families still launch and are discovered", async t => {
  const home = await openTestHome(t), plan = input(home.home);
  const accepted = { ...plan, launch: { ...plan.launch, environment_names: ["SERVICE_KEY", "NPM_TOKEN", "PHOTO_API_KEY"] },
    environment: { ...plan.environment, NPM_TOKEN: "fixture-npm-token", PHOTO_API_KEY: "fixture-photo-key" } };
  const result = await connectLocalMcp(home.home, accepted, { beforeDispatch() {} });
  assert.equal(result.status, "connected");
  assert.equal(existsSync(join(home.home, "child-pid")), true, "the child started despite the credential-looking names");
  assert.deepEqual(result.tools.map(tool => tool.name), ["record"]);
});

test("RAC-1352 a stored local connection carrying a newly refused loader name is refused on launch by both the management check and its registered tool, before any child starts", async t => {
  const home = await openTestHome(t), plan = input(home.home);
  const connected = await connectLocalMcp(home.home, plan, { beforeDispatch() {} });
  // Read it once while the configuration is still valid, so its tool is registered; the launch below is a real second launch.
  await home.host.homeActionClient().invoke(caller, connectorManagementActions.check, { connection_id: connected.connectionId });
  const childPid = join(home.home, "child-pid");
  assert.equal(existsSync(childPid), true, "the checked connection launched once");
  rmSync(childPid);
  // The stored connection predates the rule: give it a loader name and its stored value the way an older setup would have.
  const readProtocol = () => withConnectorProtocols(home.home, store => store.get<ConnectorProtocolConfiguration & { launch: { environment_names: string[] } }>(connected.connectionId));
  const beforeProtocol = readProtocol();
  const beforeSecrets = connectorProtocolSecrets(home.home, connected.connectionId).get("environment");
  const launch = beforeProtocol?.launch;
  assert.ok(launch, "the stored protocol config exists");
  withConnectorProtocols(home.home, store => store.save({ ...beforeProtocol!, launch: { ...launch, environment_names: [...launch.environment_names, "NPM_CONFIG_PREFIX"] } }));
  const values = JSON.parse(beforeSecrets ?? "{}") as Record<string, string>;
  connectorProtocolSecrets(home.home, connected.connectionId).put("environment", JSON.stringify({ ...values, NPM_CONFIG_PREFIX: "--prefix=/tmp/old" }));
  const storedProtocol = readProtocol();
  const storedSecrets = connectorProtocolSecrets(home.home, connected.connectionId).get("environment");
  const storedConnection = withConnectorConnections(home.home, store => store.require(connected.connectionId));
  // 先红：改正则之前这两条路都会真的拉起子进程（把新名字放行），所以两条「没有新子进程」都会先红。
  const checked = await home.host.homeActionClient().invoke(caller, connectorManagementActions.check, { connection_id: connected.connectionId })
    .then(() => undefined, (error: unknown) => error);
  assert.equal(existsSync(childPid), false, "the management check starts no child");
  assert.ok(checked instanceof ActionError, "the management check is refused");
  assert.equal(checked.code, "connector.mcp.configuration");
  // Each path proves the refusal changed nothing on its own: the management check's own inspection observations are not one of the three.
  assert.deepEqual(calls(home.home), [], "the management check reaches no business call");
  assert.deepEqual(readProtocol(), storedProtocol, "the management check leaves the stored protocol configuration unchanged");
  assert.deepEqual(connectorProtocolSecrets(home.home, connected.connectionId).get("environment"), storedSecrets,
    "the management check leaves the stored credential value unchanged");
  assert.deepEqual(withConnectorConnections(home.home, store => store.require(connected.connectionId)), storedConnection,
    "the management check leaves the connection record unchanged");
  const called = await home.host.homeActionClient().invoke(caller, reference(connected.connectionId), { text: "must not run" })
    .then(() => undefined, (error: unknown) => error);
  assert.equal(existsSync(childPid), false, "the registered tool starts no child either");
  assert.ok(called instanceof ActionError, "the tool call is refused");
  assert.equal(called.code, "actions.connection_unavailable", "the tool call sees the wrapper's code; the inner refusal is the declared configuration one");
  assert.deepEqual(calls(home.home), [], "no business tool call reached the child");
  assert.deepEqual(readProtocol(), storedProtocol, "the stored protocol configuration is unchanged");
  assert.deepEqual(connectorProtocolSecrets(home.home, connected.connectionId).get("environment"), storedSecrets, "the stored credential value is unchanged");
  assert.deepEqual(withConnectorConnections(home.home, store => store.require(connected.connectionId)), storedConnection, "the connection record is unchanged");
});
