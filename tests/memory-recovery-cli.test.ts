import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { dispatchCli, type CliCommandPorts } from "@molis-ai/molis-work-app-cli";
import { runLocalCli } from "@molis-ai/molis-work-app-local-host";
import type { MemoryHomeRecoveryRequest } from "@molis-ai/molis-work-contracts/services/memory";

const request: MemoryHomeRecoveryRequest = { sourceDirectory: "/private/tmp/source-copy", homeDirectory: "/private/tmp/target-copy", operation_id: "original-operation" };
const args = ["memory", "recover-home", "--source-home", request.sourceDirectory, "--target-home", request.homeDirectory, "--operation-id", request.operation_id, "--confirm", "--json"];
const unused = async (): Promise<never> => { throw new Error("ordinary Host or unrelated command must not open"); };
const base: CliCommandPorts = { plugin: unused, install: unused, service: unused, demo: unused, uninstall: unused, v1: unused };
const options = { defaultSourceDirectory: () => { throw new Error("no default Home"); }, withCatalog: unused, runPlugin: unused };
function output(t: TestContext) {
  const stdout: string[] = [], stderr: string[] = [];
  t.mock.method(console, "log", (value: string) => stdout.push(value));
  t.mock.method(console, "error", (value: string) => stderr.push(value));
  return { stdout, stderr };
}

test("Memory recovery CLI requires explicit stopped-copy inputs and confirmation before calling any owner", async t => {
  const printed = output(t); let calls = 0;
  const ports = { ...base, recoverMemoryHome: async (input: MemoryHomeRecoveryRequest) => {
    calls++; return { outcome: "completed" as const, operation_id: input.operation_id, replayed: false };
  } };
  for (const bad of [args.filter(value => value !== "--confirm"), ["memory", "recover-home"],
    [...args, "--target-home", "/private/tmp/another"], [...args, "--unknown"],
    args.map(value => value === request.homeDirectory ? "relative-home" : value),
    ["memory", "recover-home", "--source-home", "--target-home"], ["memory", "restore"]]) {
    assert.equal(await dispatchCli(bad, ports), 1);
  }
  assert.equal(calls, 0); assert.equal(printed.stdout.length, 0);
  assert.equal(await dispatchCli(["memory", "--help"], base), 0);
  assert.equal(await dispatchCli(args, base), 1, "an unmounted maintenance owner does not fall back to ordinary startup");
  assert.equal(calls, 0);
});

test("Memory recovery CLI forwards the original operation and reports only the owner's completed result", async t => {
  const printed = output(t), seen: MemoryHomeRecoveryRequest[] = [];
  const ports = { ...base, recoverMemoryHome: async (input: MemoryHomeRecoveryRequest) => {
    seen.push(input); return { outcome: "completed" as const, operation_id: input.operation_id, replayed: seen.length > 1 };
  } };
  assert.equal(await dispatchCli(args, ports), 0); assert.equal(await dispatchCli(args, ports), 0);
  assert.deepEqual(seen, [request, request]); assert.deepEqual(printed.stderr, []);
  assert.deepEqual(printed.stdout.map(value => JSON.parse(value)), [
    { outcome: "completed", operation_id: request.operation_id, replayed: false },
    { outcome: "completed", operation_id: request.operation_id, replayed: true },
  ]);
});

test("Local CLI waits for the failed recovery's actual close and keeps failure instead of replaying", async t => {
  const printed = output(t), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let calls = 0, closed = 0, settled = false;
  const before = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
  const result = runLocalCli(args, { ...options, recoverMemoryHome: async input => {
    calls++; assert.equal(input.operation_id, request.operation_id); input.assertCurrent();
    throw Object.defineProperty(new Error("original recovery failed"), "close", { value: async () => { entered.resolve(); await release.promise; closed++; } });
  } }).then(code => { settled = true; return code; });
  await entered.promise; assert.equal(settled, false); assert.equal(printed.stdout.length, 0);
  release.resolve(); assert.equal(await result, 1); assert.equal(calls, 1); assert.equal(closed, 1);
  assert.match(printed.stderr.join("\n"), /original recovery failed/);
  assert.deepEqual([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")], before);
});

test("Local CLI cancellation revokes the live recovery capability and still closes only the original attempt", async t => {
  const printed = output(t), entered = Promise.withResolvers<void>(); let closed = 0, calls = 0;
  const before = process.listenerCount("SIGINT");
  const result = runLocalCli(args, { ...options, recoverMemoryHome: input => new Promise((_resolve, reject) => {
    calls++; input.assertCurrent(); input.signal!.addEventListener("abort", () => {
      assert.throws(input.assertCurrent, { name: "AbortError" });
      reject(Object.defineProperty(new Error("recovery cancelled"), "close", { value: async () => { closed++; } }));
    }, { once: true }); entered.resolve();
  }) });
  await entered.promise; process.emit("SIGINT");
  assert.equal(await result, 1); assert.equal(calls, 1); assert.equal(closed, 1);
  assert.equal(printed.stdout.length, 0); assert.match(printed.stderr.join("\n"), /recovery cancelled/);
  assert.equal(process.listenerCount("SIGINT"), before);
});

test("Local CLI close failure remains failed and does not report a completed recovery", async t => {
  const printed = output(t); let closes = 0;
  assert.equal(await runLocalCli(args, { ...options, recoverMemoryHome: async () => {
    throw Object.defineProperty(new Error("original failure"), "close", { value: async () => { closes++; throw new Error("close failed"); } });
  } }), 1);
  assert.equal(closes, 1); assert.equal(printed.stdout.length, 0);
  assert.match(printed.stderr.join("\n"), /关闭也失败.*original-operation/);
  assert.match(printed.stderr.join("\n"), /original failure.*close failed/);
});
