/**
 * Git working-tree status, and how to read it off porcelain v1, shared by the platform and by authors.
 *
 * The Host runs `git`; this module turns its bytes into facts. The Host's workspace Git service and the Git plugin read the same
 * output, so they read it with this one parse. Keeping it apart from the process that runs `git` is what makes the awkward cases —
 * renames, every conflict combination, paths with spaces or quotes — testable without a repository, and they are exactly the cases a
 * hand-rolled split gets wrong.
 *
 * It parses the **NUL-separated** form (`-z`). The newline form quotes and
 * escapes unusual paths, so reading it means un-escaping, and an un-escaper
 * that is even slightly wrong turns a path into a different path.
 */
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

export interface GitChange {
  path: readonly string[];
  /** Where a rename or copy came from. Absent otherwise. */
  orig_path?: readonly string[];
  /** The porcelain letter pair, kept verbatim so nothing is lost in translation. */
  code: string;
}

export type GitHead =
  | { kind: "branch"; name: string; commit: string }
  | { kind: "detached"; commit: string }
  /** A branch that exists but has no commit yet. */
  | { kind: "unborn"; name: string };

export interface GitUpstream {
  name: string;
  ahead: number;
  behind: number;
}

export interface GitStatus {
  head: GitHead;
  staged: readonly GitChange[];
  unstaged: readonly GitChange[];
  untracked: readonly GitChange[];
  conflicted: readonly GitChange[];
  upstream?: GitUpstream;
  /** True when the Host stopped reading before the status ended. */
  truncated: boolean;
}

/** A status this parse cannot read, or a path in it that is not a plain relative path: the message says which (400). */
const gitStatusErrors = defineErrorCodes("git", { status_unreadable: "invalid", path_unsafe: "invalid" });

const MAX_SEGMENTS = 64;
const MAX_SEGMENT_LENGTH = 255;

/** Both index and worktree letters that mean "unmerged" in porcelain v1. */
function isConflict(index: string, worktree: string): boolean {
  return index === "U"
    || worktree === "U"
    || (index === "A" && worktree === "A")
    || (index === "D" && worktree === "D");
}

function splitPath(raw: string): string[] {
  if (raw === "") throw gitStatusErrors.path_unsafe("路径为空");
  const segments = raw.split("/");
  if (segments.length > MAX_SEGMENTS) throw gitStatusErrors.path_unsafe("路径层级过深");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") {
      throw gitStatusErrors.path_unsafe(`路径片段无效：${segment}`);
    }
    if (segment.length > MAX_SEGMENT_LENGTH) {
      throw gitStatusErrors.path_unsafe("路径片段过长");
    }
    for (let index = 0; index < segment.length; index += 1) {
      if (segment.charCodeAt(index) < 32) {
        throw gitStatusErrors.path_unsafe("路径含控制字符");
      }
    }
  }
  return segments;
}

export interface PorcelainInput {
  /** Raw stdout of `git status --porcelain=v1 -z --branch`. */
  stdout: string;
  truncated?: boolean;
}

/**
 * Read porcelain v1 with `-z`.
 *
 * Records are NUL-separated. A rename or copy record is **two** records: the
 * code plus the new path, then the old path on its own. Treating them as one
 * record each is the classic bug — it shifts every entry after the first rename.
 * What it cannot read raises an `ActionError` with the code `git.status_unreadable` or `git.path_unsafe`.
 */
export function parsePorcelainStatus(input: PorcelainInput): GitStatus {
  const records = input.stdout.split("\0");
  const staged: GitChange[] = [];
  const unstaged: GitChange[] = [];
  const untracked: GitChange[] = [];
  const conflicted: GitChange[] = [];
  let head: GitHead = { kind: "unborn", name: "HEAD" };
  let upstream: GitUpstream | undefined;

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    if (record === "") continue;
    if (record.startsWith("##")) {
      const branch = parseBranchRecord(record);
      head = branch.head;
      upstream = branch.upstream;
      continue;
    }
    if (record.length < 4 || record[2] !== " ") {
      throw gitStatusErrors.status_unreadable(`读不懂的状态记录：${record.slice(0, 40)}`);
    }
    const indexLetter = record[0]!;
    const worktreeLetter = record[1]!;
    const pathText = record.slice(3);
    let change: GitChange = { path: splitPath(pathText), code: `${indexLetter}${worktreeLetter}` };
    if (indexLetter === "R" || indexLetter === "C") {
      const origin = records[index + 1];
      if (origin === undefined || origin === "") {
        throw gitStatusErrors.status_unreadable("重命名记录缺少原路径");
      }
      change = { ...change, orig_path: splitPath(origin) };
      index += 1;
    }
    if (isConflict(indexLetter, worktreeLetter)) {
      conflicted.push(change);
      continue;
    }
    if (indexLetter === "?" && worktreeLetter === "?") {
      untracked.push(change);
      continue;
    }
    if (indexLetter === "!" && worktreeLetter === "!") continue;
    // A file can be in both lists at once — staged edits plus newer unstaged
    // ones — and showing it in only one would hide half of what will be committed.
    if (indexLetter !== " " && indexLetter !== "?") staged.push(change);
    if (worktreeLetter !== " " && worktreeLetter !== "?") unstaged.push(change);
  }

  return {
    head,
    staged,
    unstaged,
    untracked,
    conflicted,
    ...(upstream === undefined ? {} : { upstream }),
    truncated: input.truncated === true,
  };
}

const BRANCH_AHEAD = /\[ahead (\d+)(?:, behind (\d+))?\]/u;
const BRANCH_BEHIND = /\[behind (\d+)\]/u;

function parseBranchRecord(record: string): { head: GitHead; upstream: GitUpstream | undefined } {
  const body = record.slice(2).trim();
  if (body.startsWith("HEAD (no branch)")) {
    return { head: { kind: "detached", commit: "HEAD" }, upstream: undefined };
  }
  if (body.startsWith("No commits yet on ")) {
    return { head: { kind: "unborn", name: body.slice("No commits yet on ".length).trim() }, upstream: undefined };
  }
  const tracking = body.indexOf("...");
  if (tracking < 0) {
    return { head: { kind: "branch", name: body, commit: "" }, upstream: undefined };
  }
  const name = body.slice(0, tracking);
  const rest = body.slice(tracking + 3);
  const bracket = rest.indexOf(" [");
  const upstreamName = bracket < 0 ? rest : rest.slice(0, bracket);
  const ahead = BRANCH_AHEAD.exec(rest);
  const behindOnly = BRANCH_BEHIND.exec(rest);
  return {
    head: { kind: "branch", name, commit: "" },
    upstream: {
      name: upstreamName,
      ahead: ahead === null ? 0 : Number(ahead[1]),
      behind: ahead?.[2] !== undefined
        ? Number(ahead[2])
        : behindOnly === null ? 0 : Number(behindOnly[1]),
    },
  };
}
