import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMolisWorkRuntimePayload } from "@molis-ai/molis-work-app-local-host";

const [sourceDirectory, resourceDirectory, nodeExecutablePath] = process.argv.slice(2);
if (!sourceDirectory || !resourceDirectory || !nodeExecutablePath) {
  throw new Error("Usage: prepare-runtime-payload.mjs <product-root> <resource-directory> <verified-node>");
}
const destination = path.resolve(resourceDirectory);
await fs.mkdir(path.dirname(destination), { recursive: true });
// Resources live inside the Desktop workspace, which is itself a payload dependency.
// Stage outside that package so fs.cp never sees a copy into its own descendant.
const temporary = await fs.mkdtemp(path.join(tmpdir(), "molis-work-resource-"));
const staged = path.join(temporary, "payload");
const previous = path.join(temporary, "previous");
let movedPrevious = false;
try {
  await createMolisWorkRuntimePayload({ sourceDirectory, destinationDirectory: staged, nodeExecutablePath });
  const node = path.join(staged, "runtime", "node");
  // Resolve from the payload, never the checkout's node_modules. No install scripts or network here.
  // Project libraries run on the bundled Node's own SQLite, and every plugin statement is refused unless it is the version the statement
  // list was reviewed against (S-46). So a payload whose Node brings another SQLite fails here, not on the user's machine. The version is
  // read from the payload's plugin runtime, the same constant the Host compares at run time. The storage package must not bring a second
  // SQLite back: only Alchemist keeps its own driver (specs/sqlite-driver-switch §6, §7).
  execFileSync(node, ["--input-type=module", "-e", `
    const { readFileSync } = await import('node:fs');
    const { openSqliteConnection } = await import('@molis-ai/molis-work-storage');
    const { PLUGIN_STATEMENT_SQLITE_VERSION } = await import('@molis-ai/molis-work-plugin-runtime');
    const db = openSqliteConnection(':memory:'); db.exec('SELECT 1');
    const running = db.prepare('SELECT sqlite_version() AS version').get().version;
    db.close();
    if (running !== PLUGIN_STATEMENT_SQLITE_VERSION || process.versions.sqlite !== PLUGIN_STATEMENT_SQLITE_VERSION) {
      throw new Error('Bundled Node ' + process.version + ' has SQLite ' + running + '; plugin statements are reviewed against ' + PLUGIN_STATEMENT_SQLITE_VERSION + '. Use the Node in .nvmrc.');
    }
    const storage = JSON.parse(readFileSync('node_modules/@molis-ai/molis-work-storage/package.json', 'utf8'));
    const drivers = Object.keys({ ...storage.dependencies, ...storage.optionalDependencies }).filter(name => /sqlite/.test(name));
    if (drivers.length > 0) throw new Error('The storage package brings its own SQLite driver: ' + drivers.join(', '));
    await import('node-pty'); await import('ws');
    await import('@molis-ai/molis-work-app-local-host');
  `], { cwd: staged, stdio: "pipe" });
  execFileSync(node, [path.join(staged, "dist", "cli", "main.js"), "--help"], { cwd: staged, stdio: "pipe" });
  try { await fs.rename(destination, previous); movedPrevious = true; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  try { await fs.rename(staged, destination); }
  catch (error) {
    if (movedPrevious) { await fs.rename(previous, destination); movedPrevious = false; }
    throw error;
  }
} finally {
  // If restoration itself failed, preserve the previous payload and report its location.
  if (movedPrevious) {
    try { await fs.access(destination); }
    catch { throw new Error(`Payload replacement failed; previous resources retained at ${previous}`); }
  }
  await fs.rm(temporary, { recursive: true, force: true });
}
