import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";
import type { ImageJob } from "@molis-ai/molis-work-contracts/modules/images";
import { ImagesService } from "../plugins/native/images/src/service.js";
import { ImagesStore } from "../plugins/native/images/src/store.js";
import type { ImageGeneration } from "../plugins/native/images/src/providers.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
const success = () => [{ bytes: PNG, mime: "image/png" }];
const connectionInput = { name: "测试生图", api_format: "openai-images" as const, base_url: "https://provider.example/v1", model: "test-image", auth_connection_id: "account" };
const NO_CONNECTIONS = { resolveConnectionKey: () => undefined, selectConnection: () => {}, selectedConnectionId: () => null, clearConnection: () => {} };

/** The Home's service connections as the Images host ports see them: image service → chosen connection → key. */
function connectionPorts() {
  const keys = new Map<string, string>([["account", "only-in-secret-store"]]);
  const chosen = new Map<string, string>();
  const ports = {
    resolveConnectionKey: (id: string) => { const choice = chosen.get(id); return choice === undefined ? undefined : keys.get(choice) ?? null; },
    selectConnection: (id: string, connectionId: string) => { chosen.set(id, connectionId); },
    selectedConnectionId: (id: string) => chosen.get(id) ?? null,
    clearConnection: (id: string) => { chosen.delete(id); },
  };
  return { keys, chosen, ports };
}

function fixture(t: TestContext, generate: ImageGeneration = async () => success()) {
  const home = mkdtempSync(join(tmpdir(), "molis-images-"));
  const { keys, chosen, ports } = connectionPorts();
  const service = new ImagesService({ homeDirectory: home, ...ports, generate });
  t.after(async () => { await service.close(); rmSync(home, { recursive: true, force: true }); });
  return { home, service, keys, chosen, ports };
}

async function settled(service: ImagesService, job: ImageJob): Promise<ImageJob> {
  for (let i = 0; i < 100; i += 1) {
    const value = service.getJob(job.project_id, job.id);
    if (value.status !== "running") return value;
    await setImmediate();
  }
  assert.fail("图片任务没有进入终态");
}

test("images: the key stays in the chosen service connection, outside SQLite and every listing", (t) => {
  const { home, service, chosen } = fixture(t);
  const connection = service.saveConnection(connectionInput);
  assert.equal(connection.has_key, true);
  assert.equal(connection.auth_connection_id, "account");
  assert.doesNotMatch(JSON.stringify(service.listConnections()), /only-in-secret-store|api_key/u);
  assert.doesNotMatch(readFileSync(join(home, "images", "images.db")).toString("utf8"), /only-in-secret-store/u);
  const renamed = service.saveConnection({ ...connectionInput, id: connection.id, name: "新名称" });
  assert.equal(renamed.has_key, true, "editing a service keeps its chosen connection");
  service.deleteConnection(connection.id);
  assert.equal(chosen.has(connection.id), false, "deleting a service clears its choice; the connection stays in Connectors");
});

test("images: generation persists real bytes, isolates projects, and deduplicates requests including after completion", async (t) => {
  let calls = 0;
  const { service } = fixture(t, async () => { calls += 1; return success(); });
  const connection = service.saveConnection(connectionInput);
  const input = { request_id: "unique-click", connection_id: connection.id, prompt: "纸雕狐狸" };
  const first = service.start("project-a", input);
  assert.equal(first.status, "running");
  assert.equal(service.start("project-a", input).id, first.id);
  assert.throws(() => service.start("project-a", { ...input, prompt: "不同的图片" }), { code: "images.request_conflict" });
  const result = await settled(service, first);
  assert.equal(result.status, "succeeded");
  assert.equal(calls, 1);
  assert.equal(service.start("project-a", input).id, first.id);
  assert.equal(calls, 1);
  assert.equal(result.images.length, 1);
  const image = result.images[0]!;
  assert.deepEqual(service.readImage("project-a", first.id, image.id).bytes, PNG);
  assert.equal(image.byte_length, PNG.length);
  assert.match(image.filename, /^[a-f0-9-]+\.png$/u);
  assert.deepEqual(service.listJobs("project-b"), []);
  assert.throws(() => service.getJob("project-b", first.id), { code: "images.not_found" });
  assert.throws(() => service.readImage("project-b", first.id, image.id), { code: "images.not_found" });
  assert.throws(() => service.readImage("project-a", first.id, "../../images.db"), { code: "images.not_found" });
  const other = service.start("project-b", input);
  assert.notEqual(other.id, first.id);
  assert.equal((await settled(service, other)).status, "succeeded");
  assert.equal(calls, 2);
});

