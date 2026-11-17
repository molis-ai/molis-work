import type {
  CharacterMemberEntry, CharacterRole, CharacterRoleCatalog, CharacterRoleContent, CharacterRoleSection, CharacterRoleVersionEntry,
  CharacterRoleVersionRef,
} from "@molis-ai/molis-work-contracts/modules/characters";
import { escapeHtml as esc, icon, renderAlert, renderAvatar, renderButton, type MwButtonOptions } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ActionClient } from "./action-client.js";
import { isConflict, messageOf, type ActionRef, type CharacterRecord, type CharacterRequest, type Part } from "./common.js";
import { WindowDrafts } from "./drafts.js";
import { memberKey, originalOf } from "./view.js";

const uiText = globalThis.t;
const say = (key: string, values?: Record<string, unknown>): string => uiText.text(key, values as Record<string, string | number>);

/** What the drawer edits: one of the person's originals, a member of this project, or a role not written yet (maybe copied). */
export type DrawerTarget = { kind: "original"; id: string } | { kind: "member"; id: string } | { kind: "new"; from?: CharacterRoleContent };
type Phase = "clean" | "dirty" | "saved" | "conflict";
type Ask = { kind: "close" } | { kind: "restore"; entry: CharacterRoleVersionEntry };
type Member = CharacterMemberEntry;
type MemberRole = Extract<CharacterRole, { layer: "project" }>;

/** What the page lends the drawer. */
export interface DrawerHost {
  q: Part;
  scope: "project" | "personal";
  /** Where this page keeps a window's unsaved edits (session storage). */
  storage: string;
  request: CharacterRequest;
  actions: ActionClient;
  catalog(): CharacterRoleCatalog | null;
  /** Reads the catalog again and redraws the page under the drawer. */
  reload(): Promise<void>;
  note(text: string): void;
  /** The row a newly written role landed on, to flash and to take focus when the drawer closes. */
  landed(rowKey: string): void;
  /** What an imported original shows: its source files, trying it now and its native runs. */
  imported(record: CharacterRecord | null, runnable: boolean): void;
}

const SECTIONS: readonly CharacterRoleSection[] = ["work_style", "capabilities"];
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const versionOf = (ref: CharacterRoleVersionRef): number => ref.kind === "personal" ? ref.version : ref.member_version;
const button = (options: MwButtonOptions): string => renderButton({ size: "sm", variant: "secondary", ...options });
const state = (tone: "neutral" | "warning", text: string): string => `<span class="settings-state settings-state--${tone}">${esc(text)}</span>`;

/** The role editor over the current page (plan C, user 2026-11-04): save and use, where it goes, undo, conflicts, versions, leaving. */
/**
 * Draws `html` into `part` only when it differs from what is there: the footer is redrawn on every edit, and an edit that ends with
 * the field losing focus (`change`, on the press of a footer button) would otherwise swap the button out between press and release,
 * so the click would never land.
 */
const painted = new WeakMap<HTMLElement, string>();
function paint(part: HTMLElement, html: string): void {
  if (painted.get(part) === html) return;
  part.innerHTML = html;
  painted.set(part, html);
}

/**
 * The role drawer in three layers: what it is editing (here), how it is drawn (`RoleDrawerView`) and what it does (`RoleDrawer`).
 */
class RoleDrawerState {
  protected readonly dialog: HTMLDialogElement;
  protected target: DrawerTarget | null = null;
  protected versions: CharacterRoleVersionEntry[] = [];
  /** The member's original as it is now, to show what following means and to save a section to it. */
  protected original: CharacterRoleContent | null = null;
  protected baseline: CharacterRoleContent = { title: "", instructions: "", host_tools: null };
  protected phase: Phase = "clean";
  protected where: "project" | "mine" = "project";
  protected ask: Ask | null = null;
  protected saved: { title: string; body: string; undo?: () => Promise<void> } | null = null;
  protected theirs: CharacterRoleContent | null = null;
  protected diffOpen = false;
  protected busy = false;
  protected opener: HTMLElement | null = null;
  protected focusRow: string | null = null;
  protected readonly drafts: WindowDrafts;
  /** The version an unsaved edit was typed over, kept with it in this window. */
  protected editBase = 0;

