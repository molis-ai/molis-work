import { escapeHtml as esc, icon, renderAlert, renderButton, renderCard, renderFrame, renderMenu, renderMenuItem, renderPopover, renderPreviewCard }
  from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderDraftForm } from "./form.js";
import { act, levelBadge, prose, section, severityGrid, statusMark, text, when } from "./parts.js";
import { renderReview } from "./review.js";
import type { RiskEvent, RiskPage, RiskRecord, RiskStatus } from "./types.js";

/** One risk (design B: two columns, facts on the right; design C: the same, compact, in the side panel). */

const STATUSES: RiskStatus[] = ["open", "mitigating", "accepted", "closed"];

function statusControl(page: RiskPage, risk: RiskRecord): string {
  if (page.state.readOnly || risk.status === "closed") return statusMark(risk.status);
  const open = page.state.pop === "status";
  const menu = open ? `<div class="rk-pop">${renderMenu({ items: STATUSES.map(status => renderMenuItem({ label: text(status === "closed" ? "status.close-hint" : `status.${status}`),
    checked: risk.status === status, attrs: { "data-rk-act": "set-status", "data-rk-value": status } })).join("") })}</div>` : "";
  return `<span class="rk-anchor"><button type="button" class="mw-btn mw-btn--ghost mw-btn--sm rk-status-btn" data-slot="button" data-rk-act="pop" data-rk-value="status"
    aria-haspopup="menu" aria-expanded="${open}">${statusMark(risk.status)}${icon("chevron-down")}</button>${menu}</span>`;
}

function banner(page: RiskPage, risk: RiskRecord): string {
  if (risk.status === "closed") {
    return renderAlert({ tone: "info", title: text("record.closed"), body: text("record.closed-body", { when: when(risk.closed_at) }),
      actions: page.state.readOnly ? [] : [{ label: text("action.reopen"), attrs: { "data-rk-act": "set-status", "data-rk-value": "open" } }] });
  }
  if (page.state.readOnly) return renderAlert({ tone: "warning", title: text("record.read-only"), body: text("record.read-only-body") });
  return "";
}

function conflictBlock(page: RiskPage): string {
  const conflict = page.state.conflict!;
  const draft = conflict.draft, current = conflict.current;
  return renderAlert({ tone: "warning", title: text("record.conflict"), body: text("record.conflict-body") })
    + `<div class="rk-pair">${renderPreviewCard({ title: text("record.theirs"), body: `${current.title}\n\n${current.treatment || text("record.no-plan")}` })}${renderPreviewCard({
      title: text("record.yours"), body: `${draft.title}\n\n${draft.treatment || text("record.no-plan")}` })}</div>
    <div class="rk-actions">${act(text("record.use-theirs"), "use-theirs")}${act(text("record.continue"), "continue-on-theirs", { variant: "primary" })}</div>`;
}

const EVENT_ICON: Record<RiskEvent["kind"], Parameters<typeof icon>[0]> = { created: "plus", updated: "edit", status: "switch", note: "note", linked: "link", unlinked: "x" };

function eventText(event: RiskEvent): string {
  const detail = event.detail;
  if (event.kind === "status" && detail.status) return text("event.status", { from: text(`status.${detail.previous_status ?? "open"}`), to: text(`status.${detail.status}`) });
  if (event.kind === "updated") return text("event.updated", { fields: (detail.fields ?? []).map(field => text(`field.${field === "owner_name" ? "owner" : field}`)).join(text("list.separator")) });
  if (event.kind === "linked" || event.kind === "unlinked") return text(`event.${event.kind}`, { kind: detail.subject?.kind ?? "" });
  return text(`event.${event.kind}`);
}

function activity(page: RiskPage, events: readonly RiskEvent[], risk: RiskRecord): string {
  const add = page.state.readOnly || risk.status === "closed" ? ""
    : `<form class="rk-note" data-rk-form="note"><input class="mw-input mw-input--sm" name="note" maxlength="4000" aria-label="${esc(text("record.note"))}" placeholder="${esc(text("record.note"))}">${
      renderButton({ label: text("action.add"), size: "sm", type: "submit", variant: "secondary" })}</form>`;
  const list = events.map(event => `<li class="mw-source"><span class="mw-source__icon">${icon(EVENT_ICON[event.kind])}</span><span><span class="mw-source__meta">${
    esc(when(event.at))}</span>${esc(eventText(event))}${event.kind === "note" || (event.kind === "status" && event.detail.text) ? `<span class="rk-quote">${esc(event.detail.text ?? "")}</span>` : ""}</span></li>`).join("");
  return section(text("record.activity"), `${add}<ul class="mw-sources rk-log">${list}</ul>`);
}

