import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { SETTINGS_CLIENT_SCRIPT } from "@molis-ai/molis-work-app-workbench";

// DOM ports exercise the shipped script, not a substitute for the native App test.
class Element {
  textContent = ""; hidden = false; disabled = false; open = false; focused = false;
  className = ""; innerHTML = ""; dataset = { webServiceAction: "restart" };
  children: Element[] = [];
  nodes = new Map<string, Element>();
  listeners = new Map<string, (event: { preventDefault(): void }) => unknown>();
  classList = { add() {}, remove() {} };
  setAttribute() {}
  querySelector(selector: string) {
    if (!this.nodes.has(selector)) this.nodes.set(selector, new Element());
    return this.nodes.get(selector)!;
  }
  append(...nodes: Element[]) { this.children.push(...nodes); }
  replaceChildren() { this.children = []; }
  addEventListener(type: string, callback: (event: { preventDefault(): void }) => unknown) { this.listeners.set(type, callback); }
  fire(type: string) { return this.listeners.get(type)?.({ preventDefault() {} }); }
  showModal() { this.open = true; }
  close() { this.open = false; this.fire("close"); }
  focus() { this.focused = true; }
}
function fixture(failure?: "preview" | "confirm" | "restart" | "timeout" | "unowned") {
  const button = new Element(); button.textContent = "重启";
  const body = new Element(); const error = new Element(); error.hidden = true;
  const toast = new Element(); const timers: (() => void)[] = [];
  const requests: { suffix: string; body: Record<string, unknown> }[] = [];
  let clock = 0; let healthReads = 0;
  vm.runInNewContext(SETTINGS_CLIENT_SCRIPT, {
    document: { body, createElement: () => new Element(),
      querySelectorAll: (s: string) => s === "[data-web-service-action]" ? [button] : [],
      querySelector: (s: string) => s === "[data-web-service-error]" ? error : s === "[data-settings-toast]" ? toast : null },
    L: (value: string) => value, molisWorkControlHeaders: () => ({ "x-molis-work-control-token": "token" }),
    setTimeout: (f: () => void, ms: number) => { if (ms === 500) { clock += 1000; f(); } else timers.push(f); }, location: { reload() {} },
    Date: { now: () => clock }, AbortSignal,
    window: { confirm() { throw new Error("Native confirm must not be used"); } },
    fetch: async (url: string, init: { body: string; headers: Record<string, string> }) => {
      if (url === "/health") {
        healthReads++;
        if (healthReads === 1) throw new Error("temporary disconnect");
        return { ok: true, json: async () => ({ status: "ok", service_process_id: failure === "timeout" || healthReads === 2 ? 100 : 200 }) };
      }
      if (url === "/api/settings/web-service") return { ok: true, json: async () => ({ state: "running", owned: failure !== "unowned" }) };
      assert.equal(init.headers["x-molis-work-control-token"], "token");
      const suffix = url.split("/").at(-1)!; const input = JSON.parse(init.body);
      requests.push({ suffix, body: input });
      const failed = failure === "preview" && suffix === "plan" || failure === "confirm" && suffix === "confirm";
      return { ok: !failed, json: async () => failed ? { error: "服务状态已变化，请重新预览" }
        : suffix === "plan" ? { status: "ready", plan_id: "plan-actual", message: "重启 Web", confirmation: "确认重启", changes: [{ operation: "restart", target: "<img src=x onerror=alert(1)>" }] }
        : { status: input.decision === "declined" ? "declined" : ["restart", "timeout", "unowned"].includes(failure ?? "") ? "restarting" : "restarted", previous_process_id: 100, message: "已重启" } };
    },
  });
  return { button, dialog: body.children[0]!, error, toast, requests, timers };
}

for (const scenario of ["restart", "timeout", "unowned"] as const) {
  test(`pending restart ${scenario} requires a different healthy managed process before success`, async () => {
    const f = fixture(scenario); const pending = f.button.fire("click"); await flush();
    f.dialog.querySelector("[data-service-apply]").fire("click"); await pending;
    assert.equal(f.requests.length, 2); // Polling must never repeat the mutation.
    assert.equal(f.button.disabled, false);
    if (scenario === "restart") {
      assert.equal(f.toast.textContent, "常驻服务已重启，连接已恢复"); assert.equal(f.timers.length, 1);
      assert.equal(f.error.hidden, true);
    } else {
      assert.equal(f.error.hidden, false); assert.match(f.error.textContent, /尚未确认/);
      assert.equal(f.timers.length, 0); assert.doesNotMatch(f.toast.textContent, /已重启/);
    }
  });
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

for (const choice of ["confirm", "cancel", "escape"] as const) {
  test(`service dialog ${choice} requires a real decision and consumes the same plan once`, async () => {
    const f = fixture(); const pending = f.button.fire("click"); await flush();
    assert.equal(f.dialog.open, true); assert.equal(f.button.disabled, true);
    assert.equal(f.dialog.querySelector("[data-service-cancel]").focused, true);
    assert.equal(f.requests.length, 1);
    const path = f.dialog.querySelector("[data-service-changes]").children[0]!.children[1]!.children[0]!;
    assert.equal(path.textContent, "<img src=x onerror=alert(1)>"); assert.equal(path.innerHTML, "");
    await f.button.fire("click"); assert.equal(f.requests.length, 1);
    const target = choice === "escape" ? f.dialog : f.dialog.querySelector(choice === "confirm" ? "[data-service-apply]" : "[data-service-cancel]");
    target.fire(choice === "escape" ? "cancel" : "click");
    target.fire(choice === "escape" ? "cancel" : "click");
    await pending;
    assert.deepEqual(f.requests[1], { suffix: "confirm", body: { plan_id: "plan-actual", decision: choice === "confirm" ? "confirmed" : "declined" } });
    assert.equal(f.requests.length, 2); assert.equal(f.button.disabled, false); assert.equal(f.dialog.open, false);
    assert.equal(f.button.focused, true); assert.equal(f.timers.length, choice === "confirm" ? 1 : 0);
  });
}
for (const failure of ["preview", "confirm"] as const) {
  test(`service ${failure} failure leaves usable controls and never reports success`, async () => {
    const f = fixture(failure); const pending = f.button.fire("click"); await flush();
    if (failure === "confirm") f.dialog.querySelector("[data-service-apply]").fire("click");
    await pending;
    assert.equal(f.error.hidden, false); assert.match(f.error.textContent, /重新预览/);
    assert.equal(f.button.disabled, false); assert.equal(f.toast.textContent, ""); assert.equal(f.timers.length, 0);
  });
}