test("images: concurrency is capped per home across projects, cancellation frees capacity and late responses never overwrite it", async (t) => {
  const resolvers: Array<(value: ReturnType<typeof success>) => void> = [];
  const { service, home, ports } = fixture(t, () => new Promise((resolve) => { resolvers.push(resolve); }));
  assert.throws(() => new ImagesService({ homeDirectory: home, ...ports }), { code: "images.already_open" });
  const connection = service.saveConnection(connectionInput);
  const input = (request_id: string) => ({ request_id, connection_id: connection.id, prompt: "纸雕狐狸" });
  const first = service.start("project-a", input("one"));
  const second = service.start("project-b", input("two"));
  assert.throws(() => service.start("project-c", input("three")), { code: "images.busy" });
  await setImmediate();
  assert.equal(service.cancel("project-a", first.id).status, "cancelled");
  const third = service.start("project-c", input("three"));
  await setImmediate();
  assert.equal(resolvers.length, 3);
  resolvers.forEach((resolve) => resolve(success()));
  assert.equal((await settled(service, second)).status, "succeeded");
  assert.equal((await settled(service, third)).status, "succeeded");
  await setImmediate();
  assert.equal(service.getJob("project-a", first.id).status, "cancelled");
  assert.deepEqual(service.getJob("project-a", first.id).images, []);
  assert.equal(readdirSync(join(home, "images", "assets")).length, 2);
  assert.equal(service.start("project-a", input("one")).status, "cancelled");
  assert.equal(resolvers.length, 3);
});

test("images: a second Host process reads live jobs and closing it does not interrupt their owner", async (t) => {
  const { service, home } = fixture(t, () => new Promise(() => {}));
  const connection = service.saveConnection(connectionInput);
  const job = service.start("project-a", { request_id: "cross-process", connection_id: connection.id, prompt: "狐狸" });
  await setImmediate();
  const moduleUrl = new URL("../plugins/native/images/src/service.ts", import.meta.url).href;
  const script = `import { ImagesService } from ${JSON.stringify(moduleUrl)};
    try {
      const service = new ImagesService({homeDirectory:${JSON.stringify(home)},resolveConnectionKey:()=>undefined,selectConnection:()=>{},selectedConnectionId:()=>null,clearConnection:()=>{}});
      process.stdout.write(service.getJob('project-a', ${JSON.stringify(job.id)}).status);
      await service.close();
    } catch(error) { process.stdout.write(error.code ?? 'unexpected error'); }`;
  const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { encoding: "utf8", timeout: 10_000 });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, "running");
  assert.equal(service.getJob("project-a", job.id).status, "running");
});

test("images: a job an earlier runner left running recovers only after that runner's exclusive lock closes", async (t) => {
  const { service, home, ports } = fixture(t, () => new Promise(() => {}));
  const connection = service.saveConnection(connectionInput);
  const job = service.start("project-a", { request_id: "earlier", connection_id: connection.id, prompt: "earlier" });
  await service.close();
  const earlierRunner = randomUUID();
  const db = new DatabaseSync(join(home, "images", "images.db"));
  db.prepare("UPDATE jobs SET status = 'running', runner_id = ?, finished_at = NULL WHERE id = ?").run(earlierRunner, job.id);
  db.close();
  const earlierLock = new DatabaseSync(join(home, "images", "runners", earlierRunner + ".db"));
  earlierLock.exec("BEGIN EXCLUSIVE");
  try {
    const alongside = new ImagesService({ homeDirectory: home, ...ports });
    try { assert.equal(alongside.getJob("project-a", job.id).status, "running", "a live runner's job is not interrupted"); }
    finally { await alongside.close(); }
  } finally { earlierLock.close(); }
  const restarted = new ImagesService({ homeDirectory: home, ...ports });
  try {
    assert.equal(restarted.getJob("project-a", job.id).status, "interrupted");
    assert.equal(restarted.listConnections()[0]!.id, connection.id);
  } finally { await restarted.close(); }
});

