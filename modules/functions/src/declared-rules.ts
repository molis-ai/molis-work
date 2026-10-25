import type { DatabaseSync } from "node:sqlite";
import { FUNCTIONS_DEFAULT_MODEL, type FunctionSceneMap } from "@molis-ai/molis-work-contracts/modules/functions";
import type { ActionSceneDefaultRule } from "@molis-ai/molis-work-contracts/platform/actions";
import { hashFunctionConfig } from "./hash.js";

/** A scene's declared rule with the scene it is for: what the Host passes when a scene is registered. */
export interface DeclaredSceneRule {
  readonly scene_id: string;
  /** Set when the scene's recommendations are the offers other plugins declare, whose targets only the composition root can name. */
  readonly recommendation_source?: "subject-offers";
  readonly rule: ActionSceneDefaultRule;
}

/** What a declared rule is about, for the composition root to resolve its option targets from. */
export interface DeclaredRuleSubject {
  readonly function_key: string;
  readonly scene_id: string;
  readonly recommendation_source?: "subject-offers";
  readonly subject_kinds: readonly string[];
  readonly option_keys: readonly string[];
}

/**
 * Writes the rules scenes declare for themselves, each once: a function key that is already in the library keeps what it has, so
 * the first declaration of a key wins and a user's edit to a rule is never written over. `sceneMap` gives a rule's option targets that
 * only the composition root can name, asked for a rule only when it is first written.
 */
export function seedDeclaredRules(db: DatabaseSync, rules: readonly DeclaredSceneRule[], sceneMap: (rule: DeclaredRuleSubject) => FunctionSceneMap = () => ({})): void {
  for (const { scene_id, recommendation_source, rule } of rules) {
    if (db.prepare("SELECT id FROM functions WHERE function_key = ?").get(rule.function_key)) continue;
    const criteria = rule.options.map(option => ({ key: option.key, description: option.description }));
    const now = new Date().toISOString();
    const config_hash = hashFunctionConfig({ primitive: "choice", instructions: rule.instructions, criteria, model: FUNCTIONS_DEFAULT_MODEL });
    const preview = {
      input: "declared",
      outcome: "ok",
      primitive: "choice",
      choice: criteria[0]?.key ?? null,
      noul: null,
      score: null,
      legend: null,
      probabilities: {},
      confidence: null,
      model: FUNCTIONS_DEFAULT_MODEL,
      config_hash,
      at: now,
    };
    const subject: DeclaredRuleSubject = { function_key: rule.function_key, scene_id, subject_kinds: rule.subject_kinds, option_keys: criteria.map(criterion => criterion.key),
      ...(recommendation_source ? { recommendation_source } : {}) };
    db.prepare(`
      INSERT INTO functions (
        id, name, function_key, primitive, status, version, model, instructions, criteria_json,
        scene_id, subject_kinds_json, scene_map_json, config_hash, last_preview_json, samples_json, published_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'choice', 'published', 1, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?)
    `).run(
      `declared-${rule.function_key}`,
      rule.name,
      rule.function_key,
      FUNCTIONS_DEFAULT_MODEL,
      rule.instructions,
      JSON.stringify(criteria),
      scene_id,
      JSON.stringify(rule.subject_kinds),
      JSON.stringify(sceneMap(subject)),
      config_hash,
      JSON.stringify(preview),
      now,
      now,
      now,
    );
  }
}
