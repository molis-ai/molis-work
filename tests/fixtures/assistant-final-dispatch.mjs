// Only isolated source-consumer children preload this public dependency decorator.
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { mock } from "node:test";

const require = createRequire(new URL("../../horizontal/agent-host/package.json", import.meta.url));
const nodeEntry = pathToFileURL(require.resolve("@prologue/sdk/node")).href;
const sdk = await import(nodeEntry);
const boundary = process.env.MOLIS_WORK_TEST_SOURCE_FINAL_BOUNDARY ?? "sdk";
assert.ok(boundary === "sdk" || boundary === "app");
let factoryCalls = 0, armed;

/** Hold one actual handle at its configured existing authorization boundary, preserving the original synchronous fence. */
export function armAssistantFinalDispatch() {
  assert.equal(armed, undefined, "the child arms one model request at a time");
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  // A factory or SDK-contract failure must be reported to the test rather than as an unhandled rejection.
  void entered.promise.catch(() => {});
  const record = { entered, release, boundary, holds: 0, prepared: 0, fenceCalls: 0, appFenceCalls: 0, cancelCalls: 0,
    host: undefined, handle: undefined, sdkAuthorizationPresent: undefined, failure: undefined, refusalInspection: undefined };
  armed = record;
  return {
    entered: entered.promise, release: () => release.resolve(),
    observed: () => ({ factoryCalls, boundary, holds: record.holds, prepared: record.prepared, fenceCalls: record.fenceCalls,
      appFenceCalls: record.appFenceCalls, sdkAuthorizationPresent: record.sdkAuthorizationPresent,
      cancelCalls: record.cancelCalls, failure: record.failure, refusalInspection: record.refusalInspection }),
    inspect: () => { assert.ok(record.host && record.handle); return record.host.inspectModelNetwork(record.handle); },
  };
}

mock.module(nodeEntry, { cache: true, namedExports: { ...sdk, createNodeHost(options) {
  factoryCalls++;
  const executing = new AsyncLocalStorage();
  const beforeNetworkDispatch = options.beforeNetworkDispatch;
  const host = sdk.createNodeHost(boundary === "sdk" ? options : { ...options, beforeNetworkDispatch: async () => {
    // Bounded Session.startRun has no SDK per-handle fence. Hold its real App hook after that hook's own await.
    const originalFence = await beforeNetworkDispatch?.();
    const record = executing.getStore();
    if (!record) return originalFence;
    assert.equal(typeof beforeNetworkDispatch, "function", "the bounded consumer must retain its real App dispatch hook");
    assert.equal(typeof originalFence, "function", "the App hook must return its real source fence");
    record.prepared++; record.holds++; record.entered.resolve();
    await record.release.promise;
    return () => { record.appFenceCalls++; return originalFence(); };
  } });
  const execute = host.executeModelNetwork.bind(host), cancel = host.cancelModelNetwork.bind(host);
  let tracked;
  host.cancelModelNetwork = handle => {
    const result = cancel(handle);
    if (tracked?.handle?.id === handle.id) tracked.cancelCalls++;
    return result;
  };
  host.executeModelNetwork = input => {
    const record = armed;
    if (!record) return execute(input);
    armed = undefined;
    record.host = host; record.handle = input.handle;
    record.sdkAuthorizationPresent = typeof input.beforeDispatch === "function";
    tracked = record;
    const beforeDispatch = input.beforeDispatch;
    const request = boundary === "app" ? input : { ...input, beforeDispatch: async () => {
      assert.equal(typeof beforeDispatch, "function", "this real Agent request must carry its SDK authorization; never supply a synthetic fence");
      const originalFence = await beforeDispatch();
      assert.equal(typeof originalFence, "function", "the SDK must return its real same-handle fence");
      record.prepared++; record.holds++; record.entered.resolve();
      await record.release.promise;
      return () => { const checked = originalFence(); record.fenceCalls++; return checked; };
    } };
    return executing.run(record, () => execute(request)).catch(async error => {
      record.failure = error;
      // Observe refusal before it reaches the consumer; Agent terminal cleanup cancels, bounded Session cleanup does not.
      try { record.refusalInspection = await host.inspectModelNetwork(input.handle); }
      finally { record.entered.reject(error); throw error; }
    });
  };
  return host;
} } });
