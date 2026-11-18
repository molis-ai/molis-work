import type {
  CharacterMemberEntry, CharacterOriginalEntry, CharacterRoleCatalog, CharacterRoleSection,
} from "@molis-ai/molis-work-contracts/modules/characters";
import {
  escapeHtml as esc, icon, renderAlert, renderAvatar, renderBadge, renderButton, renderEmpty, renderSourceLadder,
  type MwButtonOptions, type MwSourceLayer,
} from "@molis-ai/molis-work-plugin-sdk/ui";

const uiText = globalThis.t;
const say = (key: string, values?: Record<string, string | number>): string => uiText.text(key, values);

/** What is open in place on the page: the add panel, one row's menu, one row's turn-off question, one difference. */
export interface PageUi {
  add: boolean;
  menu: string | null;
  stopAsk: string | null;
  diff: string | null;
  flash: string | null;
  /** The difference shown under an upstream note: this project's section next to the original's current one. */
  diffText?: { ours: string; theirs: string; version: number };
}

export type Member = CharacterMemberEntry;
export type Original = CharacterOriginalEntry;
const SECTIONS: readonly CharacterRoleSection[] = ["work_style", "capabilities"];

/** A button that the page's one click handler answers by its `data-roles-act` and argument. */
const act = (name: string, arg = "", extra: Partial<MwButtonOptions> = {}): string => renderButton({
  size: "sm", variant: "secondary", label: "", ...extra, attrs: { "data-roles-act": name, "data-roles-arg": arg, ...extra.attrs },
} as MwButtonOptions);
const state = (tone: "neutral" | "warning", text: string): string => `<span class="settings-state settings-state--${tone}">${esc(text)}</span>`;
const section = (id: string, title: string, body: string, head = ""): string =>
  `<section class="settings-section" aria-labelledby="${id}"><div class="roles-sec-head"><h2 id="${id}">${esc(title)}</h2>${head}</div>${body}</section>`;
const setRow = (title: string, hint: string, value: string): string =>
  `<section class="settings-setting-row"><div class="setting-copy"><strong>${esc(title)}</strong><span>${esc(hint)}</span></div><div class="setting-value">${value}</div></section>`;
const inset = (body: string, labelledBy: string, extra = ""): string => `<div class="roles-inset${extra}" role="group" aria-labelledby="${labelledBy}">${body}</div>`;
const option = (value: string, label: string, selected: boolean): string => `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(label)}</option>`;

export const memberKey = (member: Member): string => member.role.current.member_id;
export const originalOf = (catalog: CharacterRoleCatalog, member: Member): Original | undefined =>
  catalog.originals.find(original => original.ref.character_id === member.role.current.original.character_id);
const overridden = (member: Member): CharacterRoleSection[] => SECTIONS.filter(name => member.role.sections[name].mode === "override");
const originalChanged = (member: Member): CharacterRoleSection[] =>
  SECTIONS.filter(name => { const status = member.role.sections[name]; return status.mode === "override" && status.original_changed; });

/** The value a project member stands for in the default select and the ladder. */
function memberTitle(catalog: CharacterRoleCatalog, memberId: string): string | null {
  return catalog.members.find(member => memberKey(member) === memberId)?.title ?? null;
}
function personalTitle(catalog: CharacterRoleCatalog): string | null {
  const ref = catalog.defaults.personal;
  return ref ? catalog.originals.find(original => original.ref.character_id === ref.character_id)?.title ?? null : null;
}