/** A process that holds a runner file's exclusive lock until it is killed, the way an Images host does. */
async function holdRunnerLock(path: string) {
  const script = `import { DatabaseSync } from "node:sqlite";
    const db = new DatabaseSync(${JSON.stringify(path)}); db.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE");
    process.stdout.write("locked"); setInterval(() => {}, 1000);`;
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "--input-type=module", "-e", script], { stdio: ["ignore", "pipe", "ignore"] });
  const exited = new Promise<void>(resolve => child.once("exit", () => resolve()));
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    void exited.then(() => reject(new Error("the lock holder exited before it held the lock")));
    child.stdout.once("data", () => resolve());
  });
  return { async kill() { child.kill("SIGKILL"); await exited; } };
}

const longAgo = () => new Date(Date.now() - 3_600_000);
const age = (path: string) => utimesSync(path, longAgo(), longAgo());

test("images: a start reclaims the lock files and journals killed runners left, and leaves live runners and other files alone", async (t) => {
  const home = mkdtempSync(join(tmpdir(), "molis-images-orphans-"));
  const runners = join(home, "images", "runners");
  mkdirSync(runners, { recursive: true });
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const file = (id: string, suffix = ".db") => join(runners, id + suffix);

  // A runner killed while it held its lock leaves the file and the journal of the transaction it had open.
  const killed = randomUUID(), live = randomUUID();
  const killedHolder = await holdRunnerLock(file(killed)), liveHolder = await holdRunnerLock(file(live));
  t.after(() => liveHolder.kill());
  await killedHolder.kill();
  assert.ok(existsSync(file(killed)) && existsSync(file(killed, ".db-journal")), "a killed runner leaves its file and its journal");
  // The other shapes a crash leaves: killed before it locked (empty file), a journal on its own, and a journal SQLite
  // itself would leave behind (a zeroed header is not a hot journal) next to a file that holds data.
  const empty = randomUUID(), journalOnly = randomUUID(), stray = randomUUID();
  writeFileSync(file(empty), "");
  writeFileSync(file(journalOnly, ".db-journal"), Buffer.alloc(512));
  const strayDb = new DatabaseSync(file(stray)); strayDb.exec("CREATE TABLE t (x)"); strayDb.close();
  writeFileSync(file(stray, ".db-journal"), Buffer.alloc(512));
  // Not a runner's: other names stay, and a file as young as a runner that is still starting up waits.
  const starting = randomUUID();
  writeFileSync(file(starting), "");
  writeFileSync(join(runners, "notes.txt"), "keep");
  writeFileSync(join(runners, "not-a-runner.db"), "keep");
  for (const path of [file(killed), file(killed, ".db-journal"), file(live), file(live, ".db-journal"), file(empty), file(journalOnly, ".db-journal"), file(stray), file(stray, ".db-journal")]) age(path);

  const liveFiles = readdirSync(runners).filter(name => name.startsWith(live)).sort();
  const store = new ImagesStore(home);
  const own = Reflect.get(store, "runnerId") as string;
  try {
    assert.ok(existsSync(file(own)), "the new runner holds its own file");
    assert.deepEqual(readdirSync(runners).filter(name => !name.startsWith(own)).sort(), [...liveFiles, starting + ".db", "not-a-runner.db", "notes.txt"].sort(),
      "the killed, empty, journal-only and stray-journal runner files are gone; the live runner's files, the young file and the other names stay");
  } finally { store.close(); }
  assert.deepEqual(readdirSync(runners).filter(name => name.startsWith(own)), [], "closing removes the runner's own file and journal");

  // The lock is what protects a runner, not its age: once the holder is killed, the next start clears its files.
  await liveHolder.kill();
  age(file(starting));
  const restarted = new ImagesStore(home);
  const restartedId = Reflect.get(restarted, "runnerId") as string;
  try {
    assert.deepEqual(readdirSync(runners).filter(name => name.startsWith(restartedId) === false).sort(), ["not-a-runner.db", "notes.txt"],
      "with the holder gone and the young file aged, only the names that are not runners' remain");
  } finally { restarted.close(); }
});

