#!/usr/bin/env node
import { createHash } from "node:crypto";
import { approvalGithubRepository, branchHead, inspectAgentApprovals } from "./agent-approval-diagnostic.mjs";
import { isMainScript } from "./script-paths.mjs";

const queues = new Map();
const id = value => Number.isSafeInteger(value) && value > 0;
const sha = value => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const branchName = value => typeof value === "string" && /^[a-zA-Z0-9_./-]+$/.test(value)
  && value.split("/").every(part => part.length > 0 && !part.startsWith(".") && !part.endsWith(".") && !part.endsWith(".lock") && !part.includes(".."));
export const APPROVAL_CHECK = "agent-approval-check";
const queueQuery = `query($owner: String!, $repo: String!, $branch: String!, $target: String!, $group: String!) {
  repository(owner: $owner, name: $repo) {
    databaseId nameWithOwner
    target: ref(qualifiedName: $target) { target { oid } }
    group: ref(qualifiedName: $group) { target { oid } }
    mergeQueue(branch: $branch) {
      configuration { mergeMethod }
      entries(first: 100) {
        totalCount pageInfo { hasNextPage hasPreviousPage }
        nodes {
          id state position baseCommit { oid } headCommit { oid parents(first: 3) { totalCount nodes { oid } } }
          pullRequest { number state baseRefName headRefOid repository { databaseId } }
        }
      }
    }
  }
}`;

function serialPublisher({ api, repositoryId }, subject, run) {
  const key = JSON.stringify([new URL(api).origin, repositoryId, subject]);
  const previous = queues.get(key) ?? Promise.resolve();
  const task = previous.catch(() => undefined).then(run)
    .finally(() => { if (queues.get(key) === task) queues.delete(key); });
  queues.set(key, task);
  return task;
}

const waiting = "Approval evidence is being checked";
const byPublisher = (status, bot) => status?.creator?.id === bot && status.creator.type === "Bot";

async function recheckStatus(github, appBotId, head, refresh) {
  const write = async (state, description) => {
    const saved = await github.write("statuses/" + head, "POST", { state, context: APPROVAL_CHECK, description });
    if (!byPublisher(saved, appBotId) || saved.context !== APPROVAL_CHECK
      || saved.state !== state || saved.description !== description) throw new Error("Published approval status identity could not be confirmed");
  };
  const existing = (await github.pages("commits/" + head + "/statuses?per_page=100"))
    .find(status => status.context === APPROVAL_CHECK && byPublisher(status, appBotId));
  // GitHub statuses have no conditional update. Remove an earlier pass before relying on fresh reads.
  if (existing?.state === "success") await write("pending", waiting);
  const { state, description, recheck, result } = await refresh();
  await recheck();
  try {
    if (existing?.state !== state || state === "success" || existing.description !== description) await write(state, description);
    if (state === "success") await recheck();
  } catch (error) {
    if (state === "success") {
      // A lost response may still have committed the status. Try to return it to pending.
      await write("pending", waiting);
    }
    throw error;
  }
  return result;
}

function checkText(result) {
  const voters = rows => rows.map(vote => `@${vote.login}`).sort().join(", ");
  switch (result.state) {
    case "awaiting-approvals": {
      const names = voters(result.counted);
      const stale = result.expired.map(vote => `@${vote.login} · \`${vote.sha}\``).join(", ");
      return [`缺 ${result.missing} 票。本次需要 ${result.required} 位有写权限的人批准。`,
        names && `本版已批准：${names}`, stale && `已过期：${stale}`, `请在当前版本留下批准，或发一条 \`/approve ${result.head}\`。`].filter(Boolean).join("\n\n");
    }
    case "votes-met":
      return `已取得本版所需的 ${result.required} 票。批准人：${voters(result.counted)}。`;
    case "human":
      return "本次提交的来源核验通过。当前政策未要求 Agent 人审票。";
    default:
      throw new Error("Unknown approval result");
  }
}

function checkPull(pull, repository, repositoryId, targetBranch, pr) {
  if (pr.state !== "open" || pr.number !== pull || pr.base?.repo?.id !== repositoryId
    || pr.base.repo.full_name?.toLowerCase() !== repository.toLowerCase() || pr.base.ref !== targetBranch || !sha(pr.head?.sha)) {
    throw new Error("Original pull request does not match the publisher's target");
  }
}

