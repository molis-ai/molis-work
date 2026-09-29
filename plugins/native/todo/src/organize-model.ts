import { instructed, type InstructedPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { TodoCandidate, TodoCandidateKind, TodoItem, TodoPlacement } from "@molis-ai/molis-work-contracts/modules/todo";
import { isTodoDate, isTodoTime } from "./dates.js";

/** A material as the caller hands it: text already read from its owner, with where it came from. */
export interface TodoOrganizeMaterial {
  readonly title: string;
  readonly text: string;
  readonly subject?: { readonly kind: string; readonly id: string } | null;
  readonly open?: { readonly surface: string; readonly id: string } | null;
  readonly received_at?: string | null;
  /** Set by a reader that could not read all of it. */
  readonly read?: "read" | "truncated" | "failed";
  readonly note?: string;
}

export type TodoCandidateDraft = Omit<TodoCandidate, "candidate_id" | "decision" | "selected"> & { readonly ref: string };

export interface TodoOrganizeParse {
  readonly candidates: TodoCandidateDraft[];
  readonly reference_only: { summary: string; material: number }[];
  /** Candidates dropped because their passage could not be found in the material. */
  readonly unverified: number;
}

/** One model call reads at most this much material; longer sets are read in parts. */
export const TODO_ORGANIZE_PART_CHARS = 24_000;
/** A single material is cut here; the batch says so. */
export const TODO_ORGANIZE_MATERIAL_CHARS = 60_000;

const KINDS: readonly TodoCandidateKind[] = ["request", "commitment", "waiting", "suggestion"];
const PLACEMENTS: readonly TodoPlacement[] = ["project", "personal", "unassigned"];
const RELATIONS = ["same", "update", "conflict", "maybe_done"] as const;
const CHANGE_FIELDS = ["title", "due_date", "due_time", "planned_date", "notes"] as const;

/** Letters and digits only, so a passage copied with different spacing or punctuation still matches. */
export function normalizeForMatch(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

/** Whether a passage really comes from the text: exactly, or at least most of its pieces in order-free form. */
export function passageFound(excerpt: string, text: string): boolean {
  const needle = normalizeForMatch(excerpt), hay = normalizeForMatch(text);
  if (needle.length < 2) return false;
  if (hay.includes(needle)) return true;
  if (needle.length < 12) return false;
  const pieces: string[] = [];
  for (let index = 0; index + 6 <= needle.length; index += 6) pieces.push(needle.slice(index, index + 6));
  return pieces.filter(piece => hay.includes(piece)).length / pieces.length >= 0.8;
}

/** Group materials so each model call stays within the part size; a long material gets a part of its own. */
export function organizeParts(materials: readonly TodoOrganizeMaterial[]): number[][] {
  const parts: number[][] = [];
  let current: number[] = [], size = 0;
  materials.forEach((material, index) => {
    if (material.read === "failed" || !material.text.trim()) return;
    const length = Math.min(material.text.length, TODO_ORGANIZE_MATERIAL_CHARS);
    if (current.length && size + length > TODO_ORGANIZE_PART_CHARS) { parts.push(current); current = []; size = 0; }
    current.push(index);
    size += length;
  });
  if (current.length) parts.push(current);
  return parts;
}

export function organizePrompt(instruction: InstructionPrompt, input: {
  materials: readonly TodoOrganizeMaterial[]; indexes: readonly number[]; existing: readonly TodoItem[]; today: string; request?: string;
}): InstructedPrompt {
  const data = {
    today: input.today,
    me: "你",
    request: input.request ?? "",
    materials: input.indexes.map(index => {
      const material = input.materials[index]!;
      return { material: index + 1, title: material.title, received_at: material.received_at ?? null, text: material.text.slice(0, TODO_ORGANIZE_MATERIAL_CHARS) };
    }),
    existing: input.existing.map(item => ({ id: item.id, title: item.title, status: item.status, due_date: item.due_date, planned_date: item.planned_date,
      waiting: item.waiting, edited_by_you: item.edited_fields })),
  };
  const boundary = crypto.randomUUID().replaceAll("-", "");
  return instructed(instruction, `BEGIN_${boundary}\n${JSON.stringify(data)}\nEND_${boundary}`);
}

const text = (value: unknown, max: number): string => typeof value === "string" ? value.replace(/\s+/gu, " ").trim().slice(0, max) : "";

/**
 * Keep only what the materials support: a passage that is really there, a due date only when its phrase is in the
 * passage's material, known todos only, edited fields protected. Everything else is dropped or marked uncertain.
 */
export function parseOrganizeOutput(raw: string, materials: readonly TodoOrganizeMaterial[], existing: ReadonlyMap<string, TodoItem>): TodoOrganizeParse {
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  let parsed: { candidates?: unknown; reference_only?: unknown };
  try { parsed = JSON.parse(json) as typeof parsed; }
  catch { throw new Error("整理结果不是有效 JSON"); }
  const candidates: TodoCandidateDraft[] = [];
  let unverified = 0;
  const rows = Array.isArray(parsed.candidates) ? parsed.candidates.slice(0, 80) : [];
  const refs = new Set<string>();
  for (const [position, row] of rows.entries()) {
    if (!row || typeof row !== "object") continue;
    const value = row as Record<string, any>;
    const kind = KINDS.includes(value.kind) ? value.kind as TodoCandidateKind : null;
    const title = text(value.title, 200);
    if (!kind || !title) continue;
    const evidence = (Array.isArray(value.evidence) ? value.evidence : []).flatMap((entry: any) => {
      const index = Number(entry?.material) - 1, excerpt = text(entry?.excerpt, 600);
      const material = materials[index];
      return material && excerpt && passageFound(excerpt, material.text) ? [{ material: index + 1, excerpt }] : [];
    }).slice(0, 5);
    if (!evidence.length) { unverified += 1; continue; }
    const uncertain = (Array.isArray(value.uncertain) ? value.uncertain : []).map((entry: unknown) => text(entry, 200)).filter(Boolean).slice(0, 6);
    const due = value.due && typeof value.due === "object" ? value.due : {};
    const phrase = text(due.phrase, 60) || null;
    const quoted = phrase !== null && evidence.some((entry: { material: number }) => normalizeForMatch(materials[entry.material - 1]!.text).includes(normalizeForMatch(phrase)));
    let dueDate = isTodoDate(due.date) ? due.date as string : null;
    let suggested = isTodoDate(value.suggested_date) ? value.suggested_date as string : null;
    if (dueDate && !quoted) {
      // A date the material does not state is at most a suggestion.
      suggested = suggested ?? dueDate;
      dueDate = null;
      uncertain.push("原文没有写明截止日期，这是推测的日期");
    }
    const owner = value.owner && typeof value.owner === "object" ? value.owner : {};
    const ownerWho = text(owner.who, 40) || (kind === "waiting" ? "" : "你");
    const ownerStated = owner.stated === true;
    if (!ownerStated && !uncertain.some((line: string) => line.includes("负责") || line.includes("谁"))) uncertain.push("原文没有写明由谁负责");
    const waiting = kind === "waiting" && value.waiting && typeof value.waiting === "object"
      ? { who: text(value.waiting.who, 80), what: text(value.waiting.what, 200) } : kind === "waiting" ? { who: ownerWho, what: title } : null;
    let existingLink: TodoCandidateDraft["existing"] = null;
    const match = value.existing && typeof value.existing === "object" ? value.existing : null;
    const item = match && typeof match.id === "string" ? existing.get(match.id) : undefined;
    if (item && RELATIONS.includes(match.relation)) {
      const changes: Record<string, string | null> = {};
      const protectedFields: { field: (typeof CHANGE_FIELDS)[number]; value: string | null }[] = [];
      for (const field of CHANGE_FIELDS) {
        if (!match.changes || !(field in match.changes)) continue;
        const next = match.changes[field];
        const valid = next === null || (field.endsWith("date") ? isTodoDate(next) : field === "due_time" ? isTodoTime(next) : typeof next === "string" && next.trim().length > 0);
        if (!valid || JSON.stringify(item[field]) === JSON.stringify(next)) continue;
        // A due date the material does not state never overwrites; a field the person edited is theirs.
        if (field === "due_date" && !(phrase && quoted)) continue;
        if ((item.edited_fields as readonly string[]).includes(field)) protectedFields.push({ field, value: next as string | null });
        else changes[field] = next as string | null;
      }
      const closed = item.status === "done" || item.status === "cancelled";
      let relation = match.relation as NonNullable<TodoCandidateDraft["existing"]>["relation"];
      if (relation === "update" && !Object.keys(changes).length) relation = protectedFields.length ? "conflict" : "same";
      if (closed && relation !== "maybe_done") relation = Object.keys(changes).length ? "reopen" : "same";
      existingLink = { item_id: item.id, title: item.title, relation, changes, protected: protectedFields, reason: text(match.reason, 300) };
    }
    const ref = text(value.ref, 20) || `c${position + 1}`;
    if (refs.has(ref)) continue;
    refs.add(ref);
    candidates.push({
      ref, kind, title, why: text(value.why, 500), owner: { value: ownerWho, stated: ownerStated },
      due_date: dueDate, due_time: dueDate && isTodoTime(due.time) ? due.time as string : null, due_phrase: phrase,
      suggested_date: suggested, topic: text(value.topic, 80) || null,
      placement: PLACEMENTS.includes(value.placement) ? value.placement as TodoPlacement : "unassigned",
      waiting, evidence, uncertain, depends_on: (Array.isArray(value.depends_on) ? value.depends_on : []).map((entry: unknown) => text(entry, 20)).filter(Boolean),
      existing: existingLink,
    });
  }
  const known = new Set(candidates.map(candidate => candidate.ref));
  const cleaned = candidates.map(candidate => ({ ...candidate, depends_on: candidate.depends_on.filter(ref => known.has(ref) && ref !== candidate.ref) }));
  const reference_only = (Array.isArray(parsed.reference_only) ? parsed.reference_only : []).flatMap((entry: any) => {
    const summary = text(entry?.summary, 200), index = Number(entry?.material);
    return summary && Number.isInteger(index) && index >= 1 && index <= materials.length ? [{ summary, material: index }] : [];
  }).slice(0, 40);
  return { candidates: cleaned, reference_only, unverified };
}