  constructor(protected readonly host: DrawerHost) {
    this.dialog = host.q<HTMLDialogElement>("drawer");
    this.drafts = new WindowDrafts(host.storage);
  }

  protected part<T extends HTMLElement = HTMLElement>(name: string): T { return this.host.q<T>(name); }
  protected member(): Member | undefined {
    const target = this.target;
    return target?.kind === "member" ? this.host.catalog()?.members.find(entry => memberKey(entry) === target.id) : undefined;
  }
  protected originalEntry() {
    const target = this.target, catalog = this.host.catalog();
    if (!catalog || !target || target.kind === "new") return undefined;
    if (target.kind === "original") return catalog.originals.find(entry => entry.ref.character_id === target.id);
    const member = this.member();
    return member ? originalOf(catalog, member) : undefined;
  }
  protected title(): string {
    if (this.target?.kind === "new") return this.values().title.trim() || say("workbench.roles.new-role");
    return this.member()?.title ?? this.originalEntry()?.title ?? "";
  }

  /** The fields as they are now: what saving would write. */
  protected values(): CharacterRoleContent {
    const inherit = this.part<HTMLInputElement>("inherit").checked;
    return { title: this.part<HTMLInputElement>("title").value, instructions: this.part<HTMLTextAreaElement>("instructions").value,
      host_tools: inherit ? null : this.part<HTMLInputElement>("tools").value.split(",").map(tool => tool.trim()).filter(Boolean),
      action_tools: this.host.actions.value() as CharacterRoleContent["action_tools"] };
  }
  protected fill(content: CharacterRoleContent): void {
    this.part<HTMLInputElement>("title").value = content.title;
    this.part<HTMLTextAreaElement>("instructions").value = content.instructions;
    this.part<HTMLInputElement>("inherit").checked = content.host_tools === null;
    this.part<HTMLInputElement>("tools").value = (content.host_tools ?? []).join(", ");
    this.part("tools-field").hidden = content.host_tools === null;
    this.host.actions.render((content.action_tools ?? null) as ActionRef[] | null);
  }
  protected edited(): { way: boolean; tools: boolean; title: boolean } {
    const now = this.values(), base = this.baseline;
    return { way: now.instructions !== base.instructions, title: now.title !== base.title,
      tools: !same(now.host_tools, base.host_tools) || !same(now.action_tools ?? null, base.action_tools ?? null) };
  }
  protected dirty(): boolean { return this.phase === "dirty" || this.phase === "conflict"; }
  protected roleKey(): string | null { const target = this.target; return !target || target.kind === "new" ? null : target.kind + ":" + target.id; }
  /** The version the role reads as now. */
  protected now(): CharacterRoleVersionEntry | undefined { return this.versions.find(entry => entry.current); }
  protected currentVersion(): number { const current = this.now(); return current ? versionOf(current.ref) : 0; }
  /** Keeps this window's unsaved edit of the role, or forgets it once it is saved or dropped. */
  protected keep(): void {
    const key = this.roleKey();
    if (!key) return;
    if (!this.drafts.set(key, this.dirty() ? { content: this.values(), version: this.editBase } : null)) this.host.note(say("workbench.characters.draft-cache-unavailable"));
  }
}

/** How the drawer is drawn from its state. */
class RoleDrawerView extends RoleDrawerState {
  protected controls(): void {
    this.dialog.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>("[data-character-drawer-foot] button, [data-character-drawer-notices] button, [data-roles-version]")
      .forEach(control => { control.disabled = this.busy || control.dataset.rolesDisabled === "true"; });
  }

