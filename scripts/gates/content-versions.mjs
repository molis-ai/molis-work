/** Content that moved in 44B is the same content: where it is now, and where it was (Skills to the platform, Shelf to its Module). */
const MOVED = [[/^packages\/system-skills\//u, "plugins/content/"], [/^modules\/shelf\//u, "plugins/native/shelf/"]];
const formerPath = file => MOVED.reduce((path, [now, before]) => path.replace(now, before), file);

/** Content files are versioned once, independently of the language they are read in. */
function versionKeys(file, known) {
  const replyLanguage = /^apps\/local-host\/prompts\/reply-language\/[^/]+\.md$/u.exec(file);
  if (replyLanguage) return ["prompt.reply-language"];
  const prompt = /^(?:apps\/local-host|(?:plugins\/native|horizontal|modules)\/[^/]+)\/prompts\/([^/]+)\.md$/u.exec(file);
  const method = /^plugins\/native\/([^/]+)\/methods\/(?:[^/]+\/)?([^/]+)\.md$/u.exec(file);
  // A content pack's or system skill pack's Skill body (and bundled references) share the same Skill and version.
  const contentMethod = /^(?:plugins\/content|packages\/system-skills)\/([^/]+)\/skills\/([^/]+)\/(?:SKILL(?:\.[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2})?)?|references\/[^/]+)\.md$/u.exec(file);
  const name = prompt ? "prompt." + prompt[1] : contentMethod
    ? "method." + contentMethod[1] + "." + contentMethod[2]
    : method && !method[2].startsWith("runtime.")
      ? "method." + method[2] : null;
  if (!name) return [];
  // A stable id may itself end in a language (shelf.translate.en). Only the version table can distinguish an id from a suffix.
  const unqualified = name.replace(/\.[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2})?$/u, "");
  if (unqualified === name || !known.has(unqualified)) return [name];
  return known.has(name) ? [name, unqualified] : [unqualified];
}

/** Composed prompts whose shipped text embeds another prompt file at runtime (editing the base changes both). */
const COMPOSED_PROMPT_DEPENDENTS = {
  "prompt.todo.organize.basic": ["prompt.todo.organize.organizer"],
};

const table = raw => raw ? JSON.parse(raw).versions ?? {} : {};
const body = raw => (typeof raw === "string" ? raw.replace(/^version: \d+\r?\n/mu, "").trimEnd() : null);

/** The live registry is checked by the built contract test. This gate also checks an actual edit against its base. */
export function contentVersionChanges({ files, read }, readBase, baseFiles = []) {
  if (!readBase) return [];
  const before = table(readBase("tooling/versions.json")), current = table(read("tooling/versions.json")), groups = new Map();
  const known = new Set([...Object.keys(before), ...Object.keys(current)]), errors = [];
  const headFiles = new Set(files);
  const allFiles = new Set([...files, ...(baseFiles ?? [])]);
  for (const file of allFiles) {
    const [key, ambiguous] = versionKeys(file, known);
    if (ambiguous) {
      if (headFiles.has(file)) errors.push(file + ": ambiguous content id (" + key + " or a translation of " + ambiguous + ")");
      continue;
    }
    if (key) {
      groups.set(key, [...(groups.get(key) ?? []), file]);
      for (const dependent of COMPOSED_PROMPT_DEPENDENTS[key] ?? []) {
        groups.set(dependent, [...(groups.get(dependent) ?? []), file]);
      }
    }
  }
  const present = value => value !== null && value !== undefined;
  for (const [key, paths] of groups) {
    const has = file => present(read(file));
    // A retired content entry whose files and version key were all removed together needs no version bump.
    if (current[key] === undefined && !paths.some(has)) continue;
    const next = current[key], previous = before[key];
    if (!Number.isSafeInteger(next) || next < 1) {
      errors.push(key + " has no positive content version in tooling/versions.json");
      continue;
    }
    if (previous === undefined) continue;
    // Moved content (MOVED) has its base where it was; preserve empty-string blobs distinct from absent (null/undefined).
    const base = file => {
      const direct = readBase(file);
      if (present(direct)) return direct;
      const former = formerPath(file);
      return former !== file ? readBase(former) : null;
    };
    // The old path of moved content is gone and the content is where it is now; any other missing file is a deletion and a change.
    const moved = file => !has(file) && paths.some(other => has(other) && formerPath(other) === file);
    const changed = paths.filter(file => !moved(file)).some(file => body(read(file)) !== body(base(file)));
    if (changed && next <= previous) errors.push(key + " changed content without advancing its version");
    if (!changed && next !== previous) errors.push(key + " advanced without changing its content");
  }
  return errors;
}
