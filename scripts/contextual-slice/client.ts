/**
 * Browser side of the context-driven interaction slice (specs/contextual-interaction §3, §4, §6, §7).
 * Sections: api · documents & editor · focus adapter · context bus · action row · cards · input · debug drawer.
 * The bus, the row and the cards are the parts P1 moves into the workbench; the rest is slice scaffolding.
 */
import type { ContextualJudgeResponse, ContextualLayoutPlan, ContextualCandidate, FrozenFocus, SurfaceFocus } from "@molis-ai/molis-work-contracts/services/contextual";

type PagesFocus = { local_id: string; activity: SurfaceFocus["activity"]; granularity: SurfaceFocus["granularity"]; targets: SurfaceFocus["targets"]; surroundings: SurfaceFocus["surroundings"] };
type EditorHandle = { view: { focus(): void; dom: HTMLElement; state: unknown } };
type EditorApi = {
  mount(host: HTMLElement, options: Record<string, unknown>): EditorHandle;
  getDoc(handle: EditorHandle): unknown; setDoc(handle: EditorHandle, doc: unknown): void;
  freezePagesFocus(view: unknown, token: string, range?: { from: number; to: number }, quiet?: boolean): { token: string; from: number; to: number; text: string } | null;
  resolvePagesFrozen(view: unknown, token: string): { from: number; to: number; text: string; intact: boolean } | null;
  releasePagesFrozen(view: unknown, token: string): void;
  applyToPagesFrozen(view: unknown, token: string, text: string, mode: "replace" | "insert_after" | "delete"): { ok: true; from: number; to: number } | { ok: false; reason: string };
  clearPagesCompare(view: unknown): void;
};
declare global { interface Window { MolisWorkPagesEditor: EditorApi } }

const E = window.MolisWorkPagesEditor;
const PANE = "pane-main";
const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) => root.querySelector(selector) as T | null;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string | null | undefined | false)[]) => {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name === "class") node.className = value; else if (name === "text") node.textContent = value; else node.setAttribute(name, value);
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
};
const uid = (prefix: string) => prefix + "-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ---- api ---------------------------------------------------------------------------------------------------------
async function api<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, signal });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error((value as { error?: string }).error ?? `请求失败（${response.status}）`), { status: response.status, code: (value as { code?: string }).code });
  return value as T;
}
const signal = (kind: "accepted" | "ignored" | "rewritten" | "undone", label: string, context_id: string) => { void api("POST", "/api/contextual/signal", { signal: kind, label, context_id }).catch(() => undefined); };

// ---- documents & editor -----------------------------------------------------------------------------------------
type DocMeta = { id: string; title: string; version: number; goal?: { id: string; title: string; state: string } };
type Doc = DocMeta & { body: unknown };
let docs: DocMeta[] = [];
let current: Doc | null = null;
let editor: EditorHandle | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saving: Promise<void> = Promise.resolve();
let lastPagesFocus: PagesFocus | null = null;
const multi = new Set<string>();

function docMeta() {
  if (!current) return;
  $("[data-cx-doc-title]")!.textContent = current.title;
  $("[data-cx-doc-meta]")!.textContent = `第 ${current.version} 版${current.goal ? ` · 关联 Goal：${current.goal.title}` : ""}`;
}

function renderDocList() {
  const list = $("[data-cx-doc-list]")!;
  list.replaceChildren(...docs.map(doc => {
    const row = el("button", { class: "cx-doc-row", type: "button", "data-doc": doc.id, "aria-current": current?.id === doc.id ? "page" : "false", "aria-selected": multi.has(doc.id) ? "true" : "false" },
      el("span", { text: doc.title }), el("small", { text: doc.goal ? `Goal · ${doc.goal.title}` : "未关联 Goal" }));
    row.addEventListener("click", event => {
      if (event.metaKey || event.ctrlKey) {
        if (multi.has(doc.id)) multi.delete(doc.id); else multi.add(doc.id);
        if (current && multi.size === 1 && !multi.has(current.id)) multi.add(current.id);
        renderDocList();
        bus.set(toSurfaceFocus(lastPagesFocus));
        return;
      }
      void openDoc(doc.id);
    });
    return row;
  }));
}

async function saveNow() {
  if (!current || !editor) return;
  const doc = current, body = E.getDoc(editor);
  saving = saving.then(async () => {
    try {
      const out = await api<{ version: number }>("PUT", `/api/docs/${doc.id}`, { body, expected_version: doc.version });
      doc.version = out.version; doc.body = body;
      const meta = docs.find(item => item.id === doc.id); if (meta) meta.version = out.version;
      if (current === doc) docMeta();
    } catch (error) { console.warn(error); }
  });
  await saving;
}
function queueSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { void saveNow(); }, 600); }

async function openDoc(id: string, flashText?: string) {
  if (current && current.id !== id) { clearTimeout(saveTimer); await saveNow(); }
  multi.clear();
  bus.set(null);
  current = await api<Doc>("GET", `/api/docs/${id}`);
  const host = $("[data-cx-editor]")!;
  if (!editor) {
    editor = E.mount(host, {
      doc: current.body, translate: (value: string) => value,
      onChange: () => { queueSave(); cards.checkStale(); },
      // Selecting inside the document takes over from a multi-document selection in the list.
      onFocus: (focus: PagesFocus | null) => { lastPagesFocus = focus; if (focus && multi.size) { multi.clear(); renderDocList(); } bus.set(toSurfaceFocus(focus)); },
      runAi: async (input: { command: string; text: string; style?: string }) => api("POST", "/api/pages-ai", input),
    });
  } else {
    E.setDoc(editor, current.body);
    // The editor reports focus changes only; after swapping the document, read it once so the bar matches this page.
    lastPagesFocus = (E as unknown as { readPagesFocus(state: unknown): PagesFocus | null }).readPagesFocus(editor.view.state);
    bus.set(toSurfaceFocus(lastPagesFocus));
  }
  docMeta();
  renderDocList();
  if (flashText) requestAnimationFrame(() => flash(flashText));
}

