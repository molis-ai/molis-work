import { inspectExistingStoragePath } from "@molis-ai/molis-work-storage";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, type ReadStream } from "node:fs";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import type { ProjectDataDeclaration, ProjectDeletionControl } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";

/**
 * The 成果库's originals that are too big to sit in a version's record (onboarding limits, user 2026-10-22): one file per content
 * digest, per project, in the 成果库's own directory of the Home. An original up to this size stays inline in the version, as
 * `original_file.data_base64`; a bigger one is kept here and the version names it by `sha256` and `size_bytes`. Both shapes are
 * current: which one a version has follows from the original's size, so no version is ever rewritten from one to the other.
 */
export const ARTIFACT_ORIGINAL_INLINE_MAX_BYTES = 6_000_000;

/** This store in the Home's store registry: `artifacts/projects/<project>/originals/<sha256>`. */
export const ARTIFACTS_HOME_STORE: NonNullable<PluginRegistration["home_store"]> = { path: "artifacts" };

/** An original kept in the store, as a version names it. */
export interface StoredArtifactOriginal { sha256: string; size_bytes: number }

const DIGEST = /^[0-9a-f]{64}$/u;

function projectDirectory(home: string, projectId: string): string {
  if (!projectId) throw new Error("project id required");
  return join(home, ARTIFACTS_HOME_STORE.path, "projects", encodeURIComponent(projectId).replaceAll(".", "%2E"));
}

/** Where a stored original is; only a well-formed digest names one (never a path a caller wrote). */
export function artifactOriginalPath(home: string, projectId: string, sha256: string): string {
  if (!DIGEST.test(sha256)) throw new Error("invalid original digest");
  return join(projectDirectory(home, projectId), "originals", sha256);
}

/**
 * Copies a file into the project's store under its digest, streaming (no size limit, no whole file in memory). The same bytes
 * imported twice are one file. The source is the Host's: a file the person gave its entry (`ActionCallContext.original_file`).
 */
export async function storeArtifactOriginal(home: string, projectId: string, sourcePath: string, signal?: AbortSignal): Promise<StoredArtifactOriginal> {
  const directory = join(projectDirectory(home, projectId), "originals");
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, `.incoming-${randomUUID()}`);
  const hash = createHash("sha256");
  let size = 0;
  try {
    await pipeline(createReadStream(sourcePath), new Transform({ transform(chunk: Buffer, _encoding, done) { hash.update(chunk); size += chunk.length; done(null, chunk); } }),
      createWriteStream(temporary, { flags: "wx" }), ...signal ? [{ signal }] : []);
    const sha256 = hash.digest("hex");
    await rename(temporary, join(directory, sha256));
    return { sha256, size_bytes: size };
  } finally { await rm(temporary, { force: true }); }
}

/**
 * A stored original to send on, as a stream (any size, never whole in memory), or null when the store no longer has it as the version
 * names it (the version then says its file is missing).
 */
export async function openArtifactOriginal(home: string, projectId: string, original: StoredArtifactOriginal): Promise<ReadStream | null> {
  const handle = await open(artifactOriginalPath(home, projectId, original.sha256), "r").catch(() => null);
  if (!handle) return null;
  if ((await handle.stat()).size !== original.size_bytes) { await handle.close(); return null; }
  return handle.createReadStream();
}

/** The project is deleted: its stored originals go. Idempotent; works on the files, so any process on the Home can run it. */
export async function purgeArtifactOriginals(home: string, projectId: string, control?: ProjectDeletionControl): Promise<void> {
  control?.assertCurrent();
  const directory = projectDirectory(home, projectId);
  if (control) inspectExistingStoragePath(directory, "directory").assertCurrent();
  await rm(directory, { recursive: true, force: true });
}

/** What this package keeps in the Home for a project and how the project's deletion clears it; the Host reads it from the catalog. */
export const artifactsProjectData: ProjectDataDeclaration = { label: "成果库保存的大文件原件", purge: purgeArtifactOriginals };
