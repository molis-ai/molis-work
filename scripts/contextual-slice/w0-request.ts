import type { CreateTarget, Draft, HandKind, Placement } from "./w0-model.js";

const TARGETS: readonly CreateTarget[] = ["todo", "pages", "shelf", "goal", "spark"];
const KINDS: readonly HandKind[] = ["quote", "checklist", "note", "spark", "file", "web", "message", "selection"];

function invalid(): never { throw Object.assign(new Error("预览请求格式无效"), { status: 400 }); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 20_000): string {
  if (typeof value !== "string" || value.length > max) return invalid();
  return value;
}
function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return invalid();
  return value;
}
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : invalid();
}
export function requestId(value: unknown): string { const id = text(value, 100); return id.trim() ? id : invalid(); }
export function readCreate(input: Record<string, unknown>): { requestId: string; target: CreateTarget; draft: Draft; replaceId?: string } {
  const draft = object(input.draft);
  return { requestId: requestId(input.requestId), target: oneOf(input.target, TARGETS),
    draft: { title: text(draft.title, 200), text: text(draft.text), instruction: text(draft.instruction, 2000) },
    ...(input.replaceId === undefined ? {} : { replaceId: text(input.replaceId, 100) }) };
}
export function readPlacement(input: Record<string, unknown>): { requestId: string; placement: Placement } {
  const value = object(input.placement), hand = object(value.hand), landing = object(value.landing);
  return { requestId: requestId(input.requestId), placement: {
    hand: { id: text(hand.id, 200), title: text(hand.title, 200), text: text(hand.text), place: oneOf(hand.place, ["main", "side", "assistant"] as const),
      kind: oneOf(hand.kind, KINDS), source: text(hand.source, 60) },
    text: text(value.text), format: oneOf(value.format, ["text", "quote"] as const),
    landing: { documentId: text(landing.documentId, 200), label: text(landing.label, 200), detail: text(landing.detail, 400),
      position: oneOf(landing.position, ["cursor", "selection", "end"] as const),
      version: integer(landing.version), revision: integer(landing.revision), from: integer(landing.from), to: integer(landing.to) },
  } };
}
