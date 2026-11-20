import type { ActionSchema } from "./actions.js";
import { ACTION_SUBJECT_SCHEMA, type ActionSubject } from "./action-subjects.js";
import { closedObjectSchema as closed } from "./closed-object-schema.js";
import { MATERIAL_REF_SCHEMA, type MaterialRef } from "./project-materials.js";
import { STATE_RING_FAMILIES, type StateRingFamily } from "./ui-state-rings.js";
import { TEXT_REF_SCHEMA, type TextRef } from "./ui-text.js";

// What onboarding hands a plugin (specs/plugin-equal-standing/contract-design.md §2.5): three materials the platform delivers to an
// intake (`accepts: [{ kind: "code_root" | "documents" | "drafts" }]`, item-intake.ts). The platform finds the takers by that
// declaration and calls them, naming no plugin; the input and output of each are exactly the shapes below.

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

// ---- documents: each material, and the summary, kept as the taker's documents (§2.5) ----------------------------------------------

/**
 * The longest text one `documents` call carries: what onboarding can read of one material (its staging has no limit of its own beyond
 * the engine's longest string, user 2026-10-22), so whatever was read in can be handed on. The taker cuts it into its own parts.
 */
export const ONBOARDING_DOCUMENT_TEXT_MAX = 536_870_888;

export interface OnboardingDocumentsInput {
  /**
   * One per material (`<journey>:sources:<label>`) and one for the summary (`<journey>:summary`). The same id again returns the same
   * documents and writes nothing; a taker that cuts a material into parts names part k `<request_id>:k`, and a single part the id itself.
   */
  readonly request_id: string;
  /** What the id stood for: the same id with another hash is refused. The taker keeps it as given, never re-derived from the text. */
  readonly request_hash: string;
  /** The material's title, uncut: the taker fits it to its own titles and adds which part each is. */
  readonly title: string;
  /** Markdown; empty for a summary started blank. */
  readonly markdown: string;
}

/** Where each part went: its object, and where it opens with the title links show. */
export interface OnboardingDocumentsResult {
  readonly parts: ReadonlyArray<{ readonly subject: ActionSubject; readonly open: { readonly surface: string; readonly id: string; readonly title: string } }>;
}

export const ONBOARDING_DOCUMENTS_INPUT_SCHEMA = closed({
  request_id: text(300), request_hash: text(200), title: text(1000), markdown: { type: "string", maxLength: ONBOARDING_DOCUMENT_TEXT_MAX },
} as const);
export const ONBOARDING_DOCUMENTS_RESULT_SCHEMA = closed({
  parts: { type: "array", minItems: 1, maxItems: 10_000, items: closed({ subject: ACTION_SUBJECT_SCHEMA, open: closed({ surface: text(200), id: text(500), title: { type: "string", maxLength: 1000 } }) }) },
} as const);

// ---- drafts { get, keep }: drafted from the materials, for the person to confirm (§2.5) -------------------------------------------

/** How much of one material a draft call reads: longer text goes in parts this many characters long (a 🟢 is one). */
export const ONBOARDING_DRAFT_PART_CHARS = 60_000;
/** Materials one draft call takes. */
export const ONBOARDING_DRAFT_MATERIALS_MAX = 50;
/** Batches one `get` reads. */
export const ONBOARDING_DRAFT_GET_MAX = 50;
/** Candidates one `keep` decides. */
export const ONBOARDING_DRAFT_KEEP_MAX = 80;

export interface OnboardingDraftInput {
  readonly origin: "onboarding";
  readonly title: string;
  /** The journey, its materials and the batch: the same id returns the same batch and drafts nothing again. */
  readonly request_id: string;
  readonly materials: ReadonlyArray<{ readonly title: string; readonly text: string }>;
}

export interface OnboardingDraftCandidate {
  readonly candidate_id: string;
  readonly title: string;
  /** Ticked when the page first shows it. */
  readonly selected: boolean;
  /** What kind of draft it is, in the taker's words; its tone is a state ring family. */
  readonly label: { readonly text: TextRef; readonly state: StateRingFamily };
  /** At most four short lines: when it is due, who it waits on, that its owner is unclear, that it relates to an existing one. */
  readonly meta: readonly TextRef[];
  /** One sentence of the material it came from. */
  readonly evidence?: string;
  /** Decided already: kept (with the item it became) or not. */
  readonly decision: { readonly item_id: string | null } | null;
}

/** One batch of drafts, in the platform's shape: onboarding keeps it as it came, and the page shows it as kept. */
export interface OnboardingDraftBatch {
  readonly batch_id: string;
  readonly revision: number;
  readonly notes: readonly TextRef[];
  /** How many lines were read for reference only, not listed as drafts. */
  readonly reference_only: number;
  readonly candidates: readonly OnboardingDraftCandidate[];
}

export interface OnboardingDraftGetInput { readonly ids: readonly string[] }
export interface OnboardingDraftKeepInput { readonly id: string; readonly expected_revision: number; readonly keep: readonly string[] }

const batchId = text(200);
const ONBOARDING_DRAFT_BATCH_SCHEMA = closed({
  batch_id: batchId, revision: { type: "integer", minimum: 0 },
  notes: { type: "array", maxItems: 50, items: TEXT_REF_SCHEMA },
  reference_only: { type: "integer", minimum: 0 },
  candidates: { type: "array", maxItems: 2000, items: closed({
    candidate_id: text(200), title: { type: "string", maxLength: 500 }, selected: { type: "boolean" },
    label: closed({ text: TEXT_REF_SCHEMA, state: { type: "string", enum: STATE_RING_FAMILIES.map(family => family.key) } }),
    meta: { type: "array", maxItems: 4, items: TEXT_REF_SCHEMA },
    evidence: { type: "string", maxLength: 500 },
    decision: { anyOf: [closed({ item_id: { anyOf: [text(200), { type: "null" }] } }), { type: "null" }] },
  }, ["candidate_id", "title", "selected", "label", "meta", "decision"]) },
});
export const ONBOARDING_DRAFT_INPUT_SCHEMA = closed({
  origin: { type: "string", enum: ["onboarding"] }, title: text(200), request_id: text(300),
  materials: { type: "array", minItems: 1, maxItems: ONBOARDING_DRAFT_MATERIALS_MAX, items: closed({ title: text(200), text: { type: "string", minLength: 1, maxLength: ONBOARDING_DRAFT_PART_CHARS * 2 } }) },
} as const);
export const ONBOARDING_DRAFT_RESULT_SCHEMA = closed({ batch: ONBOARDING_DRAFT_BATCH_SCHEMA });
export const ONBOARDING_DRAFT_GET_INPUT_SCHEMA = closed({ ids: { type: "array", minItems: 1, maxItems: ONBOARDING_DRAFT_GET_MAX, items: batchId } } as const);
export const ONBOARDING_DRAFT_GET_RESULT_SCHEMA = closed({ batches: { type: "array", maxItems: ONBOARDING_DRAFT_GET_MAX, items: ONBOARDING_DRAFT_BATCH_SCHEMA } });
export const ONBOARDING_DRAFT_KEEP_INPUT_SCHEMA = closed({
  id: batchId, expected_revision: { type: "integer", minimum: 0 }, keep: { type: "array", maxItems: ONBOARDING_DRAFT_KEEP_MAX, items: text(200) },
} as const);
export const ONBOARDING_DRAFT_KEEP_RESULT_SCHEMA = closed({ batch: ONBOARDING_DRAFT_BATCH_SCHEMA });
