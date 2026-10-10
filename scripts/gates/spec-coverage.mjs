// Spec acceptance ids and the tests that cite them (specs/repository-anti-corruption §4.8 "需求可追溯", slice W2-14). The
// convention is written in specs/README.md ("验收编号"); scripts/check-spec-coverage.mjs is the command, and
// scripts/check-health-gates.mjs --report prints the one-line summary. This module is the reading, not a gate yet: it
// returns what it found, and the command decides whether that fails anything (report mode never does; --strict does).
//
// What is read
//   Specs      specs/<directory>/spec.md of every spec at the root of specs/. In a section whose heading says 验收 or
//              Acceptance, a line that starts with an id defines it: the id may follow a list marker
//              ("- ", "1. ") or the opening bar of a table row, and emphasis marks around it ("**DOCK-03**") are ignored.
//              An id is 2–8 capital letters, a hyphen and 2 or 3 digits. Prefix and number are the whole identity: the
//              prefix names the spec (one prefix per spec, one spec per prefix), the number is never renumbered or reused.
//                ~~DOCK-04~~ …    retired: the criterion was dropped; the id stays taken, nothing has to cover it
//                … [人工]         verified by a person (a real device, a judgement, the user's own trial): no test is asked for
//              A spec with an acceptance section and no id at all is "unnumbered" unless a line near the top says
//              "验收编号：不适用（理由）". In a block of an acceptance section (the lines between two headings) that has an id,
//              every other top-level list item or table row without one is a criterion that was added without an id.
//   Archive    specs/archive/<directory>/spec.md is read for definitions only. Moving a spec into the archive does not give
//              its ids back: an archived prefix stays taken (a later spec cannot use it, so the old tests that cite it never
//              count as coverage for new criteria), an archived id stays defined (the tests that cite it are not stale), and
//              nothing else is asked of an archived spec (no coverage, no ids required, no exemption).
//   Tests      every tracked file that is a test (*.test.* anywhere, or a code file under a tests/ directory; nothing under
//              a fixtures/, vendor/, node_modules/, dist/ or .impeccable/ folder is, at the root or nested at any depth,
//              whatever it is called): a mention of
//              a defined id anywhere in the file (a test name, a comment) covers it. Mentions are looked for by the
//              prefixes the specs define, so SHA-256 or UTF-16 in a test is never taken for an id.
//
// A snapshot is { files: string[], read(file): string | null }, as in scripts/gates/markdown.mjs.
import { readMarkdown } from "./markdown.mjs";

/** Other id families of this repository (BACKLOG rows, post-merge-review items): a spec may not take their prefix. */
export const RESERVED_PREFIXES = new Set(["BL", "PMR"]);

