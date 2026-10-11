// The error gates as metrics for scripts/check-health-gates.mjs (specs/repository-anti-corruption W3-02-B). Four per-file counts that
// may only fall, compared with the merge-base like every health number, and the owner table that one of them reads:
//
//   errorSubclasses       classes that extend an `…Error`                         scripts/gates/error-scan.mjs
//   errorCodeShape        code literals that are not `<owner>.<reason>`           scripts/gates/error-scan.mjs
//   errorStatusDecisions  HTTP statuses that a test of an error chooses           scripts/gates/error-scan.mjs
//   errorCodeOwner        codes that do not start with their owner's name         scripts/gates/error-owners.mjs
//   errorOwnerTable       tooling/gates/error-owners.json: its own rules (no baseline) and "only stricter" against the merge-base
//
// A file with no record starts at 0, so new code has to arrive clean; a moved file keeps its record. Nothing here is written into
// tooling/gates/baseline.json except the four counts (and their totals), exactly like the other per-file metrics.
import { readFileSync } from "node:fs";
import path from "node:path";
import { ERROR_OWNERS_FILE, errorOwnerProblems, errorOwnersWantsText, looserOwnership, measureOwners, ownerAssignment, readOwnerTable } from "./error-owners.mjs";
import { measureErrors } from "./error-scan.mjs";

const COUNTS = [
  { id: "errorSubclasses", total: "errorSubclassTotal", key: "subclasses", title: "Error subclasses", summary: "error subclasses",
    what: "Error subclasses", hint: "an owner's failures are codes (defineErrorCodes in the plugin SDK, an ActionError with a kind), not a class; delete the class and raise the code" },
  { id: "errorCodeShape", total: "errorCodeShapeTotal", key: "shape", title: "Error codes that are not <owner>.<reason>", summary: "badly shaped error codes",
    what: "error codes that are not lower-case words joined by dots", hint: "write the code as <owner>.<reason> (todo.not_found), lower case, no spaces, no dashes" },
  { id: "errorStatusDecisions", total: "errorStatusDecisionTotal", key: "status", title: "HTTP statuses chosen by a test of an error", summary: "error status decisions",
    what: "HTTP statuses chosen by a test of an error", hint: "give the error a kind and let the plugin SDK's actionHttpStatus / actionErrorResponse pick the status (packages/plugin-sdk/src/errors.ts is the one place)" },
];

/**
 * The metrics. `root` is the repository being gated (the table of owners is read from its working tree, for both sides of the
 * comparison); `required` says that this repository must have the table (the scratch repositories of the other gate tests have none and
 * are left alone); `isSource` is the entry's own test for a source file; the rest are the entry's comparison tools.
 */
export function createErrorMetrics({ root, required, isSource, perFile, rekey, rekeyFile, sumOf }) {
  const lineDetails = new WeakMap(); // the { file: count } object a metric measured -> { file: [text] }
  const grew = (spec) => (head, ref, { renames }) => {
    const before = rekey(ref, renames, rekeyFile);
    const where = lineDetails.get(head) ?? {};
    return Object.entries(head).filter(([file, count]) => count > (before[file] ?? 0)).map(([file, count]) => {
      const lines = where[file] ?? [];
      return `${spec.what} in ${file} ${before[file] ?? 0} → ${count}${lines.length ? ` (${lines.slice(0, 4).join("; ")}${lines.length > 4 ? `; … ${lines.length - 4} more` : ""})` : ""}; ${spec.hint}`;
    });
  };
  const countMetric = (spec, measure) => ({
    id: spec.id,
    measure(snapshot) {
      const { counts, details } = measure(snapshot);
      lineDetails.set(counts, details);
      return counts;
    },
    toBaseline: (counts) => ({ [spec.total]: sumOf(counts), [spec.id]: counts }),
    fromBaseline: (json) => perFile.fromBaseline(json, spec.id),
    grew: grew(spec),
    lowered: perFile.lowered,
    lines: (head, ref, env) => perFile.lines(spec.title, head, ref, env),
    summary: (counts) => `${sumOf(counts)} ${spec.summary}`,
  });

  const metrics = COUNTS.map((spec) => countMetric(spec, (snapshot) => {
    const found = measureErrors(snapshot, isSource);
    return { counts: found[spec.key], details: found.details.get(found[spec.key]) ?? {} };
  }));

  // The owner of a code is read from the working tree's table for both the head and the merge-base, so a change of the table moves both
  // numbers alike and cannot show as progress. A repository without the table counts nothing (and the table metric says whether it must have one).
  let headTable;
  try {
    const text = readFileSync(path.join(root, ERROR_OWNERS_FILE), "utf8");
    headTable = readOwnerTable({ files: [], read: () => text }).table;
  } catch { headTable = null; }
  metrics.push(countMetric({ id: "errorCodeOwner", total: "errorCodeOwnerTotal", title: "Error codes that do not start with their owner's name", summary: "error codes without their owner's name",
    what: "error codes that do not start with their owner's name", hint: "start the code with the name of the owner of the file (tooling/gates/error-owners.json), the platform's own codes (actions.*) apart: goals.event.not_found, not event_report.not_found; a new package or area needs an owner entry first" },
  (snapshot) => measureOwners(snapshot, measureErrors(snapshot, isSource).sites, headTable)));

  metrics.push({
    id: "errorOwnerTable",
    measure: (snapshot) => ({ assignment: ownerAssignment(snapshot, isSource), problems: errorOwnerProblems(snapshot, { required }) }),
    toBaseline: () => ({}),
    fromBaseline: () => null,
    absolute: (value) => value.problems.map((problem) => `error owner table: ${problem}`),
    grew: (head, ref, { renames }) => looserOwnership(head.assignment, ref?.assignment, renames).map((what) =>
      `error owner table: ${what}; an owner is fixed once it is given (the count of that owner's codes is measured with it); correct a wrong assignment in a reviewed change to the gate, not in a feature PR`),
    lowered: () => false,
    lines: (head) => [`Error owner table (${ERROR_OWNERS_FILE}): ${head.assignment ? `${new Set(Object.values(head.assignment.files)).size} owners over ${Object.keys(head.assignment.files).length} source files, platform prefixes ${head.assignment.prefixes.join(", ")}` : "no table"}${head.problems.length ? `, ${head.problems.length} problems` : ""}`],
    summary: (value) => `${value.assignment ? new Set(Object.values(value.assignment.files)).size : 0} error owners`,
  });
  return metrics;
}
