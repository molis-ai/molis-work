// G1's named exceptions (specs/plugin-specials-demotion §5.1; user 2026-11-25, batch 44C: "计数不变，加具名例外名单"). The count of
// `platformPluginNames` is unchanged and still may only fall against the merge-base; on top of it, every platform source the count finds
// must have one row in tooling/gates/plugin-name-exceptions.json that says what the names are, why they stay and when the user decided,
// and its `count` is the measured one. The list and the disk agree both ways: a file the count finds without a row fails, and so does a
// row whose file the count no longer finds (delete the row) or whose count differs (record the measured count; it is reviewed in the diff).
// A repository without the list (a scratch repository of the gate's own tests) is not held to it; this repository is.

export const PLUGIN_NAME_EXCEPTIONS_FILE = "tooling/gates/plugin-name-exceptions.json";

/**
 * What a row may say the names are:
 * - `same-word`: an ordinary or platform word that is spelt like a plugin's short id (`form`, `issues`, `pages`, `todo`, `diff` as a
 *   format, the `git` program, an icon name); not a plugin.
 * - `batch-109`: the workspace Git, Diff and Coding code that batch 109 moves into its plugins (decision D6=B); not split in 44C.
 * - `batches-106-109`: Feed and Work Brief's `dual_instance` and `HomePluginHost`, handed to batches 106～109 (44B record).
 * - `upgrade-step`: a storage upgrade step for values a released version wrote, kept with the upgrade chain.
 * - `vendor-name`: a name the vendored Prologue SDK gives (its official packs and their tools).
 * - `deferred`: a plugin named on purpose until a backlog item the user put off lands; the reason names the item.
 * - `qa-tool`: an isolated QA script that drives real plugins to show them; not loaded by the product.
 */
export const PLUGIN_NAME_EXCEPTION_KINDS = ["same-word", "batch-109", "batches-106-109", "upgrade-step", "vendor-name", "deferred", "qa-tool"];
const FIELDS = ["count", "kind", "reason", "decided"];
const MIN_REASON_CHARACTERS = 12;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

/** The problems of the list against the measured counts ({ file: count }). `required`: this repository must carry the list. */
export function pluginNameExceptionProblems(snapshot, counts, { required }) {
  const text = snapshot.read(PLUGIN_NAME_EXCEPTIONS_FILE);
  // A tree the count finds no plugin name in needs no list (a copy of the repository's layout without its sources).
  if (text === null || text === undefined) return required && Object.keys(counts).length ? [`${PLUGIN_NAME_EXCEPTIONS_FILE} is missing; G1's named exceptions are listed there`] : [];
  let parsed;
  try { parsed = JSON.parse(text); } catch { return [`${PLUGIN_NAME_EXCEPTIONS_FILE} is not valid JSON`]; }
  if (!isRecord(parsed) || !isRecord(parsed.files)) return [`${PLUGIN_NAME_EXCEPTIONS_FILE} needs a "files" object keyed by path`];
  const problems = Object.keys(parsed).filter((key) => !["note", "files"].includes(key)).map((key) => `${PLUGIN_NAME_EXCEPTIONS_FILE}: unknown section "${key}"`);
  const files = Object.keys(parsed.files);
  const sorted = [...files].sort();
  if (files.some((file, index) => file !== sorted[index])) problems.push(`${PLUGIN_NAME_EXCEPTIONS_FILE}: list the files in sorted order`);
  for (const file of files) {
    const entry = parsed.files[file], where = `${PLUGIN_NAME_EXCEPTIONS_FILE}: ${file}`;
    if (!isRecord(entry)) { problems.push(`${where}: a row is an object`); continue; }
    for (const field of Object.keys(entry).filter((key) => !FIELDS.includes(key))) problems.push(`${where}: unknown field "${field}"`);
    if (!PLUGIN_NAME_EXCEPTION_KINDS.includes(entry.kind)) problems.push(`${where}: "kind" must be one of ${PLUGIN_NAME_EXCEPTION_KINDS.join(", ")}`);
    if (typeof entry.reason !== "string" || entry.reason.replace(/\s+/gu, "").length < MIN_REASON_CHARACTERS) problems.push(`${where}: "reason" needs at least ${MIN_REASON_CHARACTERS} characters that say what the names are and why they stay`);
    if (typeof entry.decided !== "string" || !DATE.test(entry.decided)) problems.push(`${where}: "decided" is the date the user decided, YYYY-MM-DD`);
    const measured = counts[file] ?? 0;
    if (!measured) problems.push(`${where}: the file names no plugin any more (or is gone); delete the row`);
    else if (entry.count !== measured) problems.push(`${where}: "count" is ${JSON.stringify(entry.count)} but the file measures ${measured}; record the measured count`);
  }
  for (const [file, count] of Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))) {
    if (!(file in parsed.files)) problems.push(`platformPluginNames: ${file} names a plugin ${count} time${count === 1 ? "" : "s"} and has no row in ${PLUGIN_NAME_EXCEPTIONS_FILE}; make it a public declaration any plugin can make or move it into the plugin (specs/plugin-specials-demotion §5)`);
  }
  return problems;
}
