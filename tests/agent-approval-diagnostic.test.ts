import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { inspectAgentApprovals } from "../scripts/agent-approval-diagnostic.mjs";
import { APPROVAL_CHECK, publishAgentApprovals } from "../scripts/agent-approval-publisher.mjs";

const api = "https://git.example.test";
const repository = "example/work";
const prefix = "/repos/" + repository + "/";
const base = "1".repeat(40), head = "2".repeat(40), old = "3".repeat(40);
const tree = "4".repeat(40), github = "5".repeat(40), pull = 9;
const date = (day: number) => `2026-10-${String(day).padStart(2, "0")}T12:00:00Z`;
const user = (id: number, login: string, type = "User") => ({ id, login, type });
const author = user(1, "author"), reviewer = user(2, "reviewer"), agent = user(3, "agent");
const writer = user(4, "writer"), excluded = user(5, "excluded"), forkAuthor = user(6, "fork");
const bot = user(7, "automation", "Bot");
const app = 20;
const review = (id: number, account: typeof author, state: string, day: number, commit_id = head) =>
  ({ id, user: account, state, submitted_at: date(day), commit_id });
const comment = (id: number, account: typeof author, body: string, day = 5) =>
  ({ id, node_id: "comment-" + id, user: account, body, created_at: date(day), updated_at: date(day) });

