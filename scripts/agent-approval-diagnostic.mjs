#!/usr/bin/env node
import { createHash } from "node:crypto";
import { isMainScript } from "./script-paths.mjs";

const SHA = /^[a-f0-9]{40}$/i;
const LOGIN = /^[a-z0-9](?:[a-z0-9-]{0,38})$/i;
const WRITE = new Set(["write", "maintain", "admin"]);
const id = value => Number.isSafeInteger(value) && value > 0;
const account = value => id(value?.id) && ["User", "Bot"].includes(value.type);
const agent = (user, policy) => account(user) && (user.type === "Bot" || policy.agent_ids.includes(user.id));
const time = value => typeof value === "string" ? Date.parse(value) : NaN;

function policyOf(source) {
  if (source === null) return null;
  const value = JSON.parse(source);
  const { required_approvals, agent_ids, excluded_ids = [], agent_check_app_ids = [] } = value ?? {};
  if (!Number.isSafeInteger(required_approvals) || required_approvals < 1 || required_approvals > 20
    || ![agent_ids, excluded_ids, agent_check_app_ids].every(list => Array.isArray(list) && list.every(id) && new Set(list).size === list.length)
    || Object.keys(value).some(key => !["required_approvals", "agent_ids", "excluded_ids", "agent_check_app_ids"].includes(key))) {
    throw new Error("Invalid agent approval policy on the base commit");
  }
  return { required_approvals, agent_ids, excluded_ids, agent_check_app_ids };
}

/** A command comment has exactly one line. Quotes, code, Markdown containers and surrounding prose carry no vote. */
function commandOf(body) {
  return typeof body === "string" ? /^\/approve ([0-9a-f]{12,40})[ \t]*(?:\r?\n)?$/i.exec(body)?.[1]?.toLowerCase() : undefined;
}

