import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHomeSnapshot, createMolisWorkLocalHost, runV1Cli } from "@molis-ai/molis-work-app-local-host";
import { acquireStorageOwner, openMemoryLedger } from "@molis-ai/molis-work-storage";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";

/** The parent releases this exact production boundary by writing one byte, never by a timer. */
function barrier(phase: string, gate: string): void {
  process.send?.({ phase });
  const descriptor = fs.openSync(gate, "r");
  try {
    if (fs.readSync(descriptor, Buffer.alloc(1), 0, 1, null) !== 1) throw new Error("entry barrier lost its parent");
  } finally { fs.closeSync(descriptor); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, home, target, gate] = process.argv.slice(2);
  if (!home || !target || !gate) throw new Error("entry fixture requires Home, target and gate");
  if (mode === "snapshot") {
    const original = fs.writeSync;
    let paused = false;
    fs.writeSync = function (...args: unknown[]): number {
      if (!paused) { paused = true; barrier("snapshot-payload", gate); }
      return Reflect.apply(original, fs, args);
    };
    syncBuiltinESMExports();
    try { await createHomeSnapshot({ homeDirectory: home, destination: target }); }
    finally { fs.writeSync = original; syncBuiltinESMExports(); process.disconnect(); }
  } else if (mode === "cli") {
    const host = createMolisWorkLocalHost({ homeDirectory: home, onRuntimeOpen: () => barrier("cli-runtime", gate) });
    try {
      await runV1Cli(["init", "--db", target, "--json", JSON.stringify({ project_id: "entry-window", idempotency_key: "entry-window" })],
        { homeDirectory: home, localHost: host });
    } finally { await host.close(); process.disconnect(); }
  } else if (mode === "ledger") {
    const owner = acquireStorageOwner(join(home, "agent-runtime")), ledger = openMemoryLedger({ homeDirectory: home });
    try {
      ledger.transaction(() => ledger.setMarker(LOCAL_PERSON_ACTOR_ID, "purge-preview-business-change", { value: "committed after preview" }, new Date().toISOString()));
      barrier("ledger-commit", gate);
    } finally { ledger.close(); owner.release(); process.disconnect(); }
  } else throw new Error("unknown entry window");
}
