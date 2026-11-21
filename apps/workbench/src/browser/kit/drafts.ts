import { skillScenes } from "./scenes.js";
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
  /** Segmented wording fields tracking each placeholder slot's rendered span, so manual edits, duplicate values, and literal collisions never lose slots. */
  placeholderBase?: Partial<Record<WordingKey, PlaceholderSegment[]>>;
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
export const consumersOf = (fields: Fields): SkillTrialConsumer[] => fields.applies_to === "both" ? ["assistant", ...skillScenes().map(row => row.scene)] : [fields.applies_to];
/** Model calls one replay makes: each entry with the draft, and with the version it is compared with, plus one to judge. */
export const replayCalls = (w: Workshop) => consumersOf(w.fields).length * (w.draft.base ? 2 : 1) + 1;
/** The placeholders a copy of a general Skill still has, and those it has replaced. */
export function placeholdersOf(w: Workshop): string[] {
  if (w.draft.target.kind !== "custom" && !Object.keys(w.replacements).length) return [];
  const original = w.draft.base?.fields;
  const textOf = (key: WordingKey) => w.placeholderBase?.[key] ? templateOf(w.placeholderBase[key]!) : w.fields[key];
  const found = skillPlaceholders([original?.description ?? "", original?.when_not_to_use ?? "", original?.body ?? "", textOf("description"), textOf("when_not_to_use"), textOf("body")].join("\n"));
  return [...new Set([...Object.keys(w.replacements), ...found])];
}
const WORDING_KEYS = ["description", "when_not_to_use", "body"] as const;
export type WordingKey = (typeof WORDING_KEYS)[number];
export interface PlaceholderSegment { text: string; placeholder?: string }

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const templateOf = (segments: readonly PlaceholderSegment[]) => segments.map(seg => seg.placeholder ?? seg.text).join("");
const renderedOf = (segments: readonly PlaceholderSegment[]) => segments.map(seg => seg.text).join("");

function compactSegments(segments: readonly PlaceholderSegment[]): PlaceholderSegment[] {
  const out: PlaceholderSegment[] = [];
  for (const seg of segments) {
    if (!seg.text) continue;
    const prev = out.at(-1);
    if (!seg.placeholder && prev && !prev.placeholder) prev.text += seg.text;
    else out.push({ ...seg });
  }
  return out;
}

