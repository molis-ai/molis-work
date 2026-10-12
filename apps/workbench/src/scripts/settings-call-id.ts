/**
 * Copies a 诊断编号 on a settings page of its own (one opened with no project yet). Mounted in the workbench's settings the page's scripts do not
 * run; there the workbench's own `[data-copy-value]` handler copies the same button, so this is inline in the page and not in `/assets/`.
 */
export const CALL_ID_COPY_CLIENT_SCRIPT = `
;(() => {
  const toast = document.querySelector("[data-settings-toast]");
  let timer = 0;
  const say = (text) => {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add("is-visible");
    clearTimeout(timer);
    timer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
  };
  document.addEventListener("click", async (event) => {
    const button = event.target.closest?.("[data-molis-call-id]");
    if (!button) return;
    try {
      await navigator.clipboard.writeText(button.dataset.molisCallId);
      say(L("诊断编号已复制"));
    } catch {
      say(L("无法访问剪贴板，请手动复制"));
    }
  });
})();
`;
