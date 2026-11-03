import { characterActionClient, type ActionClient } from "./action-client.js";
import { renderBuiltinRoles } from "./builtin.js";
import {
  latestActive, messageOf, pageRequest, partsOf, readableContent,
  type CharacterContent, type CharacterPublication, type CharacterRecord, type FindPart, type Method, type Part, type StoredDraft,
} from "./common.js";
import { readStoredDrafts, writeStoredDrafts } from "./drafts.js";
import { characterImportClient, type ImportClient } from "./import-client.js";
import { renderList, renderVersions } from "./list.js";
import { startCharacterTerminal } from "./terminal.js";

const EDIT_FIELDS = "[data-character-title], [data-character-instructions], [data-character-inherit], [data-character-tools]";
const IMPORT_DIALOGS = "[data-character-import-dialog], [data-character-run-dialog]";
type Control = HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement;

/** Where the Character stands: its state, what is published, and whether the draft moved on since. */
function statusOf(record: CharacterRecord, published: CharacterPublication | undefined): string {
  if (record.state === "disabled") return "已停用";
  if (record.state === "tombstoned") return "已删除";
  if (!published) return "草稿 · 未发布";
  return "已发布 v" + published.version + (published.payload.source?.draft_revision === record.revision ? "" : " · 草稿有新修改");
}

function draftNoteOf(record: CharacterRecord, local: StoredDraft | undefined): string {
  if (!local) return "已保存。发布会固定这份内容，已有执行保持原版本。";
  return record.revision !== local.expected_revision ? "其他窗口已更新；你的修改仍保留。请核对后重新读取，不能直接覆盖新修订。" : "已恢复此窗口未保存的修改。";
}

/** Personal editing and exact project publication. No polling replaces an active editor. */
class CharactersPage {
  private readonly q: Part;
  private readonly find: FindPart;
  private readonly api: string;
  private readonly storageKey: string;
  private readonly list: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly dialog: HTMLDialogElement;
  private readonly imports: ImportClient;
  private readonly actions: ActionClient;
  private records: CharacterRecord[] = [];
  private publications: CharacterPublication[] = [];
  private selected: string | null = null;
  private revision = 0;
  private busy = false;
  private confirmation: (() => Promise<void>) | null = null;
  private drafts: Record<string, StoredDraft>;

  constructor(private readonly root: HTMLElement) {
    const { find, q } = partsOf(root);
    this.find = find; this.q = q;
    this.api = root.dataset.characterApi ?? "";
    this.storageKey = "molis.characters.drafts:" + this.api;
    this.list = q("list"); this.form = q<HTMLFormElement>("editor"); this.dialog = q<HTMLDialogElement>("dialog");
    this.drafts = readStoredDrafts(this.storageKey);
    this.imports = characterImportClient({ q, request: this.request, current: () => this.current(), load: () => this.load(),
      select: (id, focus) => this.select(id, focus), act: action => this.act(action), save: () => this.save(), dirty: () => this.dirty(), note: text => this.note(text) });
    this.actions = characterActionClient({ q: find, request: this.request, changed: () => this.remember() });
  }

  /** Listens, reads the system's roles and the actions catalog, and loads the drafts. */
  start(): void {
    this.bind();
    void renderBuiltinRoles(this.q);
    void this.actions.refresh();
    // The page renders 新建 and 导入 disabled; the first load's controls() enables them, so a click never lands before anything listens.
    void this.act(() => this.load());
  }

  private request = <T>(method: Method, path: string, body?: unknown): Promise<T> => {
    const send = pageRequest();
    return send<T>(this.api + path, { method, body, fallback: "角色请求失败" });
  };

  private note(text: string): void { this.q("notice").textContent = text; }
  private current(): CharacterRecord | undefined { return this.records.find(item => item.character_id === this.selected); }
  private dirty(): boolean { return Boolean(this.selected && this.drafts[this.selected]); }

  private values(): CharacterContent {
    const { q } = this;
    return { title: q<HTMLInputElement>("title").value, instructions: q<HTMLTextAreaElement>("instructions").value,
      host_tools: q<HTMLInputElement>("inherit").checked ? null : q<HTMLInputElement>("tools").value.split(",").map(tool => tool.trim()).filter(Boolean),
      action_tools: this.actions.value() };
  }

