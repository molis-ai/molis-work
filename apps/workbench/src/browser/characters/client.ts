import type { CharacterRoleCatalog, CharacterRoleVersionEntry } from "@molis-ai/molis-work-contracts/modules/characters";
import { characterActionClient, type ActionClient } from "./action-client.js";
import { renderBuiltinRoles } from "./builtin.js";
import { messageOf, pageRequest, partsOf, type CharacterRecord, type Method, type Part } from "./common.js";
import { RoleDrawer } from "./drawer.js";
import { characterImportClient, type ImportClient } from "./import-client.js";
import { startCharacterTerminal } from "./terminal.js";
import { memberKey, originalChanged, personalBody, projectBody, type PageUi } from "./view.js";

const uiText = globalThis.t;
const say = (key: string, values?: Record<string, string | number>): string => uiText.text(key, values);

/**
 * The role page (plan C): project settings › 角色 and Settings › 角色 from one catalog read. Choosing defaults, adding, following
 * again, turning off and every edit happen where they start: insets open under what opened them, the editor is a drawer over the page.
 */
class RolesPage {
  private readonly q: Part;
  private readonly api: string;
  private readonly scope: "project" | "personal";
  private readonly body: HTMLElement;
  private readonly actions: ActionClient;
  private readonly drawer: RoleDrawer;
  private readonly imports: ImportClient;
  private catalog: CharacterRoleCatalog | null = null;
  private ui: PageUi = { add: false, menu: null, stopAsk: null, diff: null, flash: null };
  private busy = false;
  private importing: CharacterRecord | null = null;

  constructor(root: HTMLElement) {
    const { find, q } = partsOf(root);
    this.q = q;
    this.api = root.dataset.characterApi ?? "";
    this.scope = root.dataset.characterScope === "personal" ? "personal" : "project";
    this.body = q("body");
    this.actions = characterActionClient({ q: find, request: this.request, changed: () => this.drawer.changed() });
    this.drawer = new RoleDrawer({ q, scope: this.scope, storage: "molis.characters.drafts:" + this.api, request: this.request, actions: this.actions, catalog: () => this.catalog,
      reload: () => this.load(), note: text => this.note(text), landed: key => this.flash(key),
      imported: (record, runnable) => { this.importing = record; this.imports.render(record); q("use-section").hidden = !runnable; } });
    this.imports = characterImportClient({ q, runtimeNames: JSON.parse(root.dataset.characterRuntimeNames ?? "{}") as Record<string, string>, request: this.request,
      current: () => this.importing ?? undefined, load: () => this.load(),
      select: id => { if (id) void this.drawer.open({ kind: "original", id }, null); }, act: action => this.act(action),
      save: async () => { await this.drawer.saveNow(); return this.importing!; }, dirty: () => this.drawer.isDirty(), note: text => this.note(text) });
  }

  start(): void {
    this.bind();
    if (this.scope === "personal") void renderBuiltinRoles(this.q);
    void this.actions.refresh();
    void this.act(() => this.load());
  }

  private request = <T>(method: Method, path: string, body?: unknown): Promise<T> =>
    pageRequest()<T>(this.api + path, { method, body, fallback: uiText.text("workbench.characters.request-failed") });

  private note(text: string): void { this.q("notice").textContent = text; }

  private async load(): Promise<void> {
    this.catalog = await this.request<CharacterRoleCatalog>("GET", "/roles");
    this.render();
  }

  /** Redraws the page body; the control that was used keeps focus (or `focus` names where it goes). */
  private render(focus?: string): void {
    if (!this.catalog) return;
    const active = document.activeElement instanceof HTMLElement && this.body.contains(document.activeElement) ? document.activeElement : null;
    const key = active?.dataset.rolesAct ? `[data-roles-act="${active.dataset.rolesAct}"][data-roles-arg="${CSS.escape(active.dataset.rolesArg ?? "")}"]`
      : active?.dataset.rolesDefault ? `[data-roles-default="${active.dataset.rolesDefault}"]` : null;
    this.body.innerHTML = this.scope === "project" ? projectBody(this.catalog, this.ui) : personalBody(this.catalog, this.ui);
    this.body.removeAttribute("aria-busy");
    const target = focus ?? key;
    if (target) this.body.querySelector<HTMLElement>(target)?.focus({ preventScroll: true });
    this.body.querySelectorAll<HTMLButtonElement | HTMLSelectElement>("button, select").forEach(control => { control.disabled = this.busy; });
  }

  private flash(key: string): void {
    this.ui.flash = key;
    setTimeout(() => { if (this.ui.flash === key) { this.ui.flash = null; this.body.querySelector(".roles-row.is-flash")?.classList.remove("is-flash"); } }, 900);
  }

