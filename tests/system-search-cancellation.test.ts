import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getEventListeners } from "node:events";
import test, { type TestContext } from "node:test";
import { bindSearchEntriesHandler, defineSearchEntriesAction, defineSubjectContextAction, subjectContext,
  type ActionCallContext, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SearchQueryResponse } from "@molis-ai/molis-work-contracts/services/search";
import { SearchService, type SearchAccess } from "@molis-ai/molis-work-service-search";
import { openTestHome } from "./fixtures/test-home.js";

async function fixture(t: TestContext, scope: "project" | "home") {
  const home = await openTestHome(t, { host: { completeText: null } });
  const project = await home.createProject("Search cancellation");
  const reference = scope === "project" ? project.reference : undefined;
  const prefix = reference ? `/projects/${project.project_id}` : "";
  const entries = defineSearchEntriesAction("fixture.cancel.entries", 1, [{ kind: "cancel_note", title: "Note", surface: "fixture" }], "Notes", [], scope);
  const reader = defineSubjectContextAction("fixture.cancel.reader", 1, "cancel_note", "Read note", [], scope);
  const state = { lists: 0, listInvocations: 0, reads: 0, hold: false, caller: undefined as ActionExecutionContext | undefined };
  const open = SearchService.prototype.open;
  t.mock.method(SearchService.prototype, "open", function (this: SearchService, access: SearchAccess, input: Parameters<typeof open>[1]) {
    const client = new Proxy(access.client, {
      get(target, property, receiver) {
        if (property !== "invoke") return Reflect.get(target, property, receiver);
        return (...args: Parameters<typeof target.invoke>) => {
          if (args[1].capability_id === entries.capability_id) state.listInvocations++;
          return target.invoke(...args);
        };
      },
    });
    return open.call(this, { ...access, client }, input);
  });
  const entered = Promise.withResolvers<void>(), released = Promise.withResolvers<void>(), cancelled = Promise.withResolvers<void>();
  const dispose = home.host.actionRegistry(reference).registerProvider({
    provider: { provider_id: "platform", title: "Cancellation notes", kind: "system", ...(reference ? { project_id: project.project_id } : {}) },
    definitions: [entries, reader], handlers: [
      bindSearchEntriesHandler(entries, () => {
        state.lists++;
        return [{ subject: { kind: "cancel_note", id: "one" }, revision: "1", title: "quartz note", summary: "quartz", updated_at: null, content: "context", open: { surface: "fixture", id: "one" } }];
      }),
      { ...reader, handle: async (caller: ActionExecutionContext) => {
        state.reads++;
        if (state.hold) {
          state.caller = caller;
          const abort = () => cancelled.resolve();
          caller.signal?.addEventListener("abort", abort, { once: true });
          entered.resolve();
          try {
            await Promise.race([released.promise, cancelled.promise]);
            caller.signal?.throwIfAborted();
          } finally { caller.signal?.removeEventListener("abort", abort); }
        }
        return subjectContext({ subject: { kind: "cancel_note", id: "one" }, revision: "1", title: "quartz note", content: "quartz body", goal_ids: [] });
      } },
    ],
  });
  t.after(() => { released.resolve(); dispose(); });
  const request = (route: string, body?: object, signal?: AbortSignal) => fetch(`${home.origin}${prefix}/api/search/${route}`, {
    method: route === "status" ? "GET" : "POST", signal,
    headers: { origin: home.origin, "x-molis-work-control-token": home.controlToken, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID() },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const first = await request("query", { query: "quartz", scope: scope === "project" ? "project" : "personal" });
  assert.equal(first.status, 200, await first.clone().text());
  const hit = (await first.json() as SearchQueryResponse).hits.find(hit => hit.subject.kind === "cancel_note");
  assert.ok(hit, "the real owner's content reached the index");
  return { ...home, state, entered, released, cancelled, request, hit };
}

for (const scope of ["home", "project"] as const) {
  test(`QEA-11/12 · ${scope} HTTP search keeps route contracts and does not cancel normal completion`, { timeout: 60_000 }, async t => {
    const home = await fixture(t, scope);
    const signals: (AbortSignal | undefined)[] = [];
    for (const method of ["query", "open", "status"] as const) {
      const original = SearchService.prototype[method];
      t.mock.method(SearchService.prototype, method, function (this: SearchService, access: { caller: ActionCallContext }, input: never) {
        signals.push(access.caller.signal);
        return Reflect.apply(original, this, [access, input]);
      });
    }
    for (const [route, body] of [
      ["query", { query: "quartz" }], ["references", { query: "quartz", kinds: ["cancel_note"] }],
      ["open", { hit_id: home.hit.hit_id }], ["status", undefined],
    ] as const) {
      const response = await home.request(route, body);
      assert.equal(response.status, scope === "home" && route === "references" ? 400 : 200, await response.clone().text());
      const result = await response.json() as { code?: string };
      if (scope === "home" && route === "references") assert.equal(result.code, "actions.project_required");
    }
    assert.equal(signals.length, 4);
    assert.ok(signals.every(signal => signal instanceof AbortSignal), "every real search invocation inherits its HTTP request's signal");
    assert.ok(signals.every(signal => !signal!.aborted), "normal response completion must not cancel a completed operation");
    assert.ok(signals.every(signal => getEventListeners(signal!, "abort").length === 0), "completed action signals retain no abort listeners");
  });

  test(`QEA-11/13 · ${scope} HTTP abandonment cancels the owner read and the next open succeeds once`, { timeout: 60_000 }, async t => {
    const home = await fixture(t, scope);
    const before = { lists: home.state.lists, listInvocations: home.state.listInvocations, reads: home.state.reads };
    home.state.hold = true;
    const abort = new AbortController();
    const request = home.request("open", { hit_id: home.hit.hit_id }, abort.signal);
    const refused = assert.rejects(request, { name: "AbortError" });
    try {
      await home.entered.promise;
      abort.abort();
      await refused;
      await Promise.race([home.cancelled.promise, new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error("the HTTP disconnect did not reach the owner read")), 5_000);
        home.cancelled.promise.then(() => clearTimeout(timer));
      })]);
      assert.equal(home.state.caller?.signal?.aborted, true);
    } finally { home.state.hold = false; home.released.resolve(); }
    const response = await home.request("open", { hit_id: home.hit.hit_id });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal((await response.json() as { state: string }).state, "ok");
    assert.equal(home.state.reads - before.reads, 2, "one cancelled read, one successful new read");
    assert.equal(home.state.lists, before.lists, "cancellation is not an unavailable-object fallback or index invalidation");
    assert.equal(home.state.listInvocations, before.listInvocations, "no fallback invocation reaches the client, even one Host preparation would reject");
    assert.equal(getEventListeners(home.state.caller!.signal!, "abort").length, 0, "the abandoned owner read retains no abort listeners");
  });
}
