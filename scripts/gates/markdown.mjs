// Shared reading of Markdown for the doc-reference gates (scripts/gates/README.md). No dependency beyond node.
//
// A "snapshot" is what check-health-gates.mjs hands every gate: { files: string[], read(file): string | null }, the tracked
// files of the working tree (or of a commit) and a reader. Existence always means "tracked in the snapshot", never "on
// disk", so an ignored build output or a local scratch file cannot make a link look fine here and broken in CI.
import path from "node:path";
import { allowedRoots } from "./allowlist.mjs";

/**
 * Files that are live documentation: Markdown at a root entry the allow-list names (tooling/gates/root-allowlist.json, read
 * through allowlist.mjs) outside every archive, vendored build and generated evidence folder. A root entry the allow-list
 * does not name (outputs/, .zcode/) is not documentation of this repository: the root-entries gate owns what happens to it.
 */
export function liveDocs(snapshot) {
  const roots = allowedRoots(snapshot);
  return snapshot.files.filter((file) => {
    if (!/\.md$/.test(file)) return false;
    const parts = file.split("/");
    if (!roots.has(parts[0])) return false;
    return !parts.some((part) => part === "archive" || part === "node_modules" || part === ".impeccable" || part === "dist");
  });
}

/**
 * The text split into prose and inline code. Fenced blocks are dropped from all three (their lines are blanked, so line
 * numbers stay right). `lines` keeps everything else as written; inline code spans are blanked in `prose` and listed in
 * `code`, so a bracket inside a span never reads as a link and a backticked path is still found.
 */
export function readMarkdown(text) {
  const lines = text.split("\n");
  const prose = [];
  const kept = [];
  const code = [];
  let fence = null;
  lines.forEach((line, index) => {
    const open = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length && /^ {0,3}(`{3,}|~{3,})\s*$/.test(line)) fence = null;
      prose.push("");
      kept.push("");
      return;
    }
    if (open) { fence = open[1]; prose.push(""); kept.push(""); return; }
    kept.push(line);
    let blank = line;
    for (const span of line.matchAll(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g)) {
      code.push({ text: span[2].trim(), line: index + 1 });
      blank = blank.slice(0, span.index) + "x".repeat(span[0].length) + blank.slice(span.index + span[0].length);
    }
    prose.push(blank);
  });
  return { prose, code, lines: kept };
}

/** Link destinations written in the prose: inline and image links, reference definitions, and href/src attributes. */
export function markdownLinks(prose) {
  const out = [];
  prose.forEach((line, index) => {
    for (const m of line.matchAll(/\]\(\s*(<[^>\n]*>|[^()\s]*(?:\([^()\s]*\)[^()\s]*)*)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g)) {
      const target = m[1].replace(/^<|>$/g, "");
      if (target) out.push({ target, line: index + 1 });
    }
    const definition = line.match(/^ {0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/);
    if (definition) out.push({ target: definition[1].replace(/^<|>$/g, ""), line: index + 1 });
    for (const m of line.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) out.push({ target: m[1], line: index + 1 });
  });
  return out;
}

/** The anchors GitHub gives the headings of a Markdown file (github-slugger rules; repeats get -1, -2, …) plus explicit ids. */
export function headingAnchors(text) {
  const anchors = new Set();
  const seen = new Map();
  for (const line of readMarkdown(text).lines) {
    const heading = line.match(/^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/);
    if (!heading) continue;
    const plain = heading[1].replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*_~]/g, (mark) => (mark === "_" ? "_" : ""));
    const slug = plain.toLowerCase().replace(/[^\p{L}\p{M}\p{N}_\- ]/gu, "").replace(/ /g, "-");
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    anchors.add(count ? `${slug}-${count}` : slug);
  }
  for (const m of text.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) anchors.add(m[1]);
  return anchors;
}

/** What a tracked-file set can answer: does this path exist as a file or as a directory with files in it? */
export function fileIndex(files) {
  const set = new Set(files);
  const directories = new Set();
  for (const file of files) {
    for (let dir = path.posix.dirname(file); dir && dir !== "." && !directories.has(dir); dir = path.posix.dirname(dir)) directories.add(dir);
  }
  return { has: (p) => set.has(p) || directories.has(p), isFile: (p) => set.has(p), files };
}

export const decode = (value) => { try { return decodeURIComponent(value); } catch { return value; } };
