import { actionEffect, actionFieldInput, actionFieldValue, type ActionSubjectContext, type ActionView, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentActionOffer } from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * Action cards (specs/ai-interaction-experience H2, D26): a suggestion the person runs with one click, exactly as shown,
 * or dismisses. These are the rules every keeper of cards runs by, kept once: the Assistant keeps its cards, Coding keeps
 * its own, each behind the two ports below. Nothing here stores anything or calls anything but the ports.
 */
export type ActionCardStatus = "ready" | "needs-input" | "running" | "done" | "failed" | "unknown" | "stale" | "dismissed";

export interface ActionCard {
  card_id: string;
  revision: number;
  title: string;
  summary: string;
  provider: string;
  capability_title: string;
  effect: "read" | "write" | "irreversible";
  reference: ExactActionReference;
  input: unknown;
  input_schema: Record<string, unknown>;
  editable: string[];
  missing: Array<{ field: string; question: string }>;
  status: ActionCardStatus;
  outcome?: string;
  /** Set when the person clicked; the one execution this card may have. */
  request_id?: string;
  /** The object the card would change, as it was when suggested; a card whose object moved on is no longer offered. */
  target?: { kind: string; id: string; revision: string; title: string };
  created_at: string;
  updated_at: string;
}

/** Where cards are kept. `update` writes only when the card is still at `expected`, and throws otherwise: that is the claim. */
export interface CardStore<Card extends ActionCard = ActionCard> {
  update(card: Card, expected: number, patch: Partial<ActionCard>): Card;
}

/** What a card runs with: the actions offered to its keeper now, checked and invoked as dispatch does. */
export interface CardAuthority {
  discover(): Promise<readonly ActionView[]>;
  /** Throws when `input` is not what the action takes; runs nothing. */
  check(view: ActionView, input: unknown): void | Promise<void>;
  invoke(reference: ExactActionReference, input: unknown): Promise<unknown>;
}

/** Why a card refused, for its keeper to name in its own error codes. */
export type ActionCardRefusal = "revoked" | "invalid" | "conflict";

export interface ActionCardPorts<Card extends ActionCard = ActionCard> {
  readonly store: CardStore<Card>;
  /** Resolved only when a card is about to run; it may itself refuse (nothing to run with here). */
  authority(): Promise<CardAuthority>;
  /** The object as its owner reads it now; `"missing"` when it is gone. */
  readSubject(subject: { kind: string; id: string }): Promise<ActionSubjectContext | "missing" | null>;
  now(): Date;
  /** IANA zone the person works in, so a card's "today" is theirs. */
  readonly timeZone?: string;
  refuse(reason: ActionCardRefusal, message: string): Error;
  /** Told after the action returned; true when it started work still going on (the card then shows it running). */
  started?(view: ActionView, output: unknown, card: Card): Promise<boolean>;
}

type Schema = { type?: unknown; oneOf?: unknown; anyOf?: unknown; properties?: Record<string, Schema> };
const plainObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value) && (value as { type?: unknown }).type !== "doc";
const allowsNull = (declared: unknown): boolean => {
  if (!declared || typeof declared !== "object") return false;
  const schema = declared as Schema;
  if (schema.type === "null" || Array.isArray(schema.type) && schema.type.includes("null")) return true;
  return ([schema.oneOf, schema.anyOf].find(Array.isArray) as unknown[] | undefined)?.some(allowsNull) ?? false;
};
const sameAction = (view: ActionView, ref: ExactActionReference) => view.capability_id === ref.capability_id && view.version === ref.version && view.provider.provider_id === ref.provider_id;

/**
 * The one object a suggested change is about, when its action names a single kind and its input points at one:
 * `<kind>_id`, `subject_id` or `id` (the convention for change actions on an existing object).
 */
export function cardSubject(view: Pick<ActionView, "action" | "operation">, input: unknown): { kind: string; id: string } | null {
  if (view.operation !== "command" || view.action.subject_kinds.length !== 1 || !input || typeof input !== "object" || Array.isArray(input)) return null;
  const kind = view.action.subject_kinds[0]!, record = input as Record<string, unknown>;
  for (const key of [`${kind.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase()}_id`, "subject_id", "id"]) {
    const value = record[key];
    if (typeof value === "string" && value) return { kind, id: value };
  }
  return null;
}

/**
 * A suggestion checked against the actions offered now and made a card: the exact capability it names, its input valid
 * unless fields are still missing, and the object it would change as that object reads now. Nothing runs.
 */
