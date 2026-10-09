// What scripts/affected-tests.mjs reads of the repository itself: the files, the workspace packages, the change set against a base.
// Everything goes through git and the file system of `root`, so the scratch repositories of tests/affected-tests.test.ts work the same.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { PACKAGE_AREAS, PRODUCT_SOURCE } from "./rules.mjs";

const git = (root, args) => execFileSync("git", ["-c", "core.quotePath=false", ...args], { cwd: root, encoding: "utf8", maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "pipe"] });
const gitOrNull = (root, args) => { try { return git(root, args).trim(); } catch { return null; } };
const MAX_TEXT = 2 * 1024 * 1024;

/** Every file git knows or would add (tracked plus untracked, ignored left out) that exists now, repository-relative with `/`. */
export function listFiles(root) {
  const listed = git(root, ["ls-files", "-co", "--exclude-standard", "-z"]).split("\0");
  return [...new Set(listed)].filter((file) => file && existsSync(path.join(root, file)));
}

export function readText(root, file) {
  try {
    if (statSync(path.join(root, file)).size > MAX_TEXT) return "";
    const text = readFileSync(path.join(root, file), "utf8");
    return text.includes("\0") ? "" : text;
  } catch { return ""; }
}

/**
 * The workspace packages: a package.json with a `@molis-ai/molis-work-` name in one of the workspace areas. `exports` is the
 * published entry map, from which a subpath import in a test is traced back to its source file.
 */
export function discoverPackages(root, files) {
  const packages = [];
  for (const file of files) {
    if (!file.endsWith("/package.json") || !PACKAGE_AREAS.includes(file.split("/")[0]) || /(?:^|\/)(?:node_modules|dist|fixtures)\//.test(file)) continue;
    let manifest;
    try { manifest = JSON.parse(readText(root, file)); } catch { continue; }
    if (typeof manifest.name !== "string" || !manifest.name.startsWith("@molis-ai/molis-work-")) continue;
    const dir = file.slice(0, -"/package.json".length);
    packages.push({ dir, name: manifest.name, exports: manifest.exports ?? {}, readme: files.includes(`${dir}/README.md`) ? `${dir}/README.md` : null });
  }
  return packages.sort((left, right) => right.dir.length - left.dir.length);
}

/** The package a file belongs to (the deepest directory), or null. */
export const packageOf = (packages, file) => packages.find((item) => file === item.dir || file.startsWith(`${item.dir}/`)) ?? null;

/** `./dist/platform/plugin.js` is built from `src/platform/plugin.ts`: the source a package entry resolves to. */
export function sourceOfEntry(item, subpath) {
  const target = item.exports[subpath === "" ? "." : `./${subpath}`];
  const built = typeof target === "string" ? target : target?.import ?? target?.default ?? target?.types;
  if (typeof built !== "string" || !built.startsWith("./dist/")) return null;
  return `${item.dir}/${built.slice("./".length)}`.replace("/dist/", "/src/").replace(/\.d\.ts$|\.m?js$/, ".ts");
}

// ---- the change set -------------------------------------------------------------------------------------------------------
/** The merge-base of HEAD and the first of `requested` (or origin/main, main) that resolves. */
export function resolveBase(root, requested) {
  const candidates = requested ? [requested] : ["origin/main", "main"];
  for (const ref of candidates) {
    const mergeBase = gitOrNull(root, ["merge-base", "HEAD", ref]);
    if (mergeBase) return { ref, mergeBase };
  }
  throw new Error(`no merge-base of HEAD with ${candidates.join(" or ")}: pass --base <ref>, or name the files`);
}

const linesOf = (text) => (text === "" ? [] : text.replace(/\n$/, "").split("\n"));
/** The file as it was at `mergeBase` ("" when it did not exist), or null when it cannot be read (too big, binary). */
const textAt = (root, mergeBase, file) => {
  try {
    const text = git(root, ["show", `${mergeBase}:${file}`]);
    return text.length > MAX_TEXT || text.includes("\0") ? null : text;
  } catch { return ""; }
};

/**
 * Files changed against `mergeBase` (committed, staged, unstaged and untracked) with the lines each change added and removed.
 * status: A added, M modified, D deleted, R renamed (`from` is the old path; the old path is not listed again). Git pairs a rename
 * only when both paths are known to the index: a file moved with a plain `mv` is a D and an untracked A (`untracked: true`) until
 * it is staged (`git add -A`, or `git mv`).
 * `hunks` are the changed places in the file as it is now: `{ start, count }` (a pure deletion has count 0 and the line before it
 * as start). `before` is the text of a product source file at the base ("" for a new one), for the rules that compare two versions.
 */
export function readChanges(root, mergeBase) {
  const tokens = git(root, ["diff", "--name-status", "-M", "-z", mergeBase]).split("\0").filter(Boolean);
  const changes = new Map();
  for (let index = 0; index < tokens.length;) {
    const code = tokens[index++][0];
    if (code === "R" || code === "C") {
      const from = tokens[index++], file = tokens[index++];
      changes.set(file, { path: file, status: code === "R" ? "R" : "A", from: code === "R" ? from : undefined, added: [], removed: [], hunks: [] });
    } else {
      const file = tokens[index++];
      changes.set(file, { path: file, status: code === "T" ? "M" : code, added: [], removed: [], hunks: [] });
    }
  }
  // Content: one diff for everything, cut per file. The header's `---`/`+++` lines name the files; `--- /dev/null` is an added file.
  const diff = git(root, ["diff", "-M", "-U0", "--no-color", "--no-ext-diff", mergeBase]);
  for (const section of diff.split(/^diff --git /m).slice(1)) {
    const lines = section.split("\n");
    const firstHunk = lines.findIndex((line) => line.startsWith("@@"));
    const header = firstHunk < 0 ? lines : lines.slice(0, firstHunk);
    const name = (prefix) => header.find((line) => line.startsWith(prefix))?.slice(prefix.length).replace(/\t$/, "");
    const target = name("+++ b/") ?? name("rename to ") ?? name("--- a/");
    const change = changes.get(target);
    if (!change || firstHunk < 0) continue;
    for (const line of lines.slice(firstHunk)) {
      if (line.startsWith("@@")) {
        const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
        if (hunk) change.hunks.push({ start: Number(hunk[1]), count: hunk[2] === undefined ? 1 : Number(hunk[2]) });
      } else if (line.startsWith("+")) change.added.push(line.slice(1));
      else if (line.startsWith("-")) change.removed.push(line.slice(1));
    }
  }
  for (const file of git(root, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean)) {
    if (changes.has(file)) continue;
    const added = linesOf(readText(root, file));
    changes.set(file, { path: file, status: "A", added, removed: [], hunks: [{ start: 1, count: added.length }], untracked: true });
  }
  for (const change of changes.values()) {
    if (PRODUCT_SOURCE.test(change.path)) change.before = change.status === "A" ? "" : textAt(root, mergeBase, change.from ?? change.path);
  }
  return [...changes.values()].sort((left, right) => left.path.localeCompare(right.path));
}

/**
 * Named files, as if each were modified in full: no base to compare with (`before` is null) and the whole file is one hunk, so the
 * rules that read lines or places read the whole file.
 */
export function namedChanges(root, files) {
  return [...new Set(files.map((file) => path.relative(root, path.resolve(root, file)).split(path.sep).join("/")))].sort().map((file) => {
    const present = existsSync(path.join(root, file));
    const added = present ? linesOf(readText(root, file)) : [];
    return { path: file, status: present ? "M" : "D", added, removed: [], hunks: present ? [{ start: 1, count: added.length }] : [], before: null };
  });
}