function latestReviews(reviews) {
  const latest = new Map();
  for (const review of reviews) {
    if (!account(review.user) || !Number.isFinite(time(review.submitted_at)) || !["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(review.state)) continue;
    const previous = latest.get(review.user.id);
    const stamp = time(review.submitted_at);
    if (!previous || stamp > time(previous.submitted_at) || stamp === time(previous.submitted_at) && review.id > previous.id) latest.set(review.user.id, review);
  }
  return latest;
}

/** Diagnose one complete, trusted GitHub snapshot. This result grants no ability to merge or publish a status. */
export async function diagnoseAgentApprovals(snapshot, { permission, resolveCommit }) {
  const policy = policyOf(snapshot.policy), head = snapshot.head.toLowerCase();
  if (!policy) return { state: "disabled", head };
  const reasons = new Set();
  if (agent(snapshot.author, policy)) reasons.add("pull-request");
  if (snapshot.commits.some(row => agent(row.author, policy) || agent(row.committer, policy))) reasons.add("commit");
  if ([...snapshot.reviews, ...snapshot.comments].some(row => agent(row.user, policy))) reasons.add("conversation");
  if (snapshot.agentRuns.some(run => run.head_sha === head && policy.agent_check_app_ids.includes(run.app_id))) reasons.add("agent-run");
  const unknown = !account(snapshot.author) || snapshot.commits.some(row => !account(row.author) || !account(row.committer) || row.commit?.verification?.verified !== true);
  if (!reasons.size && !unknown) return { state: "human", head };
  const reviews = latestReviews(snapshot.reviews), votes = new Map(), stale = new Map();
  const human = user => account(user) && user.type === "User" && LOGIN.test(user.login ?? "")
    && !agent(user, policy) && !policy.excluded_ids.includes(user.id);
  for (const review of reviews.values()) {
    if (!human(review.user) || review.state !== "APPROVED" || !SHA.test(review.commit_id ?? "")) continue;
    const sha = review.commit_id.toLowerCase();
    (sha === head ? votes : stale).set(review.user.id, { user: review.user, sha, kind: "review" });
  }
  const resolutions = new Map();
  for (const comment of snapshot.comments) {
    if (!human(comment.user) || comment.app || comment.edited || !Number.isFinite(time(comment.created_at))) continue;
    const previous = reviews.get(comment.user.id);
    if (previous?.state === "DISMISSED" || previous?.state === "CHANGES_REQUESTED" && time(comment.created_at) <= time(previous.submitted_at)) continue;
    const sha = commandOf(comment.body);
    if (!sha) continue;
    if (!head.startsWith(sha)) { stale.set(comment.user.id, { user: comment.user, sha, kind: "comment" }); continue; }
    if (sha !== head) {
      if (!resolutions.has(sha)) resolutions.set(sha, await resolveCommit(sha));
      if (resolutions.get(sha) !== head) continue;
    }
    if (!votes.has(comment.user.id)) votes.set(comment.user.id, { user: comment.user, sha: head, kind: "comment" });
  }
  const known = new Map();
  const allowed = async user => {
    if (!known.has(user.id)) known.set(user.id, await permission(user));
    const result = known.get(user.id);
    return result?.id === user.id && WRITE.has(result.permission);
  };
  const counted = [], expired = [];
  for (const vote of votes.values()) if (await allowed(vote.user)) counted.push({ login: vote.user.login, id: vote.user.id, kind: vote.kind });
  for (const vote of stale.values()) if (await allowed(vote.user)) expired.push({ login: vote.user.login, sha: vote.sha });
  const missing = Math.max(0, policy.required_approvals - counted.length);
  return { state: missing ? "awaiting-approvals" : "votes-met", origin: reasons.size ? "agent" : "unknown", head, reasons: [...reasons],
    required: policy.required_approvals, missing, counted, expired };
}

export function approvalGithubRepository({fetch, origin, token, repository}) {
  const base = new URL(origin);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash
    || !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repository ?? "") || repository.split("/").some(part => part === "." || part === "..")
    || !token) throw new Error("A valid GitHub API origin, repository and credential are required");
  const prefix = base.pathname.replace(/\/$/, "") + "/repos/" + repository + "/";
  const headers = { accept: "application/vnd.github+json", authorization: "Bearer " + token, "x-github-api-version": "2022-11-28" };
  const request = async (resource, { method = "GET", body, missing = false } = {}) => {
    const url = new URL(resource, base.origin + prefix);
    if (url.origin !== base.origin || !url.pathname.startsWith(prefix)) throw new Error("Unexpected GitHub API pagination target");
    const response = await fetch(url, { method, redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: body === undefined ? headers : { ...headers, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (missing && response.status === 404) return { body: null, next: undefined };
    if (!response.ok) throw new Error("GitHub " + (method === "GET" ? "read" : "write") + " failed (" + response.status + ") for " + url.pathname);
    const next = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get("link") ?? "")?.[1];
    return { body: await response.json(), next };
  };
  const one = async (resource, missing) => (await request(resource, { missing })).body;
  const pages = async (resource, extract = value => value) => {
    const result = [], seen = new Set();
    for (let next = resource; next;) {
      if (seen.has(next) || seen.size >= 100) throw new Error("Could not read complete GitHub results");
      seen.add(next);
      const page = await request(next), rows = extract(page.body);
      if (!Array.isArray(rows)) throw new Error("Incomplete GitHub results");
      result.push(...rows);
      next = page.next;
    }
    return result;
  };
  // Read-only GraphQL query: REST timestamps cannot identify the editor of a vote.
  const commentFacts = async ids => {
    const answer = new Map();
    const endpoint = new URL(base);
    endpoint.pathname = base.pathname.replace(/\/$/, "").replace(/\/api\/v3$/, "/api") + "/graphql";
    for (let offset = 0; offset < ids.length; offset += 50) {
      const batch = ids.slice(offset, offset + 50);
      const response = await fetch(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
        headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ variables: { ids: batch },
          query: "query($ids: [ID!]!) { nodes(ids: $ids) { ... on IssueComment { id body isMinimized lastEditedAt editor { login } } } }" }) });
      if (!response.ok) throw new Error("GitHub comment edit facts could not be read");
      const result = await response.json(), rows = result.data?.nodes;
      if (result.errors?.length || !Array.isArray(rows) || rows.length !== batch.length) throw new Error("GitHub comment edit facts were incomplete");
      for (const [index, node] of rows.entries()) {
        if (node?.id !== batch[index] || typeof node.body !== "string" || typeof node.isMinimized !== "boolean"
          || !(node.lastEditedAt === null || typeof node.lastEditedAt === "string") || !Object.hasOwn(node, "editor")) throw new Error("GitHub comment changed or could not be verified");
        answer.set(node.id, node);
      }
    }
    return answer;
  };
  return { one, pages, commentFacts, async write(resource, method, body) { return (await request(resource, { method, body })).body; } };
}

