import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { inspectAgentApprovals } from "../scripts/agent-approval-diagnostic.mjs";
import { APPROVAL_CHECK, mergeGroupMembers, publishAgentApprovals, publishMergeGroupApprovals } from "../scripts/agent-approval-publisher.mjs";
import { EMPTY_TREE_OID } from "../scripts/agent-approval-squash-proof.mjs";

const execFileAsync = promisify(execFile);

const api = "https://git.example.test";
const repository = "example/work";
const prefix = "/repos/" + repository + "/";
const base = "1".repeat(40), head = "2".repeat(40), old = "3".repeat(40);
const tree = "4".repeat(40), github = "5".repeat(40), pull = 9;
const earlierBase = "6".repeat(40), firstMerge = "7".repeat(40), groupHead = "8".repeat(40), otherHead = "9".repeat(40);
const otherPull = 11, groupRef = "refs/heads/gh-readonly-queue/main/a-current-group";
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

interface QueueEntryNode {
  id: string;
  position: number;
  state: string;
  enqueuedAt?: string;
  baseCommit: { oid: string };
  headCommit: {
    oid: string;
    committedDate?: string;
    messageHeadline?: string;
    tree?: { oid: string };
    parents: { totalCount: number; nodes: Array<{ oid: string }> };
  };
  pullRequest: {
    number: number;
    state: string;
    baseRefName: string;
    headRefOid: string;
    repository: { databaseId: number };
    commits?: { nodes: Array<{ commit: { oid: string; committedDate: string; pushedDate: string | null } }> };
    timelineItems?: {
      filteredCount: number;
      totalCount?: number;
      pageInfo: { hasPreviousPage: boolean; hasNextPage: boolean };
      nodes: Array<{ __typename: string; createdAt: string }>;
    };
  };
}

