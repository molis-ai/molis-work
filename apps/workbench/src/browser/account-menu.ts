import type { AccountIdentity } from '../account-identity.js';

const uiText = globalThis.t;

export function requiredElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error('Missing account element: ' + selector);
  return element;
}
function createAccountToast() {
  const toast = document.createElement('div');
  toast.className = 'mw-toast mw-account-toast'; toast.hidden = true;
  toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite');
  document.body.append(toast);
  let toastTimer: ReturnType<typeof setTimeout> | undefined, pendingToast = false;
  const showToast = () => {
    if (!pendingToast || document.hidden) return;
    clearTimeout(toastTimer); toast.textContent = uiText.text("workbench.personal-account.signed-in"); pendingToast = false; toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; toast.textContent = ''; }, 3000);
  };
  document.addEventListener('visibilitychange', showToast);
  addEventListener('focus', showToast);
  try { pendingToast = sessionStorage.getItem('molis-work-account-toast') === 'workbench.personal-account.signed-in'; sessionStorage.removeItem('molis-work-account-toast'); showToast(); } catch { /* Storage may be unavailable; a toast is presentation only. */ }
}
function createAccountMenu() {
  const style = document.createElement('style');
  style.textContent = '.mw-account-popover{position:fixed;z-index:10000;width:264px;max-width:calc(100vw - 24px);box-sizing:border-box;padding:8px;border:0;border-radius:12px;background:var(--popover);color:var(--ink);box-shadow:var(--lift-2);font:13px/1.5 var(--font)}.mw-account-popover[hidden]{display:none}.mw-account-popover :is(button,.mw-account-sync){display:flex;align-items:center;width:100%;box-sizing:border-box;min-height:40px;padding:8px 10px;border:0;border-radius:6px;background:transparent;color:inherit;text-decoration:none;font:inherit;cursor:pointer;text-align:left}.mw-account-popover .mw-account-sync[hidden]{display:none}.mw-account-popover .mw-account-sync{gap:6px;font-size:12px;color:var(--muted)}.mw-account-popover .mw-account-sync:is([data-sync-phase=conflict],[data-sync-phase=failed]){color:var(--red)}.mw-account-popover :is(button,.mw-account-sync):hover{background:var(--nav-hover)}.mw-account-popover :is(button,.mw-account-sync):focus-visible{outline:var(--focus-stroke);outline-offset:-2px}@media (pointer:coarse),(max-width:760px){.mw-account-popover :is(button,.mw-account-sync){min-height:44px}}.mw-account-popover button:disabled{opacity:.5;cursor:wait}.mw-account-summary{padding:8px 10px 12px;margin-bottom:4px;border-bottom:1px solid var(--line)}.mw-account-summary strong,.mw-account-summary small{display:block;overflow-wrap:anywhere}.mw-account-summary small{color:var(--muted);font-size:12px}.mw-account-feedback{margin:8px 10px;font-size:12px;overflow-wrap:anywhere}.mw-account-feedback:empty{display:none}.mw-account-feedback[role=alert]{color:var(--red)}.project-directory-topbar [data-account-link]{max-width:240px;gap:8px}.project-directory-topbar [data-personal-name]{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.project-directory-topbar [data-personal-status]{color:var(--muted);font-size:12px;white-space:nowrap}';
  document.head.append(style);
  style.textContent += '.mw-account-toast{position:fixed;z-index:10001;inset-inline:0;bottom:28px;margin-inline:auto;pointer-events:none}';
  createAccountToast();
  style.textContent += '@media(max-width:480px){.project-directory-topbar [data-personal-status]{display:none}.project-directory-topbar [data-account-link]{flex-shrink:0;max-width:120px}.project-directory-topbar .brand{white-space:nowrap}}';
  const menu = document.createElement('div');
  menu.className = 'mw-account-popover'; menu.hidden = true; menu.id = 'mw-account-menu';
  menu.setAttribute('role', 'region'); menu.setAttribute('aria-label', uiText.text("workbench.account-menu.account"));
  menu.innerHTML = '<div class="mw-account-summary"><strong data-menu-name></strong><small data-menu-email></small></div><a class="mw-account-sync" data-sync-indicator hidden><span data-sync-indicator-label></span></a><button type="button" data-personal-action="login"></button><button type="button" data-personal-action="switch"></button><button type="button" data-personal-action="logout"></button><button type="button" data-unified-account-link><span data-unified-account-name></span></button><p class="mw-account-feedback" role="status"></p><p class="mw-account-feedback" role="alert"></p>';
  for (const [action, label] of [['login', 'workbench.account.sign-in-register'], ['switch', 'workbench.account.switch-account'], ['logout', 'workbench.account.sign-out']]) {
    requiredElement(menu, '[data-personal-action=' + action + ']').textContent = uiText.text(label);
  }
  // The menu's sync row says what the dot on the avatar says, in words, and goes to the details (sync-indicator.ts paints it).
  // Its address is set here, not in the markup: the settings page lists its own /settings links, and this is not one of them.
  const syncRow = requiredElement(menu, '.mw-account-sync'), syncDot = document.querySelector<HTMLElement>('[data-sync-indicator]');
  syncRow.setAttribute('href', document.body.dataset.nativeDesktop === 'true' ? '/settings/sync?desktop=1' : '/settings/sync');
  if (syncDot?.dataset.syncPhase) {
    syncRow.hidden = syncDot.hidden; syncRow.dataset.syncPhase = syncDot.dataset.syncPhase; syncRow.title = syncDot.title;
    requiredElement(syncRow, '[data-sync-indicator-label]').textContent = syncDot.querySelector('[data-sync-indicator-label]')?.textContent ?? '';
  }
  // The Molis account (its own dialog, account.ts) was in the project's menu; the foot's account bar is where it is reached now.
  requiredElement(menu, '[data-unified-account-name]').textContent = uiText.text("workbench.account-menu.molis-account");
  document.body.append(menu);
  const notice = document.createElement('div');
  notice.className = 'mw-account-popover'; notice.dataset.accountTransitionNotice = ''; notice.hidden = true;
  notice.style.cssText = 'inset-inline:0;bottom:28px;margin-inline:auto'; notice.setAttribute('role', 'status');
  notice.innerHTML = '<p data-account-transition-message></p><button type="button" data-personal-action="cancel"></button>';
  requiredElement(notice, '[data-account-transition-message]').textContent = uiText.text("workbench.account-menu.switching-accounts-please-wait");
  requiredElement(notice, 'button').textContent = uiText.text("common.control.cancel"); document.body.append(notice);
  const paintStatic = (hasIdentity: boolean, preparing: boolean) => {
    menu.setAttribute('aria-label', uiText.text("workbench.account-menu.account"));
    requiredElement(menu, '[data-personal-action=login]').textContent = uiText.text('workbench.account.sign-in-register');
    requiredElement(menu, '[data-personal-action=switch]').textContent = uiText.text('workbench.account.switch-account');
    requiredElement(menu, '[data-personal-action=logout]').textContent = uiText.text('workbench.account.sign-out');
    if (!hasIdentity) requiredElement(menu, '[data-unified-account-name]').textContent = uiText.text("workbench.account-menu.molis-account");
    if (!preparing) requiredElement(notice, '[data-account-transition-message]').textContent = uiText.text("workbench.account-menu.switching-accounts-please-wait");
    requiredElement(notice, 'button').textContent = uiText.text("common.control.cancel");
  };
  paintStatic(false, false);
  return { menu, notice, paintStatic };
}
interface AccountMenuState {
  identity: AccountIdentity | null;
  space: string; configured: boolean; loaded: boolean; busy: boolean; preparing: boolean;
}