/** Where a new task's role comes from: the layers nearest first, the one in use lifted (the board's source ladder). */
export function ladder(catalog: CharacterRoleCatalog): string {
  const effective = catalog.effective, project = catalog.defaults.project, mine = personalTitle(catalog);
  const stopped = effective.kind === "assistant" && effective.source === "assistant" && effective.stopped_project_default;
  const projectValue = project === null ? null : project.kind === "assistant" ? say("workbench.roles.assistant") : memberTitle(catalog, project.member_id);
  const layers: MwSourceLayer[] = [
    { name: say("workbench.roles.layer-task"), value: say("workbench.roles.layer-task-only"), state: "empty" },
    { name: say("workbench.roles.layer-project"), value: stopped ? say("workbench.roles.off-named", { name: projectValue ?? "" }) : projectValue ?? say("workbench.roles.not-set"),
      state: stopped ? "off" : effective.source === "project" ? "on" : project ? "under" : "empty" },
    { name: say("workbench.roles.layer-mine"), value: mine ?? say("workbench.roles.not-set"), state: effective.source === "personal" ? "on" : mine ? "under" : "empty" },
    { name: say("workbench.roles.layer-otherwise"), value: say("workbench.roles.assistant"), state: effective.source === "assistant" ? "on" : "under" },
  ];
  return `<div class="roles-ladder">${renderSourceLadder({ label: say("workbench.roles.ladder-label"), layers })}</div>`;
}

/** Project settings › 角色 › who does it by default: the select, the ladder, and what to do when the default is turned off. */
function projectDefault(catalog: CharacterRoleCatalog): string {
  const project = catalog.defaults.project, mine = personalTitle(catalog), effective = catalog.effective;
  const stopped = effective.kind === "assistant" && effective.source === "assistant" ? effective.stopped_project_default : undefined;
  const current = project === null ? "inherit" : project.kind === "assistant" ? "assistant" : "project:" + project.member_id;
  const options = [option("inherit", say("workbench.roles.use-my-default", { name: mine ?? say("workbench.roles.assistant") }), current === "inherit"),
    option("assistant", say("workbench.roles.assistant"), current === "assistant"),
    ...catalog.members.filter(member => member.availability.available || current === "project:" + memberKey(member))
      .map(member => option("project:" + memberKey(member), member.availability.available ? member.title : say("workbench.roles.off-named", { name: member.title }), current === "project:" + memberKey(member)))];
  const select = `<select class="mw-select" data-slot="select" data-roles-default="project" aria-label="${esc(say("workbench.roles.default-new"))}">${options.join("")}</select>`;
  const back = project ? act("default-inherit", "", { variant: "ghost", label: say("workbench.roles.use-mine-again") }) : "";
  const member = stopped ? catalog.members.find(entry => memberKey(entry) === stopped.member_id) : undefined;
  const off = member ? renderAlert({ tone: "warning", title: say("workbench.roles.default-off-title", { name: member.title }), body: say("workbench.roles.default-off-body"),
    actions: [{ size: "sm", label: say("workbench.roles.turn-back-on"), attrs: { "data-roles-act": member.availability.available === false && member.availability.reason === "original_disabled" ? "original-on" : "member-on",
      "data-roles-arg": member.availability.available === false && member.availability.reason === "original_disabled" ? member.role.current.original.character_id : memberKey(member) } }] }) : "";
  return section("roles-default-title", say("workbench.roles.default-title"), setRow(say("workbench.roles.default-new"), say("workbench.roles.default-new-hint"), select + back) + ladder(catalog) + off);
}

/** What a member follows and what this project changed, in one line under its name. */
function memberCaption(member: Member): string {
  const version = member.role.current.original.version, changed = overridden(member);
  if (!changed.length) return say("workbench.roles.follows-all", { version });
  if (changed.length === 2) return say("workbench.roles.changed-both", { version });
  return say(changed[0] === "work_style" ? "workbench.roles.changed-way" : "workbench.roles.changed-tools", { version });
}

