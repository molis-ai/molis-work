export const CONNECTORS_SETTINGS_CLIENT_SCRIPT = `
  (() => {
    const bind = (root = document) => {
      const scope = root && root.querySelector ? root : document;
      const box = scope.matches?.("[data-connectors-settings]")
        ? scope
        : scope.querySelector("[data-connectors-settings]");
      if (!box || box.dataset.connectorsBound === "1") return;
      box.dataset.connectorsBound = "1";
      const list = box.querySelector("[data-connectors-list]");
      const errorBox = box.querySelector("[data-connectors-error]");
      const toast = document.querySelector("[data-settings-toast], [data-toast]");
      const standalone = () => location.pathname.indexOf("/settings/") === 0;
      const setError = (message) => {
        if (!errorBox) return;
        errorBox.textContent = message || "";
        errorBox.hidden = !message;
      };
      const showToast = (text) => {
        if (!toast) return;
        toast.textContent = text;
        toast.classList.add("is-visible");
        setTimeout(() => toast.classList.remove("is-visible"), 2600);
      };
      const connectorsPageUrl = (connectorId) => {
        const next = new URL("/settings/connectors", location.origin);
        const search = new URLSearchParams(location.search);
        const desktop = search.get("desktop");
        const project = search.get("project");
        if (desktop) next.searchParams.set("desktop", desktop);
        if (project) next.searchParams.set("project", project);
        if (connectorId) next.searchParams.set("connector", connectorId);
        return next.pathname + next.search;
      };
      const writeUrl = (id) => {
        if (!standalone()) return;
        history.replaceState(null, "", connectorsPageUrl(id));
      };
      const showDetail = (id, options) => {
        if (list) list.hidden = Boolean(id);
        box.querySelectorAll("[data-connector-detail]").forEach((panel) => {
          panel.hidden = panel.dataset.connectorDetail !== id;
        });
        if (!options || options.updateUrl !== false) writeUrl(id || "");
        const panel = id ? box.querySelector('[data-connector-detail="' + id + '"]') : null;
        const focus = panel && (panel.querySelector("[data-connectors-back]") || panel.querySelector("input, button"));
        if (focus) requestAnimationFrame(() => focus.focus());
      };
      const reload = async (connectorId) => {
        const path = connectorsPageUrl(connectorId);
        if (standalone()) {
          location.assign(path);
          return;
        }
        const response = await fetch(path, { headers: { Accept: "text/html" } });
        if (!response.ok) throw new Error(L("无法保存连接"));
        const doc = new DOMParser().parseFromString(await response.text(), "text/html");
        const nextBox = doc.querySelector("[data-connectors-settings]");
        if (!nextBox) {
          location.assign(path);
          return;
        }
        const adopted = document.adoptNode(nextBox);
        if (connectorId) adopted.dataset.openConnector = connectorId;
        box.replaceWith(adopted);
        globalThis.molisWorkBindConnectorsSettings?.(adopted);
      };
      const mutate = async (path, method, body) => {
        const headers = globalThis.molisWorkControlHeaders();
        const response = await fetch(path, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || L("无法保存连接"));
        return payload;
      };
      const busy = (node, on) => {
        if (!node) return;
        node.disabled = on;
      };
      box.querySelectorAll("[data-connector-open]").forEach((button) => {
        button.addEventListener("click", () => showDetail(button.dataset.connectorOpen || ""));
      });
      box.querySelectorAll("[data-connectors-back]").forEach((button) => {
        button.addEventListener("click", () => showDetail(""));
      });
      box.querySelector("[data-connectors-add]")?.addEventListener("click", () => {
        box.querySelector("[data-connectors-catalog]")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      box.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (list && list.hidden) {
          event.preventDefault();
          showDetail("");
        }
      });
      box.querySelectorAll("[data-connector-auth]").forEach((form) => {
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const kind = form.dataset.connectorAuth;
          const input = form.querySelector('[data-connector-token="' + kind + '"]');
          const panel = form.closest("[data-connector-detail]");
          const name = panel?.querySelector("[data-connector-new-name]")?.value?.trim() || panel?.querySelector("h2")?.textContent?.trim() || kind;
          const submit = form.querySelector('button[type="submit"]');
          setError("");
          busy(submit, true);
          try {
            await mutate("/api/settings/connectors/connections", "POST", {
              service_id: kind, display_name: name, token: input?.value || "",
            });
            showToast(L("已连接"));
            await reload(kind);
          } catch (error) {
            setError(error.message || L("无法保存连接"));
            busy(submit, false);
          }
        });
      });
      box.querySelectorAll("[data-connection-replace]").forEach((form) => {
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const id = form.dataset.connectionReplace;
          const service = form.closest("[data-connection-row]")?.dataset.connectionService;
          const button = form.querySelector('button[type="submit"]');
          setError(""); busy(button, true);
          try {
            await mutate("/api/settings/connectors/connections/" + encodeURIComponent(id), "PATCH", { token: form.querySelector("input")?.value || "" });
            showToast(L("已保存")); await reload(service);
          } catch (error) { setError(error.message || L("无法保存连接")); busy(button, false); }
        });
      });
      box.querySelectorAll("[data-connection-rename]").forEach((form) => {
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const id = form.dataset.connectionRename;
          const service = form.closest("[data-connection-row]")?.dataset.connectionService;
          const button = form.querySelector('button[type="submit"]');
          setError(""); busy(button, true);
          try {
            await mutate("/api/settings/connectors/connections/" + encodeURIComponent(id), "PATCH", { display_name: form.querySelector("input")?.value || "" });
            showToast(L("已保存")); await reload(service);
          } catch (error) { setError(error.message || L("无法保存连接")); busy(button, false); }
        });
      });
      box.querySelectorAll("[data-connection-disconnect]").forEach((button) => {
        button.addEventListener("click", async () => {
          const service = button.closest("[data-connection-row]")?.dataset.connectionService;
          setError(""); busy(button, true);
          try {
            await mutate("/api/settings/connectors/connections/" + encodeURIComponent(button.dataset.connectionDisconnect), "DELETE");
            showToast(L("已断开")); await reload(service);
          } catch (error) { setError(error.message || L("无法断开连接")); busy(button, false); }
        });
      });
      box.querySelectorAll("[data-connection-reauthorize]").forEach((button) => {
        button.addEventListener("click", () => {
          const panel = button.closest("[data-connector-detail]");
          const service = panel?.dataset.connectorDetail;
          if (service === "github") {
            const start = panel?.querySelector("[data-connector-github-device-start]");
            if (start) { start.dataset.connectionId = button.dataset.connectionReauthorize; start.click(); }
            return;
          }
          const start = panel?.querySelector(service === "gmail" ? "[data-connector-gmail-oauth-start]" : "[data-connector-notion-oauth-start]");
          if (start) { start.dataset.connectionId = button.dataset.connectionReauthorize; start.click(); }
        });
      });
      box.querySelectorAll("[data-connector-unbind]").forEach((button) => {
        button.addEventListener("click", async () => {
          setError("");
          busy(button, true);
          try {
            await mutate("/api/settings/connectors/" + encodeURIComponent(button.dataset.connectorUnbind) + "/token", "DELETE");
            showToast(L("已断开"));
            await reload(button.dataset.connectorUnbind);
          } catch (error) {
            setError(error.message || L("无法断开连接"));
            busy(button, false);
          }
        });
      });
      box.querySelectorAll("[data-connector-whoami]").forEach((button) => {
        button.addEventListener("click", async (event) => {
        const target = event.currentTarget;
        const kind = target.dataset.connectorWhoami || "";
        const panel = target.closest("[data-connector-detail]") || box;
        const resultBox = panel.querySelector("[data-connector-whoami-result]");
        busy(target, true);
        setError("");
        try {
          const payload = await mutate("/api/settings/connectors/" + encodeURIComponent(kind) + "/whoami", "POST");
          if (resultBox) {
            resultBox.hidden = false;
            resultBox.textContent = payload.login ? "@" + payload.login : "";
          }
        } catch (error) {
          setError(error.message || L("无法读取账号"));
        } finally {
          busy(target, false);
        }
      });
      });
      const deviceStatus = box.querySelector("[data-connector-github-device-status]");
      box.querySelector("[data-connector-github-device-start]")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const clientId = box.querySelector("[data-connector-github-client-id]")?.value || "";
        const poll = box.querySelector("[data-connector-github-device-poll]");
        busy(button, true);
        setError("");
        try {
          if (clientId) await mutate("/api/settings/connectors/github/client", "POST", { client_id: clientId });
          const started = await mutate("/api/settings/connectors/github/device/start", "POST", { client_id: clientId });
          if (deviceStatus) {
            deviceStatus.hidden = false;
            deviceStatus.dataset.deviceCode = started.device_code || "";
            deviceStatus.dataset.connectionId = button.dataset.connectionId || "";
            deviceStatus.textContent = L("打开 {uri} 并输入 {code}", { uri: started.verification_uri, code: started.user_code });
          }
          if (poll) poll.hidden = false;
        } catch (error) {
          setError(error.message || L("无法开始 GitHub 授权"));
        } finally {
          busy(button, false);
        }
      });
      box.querySelector("[data-connector-github-device-poll]")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const clientId = box.querySelector("[data-connector-github-client-id]")?.value || "";
        busy(button, true);
        setError("");
        try {
          const result = await mutate("/api/settings/connectors/github/device/poll", "POST", {
            device_code: deviceStatus?.dataset.deviceCode || "",
            client_id: clientId,
            manage_connection: true,
            display_name: panel?.querySelector("[data-connector-new-name]")?.value?.trim() || "",
            ...(deviceStatus?.dataset.connectionId ? { connection_id: deviceStatus.dataset.connectionId } : {}),
          });
          if (result.status === "authorized") {
            showToast(L("已连接"));
            await reload("github");
            return;
          }
          if (deviceStatus) deviceStatus.textContent = result.message || result.status || "";
        } catch (error) {
          setError(error.message || L("无法检查 GitHub 授权"));
        } finally {
          busy(button, false);
        }
      });
      box.querySelectorAll("[data-connector-gmail-oauth-start]").forEach((startButton) => startButton.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const panel = button.closest("[data-connector-detail]");
        const clientId = panel?.querySelector("[data-connector-gmail-client-id]")?.value || "";
        const clientSecret = panel?.querySelector("[data-connector-gmail-client-secret]")?.value || "";
        busy(button, true);
        setError("");
        try {
          if (clientId) {
            await mutate("/api/settings/connectors/gmail/client", "POST", {
              client_id: clientId,
              client_secret: clientSecret,
            });
          }
          const callback = "/api/feed/connectors/gmail/oauth/callback";
          const started = await mutate("/api/settings/connectors/gmail/oauth/start", "POST", {
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: location.origin + callback,
            manage_connection: true,
            display_name: panel?.querySelector("[data-connector-new-name]")?.value?.trim() || "",
            ...(button.dataset.connectionId ? { connection_id: button.dataset.connectionId } : {}),
          });
          location.assign(started.authorizationUrl);
        } catch (error) {
          setError(error.message || L("Gmail 授权启动失败"));
          busy(button, false);
        }
      }));
      box.querySelectorAll("[data-connector-notion-oauth-start]").forEach((startButton) => startButton.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const panel = button.closest("[data-connector-detail]");
        busy(button, true);
        setError("");
        try {
          const started = await mutate("/api/settings/connectors/notion/oauth/start", "POST", {
            client_id: panel?.querySelector("[data-connector-notion-client-id]")?.value || "",
            client_secret: panel?.querySelector("[data-connector-notion-client-secret]")?.value || "",
            manage_connection: true,
            display_name: panel?.querySelector("[data-connector-new-name]")?.value?.trim() || "",
            ...(button.dataset.connectionId ? { connection_id: button.dataset.connectionId } : {}),
          });
          location.assign(started.authorizationUrl);
        } catch (error) {
          setError(error.message || L("Notion 授权启动失败"));
          busy(button, false);
        }
      }));
      const feishuStatus = box.querySelector("[data-connector-feishu-status]");
      box.querySelectorAll("[data-gmail-redirect-uri]").forEach((node) => { node.textContent = location.origin + "/api/feed/connectors/gmail/oauth/callback"; });
      box.querySelectorAll("[data-notion-redirect-uri]").forEach((node) => {
        const callback = new URL("/api/settings/connectors/notion/oauth/callback", location.origin);
        callback.hostname = "localhost";
        node.textContent = callback.toString();
      });
      if (feishuStatus) fetch("/api/settings/connectors/feishu/cli/status")
        .then((response) => response.json())
        .then((status) => { if (feishuStatus && !feishuStatus.firstChild) feishuStatus.textContent = status.authorized ? L("飞书 CLI 已授权，可以检查并连接") : status.problem || ""; })
        .catch(() => {});
      const showFeishuLink = (url, text) => {
        if (!feishuStatus) return;
        feishuStatus.replaceChildren();
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = text;
        feishuStatus.append(link);
      };
      box.querySelector("[data-connector-feishu-setup]")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        busy(button, true);
        setError("");
        try {
          const started = await mutate("/api/settings/connectors/feishu/cli/setup", "POST");
          showFeishuLink(started.authorizationUrl, L("打开飞书 CLI 应用配置页"));
        } catch (error) { setError(error.message || L("无法配置飞书 CLI")); }
        finally { busy(button, false); }
      });
      box.querySelector("[data-connector-feishu-login]")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        busy(button, true);
        setError("");
        try {
          const started = await mutate("/api/settings/connectors/feishu/cli/login", "POST");
          showFeishuLink(started.authorizationUrl, L("打开飞书授权页面，完成后返回检查"));
        } catch (error) { setError(error.message || L("无法开始飞书授权")); }
        finally { busy(button, false); }
      });
      box.querySelector("[data-connector-feishu-check]")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        busy(button, true);
        setError("");
        try {
          const status = await fetch("/api/settings/connectors/feishu/cli/status").then((response) => response.json());
          if (!status.authorized) throw new Error(status.problem || L("飞书 CLI 尚未授权"));
          await mutate("/api/settings/connectors/feishu/cli/use", "POST");
          showToast(L("已连接"));
          await reload("feishu");
        } catch (error) { setError(error.message || L("无法检查飞书授权")); busy(button, false); }
      });
      const params = new URLSearchParams(location.search);
      const connected = params.get("connected");
      const connector = box.dataset.openConnector || params.get("connector") || connected || "";
      if (connector) showDetail(connector, { updateUrl: standalone() && !connected });
      if (connected) {
        showToast(L("已连接"));
        writeUrl(connected);
      }
    };
    globalThis.molisWorkBindConnectorsSettings = bind;
    bind(document);
  })();
`;
