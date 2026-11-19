// What every settings page carries for 「能力包」: fetch its program once, when a page shows it (now, or when the settings cover places it).
declare global {
  var molisWorkLoadKit: () => Promise<void>;
}
let loading: Promise<void> | undefined;
globalThis.molisWorkLoadKit = () => loading ??= new Promise<void>((resolve, reject) => {
  const script = document.createElement("script");
  script.src = "/assets/molis-work-kit.js";
  script.dataset.kitClient = "";
  script.onload = () => resolve();
  script.onerror = () => { loading = undefined; script.remove(); reject(new Error(globalThis.t.text("workbench.settings-directory.try-again-moment"))); };
  document.head.append(script);
});
const load = () => {
  const root = document.querySelector<HTMLElement>("[data-kit-settings]"), notice = root?.querySelector<HTMLElement>("[data-kit-notice]");
  if (!root) return;
  if (notice) notice.hidden = true;
  void globalThis.molisWorkLoadKit().catch(error => {
    if (!root.isConnected || !notice) return;
    notice.hidden = false;
    globalThis.molisWorkRequest.show(notice, error);
    const retry = document.createElement("button");
    retry.type = "button"; retry.className = "mw-btn mw-btn--secondary"; retry.textContent = globalThis.t.text("common.control.retry");
    retry.addEventListener("click", () => { retry.disabled = true; load(); });
    notice.append(retry);
  });
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
else load();
export {};
