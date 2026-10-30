import { createHash } from "node:crypto";

/** A research library as Git would hold it, for the reader's `git` seam: one repository at one immutable revision. */
export const RESEARCH_REVISION = "0123456789abcdef0123456789abcdef01234567";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

/** Publishes one package into `files` (the repository's tree); `tamper` changes a file after the index was hashed. */
export function publishLibrary(files: Map<string, string>, options: { enabled?: boolean; tamper?: boolean } = {}) {
  const research = JSON.stringify({ source_records: [{ id: "source-1", title: "Evidence", url: "https://example.com/one", summary: "A bounded observation", read_scope: "page", read_scope_detail: "whole page", boundary: "one page" }],
    findings: [{ id: "finding-1", claim: "One verifiable finding", support: "Observed once", boundary: "Only that page", source_ids: ["source-1"] }], unknowns: [] });
  const report = "# Report\nOne verifiable finding", path = "packages/observations/daily-v1";
  const manifest = JSON.stringify({ id: "daily-v1", source_id: "observations", usage: "reference", limitations: [], files: [{ path: "research.json", sha256: sha(research) }, { path: "report.md", sha256: sha(report) }] });
  files.clear();
  files.set("sources.json", JSON.stringify({ sources: [{ id: "observations", name: "Observations", publication_state: options.enabled === false ? "DRAFT" : "ENABLED" }] }));
  files.set("catalog.json", JSON.stringify({ packages: [{ id: "daily-v1", source_id: "observations", path, published_at: "2026-09-22T00:00:00Z", manifest_sha256: sha(manifest) }] }));
  files.set(`${path}/manifest.json`, manifest); files.set(`${path}/research.json`, research); files.set(`${path}/report.md`, options.tamper ? report + " (edited)" : report);
  return { manifest_sha256: sha(manifest) };
}

/** The `git` the reader runs: answers `ls-tree`, `rev-parse` and `show` from `files`, and records what it was asked. */
export function libraryGit(files: Map<string, string>, calls: Array<readonly string[]> = [], onShow?: () => void) {
  return async (_directory: string, args: readonly string[]) => {
    calls.push([...args]);
    if (args[0] === "ls-tree") return [...files.keys()].join("\n") + "\n";
    if (args[0] === "rev-parse") return RESEARCH_REVISION + "\n";
    if (args[0] === "show") {
      onShow?.();
      const name = String(args[1]).slice(RESEARCH_REVISION.length + 1), text = files.get(name);
      if (text === undefined) throw new Error(`fatal: path '${name}' does not exist`);
      return text;
    }
    return "";
  };
}
