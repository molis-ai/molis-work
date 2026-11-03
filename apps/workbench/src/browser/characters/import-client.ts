import {
  el, messageOf, RUNTIME_NAMES,
  type ArtifactVersionRef, type CharacterPublication, type CharacterRecord, type CharacterRequest, type ImportSnapshot, type Part,
  type PublicationPayload, type SnapshotSkill,
} from "./common.js";
import { detail, diff, filePreview, files } from "./import-files.js";

/** What the Character page lends the import and run dialogs. */
export interface ImportHost {
  q: Part;
  request: CharacterRequest;
  current: () => CharacterRecord | undefined;
  load: () => Promise<void>;
  select: (id: string | null, focus?: boolean) => void;
  act: (action: () => Promise<unknown>) => Promise<void>;
  save: () => Promise<CharacterRecord>;
  dirty: () => boolean;
  note: (text: string) => void;
}

export interface ImportClient {
  render(record: CharacterRecord | null): void;
  renderPublication(record: CharacterPublication, target: HTMLElement): void;
}

interface Candidate { candidate_id: string; label: string; executable: string | null; snapshot: ImportSnapshot; warnings: string[] }
interface Selection { rule_paths: string[]; skill_ids: string[] }
/** A native run as Characters records it (`characters.runs@2`): no terminal output is kept, the terminal shows it while the process runs. */
interface RunRecord { run_id: string; panel_id: string; created_at: string; reference: ArtifactVersionRef; status: "starting" | "dispatched" | "failed"; status_message: string | null }
interface Execution { workspaces: Array<{ workspace_id: string; canonical_path: string }>; notice: string; executable: boolean }
interface Published { reference: ArtifactVersionRef; publication: { payload: PublicationPayload } }

function skillChoice(skill: SnapshotSkill): HTMLLabelElement {
  const label = el("label"), check = el("input");
  label.className = "characters-check"; check.type = "checkbox"; check.className = "mw-check";
  check.value = skill.id; check.disabled = skill.compatibility !== "portable";
  label.append(check, el("span", skill.name + (check.disabled ? " · 需要原生环境" : "")));
  return label;
}

function warningsOf(warnings: string[]): HTMLDetailsElement {
  const box = el("details");
  box.append(el("summary", warnings.length + " 项读取说明"));
  for (const warning of warnings) box.append(el("p", warning));
  return box;
}

/** Import from a local Agent, the source of an imported Character, and running a published version. */
class ImportView {
  private readonly q: Part;
  private readonly dialog: HTMLDialogElement;
  private readonly preview: HTMLElement;
  private readonly runDialog: HTMLDialogElement;
  private candidate: Candidate | null = null;
  private editing: CharacterRecord | null = null;
  private pending = false;
  private selection: Selection = { rule_paths: [], skill_ids: [] };
  private runContent: PublicationPayload | null = null;
  private reference: ArtifactVersionRef | null = null;
  private execution: Execution | null = null;
  private requestId: string | null = null;
  private runTicket = 0;
  private shownCharacter = "";

  constructor(private readonly host: ImportHost) {
    this.q = host.q;
    this.dialog = this.q<HTMLDialogElement>("import-dialog");
    this.preview = this.q("import-preview");
    this.runDialog = this.q<HTMLDialogElement>("run-dialog");
    this.bind();
  }

  private bind(): void {
    const { host, q } = this;
    q("import-open").onclick = () => this.open(false);
    q("rescan").onclick = () => this.open(true);
    q("scan").onclick = () => void this.scan();
    q("import-close").onclick = () => { if (!this.pending) this.dialog.close(); };
    this.dialog.addEventListener("cancel", event => { if (this.pending) event.preventDefault(); });
    q("import-confirm").onclick = () => void this.importSelected();
    q("use").onclick = () => void host.act(() => this.publishAndUse());
    q("run-close").onclick = () => this.runDialog.close();
    q("run-internal").onclick = () => this.runInternal();
    q("run-native").onclick = () => void this.runNative();
  }

  private count(): void {
    const confirm = this.q<HTMLButtonElement>("import-confirm"), { rule_paths, skill_ids } = this.selection;
    confirm.disabled = this.pending || !this.candidate || !(rule_paths.length + skill_ids.length);
    confirm.textContent = (this.editing ? "更新快照" : "导入角色") + " · " + rule_paths.length + " 条规则 / " + skill_ids.length + " 个技能";
  }

