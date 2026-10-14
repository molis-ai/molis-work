import { randomUUID } from "node:crypto";
import { actionEffect, actionFieldInput, actionFieldValue, type ActionSubjectContext, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { AgentActionOffer } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import type { AssistantCard, AssistantContextSnapshot, AssistantPageCardInput, AssistantPreparedCard, AssistantScope } from "@molis-ai/molis-work-contracts/services/assistant";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { allowsNull, assistantCardHtml, cardInputValues, cardView, plainObject, type SchemaProperties } from "./assistant-card-view.js";
import { identity } from "./assistant-relations.js";
import type { AssistantStore, StoredCard, StoredJob, StoredWork } from "./assistant-store.js";

const RUNTIME = "prologue";

/** Who placed a page's card: the project it was placed from, when there is one. */
export interface OfferCaller {
  project_ref?: LocalHostProjectReference;
}

/**
 * What the action cards need from the Assistant: its store, its clock, reading the object a card acts on, the authority a
 * work runs with, watching a job a card started, and starting a work for a page's card. Nothing else of the service.
 */
export interface OfferPorts {
  readonly store: AssistantStore;
  readonly actorId: string;
  now(): Date;
  /** IANA zone the person works in, so a card's "today" is theirs. */
  readonly timeZone?: string;
  readSubject(work: StoredWork, subject: { kind: string; id: string }): Promise<ActionSubjectContext | "missing" | null>;
  authority(work: StoredWork): Promise<AgentStartAuthority>;
  watchJob(work: StoredWork, view: ActionView, output: unknown, cardId?: string): Promise<StoredJob | null>;
  createWork(title: string, scope: AssistantScope | undefined, context: AssistantContextSnapshot, caller: OfferCaller): Promise<StoredWork>;
  fail(code: string, message: string): Error;
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
/** A page's prepared card, bounded and shaped as the contract says; anything else is refused before any check runs. */
function checkPreparedCard(card: AssistantPreparedCard | undefined, fail: (code: string, message: string) => Error): AssistantPreparedCard {
  const text = (value: unknown, what: string, max: number) => {
    if (typeof value !== "string" || !value.trim() || value.length > max) throw fail("assistant.invalid", `${what}需要 1–${max} 个字符`);
    return value.trim();
  };
  if (!card || typeof card !== "object") throw fail("assistant.invalid", "缺少操作卡");
  const ref = card.reference;
  if (!ref || typeof ref.capability_id !== "string" || !ref.capability_id || typeof ref.provider_id !== "string" || !ref.provider_id || !Number.isSafeInteger(ref.version)) {
    throw fail("assistant.invalid", "操作卡要写明准确的能力（capability_id、version、provider_id）");
  }
  const strings = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === "string" && item.length <= 120);
  if (card.editable !== undefined && !strings(card.editable)) throw fail("assistant.invalid", "可调整的字段写法不对");
  const missing = card.missing === undefined ? undefined : Array.isArray(card.missing)
    ? card.missing.map(item => ({ field: text(item?.field, "缺少的字段", 120), question: text(item?.question, "要问的问题", 300) })) : null;
  if (missing === null) throw fail("assistant.invalid", "缺少的字段写法不对");
  const materials = card.materials === undefined ? undefined : Array.isArray(card.materials) && card.materials.length <= 4
    ? card.materials.map(item => ({ title: text(item?.title, "选中内容的标题", 200), text: text(item?.text, "选中的内容", 20_000) })) : null;
  if (materials === null) throw fail("assistant.invalid", "选中的内容最多 4 段");
  const object = card.source_object;
  if (object !== undefined && (!object || typeof object.kind !== "string" || !object.kind || typeof object.id !== "string" || !object.id)) {
    throw fail("assistant.invalid", "来源对象写法不对");
  }
  return { title: text(card.title, "按钮文字", 40), summary: text(card.summary, "说明", 600),
    reference: { capability_id: ref.capability_id, version: ref.version, provider_id: ref.provider_id }, input: card.input,
    ...(card.editable ? { editable: [...card.editable] } : {}), ...(missing ? { missing } : {}), ...(materials ? { materials } : {}),
    ...(object ? { source_object: { kind: object.kind, id: object.id, ...(object.version !== undefined ? { version: object.version } : {}),
      ...(typeof object.title === "string" && object.title.trim() ? { title: object.title.trim().slice(0, 200) } : {}) } } : {}) };
}

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
 * The Assistant's action cards (specs/ai-interaction-experience H2, the W5-10 collaborator shape): a round's suggestion or a
 * page's prepared card is checked against what the work may use and kept as a card; the person runs it, as shown, or
 * dismisses it. It depends on the Assistant only through its ports.
 */
export class AssistantOffers {
  constructor(private readonly ports: OfferPorts) {}

  async recordOffer(work: StoredWork, offer: AgentActionOffer, views: readonly ActionView[],
    page?: Pick<StoredCard, "from" | "source_object" | "materials">): Promise<{ offer_id: string }> {
    const ref = offer.reference;
    const view = views.find(row => row.capability_id === ref.capability_id && row.version === ref.version && row.provider.provider_id === ref.provider_id);
    if (!view || !view.availability.available) throw this.ports.fail("assistant.action_revoked", "That capability is not available here; nothing was suggested.");
    const missing = (offer.missing ?? []).filter(item => item.field && item.question);
    if (!missing.length) assertActionInput(view.action.input_schema, offer.input);
    const at = this.ports.now().toISOString();
    // A round's suggestion belongs to that round; a card a page placed belongs to no round (it shows as coming from that page).
    const card: StoredCard = { card_id: `card-${randomUUID()}`, work_id: work.work_id, revision: 1, run_id: page ? null : this.ports.store.rounds(work.work_id).at(-1)?.run_id ?? null,
      title: offer.title, summary: offer.summary, provider: view.provider.title, capability_title: view.action.title, effect: actionEffect(view.action, view.capability_id),
      reference: { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, input: structuredClone(offer.input),
      input_schema: view.action.input_schema as Record<string, unknown>, editable: [...new Set(offer.editable ?? [])], missing,
      status: missing.length ? "needs-input" : "ready", created_at: at, updated_at: at, ...(page ?? {}) };
    const subject = cardSubject(view, offer.input);
    const read = subject ? await this.ports.readSubject(work, subject) : null;
    if (subject && read && read !== "missing") card.target = { ...subject, revision: read.revision, title: read.title || subject.id };
    this.ports.store.addCard(card);
    return { offer_id: card.card_id };
  }

  /**
   * A card a page prepared from what the person selected (a contextual action they clicked): checked exactly as a round's
   * own suggestion is, against what the Assistant may use in that work now, and shown as coming from that page. It is
   * placed once per page message; nothing runs until the person clicks it, and no model round starts.
   */
  async offerFromPage(input: AssistantPageCardInput, caller: OfferCaller): Promise<{ work_id: string; card: AssistantCard }> {
    const messageId = String(input?.message_id ?? "");
    if (!/^[A-Za-z0-9-]{8,80}$/.test(messageId)) throw this.ports.fail("assistant.invalid", "页面消息标识无效");
    const card = checkPreparedCard(input.card, this.ports.fail);
    const source = input.source && typeof input.source.surface === "string" && input.source.surface.trim()
      ? { surface: input.source.surface.trim().slice(0, 120), ...(typeof input.source.title === "string" && input.source.title.trim() ? { title: input.source.title.trim().slice(0, 120) } : {}) }
      : null;
    if (!source) throw this.ports.fail("assistant.invalid", "需要说明来自哪个页面");
    // The same message places its card once: a second delivery shows the first.
    const placed = this.ports.store.setting(this.ports.actorId, `page-card:${messageId}`);
    if (placed) {
      const { work_id, card_id } = JSON.parse(placed) as { work_id: string; card_id: string };
      return { work_id, card: cardView(this.ports.store.card(work_id, card_id)) };
    }
    const context: AssistantContextSnapshot = { source, captured_at: this.ports.now().toISOString(),
      ...(card.source_object ? { object: { kind: card.source_object.kind, id: card.source_object.id, ...(card.source_object.version !== undefined && card.source_object.version !== null ? { version: card.source_object.version } : {}),
        ...(card.source_object.title ? { title: card.source_object.title } : {}) } } : {}) };
    let work: StoredWork;
    if (input.work_id) {
      work = this.ports.store.get(this.ports.actorId, input.work_id);
      if (work.archived) throw this.ports.fail("assistant.state", "这项工作已归档，不能再放入操作卡");
      if (work.scope.kind === "project" && work.scope.project_id !== caller.project_ref?.project_id) throw this.ports.fail("assistant.scope", "这项工作不在当前项目里");
    } else work = await this.ports.createWork(card.title, input.scope, context, caller);
    if (work.executor.kind === "coding") throw this.ports.fail("assistant.unsupported", "Coding 负责的工作不放操作卡，请交给助理或新开一项工作");
    const client = await (await this.ports.authority(work)).actions?.(RUNTIME);
    if (!client) throw this.ports.fail("assistant.unsupported", "这里没有助理能用的能力");
    const { offer_id } = await this.recordOffer(work, { title: card.title, summary: card.summary, reference: card.reference, input: card.input,
      ...(card.editable ? { editable: card.editable } : {}), ...(card.missing ? { missing: card.missing } : {}) }, await client.discover(),
      { from: source, ...(card.source_object ? { source_object: card.source_object } : {}), ...(card.materials ? { materials: card.materials } : {}) });
    if (card.source_object) {
      const version = card.source_object.version;
      this.ports.store.relations.link(identity(work), input.work_id ? "material" : "origin", { kind: card.source_object.kind, id: card.source_object.id,
        revision: version === undefined || version === null ? null : String(version) }, `来自「${source.title ?? source.surface}」页面的操作卡`);
    }
    this.ports.store.setSetting(this.ports.actorId, `page-card:${messageId}`, JSON.stringify({ work_id: work.work_id, card_id: offer_id }));
    return { work_id: work.work_id, card: cardView(this.ports.store.card(work.work_id, offer_id)) };
  }

  /**
   * The person clicked the card: run exactly what it shows, with their adjustments to its editable or missing fields.
   * The card is claimed first, so a second click, another tab or a retry after a restart cannot run it again.
   */
  async runCard(workId: string, cardId: string, input: { revision: number; values?: unknown }): Promise<AssistantCard> {
    const work = this.ports.store.get(this.ports.actorId, workId);
    let card = this.ports.store.card(work.work_id, cardId);
    if (!["ready", "needs-input", "failed"].includes(card.status)) return cardView(card);
    if (card.revision !== Number(input.revision)) throw this.ports.fail("assistant.conflict", "这个建议已经变化，请查看最新内容后再点");
    // What the card's controls hold (a pick, a day, a moment in the person's zone), as the strings the input takes.
    const values = cardInputValues(input.values, this.ports.timeZone);
    const allowed = new Set([...card.editable, ...card.missing.map(item => item.field)]);
    const permitted = (key: string) => allowed.has(key) || key.includes(".") && allowed.has(key.split(".")[0]!);
    let prepared = structuredClone(card.input);
    if (Object.keys(values).length) {
      if (!prepared || typeof prepared !== "object" || Array.isArray(prepared)) throw this.ports.fail("assistant.invalid", "这个建议没有可调整的字段");
      for (const [key, raw] of Object.entries(values)) {
        if (!permitted(key)) throw this.ports.fail("assistant.invalid", `字段「${key}」不能在这里修改`);
        const [head, child] = key.split(".") as [string, string | undefined];
        const properties = card.input_schema.properties as SchemaProperties | undefined;
        const schema = child ? properties?.[head]?.properties?.[child] : properties?.[head];
        let value: unknown = raw;
        // A day or a moment the person cleared, on a field that may be empty, is "none".
        if (raw === "" && actionFieldInput(schema) && allowsNull(schema)) value = null;
        else if (schema?.type !== "string" && typeof raw === "string") { try { value = JSON.parse(raw); } catch { value = raw; } }
        if (child) {
          const parent = (prepared as Record<string, unknown>)[head];
          if (!plainObject(parent)) throw this.ports.fail("assistant.invalid", `字段「${key}」不能在这里修改`);
          parent[child] = value;
        } else (prepared as Record<string, unknown>)[key] = value;
      }
    }
    // The dates the person set on the card count; days spoken of relative to another day do not decide once they did.
    const moved = this.outdated(card, prepared, Object.keys(values).length > 0) ?? await this.targetMoved(work, card);
    if (moved) return cardView(this.ports.store.updateCard(card, card.revision, { status: "stale", outcome: moved }));
    const stillMissing = card.missing.filter(item => { const value = (prepared as Record<string, unknown> | null)?.[item.field]; return value === undefined || value === null || value === ""; });
    if (stillMissing.length) throw this.ports.fail("assistant.invalid", `还需要填写：${stillMissing.map(item => item.question).join("；")}`);
    const authority = await this.ports.authority(work);
    if (!authority.actions) throw this.ports.fail("assistant.unsupported", "当前没有可用的业务能力");
    const client = await authority.actions(RUNTIME);
    const view = (await client.discover()).find(row => row.capability_id === card.reference.capability_id && row.version === card.reference.version && row.provider.provider_id === card.reference.provider_id);
    // The card runs what it shows or not at all: never another capability, version or provider.
    if (!view || !view.availability.available) return cardView(this.ports.store.updateCard(card, card.revision, { status: "stale", outcome: view && !view.availability.available ? view.availability.reason : "这项能力已不可用或已对助理关闭" }));
    try { assertActionInput(view.action.input_schema, prepared); }
    catch (error) { throw this.ports.fail("assistant.invalid", `填写的内容不符合要求：${error instanceof Error ? error.message : String(error)}`); }
    card = this.ports.store.updateCard(card, card.revision, { status: "running", request_id: randomUUID(), input: prepared, missing: [], outcome: undefined });
    try {
      const result = await client.invoke(card.reference, prepared);
      const outcome = summarizeResult(result);
      // Background work it started: the card shows it running, then how it ended.
      const job = await this.ports.watchJob(work, view, result, card.card_id).catch(() => null);
      if (job) return cardView(this.ports.store.updateCard(card, card.revision, { status: "running", outcome: "已开始，后台进行中" }));
      return cardView(this.ports.store.updateCard(card, card.revision, { status: "done", ...(outcome ? { outcome } : {}) }));
    } catch (error) {
      const code = (error as { code?: string }).code ?? "";
      const message = error instanceof Error ? error.message : String(error);
      // An unknown outcome is never offered again as a plain retry: it may already have happened.
      // That includes a failure the owner raised after its effect, or an invalid output after it (W2-18-CARD-UNKNOWN-01).
      const unknown = ["actions.outcome_unknown", "actions.output_invalid_after_effect"].includes(code) || /delivery_unknown|host_replaced/.test(code);
      // The data moved on since the suggestion: say so, and let the person ask for a fresh one; never re-aim it quietly.
      const moved = !unknown && (/conflict|stale|revision|version/i.test(code) || /已在其他窗口修改|版本|已变化|已更新|revision|version/i.test(message));
      return cardView(this.ports.store.updateCard(card, card.revision, unknown ? { status: "unknown", outcome: `结果未确认：${message}。请到原处核对，不会自动重试` }
        : moved ? { status: "stale", outcome: `数据在建议之后变化了，这张卡没有执行（${message}）` } : { status: "failed", outcome: message }));
    }
  }

  /** One card of a work, as the person sees it. */
  card(workId: string, cardId: string): AssistantCard {
    return cardView(this.ports.store.card(this.ports.store.get(this.ports.actorId, workId).work_id, cardId));
  }

  /** The card drawn for the page, its moments in the zone the card's dates are checked in. */
  html(card: AssistantCard, say: (text: string, values?: Record<string, string | number>) => string): string {
    return assistantCardHtml(card, say, this.ports.timeZone);
  }

  dismissCard(workId: string, cardId: string): AssistantCard {
    const work = this.ports.store.get(this.ports.actorId, workId);
    const card = this.ports.store.card(work.work_id, cardId);
    if (!["ready", "needs-input", "failed", "stale"].includes(card.status)) return cardView(card);
    return cardView(this.ports.store.updateCard(card, card.revision, { status: "dismissed" }));
  }

  /** A suggestion whose moment has passed, or about an object changed by hand since, is not offered any more. */
  async sweep(work: StoredWork): Promise<void> {
    for (const card of this.ports.store.cards(work.work_id).filter(item => item.status === "ready" || item.status === "needs-input")) {
      const moved = this.outdated(card, card.input, false) ?? (card.target ? await this.targetMoved(work, card) : null);
      if (moved) { try { this.ports.store.updateCard(card, card.revision, { status: "stale", outcome: moved }); } catch { /* Clicked meanwhile: that click decides. */ } }
    }
  }

  private outdated(card: StoredCard, input: unknown, edited: boolean): string | null {
    const zone = this.ports.timeZone;
    const day = (at: Date) => new Intl.DateTimeFormat("en-CA", { ...(zone ? { timeZone: zone } : {}), year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
    const now = this.ports.now(), today = day(now), prepared = day(new Date(card.created_at));
    const properties = (card.input_schema.properties ?? {}) as SchemaProperties;
    for (const [key, value] of Object.entries(plainObject(input) ? input : {})) {
      if (typeof value !== "string" || !value) continue;
      const kind = actionFieldInput(properties[key]);
      if (kind === "datetime" && Date.parse(value) < now.getTime()) return `卡里的时间（${actionFieldValue(key, value, properties[key])}）已经过去，这张建议没有执行；需要时让助理按现在重新准备`;
      if (kind === "date" && value < today && value >= prepared) return `卡里的日期（${value}）已经过去，这张建议没有执行；需要时让助理按今天重新准备`;
    }
    if (!edited && prepared !== today && RELATIVE_DAYS.test(`${card.title} ${card.summary}`)) return `这张建议是 ${prepared} 准备的，里面说的“今天、明天”按那天算，没有执行；需要时让助理按今天重新准备`;
    return null;
  }

  private async targetMoved(work: StoredWork, card: StoredCard): Promise<string | null> {
    if (!card.target) return null;
    const now = await this.ports.readSubject(work, card.target);
    if (now === "missing") return `「${card.target.title}」已在原处删除，这张建议不再执行`;
    if (now && now.revision !== card.target.revision) return `你在原处改过「${card.target.title}」，这张建议基于改之前的内容，不再执行；需要时让助理按现在的内容重新准备`;
    return null;
  }
}
