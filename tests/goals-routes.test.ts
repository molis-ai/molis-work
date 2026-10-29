import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginRouteMatcher } from "@molis-ai/molis-work-plugin-runtime";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { GOALS_PLUGIN_ID, goalsManifest, goalsRoutes, type GoalsRoutePorts } from "@molis-ai/molis-work-plugin-goals";

// PG094-09: Goals' page operations are declared routes in its Manifest, each answered by one binding in `goalsRoutes`.

interface Invocation { capability_id: string; input: Record<string, unknown> }

function stubPorts(answers: Record<string, unknown> = {}) {
  const invocations: Invocation[] = [];
  const actions: BoundActionClient = {
    discover: async () => [],
    invoke: async <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input) => {
      invocations.push({ capability_id: definition.capability_id, input: input as Record<string, unknown> });
      return (Object.hasOwn(answers, definition.capability_id) ? answers[definition.capability_id] : { ok: true }) as Output;
    },
  };
  // The plugin prefix carries no Host page address and no Host cache: the page joins its own prefix and reads its view on its next
  // request, and a retry key travels in the write's body (BL-386).
  const ports: GoalsRoutePorts = { actions: () => actions };
  return { ports, invocations };
}

function request(method: string, params: Record<string, string>, body: unknown = null, query: Record<string, string> = {}): PluginRouteRequest {
  return { method: method as PluginRouteRequest["method"], pathname: "/api/plugins/io.molis.work.goals/goals", params, query, body, actor_id: LOCAL_PERSON_ACTOR_ID };
}

function binding(route_id: string, ports: GoalsRoutePorts) {
  const found = goalsRoutes(ports).find((candidate) => candidate.route_id === route_id);
  assert.ok(found, `${route_id} has a binding`);
  return found;
}

test("PG094-09: every declared Goals route has exactly one binding, and the Manifest is accepted as written", () => {
  const declared = (goalsManifest.routes ?? []).map((route) => route.route_id);
  const bound = goalsRoutes(stubPorts().ports).map((route) => route.route_id);
  assert.equal(new Set(declared).size, declared.length);
  assert.equal(new Set(bound).size, bound.length);
  assert.deepEqual([...bound].sort(), [...declared].sort());
  assert.deepEqual(parsePluginManifest(structuredClone(goalsManifest)).routes, goalsManifest.routes);
});

test("PG094-09: each plugin-prefix path reaches the route the Manifest declares for it", () => {
  const match = pluginRouteMatcher(goalsManifest);
  const at = (method: string, rest: string) => match(method, `/api/plugins/${GOALS_PLUGIN_ID}${rest}`);
  const goal = { goalId: "goal 1" };
  const cases: Array<[string, string, string, Record<string, string>]> = [
    ["POST", "/goals", "goals.create", {}],
    ["GET", "/goals/directory", "goals.directory", {}],
    ["POST", "/policy-bindings", "goals.policy-save", {}],
    ["GET", "/project-guidance", "goals.guidance-read", {}],
    ["POST", "/project-guidance", "goals.guidance-add", {}],
    ["PATCH", "/project-guidance/g-1", "goals.guidance-update", { guidanceId: "g-1" }],
    ["POST", "/goals/goal%201/relations", "goals.relation-add", goal],
    ["POST", "/relations/r-1/deactivate", "goals.relation-deactivate", { relationId: "r-1" }],
    ["POST", "/goals/goal%201/active", "goals.active", goal],
    ["POST", "/goals/goal%201/archive", "goals.archive", goal],
    ["POST", "/goals/goal%201/trash", "goals.trash", goal],
    ["POST", "/goal-tree-proposals/p-1/decision", "goals.tree-decide", { proposalId: "p-1" }],
    ["GET", "/goals/goal%201/history/h-1", "goals.history-read", { ...goal, itemId: "h-1" }],
    ["GET", "/goals/goal%201/events/e-1", "goals.event-read", { ...goal, eventId: "e-1" }],
    ["GET", "/goals/goal%201/event-state", "goals.event-state", goal],
    ["GET", "/goals/goal%201/event-timeline", "goals.event-timeline", goal],
    ...["event-configure", "event-report", "event-progress", "event-concern", "event-decision-request", "event-agree", "event-close", "event-resume", "event-note"]
      .map((write): [string, string, string, Record<string, string>] => ["POST", `/goals/goal%201/${write}`, `goals.${write}`, goal]),
    ["POST", "/goals/goal%201/event-decision", "goals.event-decision", goal],
    ["GET", "/goals/goal%201/deliverables", "goals.deliverables-read", goal],
    ["POST", "/goals/goal%201/deliverables", "goals.deliverables-write", goal],
    ["GET", "/goals/goal%201/artifact-inputs", "goals.artifact-inputs-read", goal],
    ["POST", "/goals/goal%201/artifact-inputs", "goals.artifact-inputs-write", goal],
    ["POST", "/goals/goal%201/inputs", "goals.inputs", goal],
  ];
  assert.equal(cases.length, goalsManifest.routes?.length);
  for (const [method, rest, route_id, params] of cases) {
    const found = at(method, rest);
    assert.equal(found?.route_id, route_id, `${method} ${rest}`);
    assert.deepEqual(found?.params, params, `${method} ${rest}`);
  }
  // Expected change: a read is only a GET now, so a POST to it is no route at all (it used to be refused with 400).
  assert.equal(at("POST", "/goals/goal-1/event-state"), null);
  assert.equal(at("POST", "/goals/goal-1/event-timeline"), null);
  assert.equal(at("GET", "/goals"), null);
  assert.equal(at("DELETE", "/goals/goal-1/trash"), null);
  assert.throws(() => at("GET", "/goals/%E0%A4%A/event-state"), URIError);
});

