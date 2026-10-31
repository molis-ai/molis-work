import { createConnectorAuthorizationMonitor } from "./connector-authorization-monitor.js";
import { isLoopbackHostname, isLoopbackHttpUrl } from "@molis-ai/molis-work-contracts/platform/loopback";
export const CONNECTORS_SETTINGS_CLIENT_SCRIPT = `
  (() => {
    const isLoopbackHostname = ${isLoopbackHostname.toString()};
    const isLoopbackHttpUrl = ${isLoopbackHttpUrl.toString()};
    const createAuthorizationMonitor = ${createConnectorAuthorizationMonitor.toString()};
    // \`page\` is the address the connections were opened at: their own page, or the settings section in the workbench.
    const ownPage = { address: () => new URL(location.href), replace: (next) => history.replaceState(null, '', next), own: true };
    const bind = (root = document, page = ownPage) => {
      const box = root.matches?.('[data-connectors-settings]') ? root : root.querySelector('[data-connectors-settings]');
      if (!box || box.dataset.connectorsBound === '1') return;
      box.dataset.connectorsBound = '1';
      const click = (selector, handler) => box.querySelectorAll(selector).forEach(node => node.addEventListener('click', () => handler(node)));
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
      const fail = (node, error) => { if (!node) return; output(node, '', true); molisWorkRequest.show(node.querySelector('p'), error, L('操作未完成，请重试。')); };
      const api = (path, body, method = 'POST', timeout = 45000) => molisWorkRequest('/api/settings/connectors/' + path, {method, body, signal: AbortSignal.timeout(timeout), fallback: L('服务暂时无法连接，请重试。')});
      const pageUrl = id => {
        const next = new URL('/capabilities/connections', location.origin);
        for (const key of ['desktop', 'project']) { const value = page.address().searchParams.get(key); if (value) next.searchParams.set(key, value); }
        if (id) next.searchParams.set('connector', id);
        if (box.dataset.setupId) next.searchParams.set('setup', box.dataset.setupId);
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
        const html = await molisWorkRequest(pageUrl(id), {as:'text', headers:{Accept:'text/html'}, signal:AbortSignal.timeout(45000), fallback:L('连接已更新，但页面未能刷新。请重新打开服务连接。')});
        if (!box.isConnected) return;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const next = doc.querySelector('[data-connectors-settings]');
        if (!next) throw new Error(L('页面未能刷新，请重新打开服务连接。'));
        next.dataset.openConnector = id;
        box.replaceWith(next); bind(next, page);
        next.querySelector('[data-connector-detail]:not([hidden]) h2')?.focus();
      };
      const completed = (result, service, message) => reload(service, result.awaiting_intent ? undefined : { id: result.connection?.connection_id || result.connectionId || result.connection_id, message });
      const resultFor = area => area.querySelector('[data-protocol-result]');
      const perform = async (button, result, run, undo) => { busy(button, true); try { await run(); } catch(error) { undo?.(); fail(result, error); } finally { busy(button, false); } };
      const action = (selector, scope, result, run) => click(selector, button => { const area = button.closest(scope); return perform(button, area.querySelector(result), () => run(area, button)); });
      const protocolAction = (selector, run) => action(selector, '[data-protocol]', '[data-protocol-result]', run);
      const connectionAction = (selector, run) => action(selector, '[data-connection-row]', '[data-connection-result]', run);
      const connectionPath = id => 'connections/' + encodeURIComponent(id);
      const nameFor = panel => panel.querySelector('[data-connector-new-name]')?.value.trim() || panel.querySelector('h2')?.textContent.trim() || panel.dataset.connectorDetail;
      const protocolBody = area => {
        const body = { service_id: area.dataset.protocolService, display_name: nameFor(area.closest('[data-connector-detail]')), settings: {} };
        if (area.dataset.connectionId || box.dataset.setupConnection) body.connection_id = area.dataset.connectionId || box.dataset.setupConnection;
        if (box.dataset.setupId) body.setup_id = box.dataset.setupId;
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
        if ((target.protocol !== 'https:' && !isLoopbackHttpUrl(target)) || target.username || target.password) throw new Error(L('服务返回的授权地址无效，请重试。'));
        if (globalThis.molisWorkOpenExternalUrl) { await globalThis.molisWorkOpenExternalUrl(target.href); return true; }
        if (popup && !popup.closed) { popup.location.replace(target.href); return true; }
        return false;
      };
      const waitControls = (area, url, session, poll) => {
        const result = resultFor(area);
        output(result, L('正在等待接入结果。完成后，这里会自动更新。'));
        const actions = document.createElement('div'); actions.className = 'settings-connector-actions';
        if (url) { const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = L('重新打开官方授权页'); link.className = 'mw-btn mw-btn--secondary'; actions.append(link); }
        const check = document.createElement('button'); check.type = 'button'; check.className = 'mw-btn mw-btn--secondary'; check.textContent = L('我已授权，检查结果');
        check.addEventListener('click', () => { clearTimeout(session.timer); poll(); });
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'mw-btn mw-btn--ghost'; cancel.textContent = L('取消这次接入');
        cancel.addEventListener('click', async () => { try { if(session.authorizationId) await api('authorizations/' + session.authorizationId, undefined, 'DELETE'); stopWaiting(); await reload(area.dataset.protocolService); } catch(error) { fail(result, error); } });
        actions.append(check, cancel); result.append(actions);
      };
      const watchConnection = (area, id, url, expires = Date.now() + 600000, authorizationId) => {
        stopWaiting();
        const service = area.dataset.protocolService;
        remember(stateKey, { service, method: area.dataset.protocol, id, expires, authorizationId, url });
        const start = area.querySelector('[data-protocol-start]'); busy(start, true);
        const finish = () => { stopWaiting(); busy(start, false); };
        const notice = { id, message: L('账号授权已完成。你可以检查连接，或继续设置使用范围。') };
        const refreshFailed = error => {
          finish();
          const result = resultFor(area);
          output(result, L('账号已授权，但页面刷新失败。请重新加载连接信息，无需再次授权。'), true);
          if(error){const detail=document.createElement('p');molisWorkRequest.show(detail,error);result.append(detail);}
          const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'mw-btn mw-btn--secondary'; retry.textContent = L('重新加载连接信息');
          retry.addEventListener('click', async () => { busy(retry, true); try { await reload(service, notice); } catch(error) { refreshFailed(error); } });
          result.append(retry);
        };
        const monitor = createAuthorizationMonitor({
          read: async () => {
            try { const state = await api('authorizations/' + encodeURIComponent(authorizationId), undefined, 'GET'); if (state.commit_held) output(box.querySelector('[data-connector-feedback]'), L('正在核对你刚提出的新要求，接入暂不提交。请回到原对话继续。')); return state.status; } catch (error) { if (error.status === 404) return 'expired'; throw error; }
          },
          connected: async () => { busy(start, false); await reload(service, notice); },
          ended: status => { finish(); if (box.dataset.setupId) { reload(service).catch(refreshFailed); return; } output(resultFor(area), L(status === 'cancelled' ? '授权已取消。可以重新登录，已有连接不受影响。' : status === 'expired' ? '等待授权已超时。请重新登录，已有连接不受影响。' : '授权未完成。请重新登录；如果仍然失败，请检查服务权限或联系支持。'), true); },
          refreshFailed, alive: () => box.isConnected, expires, now: Date.now,
          schedule: (run, delay) => setTimeout(run, delay), unschedule: timer => clearTimeout(timer),
        });
        waiting = { authorizationId, stop: () => { monitor.stop(); busy(start, false); } };
        waitControls(area, url, waiting, monitor.check);
      };
      const deviceFlow = async (area, body, popup) => {
        const started = await api('methods/device/start', body);
        watchConnection(area, undefined, started.verification_uri, Date.now() + started.expires_in * 1000, started.authorization_id);
        const code = document.createElement('p'); code.textContent = L('在 GitHub 输入设备码：{code}', { code: started.user_code }); resultFor(area).prepend(code);
        await openAuthorization(started.verification_uri, popup);
      };
      click('[data-protocol-start]', async button => {
        const area = button.closest('[data-protocol]'); const body = protocolBody(area);
        if (!area.dataset.connectionId && !validate(area)) return;
        const popup = reserveBrowser(); busy(button, true);
        output(resultFor(area), L('正在准备官方授权…'));
        try {
          let authorizationFlow;
          if (body.connection_id) {
            const existing = await api(connectionPath(body.connection_id), undefined, 'GET');
            authorizationFlow = existing.authorization_flow;
            if (!area.closest('[data-connector-detail]').querySelector('[data-connector-new-name]')?.value.trim()) body.display_name = existing.connection.display_name;
          }
          if ('deviceLogin' in button.dataset && !body.client_id && authorizationFlow !== 'oauth') { await deviceFlow(area, body, popup); return; }
          const payload = await api('methods/' + button.dataset.protocolStart + '/start', body);
          const url = payload.authorization_url;
          const id = payload.connection_id || payload.connection?.connection_id;
          area.querySelectorAll('input[type=password]').forEach(input => { input.value = ''; });
          if (url) {
            const opened = await openAuthorization(url, popup);
            watchConnection(area, id, url, undefined, payload.authorization_id);
            if (!opened) resultFor(area).querySelector('p').textContent = L('浏览器拦截了新窗口。点击“重新打开官方授权页”继续登录。');
            const manual = area.querySelector('[data-oauth-return]');
            if (manual) manual.hidden = !(payload.manual_callback || body.redirect_uri);
          } else { popup?.close(); await completed(payload, body.service_id, L('工具已连接，可以查看可用工具。')); }
        } catch (error) { popup?.close(); fail(resultFor(area), error); }
        finally { if (!waiting) busy(button, false); }
      });
      protocolAction('[data-oauth-complete]', async area => {
        const result = await api('methods/' + area.dataset.protocol + '/complete', protocolBody(area));
        await completed(result, area.dataset.protocolService, L('授权已完成。'));
      });
      click('[data-copy-callback]', async button => {
        // Refused: the address is selected, ready to copy by hand.
        const code = button.parentElement.querySelector('code');
        if (await window.molisCopy?.(button, code.textContent, { done: L('已复制'), failed: L('复制失败') }) === false) { const range = document.createRange(); range.selectNodeContents(code); getSelection().removeAllRanges(); getSelection().addRange(range); }
      });
      box.querySelectorAll('[data-oauth-callback], [data-mcp-callback]').forEach(node => {
        const kind = node.hasAttribute('data-mcp-callback') ? 'mcp' : 'oauth';
        const address = new URL(node.dataset.callbackPath || '/api/settings/connectors/methods/' + kind + '/callback', location.origin);
        address.hostname = node.dataset.callbackHost || address.hostname;
        node.textContent = address.href;
      });
      const summarize = (node, result) => {
        const account = result.account || result.login || result.email;
        const tools = Array.isArray(result.tools) ? result.tools : null;
        output(node, tools ? L('已连接，可用工具 {count} 个。', { count: tools.length }) : account ? L('连接检查通过：{account}', { account }) : L('连接检查通过。'), false, result);
        const rows = tools || (Array.isArray(result.items) ? result.items : null);
        if (rows) { const ul = document.createElement('ul'); for (const row of rows.slice(0, 5)) { const li = document.createElement('li'); li.textContent = row.title || row.name || row.subject || L('已读取内容'); ul.append(li); } node.prepend(ul); }
      };
      box.querySelector('[data-connector-local]')?.addEventListener('submit', event => {
        event.preventDefault(); const form = event.currentTarget;
        return perform(form.querySelector('button[type=submit]'), resultFor(form), async () => {
          const environment = Object.fromEntries([...form.querySelectorAll('[data-local-secret]')].map(input => [input.dataset.localSecret, input.value]));
          output(resultFor(form), L('正在安装或验证本地工具。关闭页面不会取消；可以稍后重新打开查看结果。'));
          const result = await api('methods/' + form.dataset.protocol + (form.dataset.protocol === 'cli' ? '/install' : '/connect'), { setup_id: box.dataset.setupId, environment }, 'POST', 600000);
          form.querySelectorAll('input').forEach(input => { input.value = ''; });
          await completed(result, form.dataset.protocolService, L(result.status === 'needs_person' ? '客户端已就绪，可以登录。' : '连接已保存。实际可用范围以连接检查和业务调用为准。'));
        });
      });
      click('[data-connection-check], [data-connection-preview]', async button => {
        const row = button.closest('[data-connection-row]'); busy(button, true);
        const result = row.querySelector('[data-connection-result]'); output(result, L('正在检查账号与权限…'));
        try { const payload = await api(connectionPath(row.dataset.connectionRow) + (button.hasAttribute('data-connection-preview') ? '/preview' : '/verify'), {}); summarize(result, payload); row.querySelector('[data-connection-state]').textContent = L('本次检查通过'); }
        catch (error) { fail(result, error); row.querySelector('[data-connection-state]').textContent = L('检查未通过'); }
        finally { busy(button, false); }
      });
      const credentialValue = form => {
        const parts = [...form.querySelectorAll('[data-credential-part]')].map(input => input.value.trim());
        return parts.length ? parts.join(form.dataset.credentialSeparator) : form.querySelector('[data-connector-token]').value.trim();
      };
      const pluginKeys = new Set(['model-api', 'image-api', 'typesafe', 'mcp-bearer']);
      box.querySelectorAll('[data-connector-auth]').forEach(form => form.addEventListener('submit', event => {
        event.preventDefault(); const service = form.dataset.connectorAuth, result = resultFor(form);
        return perform(form.querySelector('button[type=submit]'), result, async () => {
          const token = credentialValue(form);
          output(result, L('正在保存连接…'));
          const target = form.dataset.savedConnection || box.dataset.setupConnection;
          const saved = target
            ? await api(connectionPath(target), { token, setup_id: box.dataset.setupId }, 'PATCH')
            : await api('connections', { service_id: service, display_name: nameFor(form.closest('[data-connector-detail]')), token, setup_id: box.dataset.setupId });
          form.querySelectorAll('input').forEach(input => { input.value = ''; });
          if (saved.awaiting_intent) { await reload(service); return; }
          form.dataset.savedConnection = saved.connection.connection_id;
          if (!pluginKeys.has(service)) {
            output(result, L('凭据已保存，正在检查账号与权限…'));
            try { await api(connectionPath(saved.connection.connection_id) + '/verify', {}); }
            catch { await reload(service, { id: saved.connection.connection_id, message: L('凭据已保存，但检查未通过。请在连接管理中检查或更新凭据。') }); return; }
          }
          await reload(service, { id: saved.connection.connection_id, message: L(pluginKeys.has(service) ? '密钥已保存。请按下方提示，在使用它的功能中完成配置和验证。' : '连接检查通过。请按下方提示设置使用范围。') });
        });
      }));
      box.querySelectorAll('[data-connection-replace], [data-connection-rename]').forEach(form => form.addEventListener('submit', event => {
        event.preventDefault(); const row = form.closest('[data-connection-row]');
        return perform(form.querySelector('button'), row.querySelector('[data-connection-result]'), async () => {
          await api(connectionPath(row.dataset.connectionRow), form.hasAttribute('data-connection-replace') ? { token: credentialValue(form) } : { display_name: form.querySelector('input').value.trim() }, 'PATCH');
          await reload(row.dataset.connectionService, { message: L(form.hasAttribute('data-connection-replace') ? '凭据已更新，请检查连接。' : '连接名称已更新。') });
        });
      }));
      connectionAction('[data-connection-disconnect], [data-connection-manage]', async (row, button) => {
        const action = button.dataset.connectionManage;
        const result = await api(connectionPath(row.dataset.connectionRow) + (action ? '/manage' : ''), action ? { action, expected_revision: row.dataset.connectionRevision } : undefined, action ? 'POST' : 'DELETE');
        await reload(row.dataset.connectionService, { message: result.cleanup?.message || result.verification?.reason || L(action ? '连接状态已更新' : '此账号已断开。其他账号不受影响；使用此账号的来源需要重新选择连接。') });
      });
      click('[data-connection-reauthorize]', button => {
        const panel = button.closest('[data-connector-detail]'); const method = button.dataset.connectionMethod;
        const area = panel.querySelector('[data-protocol="' + method + '"]');
        if (!area) return;
        expand(area); if (method === 'oauth') area.dataset.connectionId = button.dataset.connectionReauthorize; else delete area.dataset.connectionId;
        output(resultFor(area), L(method === 'oauth' ? '请使用原账号完成授权；要连接其他账号，请返回并选择添加账号。' : '这会新增一条工具连接，已有工具授权会保留。'));
        area.scrollIntoView({ block: 'center', behavior: 'smooth' }); area.querySelector('[data-protocol-start]')?.focus();
      });
      click('[data-connector-add] > summary', summary => {
        summary.parentElement.querySelectorAll('[data-protocol]').forEach(area => { delete area.dataset.connectionId; });
      });
      const connectCli = async area => completed(await api('methods/cli/connect', protocolBody(area)), area.dataset.protocolService, L('本机账号检查通过，连接已保存。'));
      protocolAction('[data-cli-detect]', async area => {
        const status = await api('methods/cli/status', protocolBody(area)); area.querySelector('[data-cli-availability]').textContent = status.binary + ' · ' + L(status.installed ? '已安装' : '尚未安装'); area.querySelectorAll('[data-cli-login], [data-cli-connect], [data-cli-configure]').forEach(b => { b.disabled = !status.installed; }); output(resultFor(area), L(status.installed ? '客户端已就绪，可以登录。' : '尚未检测到客户端，请按官方说明安装后重试。'), !status.installed);
      });
      protocolAction('[data-cli-connect]', connectCli);
      const watchCli = (area, id) => perform(null, resultFor(area), async () => {
        const controls = on => area.querySelectorAll('[data-cli-login], [data-cli-connect], [data-cli-configure], [data-cli-detect]').forEach(button => busy(button, on)); controls(true);
        try {
        area.dataset.cliJob = id; area.querySelector('[data-cli-session]').hidden = false;
        output(resultFor(area), L('正在等待客户端操作。完成后会自动更新。'));
        while (box.isConnected) {
          const result = await api('methods/cli/job', { job_id: id }); area.querySelector('[data-cli-output]').textContent = result.output;
          if (result.status !== 'running') {
            if (result.status === 'succeeded') await (box.dataset.setupId || result.operation === 'configure' ? reload(area.dataset.protocolService) : connectCli(area));
            else output(resultFor(area), L('客户端操作未完成。请查看提示后重试。'), true);
            return;
          }
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        } finally { controls(false); }
      });
      protocolAction('[data-cli-login], [data-cli-configure]', async (area, button) => { const job = await api('methods/cli/login', { ...protocolBody(area), configure: button.hasAttribute('data-cli-configure') }); area.querySelectorAll('input[type=password]').forEach(input => { input.value = ''; }); await watchCli(area, job.job_id); });
      box.querySelectorAll('[data-cli-job]').forEach(area => watchCli(area, area.dataset.cliJob));
      protocolAction('[data-cli-input], [data-cli-cancel]', async (area, button) => {
        const input = area.querySelector('[data-protocol-field="cli_input"]');
        await api('methods/cli/job', { job_id: area.dataset.cliJob, ...(button.hasAttribute('data-cli-cancel') ? { cancel: true } : { input: input.value }) }); input.value = '';
      });
      connectionAction('[data-mcp-tool-call], [data-mcp-resource-read]', async (row, button) => {
        const body = button.hasAttribute('data-mcp-tool-call') ? { action: 'call', name: row.querySelector('[data-mcp-tool-name]').value.trim(), arguments: JSON.parse(row.querySelector('[data-mcp-tool-arguments]').value) } : { action: 'read', uri: row.querySelector('[data-mcp-resource-uri]').value.trim() };
        output(row.querySelector('[data-connection-result]'), L('操作已完成。'), false, await api(connectionPath(row.dataset.connectionRow) + '/mcp', body));
      });
      const filter = () => {
        const query = search.value.trim().toLocaleLowerCase(); let total = 0;
        box.querySelectorAll('[data-connector-subgroup]').forEach(group => {
          let count = 0; group.querySelectorAll('[data-connector-search]').forEach(card => { card.hidden = Boolean(category.value && category.value !== group.dataset.connectorSubgroup) || !card.dataset.connectorSearch.includes(query); if (!card.hidden) count++; });
          group.hidden = !count; total += count;
        });
        box.querySelector('[data-connectors-no-results]').hidden = total > 0;
      };
      search?.addEventListener('input', filter); category?.addEventListener('change', filter);
      box.querySelector('[data-connectors-reset]')?.addEventListener('click', () => { search.value = ''; category.value = ''; filter(); search.focus(); });
      click('[data-connector-open]', button => {
        lastTrigger = button; showDetail(button.dataset.connectorOpen);
        if (button.dataset.connectorDirect) {
          const panel = panelFor(button.dataset.connectorOpen);
          const start = panel?.querySelector('[data-protocol-start="' + button.dataset.connectorDirect + '"]');
          if (start && !start.disabled) { expand(start); start.click(); }
        }
      });
      click('[data-connectors-back]', button => showDetail(''));
      const slots = box.querySelector('[data-plugin-slots]');
      slots?.querySelectorAll('[data-plugin-slot-account]').forEach(select => select.addEventListener('change', () => {
        const row = select.closest('[data-plugin-slot]'), result = row.querySelector('[data-plugin-slot-result]');
        perform(select, result, async () => {
          await api(slots.dataset.pluginSlots, { ...JSON.parse(row.dataset.pluginSlot), connection_id: select.value || null });
          select.dataset.saved = select.value;
          const reconnect = select.selectedOptions[0]?.hasAttribute('data-needs-reconnect');
          select.querySelectorAll('[data-needs-reconnect]').forEach(option => { option.disabled = option.value !== select.value; });
          output(result, L(reconnect ? '已保存绑定；这个账号需要重新连接确认站点，插件暂时不能请求。' : select.value ? '已保存，插件之后的请求用这个账号。' : 'tenant' in select.dataset ? '已解除，插件不能再请求这个服务。' : '已解除，插件之后的请求不带凭据。'));
        }, () => { select.value = select.dataset.saved || ''; });
      }));
      box.querySelector('[data-connectors-add]')?.addEventListener('click', () => { search.scrollIntoView({ block: 'center', behavior: 'smooth' }); search.focus(); });
      box.addEventListener('keydown', event => { if (!box.dataset.setupId && event.key === 'Escape' && list.hidden && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) { event.preventDefault(); showDetail(''); } });
      const params = page.address().searchParams;
      const errorCode = params.get('connection_error');
      const connected = params.get('connected');
      const id = box.dataset.openConnector || params.get('connector') || connected || '';
      const notice = recalled(noticeKey);
      showDetail(id, false);
      click('[data-setup-cancel]', button => perform(button, box.querySelector('[data-connector-feedback]'), async () => { await api('authorizations/' + box.dataset.setupId, undefined, 'DELETE'); await reload(id); }));
      if (errorCode) {
        output(box.querySelector('[data-connectors-error]'), L(errorCode === 'cancelled' ? '授权已取消。已有连接不受影响，可以选择服务重新登录。' : '授权未完成。请检查应用的回调地址、权限和授权是否过期，然后重新登录。'), true);
      }
      if (notice && panelFor(notice.service)) { const feedback = panelFor(notice.service).querySelector('[data-connector-feedback]'); output(feedback, (box.dataset.setupId ? feedback.textContent + ' ' : '') + notice.message); remember(noticeKey, null); }
      if (connected && panelFor(connected)) output(panelFor(connected).querySelector('[data-connector-feedback]'), L('官方授权已完成。请回到原来的应用窗口继续，或在这里设置使用范围。'));
      box.querySelectorAll('[data-connector-next-link]').forEach(link => {
        const project = params.get('project') || /^\\/projects\\/([^/]+)/.exec(location.pathname)?.[1];
        const plugin = link.dataset.connectorNextLink; const next = new URL(link.getAttribute('href'), location.origin);
        if (project && plugin) { next.pathname = '/projects/' + encodeURIComponent(project) + '/'; next.searchParams.set('openPlugin', plugin); link.textContent = L(plugin === 'feed' ? '打开 Feed，添加来源' : plugin === 'images' ? '打开 Images' : '打开 Coding'); }
        else if (project && next.pathname.startsWith('/settings/')) next.searchParams.set('project', project);
        if (params.get('desktop')) next.searchParams.set('desktop', params.get('desktop'));
        link.href = next.pathname + next.search;
      });
      const preparedWait = box.querySelector('[data-pending-setup]');
      if (preparedWait) { watchConnection(preparedWait, undefined, null, Number(preparedWait.dataset.setupExpires), preparedWait.dataset.pendingSetup); return; }
      const pending = recalled(stateKey);
      if (pending?.authorizationId && pending.expires > Date.now() && !connected && !errorCode) {
        const area = panelFor(pending.service)?.querySelector('[data-protocol="' + pending.method + '"]');
        if (area) { showDetail(pending.service, false); expand(area); watchConnection(area, pending.id, pending.url || null, pending.expires, pending.authorizationId); }
      } else if (pending) remember(stateKey, null);
    };
    globalThis.molisWorkBindConnectorsSettings = bind;
    bind(document);
  })();
`;
