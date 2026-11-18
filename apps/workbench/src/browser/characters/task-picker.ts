import { PERSONAL_SPACE_PROJECT_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { BUSINESS_HOST_TOOLS } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { CharacterDefaultSelection, CharacterRoleAvailability, CharacterRoleCatalog, CharacterRoleContent, PersonalCharacterRef, ProjectCharacterMemberRef } from "@molis-ai/molis-work-contracts/modules/characters";
import type { AssistantCharacter } from "@molis-ai/molis-work-contracts/services/assistant";
import { escapeHtml as esc, renderAlert, renderButton } from "@molis-ai/molis-work-plugin-sdk/ui";
import { characterActionClient } from "./action-client.js";
import { messageOf, pageRequest, partsOf, type CharacterRequest } from "./common.js";
import { RoleDrawer, type DrawerTarget } from "./drawer.js";

type Ref = PersonalCharacterRef | ProjectCharacterMemberRef;
type Row = AssistantCharacter & Pick<CharacterRoleContent, "host_tools"> & { availability: CharacterRoleAvailability };
type PickerRequest = { target: string; project_id: string | null; selection?: Ref | null; required?: boolean; new_work?: boolean };
type Mode = "task" | "project" | "personal";
const say = (key: string, values?: Record<string, string>): string => globalThis.t.text(key, values);
const label = (key: string): string => say("workbench.assistant-choosers." + key);
const roleText = (key: string, values?: Record<string, string>): string => say("workbench.roles." + key, values);
const keyOf = (ref: Ref): string => ref.kind === "personal" ? "personal:" + ref.character_id : "project:" + ref.member_id;
const toolSet: ReadonlySet<string> = new Set(BUSINESS_HOST_TOOLS);
function reason(row: Row): string {
  if (!row.availability.available) return label("role-reason-" + row.availability.reason);
  const missing = row.host_tools?.filter(tool => !toolSet.has(tool));
  return missing?.length ? say("workbench.kit.unsupported-run") + " · " + missing.join(", ") : "";
}

function rowsOf(catalog: CharacterRoleCatalog, layer: "project" | "personal"): Row[] {
  return layer === "project" ? catalog.members.map(({ role, title, availability, host_tools }) => ({
    ref: { kind: "project", member_id: role.current.member_id }, character_id: role.current.original.character_id, title, availability, host_tools,
  })) : catalog.originals.map(({ ref, title, availability, host_tools }) => ({ ref, character_id: ref.character_id, title, availability, host_tools }));
}

const roleRoute = (projectId: string | null): string => "/projects/" + encodeURIComponent(projectId ?? PERSONAL_SPACE_PROJECT_ID) + "/api/plugins/io.molis.work.characters";
const roleRequest = (projectId: string | null): CharacterRequest => (method, path, body) =>
  pageRequest()(roleRoute(projectId) + path, { method, body, fallback: say("workbench.characters.request-failed") });

function storedDefault(catalog: CharacterRoleCatalog, mode: "project" | "personal"): string {
  const choice = catalog.defaults[mode];
  return choice === null ? "inherit" : choice.kind === "assistant" ? "assistant" : keyOf(choice);
}

/** A task's one directory read, three modes in the same chooser, and the same editor as Settings. */
class TaskRolePicker {
  private readonly dialog = document.createElement("dialog");
  private readonly opener = document.activeElement;
  private readonly scope: "project" | "personal";
  private readonly request: CharacterRequest;
  private catalog: CharacterRoleCatalog | null = null;
  private mode: Mode = "task";
  private taskValue: string;
  private busy = false;

  constructor(private readonly island: HTMLElement, private readonly input: PickerRequest) {
    this.scope = input.project_id ? "project" : "personal";
    this.request = roleRequest(input.project_id);
    this.taskValue = input.required ? "" : input.selection ? keyOf(input.selection) : input.new_work && input.selection === undefined ? "inherit" : "assistant";
    this.dialog.className = "mw-dialog mw-dialog--form";
    this.dialog.dataset.taskRolePicker = "";
    this.dialog.setAttribute("aria-labelledby", "task-role-picker-title");
    this.dialog.addEventListener("close", () => {
      this.dialog.remove();
      if (this.opener instanceof HTMLElement) {
        const selector = this.opener.hasAttribute("data-assistant-role-picker") ? "[data-assistant-role-picker]" : '[data-composer-control="character"]';
        const target = this.opener.getClientRects().length ? this.opener : this.island.querySelector<HTMLElement>(selector);
        (target?.getClientRects().length ? target : this.island.querySelector<HTMLElement>("[data-composer-more]"))?.focus();
      }
    });
    this.dialog.addEventListener("click", event => {
      const control = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-task-role-act]");
      if (control) void this.act(control);
    });
  }

  async open(): Promise<void> {
    this.render();
    document.body.append(this.dialog);
    this.dialog.showModal();
    try { this.catalog = await this.request("GET", "/roles"); this.render(); this.select()?.focus(); }
    catch (error) { this.note(messageOf(error)); }
  }

  private note(text: string): void { this.dialog.querySelector("[data-task-role-notice]")!.textContent = text; }
  private select(): HTMLSelectElement | null { return this.dialog.querySelector("[data-task-role-select]"); }
  private rows(): Row[] {
    if (!this.catalog) return [];
    const rows = rowsOf(this.catalog, this.mode === "task" ? this.scope : this.mode);
    if (this.scope === "project" && this.mode === "task" && this.taskValue.startsWith("personal:")) {
      const current = rowsOf(this.catalog, "personal").find(row => keyOf(row.ref) === this.taskValue);
      if (current) rows.push(current);
    }
    return rows;
  }

  private paintSource(hint: Element, value: string, selected?: Row): void {
    const assistant = roleText("assistant");
    hint.textContent = selected ? roleText("layer-task") + " · " + selected.title : value === "assistant" ? assistant : "";
    if (value !== "inherit") return;
    const catalog = this.catalog!;
    const resolved = catalog.effective;
    const stopped = resolved.kind === "assistant" && resolved.source === "assistant" && resolved.stopped_project_default;
    const ended = stopped && catalog.members.find(member => member.role.current.member_id === stopped.member_id);
    if (ended) { hint.innerHTML = renderAlert({ tone: "warning", title: roleText("default-off-title", { name: ended.title }) }); return; }
    const row = resolved.kind === "role" ? rowsOf(catalog, resolved.version.kind).find(entry => keyOf(entry.ref) === keyOf(resolved.version)) : undefined;
    const source = resolved.source === "project" ? label("project-default") : resolved.source === "personal" ? label("my-default") : assistant;
    hint.textContent = [source, row?.title ?? (resolved.source === "project" ? assistant : ""), row && reason(row)].filter(Boolean).join(" · ");
  }

  private render(value?: string): void {
    const catalog = this.catalog, task = this.mode === "task";
    const current = value ?? (this.mode === "task" ? this.taskValue : catalog ? storedDefault(catalog, this.mode) : "");
    const title = task ? say("workbench.assistant-dock.which-character-carries") : label(this.mode === "project" ? "project-default" : "my-default");
    const button = (act: string, text: string, primary = false) => renderButton({ size: "sm", label: text, variant: primary ? "primary" : "secondary", attrs: { "data-task-role-act": act } });
    const option = (id: string, text: string, unavailable = false) => `<option value="${esc(id)}"${id === current ? " selected" : ""}${unavailable ? " disabled" : ""}>${esc(text)}</option>`;
    const rows = this.rows();
    const options = rows.map(row => {
      const id = keyOf(row.ref), why = reason(row);
      const tag = id === storedDefault(catalog!, "project") ? label("project-default") : id === storedDefault(catalog!, "personal") ? label("my-default") : "";
      return option(id, [row.title, tag, why].filter(Boolean).join(" · "), Boolean(why));
    }).join("");
    const missing = !current || current.includes(":") && !rows.some(row => keyOf(row.ref) === current);
    const inherit = roleText(task ? "default-new" : this.mode === "project" ? "use-mine-again" : "assistant");
    this.dialog.innerHTML = `<div class="mw-form mw-dialog__shell">
      <header class="mw-form__header"><h2 id="task-role-picker-title">${esc(title)}</h2></header>
      <div class="mw-form__body">
        ${!catalog ? `<p class="mw-loading">${esc(say("workbench.characters.loading"))}</p>` : `${task ? '<div class="roles-hint" data-task-role-source></div>' : `<p class="roles-hint">${esc(roleText(this.mode === "project" ? "default-new" : "my-default-hint"))}</p>`}
          <select class="mw-select" aria-labelledby="task-role-picker-title" data-task-role-select>
            ${missing ? option(current, say("workbench.assistant-dock.which-character-carries"), true) : ""}
            ${!task || this.input.new_work ? option("inherit", inherit) : ""}
            ${task || this.mode === "project" ? option("assistant", roleText("assistant")) : ""}${options}</select>
          ${task ? `<div class="roles-inline">${button("edit", roleText("adjust"))}${button("new", roleText("new-role"))}
            ${this.scope === "project" ? button("project", label("project-default")) : ""}${button("personal", label("my-default"))}</div>` : ""}
        `}<p class="roles-hint" data-task-role-notice role="status"></p>
      </div>
      <footer class="mw-form__footer">${button(task ? "close" : "back", say(task ? "common.control.close" : "common.control.back"))}
        ${catalog ? button("apply", task ? roleText("layer-task-only") : say("common.control.save"), true) : ""}</footer>
    </div>`;
    const update = () => {
      const select = this.select(), row = rows.find(one => keyOf(one.ref) === select?.value);
      const source = this.dialog.querySelector("[data-task-role-source]");
      const apply = this.dialog.querySelector<HTMLButtonElement>('[data-task-role-act="apply"]');
      const edit = this.dialog.querySelector<HTMLButtonElement>('[data-task-role-act="edit"]');
      if (select && source) this.paintSource(source, select.value, row);
      if (apply) apply.disabled = !select?.value || Boolean(select.selectedOptions[0]?.disabled);
      if (edit) edit.disabled = !row;
    };
    this.select()?.addEventListener("change", update);
    update();
  }

  private emit(result?: { character: AssistantCharacter | null } | { reset: true }): void {
    this.island.dispatchEvent(new CustomEvent("molis-work:task-role-picked", { detail: {
      target: this.input.target, ...result,
    } }));
  }

  private async act(control: HTMLButtonElement): Promise<void> {
    if (this.busy || control.disabled) return;
    const act = control.dataset.taskRoleAct, value = this.select()?.value ?? "";
    if (act === "close") { this.dialog.close(); return; }
    if (act === "back") { this.mode = "task"; this.render(); this.select()?.focus(); return; }
    if (!this.catalog) return;
    if (this.mode === "task") this.taskValue = value;
    const row = this.rows().find(one => keyOf(one.ref) === value);
    if (act === "project" || act === "personal") {
      this.mode = act;
      const candidate = row && rowsOf(this.catalog, act).find(entry => entry.character_id === row.character_id && !reason(entry));
      this.render(candidate ? keyOf(candidate.ref) : undefined);
      this.select()?.focus();
      return;
    }
    this.busy = true;
    try {
      if (act === "new") {
        await this.editor({ kind: "new" }, control);
      } else if (act === "edit" && row) {
        await this.editor(row.ref.kind === "personal" ? { kind: "original", id: row.ref.character_id } : { kind: "member", id: row.ref.member_id }, control);
      } else if (act === "apply") {
        if (this.mode === "task") {
          if (row) this.emit({ character: { ref: row.ref, title: row.title, character_id: row.character_id } });
          else if (value === "assistant") this.emit({ character: null });
          else if (value === "inherit") this.emit({ reset: true });
          this.dialog.close();
        } else {
          const selection: CharacterDefaultSelection = this.mode === "personal"
            ? { layer: "personal", selection: row?.ref.kind === "personal" ? row.ref : null }
            : { layer: "project", selection: row?.ref.kind === "project" ? row.ref : value === "assistant" ? { kind: "assistant" } : null };
          const saved = await this.request<Pick<CharacterRoleCatalog, "defaults" | "effective">>("POST", "/roles/defaults", selection);
          this.catalog = { ...this.catalog, ...saved };
          const notice = this.mode === "personal" ? "my-default-changed" : value === "inherit" ? "project-inherits" : "project-default-changed";
          this.emit(); this.mode = "task"; this.render(); this.note(roleText(notice)); this.select()?.focus();
        }
      }
    } catch (error) { this.note(messageOf(error)); }
    finally { this.busy = false; }
  }

  private async editor(target: DrawerTarget, opener: HTMLElement): Promise<void> {
    // Use the settings document's localized editor and styles, deferred until the person edits or creates.
    const projectId = target.kind === "original" ? null : this.input.project_id;
    const prefix = projectId ? "/projects/" + encodeURIComponent(projectId) : "";
    const request = roleRequest(projectId);
    const html = await pageRequest()<string>(prefix + "/settings/characters", {
      as: "text", headers: { Accept: "text/html" }, fallback: say("workbench.characters.request-failed"),
    });
    const section = new DOMParser().parseFromString(html, "text/html").querySelector("[data-characters]");
    const shell = section?.querySelector<HTMLDialogElement>("[data-character-drawer]");
    const styles = section?.querySelector("style");
    if (!shell || !styles) throw new Error(say("workbench.characters.request-failed"));
    if (!this.dialog.open) return;
    const holder = document.createElement("div");
    holder.append(styles, shell);
    const { q, find } = partsOf(holder), status = document.createElement("p");
    status.className = "roles-hint"; status.setAttribute("role", "status");
    q("drawer-notices").before(status);
    const actions = characterActionClient({ q: find, request, changed: () => drawer.changed() });
    const drawer = new RoleDrawer({
      q, scope: projectId ? "project" : "personal", request, actions, catalog: () => this.catalog, storage: "molis.characters.drafts:" + roleRoute(projectId),
      reload: async () => { this.catalog = await this.request("GET", "/roles"); this.emit(); },
      landed: key => { this.taskValue = key.replace(/^original:/u, "personal:").replace(/^member:/u, "project:"); },
      note: message => { status.textContent = message; }, imported: () => {},
    });
    shell.addEventListener("close", () => { holder.remove(); this.render(); this.select()?.focus(); }, { once: true });
    document.body.append(holder);
    void actions.refresh();
    await drawer.open(target, opener);
  }
}

export function mountTaskRolePicker(): void {
  document.addEventListener("molis-work:task-role-picker", event => {
    if (!(event.target instanceof HTMLElement) || !(event instanceof CustomEvent) || !event.detail?.target) return;
    const open = document.querySelector<HTMLElement>("[data-task-role-picker]");
    if (open) { open.focus(); return; }
    void new TaskRolePicker(event.target, event.detail as PickerRequest).open();
  });
}
