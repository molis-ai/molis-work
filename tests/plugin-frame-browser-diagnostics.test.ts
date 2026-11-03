import assert from "node:assert/strict";
import test from "node:test";
import { inputDeliveryDetails, inputDeliveryValues, type InputDeliverySource } from "./fixtures/plugin-frame-browser.js";

// RAC-2408: an input that was not delivered to a plugin frame names the browser version, the window bounds and the page
// viewport, so a small native window (R-73 on Chrome 151) reads as what it is instead of only `covered=undefined`.
test("RAC-2408 input delivery details name the browser version, the window bounds and the page viewport", () => {
  assert.equal(inputDeliveryDetails({ chrome: "Chrome/151.0.7922.47", window: "22,22 756x556", inner: "1440x960" }),
    "; chrome=Chrome/151.0.7922.47; window=22,22 756x556; inner=1440x960");
  assert.equal(inputDeliveryDetails({}), "; chrome=unavailable; window=unavailable; inner=unavailable");
  assert.equal(inputDeliveryDetails({ chrome: "Chrome/153.0.8010.12" }), "; chrome=Chrome/153.0.8010.12; window=unavailable; inner=unavailable");
  assert.equal(inputDeliveryDetails({ window: "0,0 1440x960" }), "; chrome=unavailable; window=0,0 1440x960; inner=unavailable");
});

test("RAC-2443 only the window read failing leaves the window unavailable and the version and viewport intact", async () => {
  const reads: string[] = [];
  const expressions: string[] = [];
  const browser: InputDeliverySource = {
    sessionId: "SESSION-3",
    command: async <T>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> => {
      reads.push(method + " " + JSON.stringify(params) + " " + (sessionId ?? "-"));
      if (method === "Browser.getVersion") return { product: "Chrome/153.0.8010.12" } as T;
      if (method === "Target.getTargetInfo") return { targetInfo: { targetId: "TARGET-1" } } as T;
      throw new Error("Browser.getWindowForTarget closed");
    },
    evaluate: async <T>(expression: string): Promise<T> => { expressions.push(expression); return { width: 1440, height: 960 } as T; },
  };
  assert.deepEqual(await inputDeliveryValues(browser), { chrome: "Chrome/153.0.8010.12", window: undefined, inner: "1440x960" },
    "the window is unavailable, the version and the viewport are still there, and the diagnostics are not swallowed");
  // The full line, not just its method: a read of the wrong target would have been recorded under the same prefix.
  assert.deepEqual(reads, [
    "Browser.getVersion {} -",
    "Target.getTargetInfo {} SESSION-3",
    'Browser.getWindowForTarget {"targetId":"TARGET-1"} -',
  ], "exactly the version read, the target read and the window read for TARGET-1 are recorded");
  assert.deepEqual(expressions, ["({width: innerWidth, height: innerHeight})"], "the viewport is read through the inner size expression");
});

test("RAC-2408 the diagnostics read the version, the target window and the viewport, and reads that fail are left unavailable", async () => {
  const reads: string[] = [];
  const expressions: string[] = [];
  const browser: InputDeliverySource = {
    sessionId: "SESSION-1",
    command: async <T>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> => {
      reads.push(method + " " + JSON.stringify(params) + " " + (sessionId ?? "-"));
      if (method === "Browser.getVersion") return { product: "Chrome/153.0.8010.12" } as T;
      if (method === "Target.getTargetInfo") return { targetInfo: { targetId: "TARGET-1" } } as T;
      return { bounds: { left: 22, top: 22, width: 756, height: 556 } } as T;
    },
    evaluate: async <T>(expression: string): Promise<T> => { expressions.push(expression); return { width: 1440, height: 960 } as T; },
  };
  assert.deepEqual(await inputDeliveryValues(browser), {
    chrome: "Chrome/153.0.8010.12", window: "22,22 756x556", inner: "1440x960",
  });
  assert.deepEqual(reads, [
    "Browser.getVersion {} -",
    "Target.getTargetInfo {} SESSION-1",
    'Browser.getWindowForTarget {"targetId":"TARGET-1"} -',
  ]);
  assert.deepEqual(expressions, ["({width: innerWidth, height: innerHeight})"], "the viewport is read through the inner size expression, once");
  const unreadable: InputDeliverySource = {
    sessionId: "SESSION-2",
    command: async () => { throw new Error("CDP connection closed"); },
    evaluate: async () => { throw new Error("CDP connection closed"); },
  };
  assert.deepEqual(await inputDeliveryValues(unreadable), { chrome: undefined, window: undefined, inner: undefined });
});
