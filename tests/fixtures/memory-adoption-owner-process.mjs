import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { memoryRuntimePolicy } from "@molis-ai/molis-work-app-local-host";
import { openPrologueMemoryAdoption } from "@molis-ai/molis-work-service-agent-host";
import { homeSqlitePath, MEMORY_LEDGER_STORE } from "@molis-ai/molis-work-storage";

// A separate real process: ownership and ledger are observed while this handle is live.
globalThis.fetch = async () => { assert.fail("offline maintenance must not use the network"); };
const homeDirectory = process.argv[2];
let bridge;
try {
  bridge = await openPrologueMemoryAdoption({ storageRoot: join(homeDirectory, "agent-runtime"), appVersion: "1.0.0",
    scopes: [{ scope: "user", owner: LOCAL_PERSON_ACTOR_ID }], policy: memoryRuntimePolicy(() => undefined).policy });
  const db = new DatabaseSync(homeSqlitePath(homeDirectory, MEMORY_LEDGER_STORE));
  try {
    const version = Number(db.prepare("PRAGMA user_version").get().user_version);
    const marker = JSON.parse(String(db.prepare("SELECT body FROM memory_markers WHERE key='strategy-adoption'").get().body));
    process.stdout.write(JSON.stringify({ outcome: "owned", version, origin: marker.origin }));
  } finally { db.close(); }
} catch (error) {
  if (error?.code !== "agent.storage_busy") throw error;
  process.stdout.write(JSON.stringify({ outcome: "busy" }));
} finally { await bridge?.close(); }
