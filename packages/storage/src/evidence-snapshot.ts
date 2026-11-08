import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { createEvidenceContentStore } from "./adapters/evidence-content.js";
import { readSealedSecretSnapshotEntry } from "./adapters/file-secret-store.js";
import { snapshotFileStat } from "./snapshot-files.js";

const errors = defineErrorCodes("storage.evidence_snapshot", { invalid: "invalid" });
const invalid = () => errors.invalid("归档证据正文、路径、密文或同 Home 原密钥不可用");

function directory(path: string): boolean {
  const info = lstatSync(path, { throwIfNoEntry: false });
  if (!info) return false;
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(path) !== path) throw invalid();
  return true;
}

function evidenceReferences(root: string): string[] {
  if (!directory(root)) return [];
  if (readdirSync(root).some(name => name !== "blobs")) throw invalid();
  const blobs = join(root, "blobs"), refs: string[] = [];
  if (!directory(blobs)) return refs;
  for (const shard of readdirSync(blobs)) {
    if (!/^[0-9a-f]{2}$/u.test(shard) || !directory(join(blobs, shard))) throw invalid();
    for (const name of readdirSync(join(blobs, shard))) {
      if (!/^[0-9a-f]{64}\.blob$/u.test(name) || !name.startsWith(shard)) throw invalid();
      snapshotFileStat(join(blobs, shard, name));
      refs.push("molis-work-feed/sha256/" + name.slice(0, -5));
    }
  }
  return refs;
}

/** Authenticate the current evidence directory with its original AEAD/hash; no body, key or writable store escapes. */
export function inspectEvidenceContentSnapshot(home: string, archiveFeedDirectory: string, archivedVault: string | undefined): { readonly contents: number } {
  if (!isAbsolute(home) || !isAbsolute(archiveFeedDirectory) || !directory(archiveFeedDirectory)) throw invalid();
  const root = join(archiveFeedDirectory, "evidence");
  const refs = evidenceReferences(root);
  if (!refs.length) return { contents: 0 };
  if (archivedVault === undefined) throw invalid();
  const keys = new Map<string, string | null>();
  const reader = createEvidenceContentStore({ rootDirectory: root, secretStore: {
    get(authRef) {
      if (!keys.has(authRef)) keys.set(authRef, readSealedSecretSnapshotEntry(home, archivedVault, authRef));
      return keys.get(authRef) ?? null;
    },
    put() { throw invalid(); }, delete() { throw invalid(); },
    createIfAbsent() { throw invalid(); }, deleteIfPresent() { throw invalid(); }, backend() { throw invalid(); },
  } });
  try { for (const ref of refs) reader.read(ref); }
  catch { throw invalid(); }
  finally { keys.clear(); }
  return { contents: refs.length };
}
