import { existsSync, readdirSync } from "node:fs";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { defaultPrefs, isCompletePrefs, memoryErrors } from "@molis-ai/molis-work-service-memory";
import { homeSqlitePath, MEMORY_LEDGER_STORE, openMemoryLedger, readMemoryLedgerProfiles } from "@molis-ai/molis-work-storage";

/** Current ledger format and complete product prefs, not SDK entry classification or migration. */
export function prepareMemoryHome(home: string): boolean {
  const hasLedger = existsSync(homeSqlitePath(home, MEMORY_LEDGER_STORE));
  const newHome = !hasLedger && (!existsSync(home) || readdirSync(home).length === 0);
  if (!hasLedger && !newHome) throw memoryErrors.unavailable("这个 Home 的记忆尚未采用当前格式；请备份后完成采用，再重新启动");
  if (hasLedger) {
    const profiles = readMemoryLedgerProfiles({ homeDirectory: home });
    if (profiles.some(profile => !isCompletePrefs(profile.prefs))
      || !["personal", "project-default"].every(key => profiles.some(profile => profile.actor_id === LOCAL_PERSON_ACTOR_ID && profile.key === key))) {
      throw memoryErrors.unavailable("这个 Home 的记忆设置尚未全部采用当前格式；请在备份副本上完成采用，再重新启动");
    }
  }
  const ledger = openMemoryLedger({ homeDirectory: home });
  let initialized = false;
  try {
    if (newHome) ledger.transaction(() => {
      // Another supported entry may have initialized this empty Home while this connection was opening.
      if (ledger.marker(LOCAL_PERSON_ACTOR_ID, "strategy-adoption")) return;
      if (ledger.prefs(LOCAL_PERSON_ACTOR_ID, "personal") || ledger.prefs(LOCAL_PERSON_ACTOR_ID, "project-default")) {
        throw memoryErrors.unavailable("这个 Home 已有记忆设置但尚未完成采用；请完成采用后重新启动");
      }
      ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, "personal", defaultPrefs("personal", "reviewed"));
      ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, "project-default", defaultPrefs("project", "reviewed"));
      ledger.setMarker(LOCAL_PERSON_ACTOR_ID, "strategy-adoption", { origin: "new-home" }, new Date().toISOString());
      initialized = true;
    });
    const adopted = ledger.marker(LOCAL_PERSON_ACTOR_ID, "strategy-adoption")?.body;
    if (!adopted || typeof adopted !== "object" || !("origin" in adopted)
      || (adopted.origin !== "new-home" && adopted.origin !== "existing-home")
      || !isCompletePrefs(ledger.prefs(LOCAL_PERSON_ACTOR_ID, "personal"))
      || !isCompletePrefs(ledger.prefs(LOCAL_PERSON_ACTOR_ID, "project-default"))) {
      throw memoryErrors.unavailable("这个 Home 的记忆采用尚未完成；请在备份副本上完成采用，再重新启动");
    }
    return initialized;
  } finally { ledger.close(); }
}
