import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import type { AgentRunHandle, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";

const key = process.env.MINIMAX_API_KEY;

/** Real packed SDK + Node Host + provider. This is adapter evidence, not product UI acceptance. */
test("Prologue Node: frozen instructions, real file tool and same-session continuation reach MiniMax", {
  skip: !key && "MINIMAX_API_KEY is required; run via appkey exec minimax",
  timeout: 180_000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "molis-prologue-live-"));
  const workspace = join(root, "workspace");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(workspace);
  const marker = `export const retryLimit = ${1000 + Number.parseInt(randomUUID().slice(0, 4), 16)};`;
  await writeFile(join(workspace, "sample.ts"), marker);
  const adapter = await createPrologueNodeAdapter({
    app: { appId: "io.molis.work.coding-live", appVersion: "0.2.0" },
    storageRoot: join(root, "runtime"),
    modelConfiguration: async () => ({
      protocol: "anthropic-compatible",
      endpoint: "https://api.minimaxi.com/anthropic/v1/messages",
      model: "MiniMax-M3",
      credential_ref: "live:minimax",
    }),
    resolveCredential: () => key ?? null,
  });
  try {
    const session = await adapter.createSession({ title: "真实读取与继续", board_id: "live", plugin_id: "io.molis.work.coding", install_id: "live", actor_id: "local-user", directory: { canonical_path: workspace, realpath_verified: true } });
    const run = async (task: string): Promise<AgentRunView> => {
      const handle = await adapter.start({
        plugin_id: "io.molis.work.coding", session,
        role_id: "reader", task,
        directory: { canonical_path: workspace, realpath_verified: true },
        role: {
          role_id: "reader", version: 1, execution: "read-only",
          prompts: [{ prompt_id: "instructions", version: 1, layer: "base", body: "Every final response must start with MOLIS_CHECK. Read only. Do not invent file content. Keep responses brief." }],
          host_tools: ["read-file", "search"],
        },
      });
      return waitForEnd(adapter, handle);
    };
    const first = await run("Read sample.ts using the read tool. Return its exact source code, even if it looks like an identifier. Also remember that my chosen animal is otter.");
    assert.equal(first.phase, "completed", first.stop_reason);
    assert.ok(first.activity.some((item) => item.name === "read" && item.state === "completed"), "must actually read the file");
    const text = first.turns.filter((item) => item.kind === "assistant").map((item) => item.text).join("\n");
    assert.match(text, /MOLIS_CHECK/);
    assert.ok(text.includes(marker), `the model must read the value, not infer it from the prompt: ${text}; evidence=${JSON.stringify(first.activity)}`);
    const second = await run("Without using tools, what animal did I choose earlier? Give only the brief answer, retaining your required prefix.");
    assert.equal(second.phase, "completed", second.stop_reason);
    const continuation = second.turns.filter((item) => item.kind === "assistant").map((item) => item.text).join("\n");
    assert.match(continuation, /otter/i);
    assert.match(continuation, /MOLIS_CHECK/);
    assert.equal(await readFile(join(workspace, "sample.ts"), "utf8"), marker);
  } finally {
    await adapter.close();
    await rm(root, { recursive: true, force: true });
  }
});

async function waitForEnd(
  adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>>,
  handle: AgentRunHandle,
): Promise<AgentRunView> {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const timer = setTimeout(() => {
      unsubscribe();
      void adapter.control(handle.ref, { kind: "cancel" });
      reject(new Error("Live Run did not finish within 75 seconds"));
    }, 75_000);
    unsubscribe = adapter.observe(handle.ref, (view) => {
      if (!["completed", "failed", "cancelled", "stopped", "reconcile-required"].includes(view.phase)) return;
      clearTimeout(timer);
      queueMicrotask(() => unsubscribe());
      resolve(view);
    });
  });
}