function linkSection(page: RiskPage, risk: RiskRecord): string {
  const links = page.state.record!.links;
  const writable = !page.state.readOnly && risk.status !== "closed";
  const none = links.length ? "" : renderAlert({ tone: "info", title: text("record.no-links"), body: text("record.standalone") });
  // The shell draws each object as its owner presents it (or says it is gone or out of reach); the page keeps only kind and id.
  const rows = links.map(link => `<li class="rk-link"><span class="rk-link__slot" data-rk-link-slot data-kind="${esc(link.subject.kind)}" data-id="${esc(link.subject.id)}"></span>${
    writable ? renderButton({ label: text("action.unlink"), variant: "ghost", size: "sm", icon: "x", iconOnly: true,
      attrs: { "data-rk-act": "unlink", "data-rk-value": `${link.subject.kind}\n${link.subject.id}` } }) : ""}</li>`).join("");
  const add = writable ? `<span class="rk-anchor">${act(text("action.link-goal"), "pop", { value: "link", variant: "ghost", icon: "link" })}${page.state.pop === "link" ? linkPicker() : ""}</span>` : "";
  return section(text("record.links"), `${none}${rows ? `<ul class="rk-links">${rows}</ul>` : ""}`, add);
}

function linkPicker(): string {
  return renderPopover({ preview: true, className: "rk-pop rk-pop--form", body: `<form data-rk-form="link-search"><label class="rk-label" for="rk-link-query">${esc(text("record.find-goal"))}</label>
    <input class="mw-input mw-input--sm" id="rk-link-query" name="query" maxlength="200" autocomplete="off"></form><ul class="mw-items rk-found" data-rk-found></ul>` });
}

function facts(page: RiskPage, risk: RiskRecord): string {
  return renderCard({ title: text("record.facts"), className: "rk-facts", body: `<dl class="rk-dl"><dt>${esc(text("field.status"))}</dt><dd>${statusControl(page, risk)}</dd>
    <dt>${esc(text("record.severity"))}</dt><dd class="rk-gridrow">${severityGrid(risk, "large")}<span class="rk-badges">${levelBadge("impact", risk.impact)}${levelBadge("likelihood", risk.likelihood)}</span></dd>
    <dt>${esc(text("field.owner"))}</dt><dd>${risk.owner_name ? `<span class="rk-owner">${icon("user")}${esc(risk.owner_name)}</span>` : `<span class="rk-muted">${esc(text("record.no-owner"))}</span>`}</dd></dl>` });
}

function main(page: RiskPage, risk: RiskRecord): string {
  if (page.state.conflict) return conflictBlock(page);
  if (page.state.editing) return renderDraftForm(page, "edit");
  const edit = page.state.readOnly || risk.status === "closed" ? "" : act(text("action.edit"), "edit", { variant: "ghost", icon: "edit" });
  return `${section(text("field.statement"), prose(risk.statement), edit)}${section(text("field.treatment"), risk.treatment.trim() ? prose(risk.treatment)
    : `<p class="rk-muted">${esc(text("record.no-plan"))}</p>`)}${activity(page, page.state.record!.events, risk)}`;
}

export function renderRecord(page: RiskPage): string {
  const { state } = page;
  const back = page.side ? "" : `<div class="rk-back">${renderButton({ label: text("overview.title"), variant: "link", size: "sm", icon: "chevron-left", attrs: { "data-rk-act": "back" } })}</div>`;
  if (state.recordError) {
    return back + renderFrame({ title: text("overview.title"), panel: renderAlert({ tone: "danger", title: text("record.failed"), body: state.recordError,
      actions: [{ label: text("action.retry"), icon: "refresh", attrs: { "data-rk-act": "reload-record" } }] }), className: "rk-frame" });
  }
  if (!state.record) return `${back}<p class="rk-muted" aria-busy="true">${esc(text("overview.loading"))}</p>`;
  const risk = state.record.risk;
  const description = text("record.updated", { when: when(risk.updated_at) });
  const tools = page.side ? renderButton({ label: text("action.expand"), variant: "ghost", size: "sm", icon: "maximize", iconOnly: true, attrs: { "data-rk-act": "expand" } }) : "";
  const side = `${facts(page, risk)}${linkSection(page, risk)}${renderReview(page, risk)}`;
  const panel = page.side
    ? `${banner(page, risk)}<div class="rk-compact">${side}${main(page, risk)}</div>`
    : `${banner(page, risk)}<div class="rk-two"><div class="rk-col">${main(page, risk)}</div><aside class="rk-col rk-side">${side}</aside></div>`;
  return back + renderFrame({ title: risk.title, description, action: tools, panel, className: `rk-frame${page.side ? " rk-frame--side" : ""}` });
}