const ACCEPTANCE_HEADING = /验收|acceptance/i;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
// A definition: nothing but a list marker or a table bar, then emphasis marks, then the id (indent 0 or 1: deeper is a sub-item).
const DEFINITION = /^ ?(?:(?:[-*+]|\d{1,3}[.)])[ \t]+|\|[ \t]*)?([~*_`]*)([A-Z]{2,8})-(\d{2,3})(?![0-9A-Za-z-])/;
const LIST_ITEM = /^ ?(?:[-*+]|\d{1,3}[.)])[ \t]+\S/;
const TABLE_ROW = /^ ?\|.*\|[ \t]*$/;
const TABLE_RULE = /^ ?\|?[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/;
const MANUAL = /\[人工\]/;
const EXEMPT = /^验收编号：[ \t]*不适用(?:[（(]([^）)\n]*)[）)])?/m;

export const isTestFile = (file) => {
  // Not tests whatever their name, at the root or nested at any depth: vendored code, dependencies, build output, review
  // screenshots, and fixtures/ (input a test reads, not a proof).
  if (/(^|\/)(vendor|node_modules|dist|\.impeccable|fixtures)\//.test(file)) return false;
  if (/\.test\.(ts|mts|tsx|mjs|cjs|js)$/.test(file)) return true;
  return /(^|\/)tests?\//.test(file) && /\.(ts|mts|tsx|mjs|cjs|js)$/.test(file);
};

/** One spec's text: its acceptance headings, the ids defined, the criteria that carry none, and an exemption if it has one. */
export function parseSpec(text) {
  const { lines } = readMarkdown(text);
  const headings = [];
  const definitions = [];
  const unnumbered = [];
  let section = null; // the acceptance section we are inside: { level }
  let block = null; // the lines since the last heading, inside such a section
  const closeBlock = () => {
    if (block?.ids) unnumbered.push(...block.loose);
    block = null;
  };
  lines.forEach((line, index) => {
    const heading = line.match(HEADING);
    if (heading) {
      closeBlock();
      const level = heading[1].length;
      if (section && level <= section.level) section = null;
      if (!section && ACCEPTANCE_HEADING.test(heading[2])) {
        section = { level };
        headings.push({ line: index + 1, title: heading[2] });
      }
      if (section) block = { ids: 0, loose: [] };
      return;
    }
    if (!block) return;
    if (TABLE_RULE.test(line)) return;
    if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[index + 1] ?? "")) return; // the header row of a table
    const found = line.match(DEFINITION);
    if (found) {
      block.ids++;
      definitions.push({
        id: `${found[2]}-${found[3]}`, prefix: found[2], line: index + 1,
        retired: found[1].includes("~~"), manual: MANUAL.test(line), text: line.trim(),
      });
    } else if (LIST_ITEM.test(line) || TABLE_ROW.test(line)) block.loose.push({ line: index + 1, text: line.trim() });
  });
  closeBlock();
  const exempt = text.split("\n").slice(0, 12).join("\n").match(EXEMPT);
  return { headings, definitions, unnumbered, exempt: exempt ? { reason: (exempt[1] ?? "").trim() } : null };
}

/** The tracked specs: specs/<directory>/spec.md in progress, specs/archive/<directory>/spec.md once archived (one level each). */
const specDirectories = (snapshot, pattern) => snapshot.files
  .map((file) => file.match(pattern))
  .filter(Boolean)
  .map((match) => match[1])
  .sort();
const activeSpecs = (snapshot) => specDirectories(snapshot, /^specs\/([^/]+)\/spec\.md$/);
const archivedSpecs = (snapshot) => specDirectories(snapshot, /^specs\/archive\/([^/]+)\/spec\.md$/);

/** Which files mention which of the ids that start with one of `prefixes`: Map(id → sorted file list), and how many files were read. */
function testMentions(snapshot, prefixes) {
  const mentions = new Map();
  if (!prefixes.size) return { mentions, filesRead: 0 };
  const pattern = new RegExp(`(?<![A-Za-z0-9_-])((?:${[...prefixes].join("|")})-\\d{2,3})(?![0-9A-Za-z-])`, "g");
  let filesRead = 0;
  for (const file of snapshot.files) {
    if (!isTestFile(file)) continue;
    const text = snapshot.read(file);
    if (text === null) continue;
    filesRead++;
    for (const match of text.matchAll(pattern)) {
      if (!mentions.has(match[1])) mentions.set(match[1], new Set());
      mentions.get(match[1]).add(file);
    }
  }
  return { mentions: new Map([...mentions].map(([id, files]) => [id, [...files].sort()])), filesRead };
}

/**
 * What the specs promise and what the tests cite.
 * Returns { specs, archived, problems, testFilesRead }; a problem is { kind, where, message } and is what `--strict` would fail on.
 * `specs` are the specs in progress (all rules apply); `archived` are the archived specs that define ids (definitions only).
 */
export function specCoverage(snapshot) {
  const problems = [];
  const problem = (kind, where, message) => problems.push({ kind, where, message });
  const specs = [];
  const archived = [];
  const defined = new Map(); // id → [{ label, file, line, retired, archived }]
  const prefixOwners = new Map(); // prefix → Map(label → archived?)
  const claim = (label, file, isArchived, definitions) => {
    for (const definition of definitions) {
      if (!prefixOwners.has(definition.prefix)) prefixOwners.set(definition.prefix, new Map());
      prefixOwners.get(definition.prefix).set(label, isArchived);
      if (!defined.has(definition.id)) defined.set(definition.id, []);
      defined.get(definition.id).push({ label, file, line: definition.line, retired: definition.retired, archived: isArchived });
    }
  };

  for (const directory of activeSpecs(snapshot)) {
    const file = `specs/${directory}/spec.md`;
    const text = snapshot.read(file);
    if (text === null) continue;
    const parsed = parseSpec(text);
    const entry = { directory, file, ...parsed, prefix: null, criteria: [] };
    specs.push(entry);
    const prefixes = new Set(parsed.definitions.map((definition) => definition.prefix));
    entry.prefix = [...prefixes].sort().join(", ") || null;
    claim(directory, file, false, parsed.definitions);
    for (const prefix of prefixes) {
      if (RESERVED_PREFIXES.has(prefix)) problem("reserved-prefix", file, `${prefix} is the prefix of another id family (BACKLOG, post-merge review); give this spec's acceptance ids a prefix of their own`);
    }
    if (prefixes.size > 1) problem("prefix-mixed", file, `uses ${prefixes.size} prefixes (${entry.prefix}); a spec's acceptance ids share one prefix, so an id says which spec it belongs to`);
    for (const loose of parsed.unnumbered) problem("criterion-without-id", `${file}:${loose.line}`, `a criterion beside numbered ones carries no id: ${loose.text.slice(0, 80)}`);
    if (parsed.headings.length && !parsed.definitions.length) {
      if (!parsed.exempt) problem("unnumbered", file, `has an acceptance section (${parsed.headings.map((heading) => `line ${heading.line} "${heading.title}"`).join(", ")}) and no acceptance id; number the criteria, or say 验收编号：不适用（理由） near the top`);
    }
    if (parsed.exempt && !parsed.exempt.reason) problem("exempt-without-reason", file, "says 验收编号：不适用 without a reason in brackets");
    if (parsed.exempt && parsed.definitions.length) problem("exempt-but-numbered", file, "says 验收编号：不适用 and also defines acceptance ids; drop one of the two");
  }

  // An archived spec keeps what it defined: its prefix stays taken and its ids stay defined. Nothing else is asked of it.
  for (const directory of archivedSpecs(snapshot)) {
    const file = `specs/archive/${directory}/spec.md`;
    const text = snapshot.read(file);
    if (text === null) continue;
    const { definitions } = parseSpec(text);
    if (!definitions.length) continue;
    claim(`archive/${directory}`, file, true, definitions);
    archived.push({ directory, file, definitions, prefix: [...new Set(definitions.map((definition) => definition.prefix))].sort().join(", "), tests: [] });
  }

  for (const [prefix, owners] of prefixOwners) {
    // Two archived specs that share a prefix cannot be fixed any more (the archive is frozen), so only a spec in progress is held to it.
    if (owners.size < 2 || ![...owners.values()].includes(false)) continue;
    problem("prefix-shared", prefix, `the prefix ${prefix} is used by ${[...owners.keys()].sort().join(" and ")}; one prefix names one spec${[...owners.values()].includes(true) ? ", and an archived spec keeps its prefix" : ""}`);
  }
  for (const [id, places] of defined) {
    if (places.length < 2 || places.every((place) => place.archived)) continue;
    problem("duplicate-id", id, `defined ${places.length} times (${places.map((place) => `${place.file}:${place.line}`).join(", ")}); an id is never reused`);
  }

  const { mentions, filesRead } = testMentions(snapshot, new Set(prefixOwners.keys()));
  for (const entry of specs) {
    for (const definition of entry.definitions) {
      const files = mentions.get(definition.id) ?? [];
      entry.criteria.push({ ...definition, tests: files });
      if (!definition.retired && !definition.manual && !files.length) {
        problem("uncovered", `${entry.file}:${definition.line}`, `${definition.id} is cited by no test; put the id in the name or a comment of the test that proves it, or mark the criterion [人工] if a person is the proof`);
      }
    }
  }
  for (const entry of archived) {
    entry.tests = [...new Set(entry.definitions.flatMap((definition) => mentions.get(definition.id) ?? []))].sort();
  }
  for (const [id, files] of mentions) {
    const places = defined.get(id);
    const also = files.length > 1 ? ` (also ${files.length - 1} other test file${files.length > 2 ? "s" : ""})` : "";
    if (!places) problem("stale-reference", files[0], `cites ${id}, which no spec defines${also}`);
    else if (places.every((place) => place.retired)) problem("stale-reference", files[0], `cites ${id}, which ${places[0].file} retired${also}`);
  }

  return { specs, archived, problems, testFilesRead: filesRead };
}

