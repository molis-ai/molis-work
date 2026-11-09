import { pluginErrors, type PluginDeclarationProblem } from "@molis-ai/molis-work-contracts/platform/plugin";
import { cutHead } from "./whole-units.js";

// The pieces every Manifest and package check shares: what an id and a version look like, how outside text goes into a reason, and
// the one refusal (`plugin.declaration_invalid` with `details.problems`). Internal to the SDK; `parsePluginManifest`, the content
// package and the SKILL.md reader all refuse through `refuseDeclarations`, so the message reads the same wherever it comes from.

const TOKEN = /^[a-z0-9][a-z0-9-]*$/u;
/** At most this many UTF-16 units of a key or path the author wrote, in a reason or a problem's `path`. */
const OUTSIDE_TEXT_UNITS = 200;
/** At most this many problems are listed; the rest are counted in one last row, so a package of junk cannot make the refusal huge. */
const LISTED_PROBLEMS = 30;

/** A lower-case id of letters, digits and hyphens: a Skill, role, Prompt or category. */
export function validToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

/** A declaration version: a whole number from 1. */
export function validVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

/**
 * Text from a third-party Manifest or package (a key, a path) as a reason shows it: quoted, so a control character or a separator
 * reads as written, and cut short, since the install preview and later an Agent read the reason.
 */
export function quoted(text: string): string {
  return JSON.stringify(shortened(text));
}

function shortened(text: string): string {
  return text.length <= OUTSIDE_TEXT_UNITS ? text : `${cutHead(text, OUTSIDE_TEXT_UNITS)}…`;
}

/** Refuse with every problem: the message names each one's file first, and `details.problems` carries them for the preview. */
export function refuseDeclarations(problems: ReadonlyArray<string | PluginDeclarationProblem>): never {
  const all = problems.map(problem => typeof problem === "string" ? { reason: problem }
    : problem.path === undefined ? problem : { ...problem, path: shortened(problem.path) });
  const listed = all.length <= LISTED_PROBLEMS ? all : [...all.slice(0, LISTED_PROBLEMS), { reason: `另有 ${all.length - LISTED_PROBLEMS} 项` }];
  const message = listed.map(problem => problem.path === undefined ? problem.reason : `${JSON.stringify(problem.path)}：${problem.reason}`).join("；");
  throw pluginErrors.declaration_invalid(message, { problems: listed });
}