function flash(text: string) {
  const probe = text.slice(0, 16);
  const target = [...(editor?.view.dom.querySelectorAll("p, li, blockquote, h1, h2, h3") ?? [])].find(node => node.textContent?.includes(probe));
  if (!target) return;
  target.scrollIntoView({ block: "center" });
  target.classList.remove("cx-flash"); void (target as HTMLElement).offsetWidth; target.classList.add("cx-flash");
}

// ---- focus adapter ----------------------------------------------------------------------------------------------
function plain(node: unknown): string {
  const value = node as { type?: string; text?: string; content?: unknown[] };
  if (value.type === "text") return value.text ?? "";
  return (value.content ?? []).map(plain).join(value.type === "doc" ? "\n" : "");
}

let objectTexts = new Map<string, string>();
function toSurfaceFocus(focus: PagesFocus | null): SurfaceFocus | null {
  if (multi.size >= 2) {
    const chosen = docs.filter(doc => multi.has(doc.id));
    return {
      context_id: "objects:" + chosen.map(doc => `${doc.id}@${doc.version}`).sort().join(","), plugin_id: "io.molis.work.pages", activity: "selecting", granularity: "objects",
      object: { kind: "pages_document", id: chosen[0]!.id, version: chosen[0]!.version, title: chosen[0]!.title },
      targets: chosen.map(doc => ({ kind: "object" as const, role: "object" as const, text: `${doc.title}\n${(objectTexts.get(doc.id) ?? "").slice(0, 600)}`, ref: { kind: "pages_document", id: doc.id, version: doc.version, title: doc.title } })),
    };
  }
  if (!focus || !current) return null;
  return {
    context_id: `${current.id}:${focus.local_id}`, plugin_id: "io.molis.work.pages", activity: focus.activity, granularity: focus.granularity,
    object: { kind: "pages_document", id: current.id, version: current.version, title: current.title },
    targets: focus.targets, surroundings: focus.surroundings, ...(current.goal ? { goal: current.goal } : {}),
  };
}

// ---- context bus ------------------------------------------------------------------------------------------------
const bus = {
  current: null as SurfaceFocus | null,
  seq: 0,
  timer: undefined as ReturnType<typeof setTimeout> | undefined,
  judging: null as AbortController | null,
  dismissed: new Map<string, Set<string>>(),
  recent: [] as string[],
  dropped: 0,
  set(focus: SurfaceFocus | null) {
    if ((focus?.context_id ?? null) === (this.current?.context_id ?? null)) return;
    this.current = focus;
    clearTimeout(this.timer);
    this.judging?.abort(); this.judging = null;
    const seq = ++this.seq;
    if (!focus) { void api("POST", "/api/contextual/cancel", { pane_id: PANE }).catch(() => undefined); bar.idle(); cards.dropSuggestion(); return; }
    bar.pending(focus);
    void api<ContextualJudgeResponse>("POST", "/api/contextual/candidates", this.request(focus)).then(out => {
      if (seq !== this.seq || out.plan.context_id !== this.current?.context_id) { this.dropped += 1; return; }
      bar.render(out, focus, true);
    }).catch(error => { if (seq === this.seq) bar.error(error); });
    this.timer = setTimeout(() => { void this.judge(seq, focus); }, focus.activity === "editing" ? 900 : 350);
  },
  request(focus: SurfaceFocus) {
    return { pane_id: PANE, focus, recent: this.recent.slice(0, 3), pinned: bar.pinned(), previous: bar.previous(), dismissed: [...(this.dismissed.get(focus.context_id) ?? [])] };
  },
  async judge(seq: number, focus: SurfaceFocus) {
    const controller = new AbortController(); this.judging = controller;
    try {
      const out = await api<ContextualJudgeResponse>("POST", "/api/contextual/judge", this.request(focus), controller.signal);
      if (seq !== this.seq || out.plan.context_id !== this.current?.context_id) { this.dropped += 1; return; }
      bar.render(out, focus, false);
      if (out.plan.assistant) cards.suggest(out.plan, focus, out.judgment?.model ?? (out.judgment?.basis === "jev" ? "Jev 判断" : "规则")); else cards.dropSuggestion();
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      if (seq === this.seq) bar.fallback("failed");
    } finally { if (this.judging === controller) this.judging = null; }
  },
  dismiss(key: string) {
    if (!this.current) return;
    const set = this.dismissed.get(this.current.context_id) ?? new Set<string>();
    set.add(key); this.dismissed.set(this.current.context_id, set);
  },
};
window.addEventListener("molis-work:place-changed", () => bus.set(null));

// ---- action row -------------------------------------------------------------------------------------------------
const GRANULARITY_LABEL: Record<string, string> = { word: "一个词", range: "一段文字", block: "这一段", blocks: "几段内容", objects: "几份文档", page: "整页", object: "整篇" };
const FORM_LABEL: Record<string, string> = { suggest: "有一条建议", options: "给你几个方向", preview: "可以先看预览", compare: "可以并排比较" };