/** A row's "more" menu (the board's mw-menu), anchored under its button. */
function moreMenu(ui: PageUi, id: string, title: string, items: readonly [string, string, string][]): string {
  const open = ui.menu === id;
  const button = renderButton({ variant: "ghost", size: "sm", iconOnly: true, icon: "more", label: say("workbench.roles.more-named", { name: title }),
    attrs: { "data-roles-act": "more", "data-roles-arg": id, "aria-haspopup": "menu", "aria-expanded": String(open), ...(open ? { "aria-controls": "roles-menu-" + id } : {}) } });
  const menu = open ? `<div class="mw-menu" data-slot="menu" role="menu" id="roles-menu-${esc(id)}" aria-label="${esc(say("workbench.roles.more-for", { name: title }))}">${items.map(([action, glyph, label]) =>
    `<button type="button" class="mw-menu__item" role="menuitem" data-roles-act="${action}" data-roles-arg="${esc(id)}">${icon(glyph as Parameters<typeof icon>[0])}<span data-slot="menu-item-label">${esc(label)}</span></button>`).join("")}</div>` : "";
  return `<div class="roles-more">${button}${menu}</div>`;
}

/** The question under a row before it is turned off: what changes, what stays, and that it can come back. */
function stopQuestion(id: string, title: string, facts: readonly [string, string][]): string {
  return inset(`<p class="roles-inset__title" id="roles-stop-${esc(id)}" tabindex="-1">${esc(say("workbench.roles.stop-what", { name: title }))}</p>${facts.map(([name, effect]) =>
    `<div class="roles-fact"><span>${esc(name)}</span><span>${esc(effect)}</span></div>`).join("")}<div class="roles-inset__end">${act("stop-cancel", id, { variant: "ghost", label: say("common.control.cancel") })}${act("stop-do", id, { variant: "primary", label: say("workbench.roles.turn-off"), attrs: { "aria-label": say("workbench.roles.turn-off-named", { name: title }) } })}</div>`,
  "roles-stop-" + id, " roles-inset--confirm");
}

function memberRow(catalog: CharacterRoleCatalog, ui: PageUi, member: Member): string {
  const id = memberKey(member), title = member.title, changed = overridden(member);
  const off = member.role.state === "disabled", originalOff = !member.availability.available && member.availability.reason === "original_disabled";
  const status = off ? state("warning", say("workbench.roles.turned-off")) + act("member-on", id, { variant: "ghost", label: say("workbench.roles.turn-back-on"), attrs: { "aria-label": say("workbench.roles.turn-back-on-named", { name: title }) } })
    : originalOff ? state("warning", say("workbench.roles.original-off"))
    : changed.length ? state("warning", say(changed.length === 2 ? "workbench.roles.two-changed" : "workbench.roles.one-changed")) + act("refollow", id, { variant: "ghost", label: say("workbench.roles.follow-again"), attrs: { "aria-label": say("workbench.roles.follow-again-named", { name: title }) } })
    : state("neutral", say("workbench.roles.following"));
  const adjust = act("open", "member:" + id, { label: say("workbench.roles.adjust"), attrs: { "aria-label": say("workbench.roles.adjust-named", { name: title }) } });
  const more = off ? "" : moreMenu(ui, "member:" + id, title, [["stop-ask", "pause", say("workbench.roles.turn-off-ask")], ["member-remove", "x", say("workbench.roles.remove")]]);
  const facts: [string, string][] = [[say("workbench.roles.fact-default-here"), say("workbench.roles.fact-assistant-does")], [say("workbench.roles.fact-running"), say("workbench.roles.fact-keeps-version")],
    [say("workbench.roles.fact-records"), say("workbench.roles.fact-kept")]];
  const ask = ui.stopAsk === "member:" + id ? stopQuestion("member:" + id, title, facts) : "";
  const isDefault = catalog.defaults.project?.kind === "project" && catalog.defaults.project.member_id === id;
  return `<div class="settings-setting-row roles-row${ui.flash === "member:" + id ? " is-flash" : ""}" id="roles-row-member-${esc(id)}" tabindex="-1" aria-labelledby="roles-name-member-${esc(id)}">
    <div class="settings-record-title">${renderAvatar({ label: title })}<div><h3 id="roles-name-member-${esc(id)}"><span translate="no">${esc(title)}</span>${isDefault ? renderBadge({ label: say("workbench.roles.project-default") }) : ""}</h3><p>${esc(memberCaption(member))}</p></div></div>
    <div class="setting-value">${status}${adjust}${more}</div></div>${ask}`;
}