async function updateExplanation(github, { repositoryId, pull, appId, appBotId }, result, check) {
  const marker = `<!-- molis-agent-approval:${repositoryId}:${pull} -->`;
  const markerBody = `${marker}\n批准检查 · 提交 \`${result.head}\`\n\n${checkText(result)}`;
  const owned = comment => comment.user?.id === appBotId && comment.user?.type === "Bot"
    && comment.performed_via_github_app?.id === appId && id(comment.id)
    && typeof comment.body === "string" && comment.body.startsWith(marker + "\n");
  const issue = "issues/" + pull + "/comments";
  const comments = (await github.pages(issue + "?per_page=100")).filter(owned);
  if (comments.length > 1) throw new Error("Publisher has more than one sticky approval comment");
  const comment = comments[0];
  if (comment?.body === markerBody) return;
  await check();
  const saved = await github.write(comment ? "issues/comments/" + comment.id : issue, comment ? "PATCH" : "POST", { body: markerBody });
  if (!owned(saved) || saved.body !== markerBody) throw new Error("Sticky approval comment identity could not be confirmed");
}

/** Publish one protected PR-head projection using a trusted installation and fixed repository binding. */
export function publishAgentApprovals({ repository, repositoryId, pull, appId, appBotId, token, targetBranch,
  api = "https://api.github.com", fetch = globalThis.fetch }) {
  if (![repositoryId, pull, appId, appBotId].every(id)) throw new Error("The publisher requires fixed repo, PR, App and bot ids");
  if (!branchName(targetBranch)) throw new Error("Invalid target branch");
  const github = approvalGithubRepository({ fetch, origin: api, token, repository });
  return serialPublisher({ api, repositoryId }, pull, async () => {
    const original = await github.one("pulls/" + pull);
    checkPull(pull, repository, repositoryId, targetBranch, original);
    const head = original.head.sha;
    return recheckStatus(github, appBotId, head, async () => {
      const inspect = () => inspectAgentApprovals({ repository, pull, token, publisher: { app: appId, bot: appBotId },
        requirePolicy: true, target: { repositoryId, branch: targetBranch, head }, api, fetch });
      const result = await inspect();
      const check = async () => {
        const current = await github.one("pulls/" + pull);
        checkPull(pull, repository, repositoryId, targetBranch, current);
        if (current.head.sha !== head || await branchHead(github.one, targetBranch) !== result.base) throw new Error("PR changed while publishing the approval check");
      };
      await updateExplanation(github, { repositoryId, pull, appId, appBotId }, result, check);
      const state = result.state === "awaiting-approvals" ? "failure" : "success";
      const digest = createHash("sha256").update(JSON.stringify(result)).digest("hex").slice(0, 12);
      const description = state === "failure" ? `Awaiting ${result.missing} approval(s) · ${digest}` : `Policy verified · ${digest}`;
      const recheck = async () => {
        if (JSON.stringify(await inspect()) !== JSON.stringify(result)) throw new Error("Approval facts changed while publishing");
      };
      return { state, description, recheck, result: { ...result, published: state } };
    });
  });
}

/** Read the active queue prefix. An exact original head needs a direct Git parent to authorize publication. */
export async function mergeGroupMembers({ repository, repositoryId, targetBranch, groupRef, groupHead, groupBase,
  token, api = "https://api.github.com", fetch = globalThis.fetch }) {
  if (!id(repositoryId) || ![groupHead, groupBase].every(sha) || groupHead === groupBase || !branchName(targetBranch)
    || !branchName(groupRef) || !groupRef.startsWith("refs/heads/gh-readonly-queue/" + targetBranch + "/"))
    throw new Error("Expected the fixed target and the current merge-group event");
  const github = approvalGithubRepository({ repository, token, origin: api, fetch });
  const [owner, repo] = repository.split("/");
  const { repository: facts } = await github.graphql(queueQuery, { owner, repo, branch: targetBranch, target: "refs/heads/" + targetBranch, group: groupRef });
  const root = facts?.target?.target?.oid;
  const entries = facts?.mergeQueue?.entries;
  const method = facts?.mergeQueue?.configuration?.mergeMethod;
  const nodes = entries?.nodes;
  if (facts?.databaseId !== repositoryId || facts.nameWithOwner?.toLowerCase() !== repository.toLowerCase()
    || !sha(root) || facts.group?.target?.oid !== groupHead || !["MERGE", "SQUASH"].includes(method)
    || !Array.isArray(nodes) || entries.totalCount !== nodes.length
    || entries.pageInfo?.hasNextPage !== false || entries.pageInfo.hasPreviousPage !== false) {
    throw new Error("The current merge group or its queue membership could not be verified");
  }
  const index = nodes.findIndex(entry => entry?.headCommit?.oid === groupHead);
  if (index < 0) throw new Error("The merge-group commit is absent from the active queue");
  const byPull = new Set(), byEntry = new Set(), commits = new Set([root]);
  const members = [];
  const parentCount = method === "MERGE" ? 2 : 1;
  let base = root;
  for (const entry of nodes.slice(0, index + 1)) {
    const pr = entry?.pullRequest, head = entry?.headCommit, parents = head?.parents;
    if (!entry || !["AWAITING_CHECKS", "LOCKED", "MERGEABLE"].includes(entry.state)
      || entry.position !== members.length + 1 || typeof entry.id !== "string" || !entry.id || byEntry.has(entry.id)
      || entry.baseCommit?.oid !== base || !sha(head?.oid) || commits.has(head.oid)
      || parents?.totalCount !== parentCount || parents.nodes?.length !== parentCount || parents.nodes[0]?.oid !== base
      || !id(pr?.number) || byPull.has(pr.number) || pr.state !== "OPEN" || pr.baseRefName !== targetBranch
      || pr.repository?.databaseId !== repositoryId || !sha(pr.headRefOid) || pr.headRefOid === head.oid
      || method === "MERGE" && (pr.headRefOid === base || parents.nodes[1]?.oid !== pr.headRefOid)) {
      throw new Error("The active queue does not prove every member of this merge group");
    }
    members.push({ entry: entry.id, pull: pr.number, head: pr.headRefOid, queueCommit: head.oid });
    byPull.add(pr.number); byEntry.add(entry.id); commits.add(head.oid);
    base = head.oid;
  }
  if (groupBase !== root && groupBase !== nodes[index].baseCommit.oid) throw new Error("The merge-group event base no longer matches the queue");
  return { base: root, head: groupHead, method, members };
}

