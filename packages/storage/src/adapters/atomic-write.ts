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

/** `durable`: survives a power loss as well as a crash, for records a later run depends on. */
export function atomicWriteFileSync(
  targetPath: string,
  data: string | Buffer,
  options: { mode?: number; durable?: boolean } = {},
): void {
  const mode = options.mode ?? 0o600;
  const directory = path.dirname(targetPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    fs.writeFileSync(temporaryPath, data, { mode });
    if (options.durable) syncPath(temporaryPath);
    fs.renameSync(temporaryPath, targetPath);
    fs.chmodSync(targetPath, mode);
    if (options.durable) syncPath(directory);
  } catch (error) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // Best effort only; the target was never replaced.
    }
    throw error;
  }
}
