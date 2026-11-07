import { readFileSync } from "node:fs";
import { createConnectorAuthorizationMonitor } from "./connector-authorization-monitor.js";
import { connectorSwitchLeft } from "./connector-replacement.js";
import { isLoopbackHostname, isLoopbackHttpUrl } from "@molis-ai/molis-work-contracts/platform/loopback";

/** The service-connection parts' own program (src/browser/connections-page.ts → `molisWorkConnectionItems`), bundled when the package builds. */
const CONNECTION_PARTS_SCRIPT = readFileSync(new URL("../../dist/connections-page-client.js", import.meta.url), "utf8").trim();

/**
 * 设置 › 服务连接 (settings-connectors.ts, plan A of §13.1): rows that open in place, a login or a key moving through its steps in
 * the row, the account's facts read when it opens, switching account, the 高级 drafts, and the request page (settings-connector-request.ts).
 */
export const CONNECTORS_SETTINGS_CLIENT_SCRIPT = `
  ${CONNECTION_PARTS_SCRIPT}
  (() => {
    const isLoopbackHostname = ${isLoopbackHostname.toString()};
    const isLoopbackHttpUrl = ${isLoopbackHttpUrl.toString()};
    const createAuthorizationMonitor = ${createConnectorAuthorizationMonitor.toString()};
    const switchLeft = ${connectorSwitchLeft.toString()};
    // \`page\` is the address the connections were opened at: their own page, or the settings section in the workbench.
    const ownPage = { address: () => new URL(location.href), replace: (next) => history.replaceState(null, '', next), own: true };
    const parts = globalThis.molisWorkConnectionItems;
    const bind = (root = document, page = ownPage) => {
      const box = root.matches?.('[data-connectors-settings]') ? root : root.querySelector('[data-connectors-settings]');
      if (!box || box.dataset.connectorsBound === '1') return;
      box.dataset.connectorsBound = '1';
      parts?.mount(box);
      const click = (selector, handler) => box.querySelectorAll(selector).forEach(node => node.addEventListener('click', () => handler(node)));
      const search = box.querySelector('[data-connectors-search]');
      const standalone = () => !page.own || location.pathname.startsWith('/settings/') || location.pathname === '/capabilities/connections';
      const byData = (selector, key, value) => [...box.querySelectorAll(selector)].find(node => node.dataset[key] === value);
      const panelFor = id => byData('[data-connector-detail]', 'connectorDetail', id);
      const itemFor = id => byData('[data-connector-item]', 'connectorItem', id);
      const rowFor = id => byData('[data-connection-row]', 'connectionRow', id);
      const stateKey = 'molis-connectors-pending';
      const noticeKey = 'molis-connectors-notice';
      const draftKey = service => 'molis-connectors-draft:' + service;
      const remember = (key, value) => { try { value ? sessionStorage.setItem(key, JSON.stringify(value)) : sessionStorage.removeItem(key); } catch {} };
      const recalled = key => { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } };
      // Sentences the page puts side by side: Chinese runs them on, other languages leave a space; the dictionary's words carry none.
      const glue = (...parts) => parts.filter(Boolean).join(/^zh/i.test(document.documentElement.lang || 'zh') ? '' : ' ');
      const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Small helpers the page uses often: bring a part into view, the service a node is in, and a new element.
      const reveal = node => node?.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
      const itemOf = node => node?.closest('[data-connector-item]'), detailOf = node => node?.closest('[data-connector-detail]');
      const make = tag => document.createElement(tag);
      let waiting = null;
      const stopWaiting = () => { if (waiting) { waiting.stopped = true; waiting.stop?.(); clearTimeout(waiting.timer); } waiting = null; remember(stateKey, null); };
      const busy = (node, on) => { if (node) { node.disabled = on; node.setAttribute('aria-busy', String(on)); } };
      const output = (node, message, error = false, details) => {
        if (!node) return;
        node.hidden = false; node.dataset.tone = error ? 'error' : 'success';
        node.setAttribute('role', error ? 'alert' : 'status');
        const text = make('p'); text.textContent = message; node.replaceChildren(text);
        if (details !== undefined) {
          const fold = make('details'); const summary = make('summary'); summary.textContent = L('技术详情');
          const pre = make('pre'); pre.className = 'settings-connection-output'; pre.textContent = typeof details === 'string' ? details : JSON.stringify(details, null, 2);
          fold.append(summary, pre); node.append(fold);
        }
      };
      const fail = (node, error) => { if (!node) return; output(node, '', true); molisWorkRequest.show(node.querySelector('p'), error, L('操作未完成，请重试。')); };
      const api = (path, body, method = 'POST', timeout = 45000) => molisWorkRequest('/api/settings/connectors/' + path, {method, body, signal: AbortSignal.timeout(timeout), fallback: L('服务暂时无法连接，请重试。')});
      const template = name => box.querySelector('[data-connector-template="' + name + '"]')?.content.firstElementChild?.cloneNode(true);
      const pageUrl = id => {
        const next = new URL('/capabilities/connections', location.origin);
        for (const key of ['desktop', 'project']) { const value = page.address().searchParams.get(key); if (value) next.searchParams.set(key, value); }
        if (id) next.searchParams.set('connector', id);
        if (box.dataset.setupId) next.searchParams.set('setup', box.dataset.setupId);
        return next.pathname + next.search;
      };
      // Who uses an account: read once when its service opens, shared with the offer after a new login (N42～N56); a switch reads again.
      const usagesRead = new Map();
      const usagesOf = (id, fresh = false) => {
        if (fresh || !usagesRead.has(id)) usagesRead.set(id, api('connections/' + encodeURIComponent(id) + '/usages', undefined, 'GET').catch(error => { usagesRead.delete(id); throw error; }));
        return usagesRead.get(id);
      };
      const loadUsages = item => item.querySelectorAll('[data-connection-usages]:not([data-loaded])').forEach(async node => {
        node.dataset.loaded = '1';
        try {
          const read = await usagesOf(node.dataset.connectionUsages);
          const titles = (read.usages || []).map(usage => usage.title).filter(Boolean), issues = read.issues || [];
          node.textContent = titles.length > 2 ? L('{list} 等 {count} 处', { list: titles.slice(0, 2).join(L('、')), count: titles.length })
            : titles.length ? titles.join(L('、')) : issues.length ? L('没能全部查到') : L('还没有地方在用');
          node.title = [...titles, ...issues].join('\\n');
        } catch { node.textContent = L('暂时读不到'); delete node.dataset.loaded; }
      });
      // After a switch (done, failed or timed out: the service may have moved some uses anyway), every account of the service reads again.
      const rereadUsages = item => { usagesRead.clear(); if (!item) return; item.querySelectorAll('[data-connection-usages]').forEach(node => delete node.dataset.loaded); loadUsages(item); };
      const setOpen = (item, open) => { item.dataset.open = String(open); item.querySelector('[data-connection-toggle]')?.setAttribute('aria-expanded', String(open)); if (open) loadUsages(item); };
      const openService = (id, focus = true) => {
        const item = itemFor(id);
        if (!item) return null;
        setOpen(item, true);
        if (standalone()) page.replace(new URL(pageUrl(id), location.origin));
        if (focus) requestAnimationFrame(() => { item.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }); item.querySelector('[data-connection-toggle]')?.focus({ preventScroll: true }); });
        return item;
      };
      // The parts' program has toggled the row by now; an opened service reads its accounts' uses and becomes the address.
      box.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target : null, item = target?.closest('[data-connector-item], [data-connector-orphan]');
        if (!item || !(target.closest('[data-connection-toggle]') || target.closest('.settings-connection-row')?.parentElement === item)) return;
        if (item.dataset.open !== 'true') return;
        // A connection whose service left the catalog is no service the page can open as the address, but its uses are read all the same.
        loadUsages(item); if (item.dataset.connectorItem && standalone()) page.replace(new URL(pageUrl(item.dataset.connectorItem), location.origin));
      });
      // The row's state while a connection runs in it, put back as it was if the person stops or the service refuses.
      const stateOf = item => item?.querySelector(':scope > .settings-connection-row > [data-connector-state]');
      const showState = (item, name) => {
        const now = stateOf(item), next = template(name);
        if (!now || !next) return;
        next.setAttribute('data-connector-state', ''); next.molisBefore = now.molisBefore || now; now.replaceWith(next);
      };
      const restoreState = item => { const now = stateOf(item); if (now?.molisBefore) now.replaceWith(now.molisBefore); };
      // The steps of a login or a key, drawn once from the page's template just above the place its results are said.
      const step = (area, kind, at, state) => {
        let node = area.querySelector('[data-connection-progress]');
        if (!node) { node = template('progress-' + kind); if (!node) return; (area.querySelector('[data-protocol-result]') || area.lastElementChild).before(node); }
        parts?.progress(node, { at, state });
      };
      const checkTime = at => { const date = new Date(at), two = value => String(value).padStart(2, '0'); return two(date.getMonth() + 1) + '-' + two(date.getDate()) + ' ' + two(date.getHours()) + ':' + two(date.getMinutes()); };
      const recheck = node => {
        const at = Date.parse(node.dataset.connectionRetryAt || ''), button = node.closest('[data-connection-row]')?.querySelector('[data-connection-check]');
        if (!button || !(at > Date.now())) return;
        setTimeout(() => { if (box.isConnected && !button.disabled) button.click(); }, Math.min(at - Date.now(), 3600000) + 500);
      };
      const reach = (id, kind, at) => {
        const node = rowFor(id)?.querySelector('[data-connection-state]'), mark = template('reach-' + kind);
        if (!node || !mark) return;
        const label = mark.lastElementChild; label.textContent = label.textContent.replace('{time}', checkTime(at));
        node.replaceChildren(mark);
        if (kind === 'limited') { node.dataset.connectionRetryAt = at; recheck(node); } else delete node.dataset.connectionRetryAt;
      };
      const reload = async (id, notice) => {
        stopWaiting();
        if (notice) { remember(noticeKey, { service: id, ...notice }); remember(draftKey(id), null); }
        const html = await molisWorkRequest(pageUrl(id), {as:'text', headers:{Accept:'text/html'}, signal:AbortSignal.timeout(45000), fallback:L('连接已更新，但页面未能刷新。请重新打开服务连接。')});
        if (!box.isConnected) return;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const next = doc.querySelector('[data-connectors-settings]');
        if (!next) throw new Error(L('页面未能刷新，请重新打开服务连接。'));
        next.dataset.openConnector = id;
        box.replaceWith(next); bind(next, page);
      };
      const completed = (result, service, message, replaces) => reload(service, result.awaiting_intent ? undefined : { id: result.connection?.connection_id || result.connectionId || result.connection_id, message, ...(replaces ? { replaces } : {}) });
      const resultFor = area => area.querySelector('[data-protocol-result]');
      const perform = async (button, result, run, undo) => { busy(button, true); try { await run(); } catch(error) { undo?.(); fail(result, error); } finally { busy(button, false); } };
      const action = (selector, scope, result, run) => click(selector, button => { const area = button.closest(scope); return perform(button, area.querySelector(result), () => run(area, button)); });
      const protocolAction = (selector, run) => action(selector, '[data-protocol]', '[data-protocol-result]', run);
      const connectionAction = (selector, run) => action(selector, '[data-connection-scope]', '[data-connection-result]', run);
      const connectionPath = id => 'connections/' + encodeURIComponent(id);
      const serviceName = panel => (itemOf(panel)?.querySelector('.settings-connection-row__identity strong') || panel.querySelector('h2'))?.textContent.trim() || panel.dataset.connectorDetail;
      const nameFor = panel => panel.querySelector('[data-connector-new-name]')?.value.trim() || serviceName(panel);
      // A name the page put in for logging in again goes once that login is no longer the one being started, unless the person changed it.
      const unname = scope => scope.querySelectorAll('[data-connector-new-name][data-prefilled]').forEach(input => { if (input.value === input.dataset.prefilled) input.value = ''; delete input.dataset.prefilled; });
      const protocolBody = area => {
        const body = { service_id: area.dataset.protocolService, display_name: nameFor(detailOf(area)), settings: {} };
        if (area.dataset.connectionId || box.dataset.setupConnection) body.connection_id = area.dataset.connectionId || box.dataset.setupConnection;
        if (box.dataset.setupId) body.setup_id = box.dataset.setupId;
        area.querySelectorAll('[data-protocol-field]').forEach(input => {
          const key = input.dataset.protocolField;
          if (key.startsWith('setting:')) body.settings[key.slice(8)] = input.value.trim(); else body[key] = input.value.trim();
        });
        return body;
      };
      const validate = area => [...area.querySelectorAll('input[required]')].every(input => input.checkValidity() || (input.reportValidity(), false));
      const expand = node => { for (let p = node; p && p !== box; p = p.parentElement) { if (p.tagName === 'DETAILS') p.open = true; if (p.matches('[data-connector-item]')) setOpen(p, true); } };
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
        output(result, L('正在等你在浏览器里登录。登录、点同意后会自动回到这里；关掉这个页面也没关系，回来时接着走。'));
        const actions = make('div'); actions.className = 'settings-connector-actions';
        if (url) { const link = make('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = L('再打开一次登录页'); link.className = 'mw-btn mw-btn--secondary'; actions.append(link); }
        const check = make('button'); check.type = 'button'; check.className = 'mw-btn mw-btn--secondary'; check.textContent = L('我已授权，检查结果');
        check.addEventListener('click', () => { clearTimeout(session.timer); poll(); });
        const cancel = make('button'); cancel.type = 'button'; cancel.className = 'mw-btn mw-btn--secondary'; cancel.textContent = L('取消这次接入');
        cancel.addEventListener('click', async () => { try { if(session.authorizationId) await api('authorizations/' + session.authorizationId, undefined, 'DELETE'); stopWaiting(); await reload(area.dataset.protocolService); } catch(error) { fail(result, error); } });
        actions.append(check, cancel); result.append(actions);
      };
      const watchConnection = (area, id, url, expires = Date.now() + 600000, authorizationId) => {
        stopWaiting();
        const service = area.dataset.protocolService, replaces = area.dataset.replaces, item = itemOf(area);
        remember(stateKey, { service, method: area.dataset.protocol, id, expires, authorizationId, url, ...(replaces ? { replaces } : {}) });
        const start = area.querySelector('[data-protocol-start]'); busy(start, true);
        step(area, 'login', 0, 'running'); showState(item, 'running');
        const finish = () => { stopWaiting(); busy(start, false); };
        const notice = { id, message: L('登录好了，下面是这个账号现在能做什么。'), ...(replaces ? { replaces } : {}) };
        const refreshFailed = error => {
          finish();
          const result = resultFor(area);
          output(result, L('账号已授权，但页面刷新失败。请重新加载连接信息，无需再次授权。'), true);
          if(error){const detail=make('p');molisWorkRequest.show(detail,error);result.append(detail);}
          const retry = make('button'); retry.type = 'button'; retry.className = 'mw-btn mw-btn--secondary'; retry.textContent = L('重新加载连接信息');
          retry.addEventListener('click', async () => { busy(retry, true); try { await reload(service, notice); } catch(error) { refreshFailed(error); } });
          result.append(retry);
        };
        const monitor = createAuthorizationMonitor({
          read: async () => {
            try { const state = await api('authorizations/' + encodeURIComponent(authorizationId), undefined, 'GET'); if (state.commit_held) output(box.querySelector('[data-connector-feedback]'), L('正在核对你刚提出的新要求，接入暂不提交。请回到原对话继续。')); return state.status; } catch (error) { if (error.status === 404) return 'expired'; throw error; }
          },
          connected: async () => { busy(start, false); step(area, 'login', 1, 'running'); await reload(service, notice); },
          ended: status => {
            finish(); restoreState(item); step(area, 'login', 0, status === 'cancelled' ? 'cancelled' : 'failed');
            if (box.dataset.setupId) { reload(service).catch(refreshFailed); return; }
            output(resultFor(area), L(status === 'cancelled' ? '没有连上：登录页关了，或在服务那边点了取消。这里什么都没改，已有连接照常可用。' : status === 'expired' ? '等待登录超时了。这里什么都没改，可以再连一次。' : '登录没有完成。这里什么都没改；如果再试还不行，请检查服务的权限设置。'), status !== 'cancelled');
          },
          refreshFailed, alive: () => box.isConnected, expires, now: Date.now,
          schedule: (run, delay) => setTimeout(run, delay), unschedule: timer => clearTimeout(timer),
        });
        waiting = { authorizationId, stop: () => { monitor.stop(); busy(start, false); } };
        waitControls(area, url, waiting, monitor.check);
      };
      const deviceFlow = async (area, body, popup, name) => {
        const started = await api('methods/device/start', body);
        watchConnection(area, undefined, started.verification_uri, Date.now() + started.expires_in * 1000, started.authorization_id);
        const code = make('p'); code.textContent = L('在 {name} 输入设备码：{code}', { name, code: started.user_code }); resultFor(area).prepend(code);
        await openAuthorization(started.verification_uri, popup);
      };
      click('[data-protocol-start]', async button => {
        const area = button.closest('[data-protocol]'); const body = protocolBody(area), item = itemOf(area);
        if (!area.dataset.connectionId && !validate(area)) return;
        const popup = reserveBrowser(); busy(button, true);
        output(resultFor(area), L('正在准备官方授权…'));
        try {
          let authorizationFlow;
          if (body.connection_id) {
            const existing = await api(connectionPath(body.connection_id), undefined, 'GET');
            authorizationFlow = existing.authorization_flow;
            if (!detailOf(area).querySelector('[data-connector-new-name]')?.value.trim()) body.display_name = existing.connection.display_name;
          }
          if ('deviceLogin' in button.dataset && !body.client_id && authorizationFlow !== 'oauth') { await deviceFlow(area, body, popup, button.dataset.deviceLogin); return; }
          const payload = await api('methods/' + button.dataset.protocolStart + '/start', body);
          const url = payload.authorization_url;
          const id = payload.connection_id || payload.connection?.connection_id;
          area.querySelectorAll('input[type=password]').forEach(input => { input.value = ''; });
          if (url) {
            const opened = await openAuthorization(url, popup);
            watchConnection(area, id, url, undefined, payload.authorization_id);
            if (!opened) resultFor(area).querySelector('p').textContent = L('浏览器拦截了新窗口。点「再打开一次登录页」继续登录。');
            const manual = area.querySelector('[data-oauth-return]');
            if (manual) manual.hidden = !(payload.manual_callback || body.redirect_uri);
          } else { popup?.close(); await completed(payload, body.service_id, L('工具已连接，可以查看可用工具。'), area.dataset.replaces); }
        } catch (error) { popup?.close(); restoreState(item); if (area.querySelector('[data-connection-progress]')) step(area, 'login', 0, 'failed'); fail(resultFor(area), error); }
        finally { if (!waiting) busy(button, false); }
      });
      protocolAction('[data-oauth-complete]', async area => {
        const result = await api('methods/' + area.dataset.protocol + '/complete', protocolBody(area));
        await completed(result, area.dataset.protocolService, L('授权已完成。'), area.dataset.replaces);
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
        if (rows) { const ul = make('ul'); for (const row of rows.slice(0, 5)) { const li = make('li'); li.textContent = row.title || row.name || row.subject || L('已读取内容'); ul.append(li); } node.prepend(ul); }
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
        const scope = button.closest('[data-connection-scope]'), id = scope.dataset.connectionScope, checking = button.hasAttribute('data-connection-check'); busy(button, true);
        const result = scope.querySelector('[data-connection-result]'); output(result, L('正在检查账号与权限…'));
        try { summarize(result, await api(connectionPath(id) + (checking ? '/verify' : '/preview'), {})); if (checking) reach(id, 'connected', new Date().toISOString()); }
        catch (error) {
          fail(result, error);
          const retry = error?.code === 'connector.check.rate_limited' ? error.body?.details?.retry_at : undefined;
          if (checking) reach(id, retry ? 'limited' : 'failed', retry || new Date().toISOString());
        }
        finally { busy(button, false); }
      });
      const credentialValue = form => {
        const parts = [...form.querySelectorAll('[data-credential-part]')].map(input => input.value.trim());
        return parts.length ? parts.join(form.dataset.credentialSeparator) : form.querySelector('[data-connector-token]').value.trim();
      };
      const pluginKeys = new Set(['model-api', 'image-api', 'typesafe', 'mcp-bearer']);
      // A key the host checks before it saves it (§13.1, §13.6 ④d): one the check did not pass is not saved and stays in its field. A
      // refused key is said under that field, with the old key still in use when it was a replacement; a rate limit is the service's,
      // and the same key is asked again by itself at the time the service gave, unless the person has typed since.
      const unsavedCodes = ['connector.read.refused', 'connector.read.unreachable', 'connector.read.answered', 'connector.check.rate_limited'];
      const keyInput = form => [...form.querySelectorAll('input[type=password]')].at(-1) || form.querySelector('input');
      const clearUnsaved = form => {
        clearTimeout(form.molisRetry);
        form.querySelectorAll('[data-connector-key-error]').forEach(node => node.remove());
        form.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
      };
      const unsaved = (form, result, error, replacing) => {
        if (!unsavedCodes.includes(error?.code)) return false;
        const name = form.closest('[data-connection-item]')?.querySelector('.settings-connection-row__identity strong')?.textContent || L('这个服务');
        const kept = replacing ? L('新密钥没有换上，旧密钥照常在用。') : L('还没保存，填的还在。');
        if (error.code === 'connector.read.refused') {
          const input = keyInput(form), note = make('p');
          note.className = 'mw-field__error'; note.setAttribute('role', 'alert'); note.dataset.connectorKeyError = '';
          note.textContent = replacing ? L('{name} 拒绝了新密钥。旧密钥照常在用；新的没保存，填的还在。', { name })
            : L('{name} 拒绝了这把密钥，可能过期了或少复制了字符。还没保存，换一把再试。', { name });
          input?.setAttribute('aria-invalid', 'true');
          (form.matches('.settings-connection-inline') ? form : input?.closest('label') || form).append(note);
          output(result, kept, true);
          setTimeout(() => input?.focus()); // after the form is unlocked
          return true;
        }
        if (error.code === 'connector.check.rate_limited') {
          const at = Date.parse(error.body?.details?.retry_at || '');
          const time = at > Date.now() ? new Date(at).toLocaleTimeString(document.documentElement.lang || undefined, { hour: '2-digit', minute: '2-digit' }) : '';
          output(result, glue(time ? L('{name} 说请求太多，这是服务那边的原因，不是你填错了。{time} 自动再查一次。', { name, time })
            : L('{name} 说请求太多，这是服务那边的原因，不是你填错了。稍后再试。', { name }), kept), true);
          if (time) form.molisRetry = setTimeout(() => { if (form.isConnected && !form.querySelector('button[type=submit]')?.disabled) form.requestSubmit(); }, Math.min(at - Date.now(), 3600000) + 500);
          return true;
        }
        output(result, glue(error.code === 'connector.read.unreachable' ? L('暂时连不上 {name}，所以没有检查成。稍后再试。', { name })
          : L('{name} 没有确认这把密钥。检查有没有填对，再试一次。', { name }), kept), true);
        return true;
      };
      box.querySelectorAll('[data-connector-auth], [data-connection-replace]').forEach(form => form.addEventListener('input', () => clearTimeout(form.molisRetry)));
      box.querySelectorAll('[data-connector-auth]').forEach(form => form.addEventListener('submit', event => {
        event.preventDefault(); const service = form.dataset.connectorAuth, result = resultFor(form), item = itemOf(form);
        clearUnsaved(form); step(form, 'key', 1, 'running'); showState(item, 'running');
        return perform(form.querySelector('button[type=submit]'), result, async () => {
          const token = credentialValue(form);
          output(result, L(pluginKeys.has(service) ? '正在保存这把密钥…' : '正在检查这把密钥，通过了才保存…'));
          const target = form.dataset.savedConnection || box.dataset.setupConnection;
          let saved;
          try {
            saved = target
              ? await api(connectionPath(target), { token, setup_id: box.dataset.setupId }, 'PATCH')
              : await api('connections', { service_id: service, display_name: nameFor(detailOf(form)), token, setup_id: box.dataset.setupId });
          } catch (error) {
            if (!unsaved(form, result, error, Boolean(target))) throw error;
            restoreState(item); step(form, 'key', 1, error.code === 'connector.check.rate_limited' ? 'hold' : 'failed'); return;
          }
          form.querySelectorAll('input').forEach(input => { input.value = ''; });
          if (saved.awaiting_intent) { await reload(service); return; }
          form.dataset.savedConnection = saved.connection.connection_id;
          step(form, 'key', 2, 'done');
          await reload(service, { id: saved.connection.connection_id, message: L(saved.verification ? '密钥检查通过，已经存好。'
            : pluginKeys.has(service) ? '密钥已保存。请在使用它的功能中完成配置和验证。' : '密钥已保存。请在用它的地方检查。') });
        }, () => { restoreState(item); step(form, 'key', 0, 'failed'); });
      }));
      box.querySelectorAll('[data-connection-replace], [data-connection-rename]').forEach(form => form.addEventListener('submit', event => {
        event.preventDefault(); const scope = form.closest('[data-connection-scope]'), replacing = form.hasAttribute('data-connection-replace');
        const result = scope.querySelector('[data-connection-result]');
        if (replacing) clearUnsaved(form);
        return perform(form.querySelector('button'), result, async () => {
          let saved;
          try { saved = await api(connectionPath(scope.dataset.connectionScope), replacing ? { token: credentialValue(form) } : { display_name: form.querySelector('input').value.trim() }, 'PATCH'); }
          catch (error) { if (replacing && unsaved(form, result, error, true)) return; throw error; }
          await reload(scope.dataset.connectionService, { message: !replacing ? L('连接名称已更新。') : L(saved.verification ? '新密钥检查通过，已经换上。' : '新密钥换上了。请在用它的地方检查。') });
        });
      }));
      connectionAction('[data-connection-disconnect], [data-connection-manage]', async (scope, button) => {
        const action = button.dataset.connectionManage;
        const result = await api(connectionPath(scope.dataset.connectionScope) + (action ? '/manage' : ''), action ? { action, expected_revision: scope.dataset.connectionRevision } : undefined, action ? 'POST' : 'DELETE');
        await reload(scope.dataset.connectionService, { message: result.cleanup?.message || result.verification?.reason || L(action ? '连接状态已更新' : '此账号已断开。其他账号不受影响；使用此账号的来源需要重新选择连接。') });
      });
      // After a new MCP login or another account added to switch to (§13.2, ASC-59), the new connection offers to take over the old one's
      // uses; the pair only decides what is offered, the switch and removal check both connections themselves.
      const switchReasons = {
        'connector.plugin_slots.installation_missing': L('用它的插件已不在'), 'connector.plugin_slots.usage_missing': L('这里已经不用原来那条了'),
        'connector.plugin_slots.project_required': L('请到它所在的项目里，在插件的连接设置中改选这条'), 'connector.switch.target_unavailable': L('新连接现在不可用，请先检查它'),
      };
      // What a switch did, against the uses read before it. Places the read could not check (its issues) and plugins that failed the
      // switch as a whole without a use read for them are said too: then it is never "nothing to switch" nor "all moved" (ASC-77).
      const switchNotes = (read, report) => {
        const providers = new Set((read.usages || []).map(usage => usage.source?.provider_id));
        const unseen = (report?.failed || []).filter(entry => !providers.has(entry.provider_id)).length;
        return [...(read.issues || []).map(issue => L('没能查：{issue}', { issue })), ...(unseen ? [L('{count} 个用它的插件没换成，那里可能还用着原来那条。', { count: unseen })] : [])];
      };
      const switchOutcome = (outcome, total, notes = []) => {
        const lines = [...outcome.left.map(entry => L('{title}：{reason}', { title: entry.title, reason: switchReasons[entry.code] || L('还不能一步换，请到用它的地方改选这条') })), ...notes];
        if (outcome.left.length) return [L('换过去 {switched} 处，{count} 处没换：', { switched: outcome.switched, count: outcome.left.length }), lines];
        if (notes.length) return [L('换过去 {count} 处，没能全部查到或换到：', { count: outcome.switched }), lines];
        return [total || outcome.switched ? L('{count} 处都换过去了。', { count: outcome.switched }) : L('没有查到用它的地方，不用换。'), []];
      };
      const listInto = (node, lines) => { if (!lines.length) return; const list = make('ul'); for (const line of lines) { const item = make('li'); item.textContent = line; list.append(item); } node.append(list); };
      // Only for another connection of this service made the same way; for MCP, at the same known address.
      const offerReplacement = (panel, newId, oldId) => {
        const rows = [...panel.querySelectorAll('[data-connection-row]')], find = id => rows.find(node => node.dataset.connectionRow === id);
        const row = find(newId), old = find(oldId), service = panel.dataset.connectorDetail, mcp = old?.dataset.connectionAuth === 'mcp';
        if (!row || !old || row === old || row.dataset.connectionService !== service || old.dataset.connectionService !== service || row.dataset.connectionAuth !== old.dataset.connectionAuth) return false;
        if (mcp ? !row.dataset.connectionEndpoint || row.dataset.connectionEndpoint !== old.dataset.connectionEndpoint || !old.querySelector('[data-connection-method="mcp"]') : !old.querySelector('[data-connection-switch]')) return false;
        const result = row.querySelector('[data-connection-result]'), name = old.dataset.connectionName || '';
        // Coding's MCP settings do not report their usages yet (BL-1050), so what the page counts is never all there is.
        const coding = mcp ? [L('Coding 的 MCP 设置这里还查不到；如果那里选了「{name}」，请到那里改选这条。', { name })] : [];
        const link = () => mcp ? panel.querySelector('[data-connector-next-link][href^="/settings/coding-settings"]')?.cloneNode(true) : null;
        let shown, left = 0;
        const controls = nodes => {
          shown = nodes; const actions = make('div'); actions.className = 'settings-connector-actions';
          actions.append(...nodes.filter(Boolean)); result.append(actions); result.focus();
        };
        // The message, the usages it lists, then notes of their own (what could not be read, and what the page cannot see), then the choices.
        const show = (message, lines, nodes, error, notes = []) => {
          output(result, message, error); listInto(result, lines);
          for (const note of [...notes, ...coding]) { const text = make('p'); text.textContent = note; result.append(text); }
          controls(nodes);
        };
        // A step that fails says why and leaves the same choices, so the person can try again or keep both connections.
        const run = async (node, step) => { busy(node, true); try { await step(); } catch (error) { fail(result, error); controls(shown); } finally { busy(node, false); } };
        const button = (label, tone, step) => {
          const node = make('button'); node.type = 'button'; node.className = 'mw-btn mw-btn--' + tone; node.textContent = label;
          node.addEventListener('click', () => run(node, () => step(node))); return node;
        };
        const keep = button(L('留着'), 'secondary', async () => { output(result, L('原来那条「{name}」留着，两条连接都能用；不再用时可以在它那一行移除。', { name })); result.focus(); });
        const confirm = button(L('确认移除'), 'danger', async () => {
          await api(connectionPath(oldId) + '/manage', { action: 'remove', expected_revision: old.dataset.connectionRevision });
          await reload(service, { message: L('已移除「{name}」。', { name }) });
        });
        // Removing cuts off whatever still uses the old connection, and the page cannot see all of it, so it asks once first. Cancel puts back
        // what was there (its words, tone and role), so a switch still to do is not lost.
        const remove = button(L('移除旧连接'), 'danger-outline', async () => {
          const back = [...result.childNodes], before = shown, tone = result.dataset.tone, role = result.getAttribute('role');
          const cancel = button(L('取消'), 'secondary', async () => { result.replaceChildren(...back); result.dataset.tone = tone; result.setAttribute('role', role); shown = before; result.focus(); });
          show(glue(L('移除原来那条「{name}」后，还在用它的地方会断开。', { name }), left ? L('已知 {count} 处没换过来。', { count: left }) : ''), [], [cancel, confirm]);
        });
        const intro = L(mcp ? '这条是替「{name}」重新登录的。' : '这是替「{name}」再加的账号。', { name });
        result.tabIndex = -1; result.dataset.connectionReplacement = oldId; shown = [remove, keep];
        output(result, L('正在查看哪里用到「{name}」…', { name }));
        run(null, async () => {
          const read = await usagesOf(oldId), usages = read.usages || [], item = itemOf(panel);
          const issues = (read.issues || []).map(issue => L('没能查：{issue}', { issue }));
          left = usages.length; result.scrollIntoView({ block: 'center' });
          if (!left) return show(glue(intro, L('能查的地方里，没有查到用它的。')), [], [remove, keep, link()], false, issues);
          const move = button(L('把用到「{name}」的 {count} 个地方换到这条', { name, count: left }), 'primary', async node => {
            let report;
            try { report = await api(connectionPath(newId) + '/switch', { from_connection_id: oldId }); } finally { rereadUsages(item); }
            const outcome = switchLeft(report, usages);
            node.remove(); left = outcome.left.length;
            const [message, lines] = switchOutcome(outcome, usages.length, switchNotes(read, report));
            show(message, lines, [remove, keep, link()], lines.length > 0 && !outcome.switched);
          });
          show(glue(intro, L('能查的地方里有 {count} 处用它，可以一步换到这条。', { count: left })), usages.slice(0, 5).map(usage => usage.title), [move, remove, keep, link()], false, issues);
        });
        return true;
      };
      click('[data-connection-reauthorize]', button => {
        const panel = detailOf(button); const method = button.dataset.connectionMethod;
        const area = panel.querySelector('[data-protocol="' + method + '"]');
        if (!area) return;
        // MCP names no stable account, so logging in again is a new connection; the old one stays until the person moves its uses (ASC-59).
        expand(area); unname(panel); if (method === 'oauth') { area.dataset.connectionId = button.dataset.connectionReauthorize; delete area.dataset.replaces; } else {
          delete area.dataset.connectionId; area.dataset.replaces = button.dataset.connectionReauthorize;
          // The same server as before: only a login at the old connection's address is offered as its replacement.
          const old = button.closest('[data-connection-row]'), endpoint = old.dataset.connectionEndpoint, field = area.querySelector('[data-protocol-field="endpoint"]');
          if (endpoint && field) field.value = endpoint;
          // A name told apart from the old one's where only names show (Coding's MCP settings), within a name's 100 characters.
          const named = panel.querySelector('[data-connector-new-name]');
          if (named && !named.value.trim()) {
            const label = L('{name}（重新登录 {date}）', { name: old.dataset.connectionName || '', date: new Date().toLocaleDateString(document.documentElement.lang || undefined, { month: 'short', day: 'numeric' }) });
            expand(named); named.value = named.dataset.prefilled = [...label].slice(0, 100).join('');
          }
        }
        output(resultFor(area), L(method === 'oauth' ? '请用原来的账号登录；要连另一个账号，用「换账号」。' : '重新登录会新建一条连接，原来的这条不动。登录回来后，可以把用到原来那条的地方一步换过去。'));
        reveal(area); area.querySelector('[data-protocol-start]')?.focus({ preventScroll: true });
      });
      // 换账号 (§13.2): pick another connected account, or log in one more; the account switched from stays and keeps working.
      click('[data-connection-switch]', button => {
        const scope = button.closest('[data-connection-row]'), chooser = scope.querySelector('[data-connection-switch-panel]');
        if (!chooser) return;
        chooser.hidden = false; button.setAttribute('aria-expanded', 'true'); showState(itemOf(scope), 'switching');
        (chooser.querySelector('input:checked') || chooser.querySelector('input'))?.focus();
      });
      // The choice closes and the row is as it was; focus goes back to 换账号 on this account, not to a hidden button.
      const closeSwitch = (scope, focus) => {
        scope.querySelector('[data-connection-switch-panel]').hidden = true; restoreState(itemOf(scope));
        const opener = scope.querySelector('[data-connection-switch]'); opener?.setAttribute('aria-expanded', 'false'); if (focus) opener?.focus();
      };
      click('[data-connection-switch-cancel]', button => closeSwitch(button.closest('[data-connection-row]'), true));
      click('[data-connection-switch-go]', button => {
        const scope = button.closest('[data-connection-row]'), chooser = scope.querySelector('[data-connection-switch-panel]'), item = itemOf(scope);
        const from = scope.dataset.connectionScope, to = chooser.querySelector('input:checked')?.value, result = scope.querySelector('[data-connection-result]');
        if (to === 'add') {
          const panel = detailOf(scope), area = panel.querySelector('[data-connector-add] [data-protocol="oauth"]') || panel.querySelector('[data-protocol="oauth"]');
          if (!area) return;
          closeSwitch(scope); expand(area); unname(panel); delete area.dataset.connectionId; area.dataset.replaces = from;
          reveal(area); area.querySelector('[data-protocol-start]')?.click();
          return;
        }
        if (!to) return;
        return perform(button, result, async () => {
          const read = await usagesOf(from, true), usages = read.usages || [];
          const report = await api(connectionPath(to) + '/switch', { from_connection_id: from }), outcome = switchLeft(report, usages);
          closeSwitch(scope, true);
          const [message, lines] = switchOutcome(outcome, usages.length, switchNotes(read, report));
          output(result, glue(message, lines.length ? '' : L('原来的账号留着，照常可用。')), lines.length > 0 && !outcome.switched); listInto(result, lines);
          rereadUsages(item);
        }, () => rereadUsages(item));
      });
      click('[data-connector-add] > summary', summary => {
        unname(detailOf(summary) || box); summary.parentElement.querySelectorAll('[data-protocol]').forEach(area => { delete area.dataset.connectionId; delete area.dataset.replaces; });
      });
      // From the row (还不能一键连接, 换密钥) into the service's 高级, where the other ways and the key are.
      const advancedOf = node => detailOf(node)?.querySelector('[data-connector-advanced]');
      click('[data-connector-advanced-open]', button => {
        const advanced = advancedOf(button); if (!advanced) return;
        advanced.open = true; const first = advanced.querySelector('[data-method-choice] > summary') || advanced.querySelector('summary');
        reveal(first); first?.focus({ preventScroll: true });
      });
      click('[data-connection-replace-open]', button => {
        const form = byData('[data-connection-replace]', 'connectionReplace', button.dataset.connectionReplaceOpen); if (!form) return;
        expand(form); reveal(form); form.querySelector('input')?.focus({ preventScroll: true });
      });
      // 高级's unsaved changes stay as a draft in this window (§13.1 ②): names, addresses and settings, never a key or a secret.
      const draftable = advanced => [...advanced.querySelectorAll('[data-protocol-field], [data-connector-new-name]')].filter(input => input.type !== 'password' && input.type !== 'hidden');
      const draftId = input => (input.closest('[data-method-choice]')?.dataset.methodChoice || 'name') + ':' + (input.dataset.protocolField || 'name');
      // An address keeps only where it points: some services put a key in its query, fragment or user part, and those never stay.
      const bare = value => { try { const url = new URL(value); if (!/^https?:$/.test(url.protocol) || !(url.search || url.hash || url.username || url.password)) return value; url.search = url.hash = url.username = url.password = ''; return url.href; } catch { return value; } };
      const initial = input => input.tagName === 'SELECT' ? [...input.options].find(option => option.defaultSelected)?.value ?? input.options[0]?.value : input.defaultValue;
      box.querySelectorAll('[data-connector-advanced]').forEach(advanced => {
        const service = detailOf(advanced)?.dataset.connectorDetail; if (!service) return;
        const save = () => { const changed = Object.fromEntries(draftable(advanced).filter(input => input.value !== initial(input) && !input.dataset.prefilled).map(input => [draftId(input), bare(input.value)])); remember(draftKey(service), Object.keys(changed).length ? changed : null); };
        advanced.addEventListener('input', save); advanced.addEventListener('change', save);
        const draft = recalled(draftKey(service));
        if (!draft || box.dataset.setupId) return;
        const note = template('draft'); if (!note) return;
        note.querySelector('[data-draft-resume]').addEventListener('click', () => {
          let first = null;
          for (const input of draftable(advanced)) if (Object.hasOwn(draft, draftId(input))) { input.value = draft[draftId(input)]; expand(input); first ||= input; }
          note.remove(); advanced.open = true; first?.focus();
        });
        note.querySelector('[data-draft-drop]').addEventListener('click', () => { remember(draftKey(service), null); note.remove(); advanced.querySelector('summary')?.focus(); });
        advanced.before(note);
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
      connectionAction('[data-mcp-tool-call], [data-mcp-resource-read]', async (scope, button) => {
        const body = button.hasAttribute('data-mcp-tool-call') ? { action: 'call', name: scope.querySelector('[data-mcp-tool-name]').value.trim(), arguments: JSON.parse(scope.querySelector('[data-mcp-tool-arguments]').value) } : { action: 'read', uri: scope.querySelector('[data-mcp-resource-uri]').value.trim() };
        output(scope.querySelector('[data-connection-result]'), L('操作已完成。'), false, await api(connectionPath(scope.dataset.connectionScope) + '/mcp', body));
      });
      const filter = () => {
        const query = search.value.trim().toLocaleLowerCase(); let total = 0;
        box.querySelectorAll('[data-connector-subgroup]').forEach(group => {
          let count = 0; group.querySelectorAll('[data-connector-search]').forEach(item => { item.hidden = !item.dataset.connectorSearch.includes(query); if (!item.hidden) count++; });
          group.hidden = !count; total += count;
        });
        box.querySelector('[data-connectors-no-results]').hidden = total > 0;
      };
      search?.addEventListener('input', filter);
      box.querySelector('[data-connectors-reset]')?.addEventListener('click', () => { search.value = ''; filter(); search.focus(); });
      click('[data-connector-open]', button => openService(button.dataset.connectorOpen));
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
      box.querySelectorAll('[data-connection-retry-at]').forEach(recheck);
      const params = page.address().searchParams;
      const errorCode = params.get('connection_error');
      const connected = params.get('connected');
      const id = box.dataset.openConnector || params.get('connector') || connected || '';
      const notice = recalled(noticeKey);
      const opened = id ? openService(id, !notice) : null;
      click('[data-setup-cancel]', button => perform(button, box.querySelector('[data-connector-feedback]'), async () => { await api('authorizations/' + box.dataset.setupId, undefined, 'DELETE'); await reload(id); }));
      if (errorCode) {
        output(box.querySelector('[data-connectors-error]'), L(errorCode === 'cancelled' ? '授权已取消。已有连接不受影响，可以选择服务重新登录。' : '授权未完成。请检查应用的回调地址、权限和授权是否过期，然后重新登录。'), true);
      }
      if (notice && panelFor(notice.service)) {
        const panel = panelFor(notice.service), feedback = panel.querySelector('[data-connector-feedback]'), offered = notice.replaces && !box.dataset.setupId && offerReplacement(panel, notice.id, notice.replaces);
        openService(notice.service, false);
        output(feedback, box.dataset.setupId ? glue(feedback.textContent, notice.message) : glue(notice.message, offered ? L('下面可以把用到原来那条的地方换到新连接。') : '')); remember(noticeKey, null);
        if (!offered) requestAnimationFrame(() => { reveal(feedback); feedback.focus?.({ preventScroll: true }); });
      } else if (opened && box.dataset.openConnector) requestAnimationFrame(() => opened.querySelector('[data-connection-toggle]')?.focus({ preventScroll: true }));
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
        if (area) { openService(pending.service, false); expand(area); if (typeof pending.replaces === 'string') area.dataset.replaces = pending.replaces; watchConnection(area, pending.id, pending.url || null, pending.expires, pending.authorizationId); }
      } else if (pending) remember(stateKey, null);
    };
    globalThis.molisWorkBindConnectorsSettings = bind;
    bind(document);
  })();
`;
