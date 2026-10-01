import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import Database from "better-sqlite3";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { createWebCatalogAccess } from "../apps/local-host/src/web-catalog-access.js";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test("health becomes ready after a real migration lock timeout without a business request", { timeout: 20_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-web-startup-recovery-"));
  const initial = await openMolisWorkProjectCatalog({ homeDirectory: home }), database = initial.databasePath;
  initial.close();
  const metadata = new Database(database); metadata.prepare("UPDATE catalog_meta SET value='18' WHERE key='schema_version'").run(); metadata.close();
  const localHost = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  let failed!: () => void;
  const timedOut = new Promise<void>(resolve => { failed = resolve; });
  // Observe the real opener's timeout, so lock release cannot race ahead of the failure under CPU load.
  localHost.ensureWebCatalog(home, async options => {
    try { return await openMolisWorkProjectCatalog(options); }
    catch (error) { if ((error as { code?: string }).code === "SQLITE_BUSY") failed(); throw error; }
  });
  const writer = spawn(process.execPath, ["--input-type=module", "-e", `
    import Database from 'better-sqlite3'; const db=new Database(process.argv[1]);db.exec('BEGIN IMMEDIATE');
    console.log('locked');process.stdin.once('data',()=>{db.exec('ROLLBACK');db.close();});
  `, database], { stdio: ["pipe", "pipe", "pipe"] });
  const exited = once(writer, "exit"); await once(writer.stdout!, "data");
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost, controlToken: "catalog-recovery-control-token-0123456789" });
  t.after(async () => {
    if (writer.exitCode === null) { writer.kill(); await exited; }
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await localHost.close();
    await rm(home, { recursive: true, force: true });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  await timedOut; writer.stdin!.end("release"); await exited;
  const origin = `http://127.0.0.1:${address.port}`;
  const deadline = Date.now() + 3000;
  let health;
  do { health = await fetch(origin + "/health"); if (health.status === 200) break; await health.text(); await delay(30); } while (Date.now() < deadline);
  assert.equal(health.status, 200, "the Server must retry preparation independently of business traffic");
  assert.equal((await health.json()).status, "ok");
});

test("permanent catalog refusal is not retried, and closing cancels a queued transient retry", async () => {
  const home = await mkdtemp(join(tmpdir(), "molis-web-retry-lifecycle-"));
  try {
    for (const code of ["catalog.reader_too_old", "catalog.unknown_database", "SQLITE_BUSY"]) {
      let opens = 0;
      const access = createWebCatalogAccess(home, async () => { opens++; throw Object.assign(new Error(code), { code }); });
      await assert.rejects(access.warm(), { code });
      if (code === "SQLITE_BUSY") await access.close();
      await delay(160);
      assert.equal(opens, 1, code);
      assert.equal(access.ready, false);
      await access.close();
    }
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("concurrent borrowers share preparation and a transient retry never replays their failed operations", async () => {
  const home = await mkdtemp(join(tmpdir(), "molis-web-preparation-retry-"));
  let opens = 0, effects = 0;
  const access = createWebCatalogAccess(home, options => {
    if (++opens === 1) return Promise.reject(Object.assign(new Error("held lock"), { code: "SQLITE_BUSY" }));
    return openMolisWorkProjectCatalog(options);
  });
  try {
    const results = await Promise.allSettled([1, 2].map(() => access.withCatalog({ homeDirectory: home }, () => { effects++; })));
    assert.ok(results.every(result => result.status === "rejected"));
    const deadline = Date.now() + 2000;
    while (!access.ready && Date.now() < deadline) await delay(20);
    assert.equal(access.ready, true); assert.equal(opens, 2); assert.equal(effects, 0);
    await access.withCatalog({ homeDirectory: home }, () => { effects++; });
    assert.equal(opens, 2); assert.equal(effects, 1);
  } finally { await access.close(); await rm(home, { recursive: true, force: true }); }
});
