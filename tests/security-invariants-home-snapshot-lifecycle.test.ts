import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
import { lstat, readFile, readdir, rm } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createDesktopWebHost } from "@molis-ai/molis-work-app-desktop";
import { attachHostPresence, createHomeSnapshot, createMolisWorkLocalHost, HOME_MAINTENANCE_PATH, readHostEndpoint } from "@molis-ai/molis-work-app-local-host";
import { acquireStorageOwner } from "@molis-ai/molis-work-storage";
import { smallSnapshotHome, snapshotBusinessFingerprint } from "./fixtures/home-snapshot-small.js";
import { createSingleHomeTestWebServer } from "./fixtures/local-web-core.js";

test("RAC-105-S-02: an idle real Host refuses the actual CLI before any backup file is created", { timeout: 30_000 }, async t => {
  const f = await smallSnapshotHome(t), host = createMolisWorkLocalHost({ homeDirectory: f.home, completeText: null });
  try {
    const before = await snapshotBusinessFingerprint(f.home);
    const result = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../apps/desktop/launchers/cli/main.ts", import.meta.url)),
      "home", "snapshot", "--home", f.home, "--to", f.snapshot, "--json"], { env: process.env, encoding: "utf8", timeout: 15_000 });
    assert.equal(result.status, 1, result.stderr); assert.equal(result.stdout, ""); assert.match(result.stderr, /占用|所有权|使用/u);
    assert.equal(fs.existsSync(f.snapshot), false);
    assert.deepEqual((await readdir(f.area)).filter(name => name.startsWith(".molis-home-snapshot-")), []);
    assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
  } finally { await host.close(); }
});

test("RAC-105-S-02: a second real process cannot start a Host while snapshot owns the original inode", { timeout: 30_000 }, async t => {
  // T405-FULL-07: initialize a valid product Home before testing the snapshot's exclusive ownership.
  const f = await smallSnapshotHome(t), initialized = createMolisWorkLocalHost({ homeDirectory: f.home, completeText: null });
  await initialized.close();
  await f.file("images/assets/kept.bin");
  const original = fs.writeSync; let attempts = 0;
  const peer = `import{createMolisWorkLocalHost}from'@molis-ai/molis-work-app-local-host';let host;try{host=createMolisWorkLocalHost({homeDirectory:process.argv[1]});process.stdout.write(JSON.stringify({state:'entered'}));}catch(error){process.stdout.write(JSON.stringify({state:'refused',code:error.code}));}finally{await host?.close();}`;
  const mocked = t.mock.method(fs, "writeSync", (...args: unknown[]): number => {
    if (attempts++ === 0) {
      const result = spawnSync(process.execPath, ["--input-type=module", "--eval", peer, f.home], { env: process.env, encoding: "utf8", timeout: 15_000 });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), { state: "refused", code: "storage.owner.busy" });
    }
    return Reflect.apply(original, fs, args);
  });
  syncBuiltinESMExports();
  try { assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created"); }
  finally { mocked.mock.restore(); syncBuiltinESMExports(); }
  assert.ok(attempts > 0, "the second process actually attempted startup inside the payload-write boundary");
  const lock = join(f.home, "agent-runtime", ".molis-runtime-owner.db"), before = (await lstat(lock)).ino;
  const owner = acquireStorageOwner(join(f.home, "agent-runtime")); owner.release();
  assert.equal((await lstat(lock)).ino, before);
});

test("RAC-109-S-05: a real payload I/O failure and cancellation clean staging, preserve source, and permit retry", { timeout: 30_000 }, async t => {
  for (const failure of ["write", "cancel"] as const) await t.test(failure, async t => {
    const f = await smallSnapshotHome(t); await f.file("images/assets/kept.bin");
    const before = await snapshotBusinessFingerprint(f.home), abort = new AbortController(), original = fs.writeSync;
    let injected = false;
    const mocked = t.mock.method(fs, "writeSync", (...args: unknown[]): number => {
      if (!injected) { injected = true; if (failure === "write") throw new Error("fixture payload ENOSPC"); abort.abort(new Error("fixture capture cancelled")); }
      return Reflect.apply(original, fs, args);
    });
    syncBuiltinESMExports();
    try { await assert.rejects(createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot, signal: abort.signal }), /fixture/u); }
    finally { mocked.mock.restore(); syncBuiltinESMExports(); }
    assert.equal(injected, true); assert.equal(fs.existsSync(f.snapshot), false);
    assert.deepEqual((await readdir(f.area)).filter(name => name.startsWith(".molis-home-snapshot-")), []);
    assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
    assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created");
  });
});

