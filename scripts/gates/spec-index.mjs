// Gate: specs/ keeps the shape specs/README.md promises (specs/repository-anti-corruption §4.12).
//
// The root of specs/ holds three things: specs in progress, current norms, and BACKLOG.md; everything else is in archive/.
// So: nothing but README.md, BACKLOG.md, archive/ and spec directories is tracked at the root; every spec directory is in the
// README's index, once, under the heading that matches its status line (a status line that begins "状态：现行规范" is a
// current norm and sits under "现行规范", every other one is in progress and sits under "在做的"); and the index lists
// nothing that is not a spec directory at the root. (That each spec has a status line is checked by the spec status gate.)
import { readMarkdown } from "./markdown.mjs";

const INDEX = "specs/README.md";
const SECTIONS = { "在做的": "in progress", "现行规范": "current norm" };

export function specIndexProblems(snapshot) {
  const specFiles = snapshot.files.filter((file) => file.startsWith("specs/"));
  if (!specFiles.length) return [];
  const problems = [];
  const directories = new Set();
  for (const file of specFiles) {
    const parts = file.split("/");
    if (parts.length === 2) {
      if (parts[1] !== "README.md" && parts[1] !== "BACKLOG.md") problems.push(`${file}: specs/ holds README.md, BACKLOG.md, archive/ and spec directories at its root; move this into a spec directory or archive/`);
    } else if (parts[1] !== "archive") directories.add(parts[1]);
  }

  const readme = snapshot.read(INDEX);
  // No index at all: nothing to hold the directories against (AGENTS.md cites specs/README.md, so deleting it fails the citation gate).
  if (readme === null) return problems;
  const listed = new Map(); // directory -> section
  let section = null;
  readMarkdown(readme).lines.forEach((line, index) => {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) { section = SECTIONS[heading[1]] ? heading[1] : null; return; }
    if (!section) return;
    const item = line.match(/^\s*[-*]\s+\[[^\]]+\]\(([^)\s#]+)(?:#[^)\s]*)?\)/);
    if (!item) return;
    const target = item[1].replace(/^\.\//, "");
    const spec = target.match(/^([^/]+)\/spec\.md$/);
    if (!spec || !directories.has(spec[1])) {
      problems.push(`${INDEX}:${index + 1}: "${section}" lists ${target}, which is not specs/<directory>/spec.md of a spec at the root`);
      return;
    }
    if (listed.has(spec[1])) problems.push(`${INDEX}:${index + 1}: ${spec[1]} is listed twice (under "${listed.get(spec[1])}" and "${section}")`);
    else listed.set(spec[1], section);
  });

  for (const directory of [...directories].sort()) {
    const wanted = isCurrentNorm(snapshot.read(`specs/${directory}/spec.md`)) ? "现行规范" : "在做的";
    const found = listed.get(directory);
    if (found === undefined) problems.push(`${INDEX}: specs/${directory} is at the root but not in the index; list it under "${wanted}"`);
    else if (found !== wanted) problems.push(`${INDEX}: specs/${directory} is listed under "${found}" but its status line says it belongs under "${wanted}"`);
  }
  return problems;
}

function isCurrentNorm(spec) {
  if (spec === null) return false;
  return /^状态：现行规范/m.test(spec.split("\n").slice(0, 8).join("\n"));
}