async function basePolicy(one, base) {
  const commit = await one("git/commits/" + base);
  if (commit?.sha !== base || !SHA.test(commit.tree?.sha ?? "")) throw new Error("Cannot verify the base Git tree");
  const entryAt = async (tree, name) => {
    const value = await one("git/trees/" + tree);
    if (value.sha !== tree || value.truncated !== false || !Array.isArray(value.tree)) throw new Error("Cannot read the complete base Git tree");
    return value.tree.find(entry => entry.path === name);
  };
  const directory = await entryAt(commit.tree.sha, ".github");
  if (!directory) return null;
  if (directory.type !== "tree" || directory.mode !== "040000" || !SHA.test(directory.sha ?? "")) throw new Error("Invalid base .github directory");
  const file = await entryAt(directory.sha, "agent-approval.json");
  if (!file) return null;
  if (file.type !== "blob" || file.mode !== "100644" || !SHA.test(file.sha ?? "") || file.size > 16_384) throw new Error("Invalid base approval policy file");
  const value = await one("git/blobs/" + file.sha);
  if (value.sha !== file.sha || value.encoding !== "base64" || typeof value.content !== "string" || value.size !== file.size) {
    throw new Error("Cannot read the exact base approval policy");
  }
  const body = Buffer.from(value.content, "base64");
  const blob = createHash("sha1").update("blob " + body.length + "\0").update(body).digest("hex");
  if (body.length !== file.size || blob !== file.sha) throw new Error("Cannot read the complete base approval policy");
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}