/** The note under a member whose original also changed a section this project keeps: look, follow, or keep this project's. */
function upstream(catalog: CharacterRoleCatalog, ui: PageUi, member: Member): string {
  const changed = originalChanged(member);
  if (!changed.length) return "";
  const id = memberKey(member), version = originalOf(catalog, member)?.version ?? member.role.current.original.version;
  const open = ui.diff === id && ui.diffText;
  const diff = open ? inset(`<div class="roles-diff"><section><h4>${esc(say("workbench.roles.this-project"))}</h4><p translate="no">${esc(ui.diffText!.ours)}</p></section><section><h4>${esc(say("workbench.roles.original-version", { version: ui.diffText!.version }))}</h4><p translate="no">${esc(ui.diffText!.theirs)}</p></section></div>`, "roles-diff-" + id) : "";
  const alert = renderAlert({ tone: "warning", title: say(changed[0] === "work_style" ? "workbench.roles.upstream-way" : "workbench.roles.upstream-tools", { name: member.title, version: version ?? 0 }),
    body: say("workbench.roles.upstream-body"), actions: [
      { size: "sm", label: say(open ? "workbench.roles.hide-difference" : "workbench.roles.see-difference"), attrs: { "data-roles-act": "diff", "data-roles-arg": id, "aria-expanded": String(Boolean(open)) } },
      { size: "sm", label: say("workbench.roles.follow-original"), attrs: { "data-roles-act": "refollow", "data-roles-arg": id } },
      { size: "sm", variant: "ghost", label: say("workbench.roles.keep-this-project"), attrs: { "data-roles-act": "keep-own", "data-roles-arg": id } },
    ] });
  return alert.replace(/<\/div>$/u, diff + "</div>");
}

/** The add panel under 添加角色: the person's roles not yet here, and writing a new one. */
function addPanel(catalog: CharacterRoleCatalog): string {
  const here = new Set(catalog.members.map(member => member.role.current.original.character_id));
  const candidates = catalog.originals.filter(original => !here.has(original.ref.character_id) && original.state === "active" && original.version !== null);
  const rows = candidates.map(original => `<div class="settings-setting-row roles-row"><div class="settings-record-title">${renderAvatar({ label: original.title })}<div><h3><span translate="no">${esc(original.title)}</span></h3><p>${esc(say("workbench.roles.version-used", { version: original.version ?? 0, count: original.use.projects }))}</p></div></div>
    <div class="setting-value">${act("member-add", original.ref.character_id, { variant: "primary", label: say("workbench.roles.add"), attrs: { "aria-label": say("workbench.roles.add-named", { name: original.title }) } })}</div></div>`).join("");
  return inset(`<p class="roles-inset__title" id="roles-add-title">${esc(say("workbench.roles.add-about"))}</p>${rows || `<p class="roles-hint">${esc(say("workbench.roles.all-here"))}</p>`}
    <div class="roles-inline">${act("open", "new", { variant: "ghost", icon: "plus", label: say("workbench.roles.write-new") })}</div>`, "roles-add-title", " roles-inset--add");
}

/** Project settings › 角色: who does it by default here, and this project's roles. */
export function projectBody(catalog: CharacterRoleCatalog, ui: PageUi): string {
  const add = act("add", "", { icon: ui.add ? "x" : "plus", label: say(ui.add ? "workbench.roles.close" : "workbench.roles.add-role"), attrs: { "aria-expanded": String(ui.add) } });
  const rows = catalog.members.map(member => upstream(catalog, ui, member) + memberRow(catalog, ui, member)).join("");
  return projectDefault(catalog) + section("roles-members-title", say("workbench.roles.members-title"),
    `<p class="roles-hint">${esc(say("workbench.roles.members-hint"))}</p>${ui.add ? addPanel(catalog) : ""}${rows || `<p class="roles-hint">${esc(say("workbench.roles.no-members"))}</p>`}`, add);
}