  // ---------- drawing ----------
  protected render(): void {
    if (!this.target) return;
    this.renderHead(); this.renderNotices(); this.renderSections(); this.renderVersions(); this.renderFoot(); this.controls();
    // An imported original shows its source; it can be tried in a project's folder when this project uses it as it is
    // (an original from Settings has no folder to run in, and a member that changed a section is not the original any more).
    const entry = this.originalEntry(), member = this.member();
    const content = this.target.kind === "original" ? this.now()?.content
      : member && SECTIONS.every(name => member.role.sections[name].mode === "follow") ? this.original ?? undefined : undefined;
    const record: CharacterRecord | null = entry && content?.import_snapshot
      ? { ...content, action_tools: (content.action_tools ?? null) as ActionRef[] | null, character_id: entry.ref.character_id, revision: entry.draft_revision, state: entry.state,
        import_snapshot: content.import_snapshot as CharacterRecord["import_snapshot"] } : null;
    this.host.imported(record, Boolean(record && this.host.scope === "project" && entry?.state === "active" && entry.version !== null));
  }

  protected caption(): string {
    const target = this.target!, entry = this.originalEntry();
    if (target.kind === "new") return say(this.host.scope === "project" ? "workbench.roles.new-caption-project" : "workbench.roles.new-caption");
    if (target.kind === "original") return entry ? say("workbench.roles.original-caption", { version: entry.version ?? 0, count: entry.use.projects }) : "";
    const member = this.member();
    if (!member) return "";
    const version = member.role.current.original.version, changed = SECTIONS.filter(name => member.role.sections[name].mode === "override");
    return say(!changed.length ? "workbench.roles.member-caption-follow" : changed.length === 2 ? "workbench.roles.member-caption-both" : changed[0] === "work_style" ? "workbench.roles.member-caption-way" : "workbench.roles.member-caption-tools", { version });
  }

  protected renderHead(): void {
    const title = this.title();
    paint(this.part("drawer-head"), `<div class="roles-drawer__title">${renderAvatar({ label: title })}<div><h2 id="roles-drawer-title" translate="no">${esc(title)}</h2><p>${esc(this.caption())}</p></div></div>`
      + renderButton({ variant: "ghost", size: "sm", iconOnly: true, icon: "x", label: say("common.control.close"), className: "mw-dialog__close", attrs: { "data-roles-drawer": "close" } }));
  }

  protected renderNotices(): void {
    const parts: string[] = [];
    if (this.phase === "saved" && this.saved) parts.push(renderAlert({ tone: "success", title: this.saved.title, body: this.saved.body,
      actions: this.saved.undo ? [{ size: "sm", label: say("workbench.roles.undo"), attrs: { "data-roles-drawer": "undo" } }] : [] }));
    if (this.phase === "conflict") {
      const diff = this.diffOpen && this.theirs ? `<div class="roles-inset" role="group" aria-label="${esc(say("workbench.roles.theirs-vs-yours"))}"><div class="roles-diff"><section><h4>${esc(say("workbench.roles.theirs"))}</h4><p translate="no">${esc(this.theirs.instructions)}</p></section><section><h4>${esc(say("workbench.roles.yours"))}</h4><p translate="no">${esc(this.values().instructions)}</p></section></div></div>` : "";
      parts.push(renderAlert({ tone: "danger", title: say(this.target?.kind === "member" ? "workbench.roles.conflict-project" : "workbench.roles.conflict-mine", { name: this.title() }), body: say("workbench.roles.conflict-body"), actions: [
        { size: "sm", label: say(this.diffOpen ? "workbench.roles.hide-difference" : "workbench.roles.see-difference"), attrs: { "data-roles-drawer": "diff", "aria-expanded": String(this.diffOpen) } },
        { size: "sm", variant: "primary", label: say("workbench.roles.keep-mine"), attrs: { "data-roles-drawer": "merge" } },
        { size: "sm", variant: "ghost", label: say("workbench.roles.drop-mine"), attrs: { "data-roles-drawer": "reload" } },
      ] }).replace(/<\/div>$/u, diff + "</div>"));
    }
    paint(this.part("drawer-notices"), parts.join(""));
  }

