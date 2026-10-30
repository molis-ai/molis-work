// One-time JSON maintenance: preserve the original outside the Home, stage there, then publish by one same-filesystem rename.
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
const inside = (file, root) => file === root || file.startsWith(root + path.sep);
const sync = file => { const fd = fs.openSync(file, "r"); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } };
export function publishMaintenanceJson(file, backup, next) {
  if (!backup || fs.existsSync(backup)) throw new Error("a new external backup file is required");
  const home = fs.realpathSync(path.dirname(path.dirname(file))), parent = fs.realpathSync(path.dirname(backup));
  if (inside(parent, home) || fs.statSync(parent).dev !== fs.statSync(path.dirname(file)).dev || (fs.statSync(parent).mode & 0o077) !== 0) {
    throw new Error("backup must be private, outside the Home and on the same filesystem");
  }
  const bytes = fs.readFileSync(file), temporary = `${backup}.next-${randomUUID()}`;
  try {
    fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL); fs.chmodSync(backup, 0o600);
    if (!fs.readFileSync(backup).equals(bytes)) throw new Error("backup comparison failed; source unchanged");
    sync(backup); sync(parent);
    const fd = fs.openSync(temporary, "wx", fs.statSync(file).mode & 0o777);
    try { fs.writeFileSync(fd, JSON.stringify(next, null, 2) + "\n"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (!fs.readFileSync(file).equals(bytes)) throw new Error("source changed since preflight; stop and take a fresh backup");
    fs.renameSync(temporary, file);
    sync(path.dirname(file));
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
