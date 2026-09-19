/** Project-scoped UI preferences. Domain data and Runtime state are never written. */
export const HOME_SHORTCUTS_FACTORY_SCRIPT = `({ root, translate: L, projectKey }) => {
  if (!root) return;
  const key = "molis-work:home-shortcuts:" + projectKey;
  const list = root.querySelector("[data-home-shortcuts]");
  const add = root.querySelector("[data-home-shortcut-add]");
  const template = root.querySelector("[data-home-shortcut-template]");
  const dialog = root.querySelector("[data-home-shortcut-dialog]");
  const form = root.querySelector("[data-home-shortcut-form]");
  const error = root.querySelector("[data-home-shortcut-form-error]");
  const status = root.querySelector("[data-home-shortcut-error]");
  const remove = root.querySelector("[data-home-shortcut-remove]");
  let items = [], editingId = null, returnFocus = null;
  const validUrl = value => {
    if (typeof value !== "string" || !value.trim() || value.length > 4096) return null;
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) && url.hostname && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  };
  const report = message => { status.textContent = L(message); status.hidden = !message; };
  const load = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "[]");
      if (!Array.isArray(stored)) throw new Error("Invalid shortcuts");
      const ids = new Set();
      items = stored.filter(item => {
        if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.name !== "string" || !item.name.trim() || item.name.length > 32 || !validUrl(item.url)) return false;
        ids.add(item.id); return true;
      }).map(item => ({ id: item.id, name: item.name, url: item.url }));
      report("");
    } catch { report("无法读取快捷方式，请检查浏览器存储权限后刷新。"); }
  };
  const render = () => {
    list.querySelectorAll("[data-shortcut-id]").forEach(row => row.remove());
    for (const item of items) {
      const row = template.content.firstElementChild.cloneNode(true);
      row.dataset.shortcutId = item.id;
      const link = row.querySelector("[data-home-shortcut-link]");
      link.href = item.url; link.setAttribute("aria-label", L("打开快捷方式：{name}").replace("{name}", item.name));
      row.querySelector("[data-home-shortcut-name]").textContent = item.name;
      const edit = row.querySelector("[data-home-shortcut-edit]");
      edit.setAttribute("aria-label", L("编辑快捷方式：{name}").replace("{name}", item.name));
      edit.addEventListener("click", () => openEditor(item.id));
      list.insertBefore(row, add.closest("li"));
    }
  };
  const closeEditor = () => { dialog.close(); };
  const openEditor = id => {
    const current = id ? items.find(item => item.id === id) : null;
    if (id && !current) return;
    editingId = id; returnFocus = document.activeElement;
    form.reset(); error.textContent = "";
    root.querySelector("#home-shortcut-title").textContent = L(id ? "编辑快捷方式" : "添加快捷方式");
    form.elements.shortcut_name.value = current?.name || "";
    form.elements.shortcut_url.value = current?.url || "";
    remove.hidden = !id;
    dialog.showModal(); form.elements.shortcut_name.focus();
  };
  const persist = next => {
    try { localStorage.setItem(key, JSON.stringify(next)); }
    catch { error.textContent = L("未能保存快捷方式，内容仍保留在这里。请检查存储权限后重试。"); return false; }
    items = next; render(); report(""); closeEditor(); return true;
  };
  form.addEventListener("submit", event => {
    event.preventDefault();
    const name = form.elements.shortcut_name.value.trim(), url = validUrl(form.elements.shortcut_url.value.trim());
    if (!name || name.length > 32) { error.textContent = L("请填写 1–32 字的名称。"); form.elements.shortcut_name.focus(); return; }
    if (!url) { error.textContent = L("请输入有效的 http 或 https 网址，且不要包含账号或密码。"); form.elements.shortcut_url.focus(); return; }
    if (editingId && !items.some(item => item.id === editingId)) { error.textContent = L("这个快捷方式已被移除，请取消后重新添加。"); return; }
    const item = { id: editingId || crypto.randomUUID(), name, url };
    persist(editingId ? items.map(previous => previous.id === editingId ? item : previous) : [...items, item]);
  });
  remove.addEventListener("click", () => persist(items.filter(item => item.id !== editingId)));
  add.addEventListener("click", () => openEditor(null));
  root.querySelectorAll("[data-home-shortcut-cancel]").forEach(button => button.addEventListener("click", closeEditor));
  dialog.addEventListener("click", event => { if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeEditor();
  } });
  dialog.addEventListener("close", () => {
    const trigger = returnFocus?.isConnected ? returnFocus : add;
    trigger?.focus();
  });
  window.addEventListener("storage", event => { if (event.key === key || event.key === null) { load(); render(); } });
  document.addEventListener("click", async event => {
    const link = event.target.closest("a[data-home-external]");
    if (!link || !globalThis.molisWorkOpenExternalUrl) return;
    event.preventDefault();
    try { await globalThis.molisWorkOpenExternalUrl(link.href); report(""); }
    catch { report("无法打开链接，请检查系统浏览器后重试。"); }
  });
  load(); render();
}`;
