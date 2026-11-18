import type { ActionDefinition, ActionSchema } from "../platform/actions.js";
import type { SkillRef } from "./agent-definitions.js";

export const AUTOMATION_CATEGORIES = ["hooks", "skills", "connections", "roles", "commands"] as const;
export type AutomationCategory = typeof AUTOMATION_CATEGORIES[number];
export type AutomationSignal = "javascript" | "python" | "rust" | "go" | "frontend" | "tests" | "format" | "ci" | "github" | "postgres" | "notion" | "configured";
export interface AutomationEvidence {
  readonly workspace_id: string;
  readonly workspace: string;
  readonly path: string;
  readonly fingerprint?: string;
  readonly signals: readonly AutomationSignal[];
}
export type AutomationNext =
  | { readonly kind: "skill"; readonly ref: SkillRef }
  | { readonly kind: "connection"; readonly service_id: string }
  | { readonly kind: "role"; readonly owner_id: string; readonly role_id: string; readonly install_id: string; readonly plugin_version: string };
export interface AutomationSuggestion {
  readonly id: string;
  readonly category: AutomationCategory;
  readonly title: string;
  readonly reason: string;
  readonly effect: string;
  readonly requirements: readonly string[];
  readonly risk: string;
  readonly confidence: "high" | "medium";
  readonly evidence: readonly AutomationEvidence[];
  readonly next: AutomationNext;
}
export type AutomationPreferenceChoice = "ignored" | "already-have" | "hidden";
export interface AutomationPreference {
  readonly id: string;
  readonly title: string;
  readonly choice: AutomationPreferenceChoice;
}
export interface AutomationPreferences { readonly revision: string; readonly choices: readonly AutomationPreference[] }
export interface AutomationGap {
  readonly code: "no-workspace" | "budget" | "unreadable" | "directory-unavailable" | "preferences-unavailable";
  readonly workspace?: string;
  readonly path?: string;
  readonly category?: AutomationCategory;
}
export interface AutomationReport {
  readonly groups: readonly { category: AutomationCategory; suggestions: readonly AutomationSuggestion[] }[];
  readonly evidence: readonly AutomationEvidence[];
  readonly gaps: readonly AutomationGap[];
  readonly preferences: AutomationPreferences | null;
  readonly save_token: string;
}
export interface AutomationPreferenceInput {
  readonly save_token: string;
  readonly expected_revision: string;
  readonly suggestion_id: string;
  readonly choice: AutomationPreferenceChoice | "show";
}

export const AUTOMATION_PROVIDER_ID = "system.automation-recommendations";
const token = { type: "string", pattern: "^[0-9a-f-]{36}$" } as const;
const revision = { type: "string", minLength: 1, maxLength: 80 } as const;
const closed = (properties: Record<string, ActionSchema>): ActionSchema =>
  ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });

function action<I, O>(name: string, version: number, title: string, operation: "query" | "command", input_schema: ActionSchema): ActionDefinition<I, O> {
  return { capability_id: name, version, provider_id: AUTOMATION_PROVIDER_ID, operation,
    action: { title, description: title, scope: "project", kind: operation === "query" ? "query" : "operation", effect: operation === "query" ? "read" : "write",
      scheduling: "concurrent", audiences: ["user"], permissions: [], subject_kinds: [], input_schema, output_schema: { type: "object" } } };
}
/** Where a saved report went: the document the keeping plugin made, and where it opens (that plugin's own `open`). */
export interface AutomationSavedReport {
  readonly document_id: string;
  readonly open: { readonly surface: string; readonly id: string; readonly title: string };
}
export const automationRecommendationActions = {
  scan: action<Record<string, never>, AutomationReport>("automation.recommendations.scan", /* @version action.automation.recommendations.scan */ 1,
    "查看项目自动化建议", "query", closed({})),
  preference: action<AutomationPreferenceInput, AutomationPreferences>("automation.recommendations.preferences.set", /* @version action.automation.recommendations.preferences.set */ 1,
    "保存项目建议偏好", "command", closed({ save_token: token, expected_revision: revision, suggestion_id: { type: "string", pattern: "^[a-f0-9]{64}$" },
      choice: { enum: ["ignored", "already-have", "hidden", "show"] } })),
  save: action<{ save_token: string }, AutomationSavedReport>("automation.recommendations.report.save", /* @version action.automation.recommendations.report.save */ 1,
    "将项目建议保存为文稿", "command", closed({ save_token: token })),
};