  private addRow(name: string, path: string, kind: keyof Selection, key: string, description: string, body: HTMLElement): void {
    const row = el("section", undefined, "characters-import-item"), label = el("label"), check = el("input");
    check.type = "checkbox"; check.className = "mw-check"; check.checked = this.selection[kind].includes(key);
    check.onchange = () => {
      this.selection[kind] = check.checked ? [...this.selection[kind], key] : this.selection[kind].filter(x => x !== key);
      this.count();
    };
    label.append(check, el("span", name));
    row.append(label, el("small", path), el("small", description), body);
    this.preview.append(row);
  }

  private selectionButtons(snapshot: ImportSnapshot): HTMLElement {
    const actions = el("div", undefined, "characters-actions");
    const choices: Array<[string, boolean]> = [["全选", false], ["只选可供内置引擎使用的内容", true]];
    for (const [label, onlyPortable] of choices) {
      const button = el("button", label, "mw-btn mw-btn--ghost");
      button.type = "button";
      button.onclick = () => {
        this.selection = { rule_paths: snapshot.rules.map(r => r.path), skill_ids: snapshot.skills.filter(s => !onlyPortable || s.compatibility === "portable").map(s => s.id) };
        this.renderPreview();
      };
      actions.append(button);
    }
    return actions;
  }

  private renderPreview(): void {
    const { preview, candidate } = this;
    preview.replaceChildren();
    if (!candidate) { this.count(); return; }
    const snapshot = candidate.snapshot;
    preview.append(el("h3", candidate.label), el("p", (candidate.executable ? "已发现 CLI；登录和执行状态将在启动时确认。" : "可导入配置；未发现可用 CLI。") + " " + snapshot.config_root, "characters-hint"));
    if (candidate.warnings.length) preview.append(warningsOf(candidate.warnings));
    if (this.editing) preview.append(el("p", diff(this.editing.import_snapshot, snapshot), "characters-hint"));
    preview.append(this.selectionButtons(snapshot));
    for (const rule of snapshot.rules) {
      this.addRow((rule.scope === "project" ? "项目规则 · " : "全局规则 · ") + rule.path.split("/").pop(), rule.path, "rule_paths", rule.path, rule.condition || "始终适用", detail("预览原文", rule.content));
    }
    for (const skill of snapshot.skills) {
      const body = el("details");
      body.append(el("summary", "预览 " + skill.files.length + " 个文件"));
      for (const file of skill.files) body.append(filePreview(this.host.request, file, skill, { candidate_id: candidate.candidate_id }));
      this.addRow(skill.name, skill.path, "skill_ids", skill.id, skill.description + " · " + (skill.compatibility === "portable" ? "文本技能，可供内置引擎使用" : skill.reason || "需要原生环境"), body);
    }
    this.count();
  }

  private choose(item: Candidate): void {
    this.candidate = item;
    const saved = this.editing?.import_snapshot;
    this.selection = {
      rule_paths: item.snapshot.rules.filter(r => !saved || saved.rules.some(old => old.path === r.path)).map(r => r.path),
      skill_ids: item.snapshot.skills.filter(s => !saved || saved.skills.some(old => old.id === s.id)).map(s => s.id),
    };
    for (const button of this.q("sources").children) {
      if (button instanceof HTMLElement) button.setAttribute("aria-pressed", String(button.dataset.id === item.candidate_id));
    }
    this.renderPreview();
  }

  private sourceButton(item: Candidate): HTMLButtonElement {
    const button = el("button", item.label + " · " + item.snapshot.rules.length + " 规则 / " + item.snapshot.skills.length + " Skills", "mw-btn mw-btn--secondary");
    button.type = "button"; button.dataset.id = item.candidate_id; button.onclick = () => this.choose(item);
    return button;
  }

  private async discover(): Promise<Candidate[]> {
    const { q } = this;
    const runtime = q<HTMLSelectElement>("import-runtime").value, config = q<HTMLInputElement>("import-config").value.trim(), project = q<HTMLInputElement>("import-project").value.trim();
    if (config && !runtime) throw new Error("指定配置目录时，请先选择 Agent。");
    const result = await this.host.request<{ candidates: Candidate[] }>("POST", "/imports/discover",
      { ...(runtime ? { runtime_id: runtime } : {}), ...(config ? { config_root: config } : {}), ...(project ? { project_root: project } : {}) });
    return result.candidates;
  }

