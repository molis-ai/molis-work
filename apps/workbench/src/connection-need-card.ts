import type { UiConnectionNeedTarget } from "@molis-ai/molis-work-contracts/platform/ui";
import { isLoopbackHttpUrl } from "@molis-ai/molis-work-contracts/platform/loopback";
import { escapeHtml as escape } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * The connection card's markup (specs/assistant-service-connections/spec.md §13.5 三第 3 条): one card for a plugin page's place, drawn by
 * the shell outside the frame (browser/plugin-frame/connection-need.ts), and for the Assistant's pending connection (ASC-69), drawn on
 * the Host. Only words, the service's and plugin's names and the person's own account labels go in; never a key or a connection id but
 * the person's own choice buttons.
 */

/** `paste` is an image target's first key; `key` a service's pasted one after preparing (§13.5 三第 3 条). */
export type ConnectionNeedStage = "ask" | "paste" | "key" | "choose" | "expired" | "disabled" | "refused" | "running" | "unsupported" | "other" | "line";
type Say = (text: string, values?: Record<string, string | number>) => string;
/** What the markup reads. */
export interface ConnectionNeedView {
  stage: ConnectionNeedStage; note: string; danger: boolean; busy: boolean; answered: boolean; line?: string;
  read: { service_title: string; reason?: string; origin?: string; connection: { label: string } | null } | null;
  accounts: ReadonlyArray<{ connection_id: string; account_label?: string | null; display_name: string }>;
  target?: UiConnectionNeedTarget; auth?: { url: string }; other?: { label: string };
}

/**
 * A login address the card may open: https, or plain http on this computer (the one spelling of "this computer",
 * `platform/loopback`), never with a user name or password in it (`http://localhost:@evil.example/` is evil.example).
 * The Assistant's card has the same function, written into its script from this one (scripts/client/assistant-connection.ts).
 */
export function isConnectionLoginUrl(value: string): boolean {
  const url = URL.canParse(value) ? new URL(value) : null;
  return Boolean(url && (url.protocol === "https:" || isLoopbackHttpUrl(url)) && !url.username && !url.password);
}

/**
 * A translation with a name put in: no space between two Chinese words (「连接 图像模型」 is 「连接图像模型」); a Latin name keeps its.
 * An image target's name is not a service's but the words 图像模型 (the Host's), said in the person's language: in English a common
 * noun, "image model" inside a sentence ("Connect image model") and "Image model" opening one ("Image model API key").
 */
export const sayNamed = (t: Say, image = false): Say => (text, values) => {
  const common = image && values?.name && t("common.connection-need.image-model"), said = t(text, common ? { ...values, name: common } : values).replace(/(?<=[㐀-鿿]) (?=[㐀-鿿])/gu, "");
  return common && said.startsWith(common) ? common[0]!.toUpperCase() + said.slice(1) : said;
};

/** The card's heights by width alone (§13.5 三第 2 条, the same steps as the platform area), and the one line it folds into. */
export const CONNECTION_NEED_HEIGHTS = { narrow: 432, wide: 344, line: 48 } as const;

const PART = "connection-need-area__";

/**
 * The card's markup: the platform's header, what the person can do now, and its buttons (§13.5 三第 3 条), one row a stage. The foot
 * holds at most the cancel and the step's own button, so the narrow step's two stacked 44px targets always fit (ASC-71); the other
 * way (换一个) is a button in the body, under what the card says, or beside the key it is the other way to. Where a key is asked for,
 * what the card answers (a refused key in red) stands right under the field, above the hint, so the wide step shows it unscrolled.
 */
