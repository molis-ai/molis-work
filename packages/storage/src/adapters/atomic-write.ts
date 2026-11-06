import fs from "node:fs";
import path from "node:path";

export function atomicWriteFileSync(
  targetPath: string,
  data: string | Buffer,
  options: { mode?: number; /** Syncs the file and its already-existing parent; errors after rename require owner reconciliation. */ durable?: boolean } = {},
): void {
  const mode = options.mode ?? 0o600;
  const directory = path.dirname(targetPath);
  if (!options.durable) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
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
    if (options.durable) {
      const parent = fs.openSync(directory, "r");
      try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
    } else fs.chmodSync(targetPath, mode);
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
