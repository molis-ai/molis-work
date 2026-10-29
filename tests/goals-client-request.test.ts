import assert from "node:assert/strict";
import test from "node:test";
import {
  GOALS_DIALOGS_CLIENT_FACTORY_SCRIPT, GOALS_DOCUMENT_CLIENT_FACTORY_SCRIPT, GOALS_EVENT_DOCUMENT_CLIENT_FACTORY_SCRIPT,
  GOALS_LIFECYCLE_CLIENT_FACTORY_SCRIPT, GOALS_MOMENTUM_CLIENT_FACTORY_SCRIPT, GOALS_POLICY_CLIENT_FACTORY_SCRIPT,
  GOALS_PROPOSAL_CLIENT_FACTORY_SCRIPT, GOALS_RELATION_CLIENT_FACTORY_SCRIPT, PLANNING_ADOPTION_CLIENT_SCRIPT,
  PLANNING_SETTINGS_CLIENT_SCRIPT, PROJECT_RULES_CLIENT_SCRIPT,
} from "@molis-ai/molis-work-plugin-goals";
import { createUiRequest } from "@molis-ai/molis-work-ui-host";

// PG094-09: the Goals clients send every request through the page's one request helper (`molisWorkRequest`), and what a
// person sees stays as it was: a refusal shows the same copy, a Host that never answered says so in the platform's words.

const ORIGIN = "http://127.0.0.1:4999";
interface Sent { url: string; method: string; headers: Record<string, string>; cache: string; body?: string; signal?: AbortSignal }
type Answer = (sent: Sent) => Promise<Response>;

const helper = (answer: Answer) => {
  const sent: Sent[] = [];
  const request = createUiRequest({
    fetch: (url, init) => { const call = { url, ...init }; sent.push(call); return answer(call); },
    origin: ORIGIN, token: () => "control-token", newKey: () => "one-time-key", translate: (text) => text,
  });
  return { request, sent };
};
const json = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });
const unreachable = async (): Promise<Response> => { throw new TypeError("Failed to fetch"); };
// The scripts are page text: run them with the helper standing where the page publishes it.
const factory = <T>(source: string, request: unknown, document: unknown = undefined): (host: object) => T =>
  new Function("molisWorkRequest", "document", `return (${source});`)(request, document);

