import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { GoalTreeProposalItemInput } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import { goalsActions, goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { openTestHome, type TestHome } from "./fixtures/test-home.js";

const GOALS_PREFIX = "/api/plugins/io.molis.work.goals";

interface CreatedGoal { goal: { goal_id: string }; goal_path: string; observed_event_cursor: number; replayed: boolean }
interface CreatedRelation { relation_id: string; observed_event_cursor: number; replayed: boolean }
interface DecisionReply {
  proposal: { decisions: { actor_id: string; authority_source: string; runtime_actor_id: string | null; message_ref: string }[] };
  replayed: boolean;
}
interface CapsuleReply { tabs: { items: { goal_id: string }[] }[] }

/** The page's headers: writes carry the Host gate's origin, JSON and control token; a per-request key is the caller's. */
async function request<T = unknown>(served: TestHome, method: string, path: string, options: {
  body?: unknown; headers?: Record<string, string>;
} = {}): Promise<{ status: number; body: T | undefined }> {
  const headers: Record<string, string> = { origin: served.origin, ...options.headers };
  if (method !== "GET") {
    headers["content-type"] = "application/json";
    headers["x-molis-work-control-token"] = served.controlToken;
    headers["x-molis-work-idempotency-key"] ??= randomUUID();
  }
  const response = await fetch(served.origin + path, {
    method, headers, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text === "" ? undefined : JSON.parse(text) as T };
}

const page = (served: TestHome, projectId: string) => `/projects/${projectId}`;

const proposalInput = (prefix: string) => ({ summary: "Create a parent and child only after approval", idempotency_key: prefix,
  items: [
    ...["parent", "child"].map(id => ({ item_id: `${prefix}-${id}`, kind: "goal" as const, operation: "create" as const,
      payload: { goal_id: `${prefix}-${id}`, title: id, outcome: "Deliver real work" }, source_refs: ["conversation://tree"], reason: "New work", confidence: 1 })),
    { item_id: `${prefix}-relation`, kind: "relation", operation: "create", payload: { from_goal_id: `${prefix}-child`, to_goal_id: `${prefix}-parent`,
      type: "part_of", reason: "Part of the same result" }, source_refs: ["conversation://tree"], reason: "Define ownership", confidence: 1 },
  ] as GoalTreeProposalItemInput[] });

/** RAC-1510: every Goals route is gone from its old `/api` address, and the Host keeps no dispatcher or mount of its own. */
test("RAC-1510 Goals routes are not served at the old address and the Host no longer mounts them", async t => {
  const served = await openTestHome(t);
  const project = await served.createProject("Goals prefix");
  const base = page(served, project.project_id);
  const created = await request<CreatedGoal>(served, "POST", `${base}${GOALS_PREFIX}/goals`, { body: { title: "Old address target", idempotency_key: randomUUID() } });
  assert.equal(created.status, 201);
  const goalId = created.body!.goal.goal_id;
  const substitutes: Record<string, string> = {
    goalId, itemId: "old-history-item", eventId: "old-event", guidanceId: "old-guidance",
    proposalId: "old-proposal", relationId: "old-relation",
  };
  const routes = goalsManifest.routes ?? [];
  assert.ok(routes.length > 0, "the Goals manifest declares its routes");
  for (const route of routes) {
    const path = route.path.replace(/:([A-Za-z][A-Za-z0-9]*)/gu, (_match, name: string) => substitutes[name] ?? "old-param");
    const answer = await request(served, route.method, `${base}/api${path}`, { body: route.method === "GET" ? undefined : {} });
    assert.equal(answer.status, 404, `${route.route_id} (${route.method} ${path}) must not be served at its old address any more`);
  }
  const hostSources = await sourceFiles(join(fileURLToPath(new URL("../", import.meta.url)), "apps/local-host/src"));
  assert.ok(hostSources.length > 0, "the Host sources are readable");
  for (const { path, source } of hostSources) {
    assert.doesNotMatch(source, /dispatchDeclaredPluginRoutes/u, `${path} keeps the declared-route dispatcher`);
    assert.doesNotMatch(source, /goalsRoutes\s*\(/u, `${path} keeps a Goals mount of its own`);
  }
});

/** RAC-1511: the plugin prefix creates at the Goals prefix, replays by the body key, and needs the key in the body to retry. */
test("RAC-1511 the plugin prefix creates a Goal and a relation retry is only replayable by its body key", async t => {
  const served = await openTestHome(t);
  const project = await served.createProject("Goals prefix writes");
  const base = page(served, project.project_id), prefix = `${base}${GOALS_PREFIX}`;
  // The page keeps its one-time key in the body; the Host's per-request key is fresh for each attempt.
  const create = (bodyKey: string) => request<CreatedGoal>(served, "POST", `${prefix}/goals`, {
    body: { title: "Braced from the plugin prefix", idempotency_key: bodyKey },
  });
  const key = randomUUID(), first = await create(key);
  assert.equal(first.status, 201);
  const goalId = first.body!.goal.goal_id;
  assert.equal(first.body!.goal_path, `/goals/${goalId}`, "the creation reply only names the Goal path inside Goals' own pages");
  assert.equal(base + first.body!.goal_path, `${base}/goals/${goalId}`, "the page prefixes it with the project's route prefix");
  const replay = await create(key);
  assert.equal(replay.status, 201, `replayed creation: ${JSON.stringify(replay.body)}`);
  assert.equal(replay.body!.goal.goal_id, goalId);
  assert.equal(replay.body!.replayed, true);
  const child = await create(randomUUID());
  const childId = child.body!.goal.goal_id;

  const relation = (target: string, bodyKey?: string) => request<CreatedRelation>(served, "POST", `${prefix}/goals/${childId}/relations`, {
    body: { direction: "outgoing", type: "part_of", target_goal_id: target, reason: "Part of the same result",
      ...(bodyKey === undefined ? {} : { idempotency_key: bodyKey }) },
  });
  const bodyKey = randomUUID();
  const one = await relation(goalId, bodyKey);
  assert.equal(one.status, 200, `relation: ${JSON.stringify(one.body)}`);
  const two = await relation(goalId, bodyKey);
  assert.equal(two.status, 200);
  assert.equal(two.body!.relation_id, one.body!.relation_id, "the same body key replays the relation");
  assert.equal(two.body!.replayed, true);
  // A client that only knew the request header (as the relation form did) cannot replay: the first attempt draws a new
  // relation and the second is refused as a duplicate — never the first relation's replay.
  const other = await create(randomUUID());
  const otherId = other.body!.goal.goal_id;
  const three = await relation(otherId);
  assert.equal(three.status, 200, `header-only relation: ${JSON.stringify(three.body)}`);
  const four = await relation(otherId);
  if (four.status === 200) {
    assert.notEqual(four.body!.relation_id, three.body!.relation_id, "a header-only retry makes a new relation");
    assert.equal(four.body!.replayed, false);
  } else {
    assert.equal(four.status, 400, `a header-only retry is not a replay: ${JSON.stringify(four.body)}`);
  }
});

/** RAC-1512: whole confirmation reaches the action policy through the Runtime route's own user_action. */
test("RAC-1512 a whole proposal confirmation at the plugin prefix reaches the action policy with the page's own message", async t => {
  const served = await openTestHome(t);
  const project = await served.createProject("Goals prefix proposals");
  const base = page(served, project.project_id), prefix = `${base}${GOALS_PREFIX}`;
  const caller: ActionCallContext = { actor_id: "runtime:prefix-planner", audit_actor_id: "runtime:prefix-planner", runtime_session_id: "prefix-session",
    actor_kind: "runtime", project_id: project.project_id, audience: "agent", permissions: ["goals:read", "goals:write", "attention:write"] };
  const actions = bindActionClient(served.host.actionClient(project.reference), () => caller);
  const proposal = await actions.invoke(goalsActions.treeSubmit, proposalInput("prefix"));
  const proposalId = proposal.proposal.proposal_id;
  const decisionPath = `${prefix}/goal-tree-proposals/${proposalId}/decision`;
  const bodyKey = randomUUID();
  const decide = (confirmation: boolean, extra: Record<string, unknown> = {}) => request<DecisionReply>(served, "POST", decisionPath, {
    body: { confirm_all_pending: true, reason: "Approve from the protected page", idempotency_key: bodyKey, ...extra },
    headers: { "x-molis-work-idempotency-key": randomUUID(), ...(confirmation ? { "x-molis-work-whole-confirmation": "1" } : {}) },
  });
  const decided = await decide(true);
  assert.equal(decided.status, 200);
  assert.ok(decided.body!.proposal.decisions.length > 0);
  assert.ok(decided.body!.proposal.decisions.every(decision =>
    decision.actor_id === "web-user" && decision.authority_source === "web" && decision.runtime_actor_id === null
    && /^web:.{8,}$/u.test(decision.message_ref)), "the page's message, not a Host-invented one, was recorded");
  const replayed = await decide(true);
  assert.equal(replayed.body!.replayed, true);
  assert.equal((await decide(false)).status, 400);
  assert.equal((await decide(false, { whole_confirmation_prompted: true })).status, 400,
    "a body that claims the confirmation was prompted is not read");
});

/** RAC-1513: a Goal written through the plugin prefix shows up on the project page's next read, cache included. */
test("RAC-1513 a Goal written at the plugin prefix is visible to the project page's next read", async t => {
  const served = await openTestHome(t);
  const project = await served.createProject("Goals prefix reads");
  const base = page(served, project.project_id);
  // Warm the project page's cached view first (the project page is what the old rewrite invalidated through `changed()`): the Goal's
  // title is not on it yet. The Host keeps that view per project (`cachedMolisWorkWebView`) until the journal cursor or a fingerprint
  // changes, so a stale invalidation would hide the write from the page even though the capsule can see it.
  const pageRead = async () => await (await fetch(served.origin + base, { headers: { accept: "text/html" } })).text();
  const before = await pageRead();
  assert.doesNotMatch(before, /Seen on the page's next read/u, "the page was read before the write and does not carry it");
  const created = await request<CreatedGoal>(served, "POST", `${base}${GOALS_PREFIX}/goals`, { body: { title: "Seen on the page's next read", idempotency_key: randomUUID() } });
  assert.equal(created.status, 201);
  const goalId = created.body!.goal.goal_id;
  const after = await pageRead();
  assert.match(after, new RegExp(goalId), "the project page's next read carries the Goal written at the plugin prefix");
  const capsule = await served.web.get<CapsuleReply>(`${base}/api/capsule`);
  assert.ok(capsule.tabs.some(tab => tab.items.some(item => item.goal_id === goalId)),
    "the capsule the page reads lists the Goal written at the plugin prefix");
});

async function sourceFiles(directory: string): Promise<{ path: string; source: string }[]> {
  const entries = (await readdir(directory, { recursive: true })).filter(entry => entry.endsWith(".ts"));
  return Promise.all(entries.map(async entry => ({
    path: join(directory, entry), source: await readFile(join(directory, entry), "utf8"),
  })));
}
