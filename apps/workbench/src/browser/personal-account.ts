/** Browser-only account and space controls. No credentials are stored in this page. */
import { createSyncConsent } from './sync-consent.js';
import { accountFrameCohort } from './account-frame-cohort.js';
import { accountTransition } from './account-transition.js';
import { accountCohort, type AccountPreparation } from './account-cohort.js';
import { accountRegistration } from './account-registration.js';
import { createAccountMenuController, requiredElement } from './account-menu.js';
import { pageSessionScope } from '../account-cache-key.js';
import type { AccountIdentity } from '../account-identity.js';
import type { UiRequestPorts } from '@molis-ai/molis-work-ui-host';
interface AccountStatus {
  identity: AccountIdentity | null; space?: string; configured: boolean; viewScope?: string;
  browserSessionTicket?: string; loginCompleted?: boolean; offline?: boolean;
  pageBinding?: string; accountGeneration?: number; accountChanged?: boolean; ready?: boolean; switching?: boolean; error?: string; loginPending?: boolean;
  preparation?: AccountPreparation | null;
}
interface AccountActionResult { loginUrl?: string; loginAttempt?: string; signedOut?: boolean }
import type {} from "@molis-ai/molis-work-plugin-sdk";
declare global {
  var molisWorkOpenExternalUrl: ((url: string) => Promise<void>) | undefined;
  interface Window { molisWorkUiTransport?: UiRequestPorts['intercept'] }
}

function errorMessage(error: unknown, fallback: string): string { return error instanceof Error ? error.message || fallback : fallback; }
function guardAccountRequests(transition: ReturnType<typeof accountTransition>, L: (text: string) => string): void {
  const originalTransport = window.molisWorkUiTransport;
  window.molisWorkUiTransport = (input, options) => {
    if (transition.preparing && !new URL(input, location.href).pathname.startsWith('/api/personal/')) return Promise.reject(new Error(L('账号正在切换，请稍候')));
    return originalTransport?.(input, options) ?? null;
  };
}

// Install account storage isolation before the following business scripts read browser caches.
const transition = accountTransition();

function observeAccountNavigation(cohort: Pick<ReturnType<typeof accountCohort>, 'close'>, channel: BroadcastChannel | null, stopTimer: () => void, destination: string, onError: (error: unknown) => void): void {
  addEventListener('pagehide', event => { stopTimer(); channel?.close(); cohort.close(); if (event.persisted) void transition.invalidate(false).catch(onError); }); // Ordinary navigation retains the scope owner's closing actions.
  addEventListener('pageshow', event => {
    if (!event.persisted) return;
    void molisWorkRequest<AccountStatus>('/api/personal/status').then(async state => {
      const scope = pageSessionScope(document.querySelector<HTMLMetaElement>('meta[name="molis-work-page-session"]')?.content);
      if (!state.identity || !scope || state.viewScope !== scope) await transition.invalidate();
      location.replace(destination);
    }).catch(onError);
  });
}

async function prepareAccountChange(notice: HTMLElement, L: (text: string) => string, signal?: AbortSignal): Promise<boolean> {
  requiredElement(notice, '[data-account-transition-message]').textContent = L('账号正在切换，请稍候');
  await transition.prepare();
  signal?.throwIfAborted();
  const unsaved = [...document.querySelectorAll('[data-assistant-context]')].some(node => {
    try { return JSON.parse(node.getAttribute('data-assistant-context') ?? '{}').unsaved === true; } catch { return false; }
  });
  const drafts = window.parent === window && await transition.hasDrafts();
  signal?.throwIfAborted();
  const tasks = [...document.querySelectorAll('[data-background-tasks-count]')].some(node => Number(node.textContent) > 0);
  if ((unsaved || drafts || tasks) && !confirm(L('还有未保存的修改或运行中的任务。取消可返回原页面保存；继续将放弃未保存的修改并停止任务。继续切换账号？'))) { transition.resume(); return false; }
  return true;
}

