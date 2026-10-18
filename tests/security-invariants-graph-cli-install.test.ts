import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, readFileSync, realpathSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, delimiter } from "node:path";
import { connectorCliActions, connectorManagementActions, connectorRecordActions, CONNECTOR_RECORDS_READ, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { openTestHome } from "./fixtures/test-home.js";

const caller: ActionCallContext = { actor_id: "graph-installer", audience: "agent", project_id: null,
  permissions: ["connectors:management:read", "connectors:management:write", CONNECTOR_RECORDS_READ] };

test("S-36 ASC-07 ASC-14 ASC-22: Graph uses its private module and login paths with a matching existing PowerShell, reads through the owner, and removes only its own files", { timeout: 30_000 }, async t => {
  const home = await openTestHome(t), tools = join(home.home, "user-tools"); mkdirSync(tools);
  const executable = join(tools, "pwsh"), previousPath = process.env.PATH, previousSecret = process.env.ASC_PRIVATE_HOST_VALUE, fetch = globalThis.fetch;
  writeFileSync(executable, `#!${realpathSync(process.execPath)}
import fs from 'node:fs';import path from 'node:path';
const command=process.argv.slice(2).join(' ');
if(command==='--version'){process.stdout.write('PowerShell 7.6.7');process.exit(0);}
if(process.env.ASC_PRIVATE_HOST_VALUE)process.exit(8);
const own=process.env.HOME,paths=(process.env.PSModulePath||'').split(path.delimiter),modules=paths[0];
if(!own||!modules.startsWith(path.dirname(own)+'/')||paths.length!==2||paths[1]!==path.join(path.dirname(process.argv[1]),'Modules'))process.exit(9);
fs.writeFileSync(path.join(own,'module-paths.json'),JSON.stringify(paths));
const installed=path.join(modules,'fixture-installed');
if(command.includes('Save-Module')){if(!command.includes('2.41.2')||!command.includes('PSGallery'))process.exit(10);fs.writeFileSync(installed,'module');}
else if(!fs.existsSync(installed))process.exit(2);
else if(command.includes('-Scopes'))fs.writeFileSync(path.join(own,'identity'),'graph-account');
else if(command.includes('Invoke-MgGraphRequest')){if(!fs.existsSync(path.join(own,'identity')))process.exit(3);process.stdout.write(JSON.stringify(command.includes('me/messages')?{value:[{subject:'owned Graph message'}]}:{id:'graph-account',name:'Graph account'}));}
else if(command.includes('Get-Module'))process.stdout.write('2.41.2');else process.exit(4);
`, { mode: 0o755 });
  mkdirSync(join(tools, "Modules")); writeFileSync(join(tools, "Modules/user-module"), "keep");
  process.env.PATH = tools + delimiter + (previousPath ?? ""); process.env.ASC_PRIVATE_HOST_VALUE = "must-not-reach-graph";
  t.after(() => { globalThis.fetch = fetch; if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath; if (previousSecret === undefined) delete process.env.ASC_PRIVATE_HOST_VALUE; else process.env.ASC_PRIVATE_HOST_VALUE = previousSecret; });
  let releaseReads = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith("https://api.github.com/")) {
      assert.equal(String(input), "https://api.github.com/repos/PowerShell/PowerShell/releases/tags/v7.6.7"); releaseReads++;
      const name = `powershell-7.6.7-${process.platform === "linux" ? "linux" : "osx"}-${process.arch}.tar.gz`;
      return Response.json({ tag_name: "v7.6.7", assets: [{ name, browser_download_url: `https://github.com/PowerShell/PowerShell/releases/download/v7.6.7/${name}`, digest: `sha256:${"a".repeat(64)}` }] });
    }
    assert.ok(String(input).startsWith(home.origin), "matching runtime must not download another PowerShell"); return fetch(input, init);
  };
  const actions = home.host.homeActionClient(), input = { service_id: "outlook", display_name: "Owned Graph", version: "2.41.2", runtime_version: "7.6.7" };
  await assert.rejects(actions.invoke(caller, connectorCliActions.prepare, { ...input, runtime_version: "latest" })); assert.equal(releaseReads, 0);
  const prepared = await actions.invoke(caller, connectorCliActions.prepare, input) as { authorization_id: string };
  const installed = await actions.invoke(caller, connectorCliActions.install, { authorization_id: prepared.authorization_id }) as { status: string }; assert.equal(installed.status, "needs_person");
  const directory = join(home.home, "runtime/connectors/installs", readdirSync(join(home.home, "runtime/connectors/installs"))[0]!);
  assert.deepEqual(JSON.parse(readFileSync(join(directory, ".home/module-paths.json"), "utf8")), [join(realpathSync(directory), "modules"), join(realpathSync(tools), "Modules")]);
  assert.equal(withConnectorConnections(home.home, store => store.list()).length, 0);
  await home.web.post("/api/settings/connectors/methods/cli/login", { service_id: "outlook", setup_id: prepared.authorization_id });
  const status = () => actions.invoke(caller, connectorManagementActions.authorization, { authorization_id: prepared.authorization_id }) as Promise<{ status: string; connection_id: string }>;
  const deadline = Date.now() + 10_000;
  while ((await status()).status !== "connected") { assert.ok(Date.now() < deadline, "the managed Graph login completes"); await new Promise(resolve => setTimeout(resolve, 20)); }
  const connection = (await status()).connection_id;
  assert.match(JSON.stringify(await actions.invoke(caller, connectorRecordActions.read, { connection_id: connection })), /owned Graph message/);
  await actions.invoke(caller, connectorManagementActions.control, { connection_id: connection, expected_revision: withConnectorConnections(home.home, store => store.require(connection).updated_at), action: "remove" });
  assert.equal(existsSync(directory), false); assert.equal(existsSync(executable), true); assert.equal(readFileSync(join(tools, "Modules/user-module"), "utf8"), "keep");
});
