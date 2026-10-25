import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { CODING_STEPS_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-coding";
import { pageText } from "./fixtures/page-text.js";

// specs/ai-input-receipts §4.5, stage 3d-2: a step report that names a supplement offers to open its receipt in the
// conversation, only when the page drew that receipt. The shipped step dialog runs here on a small DOM port.
class Element {
  textContent = ""; children: Array<Element | string> = []; value = ""; disabled = false; open = false; events: string[] = [];
  constructor(public tag: string) {}
  append(...nodes: Array<Element | string>) { this.children.push(...nodes); }
  replaceChildren() { this.children = []; }
  showModal() { this.open = true; }
  close() { this.open = false; this.events.push("close"); }
  all(tag: string): Element[] { return this.children.flatMap(child => typeof child === "string" ? [] : [...(child.tag === tag ? [child] : []), ...child.all(tag)]); }
}

test("RCPT-347, 3d-2: the step dialog links a report to the receipts this page drew, closing itself before one opens", async () => {
  const nodes = new Map<string, Element>(), dialog = new Element("dialog");
  const q = (selector: string) => selector === "[data-coding-step-dialog]" ? dialog : nodes.get(selector) ?? nodes.set(selector, new Element("div")).get(selector)!;
  const opened: string[] = [];
  q("[data-coding-turns]"); // Coding's conversation: the surface its receipts are drawn on.
  const receipts = { link: (owner: Element, inputId: string, first: () => void) => owner === nodes.get("[data-coding-turns]") && inputId === "s1" ? Object.assign(new Element("button"), { textContent: "关于补充「改用新 fixture」", click() { first(); opened.push(`${inputId} after ${dialog.events.join(",")}`); } }) : null };
  const data = { runs: [{ ref: { run_id: "r1" }, phase: "completed" }], taskboard_plans: [{ run_id: "r1", revision: 2, plan: { content: { steps: [{ title: "改登录", acceptance: "测试通过" }] } },
    board: { project_id: "p", version: 4, nodes: [{ id: "step-1", state: "succeeded", reports: [
      { note: "已改用新 fixture", inputs: [{ session_id: "sdk", input_id: "s1" }, { session_id: "sdk", input_id: "earlier" }] }, { note: "跑了测试" }] }] } }] };
  const steps = vm.runInNewContext(`(${CODING_STEPS_CLIENT_FACTORY_SCRIPT})`, {
    document: { createElement: (tag: string) => new Element(tag) }, location: { pathname: "/" }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  })({ lifetime: { alive: true, listen() {} }, translate: pageText("zh"), q, api: async () => data, current: () => "app", status() {}, refresh: async () => {}, prepareRework() {}, receipts }) as { open(id: string, run: string, step: string): Promise<void> };
  await steps.open("app", "r1", "step-1");
  const [named, plain] = nodes.get("[data-coding-step-detail]")!.all("ol")[0]!.children as Element[];
  assert.deepEqual(named!.all("button").map(button => button.textContent), ["关于补充「改用新 fixture」"], "RCPT-347 one button, for the receipt Coding's conversation drew; none for the earlier one it did not");
  assert.equal(plain!.all("button").length, 0, "a report naming no supplement has none");
  named!.all("button")[0]!.click();
  assert.deepEqual(opened, ["s1 after close"], "RCPT-347 the dialog closes first, so focus can land on the receipt");
  assert.equal(dialog.open, false);
});