const bar = {
  root: el("div", { class: "cx-actions", "data-assistant-context-actions": "", role: "toolbar", "aria-label": "当前内容可以做的事", "data-state": "idle" }),
  live: el("div", { class: "cx-live", "aria-live": "polite" }),
  buttons: new Map<string, HTMLButtonElement>(),
  shown: null as { context_id: string; primary: string[] } | null,
  held: null as null | (() => void),
  plan: null as ContextualLayoutPlan | null,
  hover: new Set<string>(),
  menu: null as HTMLElement | null,
  lastAnnounce: "",
  mount() {
    const center = $(".bar-center") ?? $("[data-assistant-island]")?.parentElement ?? document.body;
    (center as HTMLElement).style.position = "relative";
    center.append(this.root, this.live);
    this.root.addEventListener("pointerleave", () => this.release());
    this.root.addEventListener("focusout", event => { if (!this.root.contains(event.relatedTarget as Node)) this.release(); });
    this.root.addEventListener("keydown", event => this.keys(event));
    document.addEventListener("keydown", event => {
      if ((event.metaKey || event.ctrlKey) && event.key === ".") { event.preventDefault(); (this.root.querySelector(".cx-act") as HTMLElement | null)?.focus(); }
    });
    document.addEventListener("pointerdown", event => { if (this.menu && !this.root.contains(event.target as Node)) this.closeMenu(); });
  },
  pinned(): string[] {
    const active = document.activeElement as HTMLElement | null;
    const keys = new Set(this.hover);
    if (active?.dataset.key && this.root.contains(active)) keys.add(active.dataset.key);
    return [...keys];
  },
  previous() { return this.shown ?? undefined; },
  interacting() { return this.root.matches(":hover") || this.root.contains(document.activeElement); },
  idle() { this.root.dataset.state = "idle"; this.closeMenu(); this.plan = null; this.shown = null; },
  pending(focus: SurfaceFocus) {
    this.root.dataset.state = "active";
    const basis = this.root.querySelector(".cx-basis") as HTMLElement | null;
    if (basis) basis.dataset.pending = "true";
    this.scope(focus);
  },
  error(error: Error) { this.root.dataset.state = "active"; this.root.replaceChildren(el("span", { class: "cx-scope", text: error.message })); },
  fallback(reason: string) { const basis = this.root.querySelector(".cx-basis") as HTMLElement | null; if (basis) { basis.dataset.pending = "false"; basis.querySelector("span")!.textContent = reason === "timeout" ? "判断超时 · 按规则" : "判断失败 · 按规则"; } },
  scope(focus: SurfaceFocus) {
    const target = focus.targets[0];
    const where = focus.surroundings?.heading_path.at(-1);
    const label = focus.activity === "editing" ? "正在写的这段" : focus.activity === "completed" ? `刚完成：${(target?.text ?? "").slice(0, 12)}` : focus.activity === "comparing" ? `比较 ${focus.targets.length} 段`
      : focus.granularity === "word" ? `「${(target?.text ?? "").slice(0, 10)}」` : `${GRANULARITY_LABEL[focus.granularity] ?? ""}${focus.granularity === "blocks" || focus.granularity === "objects" ? `（${focus.targets.length}）` : ""}${where ? ` · ${where}` : ""}`;
    let chip = this.root.querySelector(".cx-scope") as HTMLElement | null;
    if (!chip) {
      chip = el("span", { class: "cx-scope" }, el("span"), el("button", { type: "button", "aria-label": "收起这些建议", title: "收起（这段内容不再推荐）", text: "×" }));
      chip.querySelector("button")!.addEventListener("click", () => { for (const key of this.plan?.primary ?? []) bus.dismiss(key); if (editor) E.clearPagesCompare(editor.view); this.idle(); });
      this.root.prepend(chip);
    }
    chip.querySelector("span")!.textContent = label;
    chip.title = (target?.text ?? "").slice(0, 120);
  },
  render(out: ContextualJudgeResponse, focus: SurfaceFocus, rulesOnly: boolean) {
    const apply = () => this.draw(out, focus, rulesOnly);
    // Never move what the person is pointing at or typing in: a same-context update waits until they leave the row.
    if (this.shown?.context_id === out.plan.context_id && this.interacting()) { this.held = apply; return; }
    apply();
  },
  release() { const held = this.held; this.held = null; if (held && !this.interacting()) held(); },
  draw(out: ContextualJudgeResponse, focus: SurfaceFocus, rulesOnly: boolean) {
    const plan = out.plan;
    this.plan = plan;
    this.root.dataset.state = plan.candidates.some(item => item.available) ? "active" : "idle";
    this.root.dataset.assistant = plan.assistant ? "true" : "false";
    const byKey = new Map(plan.candidates.map(item => [item.key, item]));
    const sameContext = this.shown?.context_id === plan.context_id;
    const next: HTMLElement[] = [];
    this.scope(focus);
    next.push(this.root.querySelector(".cx-scope") as HTMLElement);
    for (const key of plan.primary) {
      const candidate = byKey.get(key)!;
      let button = this.buttons.get(key);
      if (!button) {
        button = el("button", { class: "cx-act", type: "button", "data-key": key }) as HTMLButtonElement;
        button.addEventListener("click", () => actions.choose(key, "bar"));
        button.addEventListener("pointerenter", () => this.hover.add(key));
        button.addEventListener("pointerleave", () => this.hover.delete(key));
        this.buttons.set(key, button);
        if (sameContext) button.dataset.arriving = "true";
      }
      button.replaceChildren(...[el("span", { text: candidate.title }), candidate.provider_title !== "Pages" ? el("span", { class: "cx-kind", text: candidate.provider_title }) : null].filter((node): node is HTMLSpanElement => node !== null));
      button.dataset.emphasis = String(plan.emphasis === key);
      button.dataset.slot = String(plan.primary.indexOf(key));
      button.title = candidate.hint;
      next.push(button);
    }
    for (const [key, button] of this.buttons) if (!plan.primary.includes(key)) { this.buttons.delete(key); this.hover.delete(key); button.remove(); }
    let more = this.root.querySelector(".cx-more-wrap") as HTMLElement | null;
    if (!more) {
      more = el("span", { class: "cx-more-wrap" }, el("button", { class: "cx-act", type: "button", "data-more": "", "aria-haspopup": "true", "aria-expanded": "false", text: "更多" }));
      more.querySelector("button")!.addEventListener("click", () => this.toggleMenu());
    }
    next.push(more);
    let suggest = this.root.querySelector(".cx-suggest") as HTMLElement | null;
    if (!suggest) { suggest = el("button", { class: "cx-act cx-suggest", type: "button" }); suggest.addEventListener("click", () => panel.open()); }
    suggest.replaceChildren(el("span", { class: "cx-long", text: plan.assistant ? `助理：${FORM_LABEL[plan.assistant.form] ?? "有建议"}` : "" }), el("span", { class: "cx-short", text: "助理" }));
    suggest.setAttribute("aria-label", plan.assistant ? `助理：${FORM_LABEL[plan.assistant.form] ?? "有建议"}` : "助理");
    next.push(suggest);
    let basis = this.root.querySelector(".cx-basis") as HTMLElement | null;
    if (!basis) basis = el("span", { class: "cx-basis" }, el("span"));
    basis.dataset.basis = plan.basis;
    basis.dataset.pending = String(rulesOnly);
    const j = out.judgment;
    const reason = out.receipt.fallback === "unconfigured" ? "未接判断模型 · 按规则" : out.receipt.fallback === "timeout" ? "判断超时 · 按规则" : out.receipt.fallback === "failed" ? "判断失败 · 按规则" : out.receipt.fallback === "no_candidates" ? "没有可用动作" : null;
    basis.querySelector("span")!.textContent = rulesOnly ? "按规则 · 判断中" : reason ?? (j ? `${j.basis === "jev" ? "Jev" : "回放"} · ${Math.round(j.latency_ms)}ms` : "按规则");
    basis.title = j?.model ? `判断来源：${j.model}` : "规则排序：只看选区形状，不看含义";
    next.push(basis);
    this.root.replaceChildren(...next);
    this.shown = { context_id: plan.context_id, primary: [...plan.primary] };
    if (this.menu) this.fillMenu();
    const announce = plan.primary.map(key => byKey.get(key)?.title).join("、");
    if (!rulesOnly && announce && announce !== this.lastAnnounce) { this.lastAnnounce = announce; this.live.textContent = `可以做：${announce}`; }
  },
  toggleMenu() {
    if (this.menu) { this.closeMenu(); return; }
    this.menu = el("div", { class: "cx-menu", role: "menu" });
    this.root.querySelector(".cx-more-wrap")!.append(this.menu);
    this.fillMenu();
    // Keep the menu on screen: it opens right-aligned to “更多”, and shifts when that would cross an edge.
    const rect = this.menu.getBoundingClientRect(), margin = 8;
    if (rect.left < margin) this.menu.style.right = `${rect.left - margin}px`;
    else if (rect.right > innerWidth - margin) this.menu.style.right = `${rect.right - (innerWidth - margin)}px`;
    (this.root.querySelector("[data-more]") as HTMLElement).setAttribute("aria-expanded", "true");
    (this.menu.querySelector("button:not([disabled])") as HTMLElement | null)?.focus();
  },
  closeMenu() { this.menu?.remove(); this.menu = null; this.root.querySelector("[data-more]")?.setAttribute("aria-expanded", "false"); },
  fillMenu() {
    if (!this.menu || !this.plan) return;
    const byKey = new Map(this.plan.candidates.map(item => [item.key, item]));
    const item = (candidate: ContextualCandidate) => {
      const button = el("button", { type: "button", role: "menuitem", ...(candidate.available ? {} : { disabled: "" }) }, el("span", { text: candidate.title }), el("small", { text: candidate.available ? candidate.provider_title : candidate.reason ?? "不可用" }));
      button.title = candidate.hint;
      button.addEventListener("click", () => { this.closeMenu(); actions.choose(candidate.key, "menu"); });
      return button;
    };
    const parts: HTMLElement[] = [];
    // Primary actions the row cannot show at this width lead the menu.
    const hidden = this.plan.primary.filter(key => { const button = this.buttons.get(key); return button && getComputedStyle(button).display === "none"; });
    if (hidden.length) { parts.push(el("h4", { text: "推荐" })); for (const key of hidden) parts.push(item(byKey.get(key)!)); }
    for (const group of this.plan.more) { parts.push(el("h4", { text: group.title })); for (const key of group.keys) parts.push(item(byKey.get(key)!)); }
    parts.push(el("hr"), el("h4", { text: "全部操作（不依赖推荐）" }));
    const providers = new Map<string, ContextualCandidate[]>();
    for (const candidate of this.plan.candidates) providers.set(candidate.provider_title, [...(providers.get(candidate.provider_title) ?? []), candidate]);
    for (const [title, list] of providers) { parts.push(el("h4", { text: title })); for (const candidate of list) parts.push(item(candidate)); }
    this.menu.replaceChildren(...parts);
  },
  keys(event: KeyboardEvent) {
    const items = [...this.root.querySelectorAll<HTMLElement>(this.menu?.contains(document.activeElement) ? ".cx-menu button:not([disabled])" : ".cx-act, .cx-scope button")];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") { if (this.menu) { this.closeMenu(); (this.root.querySelector("[data-more]") as HTMLElement).focus(); } else editor?.view.focus(); event.preventDefault(); }
    const forward = this.menu?.contains(document.activeElement) ? "ArrowDown" : "ArrowRight", back = this.menu?.contains(document.activeElement) ? "ArrowUp" : "ArrowLeft";
    if (event.key === forward && index >= 0) { items[(index + 1) % items.length]?.focus(); event.preventDefault(); }
    if (event.key === back && index >= 0) { items[(index - 1 + items.length) % items.length]?.focus(); event.preventDefault(); }
  },
};

