/** Live-saves the TypeSafe key from the global settings page. Never logs the secret. */
export const FUNCTIONS_SETTINGS_CLIENT_SCRIPT = `(() => {
  const root = document.querySelector("[data-functions-settings]");
  if (!root) return;
  const form = root.querySelector("[data-functions-settings-form]");
  const field = root.querySelector("[data-functions-api-key]");
  const status = root.querySelector("[data-functions-settings-status]");
  const clearButton = root.querySelector("[data-functions-key-clear]");
  const t = (value) => (typeof L === "function" ? L(value) : value);
  const headers = () => typeof molisWorkControlHeaders === "function"
    ? molisWorkControlHeaders()
    : { "content-type": "application/json" };
  const post = async (body) => {
    const response = await fetch("/api/plugins/functions/settings", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || t("保存失败"));
    return payload;
  };
  const paint = (payload) => {
    status.dataset.source = payload.source;
    status.textContent = payload.source === "env"
      ? t("由环境变量 TYPESAFE_API_KEY 提供，输入框不可改。")
      : payload.has_credential
        ? t("已配置。页面不会再显示明文。")
        : t("还没有 Key。没有它也能写草稿，试跑时会停住。");
    field.value = "";
    if (payload.source === "env") {
      field.disabled = true;
      form.querySelector("[data-functions-key-save]").disabled = true;
      clearButton.hidden = true;
      return;
    }
    clearButton.hidden = !payload.has_credential;
  };
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      paint(await post({ api_key: field.value }));
    } catch (error) {
      status.textContent = error.message || t("保存失败");
    }
  });
  clearButton.addEventListener("click", async () => {
    try {
      paint(await post({ clear: true }));
    } catch (error) {
      status.textContent = error.message || t("保存失败");
    }
  });
})();
`;