test("images: recovering a dead runner's running job removes its lock file and the journal beside it, even one SQLite itself would keep", async (t) => {
  const { service, home, ports } = fixture(t, () => new Promise(() => {}));
  const connection = service.saveConnection(connectionInput);
  const jobs = ["killed", "kept-journal"].map(request_id => service.start("project-a", { request_id, connection_id: connection.id, prompt: request_id }));
  await service.close();
  const runners = join(home, "images", "runners");
  const name = (id: string, suffix = ".db") => id + suffix;
  const path = (id: string, suffix = ".db") => join(runners, name(id, suffix));
  // A runner killed while it held its lock: an empty file and the journal of its open transaction. The recovery probe
  // takes the same lock, and SQLite discards that journal itself.
  const killed = randomUUID(), killedHolder = await holdRunnerLock(path(killed));
  await killedHolder.kill();
  assert.ok(existsSync(path(killed, ".db-journal")), "the kill left a journal");
  // A runner file that holds data next to a journal whose header is zeroed (not hot): SQLite keeps this journal through
  // the probe, so only the recovery can remove it. Both files are as young as a runner that has just started, so the
  // sweep that clears the files of dead runners leaves them alone (30 seconds of grace).
  const keptJournal = randomUUID();
  const seeded = new DatabaseSync(path(keptJournal)); seeded.exec("CREATE TABLE t (x)"); seeded.close();
  writeFileSync(path(keptJournal, ".db-journal"), Buffer.alloc(512));
  const db = new DatabaseSync(join(home, "images", "images.db"));
  [killed, keptJournal].forEach((runner, index) => db.prepare("UPDATE jobs SET status = 'running', runner_id = ?, finished_at = NULL WHERE id = ?").run(runner, jobs[index]!.id));
  db.close();
  assert.deepEqual(readdirSync(runners).sort(), [name(killed), name(killed, ".db-journal"), name(keptJournal), name(keptJournal, ".db-journal")].sort(), "the files the recovery meets");
  const restarted = new ImagesService({ homeDirectory: home, ...ports });
  try {
    assert.deepEqual(jobs.map(job => restarted.getJob("project-a", job.id).status), ["interrupted", "interrupted"]);
    assert.deepEqual(readdirSync(runners).filter(name => name.startsWith(killed) || name.startsWith(keptJournal)), [], "each dead runner's file and journal are gone");
  } finally { await restarted.close(); }
});

test("images: a generation passes its fixed model and credential reference to the Host", async (t) => {
  const { service } = fixture(t, async input => {
    assert.equal(input.resolveCredential(input.credential_ref), "only-in-secret-store");
    assert.equal(input.model, "test-image");
    return success();
  });
  const connection = service.saveConnection(connectionInput);
  const job = service.start("project-a", { request_id: "snapshot", connection_id: connection.id, prompt: "狐狸" });
  assert.equal((await settled(service, job)).status, "succeeded");
  assert.equal(service.getJob("project-a", job.id).model, "test-image");
});

test("images: close and restart mark unfinished jobs interrupted and do not charge again", async (t) => {
  let calls = 0;
  const { service, home, ports } = fixture(t, () => { calls += 1; return new Promise(() => {}); });
  const connection = service.saveConnection(connectionInput);
  const input = { request_id: "restart", connection_id: connection.id, prompt: "狐狸" };
  const job = service.start("project-a", input);
  await setImmediate();
  await service.close();
  assert.throws(() => service.listConnections(), { code: "images.closed" });
  // Simulate a process disappearing with a persisted running record.
  const db = new DatabaseSync(join(home, "images", "images.db"));
  db.prepare("UPDATE jobs SET status = 'running', finished_at = NULL WHERE id = ?").run(job.id);
  db.close();
  const restarted = new ImagesService({ homeDirectory: home, ...ports, generate: () => { calls += 1; return new Promise(() => {}); } });
  try {
    assert.equal(restarted.getJob("project-a", job.id).status, "interrupted");
    assert.equal(restarted.start("project-a", input).id, job.id);
    assert.equal(restarted.start("project-a", input).status, "interrupted");
    assert.equal(calls, 1);
  } finally { await restarted.close(); }
});

