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
  execFileSync(node, ["--input-type=module", "-e", `
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(':memory:'); db.exec('SELECT 1'); db.close();
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
