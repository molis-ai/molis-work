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
      const output = (node, value) => {
        if (!node) return;
        node.hidden = false;
        const pre = document.createElement("pre"); pre.className = "settings-connection-output";
        pre.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
        node.replaceChildren(pre);
      };
      box.querySelectorAll("[data-oauth-callback]").forEach(node => { node.textContent = location.origin + "/api/settings/connectors/methods/oauth/callback"; });
      box.querySelectorAll("[data-mcp-callback]").forEach(node => { node.textContent = location.origin + "/api/settings/connectors/methods/mcp/callback"; });
      const protocolBody = (area) => {
        const body = { service_id: area.dataset.protocolService, settings: {} };
        const panel = area.closest("[data-connector-detail]");
        body.display_name = panel?.querySelector("[data-connector-new-name]")?.value?.trim() || body.service_id;
        if (area.dataset.connectionId) body.connection_id = area.dataset.connectionId;
        area.querySelectorAll("[data-protocol-field]").forEach(input => {
          const key = input.dataset.protocolField;
          if (key.startsWith("setting:")) body.settings[key.slice(8)] = input.value.trim();
          else body[key] = input.value.trim();
        });
        return body;
      };
      box.querySelectorAll("[data-protocol-start]").forEach(button => button.addEventListener("click", async () => {
        const area = button.closest("[data-protocol]"); const result = area.querySelector("[data-protocol-result]");
        busy(button, true); setError("");
        try {
          const payload = await mutate("/api/settings/connectors/methods/" + button.dataset.protocolStart + "/start", "POST", protocolBody(area));
          area.querySelectorAll('input[type="password"]').forEach(input => { input.value = ""; });
          if (payload.authorization_url) {
            const url = new URL(payload.authorization_url);
            if (url.protocol !== "https:") throw new Error(L("授权服务返回的地址无效"));
            const link = document.createElement("a"); link.href = url.href; link.target = "_blank"; link.rel = "noopener noreferrer";
            link.textContent = L("打开官方授权页，完成后返回应用"); result.replaceChildren(link);
            const returned = area.querySelector("[data-oauth-return]"); if (returned) returned.hidden = !payload.manual_callback && !protocolBody(area).redirect_uri;
          } else await reload(area.dataset.protocolService);
        } catch (error) { output(result, error.message); }
        finally { busy(button, false); }
      }));
      box.querySelectorAll("[data-oauth-complete]").forEach(button => button.addEventListener("click", async () => {
        const area = button.closest("[data-protocol]"); busy(button, true);
        try { await mutate("/api/settings/connectors/methods/" + area.dataset.protocol + "/complete", "POST", protocolBody(area)); await reload(area.dataset.protocolService); }
        catch (error) { output(area.querySelector("[data-protocol-result]"), error.message); }
        finally { busy(button, false); }
      }));
      box.querySelectorAll("[data-cli-login]").forEach(button => button.addEventListener("click", async () => {
        const area = button.closest("[data-protocol]"); busy(button, true);
        try {
          const started = await mutate("/api/settings/connectors/methods/cli/login", "POST", protocolBody(area)); area.dataset.cliJob = started.job_id;
          area.querySelector("[data-cli-session]").hidden = false;
          const poll = async () => {
            if (!area.isConnected) return;
            try {
              const result = await mutate("/api/settings/connectors/methods/cli/job", "POST", { job_id: started.job_id });
              area.querySelector("[data-cli-output]").textContent = result.output;
              if (result.status === "running") setTimeout(poll, 1500);
              else { busy(button, false); output(area.querySelector("[data-protocol-result]"), L(result.status === "succeeded" ? "登录命令已完成，请点击“验证并连接当前账号”。" : "登录未完成，请检查终端提示后重试。")); }
            } catch (error) { output(area.querySelector("[data-protocol-result]"), error.message); busy(button, false); }
          };
          poll();
        } catch (error) { output(area.querySelector("[data-protocol-result]"), error.message); busy(button, false); }
      }));
      box.querySelectorAll("[data-cli-input], [data-cli-cancel]").forEach(button => button.addEventListener("click", async () => {
        const area = button.closest("[data-protocol]");
        try {
          const input = area.querySelector('[data-protocol-field="cli_input"]');
          await mutate("/api/settings/connectors/methods/cli/job", "POST", { job_id: area.dataset.cliJob, ...(button.hasAttribute("data-cli-cancel") ? { cancel: true } : { input: input.value }) });
          input.value = "";
        } catch (error) { output(area.querySelector("[data-protocol-result]"), error.message); }
      }));
      box.querySelectorAll("[data-cli-connect]").forEach(button => button.addEventListener("click", async () => {
        const area = button.closest("[data-protocol]"); busy(button, true);
        try { await mutate("/api/settings/connectors/methods/cli/connect", "POST", protocolBody(area)); await reload(area.dataset.protocolService); }
        catch (error) { output(area.querySelector("[data-protocol-result]"), error.message); }
        finally { busy(button, false); }
      }));
      box.querySelectorAll("[data-connection-check], [data-connection-preview]").forEach(button => button.addEventListener("click", async () => {
        const row = button.closest("[data-connection-row]"); busy(button, true);
        try {
          const preview = button.hasAttribute("data-connection-preview");
          const result = await mutate("/api/settings/connectors/connections/" + encodeURIComponent(row.dataset.connectionRow) + (preview ? "/preview" : "/verify"), "POST", {});
          output(row.querySelector("[data-connection-result]"), result);
        } catch (error) { output(row.querySelector("[data-connection-result]"), error.message); }
        finally { busy(button, false); }
      }));
      box.querySelectorAll("[data-mcp-resource-read]").forEach(button => button.addEventListener("click", async () => {
        const row = button.closest("[data-connection-row]"); busy(button, true);
        try { output(row.querySelector("[data-connection-result]"), await mutate("/api/settings/connectors/connections/" + button.dataset.mcpResourceRead + "/mcp", "POST", { action: "read", uri: row.querySelector("[data-mcp-resource-uri]").value.trim() })); }
        catch (error) { output(row.querySelector("[data-connection-result]"), error.message); }
        finally { busy(button, false); }
      }));
      box.querySelectorAll("[data-mcp-tool-call]").forEach(button => button.addEventListener("click", async () => {
        const row = button.closest("[data-connection-row]"); busy(button, true);
        try {
          const result = await mutate("/api/settings/connectors/connections/" + encodeURIComponent(button.dataset.mcpToolCall) + "/mcp", "POST", { action: "call", name: row.querySelector("[data-mcp-tool-name]").value.trim(), arguments: JSON.parse(row.querySelector("[data-mcp-tool-arguments]").value) });
          output(row.querySelector("[data-connection-result]"), result);
        } catch (error) { output(row.querySelector("[data-connection-result]"), error.message); }
        finally { busy(button, false); }
      }));
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
            showToast(L("凭据已保存，可在连接中验证账号"));
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
          const method = button.dataset.connectionMethod;
          const area = panel?.querySelector('[data-protocol="' + method + '"]');
          if (area) {
            if (method === "mcp") delete area.dataset.connectionId;
            else area.dataset.connectionId = button.dataset.connectionReauthorize;
            area.open = true;
            area.scrollIntoView({ behavior: "smooth", block: "center" });
            area.querySelector("input")?.focus();
            return;
          }
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
