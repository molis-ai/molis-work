/** Explicit file adoption stays in the App; the shared import action still accepts only current, classified packages. */
export const MEMORY_IMPORT_CLIENT_SCRIPT = String.raw`
({ L, el, button, ask, run }, slot, submit, { kinds, classes, sources, appliesText, expiryText, targetTitle }) => {
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const scenes = ["coding", "assistant", "common"], lifecycles = ["long-term", "short-term", "session"];
  const bad = () => { throw new Error(L("记忆包的格式或已有分类不合格，没有导入任何条目。")); };
  const checkClass = value => {
    if (!object(value) || Object.keys(value).some(key => !["scenes", "lifecycle", "extra"].includes(key))
      || !Array.isArray(value.scenes) || !value.scenes.length || value.scenes.length > 3 || new Set(value.scenes).size !== value.scenes.length
      || value.scenes.some(scene => !scenes.includes(scene)) || !lifecycles.includes(value.lifecycle)) bad();
    if (value.extra !== undefined && (!object(value.extra) || Object.values(value.extra).some(values => !Array.isArray(values)
      || !values.length || values.some(value => typeof value !== "string" || !value.trim())))) bad();
  };
  const inspect = pack => {
    if (!object(pack) || pack.format !== "molis.memory" || ![1, 2].includes(pack.version)
      || !Array.isArray(pack.entries) || pack.entries.length > 2000) bad();
    for (const item of pack.entries) {
      if (!object(item) || typeof item.text !== "string" || !item.text.trim() || item.text.length > 400 || typeof item.origin !== "string"
        || (item.applies !== undefined && !object(item.applies)) || (item.expires_at != null && (typeof item.expires_at !== "string" || !Number.isFinite(Date.parse(item.expires_at))))) bad();
      if (item.basis != null && !["explicit", "repeated", "inferred"].includes(item.basis)) bad();
      if (item.classification != null) checkClass(item.classification);
      if (item.namespace !== undefined && (typeof item.namespace !== "string" || !item.namespace.trim())) bad();
      const session = item.session_ref;
      if (session !== undefined && (!object(session) || session.kind !== "session" || typeof session.id !== "string" || !session.id.trim()
        || !Number.isSafeInteger(session.revision) || session.revision < 1)) bad();
      if ((pack.version === 1 || item.classification == null) && (session || item.classification?.lifecycle === "session"))
        throw new Error(L("这个文件有需要采用的会话记忆，请通过可信会话管理入口处理；没有导入任何条目。"));
    }
    return pack.version === 1 || pack.entries.some(item => item.classification == null);
  };
  const field = (title, values, selected = "") => {
    const select = el("select", "mw-select"); select.setAttribute("aria-label", L(title));
    for (const [value, text] of values) { const option = el("option", "", L(text)); option.value = value; select.append(option); }
    select.value = selected; return select;
  };
  const edit = (item, index) => {
    const row = el("li", "memory-row"), copy = el("div", "memory-editor"); row.dataset.memoryImportEntry = String(index);
    copy.append(el("strong", "memory-text", item.text), el("p", "settings-muted", L("原出处") + "：" + item.origin),
      el("p", "settings-muted", L("来源") + "：" + L(Object.hasOwn(sources, item.source) ? sources[item.source] : "来源未知") + " · " + L("原依据") + "："
        + L(({ explicit: "明确表达", repeated: "独立重复", inferred: "推断" })[item.basis] || "原依据未知")),
      el("p", "settings-muted", L("适用情境") + "：" + appliesText(item.applies)),
      el("p", "settings-muted", L("原期限") + "：" + expiryText(item.expires_at)));
    if (item.namespace) copy.append(el("p", "settings-muted", L("插件") + "：" + item.namespace));
    const choices = el("div", "memory-editor-fields"), selected = [];
    choices.setAttribute("role", "group"); choices.setAttribute("aria-label", L("适用场景"));
    for (const scene of scenes) {
      const label = el("label", "settings-check"), input = el("input"); input.type = "checkbox"; input.value = scene; input.dataset.memoryImportScene = "";
      label.append(input, document.createTextNode(" " + L(classes[scene]))); choices.append(label); selected.push(input);
    }
    const kind = field("类别", [["", "请选择类别"], ...Object.entries(kinds)], Object.hasOwn(kinds, item.kind) ? item.kind : "");
    const lifecycle = field("保留时间", [["", "请选择保留类型"], ["long-term", "长期"], ["short-term", "短期"]]);
    const expiry = field("期限决定", [["keep", "保留原期限"], ["set", "设置截止时间"], ["remove", "移除固定期限"]], "keep");
    const date = el("input", "mw-input"); date.type = "datetime-local"; date.step = "1"; date.hidden = date.disabled = true;
    date.setAttribute("aria-label", L("截止时间（本地时间）"));
    expiry.addEventListener("change", () => { date.hidden = date.disabled = expiry.value !== "set"; });
    const fields = el("div", "memory-editor-fields"); fields.append(kind, lifecycle, expiry, date);
    copy.append(choices, fields); row.append(copy);
    return { row, read: () => {
      const chosen = selected.filter(input => input.checked).map(input => input.value);
      if (!Object.hasOwn(kinds, kind.value)) throw new Error(L("请选择类别"));
      if (!chosen.length) throw new Error(L("至少选择一个适用场景"));
      if (!lifecycle.value) throw new Error(L("请选择保留类型"));
      const instant = expiry.value === "set" ? Date.parse(date.value) : null;
      if (expiry.value === "set" && (!Number.isFinite(instant) || instant <= Date.now())) throw new Error(L("截止时间必须晚于现在"));
      const expires = expiry.value === "set" ? new Date(instant).toISOString() : expiry.value === "remove" ? null : item.expires_at ?? null;
      const expired = item.expires_at != null && Date.parse(item.expires_at) <= Date.now();
      if (expired && expiry.value !== "set") throw new Error(L("这条原记忆已到期，请明确设置未来截止时间后重新导入。"));
      if (lifecycle.value === "short-term" && (!expires || Date.parse(expires) <= Date.now())) throw new Error(L("短期记忆需要未来的截止时间"));
      return { entry: { ...item, kind: kind.value, basis: item.basis ?? null, expires_at: expires,
        classification: { ...item.classification, scenes: chosen, lifecycle: lifecycle.value } }, expired };
    } };
  };
  return async pack => {
    slot.replaceChildren(); slot.hidden = true;
    if (!inspect(pack)) return submit(pack);
    const original = structuredClone(pack), form = el("form", "memory-editor"), list = el("ol", "memory-list");
    const title = el("h3", "", L("决定旧记忆的用途")); title.tabIndex = -1;
    const scopes = { personal: "个人记忆", project: "项目记忆", character: "角色记忆" }, scopeName = Object.hasOwn(scopes, original.scope) ? scopes[original.scope] : null;
    form.append(title, el("p", "settings-muted", L("文件原范围") + "：" + (scopeName ? L(scopeName) : L("范围未知")) + " → " + targetTitle),
      el("p", "settings-muted", L("逐条选择场景和保留时间。原依据未知时仍保持未知；改为长期不会自动移除期限。")));
    const editors = new Map();
    original.entries.forEach((item, index) => {
      if (item.classification != null) return;
      const editor = edit(item, index); editors.set(index, editor); list.append(editor.row);
    });
    form.append(el("p", "settings-muted", L("需要决定") + " " + editors.size + " / " + original.entries.length + " · " + L("其余条目保留文件中的分类与期限。")), list);
    const actions = el("div", "memory-editor-actions"), confirm = button(L("确认采用并导入"), "mw-btn--primary"), cancel = button(L("取消"));
    confirm.type = "submit"; cancel.dataset.memoryImportCancel = ""; actions.append(confirm, cancel); form.append(actions);
    const close = () => { slot.replaceChildren(); slot.hidden = true; };
    cancel.addEventListener("click", close);
    form.addEventListener("submit", event => {
      event.preventDefault();
      run(async () => {
        let renewals = 0;
        const entries = original.entries.map((item, index) => {
          const editor = editors.get(index); if (!editor) return { ...item, basis: item.basis ?? null };
          let chosen;
          try { chosen = editor.read(); } catch (failure) { editor.row.scrollIntoView({ block: "center" }); throw failure; }
          if (chosen.expired) renewals++;
          return chosen.entry;
        });
        const ready = { ...original, version: 2, entries };
        const message = targetTitle + " · " + entries.length + " " + L("条") + "。" + L("已选择的分类与期限只用于这次导入；原文件保持不变。")
          + (renewals ? " " + L("已到期内容将按新期限重新导入，不是对原记忆续期。") + " " + renewals + " " + L("条") : "");
        form.inert = true;
        try {
          if (!await ask(L("确认采用并导入"), message, L(renewals ? "按新期限重新导入" : "确认采用并导入"))) return;
          close(); await submit(ready);
        } finally { form.inert = false; }
      });
    });
    slot.append(form); slot.hidden = false; title.focus();
  };
}`;