  /** Whether each section follows the original or is this project's, with the way back to following. */
  protected sectionState(name: CharacterRoleSection): string {
    const member = this.member();
    if (!member) return "";
    const status = member.role.sections[name];
    return status.mode === "override"
      ? state("warning", say("workbench.roles.changed-here")) + button({ variant: "ghost", label: say("workbench.roles.follow-again"), attrs: { "data-roles-drawer": "follow", "data-roles-section": name } })
      : state("neutral", say("workbench.roles.follows-version", { version: member.role.current.original.version }));
  }

  protected renderSections(): void {
    this.part("title-field").hidden = this.target?.kind === "member";
    paint(this.part("way-state"), this.sectionState("work_style"));
    paint(this.part("tools-state"), this.sectionState("capabilities"));
  }

  protected renderVersions(): void {
    const fold = this.part<HTMLDetailsElement>("versions-fold");
    fold.hidden = this.target?.kind === "new" || !this.versions.length;
    this.part("versions-summary").textContent = say("workbench.roles.versions-count", { count: this.versions.length });
    paint(this.part("versions"), this.versions.map(entry => {
      const version = versionOf(entry.ref), when = uiText.text("workbench.roles.saved-at", { date: { kind: "date", at: entry.saved_at, style: "datetime" } } as never);
      const sections = entry.sections ? " · " + SECTIONS.map(name => say(entry.sections![name] === "override" ? (name === "work_style" ? "workbench.roles.way-own" : "workbench.roles.tools-own") : (name === "work_style" ? "workbench.roles.way-follows" : "workbench.roles.tools-follow"))).join(" · ") : "";
      return `<div class="roles-ver"><span><strong>v${version}</strong><small>${esc(when + sections)}</small></span>${entry.current ? state("neutral", say("workbench.roles.current"))
        : button({ label: say("workbench.roles.restore-this"), attrs: { "data-roles-version": String(version), "aria-label": say("workbench.roles.restore-named", { version }) } })}</div>`;
    }).join(""));
  }

  /** Where this save lands and what it changes, said before it happens. */
  protected impact(): string {
    const target = this.target!;
    if (target.kind === "new") return say(this.host.scope === "project" ? "workbench.roles.impact-new-project" : "workbench.roles.impact-new");
    const next = (this.originalEntry()?.version ?? 0) + 1;
    if (target.kind === "member" && this.where === "project") return say("workbench.roles.impact-project");
    return say("workbench.roles.impact-original", { version: next });
  }

  /**
   * Whether what is in the fields can be saved. Being busy is not part of it: `controls()` disables every button while busy, and a
   * footer drawn during a read (a kept edit brought back on opening, RAC-1607) must still offer saving once the read is done.
   */
  protected canSave(): boolean {
    if (this.phase === "conflict") return false;
    const now = this.values();
    if (this.target?.kind === "new") return Boolean(now.title.trim() && now.instructions.trim());
    return this.phase === "dirty" && (this.target?.kind !== "original" || Boolean(now.title.trim()));
  }

