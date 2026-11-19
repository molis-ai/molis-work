import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { createHostSessionsPorts } from "@molis-ai/molis-work-app-local-host";
import { externalTool } from "@molis-ai/molis-work-contracts/platform/external-tools";

for (const outcome of ["complete", "consumer-cancel", "abort"] as const) {
  test(`QEA-36: real session file ${outcome} releases its signal listener`, async t => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "molis-session-file-")));
    t.after(() => rm(root, { recursive: true, force: true }));
    const home = join(root, "home"), user = join(root, "user"), tool = join(user, ".claude", "projects");
    await mkdir(home); await mkdir(tool, { recursive: true });
    const content = "External transcript\n".repeat(100_000);
    await writeFile(join(tool, "record.jsonl"), content);
    const ports = createHostSessionsPorts(home, () => undefined, () => {}, { homeRoot: user, env: {} });
    const resolved = ports.files.resolveRoot(externalTool("claude-code").data_root!).root;
    const controller = new AbortController(), signal = controller.signal;
    const stream = await ports.files.open(resolved, "record.jsonl", signal);
    if (outcome === "complete") assert.equal(await new Response(stream).text(), content);
    else if (outcome === "consumer-cancel") await stream.cancel();
    else {
      const read = new Response(stream).text();
      controller.abort();
      await assert.rejects(read, "cancellation must not return a successful partial transcript");
    }
    // Web completion may precede the underlying FileHandle close callback.
    const deadline = Date.now() + 2_000;
    while (getEventListeners(signal, "abort").length && Date.now() < deadline) await delay(10);
    assert.equal(getEventListeners(signal, "abort").length, 0);
    if (!signal.aborted) {
      assert.equal(await new Response(await ports.files.open(resolved, "record.jsonl", signal)).text(), content);
      const againDeadline = Date.now() + 2_000;
      while (getEventListeners(signal, "abort").length && Date.now() < againDeadline) await delay(10);
      assert.equal(getEventListeners(signal, "abort").length, 0, "a reused caller signal never accumulates completed streams");
    } else await assert.rejects(ports.files.open(resolved, "record.jsonl", signal), { name: "AbortError" });
  });
}
