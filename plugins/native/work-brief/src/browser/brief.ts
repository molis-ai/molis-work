import { escapeHtml as esc, icon, renderAlert, renderBadge, renderCard, renderEmpty, renderFrame, renderPopover, renderPreviewCard, renderTextarea } from "@molis-ai/molis-work-plugin-sdk/ui";
import { act, actOptions, choices, nextMark, plainMark, section, slot, sourceMark, text, when } from "./parts.js";
import type { BriefChange, BriefPage, BriefProposal, BriefVersion, BriefView, Cite, Claim, NextMark, NextOption } from "./types.js";

/**
 * The brief as one page, read top to bottom (docs/design/work-brief-core, option A for all four parts): how each source reads, the
 * sentences with their bases after them, what waits for the person, what changed since the version before, the next steps.
 * Every object of another plugin is a place the shell fills (`slot`); the page shows only what the brief itself stored.
 */

const ownerNames = (version: BriefVersion | null) => new Map(version?.sources.map(row => [row.plugin_id, row.name]));
const modeToggle = (page: BriefPage) => choices(text("mode.label"), "mode", [{ value: "project", label: text("mode.project") }, { value: "personal", label: text("mode.personal") }], page.state.mode);

/** The version shown: an older one the person opened, else the current one. */
export const shownOf = (page: BriefPage): BriefView | null => page.state.old ?? page.state.head;

function versionControl(page: BriefPage, view: BriefView): string {
  const { state } = page, shown = view.version!, open = state.pop === "ver", head = state.head!;
  const current = head.brief!.current_version;
  const tag = shown.fixed ? text("version.fixed") : shown.version === current ? text("version.current") : "";
  const rows = head.versions.length < 2 ? `<p class="wb-pop-note">${esc(text("version.none"))}</p>` : `<ul class="mw-items">${[...head.versions].sort((a, b) => b.version - a.version).map(row =>
    `<li class="mw-item">${plainMark("history")}<span><strong>${esc(text("version.label", { version: row.version }))}</strong><small>${esc(`${when(row.as_of)} · ${text(`version.by.${row.produced_by.kind}`)}`)}</small></span><span class="mw-item__end">${
      row.fixed ? renderBadge({ label: text("version.fixed"), tone: "neutral" }) : ""}${row.version === shown.version ? renderBadge({ label: text("version.shown"), tone: "info" })
      : act(text("version.open"), "version", { variant: "ghost", value: String(row.version) })}</span></li>`).join("")}</ul>`;
  const fix = shown.fixed ? "" : `<div class="wb-pop-foot"><p class="wb-pop-note">${esc(text("version.fix-note"))}</p>${act(text("version.fix"), "fix", { icon: "pin", value: String(shown.version), disabled: Boolean(state.busy) })}</div>`;
  const pop = open ? renderPopover({ preview: true, className: "wb-pop wb-pop--end", body: rows + fix }) : "";
  return `<span class="wb-anchor">${act(`${text("version.label", { version: shown.version })}${tag ? " · " + tag : ""}`, "pop", { icon: "history", value: "ver",
    attrs: { "aria-expanded": String(open), "aria-haspopup": "dialog" } })}${pop}</span>`;
}

function headerActions(page: BriefPage, view: BriefView | null): string {
  const refreshing = page.state.busy === "refresh";
  return `<div class="wb-head-actions">${modeToggle(page)}${view?.version ? versionControl(page, view) : ""}${
    act(refreshing ? text("page.refreshing") : text("page.refresh"), "refresh", { icon: "refresh", loading: refreshing, disabled: Boolean(page.state.busy) })}</div>`;
}

function banner(page: BriefPage, view: BriefView): string {
  const { state } = page, shown = view.version!;
  if (state.old) {
    const toggle = choices(text("old.then-now"), "then-now", [{ value: "then", label: text("old.then") }, { value: "now", label: text("old.now") }], state.thenNow);
    return `${renderAlert({ tone: "info", title: text("old.title", { version: shown.version, time: when(shown.as_of) }), body: text(shown.fixed ? "old.body-fixed" : "old.body"),
      actions: [actOptions(text("old.back"), "back")] })}<div class="wb-thennow">${toggle}</div>`;
  }
  if (view.proposal) return renderAlert({ tone: "warning", title: text("proposal.title", { count: view.proposal.conflicts.length }), body: text("proposal.body") });
  if (state.delta) return renderAlert({ tone: "info", rise: true, title: text("delta.title"),
    body: state.delta.changed ? text("delta.some", { count: state.delta.changes.length, version: state.delta.version }) : text("delta.none") });
  return "";
}

