import { randomUUID } from "node:crypto";
import type { GitOperation, WorkspaceGitSummary } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { PreparedGitOperation } from "./git-operations.js";
import { runWorkspaceGit } from "./workspace-git.js";

export type GitCommandConfiguration = Array<[string, string]>;
const text = async (root: string, args: string[]) => (await runWorkspaceGit(root, args)).toString().trimEnd();

export async function effectivePushTargets(root: string): Promise<Array<{ name: string; url: string }>> {
  const rows: Array<{ name: string; url: string }> = [];
  for (const name of (await text(root, ["remote"])).split("\n").filter(Boolean)) {
    for (const url of (await text(root, ["remote", "get-url", "--push", "--all", "--", name])).split("\n").filter(Boolean)) rows.push({ name, url });
  }
  return rows;
}

const configured = async (root: string, key: string) => {
  try { return await text(root, ["config", "--get-all", key]); }
  catch (error) { if ((error as { code?: number }).code === 1) return ""; throw error; }
};

/** An ephemeral configured remote keeps all reviewed destinations, without re-reading the live remote's URLs at push. */
export async function preparePush(root: string, summary: WorkspaceGitSummary, operation: Extract<GitOperation, { action: "push" }>,
  where: Array<{ label: string; value: string }>, check: () => Promise<void>,
  run: (args: string[], config?: GitCommandConfiguration) => Promise<{ stdout: string; stderr: string }>): Promise<PreparedGitOperation> {
  const targets = summary.remotes.filter(item => item.name === operation.remote);
  if (!targets.length) throw new Error(`没有远端「${operation.remote}」`);
  if (!summary.branch) throw new Error("分离的 HEAD 不能推送，先建一个分支");
  if (!summary.head_commit) throw new Error("还没有提交，没有可推送的内容");
  if (summary.upstream && summary.ahead === 0) throw new Error("没有需要推送的提交");
  const name = operation.remote, branch = summary.branch, commit = summary.head_commit;
  const setUpstream = operation.set_upstream || !summary.upstream;
  const fetch = await configured(root, `remote.${name}.fetch`);
  const branchRemote = await configured(root, `branch.${branch}.remote`), branchMerge = await configured(root, `branch.${branch}.merge`);
  const alias = `molis-reviewed-${randomUUID()}`;
  const config: GitCommandConfiguration = [];
  targets.forEach((target, index) => {
    // Git expands insteadOf once. A fresh alias pins the already resolved URL even when that URL itself matches another rewrite.
    const marker = `${alias}-${index}:`;
    config.push([`url.${target.url}.insteadOf`, marker], [`remote.${alias}.${index ? "pushurl" : "url"}`, marker]);
    if (index === 0) config.push([`remote.${alias}.pushurl`, marker]);
  });
  for (const rule of fetch.split("\n").filter(Boolean)) config.push([`remote.${alias}.fetch`, rule]);
  for (const setting of ["proxy", "proxyAuthMethod", "receivepack", "vcs", "pushOption"]) {
    const value = await configured(root, `remote.${name}.${setting}`);
    if (value) for (const part of value.split("\n")) config.push([`remote.${alias}.${setting}`, part]);
  }
  const checkPush = async () => {
    await check();
    if (await configured(root, `remote.${name}.fetch`) !== fetch) throw new Error("远端跟踪设置在审查期间变化了，原操作未执行");
  };
  return { tool: "git-push", summary: `推送「${branch}」到 ${name}`, check: checkPush,
    fields: [...where, { label: "远端", value: `${name}（${targets.map(target => target.url).join("\n")}）` },
      { label: "推送的提交", value: summary.upstream ? `${summary.ahead} 个（远端跟踪分支 ${summary.upstream}）` : "整个分支（远端还没有这个分支）" },
      ...(summary.behind ? [{ label: "注意", value: `远端比本地多 ${summary.behind} 个提交，Git 会拒绝推送；不会强制推送` }] : []),
      { label: "执行范围", value: `推送已审查的提交 ${commit.slice(0, 12)} 到以上全部地址；使用已有 Git 凭据，不强制推送${setUpstream ? "；同时设置远端跟踪分支" : ""}；会运行仓库的 pre-push hook（如有）。` }],
    async execute() {
      await checkPush();
      let out;
      try { out = await run(["push", "--no-force", "--no-follow-tags", "--recurse-submodules=no", alias, `${commit}:refs/heads/${branch}`], config); }
      catch (error) { throw Object.assign(new Error(`推送结果未确认；请核对以上远端，不要直接重试：${error instanceof Error ? error.message : String(error)}`), { code: "EFFECT_RECONCILE_REQUIRED" }); }
      if (setUpstream) {
        if (await configured(root, `branch.${branch}.remote`) !== branchRemote || await configured(root, `branch.${branch}.merge`) !== branchMerge
          || await configured(root, `remote.${name}.fetch`) !== fetch) return `已推送到 ${name}；后来改过的本地跟踪设置已保留，请核对。`;
        try {
          await run(["config", "--local", `branch.${branch}.remote`, name]);
          await run(["config", "--local", `branch.${branch}.merge`, `refs/heads/${branch}`]);
        } catch (error) { throw Object.assign(new Error(`已推送到 ${name}，本地跟踪设置未完成：${error instanceof Error ? error.message : String(error)}`), { code: "EFFECT_RECONCILE_REQUIRED" }); }
      }
      return `已推送到 ${name}：${(out.stderr.split("\n").find(line => /->/.test(line)) ?? branch).trim()}`;
    } };
}
