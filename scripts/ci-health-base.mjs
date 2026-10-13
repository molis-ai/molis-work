#!/usr/bin/env node
// CI helper for the health gates (specs/repository-anti-corruption §5a): prints the commit to hand to
// `check-health-gates.mjs --base`, after making sure the clone holds what the gate reads there (that commit, the
// merge-base of it and HEAD, and their trees) without fetching the whole history.
//
// The checkout is shallow (actions/checkout fetch-depth: 2). Which commit to compare with depends on the event:
//   pull_request   HEAD is the merge commit GitHub builds (refs/pull/N/merge); its first parent is the base branch as it
//                  was merged. The comparison is the merged result against that parent, which a depth-2 checkout already
//                  has: nothing is fetched.
//   push           the tip before the push (github.event.before): fetched if it is missing, then the history is deepened
//                  step by step until it is reachable from HEAD (normally it is HEAD^1 and no deepening happens).
//   anything else  origin/<branch> with the full history: a workflow_dispatch, a pull_request whose HEAD is not a merge
//   (fallback)     commit, a push that creates the branch.
// Never a silent fallback to "no comparison": a commit that cannot be fetched or has no common history is exit 2.
//
//   EVENT_NAME=… BASE_REF=… PUSH_BEFORE=… node scripts/ci-health-base.mjs [--root <dir>] [--remote origin] [--branch main]
// stdout is the commit (or ref) to compare with; everything else goes to stderr.
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const USAGE = "usage: EVENT_NAME=… BASE_REF=… PUSH_BEFORE=… ci-health-base.mjs [--root <dir>] [--remote <name>] [--branch <name>]";
const die = (message) => { console.error(`ci-health-base: ${message}`); process.exit(2); };
const log = (message) => console.error(`ci-health-base: ${message}`);

const options = {};
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index++) {
  const [name, inline] = args[index].split(/=(.*)/s);
  if (!["--root", "--remote", "--branch"].includes(name)) die(`unknown argument ${args[index]}\n${USAGE}`);
  const value = inline ?? args[++index];
  if (!value || value.startsWith("--")) die(`${name} needs a value\n${USAGE}`);
  options[name.slice(2)] = value;
}
const root = options.root ? path.resolve(options.root) : path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const remote = options.remote ?? "origin";
const event = process.env.EVENT_NAME ?? "";
const branch = options.branch ?? (process.env.BASE_REF || "main");
const before = process.env.PUSH_BEFORE ?? "";

const git = (gitArgs) => {
  try { return execFileSync("git", gitArgs, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch (error) { return die(`git ${gitArgs.join(" ")} failed in ${root}: ${String(error.stderr ?? error.message).trim()}`); }
};
const has = (commit) => spawnSync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: root, stdio: "ignore" }).status === 0;
const isAncestor = (ancestor, descendant) => {
  const run = spawnSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { cwd: root, stdio: "ignore" });
  if (run.status !== 0 && run.status !== 1) die(`git merge-base --is-ancestor ${ancestor} ${descendant} failed in ${root}`);
  return run.status === 0;
};
const isShallow = () => git(["rev-parse", "--is-shallow-repository"]) === "true";
const head = git(["rev-parse", "HEAD"]);
const fetch = (...fetchArgs) => { log(`git fetch --no-tags ${fetchArgs.join(" ")}`); git(["fetch", "--no-tags", ...fetchArgs]); };

// origin/<branch> with its whole history; `--unshallow` completes what the clone already has (HEAD) as well.
const fullHistory = (why) => {
  log(`${why}; fetching ${remote}/${branch} with its full history`);
  fetch(...(isShallow() ? ["--unshallow"] : []), remote, `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`);
  return `${remote}/${branch}`;
};

const choose = () => {
  if (event === "pull_request") {
    const parents = git(["rev-list", "--parents", "-n", "1", "HEAD"]).split(" ").slice(1);
    if (parents.length === 2 && has(parents[0])) return parents[0];
    return fullHistory("HEAD is not the merge commit of a pull request (or its base parent is missing)");
  }
  if (event === "push" && !/^0*$/.test(before)) {
    if (!has(before)) fetch("--depth=1", remote, before);
    // A shallow clone sees only part of the graph: wait until `before` is reachable from HEAD rather than trust a merge-base
    // that a truncated history can make older than the real one. Not reachable once the history is complete is a rewrite
    // (force push); the gate then computes the true merge-base itself.
    for (const step of [10, 50, 250, 1000]) {
      if (!isShallow() || isAncestor(before, head)) break;
      fetch(`--deepen=${step}`, remote, head, before);
    }
    if (isShallow() && !isAncestor(before, head)) fetch("--unshallow", remote, head, before);
    return before;
  }
  return fullHistory(event === "push" ? "the push has no previous tip" : `event ${event || "(unset)"} compares with ${branch}`);
};

const base = choose();
if (spawnSync("git", ["merge-base", "HEAD", base], { cwd: root, stdio: "ignore" }).status !== 0) {
  die(`HEAD and ${base} share no history in this clone even after fetching; check the checkout (fetch-depth) and the event`);
}
log(`comparing HEAD ${head.slice(0, 8)} with ${base}`);
console.log(base);
