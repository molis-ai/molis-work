import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { snapshotDirectoryInfo } from "./home-snapshot-inventory.js";
import { homeSnapshotErrors } from "./home-store-snapshot.js";

export function syncSnapshotDirectory(directory: string): void {
  const descriptor = openSync(directory, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function writeSnapshotJson(file: string, contents: unknown): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(contents) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  const descriptor = openSync(file, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function outside(home: string, destination: string): boolean {
  const child = relative(home, destination),
    parent = relative(destination, home);
  return child !== "" &&
    (child === ".." || child.startsWith(".." + sep)) &&
    parent !== "" &&
    (parent === ".." || parent.startsWith(".." + sep));
}

/** Metadata-only preparation. A busy Home must fail before create() is reached. */
export function snapshotDestination(home: string, requested: string) {
  if (typeof requested !== "string" || !requested.trim())
    throw homeSnapshotErrors.invalid("快照必须给出非空 --to 目录");
  const supplied = resolve(requested),
    parent = realpathSync(dirname(supplied)),
    path = join(parent, basename(supplied));
  const parentInfo = snapshotDirectoryInfo(parent);
  if (!outside(home, path))
    throw homeSnapshotErrors.invalid("快照目标必须在原 Home 之外，且不能包含 Home");
  if (lstatSync(path, { throwIfNoEntry: false }))
    throw homeSnapshotErrors.destination_exists("快照目标已存在，未覆盖任何内容");
  const assertParent = () => {
    const now = snapshotDirectoryInfo(parent);
    if (now.dev !== parentInfo.dev || now.ino !== parentInfo.ino)
      throw homeSnapshotErrors.changed("快照目标父目录已改变，未发布结果");
  };
  return {
    create() {
      assertParent();
      const stage = mkdtempSync(join(parent, ".molis-home-snapshot-"));
      let published = false,
        reservation: ReturnType<typeof lstatSync> | undefined;
      return {
        stage,
        destination: path,
        publish() {
          assertParent();
          // Exclusive mkdir reserves a new name, so concurrent captures cannot overwrite an existing empty directory.
          try {
            mkdirSync(path, { mode: 0o700 });
          } catch (error) {
            if (error instanceof Error && "code" in error && error.code === "EEXIST")
              throw homeSnapshotErrors.destination_exists("快照目标已被建立，未覆盖任何内容");
            throw error;
          }
          reservation = lstatSync(path);
          assertParent();
          renameSync(stage, path);
          published = true;
          reservation = undefined;
          try {
            syncSnapshotDirectory(parent);
          } catch {
            throw homeSnapshotErrors.published_unconfirmed(
              `快照目录已发布，持久化未确认。请保留并核验 ${path}，不要当作零产物重试覆盖`,
            );
          }
          return path;
        },
        cleanup() {
          if (!published) rmSync(stage, { recursive: true, force: true });
          if (reservation) {
            const current = lstatSync(path, { throwIfNoEntry: false });
            if (
              current?.isDirectory() &&
              current.ino === reservation.ino &&
              current.dev === reservation.dev &&
              readdirSync(path).length === 0
            )
              rmdirSync(path);
          }
        },
      };
    },
  };
}
