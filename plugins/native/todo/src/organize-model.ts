import { instructed, type InstructedPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { TodoCandidate, TodoCandidateKind, TodoItem, TodoPlacement } from "@molis-ai/molis-work-contracts/modules/todo";
import { isTodoDate, isTodoTime, localDate } from "./dates.js";
import { parseTodoQuickText } from "./quick-parse.js";

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
export const TODO_ORGANIZE_PART_CHARS = 40_000;
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

const ABSOLUTE_DATE = /\d{1,2}月\d{1,2}[日号]|\d{4}-\d{1,2}-\d{1,2}/u;

/**
 * Read a date phrase the material wrote against when the material was written, without the model: the model's
 * arithmetic is not trusted for "周四" or "下周一". Returns null when the phrase is not a date this reader knows.
 * `ambiguous` says why the reading cannot be taken as the due date (no time on the material, "下周X" said on a Sunday).
 */
export function readDatePhrase(phrase: string, receivedAt: string | null | undefined, today: string): { date: string; time: string | null; ambiguous: string | null } | null {
  const received = wallClock(receivedAt);
  const absolute = ABSOLUTE_DATE.test(phrase);
  const anchor = received ?? new Date(`${today}T12:00:00`);
  const part = parseTodoQuickText(phrase, anchor).parts[0];
  if (!part) return null;
  let ambiguous: string | null = null;
  if (!absolute && !received) ambiguous = `材料没有写时间，“${phrase}”按今天算是 ${part.date}`;
  else if (!absolute && anchor.getDay() === 0 && /下下?周|下星期|下礼拜/u.test(phrase)) ambiguous = `“${phrase}”是周日说的，可能指 ${part.date}，也可能再晚一周`;
  return { date: part.date, time: part.time, ambiguous };
}

/**
 * The writer's own wall clock: "今天" in a mail sent 2026-09-28 10:05+08:00 is the 28th wherever it is read.
 * The written date and time are taken as they are, without converting to this computer's time zone.
 */
function wallClock(value: string | null | undefined): Date | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  const written = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/u.exec(value.trim());
  return written ? new Date(Number(written[1]), Number(written[2]) - 1, Number(written[3]), Number(written[4] ?? 12), Number(written[5] ?? 0)) : new Date(value);
}

const STAMP = /(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?(?:[T\s]*(\d{1,2})[:：](\d{2}))?/gu;

/**
 * When the words were written: the nearest time written before the phrase (a chat line's stamp, a mail header), else the
 * material's own time, else the first date written near its top. Only times that are in the material count.
 */
export function phraseWrittenAt(material: Pick<TodoOrganizeMaterial, "text" | "received_at">, phrase: string): string | null {
  const at = material.text.indexOf(phrase);
  const stamp = (match: RegExpMatchArray) => `${match[1]}-${match[2]!.padStart(2, "0")}-${match[3]!.padStart(2, "0")}T${(match[4] ?? "12").padStart(2, "0")}:${match[5] ?? "00"}`;
  if (at >= 0) {
    const before = [...material.text.slice(0, at).matchAll(STAMP)].at(-1);
    if (before) return stamp(before);
  }
  if (material.received_at) return material.received_at;
  const top = [...material.text.slice(0, 400).matchAll(STAMP)][0];
  return top ? stamp(top) : null;
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
  materials: readonly TodoOrganizeMaterial[]; indexes: readonly number[]; existing: readonly TodoItem[]; today: string; request?: string; me?: readonly string[];
}): InstructedPrompt {
  const data = {
    today: input.today,
    me: ["你", ...(input.me ?? [])],
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

/** The organizing JSON inside a model reply that may carry fences, notes or reasoning around it. */
export function organizeJson(raw: string): { candidates?: unknown; reference_only?: unknown } {
  const whole = raw.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
  try { const value = JSON.parse(whole); if (value && typeof value === "object") return value; } catch { /* look inside */ }
  for (let start = raw.indexOf("{"); start >= 0; start = raw.indexOf("{", start + 1)) {
    let depth = 0, quoted = false, escaped = false;
    for (let index = start; index < raw.length; index += 1) {
      const char = raw[index]!;
      if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === "\"") quoted = false; continue; }
      if (char === "\"") quoted = true;
      else if (char === "{") depth += 1;
      else if (char === "}" && --depth === 0) {
        try {
          const value = JSON.parse(raw.slice(start, index + 1));
          if (value && typeof value === "object" && "candidates" in value) return value;
        } catch { /* not this one */ }
        break;
      }
    }
  }
  throw new Error("整理结果不是有效 JSON");
}

const text = (value: unknown, max: number): string => typeof value === "string" ? value.replace(/\s+/gu, " ").trim().slice(0, max) : "";

/**
 * Keep only what the materials support: a passage that is really there, a due date only when its phrase is in the
 * passage's material, known todos only, edited fields protected. Everything else is dropped or marked uncertain.
 */