  // Session storage that cannot be written leaves the person to save before leaving.
  private persist(): void {
    if (!writeStoredDrafts(this.storageKey, this.drafts)) this.note("浏览器无法保存临时草稿，请在离开前保存。");
  }

  private remember(): void {
    const { q } = this;
    if (!this.selected || this.busy) return;
    this.drafts[this.selected] = { ...this.values(), expected_revision: this.revision };
    this.persist(); q("draft-note").textContent = "有未保存的修改，已暂存在此窗口；发布前会先保存。";
    q("tools-field").hidden = q<HTMLInputElement>("inherit").checked;
  }

  private renderList(): void {
    renderList({ list: this.list, empty: this.q("empty"), records: this.records, publications: this.publications, drafts: this.drafts,
      selected: this.selected, open: id => { if (!this.busy) this.select(id); } });
  }

  private renderEditor(): void {
    const { q } = this;
    const record = this.current();
    q("workspace").hidden = !record; this.root.dataset.expanded = record ? "true" : "false";
    if (!record) { this.imports.render(null); return; }
    const local = this.drafts[record.character_id], value: CharacterContent = local || record;
    this.revision = local ? local.expected_revision : record.revision;
    q<HTMLInputElement>("title").value = value.title; q<HTMLTextAreaElement>("instructions").value = value.instructions;
    q<HTMLInputElement>("inherit").checked = value.host_tools === null; q<HTMLInputElement>("tools").value = (value.host_tools || []).join(", ");
    q("tools-field").hidden = q<HTMLInputElement>("inherit").checked;
    this.actions.render(value.action_tools);
    q("heading").textContent = record.title;
    q("status").textContent = statusOf(record, latestActive(this.publications, record.character_id));
    q("toggle").textContent = record.state === "disabled" ? "启用" : "停用";
    q("draft-note").textContent = draftNoteOf(record, local);
    renderVersions(q("publications"), this.publications, this.selected, tools => this.actions.describe(tools), (publication, details) => this.imports.renderPublication(publication, details));
    this.imports.render(record); this.controls();
  }

  private controls(): void {
    const record = this.current();
    this.root.querySelectorAll<Control>("button, input, textarea").forEach(element => { if (!element.closest(IMPORT_DIALOGS)) element.disabled = this.busy; });
    if (record?.state === "tombstoned") this.form.querySelectorAll<Control>("button, input, textarea").forEach(element => { element.disabled = true; });
    if (record?.state !== "active") this.q<HTMLButtonElement>("preview").disabled = true;
    this.actions.controls(this.busy || record?.state === "tombstoned");
  }

  private select(id: string | null, focus = true): void {
    const previous = this.selected;
    this.selected = id; this.note(""); this.renderList(); this.renderEditor();
    if (!focus) return;
    // Opening a Character lands on its heading; going back lands on the row it came from.
    requestAnimationFrame(() => {
      if (id) this.find("heading")?.focus({ preventScroll: false });
      else if (previous) this.list.querySelector<HTMLElement>('[data-character-id="' + CSS.escape(previous) + '"]')?.focus();
      this.root.scrollIntoView?.({ block: "start" });
    });
  }

  private async load(): Promise<void> {
    const result = await this.request<{ drafts: CharacterRecord[]; publications: CharacterPublication[] }>("GET", "/drafts");
    this.records = result.drafts; this.publications = result.publications; this.renderList(); this.renderEditor();
  }

