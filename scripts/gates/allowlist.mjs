// The root allow-list (tooling/gates/root-allowlist.json), read once for every gate that needs it: root-entries.mjs counts
// what is outside it, markdown.mjs and doc-citations.mjs read exactly the root entries it names. Shared, like markdown.mjs, so
// the rule modules do not import each other (scripts/gates/README.md).
export const ROOT_ALLOWLIST = "tooling/gates/root-allowlist.json";

export const readAllowlist = (snapshot) => {
  const text = snapshot.read(ROOT_ALLOWLIST);
  if (text === null) return { allowed: null, error: `${ROOT_ALLOWLIST} is missing` };
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed.allowed !== "object" || Array.isArray(parsed.allowed)) return { allowed: null, error: `${ROOT_ALLOWLIST} needs an "allowed" object of { "<root entry>": "<reason>" }` };
    return { allowed: parsed.allowed };
  } catch { return { allowed: null, error: `${ROOT_ALLOWLIST} is not valid JSON` }; }
};

/**
 * The root entries the document gates treat as part of the repository: the names in the allow-list (`has`, and `names` for
 * building a pattern from them). This is the one place that says which top level folders are live documentation (markdown.mjs)
 * and which can start a cited path (doc-citations.mjs), so a name added to the allow-list is read by both and a stray
 * (outputs/, .zcode/) by neither. The names, not the folders that happen to be tracked: a folder deleted while its name is
 * still listed keeps its citations checked, and the stale name is reported by the allow-list rule. With no readable
 * allow-list (a merge-base from before this gate, a scratch repository) nothing is a stray: every root entry counts.
 */
export function allowedRoots(snapshot) {
  const { allowed } = readAllowlist(snapshot);
  if (allowed) return { has: (name) => Object.hasOwn(allowed, name), names: Object.keys(allowed) };
  const names = new Set();
  for (const file of snapshot.files) names.add(file.split("/")[0]);
  return { has: () => true, names: [...names] };
}
