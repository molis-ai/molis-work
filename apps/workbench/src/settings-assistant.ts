/**
 * “助理”: what the Assistant may use (its own grants, separate from Coding's and external agents'), and what each
 * plugin contributes for it — with the exact gaps a plugin's developer can close.
 */
export function renderAssistantSettings({ L, projectId }: { L(text: string): string; projectId: string | null }): string {
  return `<section class="settings-document assistant-settings" aria-labelledby="settings-title" data-assistant-settings data-project="${projectId ? projectId.replace(/[^a-zA-Z0-9_.:-]/g, "") : ""}">
    <header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${L("助理")}</h1>
      <p>${L("助理能用哪些能力，以及每个插件为助理提供了什么。关掉的能力只对助理生效，不影响 Coding、外部 Agent 或你自己在页面里操作。")}</p></div></header>
    <p class="prompt-settings-notice" role="note">${L("读取类能力直接使用；修改类每次执行前都会请你确认准确参数；不可撤回的操作每次单独确认。")}</p>
    <div class="prompt-settings-tools">
      <div class="mw-toggle-group settings-segmented" role="group" aria-label="${L("范围")}" data-assistant-scope-group>
        <button class="mw-toggle" type="button" data-assistant-scope="project" aria-pressed="true">${L("当前项目")}</button>
        <button class="mw-toggle" type="button" data-assistant-scope="personal" aria-pressed="false">${L("个人")}</button>
      </div>
      <input class="mw-input prompt-settings-search" type="search" data-assistant-capability-search placeholder="${L("搜索能力或插件")}" aria-label="${L("搜索能力")}">
    </div>
    <div class="prompt-settings-body" data-assistant-capabilities aria-live="polite"><p class="settings-muted">${L("正在读取…")}</p></div>
    <details class="settings-section prompt-diagnostics" id="contributions" data-assistant-contributions>
      <summary><strong>${L("插件接入诊断")}</strong><span class="settings-muted">${L("每个插件为助理提供了什么：能否读回它的对象、改动能否关联回工作、能力是否写清用途；缺什么、为什么。")}</span></summary>
      <div data-assistant-contributions-body><p class="settings-muted">${L("正在读取…")}</p></div>
    </details>
  </section>`;
}

