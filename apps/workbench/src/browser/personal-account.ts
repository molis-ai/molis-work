/** Browser-only account and space controls. No credentials are stored in this page. */
import { createSyncConsent } from './sync-consent.js';
import { accountFrameCohort } from './account-frame-cohort.js';
import { accountTransition } from './account-transition.js';
import { accountCohort, type AccountPreparation } from './account-cohort.js';
import { accountRegistration } from './account-registration.js';
import { createAccountMenuController, requiredElement } from './account-menu.js';
import type { UiRequestPorts } from '@molis-ai/molis-work-ui-host';
interface AccountIdentity { userId: string; applicationId?: string; displayName?: string; emails?: string[] }
interface AccountStatus {
  identity: AccountIdentity | null; space?: string; configured: boolean; viewScope?: string;
  browserSessionTicket?: string; loginCompleted?: boolean; offline?: boolean;
  pageBinding?: string; accountGeneration?: number; accountChanged?: boolean; ready?: boolean; switching?: boolean; error?: string; loginPending?: boolean;
  preparation?: AccountPreparation | null;
}
interface AccountActionResult { loginUrl?: string; loginAttempt?: string; signedOut?: boolean }
import type {} from "@molis-ai/molis-work-plugin-sdk";

const uiText = globalThis.t;
declare global {
  var molisWorkOpenExternalUrl: ((url: string) => Promise<void>) | undefined;
  interface Window { molisWorkUiTransport?: UiRequestPorts['intercept'] }
}

function errorMessage(error: unknown, fallback: string): string { return error instanceof Error ? error.message || fallback : fallback; }
function guardAccountRequests(transition: ReturnType<typeof accountTransition>): void {
  const originalTransport = window.molisWorkUiTransport;
  window.molisWorkUiTransport = (input, options) => {
    if (transition.preparing && !new URL(input, location.href).pathname.startsWith('/api/personal/')) return Promise.reject(new Error(uiText.text('workbench.personal-account.switching-accounts-please-wait')));
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
      const scope = document.querySelector<HTMLMetaElement>('meta[name="molis-work-page-session"]')?.content.split('.')[1];
      if (!state.identity || !scope || state.viewScope !== scope) await transition.invalidate();
      location.replace(destination);
    }).catch(onError);
  });
}