function tokenizeTemplate(template: string, placeholders: readonly string[], replacements: Readonly<Record<string, string>>): PlaceholderSegment[] {
  if (!template) return [];
  const unique = [...new Set(placeholders.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!unique.length) return [{ text: template }];
  const pattern = new RegExp(unique.map(escapeRegExp).join("|"), "gu");
  const out: PlaceholderSegment[] = [];
  let last = 0;
  for (const match of template.matchAll(pattern)) {
    const index = match.index!;
    if (index > last) out.push({ text: template.slice(last, index) });
    const ph = match[0];
    out.push({ text: replacements[ph] || ph, placeholder: ph });
    last = index + ph.length;
  }
  if (last < template.length) out.push({ text: template.slice(last) });
  return out;
}

function reconstructInverse(text: string, placeholders: readonly string[], replacements: Readonly<Record<string, string>>): PlaceholderSegment[] {
  if (!text) return [];
  const tokenToPlaceholders = new Map<string, string[]>();
  const add = (token: string, ph: string) => {
    if (!token) return;
    const list = tokenToPlaceholders.get(token);
    if (list) {
      if (!list.includes(ph)) list.push(ph);
    } else {
      tokenToPlaceholders.set(token, [ph]);
    }
  };
  // Unreplaced placeholders keep their own slot first so a shorter replacement (e.g. "工具") never slices inside "~~项目管理工具".
  for (const ph of placeholders) if (!replacements[ph]) add(ph, ph);
  for (const [ph, own] of Object.entries(replacements)) if (own) add(own, ph);
  if (!tokenToPlaceholders.size) return [{ text }];
  const pattern = new RegExp([...tokenToPlaceholders.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|"), "gu");
  const seen = new Map<string, number>();
  const out: PlaceholderSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index!;
    if (index > last) out.push({ text: text.slice(last, index) });
    const found = match[0];
    const candidates = tokenToPlaceholders.get(found)!;
    const occurrence = seen.get(found) ?? 0;
    seen.set(found, occurrence + 1);
    out.push({ text: found, placeholder: candidates[Math.min(occurrence, candidates.length - 1)]! });
    last = index + found.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

function projectEdit(segments: readonly PlaceholderSegment[], next: string): PlaceholderSegment[] {
  const prev = renderedOf(segments);
  if (next === prev) return segments.map(seg => ({ ...seg }));
  const minLen = Math.min(prev.length, next.length);
  let prefix = 0;
  while (prefix < minLen && prev.charCodeAt(prefix) === next.charCodeAt(prefix)) prefix++;
  let suffix = 0;
  while (suffix < minLen - prefix && prev.charCodeAt(prev.length - 1 - suffix) === next.charCodeAt(next.length - 1 - suffix)) suffix++;
  let delStart = prefix;
  let delEnd = prev.length - suffix;
  let inserted = next.slice(prefix, next.length - suffix);
  // Shift a pure insertion/deletion that landed inside a placeholder span due to greedy prefix matching back to its boundary when valid.
  if (delStart === delEnd || inserted.length === 0) {
    let pos = 0;
    for (const seg of segments) {
      const start = pos, end = pos + seg.text.length;
      pos = end;
      if (!seg.placeholder) continue;
      if (delStart === delEnd && start < delStart && delStart < end) {
        if (next.slice(start + inserted.length, end + inserted.length) === seg.text) {
          delStart = start;
          delEnd = start;
          inserted = next.slice(start, start + inserted.length);
          break;
        }
      } else if (inserted.length === 0 && start <= delStart && delStart < end && delEnd <= end) {
        const removed = delEnd - delStart;
        if (start >= removed && prev.slice(0, start - removed) + prev.slice(start) === next) {
          delStart = start - removed;
          delEnd = start;
          break;
        }
      }
    }
  }
  const out: PlaceholderSegment[] = [];
  let pos = 0;
  let emitted = false;
  const emitInserted = () => {
    if (emitted) return;
    emitted = true;
    if (inserted) out.push({ text: inserted });
  };
  for (const seg of segments) {
    const start = pos, end = pos + seg.text.length;
    pos = end;
    if (end <= delStart) {
      out.push({ ...seg });
      continue;
    }
    if (start >= delEnd) {
      emitInserted();
      out.push({ ...seg });
      continue;
    }
    const left = seg.text.slice(0, Math.max(0, delStart - start));
    const right = seg.text.slice(Math.min(seg.text.length, delEnd - start));
    if (left) out.push({ text: left });
    emitInserted();
    if (right) out.push({ text: right });
  }
  emitInserted();
  return compactSegments(out);
}

function reconstructFromOrigin(
  origin: string | undefined,
  current: string,
  placeholders: readonly string[],
  replacements: Readonly<Record<string, string>>,
): PlaceholderSegment[] {
  if (!current) return [];
  if (!origin) return reconstructInverse(current, placeholders, replacements);
  const origSegs = tokenizeTemplate(origin, placeholders, replacements);
  if (!origSegs.some(seg => seg.placeholder)) return reconstructInverse(current, placeholders, replacements);
  if (renderedOf(origSegs) === current) return origSegs;
  const origLines = origin.split("\n").map(line => {
    const segs = tokenizeTemplate(line, placeholders, replacements);
    return { segs, rendered: renderedOf(segs), hasSlot: segs.some(seg => seg.placeholder) };
  });
  const curLines = current.split("\n");
  const out: PlaceholderSegment[] = [];
  let cursor = 0;
  for (let i = 0; i < curLines.length; i++) {
    if (i > 0) out.push({ text: "\n" });
    const line = curLines[i]!;
    let matched: PlaceholderSegment[] | undefined;
    for (let j = cursor; j < origLines.length; j++) {
      if (origLines[j]!.rendered === line) {
        matched = origLines[j]!.segs.map(seg => ({ ...seg }));
        cursor = j + 1;
        break;
      }
    }
    if (!matched) {
      for (let j = cursor; j < origLines.length; j++) {
        if (!origLines[j]!.hasSlot) continue;
        const projected = projectEdit(origLines[j]!.segs, line);
        if (projected.some(seg => seg.placeholder)) {
          matched = projected;
          cursor = j + 1;
          break;
        }
      }
    }
    out.push(...(matched ?? reconstructInverse(line, placeholders, replacements)));
  }
  return compactSegments(out);
}

function renderSegments(segments: readonly PlaceholderSegment[], placeholders: readonly string[], replacements: Readonly<Record<string, string>>): PlaceholderSegment[] {
  const out: PlaceholderSegment[] = [];
  for (const seg of segments) {
    if (seg.placeholder) {
      out.push({ text: replacements[seg.placeholder] || seg.placeholder, placeholder: seg.placeholder });
    } else {
      out.push(...tokenizeTemplate(seg.text, placeholders, replacements));
    }
  }
  return compactSegments(out);
}

/** Keeps tracked placeholder slots aligned when the person edits a wording field directly. */
export function syncPlaceholderField(w: Workshop, key: WordingKey, nextValue: string): void {
  const current = w.placeholderBase?.[key];
  if (current) {
    w.placeholderBase![key] = projectEdit(current, nextValue);
    return;
  }
  if (Object.keys(w.replacements).length) {
    const base = w.placeholderBase ??= {};
    const initial = reconstructFromOrigin(w.draft.base?.fields[key], w.fields[key], placeholdersOf(w), w.replacements);
    base[key] = projectEdit(initial, nextValue);
  }
}

/** Every replaced placeholder written out in the fields: renders from tracked placeholder segments so keystroke-by-keystroke typing, duplicate values, and literal collisions never drop slots or rewrite unrelated text. */
export function applyReplacements(w: Workshop, placeholder: string, value: string): void {
  const base = w.placeholderBase ??= {};
  const allPlaceholders = placeholdersOf(w);
  for (const key of WORDING_KEYS) {
    if (!base[key]) {
      base[key] = reconstructFromOrigin(w.draft.base?.fields[key], w.fields[key], allPlaceholders, w.replacements);
    } else if (renderedOf(base[key]!) !== w.fields[key]) {
      base[key] = projectEdit(base[key]!, w.fields[key]);
    }
  }
  const trimmed = value.trim();
  if (trimmed) w.replacements[placeholder] = trimmed;
  else delete w.replacements[placeholder];
  const nextPlaceholders = placeholdersOf(w);
  for (const key of WORDING_KEYS) {
    const rendered = renderSegments(base[key]!, nextPlaceholders, w.replacements);
    base[key] = rendered;
    w.fields[key] = renderedOf(rendered);
  }
}

export const failureOf = (cause: unknown) => cause as UiRequestFailure;
export const messageOf = (cause: unknown) => (cause as Error)?.message || String(cause);
export const fieldOf = (cause: unknown) => ((failureOf(cause).body as { details?: { field?: string } } | null)?.details?.field ?? "");