export function connectionNeedHtml(say: Say, owner: string, entry: ConnectionNeedView & { read: NonNullable<ConnectionNeedView["read"]> }): string {
  const image = entry.target?.kind === "image", t = sayNamed(say, image), read = entry.read, name = { name: read.service_title }, account = read.connection?.label ?? "";
  // A button is `step` or `step=words` (the same step under another label); `*` marks the primary one.
  const button = (act: string) => {
    const [id, word = id] = act.replace("*", "").split("="), labels: Record<string, string> = { cancel: t("common.control.cancel"), connect: t("workbench.connection-need-card.connect-name", name),
      save: t("workbench.connection-need-card.save-connect"), check: t("workbench.connection-need-card.save-check"), add: t("workbench.connection-need-card.add-another-account"), fill: t("workbench.connection-need-card.enter-new-one"), other: t("workbench.connection-need-card.use-another"), relogin: t("workbench.connection-need-card.sign-again-account", { account }),
      enable: t("workbench.connection-need-card.enable-account"), reopen: t("workbench.connection-need-card.open-sign-page-again"), retry: t("workbench.connection-need-card.connect-again"), settings: t("workbench.connection-need-card.open-service-connections"), switch: t("workbench.connection-need-card.use-here") };
    return `<button type="button" class="mw-btn mw-btn--sm mw-btn--${act.endsWith("*") ? "primary" : "secondary"}" data-framed-control="${escape(id!)}">${escape(labels[word!] ?? word)}</button>`;
  };
  const buttons = (acts: string) => acts.split(" ").filter(Boolean).map(button).join("");
  const p = (part: string, text: string, more = "") => `<p class="${PART}${part}"${more}>${escape(text)}</p>`, some = (part: string, text: string) => text ? p(part, text) : "";
  if (entry.stage === "line") return `<div class="${PART}line" data-framed-area-head data-framed-area-foot>${p("said", entry.line ?? "", ' role="status" tabindex="-1"')}${entry.answered ? "" : buttons("retry")}</div>`;
  const scope = !entry.target || entry.target.kind === "image" ? t("workbench.connection-need-card.once-connected-key-goes-only-origin", { origin: read.origin ?? "" })
    : entry.target.record_key === undefined ? t("workbench.connection-need-card.owner-uses-every-project", { owner }) : t("workbench.connection-need-card.only-source-uses");
  // [what the card says, the foot's step, a second line, another way in the body]
  const rows: Record<Exclude<ConnectionNeedStage, "line">, [string, string, string?, string?]> = {
    ask: [t("workbench.connection-need-card.sign-name-browser-approve-ll-come-back-here", name), "connect*"],
    paste: [t("workbench.connection-need-card.just-one-key-once-s-ll-pick-up"), "save*"],
    key: [t("workbench.connection-need-card.enter-name-api-key-s-saved-only-after", name), "save=check*"],
    choose: [t("workbench.connection-need-card.which-name-account-should-use", name), image ? "fill" : "connect=add", scope],
    expired: [t("workbench.connection-need-card.account-was-signed-out-sign-again-pick-up", { account }), "relogin*", "", "other"],
    disabled: [t("workbench.connection-need-card.turned-account-off-turn-back-everything-that-uses"), "enable*", "", "other"],
    refused: [t("workbench.connection-need-card.key-here-no-longer-works-enter-new-one"), "save*", "", entry.accounts.length ? "other" : ""],
    running: ["", entry.auth?.url ? "reopen" : ""],
    unsupported: [t("workbench.connection-need-card.name-can-t-be-connected-here-one-step", name), "settings"],
    other: [t("workbench.connection-need-card.signed-account-use-here-instead-nothing-else-changes", { account: entry.other?.label ?? "" }), "switch*"],
  };
  const [text, acts, second = "", more = ""] = rows[entry.stage], keyed = ["paste", "key", "refused"].includes(entry.stage);
  const note = p("note" + (entry.danger ? " is-error" : ""), entry.note, ' role="status"');
  // One form for every key the card asks for: an image's says where it goes (only that origin), where to find one and how it is kept
  // (the model settings' words, #1881); a service's that it is checked first.
  const field = keyed ? some("origin", read.origin ? t("workbench.connection-need-card.key-goes-only-origin", { origin: read.origin }) : "")
    + `<div class="${PART}key"><label class="mw-field"><span class="mw-field__label">${escape(t("workbench.connection-need-card.name-api-key", name))}</span><input class="mw-input" type="password" autocomplete="off" spellcheck="false" data-connection-need-key${entry.danger ? ' aria-invalid="true"' : ""}></label>${more ? buttons(more) : ""}</div>`
    + note + (image ? some("hint", t("workbench.connection-need-card.find-api-key-services-console") + t("workbench.connection-need-card.encrypted-computer-never-shown-again-after-saving")) : "") : "";
  const list = entry.stage === "choose" ? `<div class="mw-choice-group ${PART}accounts" role="group" aria-label="${escape(t("workbench.connection-need-card.accounts"))}">${entry.accounts.map(row =>
    `<button type="button" class="mw-choice" data-slot="choice" data-framed-control="${escape("use:" + row.connection_id)}"><span class="mw-choice__label">${escape(row.account_label || row.display_name)}</span></button>`).join("")}</div>` : "";
  return `<header class="mw-platform-area__head" data-framed-area-head><span class="mw-platform-area__kicker"><svg aria-hidden="true"><use href="#icon-link"></use></svg>${escape(t("workbench.connection-need-card.molis-work-connection"))}</span><span class="mw-platform-area__owner" title="${escape(owner)}">${escape(owner)}</span>`
    + `${p("title", t("workbench.connection-need-card.connect-name", name))}</header><div class="mw-platform-area__body" data-framed-scroll${entry.busy ? ' aria-busy="true"' : ""}>`
    + (read.reason ? p("quote", t("workbench.connection-need-card.owner-says-reason", { owner, reason: read.reason })) : "")
    + (entry.stage === "running" ? p("wait", t("workbench.connection-need-card.waiting-sign-name-browser-once-approve-ll-come", name), ' tabindex="-1"') : "") + some("text", text) + some("scope", second) + field + list
    + (more && !keyed ? `<div class="${PART}more">${buttons(more)}</div>` : "")
    + `${keyed ? "" : note}</div><footer class="${PART}foot" data-framed-area-foot>${buttons("cancel " + acts)}</footer>`;
}
