// A snapshot is { files: string[], read(file): string | null }, the shape scripts/check-health-gates.mjs measures: the working
// tree, or a commit read from the object database (no checkout, so it cannot disturb another session's worktree). The tool
// and the health gate share the graph built on it (graph.mjs), so both see a commit the same way.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const git = (root, args, extra = {}) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 1 << 30, stdio: ["pipe", "pipe", "pipe"], ...extra });
// What the graph reads: sources, package manifests and the tsconfig that says which sources have a built twin, in the places code
// lives (the tests, the scripts a test may import, the packages). The root package.json says which packages a test can name.
const WANTED = /(?:\.(?:ts|mts|mjs)$|(?:^|\/)(?:package|tsconfig)\.json$)/;
const PLACES = /^(?:tests|scripts|apps|horizontal|modules|packages|plugins|server|tooling)\//;
const SKIPPED = /(?:^|\/)node_modules\/|\.d\.ts$/;
export const wantsText = (file) => file === "package.json" || (PLACES.test(file) && WANTED.test(file) && !SKIPPED.test(file));

/** The working tree: tracked files and untracked ones that are not ignored, read from disk. */
export function workingTreeSnapshot(root) {
  const files = git(root, ["-c", "core.quotepath=off", "ls-files", "-z", "--cached", "--others", "--exclude-standard"]).split("\0").filter(Boolean);
  return { files, read: (file) => { try { return readFileSync(path.join(root, file), "utf8"); } catch { return null; } } };
}

/** A commit: the file list from `ls-tree`, the texts the graph needs from one `cat-file --batch`. */
export function commitSnapshot(root, ref) {
  const files = git(root, ["ls-tree", "-r", "-z", "--name-only", ref]).split("\0").filter(Boolean);
  const wanted = files.filter(wantsText);
  const out = git(root, ["cat-file", "--batch"], { input: Buffer.from(wanted.map((file) => `${ref}:${file}\n`).join("")), encoding: "buffer" });
  const texts = new Map();
  let position = 0;
  for (const file of wanted) {
    const end = out.indexOf(10, position);
    const [, type, size] = out.toString("utf8", position, end).split(" ");
    position = end + 1;
    if (type === "missing") continue;
    texts.set(file, out.toString("utf8", position, position + Number(size)));
    position += Number(size) + 1;
  }
  return { files, read: (file) => texts.get(file) ?? null };
}

/** The same snapshot with some files' texts replaced (a rewrite that has not been written yet). `null` deletes a text. */
export const withTexts = (base, texts) => ({ files: base.files, read: (file) => (texts.has(file) ? texts.get(file) : base.read(file)) });
