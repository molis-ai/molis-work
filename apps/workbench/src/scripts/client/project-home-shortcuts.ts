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
  const report = message => { status.textContent = globalThis.t.text(message); status.hidden = !message; };
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
    } catch { report("workbench.project-home-shortcuts.shortcuts-could-not-be-loaded-check-browser-storage"); }
  };
  const render = () => {
    list.querySelectorAll("[data-shortcut-id]").forEach(row => row.remove());
    for (const item of items) {
      const row = template.content.firstElementChild.cloneNode(true);
      row.dataset.shortcutId = item.id;
      const link = row.querySelector("[data-home-shortcut-link]");
      link.href = item.url; link.setAttribute("aria-label", globalThis.t.text("workbench.project-home-shortcuts.open-shortcut-name").replace("{name}", item.name));
      row.querySelector("[data-home-shortcut-name]").textContent = item.name;
      const edit = row.querySelector("[data-home-shortcut-edit]");
      edit.setAttribute("aria-label", globalThis.t.text("workbench.project-home-shortcuts.edit-shortcut-name").replace("{name}", item.name));
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
    root.querySelector("#home-shortcut-title").textContent = globalThis.t.text(id ? "workbench.project-home-shortcuts.edit-shortcut" : "workbench.project-home-shortcuts.add-shortcut");
    form.elements.shortcut_name.value = current?.name || "";
    form.elements.shortcut_url.value = current?.url || "";
    remove.hidden = !id;
    dialog.showModal(); form.elements.shortcut_name.focus();
  };
  const persist = next => {
    try { localStorage.setItem(key, JSON.stringify(next)); }
    catch { error.textContent = globalThis.t.text("workbench.project-home-shortcuts.shortcut-was-not-saved-edits-still-here-check"); return false; }
    items = next; render(); report(""); closeEditor(); return true;
  };
  form.addEventListener("submit", event => {
    event.preventDefault();
    const name = form.elements.shortcut_name.value.trim(), url = validUrl(form.elements.shortcut_url.value.trim());
    if (!name || name.length > 32) { error.textContent = globalThis.t.text("workbench.project-home-shortcuts.enter-name-between-1-32-characters"); form.elements.shortcut_name.focus(); return; }
    if (!url) { error.textContent = globalThis.t.text("workbench.project-home-shortcuts.enter-valid-http-https-url-without-username-password"); form.elements.shortcut_url.focus(); return; }
    if (editingId && !items.some(item => item.id === editingId)) { error.textContent = globalThis.t.text("workbench.project-home-shortcuts.shortcut-was-removed-cancel-add-again"); return; }
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
    catch { report("workbench.project-home-shortcuts.link-could-not-be-opened-check-system-browser"); }
  });
  load(); render();
}`;
