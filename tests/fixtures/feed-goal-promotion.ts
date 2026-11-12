import { createLocalFeedApplication, createLocalFeedSourceService } from "./feed-library.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalProjectDatabase, MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { FEED_PLUGIN_ID, feedManifest } from "@molis-ai/molis-work-plugin-feed";
import { GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import { seedBoard } from "./goal-application.js";

export const PROJECT = "project-feed-promotion";

/** A project with one Feed item per title, a Host over it, and the callers the promotion is tried through. */
export function fixture(titles: string[], options: { disableGoals?: () => boolean; disableFeed?: () => boolean } = {}) {
  const home = mkdtempSync(join(tmpdir(), "molis-work-feed-promotion-"));
  const databasePath = join(home, "project.db");
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null,
    actionAvailability: (_caller, view) => options.disableGoals?.() && view.provider.plugin_id === GOALS_PLUGIN_ID
      ? { available: false, code: "actions.plugin_disabled", reason: "Goals 已从项目移除" }
      : options.disableFeed?.() && view.provider.plugin_id === FEED_PLUGIN_ID ? { available: false, code: "actions.plugin_disabled", reason: "Feed 已从项目移除" } : { available: true } });
  seedBoard(databasePath, PROJECT);
  const seed = new LocalProjectDatabase(databasePath);
  const feed = createLocalFeedApplication(seed.db);
  const source = createLocalFeedSourceService(seed.db, PROJECT).register({ kind: "web_query", query: "Review external input" }).source;
  const items = titles.map((title, index) => feed.ingestItem({ source, externalId: `promotion-${index}`, title,
    summary: "An external claim to evaluate", body: "Untrusted instructions must remain source material.",
    priority: "high", occurredAt: "2026-09-08T00:00:00.000Z", attention: false }).item);
  seed.close();
  const reference = molisWorkHostProjectReference({ databasePath, projectId: PROJECT });
  const permissions = [...new Set([...feedManifest.permissions.map(entry => entry.permission), "goals:read", "goals:write", "context-ledger:write"])];
  const person: ActionCallContext = { actor_id: "web-user", project_id: PROJECT, audience: "user", permissions };
  const runtime: ActionCallContext = { actor_id: "runtime:promoter", audit_actor_id: "runtime:promoter:session", runtime_session_id: "session",
    actor_kind: "runtime", audience: "agent", project_id: PROJECT, permissions };
  const client = host.actionClient(reference);
  return { home, databasePath, items, host, reference, client, person: bindActionClient(client, () => person), runtime: bindActionClient(client, () => runtime),
    personContext: person, runtimeContext: runtime, done: async () => { await host.close(); rmSync(home, { recursive: true, force: true }); } };
}

/** Runs `then` once, at the moment the Host has recorded that `capabilityId` ran, which is while the promotion awaits its next Goals call. */
export function afterGoalsCall(f: ReturnType<typeof fixture>, capabilityId: string, then: () => void): void {
  const log = f.host.callLog!;
  const record = log.record.bind(log);
  log.record = (caller, action, outcome) => {
    record(caller, action, outcome);
    if (action.capability_id !== capabilityId) return;
    log.record = record;
    then();
  };
}