function sources(version: BriefVersion): string {
  if (!version.sources.length) return `<p class="wb-muted">${esc(text("sources.none"))}</p>`;
  return `<ul class="wb-pulse">${version.sources.map(row => `<li><span class="wb-plug">${esc(row.name)}</span>${sourceMark(row)}${
    row.read === "stale" && row.read_at ? `<small class="wb-muted">${esc(text("sources.read-at", { time: when(row.read_at) }))}</small>` : ""}</li>`).join("")}</ul>`;
}

/** The numbered marks after a sentence; an open one shows what the sentence stood on when the version was saved. */
function footnotes(page: BriefPage, claim: Claim, index: number, names: Map<string, string>): string {
  return claim.cites.map((cite, at) => {
    const key = `cite:${claim.claim_id}:${at}`, open = page.state.pop === key;
    return `<span class="wb-anchor"><button type="button" class="wb-fn" data-wb-act="pop" data-wb-value="${esc(key)}" aria-expanded="${open}" aria-haspopup="dialog" aria-label="${
      esc(text("cite.label", { index: `${index}.${at + 1}` }))}"${cite.gap ? " data-stale" : ""}>${index}.${at + 1}</button>${open ? citeCard(cite, names) : ""}</span>`;
  }).join("");
}

function citeCard(cite: Cite, names: Map<string, string>): string {
  // A basis this person cannot read now carries no title: only the gap is said.
  if (!cite.title) return renderPopover({ preview: true, className: "wb-pop", body: `<p class="wb-pop-note">${esc(text("cite.unreadable"))}</p>` });
  const owner = names.get(cite.owner_plugin_id) ?? cite.owner_plugin_id;
  const gap = cite.gap === "gone" || cite.gap === "unreadable" ? `<p class="wb-pop-note">${esc(text(`cite.${cite.gap}`))}</p>` : slot("cite", cite.subject);
  return renderPopover({ preview: true, className: "wb-pop", body: `${renderPreviewCard({ title: cite.title, body: text("cite.from", { owner, time: when(cite.read_at) }) })}<div class="wb-pop-foot">${gap}</div>` });
}

function claimEditor(claim: Claim | null, busy: boolean): string {
  const id = claim?.claim_id ?? "+";
  return `<form class="wb-edit" data-wb-form="claim" data-wb-value="${esc(id)}">${renderTextarea({ name: "text", value: claim?.text ?? "", rows: 3,
    attrs: { "aria-label": text(claim ? "claim.edit" : "claim.add-placeholder"), maxlength: 600, required: true, "data-wb-focus": "editor" } })}<div class="wb-actions">${
    act(text("claim.save"), "save-claim", { variant: "primary", type: "submit", disabled: busy })}${act(text("claim.cancel"), "cancel-edit", { variant: "ghost" })}${
    claim ? act(text("claim.remove"), "remove-claim", { variant: "ghost", value: id, disabled: busy }) : ""}</div></form>`;
}

function claimHtml(page: BriefPage, claim: Claim, index: number, names: Map<string, string>): string {
  const { state } = page, old = Boolean(state.old);
  if (!old && state.editing === claim.claim_id) return `<li class="wb-claim">${claimEditor(claim, Boolean(state.busy))}</li>`;
  const conflict = !old && state.head?.proposal?.conflicts.find(entry => entry.claim_id === claim.claim_id);
  if (conflict) return `<li class="wb-claim">${conflictBlock(page, conflict.claim_id, conflict.mine, conflict.theirs)}</li>`;
  const change = !old && state.delta?.changes.find(entry => (entry.kind === "claim" || entry.kind === "cite") && entry.claim_id === claim.claim_id);
  const tags = [claim.supplied_by === "owner" ? renderBadge({ label: text("claim.owner"), tone: "neutral" }) : "", claim.edited && claim.supplied_by !== "owner" ? renderBadge({ label: text("claim.edited"), tone: "neutral" }) : "",
    change ? renderBadge({ label: text(change.kind === "claim" && change.change === "added" ? "claim.added" : "claim.changed"), tone: "info" }) : ""].join("");
  const gap = claim.cites.find(cite => cite.gap === "gone" || cite.gap === "unreadable")?.gap;
  let after = gap ? renderAlert({ tone: "info", role: null, title: text("claim.gap.title"), body: text(`claim.gap.${gap}`) }) : "";
  if (old && state.thenNow === "now") {
    const now = state.head?.version?.claims.find(entry => entry.claim_id === claim.claim_id);
    if (!now) after += `<p class="wb-now" data-craft-turn>${esc(text("old.now-gone"))}</p>`;
    else if (now.text !== claim.text) after += `<p class="wb-now" data-craft-turn><strong>${esc(text("old.now-is"))}</strong>${esc(now.text)}</p>`;
  }
  const edit = old || state.head?.proposal ? "" : act(text("claim.edit"), "edit-claim", { variant: "ghost", icon: "edit", iconOnly: true, value: claim.claim_id, className: "wb-claim__edit" });
  return `<li class="wb-claim"${change ? " data-craft-new" : ""}><div class="wb-claim__text">${tags}${esc(claim.text)}${footnotes(page, claim, index, names)}${edit}</div>${after}</li>`;
}