/** Account presentation and keyboard/focus behavior; the account owner supplies its current state on every use. */
export function createAccountMenuController(state: () => AccountMenuState, refresh: () => void) {
  const links = [...document.querySelectorAll<HTMLElement>('[data-account-link]')];
  const {menu,notice,paintStatic} = createAccountMenu();
  let trigger: HTMLElement | null = null, showingLoading = false;
  const feedback = (text: string, error = false) => {
    if (!error) showingLoading = false;
    requiredElement(menu, '[role="' + (error ? 'alert' : 'status') + '"]').textContent = text;
    if (state().preparing && error && text) requiredElement(notice, '[data-account-transition-message]').textContent = text;
  };
  const close = (focus = false) => {
    menu.hidden = true; links.forEach(a => a.setAttribute('aria-expanded', 'false'));
    // Choosing the account row closes its parent details; that hidden row cannot receive focus on Escape.
    if (focus) (trigger?.closest('details:not([open])')?.querySelector<HTMLElement>(':scope > summary') || trigger)?.focus();
  };
  const paint = () => {
    const {identity,space,busy,configured} = state();
    const name = identity?.displayName || identity?.email || uiText.text("workbench.account-menu.not-signed");
    document.querySelectorAll('[data-personal-name]').forEach(el => { el.textContent = name; el.setAttribute('translate', identity ? 'no' : 'yes'); });
    document.querySelectorAll('[data-personal-status]').forEach(el => { el.textContent = uiText.text(space === 'account' ? "workbench.account-menu.personal-space" : "workbench.account-menu.local-space"); });
    document.querySelectorAll('[data-account-compact-label]').forEach(el => { el.textContent = uiText.text(identity ? "workbench.account-menu.account" : "workbench.account-menu.sign"); });
    links.forEach(a => { a.title = identity ? uiText.text("workbench.account-menu.manage-identity", { name }) : uiText.text("workbench.account-menu.sign-sign-up-molis-ai"); a.setAttribute('aria-label', a.title); });
    const menuName = requiredElement(menu,'[data-menu-name]'); menuName.textContent = name; menuName.translate = !identity;
    requiredElement(menu,'[data-menu-email]').textContent = identity?.email || uiText.text("workbench.account-menu.sign-manage-molis-account");
    requiredElement(menu,'[data-personal-action=login]').hidden = !!identity;
    requiredElement(menu,'[data-personal-action=switch]').hidden = !identity;
    requiredElement(menu,'[data-personal-action=logout]').hidden = !identity;
    // Explicit hidden override because menu buttons use display:flex.
    menu.querySelectorAll<HTMLButtonElement>('[data-personal-action]').forEach(b => { b.style.display = b.hidden ? 'none' : ''; b.disabled = busy || !configured; });
  };
  links.forEach(link => {
    link.setAttribute('aria-controls', menu.id); link.setAttribute('aria-expanded', 'false');
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (!menu.hidden && trigger === link) { close(); return; }
      trigger = link; paint(); menu.hidden = false; link.setAttribute('aria-expanded', 'true');
      const rect = link.getBoundingClientRect();
      menu.style.left = Math.max(12, Math.min(rect.left, innerWidth - menu.offsetWidth - 12)) + 'px';
      menu.style.top = Math.max(12, rect.top > innerHeight / 2 ? rect.top - menu.offsetHeight - 8 : Math.min(rect.bottom + 8, innerHeight - menu.offsetHeight - 12)) + 'px';
      if (!state().loaded) { feedback(uiText.text("workbench.account-menu.reading-account-status")); showingLoading = true; }
      [...menu.querySelectorAll<HTMLButtonElement>('button:not([hidden])')].find(button => button.getClientRects().length)?.focus(); refresh();
    });
  });
  // The Molis account opens its own dialog (account.ts): the menu steps aside and returns focus to its trigger so closing the dialog lands there.
  requiredElement(menu, '[data-unified-account-link]').addEventListener('click', () => close(true));
  // Sync details open in the SPA settings cover without reloading: close the menu so it does not float over the cover.
  requiredElement(menu, '.mw-account-sync').addEventListener('click', () => close());
  document.addEventListener('pointerdown', e => { const target = e.target; if (target instanceof Node && !menu.contains(target) && !links.some(a => a.contains(target))) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { e.preventDefault(); close(true); } });
  document.addEventListener('molis-work:place-changed', () => close());
  document.addEventListener('molis-work:language-changed', () => {
    const current = state();
    paintStatic(Boolean(current.identity), current.preparing);
    paint();
    if (showingLoading) feedback(uiText.text("workbench.account-menu.reading-account-status"));
  });
  addEventListener('molis:surface-interaction', () => close());
  addEventListener('blur', () => { if (!menu.hidden) close(); });
  addEventListener('resize', () => close());
  return {menu,notice,paint,feedback,clearLoading: () => { if (showingLoading) feedback(''); },
    setBusy(value: boolean) { document.querySelectorAll<HTMLButtonElement>('[data-personal-action]').forEach(button => { button.disabled = value && button.dataset.personalAction !== 'cancel'; }); },
  };
}