/** Read the current PR with fixed SHA policy and a complete commit comparison. Any ambiguous response fails closed. */
export async function inspectAgentApprovals({ repository, pull, token, publisher, api = "https://api.github.com", fetch = globalThis.fetch }) {
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repository ?? "") || repository.split("/").some(part => part === "." || part === "..")
    || !id(pull) || !token) throw new Error("A repository, PR number and GitHub read credential are required");
  const { one, pages, commentFacts } = approvalGithubRepository({ fetch, origin: api, token, repository });
  const load = async () => {
    const pr = await one("pulls/" + pull);
    if (pr?.number !== pull || !id(pr.id) || pr.state !== "open" || !SHA.test(pr.base?.sha ?? "") || !SHA.test(pr.head?.sha ?? "")
      || !id(pr.base.repo?.id) || pr.base.repo.full_name?.toLowerCase() !== repository.toLowerCase()
      || typeof pr.base.ref !== "string" || !id(pr.commits)) {
      throw new Error("GitHub did not return the requested open PR and complete identity");
    }
    const policy = await basePolicy(one, pr.base.sha);
    const stamp = createHash("sha256").update(JSON.stringify([pr.id, pr.base.repo.id, pr.base.sha, pr.base.ref, pr.head.sha,
      pr.head.repo?.id, pr.commits, pr.user?.id, pr.user?.type, policy])).digest("hex");
    return { pr, policy, stamp };
  };
  const { pr, policy, stamp } = await load(), configured = policyOf(policy);
  if (!configured) {
    if ((await load()).stamp !== stamp) throw new Error("GitHub PR head, base or policy changed during inspection");
    return { state: "disabled", head: pr.head.sha, base: pr.base.sha, pull };
  }
  const compare = "compare/" + pr.base.sha + "..." + pr.head.sha + "?per_page=100";
  const readVotes = async () => {
    const [reviews, conversation] = await Promise.all([pages("pulls/" + pull + "/reviews?per_page=100"), pages("issues/" + pull + "/comments?per_page=100")]);
    const comments = conversation.filter(row => !(publisher && row.user?.type === "Bot" && row.user.id === publisher.bot
      && row.performed_via_github_app?.id === publisher.app));
    const ids = comments.filter(row => row.user?.type === "User" && !row.performed_via_github_app && commandOf(row.body)).map(row => row.node_id);
    if (ids.some(node => typeof node !== "string" || !node)) throw new Error("GitHub did not return a stable comment identity");
    const edited = await commentFacts([...new Set(ids)]);
    return [reviews, comments.map(row => {
      const node = edited.get(row.node_id);
      if (node && node.body !== row.body) throw new Error("GitHub comment changed during inspection");
      return { ...row, app: Boolean(row.performed_via_github_app), edited: node ? node.isMinimized || node.lastEditedAt !== null || node.editor !== null : true };
    })];
  };
  const readAgentRuns = async () => {
    if (!configured.agent_check_app_ids.length || !id(pr.head.repo?.id)) return [];
    const runs = await pages("commits/" + pr.head.sha + "/check-runs?per_page=100&filter=all", value => value.check_runs);
    return runs.filter(run => configured.agent_check_app_ids.includes(run.app?.id) && run.head_sha === pr.head.sha
      && run.pull_requests?.some(ref => ref.number === pull && ref.base?.repo?.id === pr.base.repo.id
        && ref.base.sha === pr.base.sha && ref.head?.repo?.id === pr.head.repo.id && ref.head?.sha === pr.head.sha))
      .map(run => ({ app_id: run.app.id, head_sha: run.head_sha }));
  };
  const [commits, [reviews, comments], agentRuns] = await Promise.all([pages(compare, value => value.commits), readVotes(), readAgentRuns()]);
  const proof = new Map();
  const permission = async user => {
    const answer = await one("collaborators/" + encodeURIComponent(user.login) + "/permission");
    return { id: answer?.user?.id, permission: answer?.permission };
  };
  if (commits.length !== pr.commits || commits.some(commit => !SHA.test(commit?.sha ?? ""))
    || new Set(commits.map(commit => commit.sha)).size !== pr.commits || commits.at(-1)?.sha !== pr.head.sha) {
    throw new Error("GitHub commit comparison did not match the complete PR head");
  }
  const result = await diagnoseAgentApprovals({ head: pr.head.sha, policy, author: pr.user, commits, reviews,
    comments, agentRuns }, {
    permission: async user => { const held = await permission(user); proof.set(user, held); return held; },
    resolveCommit: async sha => (await one("commits/" + sha, true))?.sha,
  });
  const voteStamp = ([reviews, comments]) => JSON.stringify([
    reviews.map(row => [row.id, row.user?.id, row.user?.login, row.user?.type, row.state, row.commit_id, row.submitted_at]),
    comments.map(row => [row.id, row.user?.id, row.user?.login, row.user?.type, row.body, row.created_at, row.updated_at, row.performed_via_github_app?.id, row.edited]),
  ]);
  const runStamp = rows => JSON.stringify(rows.map(row => row.app_id).sort((a, b) => a - b));
  const [final, votes, currentRuns, access] = await Promise.all([
    load(), readVotes(), readAgentRuns(), Promise.all([...proof].map(async ([user, held]) => JSON.stringify(held) === JSON.stringify(await permission(user)))),
  ]);
  if (final.stamp !== stamp || voteStamp(votes) !== voteStamp([reviews, comments]) || runStamp(agentRuns) !== runStamp(currentRuns) || access.some(current => !current)) {
    throw new Error("GitHub PR, approval policy, origin, votes or write permissions changed during inspection");
  }
  return { ...result, base: pr.base.sha, pull };
}

if (isMainScript(import.meta.url)) {
  try {
    const [repository, number, ...rest] = process.argv.slice(2);
    if (rest.length || !/^\d+$/.test(number ?? "")) throw new Error("Usage: node scripts/agent-approval-diagnostic.mjs OWNER/REPO PR_NUMBER");
    const result = await inspectAgentApprovals({ repository, pull: Number(number), token: process.env.GITHUB_TOKEN, api: process.env.GITHUB_API_URL || undefined });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.state === "awaiting-approvals" ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
