import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest, type ClientRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { handleLocalVoiceHttp, silentVoiceWav, transcribeLocalVoice } from "@molis-ai/molis-work-app-local-host";

interface HelperRun { pid: number; input: string; args: string[] }
const macOnly = { skip: process.platform !== "darwin", timeout: 10_000 };

async function waitForRun(file: string): Promise<HelperRun> {
  const deadline = Date.now() + 3_000;
  while (!existsSync(file) && Date.now() < deadline) await delay(10);
  assert.ok(existsSync(file), "the helper must start before the client cancels");
  return JSON.parse(readFileSync(file, "utf8")) as HelperRun;
}
function stopOwnHelper(file: string): void {
  if (!existsSync(file)) return;
  const { pid } = JSON.parse(readFileSync(file, "utf8")) as HelperRun;
  try { process.kill(pid, "SIGKILL"); }
  catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ESRCH")) throw error; }
}
async function fixture(t: TestContext, behavior: string) {
  const root = mkdtempSync(path.join(tmpdir(), "local-voice-cancel-"));
  const helper = path.join(root, "helper"), log = path.join(root, "run.json"), home = path.join(root, "home");
  writeFileSync(helper, `#!${process.execPath}\nconst fs = require("node:fs");\nfs.writeFileSync(${JSON.stringify(log)}, JSON.stringify({ pid: process.pid, input: process.argv[2] === "extract" ? process.argv[3] : "", args: process.argv.slice(2) }));\n${behavior}\n`, { mode: 0o700 });
  const previousHelper = process.env.MOLIS_JELLY_WHISPER_HELPER;
  process.env.MOLIS_JELLY_WHISPER_HELPER = helper;
  const settled = Promise.withResolvers<void>();
  const server = createServer((request, response) => {
    void handleLocalVoiceHttp(request, response, new URL(request.url ?? "/", "http://127.0.0.1"), home)
      .then(() => settled.resolve(), error => settled.reject(error));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  t.after(async () => {
    stopOwnHelper(log);
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (previousHelper === undefined) delete process.env.MOLIS_JELLY_WHISPER_HELPER;
    else process.env.MOLIS_JELLY_WHISPER_HELPER = previousHelper;
    if (existsSync(log)) {
      const { input } = JSON.parse(readFileSync(log, "utf8")) as HelperRun;
      if (input) rmSync(path.dirname(input), { recursive: true, force: true });
    }
    rmSync(root, { recursive: true, force: true });
  });
  return { helper, home, log, settled: settled.promise, url: `http://127.0.0.1:${address.port}/api/local-voice` };
}
function postUntilCancelled(url: string, op: string): ClientRequest {
  const request = httpRequest(url, { method: "POST", headers: { "content-type": "application/json" } });
  request.on("response", response => { response.on("error", () => { /* The deliberate disconnect ends this stream. */ }); response.resume(); });
  request.on("error", error => { assert.equal((error as NodeJS.ErrnoException).code, "ECONNRESET"); });
  request.end(JSON.stringify({ op, confirm_download: true, mime: "audio/wav", audio_base64: silentVoiceWav().toString("base64") }));
  return request;
}
const waitBehavior = 'process.on("SIGTERM", () => {}); process.stderr.write(JSON.stringify({ stage: "model_download", progress: 0 }) + "\\n"); setInterval(() => {}, 1000);';

for (const op of ["probe", "prepare", "transcribe"]) {
  test(`UIV-06 UIV-10 disconnecting ${op} kills its actual helper and removes temporary audio`, macOnly, async t => {
    const scope = await fixture(t, waitBehavior);
    const request = postUntilCancelled(scope.url, op);
    t.after(() => request.destroy());
    const run = await waitForRun(scope.log);
    assert.ok(run.pid > 0);
    if (op !== "probe") assert.ok(existsSync(run.input), "audio exists only while the helper owns it");
    assert.equal(run.args.includes("--allow-model-download"), op === "prepare");
    request.destroy();
    await scope.settled;
    assert.throws(() => process.kill(run.pid, 0), { code: "ESRCH" }, "HTTP completion waits for the helper to die");
    if (run.input) assert.equal(existsSync(path.dirname(run.input)), false, "the input and converted audio directory must be removed");
  });
}

test("UIV-06 an already-cancelled transcription neither starts a helper nor creates a Home", macOnly, async t => {
  const scope = await fixture(t, waitBehavior);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(transcribeLocalVoice(scope.home, silentVoiceWav(), "dictation.wav", { helperPath: scope.helper, signal: controller.signal }), { name: "AbortError" });
  assert.equal(existsSync(scope.log), false);
  assert.equal(existsSync(scope.home), false);
});

test("UIV-05 prepare cannot claim completion when its helper still requires a model", macOnly, async t => {
  const scope = await fixture(t, 'process.stdout.write(JSON.stringify({ error: "model_required", message: "model not ready" })); process.exit(1);');
  const response = await fetch(scope.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "prepare", confirm_download: true }) });
  assert.equal(response.status, 200);
  const lines = (await response.text()).trim().split("\n").map(line => JSON.parse(line) as { ok?: boolean });
  assert.equal(lines.at(-1)?.ok, false);
  assert.equal(lines.some(line => line.ok === true), false);
  const run = await waitForRun(scope.log);
  assert.equal(existsSync(path.dirname(run.input)), false);
});

test("UIV-05 UIV-08 successful transcription keeps its text and clears the helper's temporary audio", macOnly, async t => {
  const sentence = "检查这次取消，也保留正常结果。";
  const result = { text: sentence, extractor: "local-test", pages: [{ number: 1, text: sentence, method: "whisper" }], coverage: { status: "sufficient", processed_pages: 1, total_pages: 1, issues: [] } };
  const scope = await fixture(t, `process.stdout.write(${JSON.stringify(JSON.stringify(result))});`);
  const response = await fetch(scope.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "transcribe", mime: "audio/wav", audio_base64: silentVoiceWav().toString("base64") }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { text: string }).text, sentence);
  const run = await waitForRun(scope.log);
  assert.equal(run.args.includes("--allow-model-download"), false);
  assert.equal(existsSync(path.dirname(run.input)), false);
});
