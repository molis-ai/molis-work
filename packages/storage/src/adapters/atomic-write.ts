import fs from "node:fs";
import path from "node:path";

/** Flush a finished file, or a directory whose entries just changed. */
export function syncPath(target: string): void {
  const descriptor = fs.openSync(target, "r");
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

/**
 * `durable`: survives a power loss as well as a crash, for records a later run depends on. The temporary file is created exclusively and synced
 * through its own descriptor; a missing parent is created and its own parent synced first. An error after the rename leaves the new target for its
 * owner to reconcile.
 */
export function atomicWriteFileSync(
  targetPath: string,
  data: string | Buffer,
  options: { mode?: number; durable?: boolean } = {},
): void {
  const mode = options.mode ?? 0o600;
  const directory = path.dirname(targetPath);
  if (!options.durable) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  else if (!fs.existsSync(directory)) { fs.mkdirSync(directory, { recursive: true, mode: 0o700 }); syncPath(path.dirname(directory)); }
  const temporaryPath = path.join(
    directory,
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  let created = false;
  try {
    if (options.durable) {
      const file = fs.openSync(temporaryPath, "wx", mode); created = true;
      try { fs.writeFileSync(file, data); fs.fchmodSync(file, mode); fs.fsyncSync(file); }
      finally { fs.closeSync(file); }
    } else fs.writeFileSync(temporaryPath, data, { mode });
    fs.renameSync(temporaryPath, targetPath);
    if (options.durable) syncPath(directory);
    else fs.chmodSync(targetPath, mode);
  } catch (error) {
    try {
      if (!options.durable || created) fs.unlinkSync(temporaryPath);
    } catch {
      // After rename, the new target may already exist. Never roll it back on an
      // unconfirmed directory sync; its owner must reconcile before more effects.
    }
    throw error;
  }
}