test("RAC-109-S-05: a post-rename parent flush failure explicitly retains the published result", async t => {
  const f = await smallSnapshotHome(t); await f.file("images/assets/kept.bin");
  const parent = await lstat(f.area), original = fs.fsyncSync;
  let injected = false;
  const mocked = t.mock.method(fs, "fsyncSync", (fd: number) => {
    const info = fs.fstatSync(fd);
    if (info.dev === parent.dev && info.ino === parent.ino) { injected = true; throw new Error("fixture parent flush failure"); }
    original(fd);
  });
  syncBuiltinESMExports();
  try { await assert.rejects(createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot }), { code: "host.home_snapshot.published_unconfirmed" }); }
  finally { mocked.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(injected, true); assert.ok(JSON.parse(await readFile(join(f.snapshot, "manifest.json"), "utf8")).stores.length);
  assert.deepEqual((await readdir(f.area)).filter(name => name.startsWith(".molis-home-snapshot-")), []);
});

test("RAC-109-S-05: a competing destination created during capture is preserved and the private stage is removed", async t => {
  const f = await smallSnapshotHome(t); await f.file("images/assets/kept.bin");
  const original = fs.writeSync; let competed = false;
  const mocked = t.mock.method(fs, "writeSync", (...args: unknown[]): number => {
    if (!competed) { competed = true; fs.mkdirSync(f.snapshot); fs.writeFileSync(join(f.snapshot, "keep"), "competing owner"); }
    return Reflect.apply(original, fs, args);
  });
  syncBuiltinESMExports();
  try { await assert.rejects(createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot }), { code: "host.home_snapshot.destination_exists" }); }
  finally { mocked.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(competed, true); assert.equal(await readFile(join(f.snapshot, "keep"), "utf8"), "competing owner");
  assert.deepEqual((await readdir(f.area)).filter(name => name.startsWith(".molis-home-snapshot-")), []);
});

test("RAC-109-S-05: a source file changed during capture never produces a successful mixed snapshot", async t => {
  const f = await smallSnapshotHome(t), source = await f.file("images/assets/kept.bin", Buffer.alloc(2 * 1024 * 1024, 0x41));
  const original = fs.writeSync; let changed = false;
  const mocked = t.mock.method(fs, "writeSync", (...args: unknown[]): number => {
    const written = Reflect.apply(original, fs, args);
    if (!changed) { changed = true; fs.appendFileSync(source, "late external mutation"); }
    return written;
  });
  syncBuiltinESMExports();
  try { await assert.rejects(createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot }), /稳定.*普通文件/u); }
  finally { mocked.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(changed, true); assert.equal(fs.existsSync(f.snapshot), false);
  assert.deepEqual((await readdir(f.area)).filter(name => name.startsWith(".molis-home-snapshot-")), []);
  assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created");
});

test("RAC-105-S-02 RAC-109-S-05: SIGKILL releases ownership and leaves only an unpublished private stage", { timeout: 30_000 }, async t => {
  let cleanup: () => Promise<unknown> = async () => undefined;
  t.after(() => cleanup());
  const f = await smallSnapshotHome(t); await f.file("images/assets/kept.bin");
  const before = await snapshotBusinessFingerprint(f.home);
  const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./fixtures/home-snapshot-paused-cli.ts", import.meta.url)), f.home, f.snapshot],
    { env: process.env, stdio: ["ignore", "ignore", "pipe", "ipc"] });
  let stderr = ""; child.stderr!.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => child.once("close", (code, signal) => resolve({ code, signal })));
  const kill = () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); };
  const abort = () => kill(); t.signal.addEventListener("abort", abort, { once: true });
  cleanup = async () => { kill(); await closed; t.signal.removeEventListener("abort", abort); };
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { kill(); reject(new Error("snapshot never reached payload write: " + stderr)); }, 10_000);
      child.once("message", value => { clearTimeout(timer); assert.deepEqual(value, { phase: "payload-write" }); resolve(); });
      child.once("error", reject);
      void closed.then(value => { clearTimeout(timer); reject(new Error("snapshot child exited before barrier: " + JSON.stringify(value) + stderr)); });
    });
    const lock = join(f.home, "agent-runtime", ".molis-runtime-owner.db"), identity = await lstat(lock), directory = await lstat(join(f.home, "agent-runtime"));
    assert.throws(() => acquireStorageOwner(join(f.home, "agent-runtime")), { code: "storage.owner.busy" });
    kill(); assert.equal((await closed).signal, "SIGKILL"); assert.equal(fs.existsSync(f.snapshot), false);
    const stages = (await readdir(f.area)).filter(name => name.startsWith(".molis-home-snapshot-"));
    assert.equal(stages.length, 1); assert.equal(fs.existsSync(join(f.area, stages[0]!, "manifest.json")), false);
    assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
    await rm(join(f.area, stages[0]!), { recursive: true });
    assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created");
    assert.equal((await lstat(lock)).ino, identity.ino); assert.equal((await lstat(join(f.home, "agent-runtime"))).ino, directory.ino);
  } finally { kill(); await closed; }
});

