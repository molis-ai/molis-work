import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import test, { type TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";
import type { ImageJob } from "@molis-ai/molis-work-contracts/modules/images";
import { ImagesService, type ImagesSecretPort } from "../plugins/native/images/src/service.js";
import { ImagesStore } from "../plugins/native/images/src/store.js";
import type { ImageFetch } from "../plugins/native/images/src/providers.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
const success = () => new Response(JSON.stringify({ data: [{ b64_json: PNG.toString("base64") }] }));
const connectionInput = { name: "测试生图", api_format: "openai-images" as const, base_url: "https://provider.example/v1", model: "test-image", api_key: "only-in-secret-store" };

function fixture(t: TestContext, fetch: ImageFetch = async () => success()) {
  const home = mkdtempSync(join(tmpdir(), "molis-images-"));
  const keys = new Map<string, string>();
  const secrets: ImagesSecretPort = { get: (reference) => keys.get(reference) ?? null, put: (reference, key) => { keys.set(reference, key); }, delete: (reference) => { keys.delete(reference); } };
  const service = new ImagesService({ homeDirectory: home, secrets, fetch });
  t.after(async () => { await service.close(); rmSync(home, { recursive: true, force: true }); });
  return { home, service, keys, secrets };
}

async function settled(service: ImagesService, job: ImageJob): Promise<ImageJob> {
  for (let i = 0; i < 100; i += 1) {
    const value = service.getJob(job.project_id, job.id);
    if (value.status !== "running") return value;
    await setImmediate();
  }
  assert.fail("图片任务没有进入终态");
}

test("images: connection credentials stay outside SQLite and endpoint edits cannot reuse old keys", (t) => {
  const { home, service, keys } = fixture(t);
  const connection = service.saveConnection(connectionInput);
  assert.equal(connection.has_key, true);
  assert.equal(keys.size, 1);
  assert.doesNotMatch(JSON.stringify(service.listConnections()), /only-in-secret-store|api_key/u);
  assert.doesNotMatch(readFileSync(join(home, "images", "images.db")).toString("utf8"), /only-in-secret-store/u);
  const unchanged = service.saveConnection({ ...connectionInput, id: connection.id, api_key: "", name: "新名称" });
  assert.equal(unchanged.has_key, true);
  assert.equal([...keys.values()][0], connectionInput.api_key);
  assert.throws(() => service.saveConnection({ ...connectionInput, id: connection.id, api_key: "", base_url: "https://other.example/v1" }), { code: "images.key_required" });
  assert.throws(() => service.saveConnection({ ...connectionInput, id: connection.id, api_key: "", api_format: "gemini" }), { code: "images.key_required" });
  assert.equal(service.listConnections()[0]?.base_url, connectionInput.base_url);
  const local = service.saveConnection({ ...connectionInput, id: connection.id, api_key: "", base_url: "http://localhost:9876/v1" });
  assert.equal(local.has_key, false);
  assert.equal(keys.size, 0);
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
  const resolvers: Array<(value: Response) => void> = [];
  const { service, home, secrets } = fixture(t, () => new Promise((resolve) => { resolvers.push(resolve); }));
  assert.throws(() => new ImagesService({ homeDirectory: home, secrets }), { code: "images.already_open" });
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

test("images: a second Host process cannot interrupt a live runner's persisted jobs", async (t) => {
  const { service, home } = fixture(t, () => new Promise(() => {}));
  const connection = service.saveConnection(connectionInput);
  const job = service.start("project-a", { request_id: "cross-process", connection_id: connection.id, prompt: "狐狸" });
  await setImmediate();
  const moduleUrl = new URL("../plugins/native/images/src/service.ts", import.meta.url).href;
  const script = `import { ImagesService } from ${JSON.stringify(moduleUrl)};
    try {
      const service = new ImagesService({homeDirectory:${JSON.stringify(home)},secrets:{get:()=>null,put:()=>{},delete:()=>{}}});
      await service.close();
      process.stdout.write('unexpected second runner');
    } catch(error) { process.stdout.write(error.code ?? 'unexpected error'); }`;
  const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { encoding: "utf8", timeout: 10_000 });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, "images.already_open");
  assert.equal(service.getJob("project-a", job.id).status, "running");
});

test("images: a generation captures its model and key when started, even if settings change before fetch", async (t) => {
  const { service } = fixture(t, async (_url, init) => {
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer only-in-secret-store");
    assert.equal(JSON.parse(String(init?.body)).model, "test-image");
    return success();
  });
  const connection = service.saveConnection(connectionInput);
  const job = service.start("project-a", { request_id: "snapshot", connection_id: connection.id, prompt: "狐狸" });
  service.saveConnection({ ...connectionInput, id: connection.id, model: "new-model", api_key: "new-secret" });
  assert.equal((await settled(service, job)).status, "succeeded");
  assert.equal(service.getJob("project-a", job.id).model, "test-image");
});

test("images: close and restart mark unfinished jobs interrupted and do not charge again", async (t) => {
  let calls = 0;
  const { service, home, secrets } = fixture(t, () => { calls += 1; return new Promise(() => {}); });
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
  const restarted = new ImagesService({ homeDirectory: home, secrets, fetch: () => { calls += 1; return new Promise(() => {}); } });
  try {
    assert.equal(restarted.getJob("project-a", job.id).status, "interrupted");
    assert.equal(restarted.start("project-a", input).id, job.id);
    assert.equal(restarted.start("project-a", input).status, "interrupted");
    assert.equal(calls, 1);
  } finally { await restarted.close(); }
});

test("images: shutdown aborts every task and releases the runner when interruption writes fail", async (t) => {
  const signals: AbortSignal[] = [];
  const { service, home, secrets } = fixture(t, (_url, init) => {
    signals.push(init!.signal!);
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
  const restarted = new ImagesService({ homeDirectory: home, secrets });
  try {
    assert.ok(jobs.every((job) => restarted.getJob("project-a", job.id).status === "interrupted"));
  } finally { await restarted.close(); }
});

test("images: a database close error still releases both the SQLite runner lock and the in-process registration", async (t) => {
  const home = mkdtempSync(join(tmpdir(), "molis-images-close-fault-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const secrets: ImagesSecretPort = { get: () => null, put: () => {}, delete: () => {} };
  const service = new ImagesService({ homeDirectory: home, secrets });
  const store = Reflect.get(service, "store");
  const db = Reflect.get(store, "db") as DatabaseSync;
  const originalClose = db.close.bind(db);
  t.mock.method(db, "close", () => {
    originalClose();
    throw new Error("injected database close failure");
  });
  await assert.rejects(service.close(), /injected database close failure/u);
  const restarted = new ImagesService({ homeDirectory: home, secrets });
  try { assert.deepEqual(restarted.listConnections(), []); }
  finally { await restarted.close(); }
});

test("images: failed store initialization releases the runner even when database cleanup also throws", (t) => {
  const home = mkdtempSync(join(tmpdir(), "molis-images-init-fault-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const originalExec = DatabaseSync.prototype.exec;
  const originalClose = DatabaseSync.prototype.close;
  const execMock = t.mock.method(DatabaseSync.prototype, "exec", function (this: DatabaseSync, sql: string) {
    if (sql.includes("CREATE TABLE IF NOT EXISTS connections")) throw new Error("injected schema initialization failure");
    return originalExec.call(this, sql);
  });
  let closes = 0;
  const closeMock = t.mock.method(DatabaseSync.prototype, "close", function (this: DatabaseSync) {
    originalClose.call(this);
    closes += 1;
    if (closes === 1) throw new Error("injected constructor cleanup failure");
  });
  assert.throws(() => new ImagesStore(home), /injected constructor cleanup failure/u);
  assert.equal(closes, 2);
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
  const { service } = fixture(t, async (_url, init) => {
    assert.equal(new Headers(init?.headers).get("authorization"), null);
    return success();
  });
  const remote = service.saveConnection({ ...connectionInput, api_key: "" });
  assert.throws(() => service.start("project-a", { request_id: "remote", connection_id: remote.id, prompt: "狐狸" }), { code: "images.key_required" });
  const local = service.saveConnection({ ...connectionInput, base_url: "http://127.0.0.1:8787/v1", api_key: "" });
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
