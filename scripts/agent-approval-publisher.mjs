#!/usr/bin/env node
import { createHash } from "node:crypto";
import { approvalGithubRepository, inspectAgentApprovals } from "./agent-approval-diagnostic.mjs";
import { isMainScript } from "./script-paths.mjs";

const queues = new Map();
const id = value => Number.isSafeInteger(value) && value > 0;
const sha = value => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
export const APPROVAL_CHECK = "agent-approval-check";

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
    case "disabled":
      return "目标分支未启用 Agent 人审政策。";
    default:
      throw new Error("Unknown approval result");
  }
}

/**
 * Publish one protected PR-head projection. The operator supplies a trusted installation and repo binding.
 * GitHub commit status is shared by PRs on the same commit. Final enforcement on a queue requires its own merge-group proof.
 */
export function publishAgentApprovals({ repository, repositoryId, pull, appId, appBotId, token,
  api = "https://api.github.com", fetch = globalThis.fetch }) {
  if (![repositoryId, pull, appId, appBotId].every(id)) throw new Error("The publisher requires fixed repo, PR, App and bot ids");
  const github = approvalGithubRepository({ fetch, origin: api, token, repository });
  const key = JSON.stringify([new URL(api).origin, repositoryId, pull]);
  const marker = `<!-- molis-agent-approval:${repositoryId}:${pull} -->`;
  const previous = queues.get(key) ?? Promise.resolve();
  const task = previous.catch(() => undefined).then(async () => {
    const inspect = () => inspectAgentApprovals({ repository, pull, token, publisher: { app: appId, bot: appBotId }, api, fetch });
    const result = await inspect();
    const check = async () => {
      const live = await github.one("pulls/" + pull);
      if (live.state !== "open" || live.number !== pull || live.base?.repo?.id !== repositoryId
        || live.base.repo.full_name?.toLowerCase() !== repository.toLowerCase()
        || !sha(live.head?.sha) || !sha(live.base?.sha) || live.head.sha !== result.head || live.base.sha !== result.base) {
        throw new Error("PR changed while publishing the approval check");
      }
    };
    const markerBody = `${marker}\n批准检查 · 提交 \`${result.head}\`\n\n${checkText(result)}`;
    const owned = comment => comment.user?.id === appBotId && comment.user?.type === "Bot"
      && comment.performed_via_github_app?.id === appId && id(comment.id)
      && typeof comment.body === "string" && comment.body.startsWith(marker + "\n");
    const issue = "issues/" + pull + "/comments";
    const comments = (await github.pages(issue + "?per_page=100")).filter(owned);
    if (comments.length > 1) throw new Error("Publisher has more than one sticky approval comment");
    const comment = comments[0];
    if (comment?.body !== markerBody) {
      await check();
      const saved = await github.write(comment ? "issues/comments/" + comment.id : issue, comment ? "PATCH" : "POST", { body: markerBody });
      if (!owned(saved) || saved.body !== markerBody) throw new Error("Sticky approval comment identity could not be confirmed");
    }
    // Compare the actual approval facts again after the comment write, before reporting success for this generation.
    const final = await inspect();
    if (JSON.stringify(final) !== JSON.stringify(result)) throw new Error("Approval facts changed while publishing");
    const state = result.state === "awaiting-approvals" ? "failure" : "success";
    const digest = createHash("sha256").update(JSON.stringify(result)).digest("hex");
    const description = state === "failure" ? `Awaiting ${result.missing} approval(s) · ${digest.slice(0, 12)}` : `Policy verified · ${digest.slice(0, 12)}`;
    const existing = (await github.pages("commits/" + result.head + "/statuses?per_page=100"))
      .find(status => status.context === APPROVAL_CHECK);
    if (existing?.creator?.id !== appBotId || existing.state !== state || existing.description !== description) {
      await check();
      const saved = await github.write("statuses/" + result.head, "POST", { state, context: APPROVAL_CHECK, description });
      if (saved.creator?.id !== appBotId || saved.context !== APPROVAL_CHECK || saved.state !== state || saved.description !== description) {
        throw new Error("Published approval status identity could not be confirmed");
      }
    }
    await check();
    return { ...result, published: state };
  }).finally(() => { if (queues.get(key) === task) queues.delete(key); });
  queues.set(key, task);
  return task;
}

if (isMainScript(import.meta.url)) {
  try {
    const [repository, repositoryId, pull, appId, appBotId, ...rest] = process.argv.slice(2);
    if (rest.length) throw new Error("Usage: node scripts/agent-approval-publisher.mjs OWNER/REPO REPO_ID PR APP_ID APP_BOT_ID");
    const output = await publishAgentApprovals({ repository, repositoryId: Number(repositoryId), pull: Number(pull),
      appId: Number(appId), appBotId: Number(appBotId), token: process.env.GITHUB_TOKEN });
    console.log(JSON.stringify(output, null, 2));
    process.exitCode = output.published === "failure" ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Approval check publication failed");
    process.exitCode = 2;
  }
}