function conflictBlock(page: BriefPage, claimId: string, mine: string | null, theirs: string | null): string {
  const pick = page.state.picks[claimId], removed = text("proposal.removed");
  return `<div class="wb-conflict"><p class="wb-conflict__title">${icon("circle-alert")}<span>${esc(text("proposal.conflict"))}</span></p>
    <div class="wb-conflict__pair">${renderPreviewCard({ title: text("proposal.mine"), body: mine ?? removed })}${renderPreviewCard({ title: text("proposal.theirs"), body: theirs ?? removed })}</div>
    <div class="wb-actions">${act(text("proposal.keep"), "pick", { variant: pick === "mine" ? "primary" : "secondary", value: `${claimId}\u0000mine`, attrs: { "aria-pressed": String(pick === "mine") } })}${
      act(text("proposal.take"), "pick", { variant: pick === "theirs" ? "primary" : "secondary", value: `${claimId}\u0000theirs`, attrs: { "aria-pressed": String(pick === "theirs") } })}</div></div>`;
}

/** Conflicts on sentences the current version no longer shows in place (a sentence the person added or took out), then the two ways to settle. */
function proposalFoot(page: BriefPage, proposal: BriefProposal, version: BriefVersion): string {
  const placed = new Set(version.claims.map(claim => claim.claim_id));
  const loose = proposal.conflicts.filter(conflict => !placed.has(conflict.claim_id)).map(conflict => conflictBlock(page, conflict.claim_id, conflict.mine, conflict.theirs)).join("");
  const ready = proposal.conflicts.every(conflict => page.state.picks[conflict.claim_id]);
  return `${loose}<div class="wb-actions">${act(text("proposal.apply"), "resolve", { variant: "primary", disabled: !ready || Boolean(page.state.busy) })}${
    act(text("proposal.discard"), "discard", { variant: "ghost", disabled: Boolean(page.state.busy) })}</div>`;
}

function claims(page: BriefPage, view: BriefView): string {
  const version = view.version!, names = ownerNames(version), { state } = page, old = Boolean(state.old);
  const list = version.claims.length ? `<ol class="wb-claims">${version.claims.map((claim, index) => claimHtml(page, claim, index + 1, names)).join("")}</ol>`
    : `<p class="wb-muted">${esc(text("claim.none"))}</p>`;
  const read = version.sources.filter(row => row.read === "ok" || row.read === "none").length;
  const missing = version.sources.filter(row => row.read !== "ok" && row.read !== "none").map(row => `${row.name}（${text(`read.${row.read}`)}）`);
  const basis = `<p class="wb-basis">${icon("info")}<span>${esc(text("basis.line", { count: read, time: when(version.as_of) }) + (missing.length ? " · " + text("basis.missing", { names: missing.join(text("basis.joiner")) }) : ""))}</span></p>`;
  if (old) return list + basis;
  const proposal = view.proposal ? proposalFoot(page, view.proposal, version) : "";
  const own = view.proposal ? "" : state.editing === "+" ? claimEditor(null, Boolean(state.busy))
    : `<div class="wb-actions">${act(text("claim.add"), "edit-claim", { variant: "ghost", icon: "plus", value: "+" })}${act(text("claim.ask"), "ask", { variant: version.claims.length ? "ghost" : "secondary", icon: "sparkles" })}</div>`;
  return list + proposal + own + basis;
}