  private async scan(): Promise<void> {
    if (this.pending) return;
    const { q } = this;
    this.pending = true; this.candidate = null; this.preview.replaceChildren(); q("sources").replaceChildren();
    q("import-notice").textContent = "正在读取本机规则和 Skills…"; q<HTMLButtonElement>("scan").disabled = true; this.count();
    try {
      const candidates = await this.discover();
      for (const item of candidates) q("sources").append(this.sourceButton(item));
      if (candidates.length) this.choose(candidates[0]);
      q("import-notice").textContent = candidates.length ? "规则和附件保留原文；导入不会执行技能脚本或复制登录信息。" : "未发现可导入内容。可以指定 Agent 配置目录后重试。";
    } catch (error) {
      q("import-notice").textContent = messageOf(error);
    } finally {
      this.pending = false; q<HTMLButtonElement>("scan").disabled = false; this.count();
    }
  }

  private open(update: boolean): void {
    const { host, q } = this;
    if (host.dirty()) { host.note("请先保存当前修改，再检查来源更新。"); return; }
    this.editing = update ? (structuredClone(host.current()) ?? null) : null;
    const source = this.editing?.import_snapshot;
    q<HTMLSelectElement>("import-runtime").value = source?.runtime_id || "";
    q<HTMLInputElement>("import-config").value = source?.config_root || "";
    q<HTMLInputElement>("import-project").value = source?.project_root || "";
    this.dialog.showModal(); void this.scan();
  }

  private async importSelected(): Promise<void> {
    const { host, q, candidate } = this;
    if (this.pending || !candidate) return;
    this.pending = true; this.count();
    try {
      const existing = this.editing ? { existing: { character_id: this.editing.character_id, expected_revision: this.editing.revision } } : {};
      const result = await host.request<{ draft: CharacterRecord; replayed?: boolean }>("POST", "/imports", { candidate_id: candidate.candidate_id, selection: this.selection, ...existing });
      await host.load(); host.select(result.draft.character_id); this.dialog.close();
      host.note(result.replayed ? "已导入过这个来源，打开现有角色；你的修改保持。" : "角色已保存，规则与 Skills 可在下方查看。");
    } catch (error) {
      q("import-notice").textContent = messageOf(error);
    } finally {
      this.pending = false; this.count();
    }
  }

  private showRun(item: RunRecord): void {
    const { q } = this;
    q("native-section").hidden = false;
    window.dispatchEvent(new CustomEvent("molis-work:character-terminal", { detail: { panelId: item.panel_id, attachOnly: true } }));
  }

  private runButton(item: RunRecord): HTMLButtonElement {
    const button = el("button", new Date(item.created_at).toLocaleString() + " · v" + item.reference.version + (item.status === "failed" ? " · 启动失败" : ""), "mw-btn mw-btn--ghost");
    button.type = "button"; button.title = "在终端里看" + (item.status_message ? "：" + item.status_message : ""); button.onclick = () => this.showRun(item);
    return button;
  }

  private async loadRuns(id: string): Promise<void> {
    const ticket = ++this.runTicket, { host, q } = this;
    try {
      const result = await host.request<{ runs: RunRecord[] }>("GET", "/drafts/" + encodeURIComponent(id) + "/runs");
      if (ticket !== this.runTicket || host.current()?.character_id !== id) return;
      const target = q("native-runs");
      target.replaceChildren(); q("native-section").hidden = !result.runs.length;
      for (const item of result.runs) target.append(this.runButton(item));
    } catch (error) {
      host.note(messageOf(error));
    }
  }

  render(record: CharacterRecord | null): void {
    const { q } = this;
    if (this.shownCharacter !== record?.character_id) {
      this.shownCharacter = record?.character_id || "";
      window.dispatchEvent(new CustomEvent("molis-work:character-terminal-reset"));
    }
    const snapshot = record?.import_snapshot;
    q("source-detail").hidden = !snapshot;
    if (record && snapshot) {
      q("source-summary").textContent = RUNTIME_NAMES[snapshot.runtime_id] + " · " + snapshot.rules.length + " 条规则 · " + snapshot.skills.length + " 个 Skills · " + new Date(snapshot.captured_at).toLocaleString();
      q("source-files").replaceChildren();
      files(this.host.request, q("source-files"), snapshot, { character_id: record.character_id });
    }
    if (record) void this.loadRuns(record.character_id);
    else { this.runTicket++; q("native-section").hidden = true; }
  }

