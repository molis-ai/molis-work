import type { UiRequest, UiRequestFailure } from "@molis-ai/molis-work-contracts/platform/ui";
import { skillPlaceholders } from "@molis-ai/molis-work-contracts/services/skill-placeholders";
import type { SkillAuthoredFields, SkillCase, SkillCaseFields, SkillDraft, SkillDraftAdoptResult, SkillDraftCreateTarget,
  SkillDraftSummary, SkillDraftUpdateResult, SkillScope, SkillTrial, SkillTrialConsumer, SkillVersion } from "@molis-ai/molis-work-contracts/services/skills";

// A Skill's drafts on the 「能力包」 page (batch 42, 定样 docs/design/skill-improvement scheme B): every change is a draft first and
// only adopting it makes a version. This keeps the requests and what the page holds of one open draft; workshop.ts draws it and
// writing.ts turns what the person does into these.

const page = globalThis as typeof globalThis & { molisWorkRequest: UiRequest };
const settings = (project: string, path: string) => (project ? `/projects/${encodeURIComponent(project)}` : "") + `/api/skills/${path}`;
const call = <T>(project: string, path: string, body: object) => page.molisWorkRequest<T>(settings(project, path), { body });

export const listDrafts = (project: string, includeDiscarded = false) => call<{ drafts: SkillDraftSummary[] }>(project, "drafts/list", { ...(includeDiscarded ? { include_discarded: true } : {}) }).then(result => result.drafts);
export const readDraft = (project: string, draftId: string) => call<SkillDraft>(project, "drafts/read", { draft_id: draftId });
export const createDraft = (project: string, scope: SkillScope, target: SkillDraftCreateTarget, fields?: SkillAuthoredFields) =>
  call<SkillDraft>(project, "drafts/create", { scope, target, ...(fields ? { fields } : {}) });
export const updateDraft = (project: string, draft: SkillDraft, fields: SkillAuthoredFields, replacements: Record<string, string>) =>
  call<SkillDraftUpdateResult>(project, "drafts/update", { draft_id: draft.draft_id, expected_revision: draft.revision, fields, replacements });
export const reviseDraft = (project: string, draft: SkillDraft, instruction: string) =>
  call<SkillDraft>(project, "drafts/revise", { draft_id: draft.draft_id, expected_revision: draft.revision, instruction });
export const discardDraft = (project: string, draftId: string, restore = false) => call<{ discarded: boolean }>(project, "drafts/discard", { draft_id: draftId, ...(restore ? { restore } : {}) });
export const putCase = (project: string, draftId: string, fields: SkillCaseFields, caseId?: string) =>
  call<SkillCase>(project, "drafts/cases/put", { draft_id: draftId, ...fields, ...(caseId ? { case_id: caseId } : {}) });
export const removeCase = (project: string, draftId: string, caseId: string) => call<{ case_id: string }>(project, "drafts/cases/remove", { draft_id: draftId, case_id: caseId });
export const runTrial = (project: string, draft: SkillDraft, caseId: string) =>
  call<SkillTrial>(project, "drafts/trial", { draft_id: draft.draft_id, expected_revision: draft.revision, case_id: caseId });
export const listVersions = (project: string, scope: SkillScope, skillId: string) => call<{ versions: SkillVersion[] }>(project, "versions", { scope, skill_id: skillId }).then(result => result.versions);
export const dismissSource = (project: string, scope: SkillScope, skillId: string, sourceVersion: number) =>
  call<object>(project, "lineage/dismiss", { scope, skill_id: skillId, source_version: sourceVersion });
/** Adopting signs and installs the person's own package, so it is the install service's (as removing a Skill is). */
export const adoptDraft = (project: string, draft: SkillDraft, acceptDifferences: boolean) =>
  page.molisWorkRequest<SkillDraftAdoptResult>(`/projects/${encodeURIComponent(project || "personal")}/api/plugin-trust/skills/drafts/adopt`,
    { body: { draft_id: draft.draft_id, expected_revision: draft.revision, ...(acceptDifferences ? { accept_differences: true } : {}) } });

export type Fields = Required<Omit<SkillAuthoredFields, "applies_to">> & Pick<SkillAuthoredFields, "applies_to">;
export const blank = (): Fields => ({ name: "", description: "", when_not_to_use: "", argument_hint: "", applies_to: "assistant", body: "" });
export const fieldsOf = (fields: SkillAuthoredFields): Fields => ({ ...blank(), ...fields, when_not_to_use: fields.when_not_to_use ?? "", argument_hint: fields.argument_hint ?? "" });
/** What is sent: the optional fields only when written. */
export const sentFields = (fields: Fields): SkillAuthoredFields => ({ name: fields.name, description: fields.description, applies_to: fields.applies_to, body: fields.body,
  ...(fields.when_not_to_use.trim() ? { when_not_to_use: fields.when_not_to_use } : {}), ...(fields.argument_hint.trim() ? { argument_hint: fields.argument_hint } : {}) });

export type SaveState =
  | { kind: "saved" | "saving" }
  | { kind: "failed" | "latest-failed"; message: string }
  | { kind: "conflict"; latest: SkillDraft };
export type Side = "try" | "compare";
export type Tab = "edit" | Side;
export type CaseForm = SkillCaseFields & { case_id?: string };

