import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import type { IntegrationProviderPort } from "@molis-ai/molis-work-contracts/platform/plugin";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { accountSourceRecord } from "./feed-account-source.js";
import { createLocalFeedApplication, createLocalFeedConnectorSync } from "./feed-library.js";

/** An isolated Home; reopening keeps real Listener, Signals and Feed progress. */
export async function withIntegrationHome(run: (home: {
  directory: string;
  store: () => LocalProjectDatabase;
  reopen: () => void;
  chain: (port: IntegrationProviderPort) => ReturnType<typeof integrationChain>;
}) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "integration-progress-"));
  const previous = [process.env.MOLIS_WORK_HOME, process.env.MOLIS_WORK_SECRET_BACKEND, process.env.NODE_ENV];
  const path = join(directory, "project.sqlite");
  let store: LocalProjectDatabase | undefined;
  try {
    process.env.MOLIS_WORK_HOME = directory;
    process.env.MOLIS_WORK_SECRET_BACKEND = "file";
    process.env.NODE_ENV = "test";
    resetSecretStoreCache();
    seedDemoBoard(path);
    store = new LocalProjectDatabase(path);
    await run({ directory, store: () => store!, reopen() { store!.close(); store = new LocalProjectDatabase(path); },
      chain: port => integrationChain(store!, port, directory) });
  } finally {
    store?.close(); resetSecretStoreCache();
    ["MOLIS_WORK_HOME", "MOLIS_WORK_SECRET_BACKEND", "NODE_ENV"].forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index];
    });
    rmSync(directory, { recursive: true, force: true });
  }
}

function integrationChain(store: LocalProjectDatabase, port: IntegrationProviderPort, directory: string) {
  const feed = createLocalFeedApplication(store.db);
  const sync = createLocalFeedConnectorSync(store.db, DEMO_PROJECT_ID, () => port, feed, directory);
  return { feed, sync, source(kind: "gmail" | "github") { return feed.upsertSource(accountSourceRecord(kind, { status: "active" })); } };
}
