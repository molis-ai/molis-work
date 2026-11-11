import { UI_HOST_CLIENT_CODES } from "@molis-ai/molis-work-contracts/platform/ui";
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { createUiRequest } from "@molis-ai/molis-work-ui-host";
import { registration as codingRegistration } from "@molis-ai/molis-work-plugin-coding/registration";
import { pageText } from "./fixtures/page-text.js";

// W3-02-C: the Coding MCP settings section decides "this project has not enabled Coding" from the platform's code, `actions.plugin_disabled`
// (the code the action layer and the Runtime router give that fact), and then offers the person a button to enable it. The shipped script runs
// here against a small DOM port, the way tests/web-service-settings-client.test.ts runs its script.
class FakeElement {
  #text = "";
  get textContent() { return this.#text; }
  set textContent(value: string) { this.#text = value; this.children = []; }
  hidden = false; disabled = false; value = ""; checked = false; className = ""; type = "";
  dataset: Record<string, string> = {};
  isConnected = true;
  children: FakeElement[] = [];
  readonly elements = { namedItem: (name: string) => this.part(`field:${name}`) };
  readonly #parts = new Map<string, FakeElement>();
  readonly #listeners = new Map<string, ((event: { preventDefault(): void }) => unknown)[]>();
  part(key: string) {
    if (!this.#parts.has(key)) this.#parts.set(key, new FakeElement());
    return this.#parts.get(key)!;
  }
  querySelector(selector: string) { return this.part(selector); }
  querySelectorAll(_selector: string): FakeElement[] { return []; }
  append(...nodes: (FakeElement | string)[]) { this.children.push(...nodes.filter((node): node is FakeElement => typeof node !== "string")); }
  replaceChildren(...nodes: FakeElement[]) { this.children = nodes; }
  addEventListener(type: string, listener: (event: { preventDefault(): void }) => unknown) { this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]); }
  fire(type: string) { return Promise.all((this.#listeners.get(type) ?? []).map(listener => listener({ preventDefault() {} }))); }
  setAttribute() {}
  reset() {}
  focus() {}
}

interface Answer { readonly ok: boolean; readonly status: number; readonly body: unknown }
const answer = (status: number, body: unknown): Answer => ({ ok: status < 400, status, body });

/** The page's `molisWorkRequest`, built from the package's public factory over the fixture's fake network (as the page program builds it). */
type RequestLog = { url: string; method: string; body?: unknown };
function pageRequest(answers: (url: string, method: string) => Answer, requests: RequestLog[] = []) {
  return createUiRequest({
    fetch: async (input, init) => {
      const url = new URL(input, "http://127.0.0.1:1").pathname, found = answers(url, init.method);
      requests.push({ url, method: init.method, ...(typeof init.body === "string" ? { body: JSON.parse(init.body) } : {}) });
      return new Response(JSON.stringify(found.body), { status: found.status });
    },
    origin: "http://127.0.0.1:1", token: () => "token", newKey: () => "key", translate: text => text,
  }, UI_HOST_CLIENT_CODES);
}

function fixture(answers: (url: string, method: string) => Answer, locale: "zh" | "en" = "zh") {
  const root = new FakeElement(); root.dataset.prefix = "/projects/project-1/";
  const document = Object.assign(new FakeElement(), { createElement: () => new FakeElement() });
  document.querySelector = (selector: string) => selector === "[data-coding-mcp-settings]" ? root : null;
  const requests: RequestLog[] = [];
  const timers = { started: [] as number[], cleared: [] as number[] };
  const location = { origin: "http://127.0.0.1:1", reloads: 0, reload() { this.reloads++; } };
  // RAC-2849: exercise the client the three consumers actually receive from the registration.
  const client = codingRegistration.workbench.settingsClient;
  assert.ok(client);
  vm.runInNewContext(client, {
    document, location, URL, molisWorkRequest: pageRequest(answers, requests), L: pageText(locale), // the page's translator, as the Host's pages define it
    setInterval: () => { timers.started.push(timers.started.length + 1); return timers.started.length; },
    clearInterval: (id: number) => { timers.cleared.push(id); },
  });
  const status = root.part("[data-mcp-status]");
  const settled = () => new Promise<void>(resolve => setImmediate(resolve));
  return { status, requests, timers, location, settled };
}

const NOT_ENABLED_ANSWER = answer(403, { error: "此项目未启用该插件", code: "actions.plugin_disabled" });
const STATE = "/projects/project-1/api/plugins/io.molis.work.coding/state";
const MEMBERSHIP = "/api/settings/project-plugins";
const ENABLE = "/api/settings/projects/project-1/plugins";
const observation = (revision: string) => answer(200, { projects: [{ project_id: "project-1", plugins: ["goals"], hidden: [], revision }] });

test("a project that has not enabled Coding shows the enable button, on the platform's code, and stops polling", async () => {
  const page = fixture(url => url === STATE ? NOT_ENABLED_ANSWER : url === MEMBERSHIP ? observation("first") : answer(500, {}));
  await page.settled();
  assert.equal(page.status.textContent, "当前项目尚未启用 Coding。启用后即可选择已授权工具，不会自动执行工具。");
  assert.equal(page.status.children.length, 1);
  assert.equal(page.status.children[0]!.textContent, "为当前项目启用 Coding");
  assert.deepEqual(page.timers.cleared, page.timers.started, "the poll that was started is the one that stopped");
});

test("another failure only says that the state cannot be read: no enable button, the poll keeps going", async () => {
  const page = fixture(url => url.endsWith(STATE) ? answer(403, { error: "没有权限", code: "actions.forbidden" }) : answer(500, {}));
  await page.settled();
  assert.equal(page.status.textContent, "MCP 状态暂不可读：没有权限");
  assert.equal(page.status.children.length, 0);
  assert.deepEqual(page.timers.cleared, []);
});

test("SPC-C08 enabling Coding uses the observation shown with the button, and retry reads before offering the action again", async () => {
  let enabling = answer(409, { error: "项目插件成员已经变了，请刷新后再改", code: "actions.conflict" });
  let revision = "first";
  const page = fixture((url, method) => url === STATE ? NOT_ENABLED_ANSWER : url === MEMBERSHIP ? observation(revision)
    : url === ENABLE && method === "POST" ? enabling : answer(500, {}));
  await page.settled();
  revision = "second";
  await page.status.children[0]!.fire("click");
  await page.settled();
  assert.equal(page.location.reloads, 0);
  assert.equal(page.status.children.length, 1);
  assert.equal(page.status.children[0]!.textContent, "为当前项目启用 Coding");
  assert.match(page.status.textContent, /项目插件成员已经变了/u);
  assert.equal(page.requests.filter(request => request.method === "POST").length, 1, "re-reading does not retry a write");

  enabling = answer(200, {});
  await page.status.children[0]!.fire("click");
  assert.deepEqual(page.requests.filter(request => request.method === "POST"), ["first", "second"].map(expected_revision => ({
    url: ENABLE, method: "POST", body: { plugin_id: "coding", expected_revision },
  })));
  assert.equal(page.location.reloads, 1);
});

test("SPC-C08 a committed Coding membership change leaves the refresh message and no second enable button", async () => {
  const page = fixture(url => url === STATE ? NOT_ENABLED_ANSWER : url === MEMBERSHIP ? observation("first") : answer(503, {
    error: "插件选择已保存，切换尚未完成。请刷新项目。", code: "host.project_plugins_refresh_failed", details: {
      committed: true, membership: { plugins: ["coding", "goals"], hidden: [], revision: "committed" },
    },
  }));
  await page.settled();
  await page.status.children[0]!.fire("click");
  assert.match(page.status.textContent, /插件选择已保存/u);
  assert.equal(page.status.children.length, 0);
  assert.equal(page.location.reloads, 0);
  assert.equal(page.requests.filter(request => request.method === "POST").length, 1);
});

// specs/visual-ui-experience VUX-40: on an English page the MCP settings say "Coding isn't enabled" and offer the button in English.
test("VUX-40: the MCP settings speak the page's language when the project has not enabled Coding", async () => {
  const page = fixture(url => url === STATE ? NOT_ENABLED_ANSWER : url === MEMBERSHIP ? observation("first") : answer(500, {}), "en");
  await page.settled();
  assert.equal(page.status.textContent, "Coding isn't enabled in this project yet. Once it is, you can choose authorized tools; none run automatically.");
  assert.equal(page.status.children[0]!.textContent, "Enable Coding in this project");
});
