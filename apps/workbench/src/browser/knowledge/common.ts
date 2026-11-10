import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { LOCAL_PERSON_ACTOR_ID, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { KnowledgeCardRecord, KnowledgeReadReceipt } from "@molis-ai/molis-work-contracts/services/knowledge";

const uiText = globalThis.t;

/** The page's one request helper (packages/ui-host request-client): control headers, one origin, plain Errors with `code`. */
export const request = (): UiRequest => molisWorkRequest;

type Translate = (text: string, values?: Record<string, string | number>) => string;
/** The page's translator (apps/workbench i18n.ts writes `globalThis.t.text`); the Chinese text itself when there is none. */
export const readText: Translate = (text, values) => {
  const page = (globalThis as { readText?: Translate }).readText;
  if (page) return page(text, values);
  return Object.entries(values ?? {}).reduce((out, [key, value]) => out.split("{" + key + "}").join(String(value)), text);
};

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string | null): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
};

export const button = (text: string, variant = "mw-btn--ghost", label?: string): HTMLButtonElement => {
  const node = el("button", "mw-btn " + variant + " mw-btn--sm", text);
  node.type = "button";
  if (label) node.setAttribute("aria-label", label);
  return node;
};

export const subjectKey = (subject: ActionSubject): string => subject.kind + "\u0000" + subject.id;

/** Where a card stands, in the person's words, with the badge tone the catalog gives it. `changed` and `excluded` are not states. */
export function stateOf(card: KnowledgeCardRecord): { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" } {
  if (card.state === "pending") return card.excluded ? { label: uiText.text("workbench.common.not-organized"), tone: "neutral" } : { label: uiText.text("workbench.common.waiting"), tone: "info" };
  if (card.state === "failed") return { label: uiText.text("workbench.common.failed"), tone: "danger" };
  if (card.state === "over_quota") return { label: uiText.text("workbench.common.over-allowance"), tone: "warning" };
  if (card.state === "missing") return { label: uiText.text("workbench.common.not-present"), tone: "neutral" };
  if (card.state === "listed") return { label: uiText.text("workbench.common.title-only"), tone: "neutral" };
  if (card.suggestion) return { label: uiText.text("workbench.common.new-suggestion"), tone: "warning" };
  return { label: uiText.text("workbench.common.organized"), tone: "success" };
}

export const badge = (label: string, tone: string): HTMLSpanElement => {
  const node = el("span", "mw-badge mw-badge--" + tone, label);
  node.dataset.slot = "badge";
  return node;
};

/** Who read a piece: the agent the Host named for the call when it did, otherwise the caller. */
export function readerOf(receipt: KnowledgeReadReceipt): string {
  const name = receipt.agent || receipt.actor_id;
  if (receipt.actor_id === LOCAL_PERSON_ACTOR_ID && !receipt.agent) return uiText.text("workbench.common.label");
  if (/^assistant\b/u.test(name)) return uiText.text("workbench.common.assistant");
  if (/coding/u.test(name)) return "Coding";
  if (receipt.audience === "mcp") return uiText.text("workbench.common.external-ai-clients") + " · " + name;
  return name;
}

export const when = (iso: string | null): string => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return (date.getMonth() + 1) + "/" + date.getDate() + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
};

export const count = (value: number): string => value.toLocaleString();
