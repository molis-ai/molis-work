import { execFileSync } from "node:child_process";
import { LocalProjectDatabase, openPluginProjectLibrary } from "@molis-ai/molis-work-app-local-host";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";

// A disposable Host process for S-59: the test kills it only after its SQL child's CPU has advanced.
process.once("message", async (input: { file: string; manifest: PluginManifest; sql: string }) => {
  const store = new LocalProjectDatabase(input.file);
  const library = openPluginProjectLibrary({ db: store.db, path: input.file }, input.manifest, () => {},
    { install_id: "orphan", installation_generation: "1" }, { writeMs: 2000, transactionMs: 3000 });
  await library.statements.all("SELECT 1", [], { rows: 1, bytes: 100 }, new AbortController().signal);
  const pid = Number(execFileSync("pgrep", ["-P", String(process.pid), "-f", "project-statement-worker"], { encoding: "utf8" }).trim());
  process.once("message", () => {
    void library.statements.transaction(async () => {}, [
      { sql: "INSERT INTO sbxlimit_rows (text) VALUES ('dead Host')", parameters: [] }, { sql: input.sql, parameters: [] },
    ], new AbortController().signal).catch(() => { /* The parent test observes the child's exit and the actual library. */ });
  });
  process.send?.({ pid });
});