test("102-2 S-07: live resident Host serves online CLI home snapshot via control gateway and refuses unauthenticated, foreign, mismatched, or impostor requests", { timeout: 60_000 }, async t => {
  const f = await smallSnapshotHome(t);
  const server: Server = createSingleHomeTestWebServer({ homeDirectory: f.home });
  attachHostPresence(server, f.home);
  await new Promise<void>(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
  t.after(() => new Promise<void>(resolveClose => { server.closeAllConnections(); server.close(() => resolveClose()); }));
  const token = (await readFile(join(f.home, "config", "web-control-token"), "utf8")).trim();
  await f.file("images/assets/kept.bin");
  const endpoint = readHostEndpoint(f.home);
  assert.ok(endpoint, "resident Host writes run/endpoint.json once listening");
  const origin = `http://127.0.0.1:${endpoint.port}`;
  const homeId = createHash("sha256").update(resolve(f.home)).digest("hex");

  // S-07 refusals on /api/internal/home-maintenance: missing token, foreign Origin, wrong home_id, extra field, in-Home destination.
  const missingToken = await fetch(origin + HOME_MAINTENANCE_PATH, {
    method: "POST",
    headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": "k-no-token" },
    body: JSON.stringify({ action: "snapshot", home_id: homeId, destination: join(f.area, "refused-1") }),
  });
  assert.equal(missingToken.status, 403);
  const foreignOrigin = await fetch(origin + HOME_MAINTENANCE_PATH, {
    method: "POST",
    headers: { origin: "https://evil.example", "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": "k-foreign" },
    body: JSON.stringify({ action: "snapshot", home_id: homeId, destination: join(f.area, "refused-2") }),
  });
  assert.equal(foreignOrigin.status, 403);
  const wrongHome = await fetch(origin + HOME_MAINTENANCE_PATH, {
    method: "POST",
    headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": "k-wrong-home" },
    body: JSON.stringify({ action: "snapshot", home_id: "0".repeat(64), destination: join(f.area, "refused-3") }),
  });
  assert.equal((await wrongHome.json() as { code?: string }).code, "actions.home_mismatch");
  const extraField = await fetch(origin + HOME_MAINTENANCE_PATH, {
    method: "POST",
    headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": "k-extra" },
    body: JSON.stringify({ action: "snapshot", home_id: homeId, destination: join(f.area, "refused-4"), extra: true }),
  });
  assert.equal(extraField.status, 400);
  const insideHome = await fetch(origin + HOME_MAINTENANCE_PATH, {
    method: "POST",
    headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": "k-inside" },
    body: JSON.stringify({ action: "snapshot", home_id: homeId, destination: join(f.home, "inside-snapshot") }),
  });
  assert.equal(insideHome.status, 400);
  const relativeDest = await fetch(origin + HOME_MAINTENANCE_PATH, {
    method: "POST",
    headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": "k-relative" },
    body: JSON.stringify({ action: "snapshot", home_id: homeId, destination: "relative-snapshot" }),
  });
  assert.equal(relativeDest.status, 400);
  for (const name of ["refused-1", "refused-2", "refused-3", "refused-4"]) assert.equal(fs.existsSync(join(f.area, name)), false);
  assert.equal(fs.existsSync(join(f.home, "inside-snapshot")), false);

  const runCli = (args: string[], env: NodeJS.ProcessEnv) => new Promise<{ status: number | null; stdout: string; stderr: string }>((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../apps/desktop/launchers/cli/main.ts", import.meta.url)), ...args], { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.once("error", rejectRun);
    child.once("close", status => resolveRun({ status, stdout, stderr }));
  });

  // Impostor server at MOLIS_WORK_WEB_URL must be rejected at HMAC /health?challenge= without leaking control token or falling back offline.
  let impostorSawToken = false;
  const impostor = createHttpServer((req, res) => {
    if (req.headers["x-molis-work-control-token"]) impostorSawToken = true;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", process_id: process.pid, desktop_tui: true }));
  });
  await new Promise<void>(resolveListen => impostor.listen(0, "127.0.0.1", resolveListen));
  t.after(() => new Promise<void>(resolveClose => { impostor.closeAllConnections(); impostor.close(() => resolveClose()); }));
  const impostorAddr = impostor.address();
  assert.ok(impostorAddr && typeof impostorAddr === "object");
  const impostorCli = await runCli(
    ["home", "snapshot", "--home", f.home, "--to", join(f.area, "impostor-snapshot"), "--json"],
    { ...process.env, MOLIS_WORK_TEST: "1", MOLIS_WORK_WEB_URL: `http://127.0.0.1:${impostorAddr.port}` },
  );
  assert.equal(impostorCli.status, 1, impostorCli.stderr);
  assert.equal(impostorSawToken, false, "control token must never be sent to an unauthenticated impostor");
  assert.equal(fs.existsSync(join(f.area, "impostor-snapshot")), false);

  // Genuine CLI forwards via verified resident Host and creates an integrity-checked, secret-free online snapshot.
  const cliEnv: NodeJS.ProcessEnv = { ...process.env, MOLIS_WORK_TEST: "1" };
  delete cliEnv.MOLIS_WORK_WEB_URL;
  const onlineCli = await runCli(
    ["home", "snapshot", "--home", f.home, "--to", f.snapshot, "--json"],
    cliEnv,
  );
  assert.equal(onlineCli.status, 0, onlineCli.stderr);
  const created = JSON.parse(onlineCli.stdout) as { status: string; snapshot_directory: string; databases: number };
  assert.equal(created.status, "created");
  assert.ok(created.databases >= 1, "online snapshot captures SQLite databases");
  const manifest = JSON.parse(await readFile(join(f.snapshot, "manifest.json"), "utf8")) as { stores: Array<{ entries: Array<{ sqlite?: { integrity_check: string } }> }> };
  const sqliteEntries = manifest.stores.flatMap(store => store.entries).filter(entry => entry.sqlite);
  assert.ok(sqliteEntries.length >= 1 && sqliteEntries.every(entry => entry.sqlite?.integrity_check === "ok"));
  assert.equal(fs.existsSync(join(f.snapshot, "data", "config", "web-control-token")), false, "control token never enters snapshot");
});

test("102-2 S-07: production space-web-server serves root Home snapshots and lets inactive personal spaces snapshot cleanly under storage-owner", { timeout: 60_000 }, async t => {
  const f = await smallSnapshotHome(t);
  const server: Server = createDesktopWebHost({ ptyClientFilePath: () => "/unused-for-http-test" })({ homeDirectory: f.home });
  await new Promise<void>(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
  t.after(() => new Promise<void>(resolveClose => { server.closeAllConnections(); server.close(() => resolveClose()); }));
  const runCli = (args: string[], env: NodeJS.ProcessEnv) => new Promise<{ status: number | null; stdout: string; stderr: string }>((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../apps/desktop/launchers/cli/main.ts", import.meta.url)), ...args], { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.once("error", rejectRun);
    child.once("close", status => resolveRun({ status, stdout, stderr }));
  });
  const cliEnv: NodeJS.ProcessEnv = { ...process.env, MOLIS_WORK_TEST: "1" };
  delete cliEnv.MOLIS_WORK_WEB_URL;
  // 1. Root installation Home while createSpaceWebServer is running succeeds via /api/internal/home-maintenance (no 401 login error).
  const rootDest = join(f.area, "space-root-snapshot");
  const rootCli = await runCli(["home", "snapshot", "--home", f.home, "--to", rootDest, "--json"], cliEnv);
  assert.equal(rootCli.status, 0, rootCli.stderr);
  assert.equal((JSON.parse(rootCli.stdout) as { status: string }).status, "created");

  // 2. An initialized but currently inactive personal space under `<root>/spaces/<id>` verifies `<root>` HMAC (not an impostor) and snapshots cleanly offline under its own storage-owner lock.
  const inactiveSpace = join(f.home, "spaces", "space_inactive_probe");
  const seeded = createMolisWorkLocalHost({ homeDirectory: inactiveSpace, completeText: null });
  await seeded.close();
  const spaceDest = join(f.area, "inactive-space-snapshot");
  const spaceCli = await runCli(["home", "snapshot", "--home", inactiveSpace, "--to", spaceDest, "--json"], cliEnv);
  assert.equal(spaceCli.status, 0, spaceCli.stderr);
  assert.equal((JSON.parse(spaceCli.stdout) as { status: string }).status, "created");
});
