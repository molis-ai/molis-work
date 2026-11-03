import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { readResearchLibrary } from "@molis-ai/molis-work-integration-github";
import type { RepositoryReadRequest, RepositoryReadResult } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";

const execGit = promisify(execFile);
const repositoryReads = new Map<string, Promise<ResearchRepositorySnapshot>>();
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

export interface ResearchRepositorySnapshot { revision: string; files: Map<string, string> }
/** `git` as the snapshot runs it: the arguments after `-C <directory>`. Tests pass their own. */
export type ResearchGit = (directory: string, args: readonly string[]) => Promise<string>;

const runGit: ResearchGit = async (directory, args) => (await execGit("git", ["-C", directory, ...args], {
  timeout: 120_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
})).stdout;

/** The only files a research library snapshot reads: the two indexes and the three files of a package. */
const PUBLISHED_FILE = /^packages\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/(manifest.json|research.json|report.md)$/;

/**
 * The Host-owned Git cache of a research library at its `main`; never fetches into a user's checkout or reads uncommitted files. The cache
 * directory is named by a hash of the repository, and the only text of the caller's in any Git argument is the repository inside a fixed
 * `https://github.com/<repository>.git` address (the repository is checked before it gets here).
 */
export async function researchRepositorySnapshot(home: string, repository: string, options: { git?: ResearchGit } = {}): Promise<ResearchRepositorySnapshot> {
  const directory = path.join(home, "cache", "research-library", hash(repository));
  const prior = repositoryReads.get(directory);
  if (prior) return prior;
  const git = options.git ?? runGit;
  const read = (async () => {
    await mkdir(directory, { recursive: true });
    try { await access(path.join(directory, "HEAD")); } catch { await git(directory, ["init", "--bare"]); }
    await git(directory, ["fetch", "--depth=1", `https://github.com/${repository}.git`, "main"]);
    const revision = (await git(directory, ["rev-parse", "FETCH_HEAD"])).trim();
    const files = new Map<string, string>();
    // A tree list bounds every subsequent read. Git blobs are pinned to revision.
    const names = (await git(directory, ["ls-tree", "-r", "--name-only", revision])).trim().split("\n");
    for (const name of names.filter((name) => name === "sources.json" || name === "catalog.json" || PUBLISHED_FILE.test(name))) {
      files.set(name, await git(directory, ["show", `${revision}:${name}`]));
    }
    return { revision, files };
  })();
  repositoryReads.set(directory, read);
  try { return await read; } finally { repositoryReads.delete(directory); }
}

/**
 * `services.sourcePull.repository.read`'s Host side: the entries of one source of a research library, at the revision the snapshot pinned.
 * Reads of one repository share a snapshot, so a call's cancellation is checked around it rather than handed to the shared `git` run.
 */
export async function readResearchRepository(home: string, request: RepositoryReadRequest,
  options: { signal?: AbortSignal; git?: ResearchGit; snapshot?: typeof researchRepositorySnapshot } = {}): Promise<RepositoryReadResult> {
  options.signal?.throwIfAborted();
  const snapshot = await (options.snapshot ?? researchRepositorySnapshot)(home, request.repository, options.git ? { git: options.git } : {});
  options.signal?.throwIfAborted();
  const entries = await readResearchLibrary({ repository: request.repository, source_id: request.source_id, revision: snapshot.revision,
    async readText(name) { const text = snapshot.files.get(name); if (text === undefined) throw new Error(`发布包缺少 ${name}`); return text; },
  });
  return { repository: request.repository, revision: snapshot.revision, entries };
}
