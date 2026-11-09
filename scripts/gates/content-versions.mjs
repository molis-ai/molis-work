/** Content files are versioned once, independently of the language they are read in. */
function versionKey(file) {
  const prompt = /^(?:apps\/local-host|plugins\/native\/[^/]+)\/prompts\/([^/]+)\.md$/u.exec(file);
  if (prompt) return "prompt." + prompt[1].replace(/\.en$/u, "");
  const method = /^plugins\/native\/([^/]+)\/methods\/(?:[^/]+\/)?([^/]+)\.md$/u.exec(file);
  if (!method || method[2].startsWith("runtime.")) return null;
  return "method." + (method[1] === "goals" ? "goals." : "") + method[2].replace(/\.en$/u, "");
}

const table = raw => raw ? JSON.parse(raw).versions ?? {} : {};
const body = raw => raw?.replace(/^version: \d+\r?\n/mu, "").trimEnd() ?? null;

/** The live registry is checked by the built contract test. This gate also checks an actual edit against its base. */
export function contentVersionChanges({ files, read }, readBase) {
  if (!readBase) return [];
  const before = table(readBase("tooling/versions.json")), current = table(read("tooling/versions.json")), groups = new Map();
  for (const file of files) {
    const key = versionKey(file);
    if (key) groups.set(key, [...(groups.get(key) ?? []), file]);
  }
  const shared = ["zh", "en"].map(locale => "plugins/native/goals/methods/runtime." + locale + ".md");
  const sharedChanged = shared.some(file => body(read(file)) !== body(readBase(file)));
  const errors = [];
  for (const [key, paths] of groups) {
    const next = current[key], previous = before[key];
    if (!Number.isSafeInteger(next) || next < 1) { errors.push(key + " has no positive content version in tooling/versions.json"); continue; }
    if (previous === undefined) continue;
    const changed = (key.startsWith("method.goals.") && sharedChanged) || paths.some(file => body(read(file)) !== body(readBase(file)));
    if (changed && next <= previous) errors.push(key + " changed content without advancing its version");
    if (!changed && next !== previous) errors.push(key + " advanced without changing its content");
  }
  return errors;
}
