// W2-05 maintenance, after the stamp: open the two kinds of store of a Home with this checkout's built code, the way the product
// does at start (`pnpm build` first). Part of the maintenance runner's set (store-maintenance-run.sh): the rehearsal's scratch Home
// (KEEP=1) or a copy of a stamped Home is what to point it at. It opens the stores for real, so it creates -wal and -shm files and
// refuses the real Home (~/.molis-work).
//
//   node tests/fixtures/store-maintenance-verify-open.mjs <home copy>
//
// Prints one line per store and exits 1 if any was refused or is not at version 1.
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createAlchemistSearchPort, openExperimentsPrivateStore } from "@molis-ai/molis-work-app-local-host";

const argument = process.argv[2];
if (!argument) { process.stderr.write("usage: node store-maintenance-verify-open.mjs <home copy>\n"); process.exit(2); }
const home = realpathSync(resolve(argument));
const realHome = (() => { try { return realpathSync(join(homedir(), ".molis-work")); } catch { return undefined; } })();
if (home === realHome) { process.stderr.write(`${home} is the real Home: run this on a copy\n`); process.exit(2); }

let failed = false;
const report = (label, outcome) => { process.stdout.write(`${label} -> ${outcome}\n`); };
async function attempt(label, open) {
  try { report(label, JSON.stringify(await open())); } catch (error) { failed = true; report(label, `REFUSED ${error.code ?? error.name}: ${String(error.message).slice(0, 160)}`); }
}
const expectVersionOne = version => { if (version !== 1) { failed = true; } return version; };

if (existsSync(join(home, "plugins", "experiments", "private.sqlite"))) {
  await attempt("experiments private.sqlite", () => {
    const store = openExperimentsPrivateStore(home);
    try {
      const rows = store.db.prepare("SELECT install_id, item_key, length(item_value) AS length FROM plugin_private_values ORDER BY install_id, item_key").all();
      return { user_version: expectVersionOne(store.db.pragma("user_version", { simple: true })), rows };
    } finally { store.close(); }
  });
}
const projectsDirectory = join(home, "alchemist", "projects");
for (const entry of existsSync(projectsDirectory) ? readdirSync(projectsDirectory).sort() : []) {
  if (!existsSync(join(projectsDirectory, entry, "search.sqlite"))) continue;
  const projectId = decodeURIComponent(entry);   // Alchemist writes the project id as encodeURIComponent with "." as %2E
  if (encodeURIComponent(projectId).replaceAll(".", "%2E") !== entry) { report(`alchemist search ${entry}`, "skipped: not a directory name the product writes (opening it would create another)"); continue; }
  const secretStore = { get: () => null, put() {}, delete() {}, createIfAbsent: () => true, deleteIfPresent: () => false,
    backend: () => ({ kind: "aes-gcm-file", label: "maintenance verification", masterKeyExternal: false, formatVersion: 2 }) };
  await attempt(`alchemist search ${projectId}`, async () => {
    const port = createAlchemistSearchPort({ homeDirectory: home, projectId, secretStore });
    await port.shutdown();
    return "opened";
  });
}
process.exit(failed ? 1 : 0);