async function prepareAccountChange(notice: HTMLElement, signal?: AbortSignal): Promise<boolean> {
  requiredElement(notice, '[data-account-transition-message]').textContent = uiText.text('workbench.personal-account.switching-accounts-please-wait');
  await transition.prepare();
  signal?.throwIfAborted();
  const unsaved = [...document.querySelectorAll('[data-assistant-context]')].some(node => {
    try { return JSON.parse(node.getAttribute('data-assistant-context') ?? '{}').unsaved === true; } catch { return false; }
  });
  const drafts = window.parent === window && await transition.hasDrafts();
  signal?.throwIfAborted();
  const tasks = [...document.querySelectorAll('[data-background-tasks-count]')].some(node => Number(node.textContent) > 0);
  if ((unsaved || drafts || tasks) && !confirm(uiText.text('workbench.personal-account.there-unsaved-edits-running-tasks-cancel-return-save'))) { transition.resume(); return false; }
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
  const menuController = createAccountMenuController(() => ({identity,space,configured,loaded,busy,preparing:transition.preparing}), () => void update());
  const {menu,notice,paint,feedback} = menuController;
  const reportRequestFailure = (error: unknown) => feedback(errorMessage(error, uiText.text("workbench.personal-account.request-failed")), true);
  const syncConsent=createSyncConsent();
  const registration = accountRegistration(uiText.text, () => update(true));
  let generation: number | undefined;
  const destination = desktop ? '/?desktop=1' : '/';
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('molis-work-account') : null;
  guardAccountRequests(transition);
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
  const prepare = (signal?: AbortSignal) => prepareAccountChange(notice, signal);
  const cohort = accountFrameCohort(prepare) ?? accountCohort(prepare, leaveOldPage, error => feedback(errorMessage(error, uiText.text('workbench.personal-account.draft-could-not-be-saved-return-page-try')), true));
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
        await molisWorkRequest('/api/personal/space?kind=personal',{method:'POST',body:{},fallback:uiText.text("workbench.personal-account.could-not-switch-space")});
        location.assign(destination); return;
      }
      if (action === 'login' || action === 'switch') {
        closeLoginWindow();
        if (!globalThis.molisWorkOpenExternalUrl) {
          // Open synchronously during the click, before awaiting the transaction.
          loginWindow = window.open('about:blank', '_blank');
          if (!loginWindow) throw new Error(uiText.text("workbench.personal-account.popup-blocked"));
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
        } else { if (!loginWindow) throw new Error(uiText.text("workbench.personal-account.window-closed")); loginWindow.location.replace(result.loginUrl); }
        feedback(uiText.text("workbench.personal-account.finish-signing-in"));
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
    if (attempt && Date.now() > expires) { await cancelAttempt().catch(reportRequestFailure); feedback(uiText.text('workbench.personal-account.login-timeout'), true); }
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
        try { sessionStorage.setItem('molis-work-account-toast', 'workbench.personal-account.signed-in'); } catch { /* The completed login does not depend on a toast. */ }
        attempt = ''; channel?.postMessage('changed'); leaveOldPage(); return;
      }
      if (state.accountChanged && !document.body.hasAttribute('data-account-entry') || loaded && generation !== undefined && generation !== state.accountGeneration) { if (attempt) channel?.postMessage('changed'); leaveOldPage(); return; }
      generation = state.accountGeneration;
      if (attempt && state.loginPending === false && !state.loginCompleted) { await cancelAttempt(); closeLoginWindow(); }
      if (loaded && identity && !state.identity && !state.offline) { leaveOldPage(); return; }
      if (state.error || state.switching || state.ready === false && state.identity) {
        transition.lock(); feedback(state.error || uiText.text("workbench.personal-account.switching-accounts-please-wait"), Boolean(state.error));
        registration.failure();
        const note = document.querySelector('[data-account-entry-status]'); if (note) note.textContent = state.error || uiText.text("workbench.personal-account.switching-accounts-please-wait");
        const retry = document.querySelector<HTMLButtonElement>('[data-personal-action=retry]'); if (retry) retry.hidden = !state.error;
        return;
      }
      if (desktop && state.browserSessionTicket) {
        const browserState = await molisWorkRequest<AccountStatus>('/api/personal/status?browser=1');
        if (browserState.identity?.userId !== state.identity?.userId || browserState.identity?.applicationId !== state.identity?.applicationId) {
          await molisWorkRequest('/api/personal/native-attach?ticket=' + encodeURIComponent(state.browserSessionTicket),{method:'POST',body:{},fallback:uiText.text("workbench.personal-account.could-not-connect-account-space")});
        }
      }
      if (registration.pending && !state.identity) { leaveOldPage(); return; }
      if (state.identity) {await cohort.connect(state.pageBinding);if (preparationRevision === cohort.revision) cohort.observe(state.preparation);}
      if (document.body.hasAttribute('data-account-entry') && state.identity && state.ready) { location.replace(destination); return; }
      const pageToken = document.querySelector<HTMLMetaElement>('meta[name="molis-work-page-session"]')?.content;
      const changed = (state.identity && state.viewScope && pageToken && state.viewScope !== pageToken.split(".")[1]) || (loaded && space !== (state.space || 'local'));
      identity = state.identity; space = state.space || 'local'; configured = state.configured; loaded = true; paint();
      if(!changed)void syncConsent.update(space);
      if (changed) {
        await transition.invalidate(); closeLoginWindow(); location.assign(destination); return;
      }
      registration.complete();
      menuController.clearLoading();
      if (attempt && loginWindow?.closed) { await cancelAttempt(); loginWindow = null; feedback(uiText.text("workbench.personal-account.login-not-finished")); }
      if (state.offline) feedback(uiText.text("workbench.personal-account.account-offline"));
    } catch (error) { registration.failure(); if (!menu.hidden) feedback(errorMessage(error, uiText.text("workbench.personal-account.status-unavailable")), true); }
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