// ---- cards ------------------------------------------------------------------------------------------------------
type Preview = { kind: string; text?: string; standin?: string; summary?: string; fields?: { name: string; label: string; value: string; multiline?: boolean }[];
  hits?: { doc_id: string; title: string; excerpt: string; score: number }[]; items?: unknown[]; command?: string };
type Prepared = { key: string; title: string; apply: string; intent: string; provider: string; preview: Preview };
type Card = { id: string; key: string; title: string; provider: string; frozen: FrozenFocus; token: string | null; request_id: string; state: string; el: HTMLElement; prepared?: Prepared; applied?: { token: string; original: string } | null; source: string };

const panel = {
  root: $("[data-cx-panel]")!,
  open() { this.root.hidden = false; cards.pendingBadge(false); },
  close() { this.root.hidden = true; },
};
$("[data-cx-panel-close]")?.addEventListener("click", () => panel.close());

const cards = {
  list: [] as Card[],
  suggestion: null as HTMLElement | null,
  suggestionContext: "",
  host: $("[data-cx-cards]")!,
  pendingBadge(_on: boolean) { /* the bar's suggestion chip is the badge */ },
  add(card: Card) { this.list.push(card); this.host.append(card.el); card.el.scrollIntoView({ block: "nearest" }); },
  suggest(plan: ContextualLayoutPlan, focus: SurfaceFocus, basis: string) {
    if (this.suggestionContext === plan.context_id) return;
    this.dropSuggestion();
    const assistant = plan.assistant!;
    const byKey = new Map(plan.candidates.map(item => [item.key, item]));
    const lead = byKey.get(assistant.keys[0]!)!;
    const quote = (focus.targets[0]?.text ?? "").slice(0, 60);
    const line = assistant.form === "options" ? "这段内容可以往几个方向走：" : assistant.form === "compare" ? "这几处内容适合并排比较：" : assistant.form === "preview" ? `要不要先看看「${lead.title}」之后的样子？` : `可以先「${lead.title}」：${lead.hint}`;
    const buttons = el("div", { class: "cx-actions-row" }, ...assistant.keys.map((key, index) => {
      const candidate = byKey.get(key)!;
      const button = el("button", { class: `mw-btn ${index === 0 ? "mw-btn--primary" : "mw-btn--ghost"}`, type: "button", text: candidate.title });
      button.addEventListener("click", () => actions.choose(key, "suggestion"));
      return button;
    }));
    const dismiss = el("button", { class: "mw-btn mw-btn--ghost", type: "button", text: "不用" });
    dismiss.addEventListener("click", () => { for (const key of assistant.keys) { bus.dismiss(key); signal("ignored", byKey.get(key)!.title, plan.context_id); } this.dropSuggestion(); });
    buttons.append(dismiss);
    this.suggestion = el("article", { class: "cx-card", "data-kind": "suggestion" },
      el("header", {}, el("strong", { text: "助理建议" }), el("small", { text: `依据：${basis}` })),
      el("blockquote", { class: "cx-quote", text: quote + (quote.length >= 60 ? "…" : "") }), el("p", { class: "cx-text", text: line }), buttons);
    this.suggestionContext = plan.context_id;
    this.host.append(this.suggestion);
  },
  dropSuggestion() { this.suggestion?.remove(); this.suggestion = null; this.suggestionContext = ""; },
  checkStale() {
    for (const card of this.list) {
      if (!card.token || !editor || !["ready"].includes(card.state) || !card.prepared || !["replace", "insert_after"].includes(card.prepared.preview.kind)) continue;
      const at = E.resolvePagesFrozen(editor.view, card.token);
      if (at && !at.intact) this.stale(card);
    }
  },
  stale(card: Card) {
    card.state = "stale"; card.el.dataset.state = "stale";
    const body = card.el.querySelector("[data-body]")!;
    const redo = el("button", { class: "mw-btn mw-btn--ghost", type: "button", text: "按现在的内容重新准备" });
    redo.addEventListener("click", () => actions.reprepare(card));
    body.replaceChildren(el("p", { class: "cx-text", text: "你在原处改过这段内容；这张卡是按改之前的内容准备的，不会再执行。" }), el("div", { class: "cx-actions-row" }, redo));
    setState(card, "已失效");
  },
};

