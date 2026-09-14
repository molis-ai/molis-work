import { icon, type GoalBoardIcon } from "@adeptify/goalboard-design-system";
export interface FocusSectionCardOptions {
  key: string;
  iconName: GoalBoardIcon;
  title: string;
  description: string;
  body: string;
  active?: boolean;
  count?: number | null;
  cardClass?: string;
  cardId?: string;
  cardAttributes?: string;
  bodyClass?: string;
  triggerAttributes?: string;
  bodyAttributes?: string;
}


export function createWorkbenchFocusSections(primitives: {
  L(text: string): string;
  escapeHtml(value: unknown): string;
}) {
  const { L, escapeHtml } = primitives;
function sectionHeading(iconName: GoalBoardIcon, title: string, description = ""): string {
  return `<header class="section-heading"><span>${icon(iconName)}</span><div><h2>${escapeHtml(L(title))}</h2>${
    description ? `<p>${escapeHtml(L(description))}</p>` : ""
  }</div></header>`;
}

function subsectionHeading(iconName: GoalBoardIcon, title: string, description = ""): string {
  return `<header class="subsection-heading"><span>${icon(iconName)}</span><div><h3>${escapeHtml(L(title))}</h3>${
    description ? `<p>${escapeHtml(L(description))}</p>` : ""
  }</div></header>`;
}

function renderFocusSectionCard(options: FocusSectionCardOptions): string {
  const active = options.active === true;
  const cardId = options.cardId ? ` id="${escapeHtml(options.cardId)}"` : "";
  const cardClass = options.cardClass ? ` ${options.cardClass}` : "";
  const count = options.count == null ? "" : `<small class="focus-section-card-count">${options.count}</small>`;
  const description = options.description ? `<small>${escapeHtml(options.description)}</small>` : "";
  return `<article${cardId} class="focus-section-card${cardClass}${active ? " is-active" : ""}" data-focus-section-card="${escapeHtml(options.key)}" ${options.cardAttributes ?? ""}>
    <button class="focus-section-card-trigger" type="button" aria-expanded="${active ? "true" : "false"}" data-focus-section-trigger="${escapeHtml(options.key)}" ${options.triggerAttributes ?? ""}>
      <span class="focus-section-card-icon">${icon(options.iconName)}</span>
      <span class="focus-section-card-copy"><strong>${escapeHtml(options.title)}</strong>${description}</span>
      ${count}<span class="focus-section-card-caret">${icon("chevron-right")}</span>
    </button>
  </article>`;
}

function renderFocusSectionBody(options: FocusSectionCardOptions): string {
  const active = options.active === true;
  const bodyClass = `${options.cardClass ? ` ${options.cardClass}` : ""}${options.bodyClass ? ` ${options.bodyClass}` : ""}`;
  return `<div class="focus-section-card-reveal${bodyClass}${active ? " is-active" : ""}" data-focus-section-body="${escapeHtml(options.key)}" aria-hidden="${active ? "false" : "true"}"${active ? "" : " inert"} ${options.bodyAttributes ?? ""}>
    <div class="focus-section-card-content">${options.body}</div>
  </div>`;
}

function renderFocusSectionDeck(cards: FocusSectionCardOptions[], label: string, className = "", attributes = ""): string {
  return `<section class="focus-section-deck${className ? ` ${className}` : ""}" aria-label="${escapeHtml(label)}" data-focus-section-deck>
    <div class="focus-section-card-row" data-focus-section-card-row ${attributes}>${cards.map(renderFocusSectionCard).join("")}</div>
    <div class="focus-section-stage" data-focus-section-stage>${cards.map(renderFocusSectionBody).join("")}</div>
  </section>`;
}


  return { sectionHeading, subsectionHeading, renderFocusSectionDeck };
}
