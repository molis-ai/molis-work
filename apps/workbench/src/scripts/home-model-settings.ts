import { MODEL_SETTINGS_CLIENT_SCRIPT } from "./settings-models.js";

/** The project-free Home shell hosts the existing settings document without unloading plugin drafts. */
export const HOME_MODEL_SETTINGS_CLIENT_SCRIPT = `(() => {
  const L = globalThis.L || (text => text);
  ${MODEL_SETTINGS_CLIENT_SCRIPT}
  const dialog = document.querySelector('[data-home-model-settings]');
  const content = dialog.querySelector('[data-home-model-content]');
  const status = dialog.querySelector('[data-home-model-status]');
  const retry = dialog.querySelector('[data-home-model-retry]');
  let loading = false, loaded = false, backdrop = false;
  const load = async () => {
    if (loading || loaded) return;
    loading = true; retry.hidden = true; status.hidden = false;
    status.textContent = L('正在加载模型设置…'); content.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch('/settings/models?embed=1');
      if (!response.ok) throw new Error(L('无法读取模型设置'));
      const page = new DOMParser().parseFromString(await response.text(), 'text/html');
      const document = page.querySelector('[data-model-settings]');
      if (!document) throw new Error(L('模型设置页面不完整'));
      content.replaceChildren(document); globalThis.molisWorkBindModelSettings(content);
      loaded = true; status.hidden = true;
    } catch { status.textContent = L('模型设置加载失败，问题草稿仍保留。请重试。'); retry.hidden = false; }
    finally { loading = false; content.removeAttribute('aria-busy'); }
  };
  // Keep the settings document mounted on close, including any unsaved settings input.
  dialog.querySelector('[data-home-model-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('pointerdown', event => { backdrop = event.target === dialog; });
  dialog.addEventListener('click', event => { if (backdrop && event.target === dialog) dialog.close(); });
  retry.addEventListener('click', () => void load());
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const url = new URL(link.href, location.origin);
    if (url.origin !== location.origin || url.pathname !== '/settings/models') return;
    event.preventDefault(); dialog.showModal(); void load();
  });
})();`;