/** Numbers per spec for the report: criteria that count (not retired), covered by a test, manual only, with no proof. */
export function specCounts(entry) {
  const live = entry.criteria.filter((criterion) => !criterion.retired);
  const covered = live.filter((criterion) => criterion.tests.length);
  const manual = live.filter((criterion) => !criterion.tests.length && criterion.manual);
  const open = live.filter((criterion) => !criterion.tests.length && !criterion.manual);
  return { criteria: live.length, covered: covered.length, manual: manual.length, open: open.map((criterion) => criterion.id), retired: entry.criteria.length - live.length };
}

/**
 * How the specs in progress divide up, for both reports (the full one and the health:check line count the same way):
 * numbered (at least one id), unnumbered (an acceptance section, no id, no exemption), exempt (an acceptance section, no id,
 * 验收编号：不适用), and the rest, which have no acceptance section at all. The four add up to all specs in progress.
 */
function specTally(result) {
  const numbered = result.specs.filter((entry) => entry.definitions.length);
  const noIds = result.specs.filter((entry) => !entry.definitions.length);
  return {
    numbered,
    unnumbered: noIds.filter((entry) => entry.headings.length && !entry.exempt),
    exempt: noIds.filter((entry) => entry.headings.length && entry.exempt),
    without: noIds.filter((entry) => !entry.headings.length),
  };
}