  protected renderFoot(): void {
    const foot = this.part("drawer-foot");
    foot.classList.toggle("is-asking", Boolean(this.ask));
    if (this.ask) {
      const restore = this.ask.kind === "restore" ? versionOf(this.ask.entry.ref) : null;
      paint(foot, `<div class="roles-ask" role="group" aria-labelledby="roles-ask-title" aria-describedby="roles-ask-body"><p class="roles-ask__title" id="roles-ask-title" tabindex="-1">${icon("circle-alert")}<span>${esc(restore === null ? say("workbench.roles.ask-unsaved") : say("workbench.roles.ask-restore", { version: restore }))}</span></p>
        <p class="roles-ask__body" id="roles-ask-body">${esc(restore === null ? say("workbench.roles.ask-unsaved-body") : say("workbench.roles.ask-restore-body", { version: restore }))}</p>
        <div class="roles-btns">${button({ label: say("workbench.roles.keep-editing"), attrs: { "data-roles-drawer": "ask-keep" } })}${button({ variant: "danger", label: say(restore === null ? "workbench.roles.drop-edits" : "workbench.roles.drop-and-restore"), attrs: { "data-roles-drawer": "ask-drop" } })}</div></div>`);
      return;
    }
    const saved = this.phase === "saved", showImpact = (this.dirty() || this.target?.kind === "new") && !saved;
    const where = this.target?.kind === "member" && this.dirty() ? `<div class="roles-where"><span class="roles-where__k">${esc(say("workbench.roles.save-to"))}</span><span class="mw-toggle-group settings-segmented" data-slot="toggle-group" role="group" aria-label="${esc(say("workbench.roles.save-to-label"))}">${(["project", "mine"] as const).map(value =>
      `<button type="button" class="mw-toggle${this.where === value ? " is-current" : ""}" aria-pressed="${this.where === value}" data-roles-drawer="where" data-roles-where="${value}">${esc(say(value === "project" ? "workbench.roles.save-project" : "workbench.roles.save-mine"))}</button>`).join("")}</span></div>` : "";
    paint(foot, `${showImpact ? `<p class="roles-impact">${icon("info")}<span>${esc(this.impact())}</span></p>` : ""}${where}<div class="roles-btns">${button({ variant: "ghost", label: say(saved ? "workbench.roles.done" : "common.control.close"), attrs: { "data-roles-drawer": "close" } })}${saved ? ""
      : button({ variant: "primary", label: say("workbench.roles.save-use"), attrs: { "data-roles-drawer": "save", "data-roles-disabled": String(!this.canSave()) } })}</div>`);
  }
}

/** The drawer opened over the roles page: reads a role, edits it and saves, restores or follows as the person asks. */
export class RoleDrawer extends RoleDrawerView {
  constructor(host: DrawerHost) {
    super(host);
    this.bind();
  }

  /** Opens over the page; `opener` gets focus back when it closes. */
  async open(target: DrawerTarget, opener: HTMLElement | null): Promise<void> {
    this.target = target; this.opener = opener; this.focusRow = null;
    this.phase = "clean"; this.ask = null; this.saved = null; this.theirs = null; this.diffOpen = false; this.where = "project";
    this.versions = []; this.original = null;
    const blank: CharacterRoleContent = { title: "", instructions: "", host_tools: null };
    this.baseline = target.kind === "new" ? target.from ? { ...target.from, title: say("workbench.roles.copy-title", { name: target.from.title }) } : blank : blank;
    this.fill(this.baseline);
    this.render();
    if (!this.dialog.open) this.dialog.showModal();
    if (target.kind !== "new") await this.guard(() => this.read(true, true));
    else { this.phase = target.from ? "dirty" : "clean"; this.render(); }
    requestAnimationFrame(() => (target.kind === "new" ? this.part<HTMLInputElement>("title") : this.part<HTMLTextAreaElement>("instructions")).focus());
  }

  /**
   * Reads the versions (and a member's original) again; `refill` puts the current content back in the fields. On opening, `restore`
   * brings back this window's unsaved edit (RAC-1607); one typed over an older version than the current one is a conflict to settle
   * before saving, never a silent overwrite (RAC-1608).
   */
  private async read(refill: boolean, restore = false): Promise<void> {
    const target = this.target;
    if (!target || target.kind === "new") return;
    const role = target.kind === "original" ? { kind: "personal", character_id: target.id } : { kind: "project", member_id: target.id };
    const result = await this.host.request<{ versions: CharacterRoleVersionEntry[] }>("POST", "/roles/versions", { role });
    if (this.target !== target) return;
    this.versions = result.versions;
    const original = this.member()?.role.current.original;
    if (original) {
      const read = await this.host.request<{ versions: CharacterRoleVersionEntry[] }>("POST", "/roles/versions", { role: { kind: "personal", character_id: original.character_id } });
      this.original = read.versions.find(entry => entry.current)?.content ?? null;
    }
    const current = this.now()?.content;
    if (current) { this.baseline = current; if (refill) this.fill(current); }
    if (refill) this.editBase = this.currentVersion();
    const kept = restore ? this.drafts.get(this.roleKey() ?? "") : undefined;
    if (kept) {
      this.fill(kept.content); this.editBase = kept.version;
      if (kept.version !== this.currentVersion()) { this.phase = "conflict"; this.theirs = current ?? null; this.host.note(say("workbench.characters.updated-elsewhere")); }
      else { this.phase = "dirty"; this.host.note(say("workbench.characters.draft-restored")); }
    }
    this.render();
  }

