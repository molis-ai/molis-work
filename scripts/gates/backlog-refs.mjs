// Every BL-* id named in a current document must have a row in specs/backlog, or be listed in the tombstone
// docs/backlog-removed.md. The tombstone is the allow-list: it is how a completed, merged or branch-only id stops
// being a requirement without making old prose look like it points at a live item.
//
// Archived material (specs/archive, docs/archive) and the backlog directory itself are not scanned: they are history
// or definitions, not live references. The tombstone is not scanned either, or its own id rows would need themselves.
import path from "node:path";

const REF = /\bBL-[A-Za-z0-9][A-Za-z0-9-]*/g;
const PLACEHOLDERS = new Set(["BL", "BL-NNN", "BL-xxx"]);
const TOMBSTONE = "docs/backlog-removed.md";
const BACKLOG = "specs/backlog/";

export function backlogReferenceProblems(snapshot) {
  const problems = [];
  const tombstone = snapshot.read(TOMBSTONE) ?? "";
  const allow = new Set([...tombstone.matchAll(/\bBL-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((match) => match[0].replace(/-+$/, "")));
  const records = new Set(
    snapshot.files
      .filter((file) => file.startsWith(BACKLOG) && /^BL-.*\.md$/.test(path.posix.basename(file)))
      .map((file) => path.posix.basename(file, ".md")),
  );
  for (const file of snapshot.files) {
    if (!file.endsWith(".md")) continue;
    if (file.startsWith("specs/archive/") || file.startsWith("docs/archive/") || file.startsWith(BACKLOG) || file === TOMBSTONE) continue;
    const lines = (snapshot.read(file) ?? "").split("\n");
    lines.forEach((lineText, index) => {
      for (const raw of lineText.matchAll(REF)) {
        const id = raw[0].replace(/-+$/, "");
        if (PLACEHOLDERS.has(id)) continue;
        if (!records.has(id) && !allow.has(id)) problems.push(`${file}:${index + 1}: ${id} has no row in ${BACKLOG} and is not in ${TOMBSTONE}`);
      }
    });
  }
  return problems;
}