export async function draftActionCard(cardId: string, offer: AgentActionOffer, views: readonly ActionView[],
  ports: Pick<ActionCardPorts, "readSubject" | "now" | "refuse"> & Pick<CardAuthority, "check">): Promise<ActionCard> {
  const view = views.find(row => sameAction(row, offer.reference));
  if (!view || !view.availability.available) throw ports.refuse("revoked", "That capability is not available here; nothing was suggested.");
  const missing = (offer.missing ?? []).filter(item => item.field && item.question);
  if (!missing.length) await ports.check(view, offer.input);
  const at = ports.now().toISOString();
  const card: ActionCard = { card_id: cardId, revision: 1, title: offer.title, summary: offer.summary, provider: view.provider.title, capability_title: view.action.title,
    effect: actionEffect(view.action, view.capability_id), reference: { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id },
    input: structuredClone(offer.input), input_schema: view.action.input_schema as Record<string, unknown>, editable: [...new Set(offer.editable ?? [])], missing,
    status: missing.length ? "needs-input" : "ready", created_at: at, updated_at: at };
  const subject = cardSubject(view, offer.input);
  const read = subject ? await ports.readSubject(subject) : null;
  if (subject && read && read !== "missing") card.target = { ...subject, revision: read.revision, title: read.title || subject.id };
  return card;
}

/** A result in a line the person can read: what was made or changed, by its name; never the whole payload. */
function summarizeResult(result: unknown): string {
  const named = (value: unknown): string | null => {
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    for (const key of ["title", "name", "display_name"]) if (typeof row[key] === "string" && row[key]) return row[key] as string;
    for (const key of ["item", "document", "record", "result", "created", "updated"]) { const inner = named(row[key]); if (inner) return inner; }
    return null;
  };
  if (typeof result === "string") return result.length > 200 ? `${result.slice(0, 199)}…` : result || "已完成";
  const name = named(result);
  return name ? `「${name.slice(0, 120)}」` : "";
}

/** Words that count days from the day they were said. */
const RELATIVE_DAYS = /今天|明天|后天|今晚|今早|明早|明晚|今日|明日|本周|这周|下周|周末|昨天|大后天/;

