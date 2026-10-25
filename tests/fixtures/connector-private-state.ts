import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from "node:fs";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { connectorCliActions, connectorManagementActions, CONNECTOR_RECORDS_READ } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { createCliPackageFixture } from "./connector-cli-package.js";
import { openTestHome } from "./test-home.js";

const OWNER_READ_TIMEOUT_MS = 2500;

const caller: ActionCallContext = {
  actor_id: "private-state-test", runtime_session_id: "private-state-session", audience: "agent", project_id: null,
  permissions: ["connectors:management:read", "connectors:management:write", CONNECTOR_RECORDS_READ],
};

async function eventually(check: () => Promise<boolean>) {
  const until = Date.now() + 10_000;
  while (!await check()) {
    assert.ok(Date.now() < until, "the real CLI authorization did not reach its expected state");
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

/** The production prepared/install/start/bind/PTY/finish path; no direct installer or invented initialization. */
export async function connectedPrivateCli(t: TestContext) {
  const f = await openTestHome(t), home = realpathSync(f.home);
  const vaultPath = join(home, "feed", "secrets.json"), keyPath = join(home, "feed", "secrets.key");
  let observedBeforeDownload = false;
  const source = await createCliPackageFixture(t, home, async () => {
    const vault = JSON.parse(readFileSync(vaultPath, "utf8")) as { version: number; backend: string; entries: Record<string, string> };
    observedBeforeDownload = vault.version === 2 && vault.backend === "aes-gcm-file"
      && Object.keys(vault.entries).some(ref => ref.startsWith("connector-authorization:")) && readFileSync(keyPath).length > 0;
  });
  const actions = f.host.homeActionClient();
  const prepared = await actions.invoke(caller, connectorCliActions.prepare, source.input) as { authorization_id: string };
  const installed = await actions.invoke(caller, connectorCliActions.install, { authorization_id: prepared.authorization_id }) as { status: string };
  assert.equal(installed.status, "needs_person");
  assert.equal(observedBeforeDownload, true, "the existing production authorization must establish the original dependency before installing the CLI");
  const key = readFileSync(keyPath);
  const job = await f.web.post<{ job_id: string }>("/api/settings/connectors/methods/cli/login", { service_id: "vercel", setup_id: prepared.authorization_id });
  await eventually(async () => (await f.web.post<{ output: string }>("/api/settings/connectors/methods/cli/job", { job_id: job.job_id })).output.includes("Enter fixture login:"));
  await f.web.post("/api/settings/connectors/methods/cli/job", { job_id: job.job_id, input: "private-state-fixture-input" });
  await eventually(async () => (await actions.invoke(caller, connectorManagementActions.authorization,
    { authorization_id: prepared.authorization_id }) as { status: string }).status === "connected");
  await f.close(); await f.host.close();
  const vault = JSON.parse(readFileSync(vaultPath, "utf8")) as { version: number; backend: string; entries: Record<string, string> };
  assert.equal(vault.version, 2); assert.equal(vault.backend, "aes-gcm-file");
  assert.deepEqual(Object.keys(vault.entries), [], "finish must clear the last transient presentation");
  assert.equal(readFileSync(keyPath).equals(key), true, "the original platform key was retained");
  const installations = join(home, "runtime", "connectors", "installs"), ids = readdirSync(installations);
  assert.equal(ids.length, 1);
  const installationId = ids[0]!, directory = join(installations, installationId), privateHome = join(directory, ".home");
  assert.equal(readFileSync(join(privateHome, "identity"), "utf8"), "managed-account");
  return { home, directory, installationId, privateHome, vaultPath, keyPath, key };
}

/** Actual bytes/mode/mtime, and links without following them; reads deliberately do not compare atime. */
export function fileTree(directory: string): Record<string, { mode: number; mtime: number; bytes?: string; link?: string }> {
  const entries: ReturnType<typeof fileTree> = {};
  const visit = (current: string, relative: string) => {
    const info = lstatSync(current), entry = { mode: info.mode & 0o777, mtime: info.mtimeMs };
    if (info.isSymbolicLink()) entries[relative] = { ...entry, link: readlinkSync(current) };
    else if (info.isFile()) entries[relative] = { ...entry, bytes: readFileSync(current).toString("base64") };
    else {
      entries[relative] = entry;
      if (info.isDirectory()) for (const name of readdirSync(current).sort()) visit(join(current, name), relative ? relative + "/" + name : name);
    }
  };
  visit(directory, ""); return entries;
}

const CHILD = `import {captureConnectorPrivateState,preflightConnectorPrivateStateRestore} from '@molis-ai/molis-work-app-local-host';
import {readFileSync} from 'node:fs';
const [operation,home,file]=process.argv.slice(1);
process.once('message',()=>process.send({phase:'entered'},()=>{
  if(operation==='block'){readFileSync(file);return;}
  let answer;try{if(operation==='capture')captureConnectorPrivateState(home);else preflightConnectorPrivateStateRestore(home,JSON.parse(readFileSync(file,'utf8')));answer={phase:'succeeded'};}
  catch(error){answer={phase:'refused',code:typeof error?.code==='string'?error.code:'no-code'};}
  process.send(answer,()=>process.disconnect());
}));process.send({phase:'ready'});`;

/** Register before the Home fixture: every owned child closes before that fixture removes its files, including cancellation. */
export function privateStateChildren(t: TestContext) {
  const active = new Set<{ kill(): void; closed: Promise<unknown> }>();
  t.after(async () => { for (const entry of active) entry.kill(); await Promise.all([...active].map(entry => entry.closed)); });
  return { run: (operation: "capture" | "preflight" | "block", home: string, file: string) => privateStateChild(t, operation, home, file, entry => {
    active.add(entry); return () => active.delete(entry);
  }) };
}

/** An awaited public-entry child: the existing ready budget covers the operation and natural close, including a real blocking control. */
async function privateStateChild(t: TestContext, operation: "capture" | "preflight" | "block", home: string, file: string,
  retain: (entry: { kill(): void; closed: Promise<unknown> }) => () => void) {
  const child = spawn(process.execPath, ["--input-type=module", "-e", CHILD, operation, home, file], { stdio: ["ignore", "ignore", "pipe", "ipc"], env: process.env });
  let ready = false, entered = false, refused: string | null = null, timedOut = false, cancelled = false, error = false;
  let timer: NodeJS.Timeout | undefined, stderr = "";
  const kill = () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); };
  const abort = () => { cancelled = true; kill(); };
  const closed = new Promise<{ status: number | null; signal: NodeJS.Signals | null }>(resolve => child.once("close", (status, signal) => resolve({ status, signal })));
  const forget = retain({ kill, closed });
  t.signal.addEventListener("abort", abort, { once: true });
  child.once("error", () => { error = true; });
  assert.ok(child.stderr);
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-2000); });
  child.on("message", (message: { phase: string; code?: string }) => {
    if (timedOut || cancelled) return;
    if (message.phase === "ready" && !ready) {
      ready = true; timer = setTimeout(() => { timedOut = true; kill(); }, OWNER_READ_TIMEOUT_MS);
      child.send({ operation: "run" });
    } else if (message.phase === "entered") entered = true;
    else if (message.phase === "refused") refused = message.code ?? null;
  });
  if (t.signal.aborted) abort();
  try { return { ...await closed, ready, entered, refused, timedOut, cancelled, error, stderr }; }
  finally { clearTimeout(timer); t.signal.removeEventListener("abort", abort); kill(); await closed; forget(); }
}