  private async act(action: () => Promise<unknown>, focus?: string): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.render();
    // Controls are disabled while a change is in hand; one that takes a moment says so (not the first read, which shows its own line).
    const pending = say("workbench.roles.working"), slow = this.catalog ? setTimeout(() => this.note(pending), 400) : undefined;
    try { await action(); } catch (error) { this.note(messageOf(error) || say("workbench.characters.failure-kept")); }
    finally {
      clearTimeout(slow);
      if (this.q("notice").textContent === pending) this.note("");
      this.busy = false; this.render(focus);
    }
  }

  private member(id: string) { return this.catalog?.members.find(entry => memberKey(entry) === id); }
  private original(id: string) { return this.catalog?.originals.find(entry => entry.ref.character_id === id); }

  private bind(): void {
    this.body.addEventListener("change", event => {
      const select = event.target instanceof HTMLSelectElement ? event.target : null;
      if (!select?.dataset.rolesDefault) return;
      void this.act(() => this.setDefault(select.dataset.rolesDefault === "personal" ? "personal" : "project", select.value), `[data-roles-default="${select.dataset.rolesDefault}"]`);
    });
    this.body.addEventListener("click", event => {
      const control = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-roles-act]") : null;
      if (!control || (control as HTMLButtonElement).disabled) return;
      this.click(control.dataset.rolesAct ?? "", control.dataset.rolesArg ?? "", control);
    });
    // The open menu: arrows move, Esc closes it back to its button, a press elsewhere closes it.
    this.body.addEventListener("keydown", event => {
      if (!this.ui.menu) return;
      const items = [...this.body.querySelectorAll<HTMLElement>(".roles-more [role=menuitem]")];
      if (event.key === "Escape") { event.preventDefault(); const id = this.ui.menu; this.ui.menu = null; this.render(`[data-roles-act="more"][data-roles-arg="${CSS.escape(id)}"]`); }
      else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const index = items.indexOf(document.activeElement as HTMLElement);
        items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      } else if (event.key === "Tab") { this.ui.menu = null; this.render(); }
    });
    document.addEventListener("pointerdown", event => {
      if (this.ui.menu && !(event.target instanceof Element && event.target.closest(".roles-more"))) { this.ui.menu = null; this.render(); }
    });
  }

  private click(name: string, arg: string, control: HTMLElement): void {
    const ui = this.ui, kind = arg.split(":")[0], id = arg.slice(kind.length + 1);
    switch (name) {
      case "open":
        if (arg === "new") void this.drawer.open({ kind: "new" }, control);
        else void this.drawer.open({ kind: kind === "member" ? "member" : "original", id }, control);
        return;
      case "import": this.imports.open(false); return;
      case "add": ui.add = !ui.add; this.render(`[data-roles-act="add"]`); return;
      case "more": ui.menu = ui.menu === arg ? null : arg; this.render(ui.menu ? `#roles-menu-${CSS.escape(arg)} [role=menuitem]` : undefined); return;
      case "stop-ask": ui.menu = null; ui.stopAsk = arg; this.render(`#roles-stop-${CSS.escape(arg)}`); return;
      case "stop-cancel": ui.stopAsk = null; this.render(`[data-roles-act="more"][data-roles-arg="${CSS.escape(arg)}"]`); return;
      case "stop-do": ui.stopAsk = null; void this.act(() => kind === "member" ? this.memberState(id, "disabled") : this.originalState(id, "disabled"), `#roles-row-${kind}-${CSS.escape(id)}`); return;
      case "member-on": void this.act(() => this.memberState(arg, "active"), `[data-roles-act="more"][data-roles-arg="member:${CSS.escape(arg)}"]`); return;
      case "original-on": void this.act(() => this.originalState(arg, "active"), `[data-roles-act="more"][data-roles-arg="original:${CSS.escape(arg)}"]`); return;
      case "member-remove": ui.menu = null; void this.act(() => this.memberState(id, "removed")); return;
      case "member-add": void this.act(() => this.addMember(arg)); return;
      case "default-inherit": void this.act(() => this.setDefault("project", "inherit"), `[data-roles-default="project"]`); return;
      case "refollow": void this.act(() => this.refollow(arg), `#roles-row-member-${CSS.escape(arg)}`); return;
      case "refollow-changed": void this.act(() => this.refollow(arg, true), `#roles-row-member-${CSS.escape(arg)}`); return;
      case "keep-own": void this.act(() => this.keepOwn(arg)); return;
      case "diff": void this.act(() => this.toggleDiff(arg), `[data-roles-act="diff"][data-roles-arg="${CSS.escape(arg)}"]`); return;
      case "copy": ui.menu = null; void this.act(() => this.copy(id, control)); return;
    }
  }

  private async setDefault(layer: "personal" | "project", value: string): Promise<void> {
    const selection = layer === "personal" ? (value ? { kind: "personal", character_id: value } : null)
      : value === "inherit" ? null : value === "assistant" ? { kind: "assistant" } : { kind: "project", member_id: value.slice("project:".length) };
    await this.request("POST", "/roles/defaults", { layer, selection });
    await this.load();
    this.note(say(layer === "personal" ? "workbench.roles.my-default-changed" : value === "inherit" ? "workbench.roles.project-inherits" : "workbench.roles.project-default-changed"));
  }

  private async memberState(id: string, state: "active" | "disabled" | "removed"): Promise<void> {
    const member = this.member(id);
    if (!member) return;
    await this.request("POST", "/members/" + encodeURIComponent(id) + "/state", { expected_revision: member.role.revision, state });
    await this.load();
    this.note(say(state === "active" ? "workbench.roles.turned-on" : state === "removed" ? "workbench.roles.removed" : "workbench.roles.turned-off-done", { name: member.title }));
  }

  private async originalState(id: string, state: "active" | "disabled"): Promise<void> {
    const original = this.original(id);
    if (!original) return;
    await this.request("POST", "/drafts/" + encodeURIComponent(id) + "/state", { expected_revision: original.draft_revision, state });
    await this.load();
    this.note(say(state === "active" ? "workbench.roles.turned-on" : "workbench.roles.turned-off-done", { name: original.title }));
  }

  private async addMember(characterId: string): Promise<void> {
    const result = await this.request<{ role: { current: { member_id: string } } }>("POST", "/members", { character_id: characterId });
    this.ui.add = false; this.flash("member:" + result.role.current.member_id);
    await this.load();
    this.note(say("workbench.roles.joined", { name: this.original(characterId)?.title ?? "" }));
  }

  /** Every section this project changed follows the original again; its own versions stay, to restore. */
  private async refollow(id: string, changedOnly = false): Promise<void> {
    const member = this.member(id);
    if (!member) return;
    let role = member.role;
    const sections = changedOnly ? originalChanged(member) : ["work_style", "capabilities"] as const;
    for (const section of sections) {
      if (role.sections[section].mode !== "override") continue;
      role = (await this.request<{ role: typeof role }>("POST", "/members/" + encodeURIComponent(id) + "/section",
        { section, to: "follow", expected_revision: role.revision, expected_original_version: role.current.original.version })).role;
    }
    this.ui.diff = null; this.flash("member:" + id);
    await this.load();
    this.note(say("workbench.roles.followed"));
  }

  /** Keep this project's sections although the original changed them too; the next change of the original asks again. */
  private async keepOwn(id: string): Promise<void> {
    let role = this.member(id)?.role;
    if (!role) return;
    for (const section of ["work_style", "capabilities"] as const) {
      const status = role.sections[section];
      if (status.mode !== "override" || !status.original_changed) continue;
      role = (await this.request<{ role: typeof role }>("POST", "/members/" + encodeURIComponent(id) + "/section",
        { section, to: "keep", expected_revision: role.revision, expected_original_version: role.current.original.version })).role;
    }
    this.ui.diff = null;
    await this.load();
    this.note(say("workbench.roles.kept-own"));
  }

  private async current(role: { kind: "personal"; character_id: string } | { kind: "project"; member_id: string }): Promise<CharacterRoleVersionEntry | undefined> {
    return (await this.request<{ versions: CharacterRoleVersionEntry[] }>("POST", "/roles/versions", { role })).versions.find(entry => entry.current);
  }

  private async toggleDiff(id: string): Promise<void> {
    if (this.ui.diff === id) { this.ui.diff = null; delete this.ui.diffText; return; }
    const member = this.member(id);
    if (!member) return;
    const [ours, theirs] = await Promise.all([this.current({ kind: "project", member_id: id }), this.current({ kind: "personal", character_id: member.role.current.original.character_id })]);
    if (!ours || theirs?.ref.kind !== "personal") return;
    this.ui.diff = id; this.ui.diffText = { ours: ours.content, theirs: theirs.content, version: theirs.ref.version };
  }

  private async copy(id: string, control: HTMLElement): Promise<void> {
    const entry = await this.current({ kind: "personal", character_id: id });
    if (entry) await this.drawer.open({ kind: "new", from: entry.content }, control.closest(".roles-row")?.querySelector<HTMLElement>("[data-roles-act=more]") ?? null);
  }
}

/** Brings every role page in the document to life once; the settings cover may place one after the page loaded. */
export function mountCharacters(): void {
  for (const root of document.querySelectorAll<HTMLElement>("[data-characters]:not([data-characters-mounted])")) {
    root.dataset.charactersMounted = "";
    new RolesPage(root).start();
  }
  startCharacterTerminal();
}