/** Why a card is no longer what the person would mean by it: a moment passed, or "today" was another day. */
function outdated(card: ActionCard, input: unknown, edited: boolean, ports: Pick<ActionCardPorts, "now" | "timeZone">): string | null {
  const zone = ports.timeZone;
  const day = (at: Date) => new Intl.DateTimeFormat("en-CA", { ...(zone ? { timeZone: zone } : {}), year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  const now = ports.now(), today = day(now), prepared = day(new Date(card.created_at));
  const properties = ((card.input_schema as Schema).properties ?? {}) as Record<string, Schema>;
  for (const [key, value] of Object.entries(plainObject(input) ? input : {})) {
    if (typeof value !== "string" || !value) continue;
    const kind = actionFieldInput(properties[key]);
    if (kind === "datetime" && Date.parse(value) < now.getTime()) return `卡里的时间（${actionFieldValue(key, value, properties[key])}）已经过去，这张建议没有执行；需要时让助理按现在重新准备`;
    if (kind === "date" && value < today && value >= prepared) return `卡里的日期（${value}）已经过去，这张建议没有执行；需要时让助理按今天重新准备`;
  }
  if (!edited && prepared !== today && RELATIVE_DAYS.test(`${card.title} ${card.summary}`)) return `这张建议是 ${prepared} 准备的，里面说的“今天、明天”按那天算，没有执行；需要时让助理按今天重新准备`;
  return null;
}

/** Why the object a card would change is no longer the one it was suggested for: deleted, or changed by hand since. */
async function targetMoved(card: ActionCard, ports: Pick<ActionCardPorts, "readSubject">): Promise<string | null> {
  if (!card.target) return null;
  const now = await ports.readSubject(card.target);
  if (now === "missing") return `「${card.target.title}」已在原处删除，这张建议不再执行`;
  if (now && now.revision !== card.target.revision) return `你在原处改过「${card.target.title}」，这张建议基于改之前的内容，不再执行；需要时让助理按现在的内容重新准备`;
  return null;
}

/** The card's input with the person's changes to its editable or missing fields, each value as its schema takes it. */
function preparedInput(card: ActionCard, values: Record<string, string>, refuse: ActionCardPorts["refuse"]): unknown {
  const allowed = new Set([...card.editable, ...card.missing.map(item => item.field)]);
  const permitted = (key: string) => allowed.has(key) || key.includes(".") && allowed.has(key.split(".")[0]!);
  const prepared = structuredClone(card.input);
  if (!Object.keys(values).length) return prepared;
  if (!plainObject(prepared)) throw refuse("invalid", "这个建议没有可调整的字段");
  for (const [key, raw] of Object.entries(values)) {
    if (!permitted(key)) throw refuse("invalid", `字段「${key}」不能在这里修改`);
    const [head, child] = key.split(".") as [string, string | undefined];
    const properties = (card.input_schema as Schema).properties;
    const schema = child ? properties?.[head]?.properties?.[child] : properties?.[head];
    let value: unknown = raw;
    // A day or a moment the person cleared, on a field that may be empty, is "none".
    if (raw === "" && actionFieldInput(schema) && allowsNull(schema)) value = null;
    else if (schema?.type !== "string") { try { value = JSON.parse(raw); } catch { value = raw; } }
    if (child) {
      const parent = prepared[head];
      if (!plainObject(parent)) throw refuse("invalid", `字段「${key}」不能在这里修改`);
      parent[child] = value;
    } else prepared[key] = value;
  }
  return prepared;
}

/** How a failed run reads: an unknown outcome is never offered again as a plain retry; data that moved on is stale, not failed. */
function settled(error: unknown): Partial<ActionCard> {
  const code = (error as { code?: string }).code ?? "";
  const message = error instanceof Error ? error.message : String(error);
  // That includes a failure the owner raised after its effect, or an invalid output after it (W2-18-CARD-UNKNOWN-01).
  const unknown = ["actions.outcome_unknown", "actions.output_invalid_after_effect"].includes(code) || /delivery_unknown|host_replaced/.test(code);
  // The data moved on since the suggestion: say so, and let the person ask for a fresh one; never re-aim it quietly.
  const moved = !unknown && (/conflict|stale|revision|version/i.test(code) || /已在其他窗口修改|版本|已变化|已更新|revision|version/i.test(message));
  return unknown ? { status: "unknown", outcome: `结果未确认：${message}。请到原处核对，不会自动重试` }
    : moved ? { status: "stale", outcome: `数据在建议之后变化了，这张卡没有执行（${message}）` } : { status: "failed", outcome: message };
}

/**
 * The person clicked the card at `revision`: run exactly what it shows, with their changes to its editable or missing
 * fields (`values`, the strings its input takes). The card is claimed first, so a second click, another tab or a retry
 * after a restart cannot run it again; a card that went stale, or whose capability is no longer offered, does not run.
 */
export async function runActionCard<Card extends ActionCard>(card: Card, input: { revision: number; values: Record<string, string> }, ports: ActionCardPorts<Card>): Promise<Card> {
  if (!["ready", "needs-input", "failed"].includes(card.status)) return card;
  if (card.revision !== Number(input.revision)) throw ports.refuse("conflict", "这个建议已经变化，请查看最新内容后再点");
  const prepared = preparedInput(card, input.values, ports.refuse);
  // The dates the person set on the card count; days spoken of relative to another day do not decide once they did.
  const moved = outdated(card, prepared, Object.keys(input.values).length > 0, ports) ?? await targetMoved(card, ports);
  if (moved) return ports.store.update(card, card.revision, { status: "stale", outcome: moved });
  const stillMissing = card.missing.filter(item => { const value = plainObject(prepared) ? prepared[item.field] : undefined; return value === undefined || value === null || value === ""; });
  if (stillMissing.length) throw ports.refuse("invalid", `还需要填写：${stillMissing.map(item => item.question).join("；")}`);
  const authority = await ports.authority();
  const view = (await authority.discover()).find(row => sameAction(row, card.reference));
  // The card runs what it shows or not at all: never another capability, version or provider.
  if (!view || !view.availability.available) return ports.store.update(card, card.revision, { status: "stale", outcome: view && !view.availability.available ? view.availability.reason : "这项能力已不可用或已对助理关闭" });
  try { await authority.check(view, prepared); }
  catch (error) { throw ports.refuse("invalid", `填写的内容不符合要求：${error instanceof Error ? error.message : String(error)}`); }
  let claimed = ports.store.update(card, card.revision, { status: "running", request_id: globalThis.crypto.randomUUID(), input: prepared, missing: [], outcome: undefined });
  try {
    const result = await authority.invoke(claimed.reference, prepared);
    const outcome = summarizeResult(result);
    // Background work it started: the card shows it running, then how it ended.
    if (await ports.started?.(view, result, claimed).catch(() => false)) return ports.store.update(claimed, claimed.revision, { status: "running", outcome: "已开始，后台进行中" });
    claimed = ports.store.update(claimed, claimed.revision, { status: "done", ...(outcome ? { outcome } : {}) });
    return claimed;
  } catch (error) {
    return ports.store.update(claimed, claimed.revision, settled(error));
  }
}

/** A card the person put away. Only one that could still run, or failed or went stale, can be. */
export function dismissActionCard<Card extends ActionCard>(card: Card, store: CardStore<Card>): Card {
  if (!["ready", "needs-input", "failed", "stale"].includes(card.status)) return card;
  return store.update(card, card.revision, { status: "dismissed" });
}

/** A suggestion whose moment has passed, or about an object changed by hand since, is not offered any more. */
export async function sweepActionCard<Card extends ActionCard>(card: Card, ports: Pick<ActionCardPorts<Card>, "store" | "readSubject" | "now" | "timeZone">): Promise<Card> {
  if (card.status !== "ready" && card.status !== "needs-input") return card;
  const moved = outdated(card, card.input, false, ports) ?? (card.target ? await targetMoved(card, ports) : null);
  if (!moved) return card;
  try { return ports.store.update(card, card.revision, { status: "stale", outcome: moved }); } catch { return card; /* Clicked meanwhile: that click decides. */ }
}
