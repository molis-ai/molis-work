import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cancelAgentProcess, isAgentProcessRunning, runAgentProcess } from "../modules/shelf/src/job-runner.js";

for (const format of ["json", "streaming-messages-json"] as const) {
  test(`Shelf rejects invalid ${format} output through the job Promise`, async () => {
    const home = await mkdtemp(join(tmpdir(), "shelf-invalid-result-"));
    try {
      const outputFile = join(home, "result.txt");
      const input = { executable: process.execPath, workdir: home, outputFile, jobId: `invalid-${format}` };
      await assert.rejects(runAgentProcess({ ...input, args: ["-e", "console.log('{}')", "--", "--output-format", format] }), { code: "shelf.job_failed" });
      assert.equal(isAgentProcessRunning(input.jobId), false);
      const value = format === "json" ? { text: "Recovered" } : { type: "result", subtype: "success", result: "Recovered" };
      const result = await runAgentProcess({ ...input, args: ["-e", `console.log(${JSON.stringify(JSON.stringify(value))})`, "--", "--output-format", format] });
      assert.equal(result.last_message, "Recovered");
      assert.equal(await readFile(outputFile, "utf8"), "Recovered");
    } finally { await rm(home, { recursive: true, force: true }); }
  });
}

test("Shelf returns an unreadable output file as a rejected job", async () => {
  const home = await mkdtemp(join(tmpdir(), "shelf-output-error-"));
  try {
    const outputFile = join(home, "directory"); await mkdir(outputFile);
    await assert.rejects(runAgentProcess({ executable: process.execPath, args: ["-e", "console.log('done')"], workdir: home, outputFile, jobId: "unreadable" }), { code: "EISDIR" });
    assert.equal(isAgentProcessRunning("unreadable"), false);
  } finally { await rm(home, { recursive: true, force: true }); }
});

for (const mode of ["timeout", "cancel"] as const) test(`Shelf ${mode} finishes even when the CLI ignores SIGTERM`, { timeout: 10_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "shelf-stop-"));
  const jobId = `stop-${mode}`, ready = join(home, "ready");
  try {
    const pending = runAgentProcess({ executable: process.execPath,
      args: ["-e", `process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(${JSON.stringify(ready)}, 'ready'); setInterval(() => {}, 100);`],
      workdir: home, outputFile: join(home, "result.txt"), jobId, timeoutMs: mode === "timeout" ? 500 : 5000 });
    const rejected = assert.rejects(pending, { code: mode === "timeout" ? "shelf.timeout" : "shelf.cancelled" });
    if (mode === "cancel") {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await readFile(ready, "utf8").catch(() => "") === "ready") break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal(await readFile(ready, "utf8"), "ready");
      assert.equal(cancelAgentProcess(jobId), true);
    }
    await rejected;
    assert.equal(isAgentProcessRunning(jobId), false);
  } finally { cancelAgentProcess(jobId); await rm(home, { recursive: true, force: true }); }
});