test("PG094-09: every Goals client script parses and sends no request of its own", () => {
  const factories = {
    GOALS_DIALOGS_CLIENT_FACTORY_SCRIPT, GOALS_DOCUMENT_CLIENT_FACTORY_SCRIPT, GOALS_EVENT_DOCUMENT_CLIENT_FACTORY_SCRIPT,
    GOALS_LIFECYCLE_CLIENT_FACTORY_SCRIPT, GOALS_MOMENTUM_CLIENT_FACTORY_SCRIPT, GOALS_POLICY_CLIENT_FACTORY_SCRIPT,
    GOALS_PROPOSAL_CLIENT_FACTORY_SCRIPT, GOALS_RELATION_CLIENT_FACTORY_SCRIPT,
  };
  const pages = { PLANNING_ADOPTION_CLIENT_SCRIPT, PLANNING_SETTINGS_CLIENT_SCRIPT, PROJECT_RULES_CLIENT_SCRIPT };
  for (const [name, source] of Object.entries(factories)) {
    assert.doesNotThrow(() => new Function(`return (${source});`), name + " does not parse");
  }
  for (const [name, source] of Object.entries(pages)) assert.doesNotThrow(() => new Function(source), name + " does not parse");
  for (const [name, source] of Object.entries({ ...factories, ...pages })) {
    assert.ok(!/(^|[^.\w])fetch\(/.test(source), name + " calls fetch itself");
    assert.ok(!/molisWorkControlHeaders|controlHeaders/.test(source), name + " builds its own control headers");
  }
});

test("PG094-09: archiving a Goal is one write with the control token, and its failures read as before", async () => {
  const run = async (answer: Answer) => {
    const { request, sent } = helper(answer);
    const toasts: Array<[string, boolean | undefined]> = [], visited: string[] = [];
    const client = factory<{ handleGoalLifecycleClick(target: object): Promise<void> | null }>(GOALS_LIFECYCLE_CLIENT_FACTORY_SCRIPT, request)({
      route: (path: string) => "/projects/p1" + path, showToast: (text: string, error?: boolean) => toasts.push([text, error]),
      navigate: (path: string) => visited.push(path),
    });
    const button = { disabled: false, dataset: { goalArchive: "true", goalId: "G 1" } };
    await client.handleGoalLifecycleClick({ closest: (selector: string) => selector === "[data-goal-archive]" ? button : null });
    return { sent, toasts, visited, button };
  };

  const done = await run(json(200, { status: "archived" }));
  assert.deepEqual(done.visited, ["/projects/p1/archive/goals/G%201"]);
  assert.equal(done.sent.length, 1);
  const [write] = done.sent;
  assert.equal(write!.url, ORIGIN + "/projects/p1/api/plugins/io.molis.work.goals/goals/G%201/archive");
  assert.equal(write!.method, "POST");
  assert.equal(write!.cache, "no-store");
  assert.equal(write!.headers["x-molis-work-control-token"], "control-token");
  assert.equal(write!.headers["x-molis-work-idempotency-key"], "one-time-key");
  assert.deepEqual(JSON.parse(write!.body!), { archived: true, reason: "用户在 Molis Work 手动归档已完成 Goal" });

  // The Host's own reason, then the script's fallback when it gives none; the button comes back either way.
  const refused = await run(json(409, { error: "这条 Goal 还没有收尾", code: "goals.not_done" }));
  assert.deepEqual(refused.toasts, [["这条 Goal 还没有收尾", true]]);
  assert.equal(refused.button.disabled, false);
  assert.deepEqual(refused.visited, []);
  assert.deepEqual((await run(json(500, {}))).toasts, [["操作失败", true]]);
  // No answer: the write may or may not have happened, and the toast says so instead of the browser's "Failed to fetch".
  const lost = await run(unreachable);
  assert.deepEqual(lost.toasts, [["不知道这次操作有没有完成，请刷新后核对", true]]);
  assert.equal(lost.button.disabled, false);
});

test("PG094-09: a Goal document read keeps its one refusal copy, and an unreachable Host says so", async () => {
  const fakeDocument = {
    createElement: () => ({ dataset: {}, className: "", textContent: "", setAttribute() {}, remove() {} }),
  };
  const run = async (answer: Answer, goals: string[]) => {
    const { request, sent } = helper(answer);
    const errors: string[] = [], busy: boolean[] = [];
    const pane = {
      setAttribute: (name: string) => { if (name === "aria-busy") busy.push(true); },
      removeAttribute: (name: string) => { if (name === "aria-busy") busy.push(false); },
      querySelector: () => null, prepend() {}, replaceChildren() {},
    };
    const client = factory<{ loadGoalDocument(id: string): Promise<boolean | null> }>(GOALS_DOCUMENT_CLIENT_FACTORY_SCRIPT, request, fakeDocument)({
      documentPane: pane, documentCollection: "current", route: (path: string) => path, translate: (text: string) => text,
      beforeReplace() {}, afterReplace() {}, isAbortError: (error: { name?: string }) => error?.name === "AbortError",
      showError: (message: string) => errors.push(message),
    });
    const results = await Promise.all(goals.map((goal) => client.loadGoalDocument(goal)));
    return { sent, errors, busy, results };
  };

  // The Host names the missing Goal; the pane keeps the copy it has always shown for a read it could not do.
  const missing = await run(json(404, { error: "找不到这个 Goal: GONE", code: "goals.not_found" }), ["GONE"]);
  assert.deepEqual(missing.results, [false]);
  assert.deepEqual(missing.errors, ["无法读取这条 Goal 正文"]);
  assert.deepEqual(missing.busy, [true, false]);
  const [read] = missing.sent;
  assert.equal(read!.url, ORIGIN + "/api/goals/GONE/document?view=current");
  assert.equal(read!.method, "GET");
  assert.equal(read!.cache, "no-store");
  assert.equal(read!.headers["x-molis-work-control-token"], undefined);
  assert.ok(read!.signal instanceof AbortSignal);

  const lost = await run(unreachable, ["CORE"]);
  assert.deepEqual(lost.results, [false]);
  assert.deepEqual(lost.errors, ["连不上 Molis Work 服务，请稍后重试"]);

  // A newer read cancels the older one, which ends quietly.
  const held: Answer = (sent) => sent.url.includes("/OLD/")
    ? new Promise((_resolve, reject) => sent.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))
    : json(404, { error: "找不到这个 Goal: NEW" })();
  const superseded = await run(held, ["OLD", "NEW"]);
  assert.deepEqual(superseded.results, [null, false]);
  assert.deepEqual(superseded.errors, ["无法读取这条 Goal 正文"]);
  assert.equal(superseded.sent[0]!.signal!.aborted, true);
});
