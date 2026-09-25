/** Delegation survives the connection panel's partial refresh after adding an account. */
export const FUNCTIONS_SETTINGS_CLIENT_SCRIPT = `(() => {
  const t = (value) => (typeof L === "function" ? L(value) : value);
  const headers = () => typeof molisWorkControlHeaders === "function"
    ? molisWorkControlHeaders() : { "content-type": "application/json" };
  const post = async (body) => {
    const response = await fetch("/api/functions/settings", {
      method: "POST", headers: headers(), body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || t("保存失败"));
    return payload;
  };
  const save = async (root, clear) => {
    const field = root.querySelector("[data-functions-connection]");
    const status = root.querySelector("[data-functions-settings-status]");
    const buttons = root.querySelectorAll("[data-functions-key-save], [data-functions-key-clear]");
    buttons.forEach(button => { button.disabled = true; });
    try {
      const payload = await post(clear ? { clear: true } : { connection_id: field.value });
      if (!root.isConnected) return;
      if (clear) {
        field.value = "";
        field.dispatchEvent(new Event("change", { bubbles: true }));
      }
      status.dataset.source = payload.source;
      status.textContent = payload.source === "env" ? t("来自 TYPESAFE_API_KEY。")
        : payload.has_credential ? t("已配置判断服务。") : t("还未选择账号连接。");
      root.querySelector("[data-functions-key-clear]").hidden = !field.value;
    } catch (error) {
      status.textContent = error.message || t("保存失败");
    } finally { buttons.forEach(button => { button.disabled = false; }); }
  };
  document.addEventListener("submit", (event) => {
    if (!event.target.matches("[data-functions-settings-form]")) return;
    event.preventDefault();
    void save(event.target.closest("[data-functions-settings]"), false);
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-functions-key-clear]");
    if (!button) return;
    void save(button.closest("[data-functions-settings]"), true);
  });
})();
`;