test("images: shutdown aborts every task and releases the runner when interruption writes fail", async (t) => {
  const signals: AbortSignal[] = [];
  const { service, home, ports } = fixture(t, (_input, signal) => {
    signals.push(signal);
    return new Promise(() => {});
  });
  const connection = service.saveConnection(connectionInput);
  const jobs = ["one", "two"].map((request_id) => service.start("project-a", { request_id, connection_id: connection.id, prompt: "狐狸" }));
  await setImmediate();
  const store = Reflect.get(service, "store") as { finish: () => boolean };
  t.mock.method(store, "finish", () => { throw new Error("SQLITE_BUSY: injected write failure"); });
  await service.close();
  assert.equal(signals.length, 2);
  assert.ok(signals.every((signal) => signal.aborted));
  const restarted = new ImagesService({ homeDirectory: home, ...ports });
  try {
    assert.ok(jobs.every((job) => restarted.getJob("project-a", job.id).status === "interrupted"));
  } finally { await restarted.close(); }
});

test("images: a database close error still releases both the SQLite runner lock and the in-process registration", async (t) => {
  const home = mkdtempSync(join(tmpdir(), "molis-images-close-fault-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const service = new ImagesService({ homeDirectory: home, ...NO_CONNECTIONS });
  const store = Reflect.get(service, "store");
  const db = Reflect.get(store, "db") as DatabaseSync;
  const originalClose = db.close.bind(db);
  t.mock.method(db, "close", () => {
    originalClose();
    throw new Error("injected database close failure");
  });
  await assert.rejects(service.close(), /injected database close failure/u);
  const restarted = new ImagesService({ homeDirectory: home, ...NO_CONNECTIONS });
  try { assert.deepEqual(restarted.listConnections(), []); }
  finally { await restarted.close(); }
});

test("images: failed store initialization releases the runner even when database cleanup also throws", (t) => {
  const home = mkdtempSync(join(tmpdir(), "molis-images-init-fault-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const originalExec = DatabaseSync.prototype.exec;
  const originalClose = DatabaseSync.prototype.close;
  const execMock = t.mock.method(DatabaseSync.prototype, "exec", function (this: DatabaseSync, sql: string) {
    if (sql.includes("CREATE TABLE connections")) throw new Error("injected schema initialization failure");
    return originalExec.call(this, sql);
  });
  let closes = 0;
  const closeMock = t.mock.method(DatabaseSync.prototype, "close", function (this: DatabaseSync) {
    originalClose.call(this);
    closes += 1;
    if (closes === 1) throw new Error("injected constructor cleanup failure");
  });
  assert.throws(() => new ImagesStore(home), /injected constructor cleanup failure/u);
  assert.equal(closes, 2, "the database and the runner lock both close");
  execMock.mock.restore();
  closeMock.mock.restore();
  const store = new ImagesStore(home);
  try { assert.deepEqual(store.listConnections(), []); }
  finally { store.close(); }
});

test("images: provider exceptions are redacted and failed requests require a new user request ID", async (t) => {
  let calls = 0;
  const { service } = fixture(t, async () => { calls += 1; throw new Error("only-in-secret-store leaked credentials in URL"); });
  const connection = service.saveConnection(connectionInput);
  const input = { request_id: "failure", connection_id: connection.id, prompt: "狐狸" };
  const result = await settled(service, service.start("project-a", input));
  assert.equal(result.status, "failed");
  assert.ok(result.error);
  assert.doesNotMatch(JSON.stringify(result), /only-in-secret-store|leaked credentials/u);
  assert.equal(service.start("project-a", input).status, "failed");
  assert.equal(calls, 1);
  assert.throws(() => service.start("", { ...input, request_id: "new" }), { code: "images.invalid" });
  assert.throws(() => service.start("project-a", { ...input, request_id: "new", aspect_ratio: "1:1" }), { code: "images.invalid" });
});

test("images: localhost can generate without a key and remote connections fail clearly until configured", async (t) => {
  const { service } = fixture(t, async input => {
    assert.equal(input.resolveCredential(input.credential_ref), "");
    return success();
  });
  const { auth_connection_id: _, ...unchosen } = connectionInput;
  const remote = service.saveConnection(unchosen);
  assert.throws(() => service.start("project-a", { request_id: "remote", connection_id: remote.id, prompt: "狐狸" }), { code: "images.key_required" });
  const local = service.saveConnection({ ...unchosen, base_url: "http://127.0.0.1:8787/v1" });
  assert.equal((await settled(service, service.start("project-a", { request_id: "local", connection_id: local.id, prompt: "狐狸" }))).status, "succeeded");
});

test("images: timeout ends local waiting without retry and reports uncertain remote billing", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const { service } = fixture(t, () => { calls += 1; return new Promise(() => {}); });
  const connection = service.saveConnection(connectionInput);
  const job = service.start("project-a", { request_id: "timeout", connection_id: connection.id, prompt: "狐狸" });
  await setImmediate();
  t.mock.timers.tick(180_000);
  const result = await settled(service, job);
  assert.equal(result.status, "failed");
  assert.match(result.error, /180 秒/u);
  assert.match(result.error, /计费/u);
  assert.equal(calls, 1);
});

for (const change of ["model", "endpoint", "credential", "delete"] as const) {
  test(`images: ${change} change while generating rejects stale bytes and preserves the prompt for retry`, async t => {
    const entered = Promise.withResolvers<void>(), reply = Promise.withResolvers<ReturnType<typeof success>>();
    const { service, home, keys } = fixture(t, async () => { entered.resolve(); return reply.promise; });
    const connection = service.saveConnection(connectionInput);
    const input = { request_id: `pending-${change}`, connection_id: connection.id, prompt: "保留的原始描述" };
    const job = service.start("project-a", input);
    await entered.promise;
    if (change === "model") service.saveConnection({ ...connectionInput, id: connection.id, model: "changed-model" });
    if (change === "endpoint") service.saveConnection({ ...connectionInput, id: connection.id, base_url: "https://changed.example/v1" });
    if (change === "credential") keys.set("account", "replacement-key");
    if (change === "delete") service.deleteConnection(connection.id);
    reply.resolve(success());
    const result = await settled(service, job);
    assert.equal(result.status, "failed");
    assert.match(result.error, /改变或撤销/);
    assert.equal(result.prompt, input.prompt);
    assert.deepEqual(result.images, []);
    assert.deepEqual(readdirSync(join(home, "images", "assets")), []);
    assert.equal(service.start("project-a", input).id, job.id);
  });
}

test("images: revocation between enqueue and dispatch prevents the model call", async t => {
  let calls = 0;
  const { service, keys } = fixture(t, async () => { calls++; return success(); });
  const connection = service.saveConnection(connectionInput);
  const job = service.start("project-a", { request_id: "before-dispatch", connection_id: connection.id, prompt: "原材料" });
  keys.delete("account");
  assert.equal((await settled(service, job)).status, "failed");
  assert.equal(calls, 0);
});

test("images: deferred Host credential resolution refuses a changed selection", async t => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const { service, keys } = fixture(t, async input => {
    entered.resolve(); await release.promise;
    input.resolveCredential(input.credential_ref);
    assert.fail("a revoked credential must not reach model execution");
  });
  const connection = service.saveConnection(connectionInput);
  const job = service.start("project-a", { request_id: "deferred-credential", connection_id: connection.id, prompt: "原始素材" });
  await entered.promise;
  keys.set("account", "changed-key");
  release.resolve();
  const result = await settled(service, job);
  assert.equal(result.status, "failed");
  assert.match(result.error, /改变或撤销/);
  assert.equal(result.prompt, "原始素材");
});
