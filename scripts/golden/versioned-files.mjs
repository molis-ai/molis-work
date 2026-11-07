// The versioned files of a restored golden Home, each read through its owner's own entry (specs/upgrade-continuity/golden-replay-design.md §4 step 3).
// A library says what is wrong when it is opened; a file says it only to whoever reads it, and a reader may fall back to defaults and say nothing. So
// each reader here has to give back something the generation wrote. A versioned file with no reader in this table fails: adding one means one line here.
import { readFileSync } from "node:fs";
import path from "node:path";
import { goldenFailure } from "./failure.mjs";

const GET = { method: "GET" };

/** Home-relative path: how to read it through its owner, and what the generation left in it. The Prologue runtime's own records are read by `memory.list`. */
const READERS = new Map([
  ["browser/sites.json", [({ http }) => http("/api/browser/sites", GET), "golden.invalid"]],
  ["config/mcp-tools.json", [({ http, projectId }) => http(`/api/settings/mcp/actions?client_id=agent%3Aprologue&project_id=${encodeURIComponent(projectId)}`, GET), "goals.create"]],
  ["config/onboarding.json", [({ http }) => http("/api/onboarding/status", GET), "dismissed"]],
  ["config/project-arrival.json", [({ http }) => http("/", GET), "2026-01-15"]],
  ["feed/secrets.json", [({ http }) => http("/api/settings/models", GET), "present"]],
  ["jelly/preferences.json", [({ call }) => call("jelly.model.settings"), "golden-model-seed"]],
  ["shelf/catalog.json", [({ call }) => call("shelf.snapshot"), "金样"]],
]);
const RUNTIME_RECORDS = "agent-runtime/";

function isVersioned(file) {
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    return Number.isInteger(value?.version) || Number.isInteger(value?.schema_version);
  } catch { return false; }
}

/** Over the root Home, the only one a golden opens with a web surface. Returns how many it read. */
export async function assertVersionedFilesRead(manifest, directory, actions) {
  const versioned = manifest.files.filter(entry => !entry.path.startsWith("spaces/") && !entry.path.startsWith(RUNTIME_RECORDS) && isVersioned(path.join(directory, entry.payload)));
  for (const { path: file } of versioned) {
    const reader = READERS.get(file);
    if (!reader) throw goldenFailure("golden.versioned_file_unread", file);
    const [read, written] = reader;
    if (!JSON.stringify(await read(actions)).includes(written)) throw goldenFailure("golden.versioned_file_lost", file);
  }
  return versioned.length;
}