/** One open draft as the page holds it: the Host's draft, what is typed since it was saved, and where the person is in it. */
export interface Workshop {
  draft: SkillDraft;
  fields: Fields;
  replacements: Record<string, string>;
  /** Snapshot of the wording fields with placeholders unexpanded, kept while editing placeholders so typing never rewrites unrelated text. */
  placeholderBase?: Record<"description" | "when_not_to_use" | "body", string>;
  /** The Skill or source it was opened from, by name, for the heading. */
  name: string;
  /** The version the draft becomes when adopted (absent: a new Skill). */
  next?: number;
  save: SaveState;
  /** Narrow: the one column shown; wide: the side column's tab. */
  tab: Tab;
  side: Side;
  compare: "how" | "out" | "draft";
  /** The replayed result compared with the known answer. */
  out?: { consumer: SkillTrialConsumer; side: "base" | "draft" };
  ask: string;
  asking?: boolean;
  askFailure?: string;
  changed?: number;
  running?: string;
  runFailure?: string;
  /** The code of the failed replay, so only a missing model offers the model-settings link. */
  runFailureCode?: string;
  caseForm?: CaseForm;
  caseErrors: Partial<Record<keyof SkillCaseFields, string>>;
  confirm?: boolean | number;
  adopting?: boolean;
  adoptFailure?: string;
  errors: Partial<Record<keyof SkillAuthoredFields, string>>;
  /**
   * A copy's choice to turn the original off once it is adopted; offered only when the copy goes where this page sets Skills (a Skill
   * is switched per place it is used, so a copy to another place leaves the original here as it is).
   */
  turnOffSource?: boolean;
}

export function workshopOf(draft: SkillDraft, name: string, next: number | undefined, here: boolean): Workshop {
  return { draft, fields: fieldsOf(draft.fields), replacements: { ...draft.replacements }, name, ...(next ? { next } : {}), save: { kind: "saved" },
    tab: "edit", side: "try", compare: "how", ask: "", caseErrors: {}, errors: {}, ...draft.target.kind === "custom" && here ? { turnOffSource: true } : {} };
}

/** The draft's known answers replayed at this revision: the latest replay is of the revision on screen. */
/** Adopting waits for a replay of each known answer on this revision; the next one to replay. */
export const nextUntried = (w: Workshop) => w.draft.untried[0];
export const replayedNow = (w: Workshop) => Boolean(w.draft.trial && w.draft.trial.draft_revision === w.draft.revision);
/** The entries the Skill is replayed in, as it applies now. */
export const consumersOf = (fields: Fields): SkillTrialConsumer[] => fields.applies_to === "both" ? ["assistant", "coding"] : [fields.applies_to];
/** Model calls one replay makes: each entry with the draft, and with the version it is compared with, plus one to judge. */
export const replayCalls = (w: Workshop) => consumersOf(w.fields).length * (w.draft.base ? 2 : 1) + 1;
/** The placeholders a copy of a general Skill still has, and those it has replaced. */
export function placeholdersOf(w: Workshop): string[] {
  if (w.draft.target.kind !== "custom" && !Object.keys(w.replacements).length) return [];
  const original = w.draft.base?.fields;
  const found = skillPlaceholders([original?.description ?? "", original?.when_not_to_use ?? "", original?.body ?? "", w.fields.description, w.fields.when_not_to_use, w.fields.body].join("\n"));
  return [...new Set([...Object.keys(w.replacements), ...found])];
}
const WORDING_KEYS = ["description", "when_not_to_use", "body"] as const;
const replaceAll = (text: string, pairs: ReadonlyArray<readonly [string, string]>): string => {
  const map = new Map<string, string>();
  for (const [from, to] of pairs) if (from && !map.has(from)) map.set(from, to);
  if (!map.size) return text;
  const pattern = new RegExp([...map.keys()].sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("|"), "gu");
  return text.replace(pattern, match => map.get(match) ?? match);
};
/** Every replaced placeholder written out in the fields: renders from a placeholder template so keystroke-by-keystroke typing never touches unrelated text. */
export function applyReplacements(w: Workshop, placeholder: string, value: string): void {
  if (!w.placeholderBase) {
    const inverse = Object.entries(w.replacements).filter(([, own]) => Boolean(own)).map(([ph, own]) => [own, ph] as const);
    w.placeholderBase = {
      description: replaceAll(w.fields.description, inverse),
      when_not_to_use: replaceAll(w.fields.when_not_to_use, inverse),
      body: replaceAll(w.fields.body, inverse),
    };
  }
  const trimmed = value.trim();
  if (trimmed) w.replacements[placeholder] = trimmed; else delete w.replacements[placeholder];
  const forward = Object.entries(w.replacements).filter(([, own]) => Boolean(own));
  for (const key of WORDING_KEYS) w.fields[key] = replaceAll(w.placeholderBase[key], forward);
}

export const failureOf = (cause: unknown) => cause as UiRequestFailure;
export const messageOf = (cause: unknown) => (cause as Error)?.message || String(cause);
export const fieldOf = (cause: unknown) => ((failureOf(cause).body as { details?: { field?: string } } | null)?.details?.field ?? "");