function setState(card: Card, label: string) { (card.el.querySelector(".cx-card-state") as HTMLElement).textContent = label; }

function cardShell(card: Omit<Card, "el">): HTMLElement {
  const quoteText = card.frozen.focus.targets.map(target => target.ref?.title ?? target.text).join(" ｜ ").slice(0, 90);
  const quote = el("blockquote", { class: "cx-quote", title: "回到原处", text: quoteText + (quoteText.length >= 90 ? "…" : "") });
  quote.addEventListener("click", () => {
    const node = card.token ? editor?.view.dom.querySelector(`[data-focus-token="${card.token}"]`) : null;
    if (node) { node.scrollIntoView({ block: "center" }); return; }
    if (card.frozen.focus.object.id !== current?.id) void openDoc(card.frozen.focus.object.id, card.frozen.focus.targets[0]?.text);
  });
  const close = el("button", { class: "mw-btn mw-btn--ghost mw-btn--icon-only", type: "button", "aria-label": "关闭这张卡", text: "×" });
  const node = el("article", { class: "cx-card", "data-state": "preparing" },
    el("header", {}, el("strong", { text: card.title }), el("small", { text: card.provider }), el("span", { class: "cx-card-state", text: "准备中…" }), close),
    quote, el("div", { "data-body": "" }, el("p", { class: "cx-text", text: "正在准备…" })));
  close.addEventListener("click", () => actions.close(card.id));
  return node;
}

