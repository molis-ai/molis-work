import type { AgentWriteChecker } from "@molis-ai/molis-work-contracts/services/agent-host";

// The after-write checkers in the project's settings, next to the workspaces (specs/prologue-adoption §6.0p.13). The page
// reads and saves them through the person's own two actions; the page program (src/browser/write-checkers.ts, bundled into the
// settings script) shapes what it sends with the three functions below, and the tests read them from the package's entry.

/** The editor's fields as typed: the arguments and the extensions on one line each, the time limit in seconds. */
export interface WriteCheckerFields {
  display_name: string;
  executable: string;
  args: string;
  applies_to: string;
  cwd: string;
  timeout_seconds: string;
}

/**
 * One checker in the contract's shape from the editor (PA-42): words are split on spaces, a quoted word is one argument,
 * `{file}` stays as typed, an extension gets its dot, seconds become milliseconds. Whether the checker is allowed is the save
 * action's to say, so nothing here refuses. A new checker gets an id from its program that the list does not use yet.
 */
export function writeCheckerFromFields(fields: WriteCheckerFields, taken: readonly string[], checkerId: string | null): AgentWriteChecker {
  let id = checkerId;
  if (!id) {
    const base = String(fields.executable).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[^a-z0-9]+/, "").slice(0, 56) || "checker";
    id = base;
    for (let n = 2; taken.includes(id); n++) id = base + "-" + n;
  }
  const args = [...String(fields.args).matchAll(/"((?:\\.|[^"\\])*)"|(\S+)/g)]
    .map(match => match[1] === undefined ? match[2] ?? "" : match[1].replace(/\\(["\\])/g, "$1"));
  const extensions = String(fields.applies_to).split(/[\s,，、]+/).filter(Boolean).map(extension => extension.startsWith(".") ? extension : "." + extension);
  const cwd = String(fields.cwd).trim();
  const seconds = String(fields.timeout_seconds).trim();
  return { checker_id: id, display_name: String(fields.display_name).trim(), executable: String(fields.executable).trim(), args,
    applies_to: [...new Set(extensions)], ...(cwd ? { cwd } : {}), ...(seconds ? { timeout_ms: Math.round(Number(seconds) * 1000) } : {}) };
}

/** Quote empty arguments and those with whitespace, quotes or backslashes; only quotes/backslashes are escaped. No shell evaluation. */
export function writeCheckerFieldsOf(checker: Required<AgentWriteChecker>): WriteCheckerFields {
  const word = (arg: string) => arg === "" || /[\s"\\]/.test(arg) ? "\"" + arg.replace(/["\\]/g, "\\$&") + "\"" : arg;
  return { display_name: checker.display_name, executable: checker.executable, args: checker.args.map(word).join(" "),
    applies_to: checker.applies_to.join(" "), cwd: checker.cwd, timeout_seconds: String(checker.timeout_ms / 1000) };
}

/**
 * The group a row's button or the form saves (PA-42), touching only the checker named: "up" swaps it with the one above,
 * "remove" drops it, a checker takes the place of the one with its id or, new, goes last.
 */
export function writeCheckersAfter(checkers: readonly AgentWriteChecker[], checkerId: string | null, change: "up" | "remove" | AgentWriteChecker): AgentWriteChecker[] {
  const at = checkers.findIndex(item => item.checker_id === checkerId);
  if (change === "remove") return checkers.filter((_, index) => index !== at);
  if (change === "up") return at > 0 ? [...checkers.slice(0, at - 1), ...checkers.slice(at, at + 1), ...checkers.slice(at - 1, at), ...checkers.slice(at + 1)] : [...checkers];
  return at < 0 ? [...checkers, change] : checkers.map((item, index) => index === at ? change : item);
}
