import type { DatabaseSync } from "node:sqlite";
import { FUNCTIONS_DEFAULT_MODEL, type FunctionSceneMap } from "@molis-ai/molis-work-contracts/modules/functions";
import type { ActionSceneBinding, ActionSceneDefaultRule } from "@molis-ai/molis-work-contracts/platform/actions";
import { publishedFunctionKey } from "./actions.js";
import { functionsErrors } from "./errors.js";
import { hashFunctionConfig } from "./hash.js";

/** A scene's declared rule with the scene it is for: what the Host passes when a scene is registered. */
export interface DeclaredSceneRule {
  /** Who declared the scene: the plugin's id, or the Host provider's own id for a scene the Host declares. The rule row records it. */
  readonly declarer: string;
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

const DECLARED_ID_PREFIX = "declared:";

/** The id of the row a declarer's rule is written under: it names the declarer, so the library records who declared a rule without a column of its own. */
export const declaredRuleId = (declarer: string, functionKey: string): string => `${DECLARED_ID_PREFIX}${declarer}:${functionKey}`;

/** Who declared the rule a row holds; null for a rule nobody declared (the person's own, or one written before rules were declared). */
function declarerOf(id: string, functionKey: string): string | null {
  return id.startsWith(DECLARED_ID_PREFIX) && id.endsWith(`:${functionKey}`) ? id.slice(DECLARED_ID_PREFIX.length, id.length - functionKey.length - 1) : null;
}

/**
 * Refuses rules whose key another declarer already holds, before anything is written: a key belongs to the first plugin that declared it.
 * A key held by a rule nobody declared (the person's own, or an older built-in row) is not another declarer's, so it is left as it is.
 */
export function admitDeclaredRules(db: DatabaseSync, rules: readonly DeclaredSceneRule[]): void {
  for (const { declarer, rule } of rules) {
    const row = db.prepare("SELECT id FROM functions WHERE function_key = ?").get(rule.function_key) as { id: string } | undefined;
    const holder = row ? declarerOf(row.id, rule.function_key) : null;
    if (holder !== null && holder !== declarer) throw functionsErrors.rule_key_taken(`默认规则 ${rule.function_key} 已由 ${holder} 声明，${declarer} 不能再声明同名规则`);
  }
}

/**
 * Writes the rules scenes declare for themselves, each once: a function key that is already in the library keeps what it has, so
 * the first declaration of a key wins and a user's edit to a rule is never written over. `sceneMap` gives a rule's option targets that
 * only the composition root can name, asked for a rule only when it is first written.
 */
export function seedDeclaredRules(db: DatabaseSync, rules: readonly DeclaredSceneRule[], sceneMap: (rule: DeclaredRuleSubject) => FunctionSceneMap = () => ({})): void {
  admitDeclaredRules(db, rules);
  for (const { declarer, scene_id, recommendation_source, rule } of rules) {
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
      declaredRuleId(declarer, rule.function_key),
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

/** What leaving a declarer behind removed: the rules it declared, those kept because another project's binding still uses them, and the bindings removed. */
export interface ForgottenDeclaredRules {
  readonly removed: readonly string[];
  readonly kept: readonly string[];
  readonly bindings: number;
}

/**
 * A declarer's data is gone: the rules it declared leave the library, with the bindings that name them. Bindings are per project, so a
 * project's uninstall (`projectId`) removes that project's bindings, and a rule another project's binding still names stays until that
 * binding goes. The Home-level uninstall (`projectId` null) removes every binding. Rules nobody declared are never touched, nor are
 * the judgments already made (they are history, and go with their project).
 */
export function forgetDeclaredRules(db: DatabaseSync, declarer: string, projectId: string | null): ForgottenDeclaredRules {
  const keys = new Set((db.prepare("SELECT id, function_key FROM functions WHERE substr(id, 1, ?) = ?").all(DECLARED_ID_PREFIX.length, DECLARED_ID_PREFIX) as Array<{ id: string; function_key: string }>)
    .filter(row => declarerOf(row.id, row.function_key) === declarer).map(row => row.function_key));
  if (!keys.size) return { removed: [], kept: [], bindings: 0 };
  const bindings = (db.prepare("SELECT scene_id, project_id, action_binding_json FROM function_scene_bindings").all() as Array<{ scene_id: string; project_id: string; action_binding_json: string }>)
    .flatMap(row => { const key = publishedFunctionKey((JSON.parse(row.action_binding_json) as ActionSceneBinding).function); return key && keys.has(key) ? [{ ...row, key }] : []; });
  const mine = bindings.filter(row => projectId === null || row.project_id === projectId);
  for (const row of mine) db.prepare("DELETE FROM function_scene_bindings WHERE scene_id = ? AND project_id = ?").run(row.scene_id, row.project_id);
  const stillUsed = new Set(bindings.filter(row => !mine.includes(row)).map(row => row.key));
  const kept = [...keys].filter(key => stillUsed.has(key));
  const removed = [...keys].filter(key => !stillUsed.has(key));
  for (const key of removed) db.prepare("DELETE FROM functions WHERE function_key = ?").run(key);
  return { removed, kept, bindings: mine.length };
}
