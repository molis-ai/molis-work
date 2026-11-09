/** Delegation survives the connection panel's partial refresh after adding an account. */
export const FUNCTIONS_SETTINGS_CLIENT_SCRIPT = `(() => {
  const t = (value) => (typeof L === "function" ? globalThis.t.text(value) : value);
  const post = body => molisWorkRequest("/api/functions/settings", {body, fallback: t("workbench.settings-client.could-not-save")});
  const save = async (root, clear) => {
    const field = root.querySelector("[data-functions-connection]");
    const status = root.querySelector("[data-functions-settings-status]");
    const buttons = root.querySelectorAll("[data-functions-key-save], [data-functions-key-clear]");
    buttons.forEach(btnEl => { btnEl.disabled = true; });
    try {
      const payload = await post(clear ? { clear: true } : { connection_id: field.value });
      if (!root.isConnected) return;
      if (clear) {
        field.value = "";
        field.dispatchEvent(new Event("change", { bubbles: true }));
      }
      status.dataset.source = payload.source;
      status.textContent = payload.source === "env" ? t("workbench.settings-client.typesafe-api-key")
        : payload.has_credential ? t("workbench.settings-client.judgment-service-configured") : t("workbench.settings-client.no-account-connection-selected-yet");
      root.querySelector("[data-functions-key-clear]").hidden = !field.value;
    } catch (error) {
      molisWorkRequest.show(status, error, t("workbench.settings-client.could-not-save"));
    } finally { buttons.forEach(btnEl => { btnEl.disabled = false; }); }
  };
  document.addEventListener("submit", (event) => {
    if (!event.target.matches("[data-functions-settings-form]")) return;
    event.preventDefault();
    void save(event.target.closest("[data-functions-settings]"), false);
  });
  document.addEventListener("click", (event) => {
    const btnEl = event.target.closest("[data-functions-key-clear]");
    if (!btnEl) return;
    void save(btnEl.closest("[data-functions-settings]"), true);
  });
})();
`;
