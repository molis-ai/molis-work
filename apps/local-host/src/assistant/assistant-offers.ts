import { randomUUID } from "node:crypto";
import type { ActionSubjectContext, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { AgentActionOffer } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import type { AssistantCard, AssistantContextSnapshot, AssistantPageCardInput, AssistantPreparedCard, AssistantScope } from "@molis-ai/molis-work-contracts/services/assistant";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { cardInputValues, dismissActionCard, draftActionCard, runActionCard, sweepActionCard, type ActionCardPorts, type ActionCardRefusal } from "@molis-ai/molis-work-plugin-sdk";
import { assistantCardHtml, cardView } from "./assistant-card-view.js";
import { identity } from "./assistant-relations.js";
import type { AssistantJobs } from "./assistant-jobs.js";
import type { AssistantStore, StoredCard, StoredWork } from "./assistant-store.js";

const RUNTIME = "prologue";
/** The Assistant's codes for the shared card rules' refusals. */
const REFUSALS: Record<ActionCardRefusal, string> = { revoked: "assistant.action_revoked", invalid: "assistant.invalid", conflict: "assistant.conflict" };

/** Who placed a page's card: the project it was placed from, when there is one. */
interface OfferCaller {
  project_ref?: LocalHostProjectReference;
}

/**
 * What the action cards need from the Assistant: its store, its clock, reading the object a card acts on, the authority a
 * work runs with, watching a job a card started, and starting a work for a page's card. Nothing else of the service.
 */
interface OfferPorts {
  readonly store: AssistantStore;
  readonly actorId: string;
  now(): Date;
  /** IANA zone the person works in, so a card's "today" is theirs. */
  readonly timeZone?: string;
  readSubject(work: StoredWork, subject: { kind: string; id: string }): Promise<ActionSubjectContext | "missing" | null>;
  authority(work: StoredWork): Promise<AgentStartAuthority>;
  /** The background jobs works follow: a card that starts one shows it running until it ends. */
  readonly jobs: Pick<AssistantJobs, "follow" | "claimForCard" | "linkCard">;
  createWork(title: string, scope: AssistantScope | undefined, context: AssistantContextSnapshot, caller: OfferCaller): Promise<StoredWork>;
  fail(code: string, message: string): Error;
}

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
 * The Assistant's action cards (specs/ai-interaction-experience H2, the W5-10 collaborator shape): a round's suggestion or a
 * page's prepared card is checked against what the work may use and kept as a card; the person runs it, as shown, or
 * dismisses it. It depends on the Assistant only through its ports.
 */
export class AssistantOffers {
  constructor(private readonly ports: OfferPorts) {}

  async recordOffer(work: StoredWork, offer: AgentActionOffer, views: readonly ActionView[],
    page?: Pick<StoredCard, "from" | "source_object" | "materials">): Promise<{ offer_id: string }> {
    const drafted = await draftActionCard(`card-${randomUUID()}`, offer, views, { ...this.rules(work), check: (view, input) => assertActionInput(view.action.input_schema, input) });
    // A round's suggestion belongs to that round; a card a page placed belongs to no round (it shows as coming from that page).
    const card: StoredCard = { ...drafted, work_id: work.work_id, run_id: page ? null : this.ports.store.rounds(work.work_id).at(-1)?.run_id ?? null, ...(page ?? {}) };
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
    if (work.executor.kind === "plugin") throw this.ports.fail("assistant.unsupported", "执行方插件负责的工作不放操作卡，请交给助理或新开一项工作");
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
    const card = this.ports.store.card(work.work_id, cardId);
    // What the card's controls hold (a pick, a day, a moment in the person's zone), as the strings the input takes.
    const values = cardInputValues(input.values, this.ports.timeZone);
    let job: Awaited<ReturnType<AssistantJobs["follow"]>> = null;
    const ran = await runActionCard(card, { revision: input.revision, values }, { ...this.rules(work),
      authority: async () => {
        const authority = await this.ports.authority(work);
        if (!authority.actions) throw this.ports.fail("assistant.unsupported", "当前没有可用的业务能力");
        const client = await authority.actions(RUNTIME);
        return { discover: () => client.discover(), check: (view, prepared) => assertActionInput(view.action.input_schema, prepared), invoke: (reference, prepared) => client.invoke(reference, prepared) };
      },
      started: async (view, output, claimed) => { job = await this.ports.jobs.follow(work, view, output); return job !== null && this.ports.jobs.claimForCard(claimed, job); } });
    // Shown running for its job: linked now, so the job's end (even one that came first) settles it.
    return cardView(job && ran.status === "running" ? await this.ports.jobs.linkCard(ran, job) : ran);
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
    return cardView(dismissActionCard(this.ports.store.card(work.work_id, cardId), this.store));
  }

  /** A suggestion whose moment has passed, or about an object changed by hand since, is not offered any more. */
  async sweep(work: StoredWork): Promise<void> {
    for (const card of this.ports.store.cards(work.work_id)) await sweepActionCard(card, this.rules(work));
  }

  /** The cards' own store, in the shape the shared rules write through: only when the card is still at the revision read. */
  private readonly store = { update: (card: StoredCard, expected: number, patch: Partial<StoredCard>) => this.ports.store.updateCard(card, expected, patch) };

  /** What the shared card rules read for a work's cards: its objects, the person's clock and zone, and the Assistant's own refusals. */
  private rules(work: StoredWork): Omit<ActionCardPorts<StoredCard>, "authority"> {
    return { store: this.store, readSubject: subject => this.ports.readSubject(work, subject), now: () => this.ports.now(),
      ...(work.project_ref ? { projectId: work.project_ref.project_id } : {}),
      ...(this.ports.timeZone ? { timeZone: this.ports.timeZone } : {}), refuse: (reason, message) => this.ports.fail(REFUSALS[reason], message) };
  }
}