/** The full report as lines of text. */
export function renderReport(result, { strict = false } = {}) {
  const lines = [];
  const { numbered, unnumbered, exempt, without } = specTally(result);
  const withSection = result.specs.filter((entry) => entry.headings.length && !entry.definitions.length); // unnumbered and exempt, in order
  lines.push(strict
    ? "Spec acceptance ids (strict: any problem below fails)"
    : "Spec acceptance ids (report only: this run exits 0 whatever it finds; --strict is the gate)");
  lines.push(`${result.specs.length} specs in progress: ${numbered.length} numbered, ${unnumbered.length} with an acceptance section and no ids, ${exempt.length} exempt from ids, ${without.length} with no acceptance section; ${result.testFilesRead} test files read for citations.${result.archived.length ? ` Archived specs that keep ids taken: ${result.archived.length}.` : ""}`);
  if (numbered.length) {
    lines.push("", "Numbered specs");
    for (const entry of numbered) {
      const counts = specCounts(entry);
      const parts = [`${counts.criteria} criteria`, `${counts.covered} cited by a test`, `${counts.manual} manual only`, `${counts.open.length} with no proof${counts.open.length ? ` (${counts.open.join(", ")})` : ""}`];
      if (counts.retired) parts.push(`${counts.retired} retired`);
      lines.push(`- ${entry.file} [${entry.prefix}]: ${parts.join("; ")}`);
    }
  }
  if (result.archived.length) {
    lines.push("", "Archived specs that keep ids taken (read for definitions only: a prefix stays reserved, a cited id is not stale)");
    for (const entry of result.archived) {
      const retired = entry.definitions.filter((definition) => definition.retired).length;
      lines.push(`- ${entry.file} [${entry.prefix}]: ${entry.definitions.length} ids${retired ? ` (${retired} retired)` : ""}; cited by ${entry.tests.length} test file${entry.tests.length === 1 ? "" : "s"}`);
    }
  }
  if (withSection.length) {
    lines.push("", "Acceptance section, no ids yet");
    for (const entry of withSection) lines.push(`- ${entry.file}: ${entry.exempt ? `exempt (${entry.exempt.reason || "no reason given"})` : entry.headings.map((heading) => `line ${heading.line} "${heading.title}"`).join(", ")}`);
  }
  if (without.length) lines.push("", `No acceptance section (nothing to number): ${without.map((entry) => entry.directory).join(", ")}`);
  lines.push("", result.problems.length
    ? `${strict ? "Problems" : "What --strict would fail on"} (${result.problems.length})`
    : `${strict ? "Problems" : "What --strict would fail on"}: none`);
  for (const found of result.problems) lines.push(`- ${found.kind}: ${found.where}: ${found.message}`);
  return lines;
}

/** One line for `check-health-gates.mjs --report`. */
export function specCoverageLine(snapshot) {
  const result = specCoverage(snapshot);
  const { numbered, unnumbered, exempt } = specTally(result);
  const totals = numbered.map(specCounts).reduce((sum, counts) => ({ criteria: sum.criteria + counts.criteria, covered: sum.covered + counts.covered }), { criteria: 0, covered: 0 });
  return `Spec acceptance ids (report only, \`node scripts/check-spec-coverage.mjs\` lists them): ${numbered.length} of ${result.specs.length} specs numbered (${totals.covered} of ${totals.criteria} criteria cited by a test), ${unnumbered.length} with an acceptance section and no ids, ${exempt.length} exempt from ids, ${result.problems.length} problems.${result.archived.length ? ` Archived specs that keep ids taken: ${result.archived.length}.` : ""}`;
}