test("PG094-09: a Goals binding answers refusals with the shared error body and the status of its kind", async () => {
  const { ports, invocations } = stubPorts({ "goals.history.read": null });
  const refused = await binding("goals.create", ports).handle(request("POST", {}, { title: "目标", owner: "someone" }));
  assert.equal(refused.status, 400);
  assert.equal((refused.body as { code?: string }).code, "actions.input_invalid");

  const missing = await binding("goals.history-read", ports).handle(request("GET", { goalId: "goal-1", itemId: "h-1" }));
  assert.deepEqual(missing, { status: 404, body: { error: "历史记录不存在", code: "goals.event.not_found" } });

  const unexpected = await binding("goals.event-note", ports).handle(request("POST", { goalId: "goal-1" }, { body: "便笺", extra: 1 }));
  assert.equal((unexpected.body as { code?: string }).code, "goals.event_http.unexpected_field");
  const closing = await binding("goals.event-close", ports).handle(request("POST", { goalId: "goal-1" }, { kind: "pause" }));
  assert.equal((closing.body as { code?: string }).code, "goals.event_closure.invalid_kind");
  assert.deepEqual(invocations.map((call) => call.capability_id), ["goals.history.read"]);
});

test("PG094-09: a Goals write reads its path parameter and its retry key from the body", async () => {
  const { ports, invocations } = stubPorts({ "goals.note": { event_id: "e-9" } });
  const answered = await binding("goals.event-note", ports).handle(request("POST", { goalId: "goal 1" }, { body: "便笺", idempotency_key: "body-key" }));
  assert.deepEqual(answered, { status: 200, body: { event_id: "e-9" } });
  assert.deepEqual(invocations, [{ capability_id: "goals.note", input: { goal_id: "goal 1", idempotency_key: "body-key", body: "便笺" } }]);

  // The page always names the act; a write with no key still happens once under a key of its own, never under a request header the
  // Runtime route cannot see (the Host's header key is gone with the old `/api` rewrite).
  const noKey = await binding("goals.event-note", ports).handle(request("POST", { goalId: "goal 1" }, { body: "便笺" }));
  assert.equal(noKey.status, 200);
  assert.match(String((invocations.at(-1)!.input as { idempotency_key: string }).idempotency_key), /^event-note-.+$/u);

  const timeline = await binding("goals.event-timeline", ports).handle(request("GET", { goalId: "goal 1" }, null, { before_cursor: "c-1", limit: "500" }));
  assert.equal(timeline.status, 200);
  assert.deepEqual(invocations.at(-1), { capability_id: "goals.history.list", input: { goal_id: "goal 1", before_cursor: "c-1", limit: 100 } });
});
