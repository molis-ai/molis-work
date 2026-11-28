import { textRefProblems } from "@molis-ai/molis-work-plugin-sdk/ui";
import { SUBJECT_CONTEXT_OUTPUT_SCHEMA } from "@molis-ai/molis-work-contracts/platform/actions";
import { workBriefErrors } from "./error.js";
import { BRIEF_LIMITS } from "./model.js";

export function requireBriefSync(value: unknown): asserts value {
  if (!value) throw workBriefErrors.invalid("简报同步内容不合法");
}

export function object(value: unknown, required: readonly string[] = [], optional?: readonly string[]): Record<string, unknown> {
  requireBriefSync(value && typeof value === "object" && !Array.isArray(value));
  requireBriefSync(required.every(key => Object.hasOwn(value, key)));
  if (optional) requireBriefSync(Object.keys(value).every(key => required.includes(key) || optional.includes(key)));
  return value as Record<string, unknown>;
}

export function parse(value: unknown): unknown {
  requireBriefSync(typeof value === "string");
  try { return JSON.parse(value); } catch { throw workBriefErrors.invalid("简报同步 JSON 不合法"); }
}

export function text(value: unknown, maximum: number): value is string {
  return typeof value === "string" && [...value].length <= maximum;
}

export function id(value: unknown): value is string {
  return text(value, BRIEF_LIMITS.id) && identifier(value);
}

const identifier = (value: unknown): value is string => typeof value === "string" && !!value && !/^(?:[\\/]|[a-z]:[\\/]|file:)/iu.test(value);

export const version = (value: unknown, minimum = 1) => Number.isSafeInteger(value) && Number(value) >= minimum;
export const stamp = (value: unknown) => text(value, 40) && Number.isFinite(Date.parse(value));

export function list(value: unknown, maximum: number): unknown[] {
  requireBriefSync(Array.isArray(value) && value.length <= maximum);
  return value;
}

function subject(value: unknown): void {
  const { kind, id: subjectId } = object(value, ["kind", "id"], []);
  requireBriefSync(identifier(kind) && identifier(subjectId));
}

export function checkProducer(value: unknown): void {
  const producer = object(value, ["kind"], ["subject"]);
  if (producer.kind === "task") subject(producer.subject);
  else requireBriefSync((producer.kind === "assistant" || producer.kind === "person") && producer.subject === undefined);
}

export function portableBody(raw: unknown, fromLocal: boolean): string {
  const body = object(parse(raw), ["sources", "claims", "attention", "next"], []);
  for (const value of list(body.sources, BRIEF_LIMITS.sources)) {
    const row = object(value, ["plugin_id", "name", "read", "subjects", "turn"], ["read_at", "summary"]);
    requireBriefSync(id(row.plugin_id) && ["ok", "stale", "unreadable", "unauthorized", "none"].includes(String(row.read))
      && ["idle", "moving", "waiting", "blocked"].includes(String(row.turn)) && (row.read_at === undefined || stamp(row.read_at)));
    requireBriefSync(textRefProblems(row.name, { owned: true }).length === 0
      && (row.summary === undefined || textRefProblems(row.summary, { owned: true }).length === 0));
    for (const reference of list(row.subjects, 10_000)) subject(reference);
  }
  for (const value of list(body.claims, BRIEF_LIMITS.claims)) {
    const row = object(value, ["claim_id", "text", "cites"], ["supplied_by", "edited"]);
    requireBriefSync(id(row.claim_id) && text(row.text, BRIEF_LIMITS.claim_text) && (row.supplied_by === undefined || row.supplied_by === "owner")
      && (row.edited === undefined || row.edited === true));
    for (const item of list(row.cites, BRIEF_LIMITS.cites)) {
      const cite = object(item, ["subject", "owner_plugin_id", "revision", "title", "read_at"], ["gap"]);
      subject(cite.subject);
      requireBriefSync(text(cite.owner_plugin_id, 200) && (cite.revision === "" || identifier(cite.revision))
        && text(cite.title, SUBJECT_CONTEXT_OUTPUT_SCHEMA.properties.title.maxLength) && stamp(cite.read_at)
        && (cite.gap === undefined || ["changed", "gone", "unreadable"].includes(String(cite.gap))));
    }
  }
  for (const value of list(body.attention, BRIEF_LIMITS.attention)) {
    const row = object(value, ["item_id", "subject", "owner_plugin_id", "why"], ["blocked"]);
    subject(row.subject);
    requireBriefSync(identifier(row.item_id) && id(row.owner_plugin_id) && text(row.why, BRIEF_LIMITS.why) && (row.blocked === undefined || row.blocked === true));
  }
  for (const value of list(body.next, BRIEF_LIMITS.next)) {
    const row = object(value, ["option_id", "text", "why", "act"], ["subject"]);
    requireBriefSync(id(row.option_id) && text(row.text, BRIEF_LIMITS.next_text) && text(row.why, BRIEF_LIMITS.why));
    if (row.subject !== undefined) subject(row.subject);
    if (fromLocal) row.act = { kind: "assistant" };
    else requireBriefSync(object(row.act, ["kind"], []).kind === "assistant");
  }
  return JSON.stringify(body);
}