function attention(version: BriefVersion): string {
  if (!version.attention.length) return `<p class="wb-muted">${esc(text("attention.none"))}</p>`;
  return `<ul class="wb-att">${version.attention.map(item => `<li><div class="wb-att__why">${item.blocked ? sourceMark({ read: "ok", turn: "blocked" }) : sourceMark({ read: "ok", turn: "waiting" })}<strong>${esc(item.why)}</strong></div>${
    slot("attention", item.subject)}</li>`).join("")}</ul>`;
}

function changeRow(change: BriefChange, version: BriefVersion): string {
  const sentence = (id: string) => version.claims.find(claim => claim.claim_id === id)?.text ?? "";
  if (change.kind === "source") {
    const parts = [change.subjects_added ? text("change.added", { count: change.subjects_added }) : "", change.subjects_removed ? text("change.removed", { count: change.subjects_removed }) : "",
      change.from !== change.to && change.to ? text(`read.${change.to}`) : "", !change.to ? text("change.source-gone") : ""].filter(Boolean);
    return `<li class="mw-item">${plainMark("refresh")}<span><strong>${esc(change.name)}</strong><small>${esc(parts.join(" · ") || text("change.summary"))}</small></span></li>`;
  }
  if (change.kind === "claim") return `<li class="mw-item">${plainMark(change.change === "added" ? "plus" : change.change === "removed" ? "x" : "edit")}<span><strong>${esc(text(`change.claim.${change.change}`))}</strong><small>${
    esc(sentence(change.claim_id))}</small></span></li>`;
  if (change.kind === "cite") return `<li class="mw-item wb-change">${plainMark("link")}<span><strong>${esc(text(`change.cite.${change.change}`))}</strong><small>${esc(sentence(change.claim_id))}</small></span>${
    change.change === "gone" || change.change === "unreadable" || change.change === "removed" ? "" : slot("changed", change.subject)}</li>`;
  return `<li class="mw-item wb-change">${plainMark(change.change === "added" ? "plus" : "check")}<span><strong>${esc(text(`change.attention.${change.change}`))}</strong></span>${slot("changed", change.subject)}</li>`;
}

function changes(view: BriefView): string {
  const version = view.version!;
  if (version.base_version === null) return `<p class="wb-muted">${esc(text("change.first"))}</p>`;
  if (!view.changes) return `<p class="wb-muted" aria-busy="true">${esc(text("page.loading"))}</p>`;
  if (!view.changes.length) return `<p class="wb-muted">${esc(text("change.none"))}</p>`;
  return `<ul class="mw-items">${view.changes.slice(0, 12).map(change => changeRow(change, version)).join("")}</ul>`;
}

function nextCard(page: BriefPage, option: NextOption, mark: NextMark | undefined, primary: boolean): string {
  const busy = Boolean(page.state.busy), card = mark?.card ?? (option.act.kind === "card" ? option.act.card : null);
  const state = mark?.state;
  const kicker = option.act.kind === "card" ? text("next.kicker", { provider: option.act.card.provider }) : text("next.kicker-assistant");
  const target = card?.target ? `<p class="wb-step__target">${esc(`${text("next.on")} ${card.target.title}`)}</p>` : "";
  const outcome = state === "stale" ? text("next.stale-note") : (state === "done" || state === "failed") && card?.outcome ? card.outcome : "";
  const body = `<p class="wb-step__why">${esc(option.why)}</p>${target}${option.subject && !card?.target ? slot("next", option.subject) : ""}${outcome ? `<p class="wb-muted">${esc(outcome)}</p>` : ""}`;
  const run = option.act.kind === "card" ? act(text(state === "failed" ? "next.retry" : "next.do"), "run-next", { variant: primary ? "primary" : "secondary", value: option.option_id, disabled: busy, icon: state === "failed" ? "refresh" : undefined })
    : act(text("next.hand"), "hand-next", { variant: primary ? "primary" : "secondary", icon: "sparkles", value: option.option_id, disabled: busy });
  const footer = !state ? act(text("next.skip"), "skip-next", { variant: "ghost", value: option.option_id, disabled: busy }) + run
    : state === "failed" ? run : state === "later" || state === "handed" ? act(text("next.undo"), "undo-next", { variant: "ghost", icon: "undo", value: option.option_id, disabled: busy }) : "";
  return renderCard({ className: "wb-step", title: option.text, description: kicker, action: state ? nextMark(state) : "", body, footer: footer ? `<div class="wb-actions wb-actions--end">${footer}</div>` : undefined });
}