function fixture() {
  const policy = Buffer.from(JSON.stringify({ required_approvals: 2, agent_ids: [agent.id], excluded_ids: [excluded.id], agent_check_app_ids: [17] }));
  const blob = createHash("sha1").update("blob " + policy.length + "\0").update(policy).digest("hex");
  const pr = { id: 10, number: pull, state: "open", commits: 2, user: author,
    title: "/approve " + head, body: "/approve " + head,
    base: { sha: base, ref: "main", repo: { id: 23, full_name: repository } },
    head: { sha: head, ref: "trusted/please-merge", repo: { id: 24, full_name: "fork/work" } } };
  const commit = { sha: old, author: agent, committer: author, commit: { verification: { verified: true } } };
  const second = { ...commit, sha: head, author };
  const state = { pr, commits: [commit, second], configured: true, corruptBlob: false, missingTree: false, truncateCompare: false,
    reviews: [] as ReturnType<typeof review>[], comments: [] as ReturnType<typeof comment>[], edited: new Set<number>(),
    permissions: new Map([author, reviewer, writer, forkAuthor, agent, excluded, bot].map(account => [account.login,
      { user: account, permission: account === forkAuthor ? "read" : "write" }])),
    resolved: head, statuses: [] as Array<{ state: string; context: string; description: string; creator: typeof bot }>,
    publishedComments: [] as Array<{ id: number; body: string; user: typeof bot; performed_via_github_app: { id: number } }>,
    checks: [] as Array<{ app: { id: number }; head_sha: string; pull_requests: Array<{ number: number; base: typeof pr.base; head: typeof pr.head }> }>,
    onRead: (_route: string, _count: number) => {} };
  const requests = new Map<string, number>();
  const response = (body: unknown, link?: string) => Response.json(body, link ? { headers: { link: `<${api}${prefix}${link}>; rel="next"` } } : {});
  const fetchFixture: typeof globalThis.fetch = async (input, options) => {
    const url = new URL(String(input));
    const route = url.pathname.slice(prefix.length) + url.search;
    const key = url.pathname === "/graphql" ? "/graphql" : route;
    const count = (requests.get(key) ?? 0) + 1;
    requests.set(key, count);
    state.onRead(key, count);
    assert.equal(url.origin, api);
    if (key === "/graphql") {
      assert.equal(options?.method, "POST");
      const body = JSON.parse(String(options?.body)) as { query: string; variables: { ids: string[] } };
      assert.match(body.query, /^query\(/);
      return response({ data: { nodes: body.variables.ids.map(id => {
        const row = state.comments.find(item => item.node_id === id)!;
        return { id, body: row.body, isMinimized: false, lastEditedAt: state.edited.has(row.id) ? date(8) : null, editor: null };
      }) } });
    }
    assert.ok(url.pathname.startsWith(prefix));
    if (route === "issues/" + pull + "/comments" && options?.method === "POST") {
      const saved = { id: 501, body: JSON.parse(String(options.body)).body, user: bot, performed_via_github_app: { id: app } };
      state.publishedComments.push(saved);
      return response(saved);
    }
    if (route === "issues/comments/501" && options?.method === "PATCH") {
      const saved = state.publishedComments[0]!;
      saved.body = JSON.parse(String(options.body)).body;
      return response(saved);
    }
    if (route === "statuses/" + head && options?.method === "POST") {
      const saved = { ...JSON.parse(String(options.body)), creator: bot };
      state.statuses.unshift(saved);
      return response(saved);
    }
    assert.equal(options?.method ?? "GET", "GET");
    if (route === "pulls/" + pull) return response(state.pr);
    if (route === "git/commits/" + base) return response({ sha: base, tree: { sha: tree } });
    if (route === "git/trees/" + tree) return state.missingTree ? new Response(null, { status: 404 }) :
      response({ sha: tree, truncated: false, tree: [{ path: ".github", mode: "040000", type: "tree", sha: github }] });
    if (route === "git/trees/" + github) return response({ sha: github, truncated: false, tree: state.configured
      ? [{ path: "agent-approval.json", mode: "100644", type: "blob", sha: blob, size: policy.length }] : [] });
    if (route === "git/blobs/" + blob) return response({ sha: blob, encoding: "base64", size: policy.length,
      content: (state.corruptBlob ? Buffer.alloc(policy.length, 32) : policy).toString("base64") });
    if (route === "compare/" + base + "..." + head + "?per_page=100") return response({ commits: state.commits.slice(0, 1) },
      state.truncateCompare ? undefined : "compare/" + base + "..." + head + "?per_page=100&page=2");
    if (route === "compare/" + base + "..." + head + "?per_page=100&page=2") return response({ commits: state.commits.slice(1) });
    if (route === "pulls/" + pull + "/reviews?per_page=100") return response(state.reviews);
    if (route === "issues/" + pull + "/comments?per_page=100") return response([...state.comments, ...state.publishedComments]);
    if (route === "commits/" + head + "/statuses?per_page=100") return response(state.statuses);
    if (route === "commits/" + head + "/check-runs?per_page=100&filter=all") return response({ check_runs: state.checks });
    if (route === "commits/" + head.slice(0, 12)) return state.resolved ? response({ sha: state.resolved }) : new Response(null, { status: 404 });
    const match = /^collaborators\/([^/]+)\/permission$/.exec(route);
    if (match) return response(state.permissions.get(match[1]!));
    assert.fail("Unexpected GitHub request " + route);
  };
  return { state, requests, inspect: () => inspectAgentApprovals({ repository, pull, token: "read-fixture", api, fetch: fetchFixture }),
    publish: (repositoryId = 23) => publishAgentApprovals({ repository, repositoryId, pull, appId: app, appBotId: bot.id,
      token: "app-fixture", api, fetch: fetchFixture }) };
}

test("APR-01/02/04: counts current write permissions and two distinct accounts, including the PR author", async () => {
  const { state, requests, inspect } = fixture();
  state.reviews = [review(1, author, "APPROVED", 1), review(2, reviewer, "APPROVED", 2), review(3, agent, "APPROVED", 2),
    review(4, excluded, "APPROVED", 2), review(5, forkAuthor, "APPROVED", 2), review(6, bot, "APPROVED", 2)];
  state.comments = [comment(9, author, "/approve " + head), comment(10, reviewer, "/approve " + head)];
  const result = await inspect();
  assert.equal(result.state, "votes-met");
  assert.deepEqual(result.reasons, ["commit", "conversation"]);
  assert.deepEqual(result.counted, [{ login: "author", id: 1, kind: "review" }, { login: "reviewer", id: 2, kind: "review" }]);
  assert.equal(requests.get("collaborators/author/permission"), 2);
  assert.equal(requests.has("collaborators/agent/permission"), false);
});

test("APR-03/05: rejects old, ambiguous, edited and withdrawn approvals and ignores PR prose", async () => {
  const { state, inspect } = fixture();
  state.reviews = [review(1, author, "APPROVED", 1, old), review(2, reviewer, "APPROVED", 2),
    review(3, reviewer, "CHANGES_REQUESTED", 6), review(4, writer, "DISMISSED", 6)];
  state.comments = [comment(1, author, "/approve " + head.slice(0, 12)), comment(2, reviewer, "/approve " + head),
    comment(3, reviewer, "> /approve " + head, 8), comment(4, writer, "/approve " + head, 8), comment(5, author, "/approve " + head, 8)];
  state.resolved = old;
  state.edited.add(5);
  const result = await inspect();
  assert.equal(result.state, "awaiting-approvals");
  assert.equal(result.missing, 2);
  assert.deepEqual(result.counted, []);
  assert.deepEqual(result.expired, [{ login: "author", sha: old }]);
  state.resolved = head;
  state.comments.push(comment(6, reviewer, "/approve " + head, 8));
  assert.deepEqual((await inspect()).counted?.map(row => row.login), ["author", "reviewer"]);
});

test("APR-01/09: reads only the exact base policy and refuses partial or inconsistent GitHub data", async () => {
  const { state, requests, inspect } = fixture();
  state.configured = false;
  assert.deepEqual(await inspect(), { state: "disabled", base, head, pull });
  assert.equal([...requests.keys()].some(key => key.startsWith("compare/")), false);
  state.missingTree = true;
  await assert.rejects(inspect, /GitHub read failed \(404\)/);
  state.missingTree = false;
  state.configured = true;
  state.corruptBlob = true;
  await assert.rejects(inspect, /complete base approval policy/);
  state.corruptBlob = false;
  state.truncateCompare = true;
  await assert.rejects(inspect, /complete PR head/);
});

test("APR-01/02: exact PR association and current facts are required through the final read", async () => {
  const { state, inspect } = fixture();
  state.commits[0] = { ...state.commits[0]!, author };
  const run = { app: { id: 17 }, head_sha: head, pull_requests: [{ number: pull, base: state.pr.base, head: state.pr.head }] };
  state.checks = [{ ...run, pull_requests: [{ ...run.pull_requests[0]!, number: 10 }] }];
  assert.equal((await inspect()).state, "human");
  state.checks = [run];
  assert.deepEqual((await inspect()).reasons, ["agent-run"]);
  const permission = state.permissions.get(author.login)!;
  state.reviews = [review(1, author, "APPROVED", 1), review(2, reviewer, "APPROVED", 1)];
  state.onRead = (key, count) => {
    if (key === "collaborators/author/permission" && count === 2) state.permissions.set(author.login, { ...permission, permission: "read" });
  };
  await assert.rejects(inspect, /permissions changed/);
});

test("APR-06: the independent publisher reuses only its own sticky comment and fences the current policy", async () => {
  const { state, requests, publish } = fixture();
  const imitation = "<!-- molis-agent-approval:23:9 -->\nAuthor text";
  state.comments = [comment(1, author, imitation)];
  state.reviews = [review(1, author, "APPROVED", 1, old)];
  await Promise.all([publish(), publish()]);
  assert.equal(state.statuses.length, 1);
  assert.equal(state.statuses[0]?.state, "failure");
  assert.equal(state.statuses[0]?.context, APPROVAL_CHECK);
  assert.equal(state.publishedComments.length, 1);
  assert.match(state.publishedComments[0]!.body, /缺 2 票/u);
  assert.match(state.publishedComments[0]!.body, new RegExp(old));
  assert.equal(state.comments[0]?.body, imitation);
  assert.equal(requests.get("issues/9/comments"), 1);

  state.comments.push(comment(2, author, "/approve " + head));
  state.reviews.push(review(2, reviewer, "APPROVED", 2));
  assert.equal((await publish()).published, "success");
  assert.equal(state.publishedComments.length, 1);
  assert.match(state.publishedComments[0]!.body, /@author, @reviewer/u);
  assert.equal(state.statuses[0]?.state, "success");
});

test("APR-06: a different repository or a withdrawn vote cannot publish a stale result", async () => {
  const { state, publish } = fixture();
  state.reviews = [review(1, author, "APPROVED", 1), review(2, reviewer, "APPROVED", 2)];
  await assert.rejects(publish(62), /PR changed/);
  assert.equal(state.publishedComments.length, 0);
  assert.equal(state.statuses.length, 0);
  state.onRead = route => {
    if (route === "issues/9/comments") state.reviews.push(review(3, author, "CHANGES_REQUESTED", 3));
  };
  await assert.rejects(publish(), /Approval facts changed/);
  assert.equal(state.statuses.length, 0);
  state.onRead = () => {};
  assert.equal((await publish()).published, "failure");
  assert.equal(state.publishedComments.length, 1);
  assert.match(state.publishedComments[0]!.body, /缺 1 票/u);
});
