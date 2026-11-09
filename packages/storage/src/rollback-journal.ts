import {
  closeSync, constants, copyFileSync, ftruncateSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, realpathSync, rmSync, writeFileSync, writeSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { syncPath } from "./adapters/atomic-write.js";
import { assertStorageOwner } from "./adapters/storage-owner.js";
import { openSqliteConnection, type SqliteDatabase } from "./sqlite-connection.js";
import {
  assertRollbackFile, checkedRollbackFile, relocatedRollbackFooter, removeUnflushedRollbackJournal, rollbackDatabaseVersion,
  rollbackFooter, rollbackMarkerBytes, rollbackRefused, type RollbackFile, type RollbackFooter,
} from "./sqlite-rollback-files.js";
import type { UpgradeHomeLock } from "./upgrade-snapshot.js";

/** A preselected owner database, never a path or a validator read from a journal. */
export interface RollbackLibrary {
  readonly path: string;
  readonly kind: "project" | "home";
  readonly version: number;
  inspect(database: SqliteDatabase, peer?: RollbackLibrary): void;
}

type Child = RollbackFile & { readonly library: RollbackLibrary; readonly footer?: RollbackFooter };
type Marker = RollbackFile & { readonly project: RollbackLibrary; readonly data: Buffer };
type Group = { readonly libraries: readonly RollbackLibrary[]; readonly children: readonly Child[]; readonly marker?: Marker };
const stagePrefix = ".artifact-rollback-";
const markerSuffix = /-mj[0-9A-F]{6}9[0-9A-F]{2}$/u;

function inside(root: string, file: string): boolean {
  const name = relative(root, file);
  return name.length > 0 && !isAbsolute(name) && !name.split(sep).includes("..") && join(root, name) === file;
}

function markerProject(path: string, projects: ReadonlyMap<string, RollbackLibrary>): RollbackLibrary {
  const suffix = markerSuffix.exec(path), project = suffix && projects.get(path.slice(0, suffix.index));
  if (!project) throw rollbackRefused();
  return project;
}

function pathsInMarker(project: string, library: string): Buffer {
  return Buffer.from(`${project}-journal\0${library}-journal\0`);
}

function clearedMarkerGroups(children: readonly Child[], projects: ReadonlyMap<string, RollbackLibrary>): Group[] {
  const groups: Group[] = [], cleared = new Map<string, Child[]>();
  for (const child of children) {
    if (!child.footer) { groups.push({ libraries: [child.library], children: [child] }); continue; }
    const path = child.footer.path;
    if (realpathSync(dirname(path)) !== dirname(path) || lstatSync(path, { throwIfNoEntry: false })) throw rollbackRefused();
    const referring = cleared.get(path) ?? [];
    referring.push(child);
    cleared.set(path, referring);
  }
  for (const [path, referring] of cleared) {
    const project = markerProject(path, projects), homes = referring.filter(child => child.library.kind === "home");
    if (homes.length > 1) throw rollbackRefused();
    groups.push({ libraries: [project, ...homes.map(child => child.library)], children: referring });
  }
  return groups;
}

function recoveryGroups(libraries: readonly RollbackLibrary[], sidecars: readonly string[]): readonly Group[] {
  const byPath = new Map(libraries.map(library => [library.path, library]));
  const projects = new Map(libraries.filter(library => library.kind === "project").map(library => [library.path, library]));
  const homes = libraries.filter(library => library.kind === "home");
  const children: Child[] = [], markers: Marker[] = [];
  for (const path of sidecars) {
    const file = checkedRollbackFile(path);
    if (path.endsWith("-journal")) {
      const library = byPath.get(path.slice(0, -"-journal".length));
      if (!library) throw rollbackRefused();
      const footer = rollbackFooter(file);
      if (footer) {
        const project = markerProject(footer.path, projects);
        if (library.kind === "project" && project !== library) throw rollbackRefused();
      }
      children.push({ ...file, library, footer });
    } else {
      markers.push({ ...file, project: markerProject(path, projects), data: rollbackMarkerBytes(file) });
    }
  }
  const groups: Group[] = [], orphaned: Group[] = [], used = new Set<Child>();
  let activeMarkers = 0;
  for (const marker of markers) {
    const referring = children.filter(child => child.footer?.path === marker.path);
    if (referring.length === 0) {
      // SQLite can die while writing the list, before either child refers to it. Only a prefix of a known pair is inert.
      if (!homes.some(home => pathsInMarker(marker.project.path, home.path).subarray(0, marker.data.length).equals(marker.data))) throw rollbackRefused();
      const inspect = children.some(child => child.library === marker.project) ? [] : [marker.project];
      orphaned.push({ libraries: inspect, children: [], marker });
      continue;
    }
    const home = homes.find(item => pathsInMarker(marker.project.path, item.path).equals(marker.data));
    if (!home || ++activeMarkers > 1) throw rollbackRefused();
    const pair = [marker.project, home], pairChildren = children.filter(child => pair.includes(child.library));
    if (referring.some(child => !pairChildren.includes(child)) || pairChildren.some(child => used.has(child) || child.footer && child.footer.path !== marker.path)) throw rollbackRefused();
    for (const child of pairChildren) used.add(child);
    groups.push({ libraries: pair, children: pairChildren, marker });
  }
  groups.push(...clearedMarkerGroups(children.filter(child => !used.has(child)), projects));
  const paths = groups.flatMap(group => group.libraries.map(library => library.path));
  if (new Set(paths).size !== paths.length) throw rollbackRefused();
  return [...groups, ...orphaned];
}

function stages(root: string): string {
  const directory = join(root, "upgrade");
  const found = lstatSync(directory, { throwIfNoEntry: false });
  if (found) {
    if (!found.isDirectory() || realpathSync(directory) !== directory) throw rollbackRefused();
    for (const name of readdirSync(directory)) {
      if (!/^\.artifact-rollback-[A-Za-z0-9]{6}$/u.test(name)) continue;
      const stale = join(directory, name);
      if (!lstatSync(stale).isDirectory() || realpathSync(stale) !== stale) throw rollbackRefused();
      rmSync(stale, { recursive: true });
    }
  }
  return directory;
}

function assertSidecars(group: Group): void {
  for (const library of group.libraries) {
    const present = (suffix: string) => !!lstatSync(library.path + suffix, { throwIfNoEntry: false });
    if (present("-wal") || present("-shm") || present("-journal") !== group.children.some(child => child.library === library)) throw rollbackRefused();
  }
  if (!group.marker && group.children.some(child => child.footer && lstatSync(child.footer.path, { throwIfNoEntry: false }))) throw rollbackRefused();
}

function originalFiles(group: Group): RollbackFile[] {
  const databases = group.libraries.map(library => {
    const file = checkedRollbackFile(library.path);
    if (rollbackDatabaseVersion(file) > library.version) throw rollbackRefused();
    return file;
  });
  assertSidecars(group);
  const files = [...databases, ...group.children, ...group.marker ? [group.marker] : []];
  if (new Set(files.map(file => `${file.stat.dev}:${file.stat.ino}`)).size !== files.length || new Set(files.map(file => file.stat.dev)).size !== 1) throw rollbackRefused();
  return files;
}

function replay(group: Group, at: (path: string) => string): void {
  for (const library of group.libraries) {
    const file = at(library.path), readonly = !group.children.some(child => child.library === library);
    const db = openSqliteConnection(file, { fileMustExist: true, readonly, timeout: 100 });
    try {
      if (!readonly) db.pragma("synchronous=EXTRA");
      if (db.pragma("user_version", { simple: true }) !== library.version) throw rollbackRefused();
      library.inspect(db, group.libraries.find(candidate => candidate !== library));
    } finally { db.close(); }
  }
  for (const child of group.children) {
    const file = at(child.library.path), journal = file + "-journal";
    if (!lstatSync(journal, { throwIfNoEntry: false })) continue;
    const db = openSqliteConnection(file, { fileMustExist: true, timeout: 100 });
    try { removeUnflushedRollbackJournal(db, file); } finally { db.close(); }
    if (lstatSync(journal, { throwIfNoEntry: false })) throw rollbackRefused();
  }
  if (group.marker && lstatSync(at(group.marker.path), { throwIfNoEntry: false })) {
    if (at(group.marker.path) === group.marker.path) assertRollbackFile(group.marker);
    rmSync(at(group.marker.path));
    syncPath(dirname(at(group.marker.path)));
  }
}

function preflight(root: string, directory: string, group: Group, sources: readonly RollbackFile[]): void {
  if (group.libraries.length === 0) return;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const scratch = mkdtempSync(join(directory, stagePrefix));
  const at = (path: string) => join(scratch, relative(root, path));
  const added = scratch.slice(root.length);
  try {
    for (const file of sources) {
      assertRollbackFile(file);
      mkdirSync(dirname(at(file.path)), { recursive: true, mode: 0o700 });
      copyFileSync(file.path, at(file.path), constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
      assertRollbackFile(file);
    }
    for (const child of group.children) {
      if (!child.footer) continue;
      const replacement = relocatedRollbackFooter(child.footer, at(child.footer.path), added);
      const fd = openSync(at(child.path), "r+");
      try {
        if (writeSync(fd, replacement, 0, replacement.length, child.footer.position) !== replacement.length) throw rollbackRefused();
        ftruncateSync(fd, child.footer.position + replacement.length);
      } finally { closeSync(fd); }
    }
    if (group.marker && group.children.length > 0) writeFileSync(at(group.marker.path), pathsInMarker(at(group.libraries[0]!.path), at(group.libraries[1]!.path)));
    replay(group, at);
  } finally { rmSync(scratch, { recursive: true }); }
}

/** Recover only after a private native replay proves the expected owner and baseline, while the same Home lease excludes all writers. */
export function recoverSqliteRollbackJournals(lock: UpgradeHomeLock, libraries: readonly RollbackLibrary[], sidecars: readonly string[]): void {
  const root = realpathSync(lock.home);
  const checkOwner = () => {
    assertStorageOwner(lock.lockDirectory, lock.owner);
    const directory = realpathSync(lock.lockDirectory);
    if (dirname(directory) !== root) throw rollbackRefused();
  };
  checkOwner();
  if (libraries.some(library => !inside(root, library.path)) || sidecars.some(path => !inside(root, path))
    || new Set(libraries.map(library => library.path)).size !== libraries.length || new Set(sidecars).size !== sidecars.length) throw rollbackRefused();
  const directory = stages(root);
  const groups = recoveryGroups(libraries, sidecars).map(group => ({ group, sources: originalFiles(group) }));
  for (const { group, sources } of groups) preflight(root, directory, group, sources);
  checkOwner();
  for (const { group, sources } of groups) {
    for (const file of sources) assertRollbackFile(file);
    assertSidecars(group);
  }
  // Leave all original journals in place until validation of the complete set succeeds. SQLite performs the original replay.
  for (const { group } of groups) replay(group, path => path);
}