  private fillRunDialog(content: PublicationPayload, reference: ArtifactVersionRef, execution: Execution): void {
    const { q } = this;
    q("run-version").textContent = content.title + " · 固定版本 v" + reference.version;
    const workspaces = q<HTMLSelectElement>("run-workspace");
    workspaces.replaceChildren();
    for (const item of execution.workspaces) {
      const option = el("option", item.canonical_path);
      option.value = item.workspace_id; workspaces.append(option);
    }
    const snapshot = content.import_snapshot;
    q("native-name").textContent = snapshot ? "本地 " + RUNTIME_NAMES[snapshot.runtime_id] : "本地 Agent";
    q("native-notice").textContent = execution.notice + (execution.executable ? "" : " 未发现对应 CLI。");
    const incompatible = (snapshot?.skills || []).filter(s => s.compatibility !== "portable");
    q("internal-status").textContent = "请选择本轮需要的文本 Skills；未选择时只加载规则。" + (incompatible.length ? incompatible.length + " 个技能需要原生环境，不能在此模式选择。" : "");
    q("run-skills").replaceChildren();
    for (const skill of snapshot?.skills || []) q("run-skills").append(skillChoice(skill));
    q<HTMLButtonElement>("run-internal").disabled = false;
    q<HTMLButtonElement>("run-native").disabled = !execution.executable || !execution.workspaces.length;
    q("run-notice").textContent = execution.workspaces.length ? "" : "当前项目未绑定工作目录，请在项目设置中添加。";
  }

  private async publishAndUse(): Promise<void> {
    const { host } = this;
    const active = host.current();
    if (active?.state !== "active") throw new Error("请先启用这个角色。");
    const record = host.dirty() ? await host.save() : active;
    const published = await host.request<Published>("POST", "/drafts/" + encodeURIComponent(record.character_id) + "/publish", { expected_revision: record.revision });
    const reference = published.reference, content = published.publication.payload;
    this.reference = reference; this.runContent = content; this.requestId = null;
    const execution = await host.request<Execution>("POST", "/execution", { reference });
    this.execution = execution;
    await host.load();
    this.fillRunDialog(content, reference, execution);
    this.runDialog.showModal();
  }

  private runInternal(): void {
    const { q } = this;
    if (!document.querySelector("[data-coding-workbench]")) { q("run-notice").textContent = "请先启用 Coding 插件。"; return; }
    const skillIds = [...q("run-skills").querySelectorAll<HTMLInputElement>("input:checked")].map(input => input.value);
    window.dispatchEvent(new CustomEvent("molis-work:character-coding", { detail: { reference: this.reference, title: this.runContent?.title,
      task: q<HTMLTextAreaElement>("run-task").value, workspace_id: q<HTMLSelectElement>("run-workspace").value, skill_ids: skillIds } }));
    this.runDialog.close();
  }

  private async runNative(): Promise<void> {
    const { host, q } = this;
    if (this.pending || !this.execution?.executable) return;
    if (!q<HTMLTextAreaElement>("run-task").value.trim()) { q("run-notice").textContent = "请填写这次任务。"; return; }
    this.pending = true; q<HTMLButtonElement>("run-native").disabled = true; this.requestId = this.requestId || crypto.randomUUID();
    try {
      const result = await host.request<{ spawn: unknown }>("POST", "/execution/native",
        { reference: this.reference, workspace_id: q<HTMLSelectElement>("run-workspace").value, task: q<HTMLTextAreaElement>("run-task").value, request_id: this.requestId });
      q("native-section").hidden = false;
      window.dispatchEvent(new CustomEvent("molis-work:character-terminal", { detail: result.spawn }));
      this.runDialog.close();
      const record = host.current();
      if (record) await this.loadRuns(record.character_id);
      host.note("已提供固定角色包读取指令。请在原生终端中查看实际加载、授权和执行结果。");
      this.requestId = null;
    } catch (error) {
      q("run-notice").textContent = messageOf(error);
    } finally {
      this.pending = false; q<HTMLButtonElement>("run-native").disabled = !this.execution?.executable;
    }
  }

  renderPublication(record: CharacterPublication, target: HTMLElement): void {
    const snapshot = record.payload.import_snapshot;
    if (snapshot) files(this.host.request, target, snapshot, { reference: { artifact_id: record.artifact_id, version: record.version } });
  }
}

/** The import and run dialogs of the Character page: the host lends what the page already has. */
export function characterImportClient(host: ImportHost): ImportClient {
  const view = new ImportView(host);
  return { render: record => view.render(record), renderPublication: (record, target) => view.renderPublication(record, target) };
}