function originalCaption(original: Original): string {
  if (original.version === null) return say("workbench.roles.never-saved");
  if (!original.use.projects) return say("workbench.roles.version-only", { version: original.version });
  return say(original.use.changed ? "workbench.roles.version-used-changed" : "workbench.roles.version-used", { version: original.version, count: original.use.projects, changed: original.use.changed });
}

function originalRow(catalog: CharacterRoleCatalog, ui: PageUi, original: Original): string {
  const id = original.ref.character_id, title = original.title, off = original.state === "disabled";
  const isDefault = catalog.defaults.personal?.character_id === id;
  const status = off ? state("warning", say("workbench.roles.turned-off")) + act("original-on", id, { variant: "ghost", label: say("workbench.roles.turn-back-on"), attrs: { "aria-label": say("workbench.roles.turn-back-on-named", { name: title }) } }) : "";
  const adjust = act("open", "original:" + id, { label: say("workbench.roles.adjust"), attrs: { "aria-label": say("workbench.roles.adjust-named", { name: title }) } });
  const more = off ? "" : moreMenu(ui, "original:" + id, title, [["copy", "copy", say("workbench.roles.duplicate")], ["stop-ask", "pause", say("workbench.roles.turn-off-ask")]]);
  const facts: [string, string][] = [[say("workbench.roles.fact-default-projects"), say("workbench.roles.fact-assistant-does")],
    [say("workbench.roles.fact-used-in", { count: original.use.projects }), say("workbench.roles.fact-keeps-version")], [say("workbench.roles.fact-records"), say("workbench.roles.fact-kept")]];
  const ask = ui.stopAsk === "original:" + id ? stopQuestion("original:" + id, title, facts) : "";
  return `<div class="settings-setting-row roles-row${ui.flash === "original:" + id ? " is-flash" : ""}" id="roles-row-original-${esc(id)}" data-character-id="${esc(id)}" tabindex="-1" aria-labelledby="roles-name-original-${esc(id)}">
    <div class="settings-record-title">${renderAvatar({ label: title })}<div><h3 id="roles-name-original-${esc(id)}"><span translate="no">${esc(title)}</span>${isDefault ? renderBadge({ label: say("workbench.roles.my-default") }) : ""}${original.origin ? renderBadge({ label: say("workbench.roles.from-template") }) : ""}</h3><p>${esc(originalCaption(original))}</p></div></div>
    <div class="setting-value">${status}${adjust}${more}</div></div>${ask}`;
}

/** Settings › 角色: the person's default and their roles. */
export function personalBody(catalog: CharacterRoleCatalog, ui: PageUi): string {
  const mine = catalog.defaults.personal?.character_id ?? "";
  const choosable = catalog.originals.filter(original => original.availability.available || original.ref.character_id === mine);
  const select = `<select class="mw-select" data-slot="select" data-roles-default="personal" aria-label="${esc(say("workbench.roles.my-default"))}">${[option("", say("workbench.roles.assistant"), !mine),
    ...choosable.map(original => option(original.ref.character_id, original.availability.available ? original.title : say("workbench.roles.off-named", { name: original.title }), original.ref.character_id === mine))].join("")}</select>`;
  const head = `<span>${act("import", "", { icon: "upload", label: say("workbench.characters.import-local") })}${act("open", "new", { variant: "primary", icon: "plus", label: say("workbench.characters.new") })}</span>`;
  const rows = catalog.originals.map(original => originalRow(catalog, ui, original)).join("");
  const empty = renderEmpty({ icon: "user", title: say("workbench.roles.empty-title"), body: say("workbench.roles.empty-body"),
    action: `<div class="mw-empty__actions">${act("open", "new", { variant: "primary", icon: "plus", label: say("workbench.roles.new-role") })}${act("import", "", { icon: "upload", label: say("workbench.characters.import-local") })}</div>` });
  return section("roles-mydef-title", say("workbench.roles.default-title"), setRow(say("workbench.roles.my-default"), say("workbench.roles.my-default-hint"), select))
    + section("roles-mine-title", say("workbench.roles.mine-title"), rows || empty, rows ? head : "");
}
