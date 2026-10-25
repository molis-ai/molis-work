import { inspectExistingStoragePath } from "../storage-maintenance-path.js";
import fs from "node:fs";
import path from "node:path";

export function atomicWriteFileSync(
  targetPath: string,
  data: string | Buffer,
  options: { mode?: number; assertCurrent?: () => void } = {},
): void {
  const mode = options.mode ?? 0o600;
  const directory = path.dirname(targetPath);
  options.assertCurrent?.();
  const target = options.assertCurrent ? inspectExistingStoragePath(directory, "directory") : undefined;
  if (!options.assertCurrent) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  let created = false;
  try {
    options.assertCurrent?.(); target?.assertCurrent();
    if (options.assertCurrent) {
      const descriptor = fs.openSync(temporaryPath, "wx", mode);
      created = true;
      try { fs.writeFileSync(descriptor, data); } finally { fs.closeSync(descriptor); }
    } else { fs.writeFileSync(temporaryPath, data, { mode }); created = true; }
    options.assertCurrent?.(); target?.assertCurrent();
    fs.renameSync(temporaryPath, targetPath);
    if (!options.assertCurrent) fs.chmodSync(targetPath, mode);
  } catch (error) {
    try {
      target?.assertCurrent();
      if (created || !options.assertCurrent) fs.unlinkSync(temporaryPath);
    } catch {
      // Best effort only; the target was never replaced.
    }
    throw error;
  }
}
