/** Content that moved in 44B is the same content: where it is now, and where it was (Skills to the platform, Shelf to its Module). */
const MOVED = [[/^packages\/system-skills\//u, "plugins/content/"], [/^modules\/shelf\//u, "plugins/native/shelf/"]];
const formerPath = file => MOVED.reduce((path, [now, before]) => path.replace(now, before), file);

/** Content files are versioned once, independently of the language they are read in. */
function versionKeys(file, known) {
  const prompt = /^(?:apps\/local-host|plugins\/native\/[^/]+|modules\/[^/]+)\/prompts\/([^/]+)\.md$/u.exec(file);
  const method = /^plugins\/native\/([^/]+)\/methods\/(?:[^/]+\/)?([^/]+)\.md$/u.exec(file);
  // A content pack's Skill body carries its own version in SKILL.md; the other languages are the same Skill and version.
  const contentMethod = /^(?:plugins\/content|packages\/system-skills)\/([^/]+)\/skills\/([^/]+)\/SKILL(?:\.[a-z]{2,3})?\.md$/u.exec(file);
  const name = prompt ? "prompt." + prompt[1] : contentMethod
    ? "method." + contentMethod[1] + "." + contentMethod[2]
    : method && !method[2].startsWith("runtime.")
      ? "method." + (method[1] === "goals" ? "goals." : "") + method[2] : null;
  if (!name) return [];
  // A stable id may itself end in a language (shelf.translate.en). Only the version table can distinguish an id from a suffix.
  const unqualified = name.replace(/\.[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2})?$/u, "");
  if (unqualified === name || !known.has(unqualified)) return [name];
  return known.has(name) ? [name, unqualified] : [unqualified];
}

const table = raw => raw ? JSON.parse(raw).versions ?? {} : {};
const body = raw => raw?.replace(/^version: \d+\r?\n/mu, "").trimEnd() ?? null;

/** The live registry is checked by the built contract test. This gate also checks an actual edit against its base. */
export function contentVersionChanges({ files, read }, readBase) {
  if (!readBase) return [];
  const before = table(readBase("tooling/versions.json")), current = table(read("tooling/versions.json")), groups = new Map();
  const known = new Set([...Object.keys(before), ...Object.keys(current)]), errors = [];
  for (const file of files) {
    const [key, ambiguous] = versionKeys(file, known);
    if (ambiguous) { errors.push(file + ": ambiguous content id (" + key + " or a translation of " + ambiguous + ")"); continue; }
    if (key) groups.set(key, [...(groups.get(key) ?? []), file]);
  }
  for (const [key, paths] of groups) {
    const next = current[key], previous = before[key];
    if (!Number.isSafeInteger(next) || next < 1) { errors.push(key + " has no positive content version in tooling/versions.json"); continue; }
    if (previous === undefined) continue;
    // Moved content (MOVED) has its base where it was (a missing base blob reads as "").
    const base = file => readBase(file) || readBase(formerPath(file));
    // The old path of moved content is gone and the content is where it is now; any other missing file is a deletion and a change.
    const has = file => read(file) !== null && read(file) !== undefined;
    const moved = file => !has(file) && paths.some(other => has(other) && formerPath(other) === file);
    const changed = paths.filter(file => !moved(file)).some(file => body(read(file)) !== body(base(file)));
    if (changed && next <= previous) errors.push(key + " changed content without advancing its version");
    if (!changed && next !== previous) errors.push(key + " advanced without changing its content");
  }
  return errors;
}
