import { createConnectorAuthorizationMonitor } from "./connector-authorization-monitor.js";
export const CONNECTORS_SETTINGS_CLIENT_SCRIPT = `
  (() => {
    const createAuthorizationMonitor = ${createConnectorAuthorizationMonitor.toString()};
    // \`page\` is the address the connections were opened at: their own page, or the settings section in the workbench.
    const ownPage = { address: () => new URL(location.href), replace: (next) => history.replaceState(null, '', next), own: true };
    const bind = (root = document, page = ownPage) => {
      const box = root.matches?.('[data-connectors-settings]') ? root : root.querySelector('[data-connectors-settings]');
      if (!box || box.dataset.connectorsBound === '1') return;
      box.dataset.connectorsBound = '1';
      const list = box.querySelector('[data-connectors-list]');
      const search = box.querySelector('[data-connectors-search]');
      const category = box.querySelector('[data-connectors-category]');
      const standalone = () => !page.own || location.pathname.startsWith('/settings/') || location.pathname === '/capabilities/connections';
      const panelFor = id => [...box.querySelectorAll('[data-connector-detail]')].find(p => p.dataset.connectorDetail === id);
      const stateKey = 'molis-connectors-pending';
      const noticeKey = 'molis-connectors-notice';
      const remember = (key, value) => { try { value ? sessionStorage.setItem(key, JSON.stringify(value)) : sessionStorage.removeItem(key); } catch {} };
      const recalled = key => { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } };
      let lastTrigger = null;
      let waiting = null;
      const stopWaiting = () => { if (waiting) { waiting.stopped = true; waiting.stop?.(); clearTimeout(waiting.timer); } waiting = null; remember(stateKey, null); };
      const busy = (node, on) => { if (node) { node.disabled = on; node.setAttribute('aria-busy', String(on)); } };
      const output = (node, message, error = false, details) => {
        if (!node) return;
        node.hidden = false; node.dataset.tone = error ? 'error' : 'success';
        node.setAttribute('role', error ? 'alert' : 'status');
        const text = document.createElement('p'); text.textContent = message; node.replaceChildren(text);
        if (details !== undefined) {
          const fold = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = L('技术详情');
          const pre = document.createElement('pre'); pre.className = 'settings-connection-output'; pre.textContent = typeof details === 'string' ? details : JSON.stringify(details, null, 2);
          fold.append(summary, pre); node.append(fold);
        }
      };
      const fail = (node, error) => output(node, error.message || L('操作未完成，请重试。'), true);
      const api = async (path, body, method = 'POST') => {
        const response = await fetch(path, { method, headers: globalThis.molisWorkControlHeaders(), ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(45000) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) { const error = new Error(payload.error || L('服务暂时无法连接，请重试。')); error.status = response.status; throw error; }
        return payload;
      };
      const pageUrl = id => {
        const next = new URL('/capabilities/connections', location.origin);
        for (const key of ['desktop', 'project']) { const value = page.address().searchParams.get(key); if (value) next.searchParams.set(key, value); }
        if (id) next.searchParams.set('connector', id);
        return next.pathname + next.search;
      };
      const showDetail = (id, focus = true) => {
        const panel = panelFor(id);
        if (!panel) box.querySelectorAll('[data-protocol]').forEach(area => { delete area.dataset.connectionId; });
        list.hidden = Boolean(panel);
        box.querySelectorAll('[data-connector-detail]').forEach(item => { item.hidden = item !== panel; });
        if (standalone()) page.replace(new URL(pageUrl(panel ? id : ''), location.origin));
        if (focus) requestAnimationFrame(() => (panel?.querySelector('h2') || lastTrigger || search)?.focus());
      };
      const reload = async (id, notice) => {
        stopWaiting();
        if (notice) remember(noticeKey, { service: id, ...notice });
        const response = await fetch(pageUrl(id), { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(45000) });
        if (!response.ok) throw new Error(L('连接已更新，但页面未能刷新。请重新打开服务连接。'));
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        const next = doc.querySelector('[data-connectors-settings]');
        if (!next) throw new Error(L('页面未能刷新，请重新打开服务连接。'));
        next.dataset.openConnector = id;
        const adopted = document.adoptNode(next); box.replaceWith(adopted); bind(adopted);
        adopted.querySelector('[data-connector-detail]:not([hidden]) h2')?.focus();
      };
      const resultFor = area => area.querySelector('[data-protocol-result]');
      const connectionPath = id => '/api/settings/connectors/connections/' + encodeURIComponent(id);
      const nameFor = panel => panel.querySelector('[data-connector-new-name]')?.value.trim() || panel.querySelector('h2')?.textContent.trim() || panel.dataset.connectorDetail;
      const protocolBody = area => {
        const body = { service_id: area.dataset.protocolService, display_name: nameFor(area.closest('[data-connector-detail]')), settings: {} };
        if (area.dataset.connectionId) body.connection_id = area.dataset.connectionId;
        area.querySelectorAll('[data-protocol-field]').forEach(input => {
          const key = input.dataset.protocolField;
          if (key.startsWith('setting:')) body.settings[key.slice(8)] = input.value.trim(); else body[key] = input.value.trim();
        });
        return body;
      };
      const validate = area => [...area.querySelectorAll('input[required]')].every(input => input.checkValidity() || (input.reportValidity(), false));
      const expand = node => { for (let p = node; p && p !== box; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true; };
      const reserveBrowser = () => {
        if (globalThis.molisWorkOpenExternalUrl) return null;
        const popup = window.open('', '_blank');
        if (popup) { popup.opener = null; popup.document.title = L('正在打开官方授权页…'); popup.document.body.textContent = L('正在准备登录，请稍候。'); }
        return popup;
      };
      const openAuthorization = async (url, popup) => {
        const target = new URL(url);
        if (target.protocol !== 'https:' || target.username || target.password) throw new Error(L('服务返回的授权地址无效，请重试。'));
        if (globalThis.molisWorkOpenExternalUrl) { await globalThis.molisWorkOpenExternalUrl(target.href); return true; }
        if (popup && !popup.closed) { popup.location.replace(target.href); return true; }
        return false;
      };
      const waitControls = (area, url, session, poll) => {
        const result = resultFor(area);
        output(result, L('等待你在官方页面完成授权。完成后，这里会自动更新。'));
        const actions = document.createElement('div'); actions.className = 'settings-connector-actions';
        if (url) { const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = L('重新打开官方授权页'); link.className = 'mw-btn mw-btn--secondary'; actions.append(link); }
        const check = document.createElement('button'); check.type = 'button'; check.className = 'mw-btn mw-btn--secondary'; check.textContent = L('我已授权，检查结果');
        check.addEventListener('click', () => { clearTimeout(session.timer); poll(); });
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'mw-btn mw-btn--ghost'; cancel.textContent = L('停止等待');
        cancel.addEventListener('click', () => { stopWaiting(); delete area.dataset.connectionId; output(result, L('已停止等待。已有账号不受影响；如果还需要连接，可以重新开始授权。')); });
        actions.append(check, cancel); result.append(actions);
      };
      const watchConnection = (area, id, revision, url, expires = Date.now() + 600000, authorizationId) => {
        stopWaiting();
        const service = area.dataset.protocolService;
        remember(stateKey, { service, method: area.dataset.protocol, id, revision, expires, authorizationId, url });
        const start = area.querySelector('[data-protocol-start]'); busy(start, true);
        const finish = () => { stopWaiting(); busy(start, false); };
        const notice = { id, message: L('账号授权已完成。你可以检查连接，或继续设置使用范围。') };
        const refreshFailed = () => {
          finish();
          const result = resultFor(area);
          output(result, L('账号已授权，但页面刷新失败。请重新加载连接信息，无需再次授权。'), true);
          const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'mw-btn mw-btn--secondary'; retry.textContent = L('重新加载连接信息');
          retry.addEventListener('click', async () => { busy(retry, true); try { await reload(service, notice); } catch { refreshFailed(); } });
          result.append(retry);
        };
        const monitor = createAuthorizationMonitor({
          read: async () => {
            if (authorizationId) { try { return (await api('/api/settings/connectors/authorizations/' + encodeURIComponent(authorizationId), undefined, 'GET')).status; } catch (error) { if (error.status === 404) return 'expired'; throw error; } }
            const state = await api(connectionPath(id), undefined, 'GET');
            return state.connection.state === 'connected' && (!revision || state.revision !== revision) ? 'connected' : 'pending';
          },
          connected: async () => { busy(start, false); await reload(service, notice); },
          ended: status => { finish(); output(resultFor(area), L(status === 'cancelled' ? '授权已取消。可以重新登录，已有连接不受影响。' : status === 'expired' ? '等待授权已超时。请重新登录，已有连接不受影响。' : '授权未完成。请重新登录；如果仍然失败，请检查服务权限或联系支持。'), true); },
          refreshFailed, alive: () => box.isConnected, expires, now: Date.now,
          schedule: (run, delay) => setTimeout(run, delay), unschedule: timer => clearTimeout(timer),
        });
        waiting = { stop: () => { monitor.stop(); busy(start, false); } };
        waitControls(area, url, waiting, monitor.check);
      };
      const deviceFlow = async (area, body, popup) => {
        const started = await api('/api/settings/connectors/github/device/start', { client_id: body.client_id || undefined });
        stopWaiting();
        const session = { stopped: false, timer: null, checking: false }; waiting = session;
        const expires = Date.now() + started.expires_in * 1000;
        let interval = Math.max(5, started.interval || 5) * 1000;
        const poll = async () => {
          if (session.stopped || session.checking || !box.isConnected) return;
          if (Date.now() > expires) { stopWaiting(); output(resultFor(area), L('GitHub 授权码已过期，请重新开始。'), true); return; }
          session.checking = true;
          try {
            const result = await api('/api/settings/connectors/github/device/poll', { device_code: started.device_code, client_id: body.client_id || undefined, manage_connection: true, connection_id: body.connection_id, display_name: body.display_name });
            if (session.stopped) return;
            if (result.status === 'authorized') { await reload('github', { id: result.connection_id, message: L('GitHub 账号已连接。') }); return; }
            if (result.status === 'slow_down') interval += 5000;
            else if (!['pending', 'authorization_pending'].includes(result.status)) { stopWaiting(); output(resultFor(area), result.message || L('授权未完成，请重新开始。'), true); return; }
          } catch (error) { if (!session.stopped) { stopWaiting(); fail(resultFor(area), error); } return; }
          finally { session.checking = false; }
          if (!session.stopped) session.timer = setTimeout(poll, interval);
        };
        waitControls(area, started.verification_uri, session, poll);
        const code = document.createElement('p'); code.textContent = L('在 GitHub 输入设备码：{code}', { code: started.user_code }); resultFor(area).prepend(code);
        await openAuthorization(started.verification_uri, popup);
        session.timer = setTimeout(poll, interval);
      };
      box.querySelectorAll('[data-protocol-start]').forEach(button => button.addEventListener('click', async () => {
        const area = button.closest('[data-protocol]'); const body = protocolBody(area);
        if (!area.dataset.connectionId && !validate(area)) return;
        const popup = reserveBrowser(); busy(button, true);
        output(resultFor(area), L('正在准备官方授权…'));
        try {
          let revision, authorizationFlow;
          if (body.connection_id) {
            const existing = await api(connectionPath(body.connection_id), undefined, 'GET');
            revision = existing.revision; authorizationFlow = existing.authorization_flow;
            if (!area.closest('[data-connector-detail]').querySelector('[data-connector-new-name]')?.value.trim()) body.display_name = existing.connection.display_name;
          }
          if (button.dataset.accountLogin === 'github' && !body.client_id && authorizationFlow !== 'oauth') { await deviceFlow(area, body, popup); return; }
          const service = button.dataset.accountLogin;
          const dedicated = service && !body.redirect_uri && !body.client_id && authorizationFlow !== 'oauth';
          const path = dedicated ? '/api/settings/connectors/' + service + '/oauth/start' : '/api/settings/connectors/methods/' + button.dataset.protocolStart + '/start';
          const payload = await api(path, dedicated ? { manage_connection: true, connection_id: body.connection_id, display_name: body.display_name, ...(service === 'gmail' ? { redirect_uri: location.origin + '/api/feed/connectors/gmail/oauth/callback' } : {}) } : body);
          const url = payload.authorization_url || payload.authorizationUrl;
          const id = payload.connection_id || payload.connection?.connection_id;
          area.querySelectorAll('input[type=password]').forEach(input => { input.value = ''; });
          if (url) {
            const opened = await openAuthorization(url, popup);
            watchConnection(area, id, revision, url, undefined, payload.authorization_id);
            if (!opened) resultFor(area).querySelector('p').textContent = L('浏览器拦截了新窗口。点击“重新打开官方授权页”继续登录。');
            const manual = area.querySelector('[data-oauth-return]');
            if (manual) manual.hidden = !(payload.manual_callback || body.redirect_uri);
          } else { popup?.close(); await reload(body.service_id, { id, message: L('工具已连接，可以查看可用工具。') }); }
        } catch (error) { popup?.close(); fail(resultFor(area), error); }
        finally { if (!waiting) busy(button, false); }
      }));
      box.querySelectorAll('[data-oauth-complete]').forEach(button => button.addEventListener('click', async () => {
        const area = button.closest('[data-protocol]'); busy(button, true);
        try { const result = await api('/api/settings/connectors/methods/' + area.dataset.protocol + '/complete', protocolBody(area)); await reload(area.dataset.protocolService, { id: result.connection?.connection_id || result.connectionId, message: L('授权已完成。') }); }
        catch (error) { fail(resultFor(area), error); } finally { busy(button, false); }
      }));
      box.querySelectorAll('[data-copy-callback]').forEach(button => button.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(button.parentElement.querySelector('code').textContent); button.textContent = L('已复制'); }
        catch { button.textContent = L('请选中地址复制'); }
      }));
      box.querySelectorAll('[data-oauth-callback], [data-mcp-callback]').forEach(node => {
        const service = node.dataset.accountCallback;
        let path = node.hasAttribute('data-mcp-callback') ? '/api/settings/connectors/methods/mcp/callback' : '/api/settings/connectors/methods/oauth/callback';
        // Other app credentials use the generic flow even when a preset exists.
        const url = new URL(path, location.origin); node.textContent = url.href;
      });
      const summarize = (node, result) => {
        const account = result.account || result.login || result.email;
        const tools = Array.isArray(result.tools) ? result.tools : null;
        output(node, tools ? L('已连接，可用工具 {count} 个。', { count: tools.length }) : account ? L('连接检查通过：{account}', { account }) : L('连接检查通过。'), false, result);
        const rows = tools || (Array.isArray(result.items) ? result.items : null);
        if (rows) { const ul = document.createElement('ul'); for (const row of rows.slice(0, 5)) { const li = document.createElement('li'); li.textContent = row.title || row.name || row.subject || L('已读取内容'); ul.append(li); } node.prepend(ul); }
      };
      box.querySelectorAll('[data-connection-check], [data-connection-preview]').forEach(button => button.addEventListener('click', async () => {
        const row = button.closest('[data-connection-row]'); busy(button, true);
        const result = row.querySelector('[data-connection-result]'); output(result, L('正在检查账号与权限…'));
        try { const payload = await api(connectionPath(row.dataset.connectionRow) + (button.hasAttribute('data-connection-preview') ? '/preview' : '/verify'), {}); summarize(result, payload); row.querySelector('[data-connection-state]').textContent = L('本次检查通过'); }
        catch (error) { fail(result, error); row.querySelector('[data-connection-state]').textContent = L('检查未通过'); }
        finally { busy(button, false); }
      }));
      const credentialValue = form => {
        const parts = [...form.querySelectorAll('[data-credential-part]')].map(input => input.value.trim());
        return parts.length ? parts.join(form.dataset.credentialSeparator) : form.querySelector('[data-connector-token]').value.trim();
      };
      const pluginKeys = new Set(['model-api', 'image-api', 'typesafe', 'mcp-bearer']);
      box.querySelectorAll('[data-connector-auth]').forEach(form => form.addEventListener('submit', async event => {
        event.preventDefault(); const button = form.querySelector('button[type=submit]'); busy(button, true);
        const service = form.dataset.connectorAuth; const result = resultFor(form);
        try {
          const token = credentialValue(form);
          output(result, L('正在保存连接…'));
          const saved = form.dataset.savedConnection
            ? await api(connectionPath(form.dataset.savedConnection), { token }, 'PATCH')
            : await api('/api/settings/connectors/connections', { service_id: service, display_name: nameFor(form.closest('[data-connector-detail]')), token });
          form.dataset.savedConnection = saved.connection.connection_id;
          if (!pluginKeys.has(service)) {
            output(result, L('凭据已保存，正在检查账号与权限…'));
            try { await api(connectionPath(saved.connection.connection_id) + '/verify', {}); }
            catch (error) { output(result, L('凭据已保存，但检查未通过。请核对凭据和权限后重试；再次保存会更新这条连接。'), true, error.message); return; }
          }
          form.querySelectorAll('input').forEach(input => { input.value = ''; });
          await reload(service, { id: saved.connection.connection_id, message: L(pluginKeys.has(service) ? '密钥已保存。请按下方提示，在使用它的功能中完成配置和验证。' : '连接检查通过。请按下方提示设置使用范围。') });
        } catch (error) { fail(result, error); } finally { busy(button, false); }
      }));
      box.querySelectorAll('[data-connection-replace], [data-connection-rename]').forEach(form => form.addEventListener('submit', async event => {
        event.preventDefault(); const button = form.querySelector('button'); const row = form.closest('[data-connection-row]'); busy(button, true);
        try { await api(connectionPath(row.dataset.connectionRow), form.hasAttribute('data-connection-replace') ? { token: credentialValue(form) } : { display_name: form.querySelector('input').value.trim() }, 'PATCH'); await reload(row.dataset.connectionService, { message: L(form.hasAttribute('data-connection-replace') ? '凭据已更新，请检查连接。' : '连接名称已更新。') }); }
        catch (error) { fail(row.querySelector('[data-connection-result]'), error); } finally { busy(button, false); }
      }));
      box.querySelectorAll('[data-connection-disconnect]').forEach(button => button.addEventListener('click', async () => {
        const row = button.closest('[data-connection-row]'); busy(button, true);
        try { await api(connectionPath(row.dataset.connectionRow), undefined, 'DELETE'); await reload(row.dataset.connectionService, { message: L('此账号已断开。其他账号不受影响；使用此账号的来源需要重新选择连接。') }); }
        catch (error) { fail(row.querySelector('[data-connection-result]'), error); } finally { busy(button, false); }
      }));
      box.querySelectorAll('[data-connection-reauthorize]').forEach(button => button.addEventListener('click', () => {
        const panel = button.closest('[data-connector-detail]'); const method = button.dataset.connectionMethod;
        const area = panel.querySelector('[data-protocol="' + method + '"]');
        if (!area) return;
        expand(area); if (method === 'oauth') area.dataset.connectionId = button.dataset.connectionReauthorize; else delete area.dataset.connectionId;
        output(resultFor(area), L(method === 'oauth' ? '请使用原账号完成授权；要连接其他账号，请返回并选择添加账号。' : '这会新增一条工具连接，已有工具授权会保留。'));
        area.scrollIntoView({ block: 'center', behavior: 'smooth' }); area.querySelector('[data-protocol-start]')?.focus();
      }));
      box.querySelectorAll('[data-connector-add] > summary').forEach(summary => summary.addEventListener('click', () => {
        summary.parentElement.querySelectorAll('[data-protocol]').forEach(area => { delete area.dataset.connectionId; });
      }));
      const connectCli = async area => { const result = await api('/api/settings/connectors/methods/cli/connect', protocolBody(area)); await reload(area.dataset.protocolService, { id: result.connection?.connection_id, message: L('本机账号检查通过，连接已保存。') }); };
      box.querySelectorAll('[data-cli-detect]').forEach(button => button.addEventListener('click', async () => {
        const area = button.closest('[data-protocol]'); busy(button, true);
        try { const status = await api('/api/settings/connectors/methods/cli/status', protocolBody(area)); area.querySelector('[data-cli-availability]').textContent = status.binary + ' · ' + L(status.installed ? '已安装' : '尚未安装'); area.querySelectorAll('[data-cli-login], [data-cli-connect]').forEach(b => { b.disabled = !status.installed; }); output(resultFor(area), L(status.installed ? '客户端已就绪，可以登录。' : '尚未检测到客户端，请按官方说明安装后重试。'), !status.installed); }
        catch (error) { fail(resultFor(area), error); } finally { busy(button, false); }
      }));
      box.querySelectorAll('[data-cli-connect]').forEach(button => button.addEventListener('click', async () => { const area = button.closest('[data-protocol]'); busy(button, true); try { await connectCli(area); } catch (error) { fail(resultFor(area), error); } finally { busy(button, false); } }));
      box.querySelectorAll('[data-cli-login]').forEach(button => button.addEventListener('click', async () => {
        const area = button.closest('[data-protocol]'); busy(button, true);
        try {
          const started = await api('/api/settings/connectors/methods/cli/login', protocolBody(area)); area.dataset.cliJob = started.job_id; area.querySelector('[data-cli-session]').hidden = false;
          output(resultFor(area), L('正在等待客户端登录。完成后会自动检查账号。'));
          const poll = async () => {
            if (!box.isConnected) return;
            try { const result = await api('/api/settings/connectors/methods/cli/job', { job_id: started.job_id }); area.querySelector('[data-cli-output]').textContent = result.output;
              if (result.status === 'running') setTimeout(poll, 1500);
              else { busy(button, false); if (result.status === 'succeeded') await connectCli(area); else output(resultFor(area), L('登录未完成。请查看客户端提示，可以重新登录。'), true); }
            } catch (error) { fail(resultFor(area), error); busy(button, false); }
          }; poll();
        } catch (error) { fail(resultFor(area), error); busy(button, false); }
      }));
      box.querySelectorAll('[data-cli-input], [data-cli-cancel]').forEach(button => button.addEventListener('click', async () => {
        const area = button.closest('[data-protocol]'); const input = area.querySelector('[data-protocol-field="cli_input"]');
        try { await api('/api/settings/connectors/methods/cli/job', { job_id: area.dataset.cliJob, ...(button.hasAttribute('data-cli-cancel') ? { cancel: true } : { input: input.value }) }); input.value = ''; } catch (error) { fail(resultFor(area), error); }
      }));
      box.querySelectorAll('[data-connector-feishu-setup]').forEach(button => button.addEventListener('click', async () => { const area = button.closest('[data-protocol]'); const popup = reserveBrowser(); busy(button, true); try { const started = await api('/api/settings/connectors/feishu/cli/setup', {}); await openAuthorization(started.authorizationUrl, popup); output(resultFor(area), L('请在浏览器完成应用配置，再回到这里登录。')); } catch (error) { popup?.close(); fail(resultFor(area), error); } finally { busy(button, false); } }));
      box.querySelectorAll('[data-mcp-tool-call], [data-mcp-resource-read]').forEach(button => button.addEventListener('click', async () => {
        const row = button.closest('[data-connection-row]'); busy(button, true);
        try { const body = button.hasAttribute('data-mcp-tool-call') ? { action: 'call', name: row.querySelector('[data-mcp-tool-name]').value.trim(), arguments: JSON.parse(row.querySelector('[data-mcp-tool-arguments]').value) } : { action: 'read', uri: row.querySelector('[data-mcp-resource-uri]').value.trim() }; const result = await api(connectionPath(row.dataset.connectionRow) + '/mcp', body); output(row.querySelector('[data-connection-result]'), L('操作已完成。'), false, result); }
        catch (error) { fail(row.querySelector('[data-connection-result]'), error); } finally { busy(button, false); }
      }));
      const filter = () => {
        const query = search.value.trim().toLocaleLowerCase(); let total = 0;
        box.querySelectorAll('[data-connector-subgroup]').forEach(group => {
          let count = 0; group.querySelectorAll('[data-connector-search]').forEach(card => { card.hidden = Boolean(category.value && category.value !== group.dataset.connectorSubgroup) || !card.dataset.connectorSearch.includes(query); if (!card.hidden) count++; });
          group.hidden = !count; total += count;
        });
        box.querySelector('[data-connectors-no-results]').hidden = total > 0;
      };
      search.addEventListener('input', filter); category.addEventListener('change', filter);
      box.querySelector('[data-connectors-reset]').addEventListener('click', () => { search.value = ''; category.value = ''; filter(); search.focus(); });
      box.querySelectorAll('[data-connector-open]').forEach(button => button.addEventListener('click', () => {
        lastTrigger = button; showDetail(button.dataset.connectorOpen);
        if (button.dataset.connectorDirect) {
          const panel = panelFor(button.dataset.connectorOpen);
          const start = panel?.querySelector('[data-protocol-start="' + button.dataset.connectorDirect + '"]');
          if (start && !start.disabled) { expand(start); start.click(); }
        }
      }));
      box.querySelectorAll('[data-connectors-back]').forEach(button => button.addEventListener('click', () => showDetail('')));
      box.querySelector('[data-connectors-add]')?.addEventListener('click', () => { search.scrollIntoView({ block: 'center', behavior: 'smooth' }); search.focus(); });
      box.addEventListener('keydown', event => { if (event.key === 'Escape' && list.hidden && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) { event.preventDefault(); showDetail(''); } });
      const params = page.address().searchParams;
      const errorCode = params.get('connection_error');
      const connected = params.get('connected');
      const id = box.dataset.openConnector || params.get('connector') || connected || '';
      const notice = recalled(noticeKey);
      showDetail(id, false);
      if (errorCode) {
        output(box.querySelector('[data-connectors-error]'), L(errorCode === 'cancelled' ? '授权已取消。已有连接不受影响，可以选择服务重新登录。' : '授权未完成。请检查应用的回调地址、权限和授权是否过期，然后重新登录。'), true);
      }
      if (notice && panelFor(notice.service)) { output(panelFor(notice.service).querySelector('[data-connector-feedback]'), notice.message); remember(noticeKey, null); }
      if (connected && panelFor(connected)) output(panelFor(connected).querySelector('[data-connector-feedback]'), L('官方授权已完成。请回到原来的应用窗口继续，或在这里设置使用范围。'));
      box.querySelectorAll('[data-connector-next-link]').forEach(link => {
        const project = params.get('project') || /^\\/projects\\/([^/]+)/.exec(location.pathname)?.[1];
        const plugin = link.dataset.connectorNextLink; const next = new URL(link.getAttribute('href'), location.origin);
        if (project && plugin) { next.pathname = '/projects/' + encodeURIComponent(project) + '/'; next.searchParams.set('openPlugin', plugin); link.textContent = L(plugin === 'feed' ? '打开 Feed，添加来源' : plugin === 'images' ? '打开 Images' : '打开 Coding'); }
        else if (project && next.pathname.startsWith('/settings/')) next.searchParams.set('project', project);
        if (params.get('desktop')) next.searchParams.set('desktop', params.get('desktop'));
        link.href = next.pathname + next.search;
      });
      const pending = recalled(stateKey);
      if (pending && pending.expires > Date.now() && !connected && !errorCode) {
        const area = panelFor(pending.service)?.querySelector('[data-protocol="' + pending.method + '"]');
        if (area) { showDetail(pending.service, false); expand(area); watchConnection(area, pending.id, pending.revision, pending.url || null, pending.expires, pending.authorizationId); }
      } else if (pending) remember(stateKey, null);
    };
    globalThis.molisWorkBindConnectorsSettings = bind;
    bind(document);
  })();
`;