  private async act(action: () => Promise<unknown>): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.controls();
    try {
      await action();
    } catch (error) {
      this.note(messageOf(error) || "操作失败，未保存的修改仍保留。");
    } finally {
      this.busy = false; this.controls();
    }
  }

  private async save(): Promise<CharacterRecord> {
    const id = this.selected;
    if (id === null) throw new Error("角色请求失败");
    const result = await this.request<{ draft: CharacterRecord }>("PUT", "/drafts/" + encodeURIComponent(id), { ...this.values(), expected_revision: this.revision });
    delete this.drafts[id]; this.persist(); this.records = this.records.map(record => record.character_id === id ? result.draft : record); this.revision = result.draft.revision;
    this.renderList(); this.renderEditor(); this.note("草稿已保存。");
    return result.draft;
  }

  private confirm(title: string, description: string, content: string, label: string, action: () => Promise<void>): void {
    const { q } = this;
    this.confirmation = action; q("dialog-title").textContent = title; q("dialog-description").textContent = description;
    q("dialog-content").textContent = content; q("confirm").textContent = label; this.dialog.showModal();
  }

  private bind(): void {
    const { q, form } = this;
    const editable = (event: Event): void => { if (event.target instanceof Element && event.target.matches(EDIT_FIELDS)) this.remember(); };
    form.addEventListener("input", editable);
    form.addEventListener("change", editable);
    form.addEventListener("submit", event => { event.preventDefault(); void this.act(() => this.save()); });
    q("new").addEventListener("click", () => void this.act(() => this.createCharacter()));
    q("back").addEventListener("click", () => { if (!this.busy) this.select(null); });
    q("preview").addEventListener("click", () => void this.act(() => this.confirmPublish()));
    q("toggle").addEventListener("click", () => this.confirmToggle());
    q("delete").addEventListener("click", () => this.confirmDelete());
    q("reload").addEventListener("click", () => this.confirmReload());
    q("confirm").addEventListener("click", () => void this.act(async () => { if (this.confirmation) await this.confirmation(); }));
    this.dialog.addEventListener("close", () => { this.confirmation = null; });
  }

  private async createCharacter(): Promise<void> {
    const result = await this.request<{ draft: CharacterRecord }>("POST", "/drafts", {});
    await this.load(); this.select(result.draft.character_id, false);
    requestAnimationFrame(() => { const title = this.q<HTMLInputElement>("title"); title.focus(); title.select(); });
  }

  private async confirmPublish(): Promise<void> {
    const record = this.dirty() ? await this.save() : this.current();
    if (!record?.instructions.trim()) throw new Error("先填写角色的做事方式，再发布。");
    const frozenId = record.character_id, frozenRevision = record.revision;
    this.confirm("发布「" + record.title + "」", "将草稿修订 " + frozenRevision + " 的以下内容发布到当前项目。Coding 仍需明确选择此版本。",
      readableContent(record, tools => this.actions.describe(tools)), "发布到当前项目", async () => {
        const result = await this.request<{ replayed?: boolean; reference: { version: number } }>("POST", "/drafts/" + encodeURIComponent(frozenId) + "/publish", { expected_revision: frozenRevision });
        this.dialog.close(); await this.load();
        this.note((result.replayed ? "当前草稿已发布，复用" : "已发布") + " v" + result.reference.version + "，内容已固定。");
      });
  }

  private confirmToggle(): void {
    const record = this.current();
    if (!record) return;
    const id = record.character_id, expected = this.revision, enable = record.state === "disabled", state = enable ? "active" : "disabled";
    this.confirm(enable ? "启用角色" : "停用角色", enable ? "启用后，可在新执行中明确选择已发布版本。" : "新的执行不能再选择此角色；内置引擎后续动作调用也会停止。已完成的操作和历史版本保持。",
      record.title, enable ? "启用" : "停用", async () => {
        await this.request("POST", "/drafts/" + encodeURIComponent(id) + "/state", { expected_revision: expected, state });
        // Keep unsubmitted text; state transitions advance the revision without changing that text.
        if (this.drafts[id]) { this.drafts[id].expected_revision = expected + 1; this.persist(); }
        this.dialog.close(); await this.load(); this.note(enable ? "已启用。" : "已停用。");
      });
  }

  private confirmDelete(): void {
    const record = this.current();
    if (!record) return;
    const id = record.character_id, expected = this.revision;
    this.confirm("删除角色", "删除后不能恢复这个角色；所有项目的新执行都不能再选择它。历史执行及其固定内容保留。", record.title, "删除角色", async () => {
      await this.request("POST", "/drafts/" + encodeURIComponent(id) + "/state", { expected_revision: expected, state: "tombstoned" });
      delete this.drafts[id]; this.persist(); this.selected = null; this.dialog.close(); await this.load(); this.note("角色已删除，历史执行保留。");
    });
  }

  private confirmReload(): void {
    const id = this.selected;
    if (id === null) return;
    this.confirm("重新读取草稿", "放弃此窗口尚未保存的修改，读取最新保存版本。", "", "重新读取", async () => {
      delete this.drafts[id]; this.persist(); this.dialog.close(); await this.load(); this.note("已读取最新草稿。");
    });
  }
}

/** Finds the page and brings it to life; nothing happens on a page without it. */
export function mountCharacters(): void {
  const root = document.querySelector<HTMLElement>("[data-characters]");
  if (!root) return;
  new CharactersPage(root).start();
  startCharacterTerminal();
}
