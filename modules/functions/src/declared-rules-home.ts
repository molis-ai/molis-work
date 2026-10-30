import { clearInExistingHomeSqlite } from "@molis-ai/molis-work-storage";
import { admitDeclaredRules, forgetDeclaredRules, type DeclaredSceneRule, type ForgottenDeclaredRules } from "./declared-rules.js";
import { FUNCTIONS_STORE_BASELINE } from "./store-schema.js";

// What the Host asks of the Home's Functions library about declared rules without opening a service: they work on the library's file,
// so any process on the Home can run them, and create none (no library means nothing is declared yet).

/** Throws `functions.rule_key_taken` when another declarer already holds one of the rules' keys; nothing is written. */
export function admitDeclaredRulesIn(homeDirectory: string, rules: readonly DeclaredSceneRule[]): void {
  clearInExistingHomeSqlite(homeDirectory, "functions", FUNCTIONS_STORE_BASELINE, (db) => admitDeclaredRules(db, rules));
}

/**
 * A plugin is uninstalled without keeping its data, or reinstalled discarding it: the bindings that name the rules it declared go, and the
 * rules with them unless `keepRules` (another installation still holds the plugin; `forgetDeclaredRules`). Undefined when there is no library.
 */
export function forgetDeclaredRulesIn(homeDirectory: string, declarer: string, projectId: string | null, keepRules = false): ForgottenDeclaredRules | undefined {
  return clearInExistingHomeSqlite(homeDirectory, "functions", FUNCTIONS_STORE_BASELINE, (db) => forgetDeclaredRules(db, declarer, projectId, keepRules));
}