  private async guard(action: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.controls();
    try { await action(); }
    catch (error) {
      if (isConflict(error)) await this.conflict();
      else this.host.note(messageOf(error) || say("workbench.characters.failure-kept"));
    } finally { this.busy = false; this.controls(); }
  }

  /**
   * Someone changed this role elsewhere: keep what was typed, read theirs (and a member's original, which saving to the original
   * builds on) as they are now, and let the person choose before saving.
   */
  private async conflict(): Promise<void> {
    this.phase = "conflict"; this.diffOpen = false;
    // The baseline stays what the edit started from, so 在新内容上保留我的改动 can tell which sections the person changed.
    const base = this.baseline;
    await this.fresh();
    this.baseline = base;
    this.theirs = this.now()?.content ?? null;
    this.render();
  }

  /**
   * 在新内容上保留我的改动: the role is read again as it is now, and only the sections the person changed are laid over it; a
   * section they did not touch takes the newer content, so saving never puts back what was there before someone else's change.
   */
  private async merge(): Promise<void> {
    const typed = this.values(), touched = this.edited();
    await this.fresh();
    const theirs = this.now()?.content ?? this.theirs;
    if (theirs) {
      this.baseline = theirs;
      this.fill({ ...theirs, ...(touched.title ? { title: typed.title } : {}), ...(touched.way ? { instructions: typed.instructions } : {}),
        ...(touched.tools ? { host_tools: typed.host_tools, action_tools: typed.action_tools } : {}) });
    }
    this.diffOpen = false; this.redirty();
    this.host.note(say("workbench.roles.merged"));
  }

