import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, readFileSync, realpathSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { connectorCliActions, connectorManagementActions, connectorRecordActions, CONNECTOR_RECORDS_READ, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { openTestHome } from "./fixtures/test-home.js";

const caller: ActionCallContext = { actor_id: "cli-configurator", audience: "agent", project_id: null, permissions: ["connectors:management:read", "connectors:management:write", CONNECTOR_RECORDS_READ] };
const execute = promisify(execFile);
async function fixture(t: test.TestContext, service: string, repository: string, file: string, binary: string, script: string) {
  const home = await openTestHome(t), source = join(home.home, "native-source"); mkdirSync(source);
  writeFileSync(join(source, binary), `#!${realpathSync(process.execPath)}
import fs from 'node:fs';import path from 'node:path';
const own=process.env.HOME,args=process.argv.slice(2),command=args.join(' ');
if(args[0]==='--version'){process.stdout.write('fixture 1.2.3');process.exit(0);}
fs.appendFileSync(path.join(own,'arguments.jsonl'),JSON.stringify(args)+'\\n');
${script}`, { mode: 0o755 });
  const archive = join(home.home, "native.tgz"); await execute("/usr/bin/tar", ["-czf", archive, binary], { cwd: source });
  const bytes = readFileSync(archive), url = `https://github.com/${repository}/releases/download/v1.2.3/${file}`, fetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = fetch; });
  globalThis.fetch = async (input, init) => {
    if (String(input) === `https://api.github.com/repos/${repository}/releases/tags/v1.2.3`) return Response.json({ tag_name: "v1.2.3", assets: [{ name: file, browser_download_url: url, digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}` }] });
    if (String(input) === url) return new Response(new Uint8Array(bytes));
    assert.ok(String(input).startsWith(home.origin), "no external account request belongs to this fixture"); return fetch(input, init);
  };
  const prepared = await home.host.homeActionClient().invoke(caller, connectorCliActions.prepare, { service_id: service, display_name: "Private configuration", version: "1.2.3" }) as { authorization_id: string; url: string };
  await home.host.homeActionClient().invoke(caller, connectorCliActions.install, { authorization_id: prepared.authorization_id });
  const status = () => home.host.homeActionClient().invoke(caller, connectorManagementActions.authorization, { authorization_id: prepared.authorization_id }) as Promise<{ status: string; connection_id: string }>;
  return { ...home, prepared, status, directory: join(home.home, "runtime/connectors/installs", readdirSync(join(home.home, "runtime/connectors/installs"))[0]!) };
}
async function eventually(check: () => Promise<boolean>, message: string) {
  const until = Date.now() + 10_000;
  while (!await check()) { assert.ok(Date.now() < until, message); await new Promise(resolve => setTimeout(resolve, 20)); }
}

test("S-31 ASC-07 ASC-14 ASC-19: configuring a managed Lark-family client resumes the same PTY and still requires a separate account login", { timeout: 30_000 }, async t => {
  const home = await fixture(t, "feishu", "larksuite/cli", `lark-cli-1.2.3-${process.platform}-${process.arch === "x64" ? "amd64" : process.arch}.tar.gz`, "lark-cli", `
if(args[0]==='config'){
 if(command!=='config init --brand feishu')process.exit(9);
 process.stdout.write('Configure fixture app:');process.stdin.setRawMode(true);
 process.stdin.on('data',data=>{if(data.includes(13)){fs.writeFileSync(path.join(own,'configured'),'yes');process.exit(0);}});
}else if(args[0]==='auth'&&args[1]==='login'){
 if(!fs.existsSync(path.join(own,'configured')))process.exit(2);fs.writeFileSync(path.join(own,'identity'),'yes');
}else if(!fs.existsSync(path.join(own,'identity')))process.exit(3);
else if(args[0]==='auth')process.stdout.write(JSON.stringify({brand:'feishu',appId:'fixture-app',identities:{user:{available:true,verified:true,openId:'fixture-user',userName:'Configured user'}}}));
else if(args[0]==='calendar')process.stdout.write(JSON.stringify({events:[{title:'configured agenda'}]}));else process.exit(4);
`);
  assert.match(await (await fetch(home.origin + home.prepared.url)).text(), /data-cli-configure/);
  const job = await home.web.post<{ job_id: string }>("/api/settings/connectors/methods/cli/login", { service_id: "feishu", setup_id: home.prepared.authorization_id, configure: true });
  await eventually(async () => (await home.web.post<{ output: string }>("/api/settings/connectors/methods/cli/job", { job_id: job.job_id })).output.includes("Configure fixture app:"), "configuration prompt");
  assert.match(await (await fetch(home.origin + home.prepared.url)).text(), new RegExp(`data-cli-job="${job.job_id}"`));
  await home.web.post("/api/settings/connectors/methods/cli/job", { job_id: job.job_id, input: "configure" });
  await eventually(async () => (await home.web.post<{ status: string; operation: string }>("/api/settings/connectors/methods/cli/job", { job_id: job.job_id })).status === "succeeded", "configuration completes");
  assert.equal((await home.status()).status, "prepared"); assert.equal(withConnectorConnections(home.home, store => store.list()).length, 0);
  assert.doesNotMatch(await (await fetch(home.origin + home.prepared.url)).text(), /data-cli-job=/, "completed setup must not replay on every page reload");
  await home.web.post("/api/settings/connectors/methods/cli/login", { service_id: "feishu", setup_id: home.prepared.authorization_id });
  await eventually(async () => (await home.status()).status === "connected", "account login follows configuration");
  assert.match(JSON.stringify(await home.host.homeActionClient().invoke(caller, connectorRecordActions.read, { connection_id: (await home.status()).connection_id })), /configured agenda/);
});

test("S-31 ASC-07 ASC-14: X application credentials enter only the declared login environment and never process arguments, output or model status", { timeout: 30_000 }, async t => {
  const home = await fixture(t, "x", "xdevplatform/xurl", `xurl_${process.platform === "linux" ? "Linux" : "Darwin"}_${process.arch === "x64" ? "x86_64" : process.arch}.tar.gz`, "xurl", `
if(args[0]==='auth'){
 if(process.env.CLIENT_ID!=='fixture-x-app'||process.env.CLIENT_SECRET!=='fixture-x-private-secret')process.exit(2);
 process.stdout.write(process.env.CLIENT_SECRET+' Enter fixture login:');process.stdin.setRawMode(true);
 process.stdin.on('data',data=>{if(data.includes(13)){fs.writeFileSync(path.join(own,'identity'),'yes');process.exit(0);}});
}else if(!fs.existsSync(path.join(own,'identity')))process.exit(3);
else process.stdout.write(JSON.stringify({data:{id:'fixture-x-user',username:'fixture-x'}}));
`);
  const body = { service_id: "x", setup_id: home.prepared.authorization_id };
  await assert.rejects(home.web.post("/api/settings/connectors/methods/cli/login", { ...body, settings: { CLIENT_ID: "fixture-x-app" } }));
  await assert.rejects(home.web.post("/api/settings/connectors/methods/cli/login", { ...body, settings: { NODE_OPTIONS: "--require=untrusted" } }));
  const job = await home.web.post<{ job_id: string }>("/api/settings/connectors/methods/cli/login", { ...body, settings: { CLIENT_ID: "fixture-x-app", CLIENT_SECRET: "fixture-x-private-secret" } });
  await eventually(async () => {
    const result = await home.web.post<{ output: string }>("/api/settings/connectors/methods/cli/job", { job_id: job.job_id });
    assert.doesNotMatch(result.output, /fixture-x-private-secret/); return result.output.includes("Enter fixture login:");
  }, "declared environment reaches the official login command without echoing its value");
  assert.doesNotMatch(JSON.stringify(await home.status()), /fixture-x-app|fixture-x-private-secret/);
  assert.doesNotMatch(readFileSync(join(home.directory, ".home/arguments.jsonl"), "utf8"), /fixture-x-app|fixture-x-private-secret/);
  await home.web.post("/api/settings/connectors/methods/cli/job", { job_id: job.job_id, input: "continue" });
  await eventually(async () => (await home.status()).status === "connected", "login without retained environment completes through CLI-owned configuration");
});