function fixture() {
  const policy = Buffer.from(JSON.stringify({ required_approvals: 2, agent_ids: [agent.id], excluded_ids: [excluded.id], agent_check_app_ids: [17] }));
  const blob = createHash("sha1").update("blob " + policy.length + "\0").update(policy).digest("hex");
  const pr = { id: 10, number: pull, state: "open", commits: 2, user: author,
    title: "/approve " + head, body: "/approve " + head,
    base: { sha: base, ref: "main", repo: { id: 23, full_name: repository } },
    head: { sha: head, ref: "trusted/please-merge", repo: { id: 24, full_name: "fork/work" } } };
  const commit = { sha: old, author: agent, committer: author, commit: { verification: { verified: true } } };
  const second = { ...commit, sha: head, author };
  const queueEntry = (number: number, position: number, original: string, predecessor: string, merge: string): QueueEntryNode => ({
    id: "entry-" + number, position, state: "AWAITING_CHECKS", baseCommit: { oid: predecessor },
    headCommit: { oid: merge, parents: { totalCount: 2, nodes: [{ oid: predecessor }, { oid: original }] } },
    pullRequest: { number, state: "OPEN", baseRefName: "main", headRefOid: original, repository: { databaseId: 23 } },
  });
  const queue = { databaseId: 23, nameWithOwner: repository, target: { target: { oid: base } }, group: { target: { oid: groupHead } },
    mergeQueue: { configuration: { mergeMethod: "MERGE" }, entries: { totalCount: 2, pageInfo: { hasNextPage: false, hasPreviousPage: false },
      nodes: [queueEntry(pull, 1, head, base, firstMerge), queueEntry(otherPull, 2, otherHead, firstMerge, groupHead)] } } };
  const state = { pr, commits: [commit, second], configured: true, corruptBlob: false, missingTree: false, truncateCompare: false,
    branchSha: base, groupHead, queue, otherPr: { ...pr, id: 12, number: otherPull, commits: 1, head: { ...pr.head, sha: otherHead } },
    otherReviews: [] as ReturnType<typeof review>[],
    reviews: [] as ReturnType<typeof review>[], comments: [] as ReturnType<typeof comment>[], edited: new Set<number>(),
    permissions: new Map([author, reviewer, writer, forkAuthor, agent, excluded, bot].map(account => [account.login,
      { user: account, permission: account === forkAuthor ? "read" : "write" }])),
    resolved: head, statuses: [] as Array<{ state: string; context: string; description: string; creator: typeof bot }>,
    groupStatuses: [] as Array<{ state: string; context: string; description: string; creator: typeof bot }>,
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
      if (body.query.includes("mergeQueue(branch:")) {
        assert.equal(body.query.includes("configuration"), false);
        assert.deepEqual(body.variables, { owner: "example", repo: "work", branch: "main", target: "refs/heads/main", group: groupRef });
        return response({ data: { repository: state.queue } });
      }
      return response({ data: { nodes: body.variables.ids.map(id => {
        const row = state.comments.find(item => item.node_id === id)!;
        return { id, body: row.body, isMinimized: false, lastEditedAt: state.edited.has(row.id) ? date(8) : null, editor: null };
      }) } });
    }
    if (url.pathname === prefix.slice(0, -1)) return response({ id: 23, full_name: repository });
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
    if (route === "statuses/" + state.pr.head.sha && options?.method === "POST") {
      const saved = { ...JSON.parse(String(options.body)), creator: bot };
      state.statuses.unshift(saved);
      return response(saved);
    }
    if (route === "statuses/" + state.groupHead && options?.method === "POST") {
      const saved = { ...JSON.parse(String(options.body)), creator: bot };
      state.groupStatuses.unshift(saved);
      return response(saved);
    }
    assert.equal(options?.method ?? "GET", "GET");
    if (route === "pulls/" + pull) return response(state.pr);
    if (route === "pulls/" + otherPull) return response(state.otherPr);
    if (route === "git/ref/heads/main") return response({ ref: "refs/heads/main", object: { type: "commit", sha: state.branchSha } });
    if (route === "git/commits/" + state.branchSha) return response({ sha: state.branchSha, tree: { sha: tree } });
    if (route === "git/trees/" + tree) return state.missingTree ? new Response(null, { status: 404 }) :
      response({ sha: tree, truncated: false, tree: [{ path: ".github", mode: "040000", type: "tree", sha: github }] });
    if (route === "git/trees/" + github) return response({ sha: github, truncated: false, tree: state.configured
      ? [{ path: "agent-approval.json", mode: "100644", type: "blob", sha: blob, size: policy.length }] : [] });
    if (route === "git/blobs/" + blob) return response({ sha: blob, encoding: "base64", size: policy.length,
      content: (state.corruptBlob ? Buffer.alloc(policy.length, 32) : policy).toString("base64") });
    const comparison = "compare/" + state.pr.base.sha + "..." + state.pr.head.sha + "?per_page=100";
    if (route === comparison) return response({ commits: state.commits.slice(0, 1) }, state.truncateCompare ? undefined : comparison + "&page=2");
    if (route === comparison + "&page=2") return response({ commits: state.commits.slice(1) });
    if (route === "compare/" + state.otherPr.base.sha + "..." + state.otherPr.head.sha + "?per_page=100") {
      return response({ commits: [{ ...commit, sha: state.otherPr.head.sha }] });
    }
    if (route === "pulls/" + pull + "/reviews?per_page=100") return response(state.reviews);
    if (route === "pulls/" + otherPull + "/reviews?per_page=100") return response(state.otherReviews);
    if (route === "issues/" + pull + "/comments?per_page=100") return response([...state.comments, ...state.publishedComments]);
    if (route === "issues/" + otherPull + "/comments?per_page=100") return response([]);
    if (route === "commits/" + state.pr.head.sha + "/statuses?per_page=100") return response(state.statuses);
    if (route === "commits/" + state.groupHead + "/statuses?per_page=100") return response(state.groupStatuses);
    if (route === "commits/" + state.pr.head.sha + "/check-runs?per_page=100&filter=all") return response({ check_runs: state.checks });
    if (route === "commits/" + state.otherPr.head.sha + "/check-runs?per_page=100&filter=all") return response({ check_runs: [] });
    if (route === "commits/" + head.slice(0, 12)) return state.resolved ? response({ sha: state.resolved }) : new Response(null, { status: 404 });
    const match = /^collaborators\/([^/]+)\/permission$/.exec(route);
    if (match) return response(state.permissions.get(match[1]!));
    assert.fail("Unexpected GitHub request " + route);
  };
  const group = { repository, repositoryId: 23, targetBranch: "main", groupRef, groupHead, groupBase: firstMerge,
    token: "app-fixture", api, fetch: fetchFixture };
  return { state, requests, inspect: () => inspectAgentApprovals({ repository, pull, token: "read-fixture", api, fetch: fetchFixture }),
    publish: (repositoryId = 23, targetBranch = "main") => publishAgentApprovals({ repository, repositoryId, pull, appId: app, appBotId: bot.id, targetBranch,
      token: "app-fixture", api, fetch: fetchFixture }),
    members: (groupBase = firstMerge) => mergeGroupMembers({ ...group, groupBase }),
    publishGroup: (extra: Record<string, unknown> = {}) =>
      publishMergeGroupApprovals({ ...group, groupHead: state.groupHead, appId: app, appBotId: bot.id, ...extra }) };
}