  // ---------- acting ----------
  private bind(): void {
    const onEdit = (event: Event) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-character-title], [data-character-instructions], [data-character-inherit], [data-character-tools]")) return;
      this.part("tools-field").hidden = this.part<HTMLInputElement>("inherit").checked;
      this.changed();
    };
    this.dialog.addEventListener("input", onEdit);
    this.dialog.addEventListener("change", onEdit);
    this.part("editor").addEventListener("submit", event => event.preventDefault());
    this.dialog.addEventListener("cancel", event => {
      event.preventDefault();
      if (this.ask) { this.ask = null; this.render(); this.part("instructions").focus(); } else this.askOrClose();
    });
    this.dialog.addEventListener("click", event => {
      const control = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-roles-drawer], [data-roles-version]") : null;
      if (!control || (control as HTMLButtonElement).disabled) return;
      if (control.dataset.rolesVersion) { this.restoreAsk(Number(control.dataset.rolesVersion)); return; }
      void this.act(control.dataset.rolesDrawer ?? "", control);
    });
  }

  /** The fields moved: the draft is dirty (the head of a new role follows its name), and the footer says what saving would do. */
  changed(): void {
    if (!this.target || this.busy) return;
    const moved = this.target.kind === "new" ? true : this.edited().way || this.edited().tools || this.edited().title;
    if (this.phase !== "conflict") this.phase = moved ? "dirty" : this.phase === "saved" ? "saved" : "clean";
    this.keep();
    if (this.target.kind === "new") this.renderHead();
    this.renderFoot(); this.controls();
  }

  private askOrClose(): void {
    if (this.dirty() && !(this.target?.kind === "new" && !this.values().title.trim() && !this.values().instructions.trim())) {
      this.ask = { kind: "close" }; this.render();
      requestAnimationFrame(() => this.dialog.querySelector<HTMLElement>("#roles-ask-title")?.focus());
      return;
    }
    this.close();
  }

  private close(): void {
    this.target = null; this.ask = null;
    this.host.imported(null, false);
    this.dialog.close();
    const row = this.focusRow ? document.getElementById(this.focusRow) : null;
    (row ?? this.opener)?.focus();
  }

  private restoreAsk(version: number): void {
    const entry = this.versions.find(item => versionOf(item.ref) === version);
    if (!entry) return;
    if (this.dirty()) { this.ask = { kind: "restore", entry }; this.render(); requestAnimationFrame(() => this.dialog.querySelector<HTMLElement>("#roles-ask-title")?.focus()); return; }
    void this.guard(() => this.restore(entry));
  }

  private async act(name: string, control: HTMLElement): Promise<void> {
    switch (name) {
      case "close": this.askOrClose(); return;
      case "ask-keep": this.ask = null; this.render(); this.part("instructions").focus(); return;
      case "ask-drop": {
        const ask = this.ask;
        this.ask = null; this.phase = "clean"; this.fill(this.baseline); this.keep();
        if (ask?.kind === "restore") { await this.guard(() => this.restore(ask.entry)); this.dialog.querySelector<HTMLElement>("[data-character-versions-summary]")?.focus(); }
        else this.close();
        return;
      }
      case "where": this.where = control.dataset.rolesWhere === "mine" ? "mine" : "project"; this.renderFoot(); this.controls(); return;
      case "diff": this.diffOpen = !this.diffOpen; this.renderNotices(); this.controls(); return;
      case "merge": await this.guard(() => this.merge()); return;
      case "reload": this.phase = "clean"; this.diffOpen = false; this.keep(); await this.guard(() => this.read(true)); this.host.note(say("workbench.roles.reloaded")); return;
      case "save": await this.guard(() => this.save()); return;
      case "undo": { const undo = this.saved?.undo; if (undo) await this.guard(undo); return; }
      case "follow": await this.guard(() => this.follow(control.dataset.rolesSection as CharacterRoleSection)); return;
    }
  }

  private async restore(entry: CharacterRoleVersionEntry): Promise<void> {
    const ref = entry.ref, version = versionOf(ref);
    if (ref.kind === "personal") {
      const original = this.originalEntry();
      if (!original) return;
      await this.host.request("POST", "/roles/restore", { version: ref, expected_revision: original.draft_revision });
    } else {
      const role = this.member()?.role;
      if (!role) return;
      await this.host.request("POST", "/roles/restore", { version: ref, expected_revision: role.revision, expected_original_version: role.current.original.version });
    }
    await this.host.reload(); this.phase = "clean"; this.keep(); await this.read(true);
    this.host.note(say("workbench.roles.restored", { version }));
  }

  private async follow(section: CharacterRoleSection): Promise<void> {
    const role = this.member()?.role;
    if (!role) return;
    await this.host.request("POST", "/members/" + encodeURIComponent(role.current.member_id) + "/section", { section, to: "follow", expected_revision: role.revision, expected_original_version: role.current.original.version });
    await this.host.reload(); this.phase = "clean"; await this.read(true);
    this.host.note(say("workbench.roles.followed"));
  }

  private async save(): Promise<void> {
    const target = this.target!, values = this.values(), before = this.now();
    if (target.kind === "new") return this.create(values);
    if (target.kind === "original") {
      const original = this.originalEntry();
      if (!original) return;
      const result = await this.host.request<{ draft: { revision: number }; version: number }>("PUT", "/drafts/" + encodeURIComponent(target.id), { ...values, expected_revision: original.draft_revision });
      const previous = before?.ref;
      this.savedOriginal(result.version, previous?.kind === "personal" ? async () => this.undo({ version: previous, expected_revision: result.draft.revision }) : undefined);
      await this.host.reload(); await this.read(true);
      return;
    }
    const member = this.member(), entry = this.originalEntry();
    if (!member || !entry) return;
    const edited = this.edited(), role: MemberRole = member.role;
    if (this.where === "project") {
      const body = { expected_revision: role.revision, expected_original_version: role.current.original.version,
        ...(edited.way ? { work_style: { instructions: values.instructions } } : {}),
        ...(edited.tools ? { capabilities: { host_tools: values.host_tools, ...(values.action_tools === undefined ? {} : { action_tools: values.action_tools }) } } : {}) };
      const result = await this.host.request<{ role: MemberRole }>("PUT", "/members/" + encodeURIComponent(target.id), body);
      const previous = before?.ref;
      this.done(say("workbench.roles.saved-project", { version: result.role.current.member_version }), say("workbench.roles.impact-project"),
        previous?.kind === "project" ? async () => this.undo({ version: previous, expected_revision: result.role.revision, expected_original_version: result.role.current.original.version }) : undefined);
    } else {
      // To the original: only what was edited here goes there; the original keeps its other section. A section this project
      // kept for itself follows the original again, so the project uses what was just saved.
      const base = this.original ?? this.baseline;
      const content = { title: entry.title, instructions: edited.way ? values.instructions : base.instructions,
        host_tools: edited.tools ? values.host_tools : base.host_tools, action_tools: (edited.tools ? values.action_tools : base.action_tools) ?? null };
      const result = await this.host.request<{ draft: { revision: number }; version: number }>("PUT", "/drafts/" + encodeURIComponent(entry.ref.character_id), { ...content, expected_revision: entry.draft_revision });
      let current = role;
      for (const section of SECTIONS) {
        if (current.sections[section].mode !== "override" || !(section === "work_style" ? edited.way : edited.tools)) continue;
        current = (await this.host.request<{ role: MemberRole }>("POST", "/members/" + encodeURIComponent(target.id) + "/section",
          { section, to: "follow", expected_revision: current.revision, expected_original_version: result.version })).role;
      }
      this.savedOriginal(result.version);
    }
    await this.host.reload(); await this.read(true);
  }

  private async create(values: CharacterRoleContent): Promise<void> {
    const result = await this.host.request<{ draft: { character_id: string } }>("POST", "/drafts", { title: values.title.trim(), instructions: values.instructions, host_tools: values.host_tools,
      ...(values.action_tools === undefined ? {} : { action_tools: values.action_tools }) });
    const id = result.draft.character_id;
    if (this.host.scope === "project") {
      const added = await this.host.request<{ role: MemberRole }>("POST", "/members", { character_id: id });
      this.target = { kind: "member", id: added.role.current.member_id };
      this.focusRow = "roles-row-member-" + added.role.current.member_id;
      this.host.landed("member:" + added.role.current.member_id);
    } else {
      this.target = { kind: "original", id };
      this.focusRow = "roles-row-original-" + id;
      this.host.landed("original:" + id);
    }
    this.done(say("workbench.roles.saved-new"), say(this.host.scope === "project" ? "workbench.roles.saved-new-detail-project" : "workbench.roles.saved-new-detail"));
    await this.host.reload(); await this.read(true);
  }

  /** Reads the role again as it is now, keeping what is in the box. */
  private async fresh(): Promise<void> { await this.host.reload(); await this.read(false); }

  /** What is in the box becomes an unsaved edit on top of the role as it reads now. */
  private redirty(): void { this.phase = "dirty"; this.editBase = this.currentVersion(); this.keep(); this.render(); }

  /** Undo a save: the version before it is saved again as the newest one; what was typed stays in the box, unsaved. */
  private async undo(body: Record<string, unknown>): Promise<void> {
    const typed = this.values();
    await this.host.request("POST", "/roles/restore", body);
    await this.fresh();
    this.fill(typed); this.saved = null; this.redirty();
    this.host.note(say("workbench.roles.undone"));
  }

  /** Saved as the original's next version: what it is now and what follows from it. */
  private savedOriginal(version: number, undo?: () => Promise<void>): void {
    this.done(say("workbench.roles.saved-original", { version }), say("workbench.roles.impact-original", { version }), undo);
  }

  private done(title: string, body: string, undo?: () => Promise<void>): void {
    this.phase = "saved"; this.saved = { title, body, ...(undo ? { undo } : {}) };
    this.keep();
  }

  /** Whether an edit is open with unsaved changes (imports ask before rescanning over it). */
  isDirty(): boolean { return this.dirty(); }
  /** Saves what is in the drawer for an import that needs the latest saved content. */
  async saveNow(): Promise<void> { await this.save(); }
}
