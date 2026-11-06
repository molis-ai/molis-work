import { constants as bufferConstants } from "node:buffer";
import { lstatSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { readSnapshotFile, snapshotFileDigest, snapshotFileStat } from "@molis-ai/molis-work-storage";
import type { HomeSnapshotManifest } from "./home-snapshot-contract.js";
import { snapshotDirectoryInfo } from "./home-snapshot-inventory.js";
import { snapshotSpaceDigest } from "./home-restore-space.js";
import { invalidRestore, parseHomeSnapshotManifest } from "./home-restore-input.js";

const contains = (parent: string, child: string) => {
  const path = relative(parent, child);
  return path === "" || path !== ".." && !path.startsWith(".." + sep);
};

export function readRestoreJson(file: string, maximumBytes = bufferConstants.MAX_STRING_LENGTH): unknown {
  try {
    const contents = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readSnapshotFile(file, maximumBytes));
    return JSON.parse(contents) as unknown;
  } catch { throw invalidRestore(); }
}

export function assertRestoreDigest(file: string, expected: { readonly size: number; readonly sha256: string }): void {
  const actual = snapshotFileDigest(file);
  if (actual.size !== expected.size || actual.sha256 !== expected.sha256) throw invalidRestore();
}

export interface HomeRestoreArchive { readonly root: string; readonly manifest: HomeSnapshotManifest }

/** The manifest cannot grant access to an extra payload or a link hidden elsewhere in the archive. */
export function readHomeRestoreArchive(home: string, requested: string): HomeRestoreArchive {
  if (typeof requested !== "string" || !requested.trim()) throw invalidRestore();
  const root = resolve(requested); snapshotDirectoryInfo(root);
  if (contains(home, root) || contains(root, home)) throw invalidRestore();
  const manifest = parseHomeSnapshotManifest(readRestoreJson(join(root, "manifest.json")), home);
  if (manifest.space_digest !== snapshotSpaceDigest(home)) throw invalidRestore();
  const files = new Map<string, { readonly size: number; readonly sha256: string }>();
  const directories = new Set<string>();
  const addDirectory = (path: string) => {
    let current = path;
    while (current !== ".") { directories.add(current); current = dirname(current); }
  };
  const addFile = (path: string, digest: { readonly size: number; readonly sha256: string }) => {
    if (files.has(path) || path === "manifest.json") throw invalidRestore();
    files.set(path, digest); addDirectory(dirname(path));
  };
  for (const store of manifest.stores) {
    for (const entry of store.entries) {
      if (entry.kind === "directory") addDirectory("data/" + entry.path);
      else addFile(entry.payload_path, entry);
    }
    if (store.owner_payload) addFile(store.owner_payload.payload_path, store.owner_payload);
  }
  if ([...directories].some(path => files.has(path) || path === "manifest.json")
    || [...files.keys(), ...directories].some(path => !path.startsWith("data/") && !path.startsWith("sealed/") && path !== "data" && path !== "sealed")) throw invalidRestore();
  const seen = new Set<string>(), seenDirectories = new Set<string>();
  const visit = (path: string) => {
    const absolute = join(root, path), info = lstatSync(absolute);
    if (info.isDirectory()) {
      snapshotDirectoryInfo(absolute);
      if (path && !directories.has(path)) throw invalidRestore();
      if (path) seenDirectories.add(path);
      for (const name of readdirSync(absolute)) visit(path ? path + "/" + name : name);
      return;
    }
    snapshotFileStat(absolute);
    if (path === "manifest.json") return;
    const expected = files.get(path);
    if (!expected) throw invalidRestore();
    assertRestoreDigest(absolute, expected); seen.add(path);
  };
  visit("");
  if (seen.size !== files.size || seenDirectories.size !== directories.size) throw invalidRestore();
  return { root, manifest };
}
