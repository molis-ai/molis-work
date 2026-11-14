import type { ActionSchema } from "./actions.js";
import { closedObjectSchema as closed } from "./closed-object-schema.js";
import { MATERIAL_REF_SCHEMA, type MaterialRef } from "./project-materials.js";

/**
 * 可承接上手材料 (specs/coding-harness-optimization/batch12-design.md §7, decision 43②): what a plugin can take from onboarding, and
 * its own action that takes it. Only `code_root` today: a folder the person chose that has project files at its top. The platform finds
 * the takers by this declaration and calls the action as the person, with that action's own permissions only; it names no plugin.
 */
export interface PluginOnboardingDeclaration {
  readonly takes: ReadonlyArray<{ readonly kind: "code_root"; readonly capability_id: string; readonly version: number }>;
}

/** At most this many materials go with a take; the person is told how many went. */
export const ONBOARDING_TAKE_MATERIALS_MAX = 30;

/** What a `code_root` take is given. Identity (actor, project, installation) comes from the call, never from here. */
export interface OnboardingCodeRootTake {
  /** The journey and this take: a retry with the same id returns what the first call did and writes nothing again. */
  readonly request_id: string;
  /** The person's own folder, already the project's output when the plugin is called; the plugin checks it against `projects.directories.get@1`. */
  readonly code_root: { readonly workspace_id: string };
  /** The materials this round brought, by exact reference. */
  readonly materials: ReadonlyArray<{ readonly ref: MaterialRef; readonly title: string }>;
}

/** Where the person goes on: the plugin's own item to open, or null for the plugin's page as it opens. */
export interface OnboardingTakeResult {
  readonly open: { readonly item_id: string; readonly title: string } | null;
}

const text = <const N extends number>(maxLength: N) => ({ type: "string", minLength: 1, maxLength } as const);
/** The take action's input, exactly: the SDK's Manifest check refuses a declared action whose input is any other shape. It keeps its literals, so a plugin reads its input type from it. */
export const ONBOARDING_CODE_ROOT_TAKE_INPUT_SCHEMA = closed({
  request_id: text(200),
  code_root: closed({ workspace_id: text(200) }),
  materials: { type: "array", maxItems: ONBOARDING_TAKE_MATERIALS_MAX, items: closed({ ref: MATERIAL_REF_SCHEMA, title: { type: "string", maxLength: 500 } }) },
} as const);
/** The take action's output, exactly. */
export const ONBOARDING_TAKE_RESULT_SCHEMA: ActionSchema = closed({
  open: { anyOf: [closed({ item_id: text(200), title: { type: "string", maxLength: 500 } }), { type: "null" }] },
});
