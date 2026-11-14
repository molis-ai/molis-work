import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import { IM_MESSAGE_SUBJECT_LIMIT } from "@molis-ai/molis-work-contracts/services/im";
import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { ImError, textInput } from "./errors.js";

function invalidSubjects() { return new ImError("im.invalid_subjects", "每条消息最多可引用八个对象，请检查引用"); }

export function messageSubjects(value: unknown): ActionSubject[] {
  if (!Array.isArray(value) || value.length > IM_MESSAGE_SUBJECT_LIMIT) throw invalidSubjects();
  const result: ActionSubject[] = [];
  const seen = new Set<string>();
  for (const reference of value) {
    if (!isRecord(reference) || Object.keys(reference).length !== 2
      || !validIdentity(reference.kind, 200) || !validIdentity(reference.id, 512)) throw invalidSubjects();
    const { kind, id } = reference, key = JSON.stringify([kind, id]);
    if (!seen.has(key)) { seen.add(key); result.push({ kind, id }); }
  }
  return result;
}

const validIdentity = (value: unknown, limit: number): value is string =>
  typeof value === "string" && value.length <= limit && value.trim().length > 0 && !value.includes("\u0000");

export function messageBody(value: unknown, subjects: readonly ActionSubject[], label: string): string {
  if (subjects.length && typeof value === "string" && !value.trim() && value.length <= 12_000) return "";
  return textInput(value, label, 12_000);
}