const init = () => {
  const desktop = new URLSearchParams(location.search).get('desktop') === '1' || document.body.dataset.nativeDesktop === 'true';
  const query = new URLSearchParams({returnTo: location.pathname + location.search + location.hash});
  if (desktop) query.set('desktop', '1');
  let loginWindow: Window | null = null;
  const closeLoginWindow = () => { loginWindow?.close(); loginWindow = null; };
  let identity: AccountIdentity | null = null;
  let space = 'local', configured = true, loaded = false, busy = false, checking = false, attempt = '', loginNonce = '', expires = 0, revocationPending = false, refreshPending = false;
  const L = globalThis.L || (text => text);
  const menuController = createAccountMenuController(L, () => ({identity,space,configured,loaded,busy,preparing:transition.preparing}), () => void update());
  const {menu,notice,paint,feedback} = menuController;
  const reportRequestFailure = (error: unknown) => feedback(errorMessage(error, '请求失败，请重试。'), true);
  const syncConsent=createSyncConsent();
  const registration = accountRegistration(L, () => update(true));
  let generation: number | undefined;
  const destination = desktop ? '/?desktop=1' : '/';
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('molis-work-account') : null;
  guardAccountRequests(transition, L);
  let leaving = false;
  const leaveOldPage = () => {
    const cleared = transition.invalidate();
    void cleared.catch(reportRequestFailure);
    if (busy || attempt) { revocationPending = true; return; }
    if (leaving) return;
    leaving = true; closeLoginWindow();
    void cleared.then(() => {
      for (const node of document.body.children) if (node instanceof HTMLElement) { node.inert = true; node.hidden = true; }
      location.replace(destination);
    }, () => { leaving = false; });
  };
  const prepare = (signal?: AbortSignal) => prepareAccountChange(notice, L, signal);
  const cohort = accountFrameCohort(prepare) ?? accountCohort(prepare, leaveOldPage, error => feedback(errorMessage(error, L('草稿保存未完成，请返回原页面重试')), true));
  const cancelAttempt = async () => {
    const previous = attempt;
    if (previous) await molisWorkRequest('/api/personal/login-cancel?' + new URLSearchParams({attempt:previous}), {method:'POST',body:{}});
    await cohort.cancel();
    if (attempt === previous) attempt = '';
  };
  query.set('page',cohort.pageId);
  const setBusy = (value: boolean) => { busy = value; menuController.setBusy(value); };
  document.addEventListener('click', async event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-personal-action]') : null;
    if (!button) return;
    const action = button.dataset.personalAction ?? "";
    if (action === 'cancel') { try { await cancelAttempt(); } catch(error) { reportRequestFailure(error); } return; }
    if (busy) return;
    if (!['login', 'switch', 'logout', 'retry'].includes(action)) return;
    setBusy(true); feedback(''); feedback('', true);
    try {
      if (action === 'retry') {
        await molisWorkRequest('/api/personal/space?kind=personal',{method:'POST',body:{},fallback:L('无法切换空间')});
        location.assign(destination); return;
      }
      if (action === 'login' || action === 'switch') {
        closeLoginWindow();
        if (!globalThis.molisWorkOpenExternalUrl) {
          // Open synchronously during the click, before awaiting the transaction.
          loginWindow = window.open('about:blank', '_blank');
          if (!loginWindow) throw new Error('浏览器阻止了登录窗口，请允许本站打开新标签页后重试。');
          loginWindow.opener = null;
        }
        if (attempt) await cancelAttempt();
      }
      if(action === 'logout' && attempt){await cancelAttempt();closeLoginWindow();}
      const preparation = identity ? await cohort.begin(action === 'logout' ? 'logout' : 'switch') : undefined;
      if (preparation === null || preparation === undefined && !await prepare()) { closeLoginWindow(); return; }
      if (preparation) query.set('preparation',preparation);if(action==='logout')query.set('scope',button.dataset.accountLogoutScope??'CURRENT_LOGIN');
      // Serialize cookie replacement with anonymous entry in every tab of this browser.
      const send = () => molisWorkRequest<AccountActionResult>('/api/personal/' + action + '?' + query,{method:'POST',body:{}});
      const result = await (action === 'logout' && navigator.locks ? navigator.locks.request('molis-account-entry', send) : send());
      if (result.loginUrl) {
        attempt = result.loginAttempt ?? ''; loginNonce = new URL(result.loginUrl,location.href).searchParams.get('accountLogin') ?? ''; expires = Date.now() + 600000;
        if (globalThis.molisWorkOpenExternalUrl) {
          await globalThis.molisWorkOpenExternalUrl(result.loginUrl);
        } else { if (!loginWindow) throw new Error("登录窗口已关闭"); loginWindow.location.replace(result.loginUrl); }
        feedback('请在浏览器完成登录，此页面会自动更新。');
      } else if (result.signedOut) {
        channel?.postMessage('changed'); await transition.invalidate();
        revocationPending = false; attempt = ''; closeLoginWindow(); identity = null; paint();
        location.assign(destination); return;
      }
    } catch (error) { await cancelAttempt().catch(() => { /* A revoked account cannot be resumed by this page. */ }); closeLoginWindow(); reportRequestFailure(error); }
    finally { setBusy(false); if (revocationPending) { revocationPending = false; leaveOldPage(); } }
  });
  const update = async (force = false) => {
    if (checking) { if (force) refreshPending = true; return; }
    if (document.hidden && !attempt && !force) return;
    if (attempt && Date.now() > expires) { await cancelAttempt().catch(reportRequestFailure); feedback('登录等待已结束，可重新登录。', true); }
    checking = true;
    try {
      const statusQuery = new URLSearchParams();
      if (cohort.pageId) statusQuery.set('page',cohort.pageId);
      if (desktop) statusQuery.set('desktop','1');
      if (attempt) { statusQuery.set('pending','1'); statusQuery.set('attempt',attempt); }
      const preparationRevision = cohort.revision, statusAttempt = attempt;
      const state = await molisWorkRequest<AccountStatus>('/api/personal/status?' + statusQuery);
      if(statusAttempt !== attempt){refreshPending=true;return;}
      // The Host reports completion only after the selected account environment is ready.
      // Queue feedback before any generation/entry navigation can replace this document.
      if (attempt && state.loginCompleted) {
        try { sessionStorage.setItem('molis-work-account-toast', '登录成功'); } catch { /* The completed login does not depend on a toast. */ }
        attempt = ''; channel?.postMessage('changed'); leaveOldPage(); return;
      }
      if (state.accountChanged && !document.body.hasAttribute('data-account-entry') || loaded && generation !== undefined && generation !== state.accountGeneration) { if (attempt) channel?.postMessage('changed'); leaveOldPage(); return; }
      generation = state.accountGeneration;
      if (attempt && state.loginPending === false && !state.loginCompleted) { await cancelAttempt(); closeLoginWindow(); }
      if (loaded && identity && !state.identity && !state.offline) { leaveOldPage(); return; }
      if (state.error || state.switching || state.ready === false && state.identity) {
        transition.lock(); feedback(state.error || L('账号正在切换，请稍候'), Boolean(state.error));
        registration.failure();
        const note = document.querySelector('[data-account-entry-status]'); if (note) note.textContent = state.error || L('账号正在切换，请稍候');
        const retry = document.querySelector<HTMLButtonElement>('[data-personal-action=retry]'); if (retry) retry.hidden = !state.error;
        return;
      }
      if (desktop && state.browserSessionTicket) {
        const browserState = await molisWorkRequest<AccountStatus>('/api/personal/status?browser=1');
        if (browserState.identity?.userId !== state.identity?.userId || browserState.identity?.applicationId !== state.identity?.applicationId) {
          await molisWorkRequest('/api/personal/native-attach?ticket=' + encodeURIComponent(state.browserSessionTicket),{method:'POST',body:{},fallback:L('无法连接账号空间')});
        }
      }
      if (registration.pending && !state.identity) { leaveOldPage(); return; }
      if (state.identity) {await cohort.connect(state.pageBinding);if (preparationRevision === cohort.revision) cohort.observe(state.preparation);}
      if (document.body.hasAttribute('data-account-entry') && state.identity && state.ready) { location.replace(destination); return; }
      const pageToken = document.querySelector<HTMLMetaElement>('meta[name="molis-work-page-session"]')?.content;
      const changed = (state.identity && state.viewScope && pageToken && state.viewScope !== pageSessionScope(pageToken)) || (loaded && space !== (state.space || 'local'));
      identity = state.identity; space = state.space || 'local'; configured = state.configured; loaded = true; paint();
      if(!changed)void syncConsent.update(space);
      if (changed) {
        await transition.invalidate(); closeLoginWindow(); location.assign(destination); return;
      }
      registration.complete();
      if (requiredElement(menu,'[role=status]').textContent === L('正在读取账号状态…')) feedback('');
      if (attempt && loginWindow?.closed) { await cancelAttempt(); loginWindow = null; feedback('登录窗口已关闭，未完成登录；可以重新尝试。'); }
      if (state.offline) feedback('暂时无法连接账号服务，本地工作不受影响。');
    } catch (error) { registration.failure(); if (!menu.hidden) feedback(errorMessage(error, '暂时无法读取账号状态。'), true); }
    finally { checking = false; if (refreshPending) { refreshPending = false; void update(true); } }
  };
  void update();
  // Initial load, menu opening and focus refresh account state; only an in-progress login needs a polling loop.
  const tick = () => { if (attempt) void update(); };
  let timer = setInterval(tick, 3000);
  addEventListener('focus', () => void update());
  channel?.addEventListener('message', event => {if(attempt && event.data?.login === loginNonce){attempt='';leaveOldPage();return;}void update(true);});
  observeAccountNavigation(cohort, channel, () => clearInterval(timer), destination, reportRequestFailure);
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();

export {};
