import type { ActionDefinition, ActionSchema } from "../platform/actions.js";
import type { SkillRef } from "./agent-definitions.js";

export const AUTOMATION_CATEGORIES = ["hooks", "skills", "connections", "roles", "commands"] as const;
export type AutomationCategory = typeof AUTOMATION_CATEGORIES[number];
export type AutomationSignal = "javascript" | "python" | "rust" | "go" | "frontend" | "tests" | "format" | "ci" | "configured";
/**
 * A service's declared `project_hints` entry that this file matched (§7): the service, which kind of hint, and the hint exactly as the
 * service declared it — a Git host, a project path, a package name. Never a remote address, a version or other text from the file.
 */
export interface AutomationHint {
  readonly service_id: string;
  readonly kind: "git_host" | "file" | "dependency";
  readonly hint: string;
}
export interface AutomationEvidence {
  readonly workspace_id: string;
  readonly workspace: string;
  readonly path: string;
  readonly fingerprint?: string;
  readonly signals: readonly AutomationSignal[];
  /** The services whose declared hints this file matched; absent when none did. */
  readonly hints?: readonly AutomationHint[];
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
export const automationRecommendationActions = {
  scan: action<Record<string, never>, AutomationReport>("automation.recommendations.scan", /* @version action.automation.recommendations.scan */ 1,
    "查看项目自动化建议", "query", closed({})),
  preference: action<AutomationPreferenceInput, AutomationPreferences>("automation.recommendations.preferences.set", /* @version action.automation.recommendations.preferences.set */ 1,
    "保存项目建议偏好", "command", closed({ save_token: token, expected_revision: revision, suggestion_id: { type: "string", pattern: "^[a-f0-9]{64}$" },
      choice: { enum: ["ignored", "already-have", "hidden", "show"] } })),
  save: action<{ save_token: string }, { document_id: string }>("automation.recommendations.report.save", /* @version action.automation.recommendations.report.save */ 1,
    "将项目建议保存为文稿", "command", closed({ save_token: token })),
  /**
   * Look at the project for the Assistant (§7): when it finds suggestions it has not said before, it puts a card listing the most worth
   * having in the project's conversation for them and lights the Dock; with nothing new, no folder, or the person's switch off, it says
   * nothing. Asked as the person opens the project; a look within the last minutes is not repeated.
   */
  offer: action<Record<string, never>, AutomationOfferResult>("automation.recommendations.offer", /* @version action.automation.recommendations.offer */ 1,
    "让助理说说项目里新的可加项", "command", closed({})),
  offers: action<Record<string, never>, AutomationOffersSetting>("automation.recommendations.offers.get", /* @version action.automation.recommendations.offers.get */ 1,
    "查看助理是否主动说项目建议", "query", closed({})),
  setOffers: action<AutomationOffersSetting, AutomationOffersSetting>("automation.recommendations.offers.set", /* @version action.automation.recommendations.offers.set */ 1,
    "设置助理是否主动说项目建议", "command", closed({ enabled: { type: "boolean" } })),
};
/** What a look found: a card placed in a work, or why nothing was said. */
export type AutomationOfferResult =
  | { readonly offered: true; readonly work_id: string; readonly count: number }
  | { readonly offered: false; readonly reason: "off" | "recent" | "no-workspace" | "nothing-new" | "no-assistant" };
/** Whether the Assistant brings up new project suggestions by itself, for this person in every project. */
export interface AutomationOffersSetting { readonly enabled: boolean }

/**
 * Adopting suggestions (specs/automation-recommender §7, AUT-06, AUT-08): what the Assistant's card offered in a project, turned on as the
 * person confirms it in the card. Only the person, through the card the Host placed in their work (or a page of theirs), calls these;
 * no Agent, plugin, workflow or MCP client can. A skill is turned on in the project in the chosen way; a connection is prepared and
 * finished in the card's own connection card; undo turns back exactly what this adoption turned on and nothing else.
 */
export const AUTOMATION_ADOPTION_PROVIDER_ID = "system.automation-adoption";
/** At most this many suggestions are offered in one card, and adopted in one call. */
export const AUTOMATION_OFFER_LIMIT = 3;
export interface AutomationAdoptInput {
  /** Suggestions to turn on: ids the project's latest offer listed. */
  readonly adopt: readonly string[];
  /** Suggestions not to bring up again in this project (AUT-07 「以后别再提」). */
  readonly never: readonly string[];
  /** How a skill turned on here is used (第 41 批): picked by the Assistant when it applies, or only when named. */
  readonly skill_state: "auto" | "manual";
}
export interface AutomationAdoptResult {
  readonly adoption_id: string;
  /** What is now on, as the person reads it. */
  readonly summary: string;
  readonly enabled: readonly { readonly id: string; readonly title: string }[];
  readonly hidden: readonly { readonly id: string; readonly title: string }[];
  /** A connection the person still finishes in the card (`result_view.pending_connection`). */
  readonly authorization_id?: string;
}
export interface AutomationUndoResult {
  readonly adoption_id: string;
  readonly summary: string;
  readonly restored: readonly string[];
  /** Changed by someone else since, so left as it is now, with why. */
  readonly kept: readonly { readonly title: string; readonly reason: string }[];
}
const suggestionIds = { type: "array", maxItems: AUTOMATION_OFFER_LIMIT, uniqueItems: true, items: { type: "string", pattern: "^[a-f0-9]{64}$" } } as const;
const named = { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" } }, required: ["id", "title"], additionalProperties: false } } as const;
const adoption = (name: string, version: number, title: string, description: string, input_schema: ActionSchema, output_schema: ActionSchema,
  extra: Partial<ActionDefinition["action"]>): ActionDefinition => ({
  capability_id: name, version, provider_id: AUTOMATION_ADOPTION_PROVIDER_ID, operation: "command",
  action: { title, description, scope: "project", kind: "operation", effect: "write", scheduling: "concurrent", audiences: ["user"], permissions: [], subject_kinds: [],
    input_schema, output_schema, ...extra },
});
export const automationAdoptionActions = {
  adopt: adoption("automation.adoption.adopt", /* @version action.automation.adoption.adopt */ 1, "开启所选建议",
    "本人在这个项目里开启助理卡片列出的建议：技能按所选方式开启，连接准备好后在卡里接上；勾了「以后别再提」的不再出现。只认这个项目最近一次列出的建议。",
    { type: "object", properties: {
      adopt: { ...suggestionIds, title: "开启这些" }, never: { ...suggestionIds, title: "以后别再提" },
      skill_state: { title: "技能怎么用", oneOf: [{ const: "auto", title: "适用时自动用" }, { const: "manual", title: "只在点名时用" }] },
    }, required: ["adopt", "never", "skill_state"], additionalProperties: false },
    { type: "object", properties: { adoption_id: { type: "string", format: "uuid" }, summary: { type: "string" }, enabled: named, hidden: named,
      authorization_id: { type: "string", format: "uuid" } }, required: ["adoption_id", "summary", "enabled", "hidden"], additionalProperties: false },
    { undo: { capability_id: "automation.adoption.undo", version: /* @version action.automation.adoption.undo */ 1, input: { adoption_id: "adoption_id" } },
      result_view: { summary: "已开启所选", text_pointer: "/summary", pending_connection: { authorization_pointer: "/authorization_id" } } }) as ActionDefinition<AutomationAdoptInput, AutomationAdoptResult>,
  undo: adoption("automation.adoption.undo", /* @version action.automation.adoption.undo */ 1, "撤销开启的建议",
    "本人撤销一次开启：把那次开的技能关回原来的状态；之后被别人改过的保持现状并说明。",
    { type: "object", properties: { adoption_id: { type: "string", pattern: "^[0-9a-f-]{36}$" } }, required: ["adoption_id"], additionalProperties: false },
    { type: "object", properties: { adoption_id: { type: "string" }, summary: { type: "string" }, restored: { type: "array", items: { type: "string" } },
      kept: { type: "array", items: { type: "object", properties: { title: { type: "string" }, reason: { type: "string" } }, required: ["title", "reason"], additionalProperties: false } } },
      required: ["adoption_id", "summary", "restored", "kept"], additionalProperties: false },
    { result_view: { summary: "已撤销", text_pointer: "/summary" } }) as ActionDefinition<{ adoption_id: string }, AutomationUndoResult>,
};