export function parseOrganizeOutput(raw: string, materials: readonly TodoOrganizeMaterial[], existing: ReadonlyMap<string, TodoItem>, today: string = localDate()): TodoOrganizeParse {
  const parsed = organizeJson(raw);
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
    let dueTime = isTodoTime(due.time) ? due.time as string : null;
    let suggested = isTodoDate(value.suggested_date) ? value.suggested_date as string : null;
    if (phrase && quoted) {
      // The phrase decides the date, read against the material it came from; the model's own arithmetic does not.
      // Every evidence material that uses the phrase reads it against its own time; if they disagree, it is ambiguous.
      const sources = [...new Set(evidence.map((entry: { material: number }) => entry.material))].map(index => materials[index - 1]!)
        .filter((material: TodoOrganizeMaterial) => normalizeForMatch(material.text).includes(normalizeForMatch(phrase)));
      const readings = sources.map((material: TodoOrganizeMaterial) => readDatePhrase(phrase, phraseWrittenAt(material, phrase), today)).filter(Boolean) as NonNullable<ReturnType<typeof readDatePhrase>>[];
      const dates = [...new Set(readings.map(entry => entry.date))];
      const reading = dates.length > 1
        ? { ...readings.at(-1)!, ambiguous: `不同材料里的“${phrase}”对应不同日期（${dates.join("、")}），请确认` }
        : readings[0] ?? null;
      if (reading?.ambiguous) {
        suggested = reading.date;
        dueDate = null;
        dueTime = null;
        uncertain.push(reading.ambiguous);
      } else if (reading) {
        dueDate = reading.date;
        dueTime = reading.time ?? (dueTime && dueDate === due.date ? dueTime : null);
      } else if (dueDate) {
        // A phrase no rule can turn into a day ("这周", "月中") does not become a due date on the model's word.
        suggested = suggested ?? dueDate;
        dueDate = null;
        dueTime = null;
        uncertain.push(`“${phrase}”没有写具体哪天，${suggested} 只是估计`);
      }
    }
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
      // A due date the material states and the todo does not match is a change, whatever relation the model named.
      if (dueDate && item.due_date !== dueDate && !("due_date" in changes) && !protectedFields.some(entry => entry.field === "due_date")) {
        if ((item.edited_fields as readonly string[]).includes("due_date")) protectedFields.push({ field: "due_date", value: dueDate });
        else changes.due_date = dueDate;
      }
      const closed = item.status === "done" || item.status === "cancelled";
      let relation = match.relation as NonNullable<TodoCandidateDraft["existing"]>["relation"];
      if (relation === "update" && !Object.keys(changes).length) relation = protectedFields.length ? "conflict" : "same";
      if (relation === "same" && Object.keys(changes).length) relation = "update";
      if (relation === "same" && protectedFields.length) relation = "conflict";
      if (closed && relation !== "maybe_done") relation = Object.keys(changes).length ? "reopen" : "same";
      existingLink = { item_id: item.id, title: item.title, relation, changes, protected: protectedFields, reason: text(match.reason, 300) };
    }
    const ref = text(value.ref, 20) || `c${position + 1}`;
    if (refs.has(ref)) continue;
    refs.add(ref);
    candidates.push({
      ref, kind, title, why: text(value.why, 500), owner: { value: ownerWho, stated: ownerStated },
      due_date: dueDate, due_time: dueDate ? dueTime : null, due_phrase: phrase,
      suggested_date: suggested, topic: text(value.topic, 80) || null,
      placement: PLACEMENTS.includes(value.placement) ? value.placement as TodoPlacement : "unassigned",
      waiting, evidence, uncertain, depends_on: (Array.isArray(value.depends_on) ? value.depends_on : []).map((entry: unknown) => text(entry, 20)).filter(Boolean),
      existing: existingLink,
    });
  }
  // Two candidates about the same existing todo (an update, and a “same” suggestion saying the same thing) are one
  // thing for the person to decide: keep the one that says what changes, and fold the other's evidence into it.
  const RANK: Record<NonNullable<TodoCandidateDraft["existing"]>["relation"], number> = { conflict: 5, update: 4, reopen: 3, maybe_done: 2, same: 1 };
  const keptFor = new Map<string, TodoCandidateDraft>(), alias = new Map<string, string>();
  const folded: TodoCandidateDraft[] = [];
  for (const candidate of candidates) {
    const itemId = candidate.existing?.item_id;
    const kept = itemId ? keptFor.get(itemId) : undefined;
    if (!itemId || !kept) { if (itemId) keptFor.set(itemId, candidate); folded.push(candidate); continue; }
    const [stronger, weaker] = RANK[candidate.existing!.relation] > RANK[kept.existing!.relation] ? [candidate, kept] : [kept, candidate];
    const combined: TodoCandidateDraft = { ...stronger,
      evidence: [...stronger.evidence, ...weaker.evidence.filter(entry => !stronger.evidence.some(own => own.material === entry.material && own.excerpt === entry.excerpt))].slice(0, 5),
      uncertain: [...new Set([...stronger.uncertain, ...weaker.uncertain])] };
    folded[folded.indexOf(kept)] = combined;
    keptFor.set(itemId, combined);
    alias.set(weaker.ref, combined.ref);
  }
  const known = new Set(folded.map(candidate => candidate.ref));
  const cleaned = folded.map(candidate => ({ ...candidate,
    depends_on: [...new Set(candidate.depends_on.map(ref => alias.get(ref) ?? ref))].filter(ref => known.has(ref) && ref !== candidate.ref) }));
  const reference_only = (Array.isArray(parsed.reference_only) ? parsed.reference_only : []).flatMap((entry: any) => {
    const summary = text(entry?.summary, 200), index = Number(entry?.material);
    return summary && Number.isInteger(index) && index >= 1 && index <= materials.length ? [{ summary, material: index }] : [];
  }).slice(0, 40);
  return { candidates: cleaned, reference_only, unverified };
}