// ---- actions: choose → prepare → preview → apply/execute → result --------------------------------------------------
const actions = {
  choose(key: string, source: string) {
    const focus = bus.current;
    if (!focus) return;
    const candidate = bar.plan?.candidates.find(item => item.key === key);
    if (!candidate) return;
    // Freeze what was in hand at the moment of the click; everything after acts on this.
    const token = focus.granularity === "objects" || !editor ? null : uid("cx");
    if (token && editor) E.freezePagesFocus(editor.view, token, focus.targets.length === 1 && focus.targets[0]!.anchor !== undefined ? { from: focus.targets[0]!.anchor!, to: focus.targets[0]!.head! } : undefined);
    const frozen: FrozenFocus = { focus, token: token ?? uid("frozen"), frozen_at: new Date().toISOString() };
    const base = { id: uid("card"), key, title: candidate.title, provider: candidate.provider_title, frozen, token, request_id: uid("req"), state: "preparing", source, applied: null };
    const card: Card = { ...base, el: cardShell(base) };
    cards.add(card);
    panel.open();
    bus.recent.unshift(candidate.title);
    if (source === "suggestion") cards.dropSuggestion();
    void this.prepare(card);
  },
  async prepare(card: Card, instruction?: string) {
    try {
      card.prepared = await api<Prepared>("POST", "/api/contextual/prepare", { key: card.key, frozen: card.frozen, ...(instruction ? { instruction } : {}) });
      card.state = "ready"; card.el.dataset.state = "ready";
      this.renderPreview(card);
      if (card.prepared.apply === "result") signal("accepted", card.title, card.frozen.focus.context_id);
    } catch (error) {
      card.state = "error"; card.el.dataset.state = "error";
      card.el.querySelector("[data-body]")!.replaceChildren(el("p", { class: "cx-text cx-error", text: (error as Error).message }));
      setState(card, "没准备好");
    }
  },
  renderPreview(card: Card) {
    const preview = card.prepared!.preview;
    const body = card.el.querySelector("[data-body]")!;
    const parts: (Node | null)[] = [];
    const row = el("div", { class: "cx-actions-row" });
    const button = (label: string, primary: boolean, run: () => void) => { const node = el("button", { class: `mw-btn ${primary ? "mw-btn--primary" : "mw-btn--ghost"}`, type: "button", text: label }); node.addEventListener("click", run); row.append(node); return node; };
    setState(card, "预览");
    switch (preview.kind) {
      case "text": case "list": {
        const text = preview.text ?? (preview.items as string[] | undefined)?.map(item => `· ${item}`).join("\n") ?? "";
        parts.push(el("p", { class: "cx-text", text }));
        if (card.token) button("插入到这段后面", true, () => this.apply(card, text, "insert_after"));
        button("复制", false, () => { void navigator.clipboard?.writeText(text); });
        break;
      }
      case "compare": {
        const text = preview.text ?? "";
        parts.push(el("div", { class: "cx-compare" }, ...text.split(/\n+/).filter(Boolean).map(line => el("div", { text: line }))));
        if (card.token) button("把比较结果插到后面", false, () => this.apply(card, text, "insert_after"));
        break;
      }
      case "replace": case "insert_after": {
        const proposed = preview.text ?? "";
        const original = card.frozen.focus.targets.map(target => target.text).join("\n");
        const area = el("textarea", { class: "mw-input", rows: "5" }) as HTMLTextAreaElement; area.value = proposed; area.hidden = true;
        parts.push(el("div", { class: "cx-diff" }, preview.kind === "replace" ? el("del", { text: original.slice(0, 400) }) : null, el("ins", { text: proposed })), area);
        const mode = preview.kind === "replace" && card.frozen.focus.activity !== "comparing" ? "replace" : "insert_after";
        button(mode === "replace" ? "应用修改" : "插入到后面", true, () => { const text = area.hidden ? proposed : area.value; this.apply(card, text, mode, text !== proposed); });
        button("改一改", false, () => { area.hidden = !area.hidden; if (!area.hidden) area.focus(); });
        button("不用", false, () => this.close(card.id));
        break;
      }
      case "evidence": {
        const hits = preview.hits ?? [];
        parts.push(hits.length ? el("ul", { class: "cx-hits" }, ...hits.map(hit => {
          const open = el("button", { type: "button" }, el("span", { text: hit.excerpt }), el("small", { text: `${hit.title} · 相关度 ${hit.score}` }));
          open.addEventListener("click", () => { void openDoc(hit.doc_id, hit.excerpt); });
          return el("li", {}, open);
        })) : el("p", { class: "cx-text", text: "项目资料里没有找到直接相关的内容。" }));
        break;
      }
      case "dependencies": {
        const items = (preview.items ?? []) as { step: string; depends_on: string; why: string }[];
        parts.push(el("div", { class: "cx-compare" }, ...items.map(item => el("div", { text: `「${item.step.slice(0, 24)}」依赖「${item.depends_on.slice(0, 24)}」\n${item.why}` }))));
        break;
      }
      case "record": {
        const inputs = (preview.fields ?? []).map(field => {
          const input = field.multiline ? el("textarea", { class: "mw-input", rows: "3", name: field.name }) as HTMLTextAreaElement : el("input", { class: "mw-input", type: "text", name: field.name }) as HTMLInputElement;
          input.value = field.value;
          return el("label", { class: "cx-field" }, el("span", { text: field.label }), input);
        });
        parts.push(el("p", { class: "cx-text", text: preview.summary ?? "" }), ...inputs);
        const run = button("确认执行", true, () => { void this.execute(card, run as HTMLButtonElement); });
        button("取消", false, () => this.close(card.id));
        setState(card, "等你确认");
        break;
      }
      case "handoff": {
        parts.push(el("p", { class: "cx-text", text: preview.text ?? "" }));
        button("在输入框里说说", true, () => { const input = $<HTMLTextAreaElement>("[data-assistant-input]"); if (input) { input.placeholder = "针对这段内容，你想怎么讨论？"; input.focus(); } });
        break;
      }
    }
    if (preview.standin) parts.push(el("p", { class: "cx-standin", text: preview.standin }));
    body.replaceChildren(...parts.filter(Boolean) as Node[], row);
  },
  apply(card: Card, text: string, mode: "replace" | "insert_after", edited = false) {
    if (!editor || !card.token) return;
    const at = E.resolvePagesFrozen(editor.view, card.token);
    const original = at?.text ?? "";
    const out = E.applyToPagesFrozen(editor.view, card.token, text, mode);
    if (!out.ok) { cards.stale(card); return; }
    card.state = "done"; card.el.dataset.state = "done";
    // Keep the applied range tracked (without highlight) so 撤销 undoes exactly this change, and only while it is untouched.
    const undoToken = uid("undo");
    if (out.to > out.from) E.freezePagesFocus(editor.view, undoToken, { from: out.from, to: out.to }, true);
    card.applied = { token: undoToken, original };
    card.token = null;
    signal(edited ? "rewritten" : "accepted", card.title, card.frozen.focus.context_id);
    const undo = el("button", { class: "mw-btn mw-btn--ghost", type: "button", text: "撤销" });
    undo.addEventListener("click", () => this.undo(card, mode));
    card.el.querySelector("[data-body]")!.replaceChildren(el("p", { class: "cx-text", text: mode === "replace" ? "已改在原处。" : "已插入到原段落后面。" }), el("div", { class: "cx-actions-row" }, undo));
    setState(card, "已应用");
  },
  undo(card: Card, mode: "replace" | "insert_after") {
    if (!editor || !card.applied) return;
    const out = mode === "replace" ? E.applyToPagesFrozen(editor.view, card.applied.token, card.applied.original, "replace") : E.applyToPagesFrozen(editor.view, card.applied.token, "", "delete");
    card.el.querySelector("[data-body]")!.replaceChildren(el("p", { class: "cx-text", text: out.ok ? "已撤销。" : "原处已被改动，没有撤销；可以用编辑器的撤销（⌘Z）。" }));
    if (out.ok) signal("undone", card.title, card.frozen.focus.context_id);
    setState(card, out.ok ? "已撤销" : "未撤销");
    card.applied = null;
  },
  async execute(card: Card, button: HTMLButtonElement) {
    if (card.state === "executing") return;
    // The card was prepared from the frozen text; if that text changed, it must not run on the new text silently.
    if (card.token && editor) {
      const at = E.resolvePagesFrozen(editor.view, card.token);
      if (at && !at.intact) { cards.stale(card); return; }
    }
    card.state = "executing"; button.disabled = true; setState(card, "执行中…");
    const fields = Object.fromEntries([...card.el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[name]")].map(input => [input.name, input.value]));
    try {
      const out = await api<{ summary: string; detail?: string[]; open?: { doc_id: string }; standin?: string; replayed?: boolean }>("POST", "/api/contextual/execute", { request_id: card.request_id, key: card.key, fields, frozen: card.frozen });
      card.state = "done"; card.el.dataset.state = "done";
      const row = el("div", { class: "cx-actions-row" });
      if (out.open) { const open = el("button", { class: "mw-btn mw-btn--primary", type: "button", text: "打开" }); open.addEventListener("click", () => { void refreshDocs().then(() => openDoc(out.open!.doc_id)); }); row.append(open); }
      card.el.querySelector("[data-body]")!.replaceChildren(el("p", { class: "cx-text", text: out.summary + (out.replayed ? "（重复提交，返回的是第一次的结果）" : "") }),
        ...(out.detail ?? []).map(line => el("p", { class: "cx-text", text: `· ${line}` })), out.standin ? el("p", { class: "cx-standin", text: out.standin }) : null, row);
      setState(card, "已完成");
      signal("accepted", card.title, card.frozen.focus.context_id);
      if (out.open) void refreshDocs();
    } catch (error) {
      card.state = (error as { code?: string }).code === "stale" ? "stale" : "ready"; button.disabled = false;
      if ((error as { code?: string }).code === "stale") cards.stale(card);
      else { setState(card, "执行失败"); card.el.querySelector("[data-body]")!.append(el("p", { class: "cx-text cx-error", text: (error as Error).message })); }
    }
  },
  reprepare(card: Card) {
    if (!editor || !card.token) return;
    const at = E.resolvePagesFrozen(editor.view, card.token);
    if (!at) return;
    const token = uid("cx");
    E.releasePagesFrozen(editor.view, card.token);
    E.freezePagesFocus(editor.view, token, { from: at.from, to: at.to });
    card.token = token;
    const focus = { ...card.frozen.focus, object: { ...card.frozen.focus.object, version: current?.version ?? card.frozen.focus.object.version }, targets: [{ ...card.frozen.focus.targets[0]!, text: at.text, anchor: at.from, head: at.to }] };
    card.frozen = { focus, token, frozen_at: new Date().toISOString() };
    card.el.dataset.state = "preparing"; setState(card, "准备中…");
    card.el.querySelector("[data-body]")!.replaceChildren(el("p", { class: "cx-text", text: "正在按现在的内容重新准备…" }));
    void this.prepare(card);
  },
  close(id: string) {
    const card = cards.list.find(item => item.id === id);
    if (!card) return;
    if (editor && card.token) E.releasePagesFrozen(editor.view, card.token);
    if (editor && card.applied) E.releasePagesFrozen(editor.view, card.applied.token);
    if (card.state === "ready") { bus.dismiss(card.key); signal("ignored", card.title, card.frozen.focus.context_id); }
    card.el.remove();
    cards.list = cards.list.filter(item => item.id !== id);
  },
};

async function refreshDocs() {
  docs = (await api<{ documents: DocMeta[] }>("GET", "/api/docs")).documents;
  renderDocList();
}

// ---- natural language input -----------------------------------------------------------------------------------
function wireInput() {
  const form = $<HTMLFormElement>("[data-assistant-composer]");
  const input = $<HTMLTextAreaElement>("[data-assistant-input]");
  if (!form || !input) return;
  const send = form.querySelector<HTMLButtonElement>("[data-assistant-send]");
  input.addEventListener("input", () => { if (send) send.disabled = !input.value.trim(); });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = ""; if (send) send.disabled = true;
    panel.open();
    cards.host.append(el("p", { class: "cx-you", text }));
    const last = [...cards.list].reverse().find(card => card.state === "ready" && card.prepared && ["replace", "insert_after", "text", "compare"].includes(card.prepared.preview.kind));
    if (last) {
      last.el.dataset.state = "preparing"; setState(last, "按你的话调整…");
      void actions.prepare(last, text);
      return;
    }
    const focus = bus.current;
    cards.host.append(el("article", { class: "cx-card" }, el("header", {}, el("strong", { text: "助理" })),
      focus ? el("blockquote", { class: "cx-quote", text: focus.targets.map(target => target.text).join(" ｜ ").slice(0, 90) }) : null,
      el("p", { class: "cx-text", text: focus ? "会带上你选中的这段内容和它所在的位置一起处理这句话。" : "当前没有选中的内容，会按整个项目理解这句话。" }),
      el("p", { class: "cx-standin", text: "切片替身：这里不接真实助理；真实接入后这句话会开一项带着当前情境的助理工作。" })));
  });
}