/** Runs on the settings page only when the section is on show. No template interpolation inside. */
export const ASSISTANT_SETTINGS_CLIENT_SCRIPT = String.raw`
(() => {
  const root = document.querySelector("[data-assistant-settings]");
  if (!root) return;
  const L = globalThis.L || ((text) => text);
  const project = root.dataset.project || "";
  const body = root.querySelector("[data-assistant-capabilities]");
  const search = root.querySelector("[data-assistant-capability-search]");
  let scope = project ? "project" : "personal", rows = [];
  if (!project) { const group = root.querySelector("[data-assistant-scope-group]"); if (group) group.hidden = true; }
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  // The Assistant's routes answer for the project whose path they are under; the Home's own, for personal work.
  const base = () => (scope === "project" && project ? "/projects/" + encodeURIComponent(project) : "") + "/api/assistant";
  const api = async (path, method, payload) => {
    const response = await fetch(base() + path, method === "POST" ? { method, headers: globalThis.molisWorkControlHeaders(), body: JSON.stringify(payload || {}) } : undefined);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || L("没有完成，请重试"));
    return data;
  };
  const EFFECT = { read: "读取", write: "修改", irreversible: "不可撤回" };
  function paint() {
    const query = String(search.value || "").trim().toLowerCase();
    const shown = rows.filter((row) => !query || [row.title, row.provider, row.description, row.capability_id].some((text) => String(text || "").toLowerCase().includes(query)));
    body.replaceChildren();
    if (!shown.length) { body.append(el("p", "settings-muted", rows.length ? L("没有匹配的能力") : L("这里还没有对助理开放的能力"))); return; }
    const groups = new Map();
    shown.forEach((row) => { if (!groups.has(row.provider)) groups.set(row.provider, []); groups.get(row.provider).push(row); });
    groups.forEach((items, provider) => {
      const section = el("section", "settings-section prompt-group");
      const off = items.filter((row) => !row.enabled).length;
      section.append(el("h2", "prompt-group-title", L(provider) + (off ? " · " + L("已关闭") + " " + off : "")));
      const list = el("ul", "prompt-list");
      items.forEach((row) => {
        const item = el("li", "prompt-row assistant-capability");
        const head = el("label", "prompt-row-head");
        const copy = el("div", "prompt-row-copy");
        copy.append(el("strong", "", L(row.title)), el("span", "settings-muted", L(row.description || "")));
        const meta = el("div", "prompt-row-meta");
        meta.append(el("span", "prompt-tag", L(EFFECT[row.effect] || row.effect)));
        const control = el("span", "mw-switch"), toggle = el("input"); toggle.type = "checkbox"; toggle.setAttribute("role", "switch"); toggle.checked = row.enabled;
        const track = el("span", "mw-switch__track"); track.setAttribute("aria-hidden", "true"); control.append(toggle, track);
        toggle.setAttribute("aria-label", (row.enabled ? L("关闭") : L("打开")) + "：" + row.title);
        toggle.addEventListener("change", async () => {
          toggle.disabled = true;
          try { await api("/capabilities", "POST", { capability_id: row.capability_id, version: row.version, provider_id: row.provider_id, enabled: toggle.checked }); row.enabled = toggle.checked; paint(); }
          catch (failure) { toggle.checked = row.enabled; toggle.disabled = false; alert(failure.message); }
        });
        head.append(copy, meta, control);
        item.append(head);
        list.append(item);
      });
      section.append(list);
      body.append(section);
    });
  }
  const load = async () => {
    body.replaceChildren(el("p", "settings-muted", L("正在读取…")));
    try { rows = (await api("/capabilities")).capabilities; paint(); }
    catch (failure) { body.replaceChildren(el("p", "settings-form-error", failure.message)); }
  };
  root.querySelectorAll("[data-assistant-scope]").forEach((button) => button.addEventListener("click", () => {
    scope = button.dataset.assistantScope;
    root.querySelectorAll("[data-assistant-scope]").forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
    contributions.dataset.loaded = ""; if (contributions.open) loadContributions();
    load();
  }));
  search.addEventListener("input", paint);
  const contributions = root.querySelector("[data-assistant-contributions]");
  const contributionsBody = root.querySelector("[data-assistant-contributions-body]");
  const AREA = { context: "对象上下文", results: "结果关联", capabilities: "能力说明" };
  const loadContributions = async () => {
    if (contributions.dataset.loaded) return;
    contributions.dataset.loaded = "1";
    try {
      const data = await api("/contributions");
      const list = el("ul", "prompt-diagnostics-list");
      data.contributions.forEach((item) => {
        const row = el("li", "prompt-diagnostics-owner");
        const facts = [L("能力") + " " + item.actions + "（" + L("读取") + " " + item.reads + " · " + L("修改") + " " + item.changes + "）",
          item.readable_kinds.length ? L("可读回对象") + "：" + item.readable_kinds.join("、") : L("不能读回对象"),
          item.changes ? L("改动可关联") + " " + item.linked_changes + "/" + item.changes : "", item.searchable ? L("参与搜索") : ""].filter(Boolean).join(" · ");
        row.append(el("strong", "", L(item.title)), el("span", "settings-muted", facts));
        if (item.gaps.length) {
          const gaps = el("ul", "prompt-diagnostics-issues");
          item.gaps.forEach((gap) => gaps.append(el("li", "prompt-diagnostics-issue prompt-diagnostics-issue--warning", L(AREA[gap.area] || gap.area) + "：" + gap.text)));
          row.append(gaps);
        }
        list.append(row);
      });
      contributionsBody.replaceChildren(data.contributions.length ? list : el("p", "settings-muted", L("这里还没有向助理开放能力的插件")));
    } catch (failure) { delete contributions.dataset.loaded; contributionsBody.replaceChildren(el("p", "settings-form-error", failure.message)); }
  };
  contributions.addEventListener("toggle", () => { if (contributions.open) loadContributions(); });
  if (location.hash === "#contributions") { contributions.open = true; loadContributions(); }
  load();
})();
`;
