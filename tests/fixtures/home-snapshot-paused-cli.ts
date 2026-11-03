import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
import { runLocalCli } from "@molis-ai/molis-work-app-local-host";

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] && process.argv[3]) {
  const original = fs.writeSync;
  let paused = false;
  // Coordinate a real process death during a real payload write; ownership and all filesystem work stay production code.
  fs.writeSync = function (...args: unknown[]): number {
    if (!paused) {
      paused = true;
      process.send?.({ phase: "payload-write" });
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
    }
    return Reflect.apply(original, fs, args);
  };
  syncBuiltinESMExports();
  try {
    process.exitCode = await runLocalCli(["home", "snapshot", "--home", process.argv[2], "--to", process.argv[3], "--json"], {
      defaultSourceDirectory: () => { throw new Error("offline snapshot must not inspect an install source"); },
      withCatalog: async () => { throw new Error("offline snapshot must not construct a business Catalog"); },
      runPlugin: async () => { throw new Error("offline snapshot must not enter plugin commands"); },
    });
  } finally { fs.writeSync = original; syncBuiltinESMExports(); process.disconnect(); }
}
