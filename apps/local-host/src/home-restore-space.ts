import { linkSync, lstatSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { syncSnapshotPath } from "./home-snapshot-publication.js";
import { createHash } from "node:crypto";
import { ensureStorageSpace, readStorageSpace, snapshotFileStat, type StorageSpace } from "@molis-ai/molis-work-storage";
import { invalidRestore } from "./home-restore-input.js";
import type { HomeRestoreJournal } from "./home-restore-journal-input.js";

export function snapshotSpaceDigest(home: string): string | null {
  const space = readStorageSpace(home);
  if (space) snapshotFileStat(home + "/storage-space.json");
  return space && createHash("sha256").update(JSON.stringify(space)).digest("hex");
}

/** Only a newly generated local identity can be published after an empty Home restore commits. */
export function generatedLocalSpace(id: string): StorageSpace {
  if (!/^space_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(id)) throw invalidRestore();
  return { spaceId: id, kind: "local", ownerUserId: null, teamId: null, issuer: null, applicationId: null };
}

export function journalStorageSpace(journal: HomeRestoreJournal): StorageSpace | undefined {
  const current = readStorageSpace(journal.home_directory);
  if (journal.initialize_local_space) {
    if (journal.space_digest !== null || !journal.files.some(file => file.path === "memory/memory.db" && file.sqlite)
      || journal.preserved.some(node => node.path === "storage-space.json")) throw invalidRestore();
    const next = generatedLocalSpace(journal.initialize_local_space);
    if (current && (journal.phase !== "committed" || current.spaceId !== next.spaceId || current.kind !== "local")) throw invalidRestore();
    return next;
  }
  if (snapshotSpaceDigest(journal.home_directory) !== journal.space_digest) throw invalidRestore();
  return current ?? undefined;
}

/** Crash reentry may find the two names of our very same staged inode. Remove only the private staging name. */
export function retireRestoreSpaceLink(journal: HomeRestoreJournal): void {
  if (!journal.initialize_local_space || journal.phase !== "committed") return;
  const target = join(journal.home_directory, "storage-space.json"), stage = join(journal.originals_directory, "new-local-scope");
  const file = join(stage, "storage-space.json"), current = lstatSync(target, { throwIfNoEntry: false });
  if (!current || current.nlink === 1) return;
  const dir = lstatSync(stage), prepared = lstatSync(file);
  if (!dir.isDirectory() || dir.isSymbolicLink() || !current.isFile() || current.nlink !== 2 || prepared.dev !== current.dev || prepared.ino !== current.ino) throw invalidRestore();
  journalStorageSpace(journal);
  unlinkSync(file); syncSnapshotPath(stage);
}

export function completeRestoreSpace(journal: HomeRestoreJournal): void {
  if (!journal.initialize_local_space) return;
  const committed = { ...journal, phase: "committed" } as const;
  const space = journalStorageSpace(committed);
  if (!space) throw invalidRestore();
  const target = join(journal.home_directory, "storage-space.json");
  if (!lstatSync(target, { throwIfNoEntry: false })) {
    const stage = join(journal.originals_directory, "new-local-scope");
    mkdirSync(stage, { recursive: true, mode: 0o700 });
    const info = lstatSync(stage);
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o700) throw invalidRestore();
    ensureStorageSpace(stage, space);
    const prepared = join(stage, "storage-space.json");
    snapshotFileStat(prepared); syncSnapshotPath(prepared); syncSnapshotPath(stage);
    linkSync(prepared, target);
  }
  retireRestoreSpaceLink(committed); journalStorageSpace(committed);
  syncSnapshotPath(target); syncSnapshotPath(journal.home_directory);
}
