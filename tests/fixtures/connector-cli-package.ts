import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
export async function createCliPackageFixture(t: TestContext, home: string, beforeDownload?: () => Promise<void>) {
  // R-19: keep fixed probe events outside the installation, which a failed install may remove.
  const probeEvents = join(home, "cli-version-probe-events"); writeFileSync(probeEvents, "");
  const pkg = join(home, "package"); mkdirSync(pkg);
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "vercel", version: "1.2.3", bin: { vercel: "cli.mjs" } }));
  writeFileSync(join(pkg, "cli.mjs"), `#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
const own=process.env.HOME; const args=process.argv.slice(2);
if(args[0]==='--version'){
 fs.appendFileSync(${JSON.stringify(probeEvents)},'entered\\n');
 process.once('exit',()=>fs.appendFileSync(${JSON.stringify(probeEvents)},'exited\\n'));
}
if(process.env.ASC_PRIVATE_HOST_VALUE)process.exit(9);
if(fs.existsSync('.env'))process.exit(8);
fs.appendFileSync(path.join(own,'calls.jsonl'),JSON.stringify(args)+'\\n');
if(args[0]==='--version')process.stdout.write('Vercel CLI 1.2.3');
else if(args[0]==='login'){
 fs.writeFileSync(path.join(own,'login.pid'),String(process.pid));
 process.stdin.setRawMode(true);process.stdout.write('Enter fixture login:');
 process.stdin.on('data',data=>{process.stdout.write(data);if(data.includes(13)){fs.writeFileSync(path.join(own,'identity'),'managed-account',{mode:0o600});process.exit(0);}});
}else if(!fs.existsSync(path.join(own,'identity')))process.exit(2);
else if(args[0]==='whoami')process.stdout.write(fs.readFileSync(path.join(own,'identity')));
else if(args.join(' ')==='project ls --format=json')process.stdout.write(JSON.stringify({projects:[{name:'managed-client-project'}]}));
else process.exit(3);`, { mode: 0o755 });
  const archive = join(home, "cli.tgz"); await execute("/usr/bin/tar", ["-czf", archive, "package"], { cwd: home });
  const bytes = readFileSync(archive); let origin = "", downloads = 0;
  const server = createServer((request, response) => {
    if (request.url === "/cli.tgz") { downloads++; void Promise.resolve(beforeDownload?.()).then(() => response.writeHead(200).end(bytes)); return; }
    if (request.url?.startsWith("/vercel")) {
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ name: "vercel", versions: { "1.2.3": { name: "vercel", version: "1.2.3", bin: { vercel: "cli.mjs" }, dist: { tarball: `${origin}/cli.tgz`, shasum: createHash("sha1").update(bytes).digest("hex") } } } })); return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address === "object"); origin = `http://127.0.0.1:${address.port}`;
  return { input: { service_id: "vercel", display_name: "Managed Vercel", version: "1.2.3", runtime_version: process.versions.node, registry: origin }, downloads: () => downloads,
    versionProbeCounts: () => {
      const events = readFileSync(probeEvents, "utf8").split("\n");
      return { entered: events.filter(event => event === "entered").length, exited: events.filter(event => event === "exited").length };
    },
  };
}