async function squashFixture(cleanup: (fn: () => Promise<void>) => void) {
  const dir = await mkdtemp(path.join(tmpdir(), "molis-squash-fixture-"));
  cleanup(() => rm(dir, { recursive: true, force: true }));
  const git = async (args: string[], stamp = "2026-10-01T12:00:00Z") => {
    const { stdout } = await execFileAsync("git", ["-C", dir, "-c", "core.hooksPath=/dev/null", ...args], {
      env: {
        PATH: process.env.PATH ?? "", HOME: dir, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.test", GIT_AUTHOR_DATE: stamp,
        GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.test", GIT_COMMITTER_DATE: stamp,
      },
    });
    return stdout.trim();
  };
  await git(["init", "-b", "main", "--quiet"]);
  await git(["config", "merge.poison.driver", "false"]);
  await writeFile(path.join(dir, ".gitattributes"), "shared.txt merge=poison\n", "utf8");
  await writeFile(path.join(dir, "shared.txt"), "one\ntwo\nthree\n", "utf8");
  await git(["add", ".gitattributes", "shared.txt"]);
  await git(["commit", "-m", "initial", "--quiet"], date(1));
  const realBase = await git(["rev-parse", "HEAD"]);
  await git(["checkout", "-b", "pr-9", "--quiet"]);
  await writeFile(path.join(dir, "shared.txt"), "pr9-unapproved\ntwo\nthree\n", "utf8");
  await git(["commit", "-am", "unapproved", "--quiet"], date(2));
  const unapproved9 = await git(["rev-parse", "HEAD"]);
  await writeFile(path.join(dir, "shared.txt"), "pr9-approved\ntwo\nthree\n", "utf8");
  await git(["commit", "-am", "approved", "--quiet"], date(3));
  const approved9 = await git(["rev-parse", "HEAD"]);
  await git(["commit", "--allow-empty", "-m", "late empty", "--quiet"], date(7));
  const lateSameTree9 = await git(["rev-parse", "HEAD"]);
  await git(["checkout", "-b", "pr-11", realBase, "--quiet"]);
  await writeFile(path.join(dir, "shared.txt"), "one\ntwo\npr11-approved\n", "utf8");
  await git(["commit", "-am", "other approved", "--quiet"], date(4));
  const approved11 = await git(["rev-parse", "HEAD"]);

  const synthSquash = async (parentSha: string, prHeadSha: string, prNumber: number, stamp: string) => {
    const mergedTree = await git([`--attr-source=${EMPTY_TREE_OID}`, "-c", "core.attributesfile=/dev/null", "merge-tree", "--write-tree", parentSha, prHeadSha], stamp);
    const oid = await git(["commit-tree", mergedTree, "-p", parentSha, "-m", `feat: change (#${prNumber})`], stamp);
    return { oid, tree: mergedTree, stamp };
  };
  const first = await synthSquash(realBase, approved9, pull, "2026-10-05T12:00:00Z");
  const second = await synthSquash(first.oid, approved11, otherPull, "2026-10-05T12:00:05Z");
  const swappedFirst = await synthSquash(realBase, unapproved9, pull, "2026-10-05T12:00:00Z");
  const swappedSecond = await synthSquash(swappedFirst.oid, approved11, otherPull, "2026-10-05T12:00:05Z");

  const baseFixture = fixture();
  const { state } = baseFixture;
  state.branchSha = realBase;
  state.pr.base.sha = realBase;
  state.pr.head.sha = approved9;
  state.commits = [{ ...state.commits[0]!, sha: unapproved9 }, { ...state.commits[1]!, sha: approved9 }];
  state.otherPr.base.sha = realBase;
  state.otherPr.head.sha = approved11;
  state.groupHead = second.oid;
  const squashEntry = (number: number, position: number, predecessor: string, headSha: string, committedAt: string, sq: { oid: string; tree: string; stamp: string }): QueueEntryNode => ({
    id: "entry-" + number, position, state: "AWAITING_CHECKS", enqueuedAt: sq.stamp, baseCommit: { oid: predecessor },
    headCommit: {
      oid: sq.oid, committedDate: sq.stamp, messageHeadline: `feat: change (#${number})`,
      tree: { oid: sq.tree }, parents: { totalCount: 1, nodes: [{ oid: predecessor }] },
    },
    pullRequest: {
      number, state: "OPEN", baseRefName: "main", headRefOid: headSha, repository: { databaseId: 23 },
      commits: { nodes: [{ commit: { oid: headSha, committedDate: committedAt, pushedDate: committedAt } }] },
      timelineItems: number === pull
        ? { filteredCount: 1, totalCount: 5, pageInfo: { hasPreviousPage: false, hasNextPage: false }, nodes: [{ __typename: "HeadRefForcePushedEvent", createdAt: date(2) }] }
        : { filteredCount: 0, totalCount: 4, pageInfo: { hasPreviousPage: false, hasNextPage: false }, nodes: [] },
    },
  });
  state.queue = {
    databaseId: 23, nameWithOwner: repository, target: { target: { oid: realBase } }, group: { target: { oid: second.oid } },
    mergeQueue: {
      configuration: { mergeMethod: "SQUASH" },
      entries: {
        totalCount: 2, pageInfo: { hasNextPage: false, hasPreviousPage: false },
        nodes: [squashEntry(pull, 1, realBase, approved9, date(3), first), squashEntry(otherPull, 2, first.oid, approved11, date(4), second)],
      },
    },
  };
  return {
    ...baseFixture, dir, realBase, unapproved9, approved9, lateSameTree9, approved11, first, second, swappedFirst, swappedSecond,
    publishSquash: (gitDirectory: string | null = dir, groupBase = first.oid) =>
      baseFixture.publishGroup({ groupBase, ...(gitDirectory ? { gitDirectory } : {}) }),
  };
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
  assert.deepEqual(await inspect(), { state: "disabled", base, head, pull, branch: "main" });
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

test("APR-09 reads current branch policy even when GitHub's PR comparison has a different base", async () => {
  const { state, inspect, requests } = fixture();
  state.pr.base.sha = earlierBase;
  const result = await inspect();
  assert.equal(result.base, base);
  assert.equal(result.state, "awaiting-approvals");
  assert.ok(requests.has("compare/" + earlierBase + "..." + head + "?per_page=100"));
  assert.equal(requests.has("git/commits/" + earlierBase), false);
});

test("APR-01/02: exact PR association and current facts are required through the final read", async () => {
  const { state, inspect } = fixture();
  state.commits[0] = { ...state.commits[0]!, author };
  const run = { app: { id: 17 }, head_sha: head, pull_requests: [{ number: pull, base: state.pr.base, head: state.pr.head }] };
  state.checks = [{ ...run, pull_requests: [{ ...run.pull_requests[0]!, number: 10 }] }];
  assert.equal((await inspect()).state, "human");
  state.checks = [{ ...run, pull_requests: [] }];
  const unbound = await inspect();
  assert.equal(unbound.state, "awaiting-approvals");
  assert.equal(unbound.origin, "unknown");
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
  assert.ok(state.publishedComments[0]!.body.includes("已过期：@author · `" + old + "`"));
  assert.equal(state.statuses[0]?.state, "success");
});

test("APR-01/06: verified person-only changes pass the required check without votes", async () => {
  const { state, requests, publish } = fixture();
  state.commits[0] = { ...state.commits[0]!, author };
  const result = { state: "human", head, base, branch: "main", pull, published: "success" };
  assert.deepEqual(await publish(), result);
  assert.deepEqual(await publish(), result);
  assert.equal(state.statuses[0]?.state, "success");
  assert.equal(state.publishedComments.length, 1);
  assert.ok(state.publishedComments[0]!.body.includes("当前政策未要求 Agent 人审票。"));
  assert.equal([...requests.keys()].some(key => key.startsWith("collaborators/")), false);
});

test("APR-06: a different repository or a withdrawn vote cannot publish a stale result", async () => {
  const { state, publish } = fixture();
  state.reviews = [review(1, author, "APPROVED", 1), review(2, reviewer, "APPROVED", 2)];
  await assert.rejects(publish(62), /does not match the publisher/);
  await assert.rejects(publish(23, "another"), /does not match the publisher/);
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

test("APR-06: an active required publisher leaves an unconfigured target without a status", async () => {
  const { state, publish, publishGroup } = fixture();
  state.configured = false;
  await assert.rejects(publish, /No approval policy/);
  await assert.rejects(publishGroup, /No approval policy/);
  assert.equal(state.statuses.length + state.groupStatuses.length + state.publishedComments.length, 0);
});

test("APR-06: all original heads must be approved before the group status succeeds", async () => {
  const { state, members, publishGroup, requests } = fixture();
  state.pr.base.sha = earlierBase;
  state.reviews = [review(1, author, "APPROVED", 1), review(2, reviewer, "APPROVED", 2)];
  state.otherReviews = [review(3, author, "APPROVED", 3, otherHead), review(4, reviewer, "APPROVED", 4, head)];
  assert.deepEqual((await members(base)).members.map(member => [member.pull, member.head, member.queueCommit]),
    [[pull, head, firstMerge], [otherPull, otherHead, groupHead]]);
  assert.equal((await publishGroup()).published, "failure");
  assert.equal(state.groupStatuses[0]?.state, "failure");
  assert.equal(state.statuses.length, 0);
  state.otherReviews.push(review(5, reviewer, "APPROVED", 5, otherHead));
  assert.equal((await publishGroup()).published, "success");
  assert.equal(state.groupStatuses[0]?.state, "success");
  assert.equal(requests.has("git/commits/" + firstMerge), false);
  assert.equal(requests.has("git/commits/" + earlierBase), false);
});

test("APR-06: live PR heads alone cannot prove which version made a squash group", async () => {
  const { state, members, publishGroup } = fixture();
  state.queue.mergeQueue.configuration.mergeMethod = "SQUASH";
  for (const entry of state.queue.mergeQueue.entries.nodes) {
    entry.headCommit.parents.totalCount = 1;
    entry.headCommit.parents.nodes.pop();
  }
  // Both views of the original PR agree, while its previously generated squash remains in the queue.
  state.pr.head.sha = old;
  state.queue.mergeQueue.entries.nodes[0]!.pullRequest.headRefOid = old;
  assert.equal((await members()).members[0]?.head, old);
  await assert.rejects(publishGroup, /does not prove the exact original/);
  assert.equal(state.groupStatuses.length, 0);
});

test("APR-06: disappeared or incomplete groups and changed votes or members never publish a group pass", async () => {
  const { state, publishGroup } = fixture();
  state.reviews = [review(1, author, "APPROVED", 1), review(2, reviewer, "APPROVED", 2)];
  state.otherReviews = [review(3, author, "APPROVED", 3, otherHead), review(4, reviewer, "APPROVED", 4, otherHead)];
  const entries = state.queue.mergeQueue.entries;
  entries.pageInfo.hasNextPage = true;
  await assert.rejects(publishGroup, /could not be verified/);
  entries.pageInfo.hasNextPage = false;
  const first = entries.nodes.shift()!;
  entries.totalCount = 1;
  await assert.rejects(publishGroup, /does not prove every member/);
  entries.nodes.unshift(first);
  entries.totalCount = 2;
  state.otherPr.head.sha = old;
  await assert.rejects(publishGroup, /Original pull request does not match/);
  entries.nodes[1]!.pullRequest.headRefOid = old;
  await assert.rejects(publishGroup, /does not prove every member/);
  entries.nodes[1]!.pullRequest.headRefOid = otherHead;
  state.otherPr.head.sha = otherHead;
  let groupReviewReads = 0;
  state.onRead = route => {
    if (route === "pulls/" + otherPull + "/reviews?per_page=100" && ++groupReviewReads === 3) {
      state.otherReviews.push(review(5, reviewer, "CHANGES_REQUESTED", 5, otherHead));
    }
  };
  await assert.rejects(publishGroup, /Queued approvals changed/);
  state.otherReviews.pop();
  state.onRead = route => {
    if (route === "pulls/" + otherPull + "/reviews?per_page=100") state.queue.group.target.oid = firstMerge;
  };
  await assert.rejects(publishGroup, /could not be verified/);
  assert.equal(state.groupStatuses.length, 0);
});

test("APR-06: a failed refresh invalidates an existing pass for the same merge-group SHA", async () => {
  const { state, publishGroup } = fixture();
  state.reviews = [review(1, author, "APPROVED", 1), review(2, reviewer, "APPROVED", 2)];
  state.otherReviews = [review(3, author, "APPROVED", 3, otherHead), review(4, reviewer, "APPROVED", 4, otherHead)];
  assert.equal((await publishGroup()).published, "success");
  state.queue.mergeQueue.entries.pageInfo.hasNextPage = true;
  await assert.rejects(publishGroup, /could not be verified/);
  assert.deepEqual(state.groupStatuses.map(status => status.state), ["pending", "success"]);
});

test("APR-06: withdrawal observed just after publishing clears the queued pass", async () => {
  const { state, publishGroup } = fixture();
  state.reviews = [review(1, author, "APPROVED", 1), review(2, reviewer, "APPROVED", 2)];
  state.otherReviews = [review(3, author, "APPROVED", 3, otherHead), review(4, reviewer, "APPROVED", 4, otherHead)];
  state.onRead = route => {
    if (route === "statuses/" + groupHead && state.otherReviews.length === 2) {
      state.otherReviews.push(review(5, reviewer, "CHANGES_REQUESTED", 5, otherHead));
    }
  };
  await assert.rejects(publishGroup, /Queued approvals changed/);
  assert.deepEqual(state.groupStatuses.map(status => status.state), ["pending", "success"]);
});

test("APR-06: proves every queued squash entry against its original PR head tree and neutralizes custom merge drivers", async t => {
  const { state, approved9, approved11, publishSquash } = await squashFixture(fn => t.after(fn));
  state.reviews = [review(1, author, "APPROVED", 1, approved9), review(2, reviewer, "APPROVED", 2, approved9)];
  state.otherReviews = [review(3, author, "APPROVED", 3, approved11)];
  assert.equal((await publishSquash()).published, "failure");
  assert.equal(state.groupStatuses[0]?.state, "failure");
  state.otherReviews.push(review(4, reviewer, "APPROVED", 4, approved11));
  assert.equal((await publishSquash()).published, "success");
  assert.equal(state.groupStatuses[0]?.state, "success");
});

test("APR-06: squash proof refuses swapped PR heads, post-enqueue force-pushes and post-queue commits", async t => {
  const { state, approved9, lateSameTree9, approved11, first, second, swappedFirst, swappedSecond, publishSquash } =
    await squashFixture(fn => t.after(fn));
  state.reviews = [review(1, author, "APPROVED", 1, approved9), review(2, reviewer, "APPROVED", 2, approved9)];
  state.otherReviews = [review(3, author, "APPROVED", 3, approved11), review(4, reviewer, "APPROVED", 4, approved11)];
  const nodes = state.queue.mergeQueue.entries.nodes;

  await assert.rejects(() => publishSquash(null), /does not prove the exact original/);

  nodes[0]!.headCommit.oid = swappedFirst.oid;
  nodes[0]!.headCommit.tree = { oid: swappedFirst.tree };
  nodes[1]!.baseCommit.oid = swappedFirst.oid;
  nodes[1]!.headCommit.oid = swappedSecond.oid;
  nodes[1]!.headCommit.tree = { oid: swappedSecond.tree };
  nodes[1]!.headCommit.parents.nodes = [{ oid: swappedFirst.oid }];
  state.groupHead = swappedSecond.oid;
  state.queue.group.target.oid = swappedSecond.oid;
  await assert.rejects(() => publishSquash(undefined, swappedFirst.oid), /does not prove the exact original/);
  nodes[0]!.headCommit.oid = first.oid;
  nodes[0]!.headCommit.tree = { oid: first.tree };
  nodes[1]!.baseCommit.oid = first.oid;
  nodes[1]!.headCommit.oid = second.oid;
  nodes[1]!.headCommit.tree = { oid: second.tree };
  nodes[1]!.headCommit.parents.nodes = [{ oid: first.oid }];
  state.groupHead = second.oid;
  state.queue.group.target.oid = second.oid;

  nodes[0]!.pullRequest.timelineItems = {
    filteredCount: 2, totalCount: 6, pageInfo: { hasPreviousPage: false, hasNextPage: false },
    nodes: [{ __typename: "HeadRefForcePushedEvent", createdAt: date(2) }, { __typename: "HeadRefForcePushedEvent", createdAt: first.stamp }],
  };
  await assert.rejects(() => publishSquash(), /does not prove the exact original/);
  nodes[0]!.pullRequest.timelineItems = {
    filteredCount: 1, totalCount: 5, pageInfo: { hasPreviousPage: false, hasNextPage: false },
    nodes: [{ __typename: "HeadRefForcePushedEvent", createdAt: date(2) }],
  };

  state.pr.head.sha = lateSameTree9;
  state.pr.commits = 3;
  state.commits.push({ ...state.commits[1]!, sha: lateSameTree9 });
  state.reviews = [review(1, author, "APPROVED", 1, lateSameTree9), review(2, reviewer, "APPROVED", 2, lateSameTree9)];
  nodes[0]!.pullRequest.headRefOid = lateSameTree9;
  nodes[0]!.pullRequest.commits = { nodes: [{ commit: { oid: lateSameTree9, committedDate: date(7), pushedDate: date(7) } }] };
  await assert.rejects(() => publishSquash(), /does not prove the exact original/);

  state.pr.head.sha = approved9;
  state.pr.commits = 2;
  state.commits.pop();
  state.reviews = [review(1, author, "APPROVED", 1, approved9), review(2, reviewer, "APPROVED", 2, approved9)];
  nodes[0]!.pullRequest.headRefOid = approved9;
  nodes[0]!.pullRequest.commits = { nodes: [{ commit: { oid: approved9, committedDate: date(3), pushedDate: date(3) } }] };
  nodes[0]!.headCommit.messageHeadline = "feat: change (#999)";
  await assert.rejects(() => publishSquash(), /does not prove the exact original/);
  assert.equal(state.groupStatuses.length, 0);
});
