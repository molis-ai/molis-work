import assert from "node:assert/strict";
import test from "node:test";
import { fork, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const generation = {
  understanding: { summary: "证据与假设分开", assumptions: ["有访谈资料"], unknowns: ["复盘频率"], concreteness: "direction" },
  cards: [{ title: "访谈复盘", highlight: "找回原话", targetUser: "创始人", scenario: "访谈后", problem: "证据散落", mechanism: "关联原文", valueProposition: "复核判断", whyItMayWork: "已有记录", assumptions: ["愿意记录"], unknowns: ["频率"], mvp: { inScope: ["导入文本"], outOfScope: ["录音"] } }], noCardsReason: null,
};
async function until(check: () => Promise<boolean> | boolean) {
  const deadline = Date.now() + 6000;
  while (!await check()) { if (Date.now() > deadline) assert.fail("Worker state did not settle"); await new Promise(resolve => setTimeout(resolve, 25)); }
}

test("Alchemist independent processes preserve a long live call and recover a killed owner without another model request", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "alchemist-workers-"));
  const children: ChildProcess[] = [], responses: ServerResponse[] = [];
  const server = createServer(async (req, res) => { for await (const _ of req) {} responses.push(res); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const launch = async () => {
    const child = fork(fileURLToPath(new URL("./fixtures/alchemist-worker.ts", import.meta.url)), [join(home, "studio.sqlite"), `http://127.0.0.1:${address.port}`], { execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "pipe", "ipc"] });
    children.push(child); let stderr = "", sequence = 0;
    child.stderr!.on("data", chunk => { stderr += chunk; });
    const pending = new Map<number, { resolve(value: any): void; reject(reason: Error): void }>();
    const ready = Promise.withResolvers<void>();
    child.on("message", (message: any) => {
      if (message.ready) { ready.resolve(); return; }
      const call = pending.get(message.id); if (!call) return; pending.delete(message.id);
      if (message.error || message.status >= 400) call.reject(new Error(JSON.stringify(message)));
      else call.resolve(message.result);
    });
    child.on("error", error => ready.reject(error));
    child.on("exit", () => { ready.reject(new Error(stderr || "worker exited")); for (const call of pending.values()) call.reject(new Error(stderr || "worker exited")); pending.clear(); });
    await ready.promise;
    const send = (input: Record<string, unknown>) => new Promise<any>((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); child.send({ ...input, id }); });
    return { child, send, api: (path: string, body?: unknown) => send({ path, method: body === undefined ? "GET" : "POST", ...(body === undefined ? {} : { body }) }), close: async () => { const closed = once(child, "exit"); await send({ operation: "close" }); await closed; } };
  };
  try {
    const first = await launch(); await first.send({ operation: "start" });
    const { direction } = await first.api("/directions", { description: "帮助创始人通过访谈原话复盘假设" });
    const receipt = await first.api(`/directions/${direction.id}/explorations`, {});
    await until(() => responses.length === 1);
    const second = await launch(); await second.send({ operation: "start" });
    const deadline = Date.now() + 1600; // More than two original 600 ms leases.
    while (Date.now() < deadline) {
      assert.equal((await second.api(`/explorations/${receipt.runId}`)).exploration.status, "running");
      assert.equal(responses.length, 1);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    responses[0]!.writeHead(200, { "content-type": "application/json" }); responses[0]!.end(JSON.stringify(generation));
    await until(async () => (await second.api(`/explorations/${receipt.runId}`)).exploration.status === "completed");
    assert.equal((await first.api(`/explorations/${receipt.runId}`)).exploration.cards.length, 1);
    await second.close();

    const crashed = await first.api(`/directions/${direction.id}/explorations`, {});
    await until(() => responses.length === 2);
    const observer = await launch(); await observer.send({ operation: "start" });
    const exited = once(first.child, "exit"); first.child.kill("SIGKILL"); await exited;
    await until(async () => (await observer.api(`/explorations/${crashed.runId}`)).exploration.status === "failed");
    const failed = (await observer.api(`/explorations/${crashed.runId}`)).exploration;
    assert.equal(failed.errorCode, "AI_CALL_INTERRUPTED"); assert.deepEqual(failed.cards, []);
    assert.equal(responses.length, 2, "The interrupted provider request must not be replayed");
    assert.equal((await observer.api(`/explorations/${receipt.runId}`)).exploration.cards.length, 1);
    await observer.close();
  } finally {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) { const closed = once(child, "exit"); child.kill("SIGKILL"); await closed; }
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});
