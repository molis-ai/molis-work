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

test("RAC-2408 the diagnostics read the version, the target window and the viewport, and reads that fail are left unavailable", async () => {
  const reads: string[] = [];
  const browser: InputDeliverySource = {
    sessionId: "SESSION-1",
    command: async <T>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> => {
      reads.push(method + " " + JSON.stringify(params) + " " + (sessionId ?? "-"));
      if (method === "Browser.getVersion") return { product: "Chrome/153.0.8010.12" } as T;
      if (method === "Target.getTargetInfo") return { targetInfo: { targetId: "TARGET-1" } } as T;
      assert.equal(method, "Browser.getWindowForTarget");
      assert.equal(params.targetId, "TARGET-1", "the window is read for the page target, not the browser");
      return { bounds: { left: 22, top: 22, width: 756, height: 556 } } as T;
    },
    evaluate: async <T>(expression: string): Promise<T> => {
      assert.match(expression, /innerWidth/u);
      return { width: 1440, height: 960 } as T;
    },
  };
  assert.deepEqual(await inputDeliveryValues(browser), {
    chrome: "Chrome/153.0.8010.12", window: "22,22 756x556", inner: "1440x960",
  });
  assert.deepEqual(reads, [
    "Browser.getVersion {} -",
    "Target.getTargetInfo {} SESSION-1",
    'Browser.getWindowForTarget {"targetId":"TARGET-1"} -',
  ]);
  const unreadable: InputDeliverySource = {
    sessionId: "SESSION-2",
    command: async () => { throw new Error("CDP connection closed"); },
    evaluate: async () => { throw new Error("CDP connection closed"); },
  };
  assert.deepEqual(await inputDeliveryValues(unreadable), { chrome: undefined, window: undefined, inner: undefined });
});
