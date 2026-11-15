import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SHA = /^[a-f0-9]{40}$/;
export const EMPTY_TREE_OID = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
export const UNPROVEN_SQUASH = "The squash group does not prove the exact original pull request versions";

function epochSeconds(value) {
  if (typeof value !== "string") return NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : NaN;
}

function validForcePushes(forcePushes, enqueuedSeconds) {
  const nodes = forcePushes?.nodes;
  if (!Array.isArray(nodes) || !Number.isSafeInteger(forcePushes?.totalCount) || forcePushes.totalCount < 0) return false;
  if (forcePushes.totalCount === 0 ? nodes.length !== 0 : nodes.length === 0) return false;
  return nodes.every(node => {
    const at = epochSeconds(node?.createdAt);
    return Number.isSafeInteger(at) && at < enqueuedSeconds;
  });
}

function checkSquashLineage(group) {
  const items = group?.squash;
  if (group?.method !== "SQUASH" || !Array.isArray(items) || items.length === 0 || items.length !== group.members?.length) {
    throw new Error(UNPROVEN_SQUASH);
  }
  for (const [index, item] of items.entries()) {
    const member = group.members[index];
    const enqueued = epochSeconds(item?.enqueuedAt);
    const queued = epochSeconds(item?.headCommittedAt);
    const committed = epochSeconds(item?.prCommit?.committedDate);
    const pushed = item?.prCommit?.pushedDate == null ? committed : epochSeconds(item.prCommit.pushedDate);
    if (!member || item.entry !== member.entry || item.pull !== member.pull || item.head !== member.head || item.queueCommit !== member.queueCommit
      || !SHA.test(item.base ?? "") || !SHA.test(item.queueTree ?? "")
      || ![enqueued, queued, committed, pushed].every(Number.isSafeInteger)
      || queued < enqueued || committed > queued || pushed > queued
      || item.prCommit?.oid !== item.head
      || typeof item.messageHeadline !== "string" || !item.messageHeadline.endsWith(` (#${item.pull})`)
      || !validForcePushes(item.forcePushes, enqueued)) {
      throw new Error(UNPROVEN_SQUASH);
    }
  }
  return items;
}

async function runGit(args, env) {
  const { stdout } = await execFileAsync("git", args, { env, timeout: 30_000, maxBuffer: 1024 * 1024 });
  return stdout.trim();
}

function hermeticGitEnv(scratch, extra = {}) {
  return {
    PATH: process.env.PATH ?? "",
    HOME: scratch,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    ...extra,
  };
}

export async function resolveOptionalGitDirectory(candidate) {
  if (typeof candidate !== "string" || !candidate.trim()) return undefined;
  try {
    await runGit(["-C", candidate, "-c", "core.hooksPath=/dev/null", "rev-parse", "--git-dir"], hermeticGitEnv(tmpdir()));
    return candidate;
  } catch {
    // Optional runner workspace without a Git checkout falls back to isolated HTTPS object fetch.
    return undefined;
  }
}

/**
 * Prove every queued SQUASH entry came from the exact inspected PR head commit:
 * GraphQL lineage/force-push checks plus a hermetic 3-way `git merge-tree --write-tree` in an isolated bare repo.
 */
export async function proveSquashGroup(group, { token, gitDirectory, gitOrigin } = {}) {
  if (!gitDirectory && !gitOrigin) throw new Error(UNPROVEN_SQUASH);
  const items = checkSquashLineage(group);
  const scratch = await mkdtemp(path.join(tmpdir(), "molis-squash-proof-"));
  const baseEnv = hermeticGitEnv(scratch);
  const git = (args, extraEnv) => runGit([
    "-C", scratch,
    "-c", "core.hooksPath=/dev/null",
    "-c", "core.attributesfile=/dev/null",
    "-c", "protocol.allow=never",
    ...args,
  ], extraEnv ? hermeticGitEnv(scratch, extraEnv) : baseEnv);
  try {
    await git(["init", "--bare", "--quiet"]);
    if (gitDirectory) {
      let objectsPath;
      try {
        const raw = await runGit(["-C", gitDirectory, "-c", "core.hooksPath=/dev/null", "rev-parse", "--git-path", "objects"], baseEnv);
        objectsPath = raw && !/[\r\n]/.test(raw) ? path.resolve(gitDirectory, raw) : "";
      } catch {
        throw new Error(UNPROVEN_SQUASH);
      }
      if (!objectsPath) throw new Error(UNPROVEN_SQUASH);
      await mkdir(path.join(scratch, "objects/info"), { recursive: true });
      await writeFile(path.join(scratch, "objects/info/alternates"), `${objectsPath}\n`, "utf8");
    }
    const commits = [...new Set(items.flatMap(item => [item.base, item.head, item.queueCommit]))];
    let missing = false;
    for (const oid of commits) {
      try {
        await git(["cat-file", "-e", `${oid}^{commit}`]);
      } catch {
        missing = true;
        break;
      }
    }
    if (missing) {
      if (!gitOrigin || !token) throw new Error(UNPROVEN_SQUASH);
      const remote = new URL(gitOrigin);
      if (remote.protocol !== "https:" || remote.username || remote.password || remote.search || remote.hash) {
        throw new Error("Invalid HTTPS Git origin for squash proof");
      }
      const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
      try {
        await git(["-c", "protocol.https.allow=always", "fetch", "--quiet", "--no-tags", "--no-write-fetch-head", remote.href, ...commits], {
          GIT_CONFIG_COUNT: "1",
          GIT_CONFIG_KEY_0: `http.${remote.origin}/.extraheader`,
          GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
        });
      } catch {
        throw new Error(UNPROVEN_SQUASH);
      }
    }
    for (const { base, head, queueCommit, queueTree } of items) {
      try {
        const [resolvedBase, resolvedHead, resolvedQueue, resolvedTree, parents, mergedTree] = await Promise.all([
          git(["rev-parse", "--verify", `${base}^{commit}`]),
          git(["rev-parse", "--verify", `${head}^{commit}`]),
          git(["rev-parse", "--verify", `${queueCommit}^{commit}`]),
          git(["rev-parse", "--verify", `${queueCommit}^{tree}`]),
          git(["rev-list", "--parents", "-n", "1", queueCommit]),
          git([`--attr-source=${EMPTY_TREE_OID}`, "merge-tree", "--write-tree", base, head]),
        ]);
        if (resolvedBase !== base || resolvedHead !== head || resolvedQueue !== queueCommit
          || resolvedTree !== queueTree || parents !== `${queueCommit} ${base}` || mergedTree !== queueTree) {
          throw new Error(UNPROVEN_SQUASH);
        }
      } catch {
        throw new Error(UNPROVEN_SQUASH);
      }
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