/** Only the group SHA receives this status. Each original PR is checked against the same trusted branch policy. */
export function publishMergeGroupApprovals({ appId, appBotId, token, api = "https://api.github.com", fetch = globalThis.fetch, ...group }) {
  const { repository, repositoryId, targetBranch, groupHead, groupRef, groupBase } = group;
  if (![repositoryId, appId, appBotId].every(id) || !branchName(targetBranch) || !branchName(groupRef) || ![groupHead, groupBase].every(sha)
    || !groupRef.startsWith("refs/heads/gh-readonly-queue/" + targetBranch + "/")) {
    throw new Error("The publisher requires fixed repo, App and bot ids and a live merge-group reference");
  }
  const github = approvalGithubRepository({ repository, token, origin: api, fetch });
  return serialPublisher({ api, repositoryId }, groupHead, async () => {
    const details = await github.facts();
    if (details?.id !== repositoryId || details.full_name?.toLowerCase() !== repository.toLowerCase()) {
      throw new Error("The merge group is outside the publisher's repository");
    }
    return recheckStatus(github, appBotId, groupHead, async () => {
      const readGroup = () => mergeGroupMembers({ ...group, token, api, fetch });
      const original = await readGroup();
      if (original.method !== "MERGE") {
        throw new Error("The squash group does not prove the exact original pull request versions");
      }
      const approvals = () => Promise.all(original.members.map(({ pull, head }) => inspectAgentApprovals({
        repository, pull, token, publisher: { app: appId, bot: appBotId }, requirePolicy: true, api, fetch,
        target: { repositoryId, branch: targetBranch, head, base: original.base },
      })));
      const decisions = await approvals();
      const awaiting = decisions.filter(decision => decision.state === "awaiting-approvals").length;
      const published = awaiting ? "failure" : "success";
      const digest = createHash("sha256").update(JSON.stringify([original, decisions])).digest("hex").slice(0, 12);
      const description = awaiting ? `${awaiting} queued PR(s) need approval · ${digest}` : `Queued approvals verified · ${digest}`;
      const recheck = async () => {
        if (JSON.stringify(await approvals()) !== JSON.stringify(decisions)) throw new Error("Queued approvals changed during inspection");
        if (JSON.stringify(await readGroup()) !== JSON.stringify(original)) throw new Error("The merge group changed during approval checks");
      };
      return { state: published, description, recheck, result: { ...original, decisions, published } };
    });
  });
}

if (isMainScript(import.meta.url)) {
  try {
    const [repository, repositoryId, pull, appId, appBotId, ...rest] = process.argv.slice(2);
    const common = { repository, repositoryId: Number(repositoryId), appId: Number(appId), appBotId: Number(appBotId), token: process.env.GITHUB_TOKEN };
    let output;
    if (pull === "merge-group" && rest.length === 4) {
      const [targetBranch, groupRef, groupHead, groupBase] = rest;
      output = await publishMergeGroupApprovals({ ...common, targetBranch, groupRef, groupHead, groupBase });
    } else if (rest.length === 1 && /^\d+$/.test(pull ?? "")) {
      output = await publishAgentApprovals({ ...common, pull: Number(pull), targetBranch: rest[0] });
    } else {
      throw new Error("Usage: OWNER/REPO REPO_ID PR APP_ID APP_BOT_ID TARGET_BRANCH, or OWNER/REPO REPO_ID merge-group APP_ID APP_BOT_ID TARGET_BRANCH GROUP_REF GROUP_HEAD GROUP_BASE");
    }
    console.log(JSON.stringify(output, null, 2));
    process.exitCode = output.published === "failure" ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Approval check publication failed");
    process.exitCode = 2;
  }
}