// ---- debug drawer -----------------------------------------------------------------------------------------------
async function renderDev() {
  const root = $("[data-cx-dev]")!;
  if (root.hidden) return;
  const state = await api<{ judge: string; latency: number; fail: boolean; memory: boolean; disabled: string[]; receipts: Record<string, unknown>[]; signals: Record<string, string>[]; providers: { provider_id: string; title: string }[] }>("GET", "/api/dev");
  const radio = (value: string, label: string) => { const input = el("input", { type: "radio", name: "cx-judge", value }) as HTMLInputElement; input.checked = state.judge === value; input.addEventListener("change", () => void post({ judge: value })); return el("label", {}, input, ` ${label}`); };
  const post = async (value: Record<string, unknown>) => { await api("POST", "/api/dev", value); const focus = bus.current; bus.set(null); bus.set(focus); await renderDev(); };
  const latency = el("input", { type: "range", min: "0", max: "5000", step: "100", value: String(state.latency) }) as HTMLInputElement;
  latency.addEventListener("change", () => void post({ latency: Number(latency.value) }));
  const toggle = (label: string, checked: boolean, run: (value: boolean) => void) => { const input = el("input", { type: "checkbox" }) as HTMLInputElement; input.checked = checked; input.addEventListener("change", () => run(input.checked)); return el("label", {}, input, ` ${label}`); };
  root.replaceChildren(
    el("fieldset", {}, el("legend", { text: "判断来源" }), radio("jev", "真实 Jev（经 Prologue，读取你 Home 里的 Key）"), radio("replay", "回放（优先录制的真实 Jev，其次人工样本）"), radio("rules", "只用规则（等同判断不可用）")),
    el("fieldset", {}, el("legend", { text: `判断延迟：${state.latency}ms` }), latency, toggle("注入判断失败", state.fail, value => void post({ fail: value })), toggle("使用记忆（替身）", state.memory, value => void post({ memory: value }))),
    el("fieldset", {}, el("legend", { text: "停用插件（撤权）" }), ...state.providers.filter(item => item.provider_id !== "io.molis.work.pages").map(item => toggle(item.title, state.disabled.includes(item.provider_id), value => {
      const next = new Set(state.disabled); if (value) next.add(item.provider_id); else next.delete(item.provider_id); void post({ disabled: [...next] });
    }))),
    el("fieldset", {}, el("legend", { text: `当前情境 · 丢弃过期判断 ${bus.dropped} 次` }), el("code", { text: bus.current?.context_id ?? "（无）" })),
    el("fieldset", {}, el("legend", { text: "判断回执（最近）" }), el("ol", {}, ...state.receipts.slice(0, 8).map(item => el("li", { text: `${String(item.basis)}${item.latency_ms ? ` ${Math.round(Number(item.latency_ms))}ms` : ""}${item.fallback ? ` · 回退：${String(item.fallback)}` : ""} · 候选 ${String(item.candidate_count)} · 摘要 ${String(item.state_digest ?? "—")}${(item.screened as string[])?.length ? ` · ${(item.screened as string[]).join("；")}` : ""}` })))),
    el("fieldset", {}, el("legend", { text: "界面信号（交给记忆，替身）" }), el("ol", {}, ...state.signals.slice(0, 8).map(item => el("li", { text: `${item.signal} · ${item.label}` })))),
  );
}
function wireDev() {
  const toggle = $<HTMLButtonElement>("[data-cx-dev-toggle]")!;
  const root = $("[data-cx-dev]")!;
  toggle.addEventListener("click", () => { root.hidden = !root.hidden; toggle.setAttribute("aria-expanded", String(!root.hidden)); void renderDev(); });
  setInterval(() => { void renderDev(); }, 1500);
}

// ---- start ------------------------------------------------------------------------------------------------------
async function start() {
  bar.mount();
  wireInput();
  wireDev();
  await refreshDocs();
  for (const doc of docs) { const full = await api<Doc>("GET", `/api/docs/${doc.id}`); objectTexts.set(doc.id, plain(full.body)); }
  await openDoc(docs[0]!.id);
  (window as unknown as Record<string, unknown>).__cx = { bus, bar, cards, actions, editor: () => editor, openDoc };
}
void start();