function next(page: BriefPage, view: BriefView): string {
  const version = view.version!;
  if (!version.next.length) return `<p class="wb-muted">${esc(text("next.none"))}</p>`;
  const marks = new Map(view.marks.map(mark => [mark.option_id, mark]));
  // One ink-blue button on a screen: the first step still open, and none while a proposal waits.
  const first = view.proposal ? undefined : version.next.find(option => !marks.has(option.option_id))?.option_id;
  return `<div class="wb-next">${version.next.map(option => nextCard(page, option, marks.get(option.option_id), option.option_id === first)).join("")}</div>`;
}

export function renderBrief(page: BriefPage): string {
  const { state, host } = page, view = shownOf(page);
  const title = text("page.title"), project = host.projectTitle();
  if (state.error) return renderFrame({ className: "wb-frame", title, description: project, action: headerActions(page, null),
    panel: renderAlert({ tone: "danger", role: "alert", title: text("page.failed"), body: state.error, actions: [actOptions(text("page.retry"), "reload", { icon: "refresh" })] }) });
  if (!view) return renderFrame({ className: "wb-frame", title, description: project, action: headerActions(page, null), panel: `<p class="wb-muted" aria-busy="true">${esc(text("page.loading"))}</p>` });
  if (!view.version) return renderFrame({ className: "wb-frame", title, description: project, action: headerActions(page, view),
    panel: renderEmpty({ icon: "note", title: text("empty.title"), body: text("empty.body"),
      action: `<div class="mw-empty__actions">${act(text("empty.refresh"), "refresh", { variant: "primary", icon: "refresh", disabled: Boolean(state.busy) })}${act(text("empty.ask"), "ask", { icon: "sparkles" })}</div>` }) });
  const version = view.version, old = Boolean(state.old);
  const body = `${banner(page, view)}${section("sources", sources(version))}${section("now", claims(page, view))}${
    old ? "" : section("attention", attention(version)) + section("changes", changes(view)) + section("next", next(page, view))}`;
  return renderFrame({ className: "wb-frame", title: view.brief?.title || title, description: `${project} · ${text("page.as-of", { time: when(version.as_of) })}`, action: headerActions(page, view), panel: body });
}

export function renderPersonal(page: BriefPage): string {
  const { state, host } = page, view = state.personal, here = host.projectId();
  const action = `<div class="wb-head-actions">${modeToggle(page)}${act(state.busy === "refresh" ? text("page.refreshing") : text("personal.refresh"), "refresh-personal", { icon: "refresh", loading: state.busy === "refresh", disabled: Boolean(state.busy) })}</div>`;
  const frame = (panel: string, description = text("personal.note")) => renderFrame({ className: "wb-frame", title: text("personal.title"), description, action, panel });
  if (state.personalError) return frame(renderAlert({ tone: "danger", role: "alert", title: text("page.failed"), body: state.personalError, actions: [actOptions(text("page.retry"), "reload-personal", { icon: "refresh" })] }));
  if (!view) return frame(`<p class="wb-muted" aria-busy="true">${esc(text("page.loading"))}</p>`);
  const partial = view.projects_complete ? "" : renderAlert({ tone: "info", role: null, title: text("personal.partial") });
  if (!view.items.length) return frame(partial + renderEmpty({ icon: "check", title: text("personal.none"), body: text("personal.none-body") }));
  const rows = view.items.map(item => {
    const label = renderBadge({ label: text(`personal.label.${item.label}`), tone: item.label === "project" ? "info" : "neutral" });
    const where = item.label !== "project" || !item.project_id ? (item.owner_name ? `<small>${esc(item.owner_name)}</small>` : "")
      : item.project_id === here ? `<small>${esc(text("personal.here"))}</small>`
      : `<a class="mw-btn mw-btn--ghost mw-btn--sm" href="/projects/${encodeURIComponent(item.project_id)}/">${esc(text("personal.open-project"))}</a>`;
    const mark = item.kind === "attention" ? sourceMark({ read: "ok", turn: item.blocked ? "blocked" : "waiting" }) : "";
    return `<li class="mw-item">${label}<span><strong>${esc(item.text)}</strong><small>${esc([text(`personal.kind.${item.kind}`), item.why ?? ""].filter(Boolean).join(" · "))}</small></span><span class="mw-item__end">${mark}${where}</span></li>`;
  }).join("");
  return frame(`${partial}<ul class="mw-items wb-personal">${rows}</ul>`);
}
