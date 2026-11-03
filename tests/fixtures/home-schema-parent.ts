import { execFileSync } from "node:child_process";
import { setImmediate } from "node:timers/promises";
import type { HomePluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { homeStores, openSandboxHomeLibrary } from "@molis-ai/molis-work-app-local-host";

// Disposable Host for RAC2866 DDL-1. Its test observes the SQL child's actual exit before this Host can run any timer or cleanup.
process.once("message", async (input: { home: string; owner: { plugin_id: string; publisher_signature: string }; declaration: HomePluginDatabaseDeclaration }) => {
  process.channel?.ref();
  const outcome = openSandboxHomeLibrary(input.home, input.owner, input.declaration, homeStores(), () => {}, { install_id: "blocked", installation_generation: "first" })
    .then(opened => { opened.close(); return { code: "unexpected-success" }; }, error => ({ code: error.code, message: error.message }));
  await setImmediate();
  const pid = Number(execFileSync("pgrep", ["-P", String(process.pid), "-f", "project-statement-worker"], { encoding: "utf8" }).trim());
  process.once("message", async () => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
    process.send?.(await outcome, () => process.disconnect());
  });
  process.send?.({ pid });
});
