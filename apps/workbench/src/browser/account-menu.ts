<<<<<<< HEAD
import type { AccountIdentity } from '../account-identity.js';
=======
const uiText = globalThis.t;
>>>>>>> origin/main

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
  style.textContent = '.mw-account-popover{position:fixed;z-index:10000;width:264px;max-width:calc(100vw - 24px);box-sizing:border-box;padding:8px;border:1px solid var(--line,#dedee3);border-radius:12px;background:var(--panel,#fff);color:var(--ink,#202023);box-shadow:0 8px 28px #0002;font:14px/1.5 system-ui}.mw-account-popover[hidden]{display:none}.mw-account-popover button{display:flex;align-items:center;width:100%;box-sizing:border-box;min-height:40px;padding:8px 10px;border:0;border-radius:6px;background:transparent;color:inherit;text-decoration:none;font:inherit;cursor:pointer;text-align:left}.mw-account-popover button:hover{background:var(--nav-hover,#f1f1f3)}.mw-account-popover button:focus-visible{outline:2px solid var(--accent,#5068b7);outline-offset:-2px}.mw-account-popover button:disabled{opacity:.5;cursor:wait}.mw-account-summary{padding:8px 10px 12px;margin-bottom:4px;border-bottom:1px solid var(--line,#dedee3)}.mw-account-summary strong,.mw-account-summary small{display:block;overflow-wrap:anywhere}.mw-account-summary small{color:var(--muted,#62626b);font-size:12px}.mw-account-feedback{margin:8px 10px;font-size:12px;overflow-wrap:anywhere}.mw-account-feedback:empty{display:none}.mw-account-feedback[role=alert]{color:#b42318}.project-directory-topbar [data-account-link]{max-width:240px;gap:8px}.project-directory-topbar [data-personal-name]{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.project-directory-topbar [data-personal-status]{color:var(--muted);font-size:12px;white-space:nowrap}';
  document.head.append(style);
  style.textContent += '.mw-account-toast{position:fixed;z-index:10001;inset-inline:0;bottom:28px;margin-inline:auto;pointer-events:none}';
  createAccountToast();
  style.textContent += '[data-account-compact-label]{display:none}body.immersive-workbench .plugin-rail .personal-account{height:50px;flex-direction:column;gap:2px}body.immersive-workbench .plugin-rail [data-account-compact-label]{display:block;font-size:10px;line-height:14px;color:var(--muted)}@media(max-width:480px){.project-directory-topbar [data-personal-status]{display:none}.project-directory-topbar [data-account-link]{flex-shrink:0;max-width:120px}.project-directory-topbar .brand{white-space:nowrap}}';
  const menu = document.createElement('div');
  menu.className = 'mw-account-popover'; menu.hidden = true; menu.id = 'mw-account-menu';
  menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', uiText.text("workbench.account-menu.account"));
  menu.innerHTML = '<div class="mw-account-summary"><strong data-menu-name></strong><small data-menu-email></small></div><button type="button" data-personal-action="login"></button><button type="button" data-personal-action="switch"></button><button type="button" data-personal-action="logout"></button><p class="mw-account-feedback" role="status"></p><p class="mw-account-feedback" role="alert"></p>';
  for (const [action, label] of [['login', 'workbench.account.sign-in-register'], ['switch', 'workbench.account.switch-account'], ['logout', 'workbench.account.sign-out']]) {
    requiredElement(menu, '[data-personal-action=' + action + ']').textContent = uiText.text(label);
  }
  document.body.append(menu);
  const notice = document.createElement('div');
  notice.className = 'mw-account-popover'; notice.dataset.accountTransitionNotice = ''; notice.hidden = true;
  notice.style.cssText = 'inset-inline:0;bottom:28px;margin-inline:auto'; notice.setAttribute('role', 'status');
  notice.innerHTML = '<p data-account-transition-message></p><button type="button" data-personal-action="cancel"></button>';
  requiredElement(notice, '[data-account-transition-message]').textContent = uiText.text("workbench.account-menu.switching-accounts-please-wait");
  requiredElement(notice, 'button').textContent = uiText.text("common.control.cancel"); document.body.append(notice);
  return { menu, notice };
}
interface AccountMenuState {
  identity: AccountIdentity | null;
  space: string; configured: boolean; loaded: boolean; busy: boolean; preparing: boolean;
}

/** Account presentation and keyboard/focus behavior; the account owner supplies its current state on every use. */
export function createAccountMenuController(state: () => AccountMenuState, refresh: () => void) {
  const links = [...document.querySelectorAll<HTMLElement>('[data-account-link]')];
  const {menu,notice} = createAccountMenu();
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
<<<<<<< HEAD
    const name = identity?.displayName || L('未登录');
    document.querySelectorAll('[data-personal-name]').forEach(el => { el.textContent = name; });
    document.querySelectorAll('[data-personal-status]').forEach(el => { el.textContent = L(space === 'account' ? '个人空间' : '本地空间'); });
    document.querySelectorAll('[data-account-compact-label]').forEach(el => { el.textContent = L(identity ? '账号管理' : '登录'); });
    links.forEach(a => { a.title = identity ? name + ' · ' + L('切换账号') + ' / ' + L('退出登录') : L('登录 / 注册 molis AI'); a.setAttribute('aria-label', a.title); });
    requiredElement(menu,'[data-menu-name]').textContent = name;
    requiredElement(menu,'[data-menu-email]').textContent = identity?.email || L('登录后可管理你的 molis 账号');
=======
    const name = identity?.displayName || identity?.emails?.[0] || uiText.text("workbench.account-menu.not-signed");
    document.querySelectorAll('[data-personal-name]').forEach(el => { el.textContent = name; el.setAttribute('translate', identity ? 'no' : 'yes'); });
    document.querySelectorAll('[data-personal-status]').forEach(el => { el.textContent = uiText.text(space === 'account' ? "workbench.account-menu.personal-space" : "workbench.account-menu.local-space"); });
    document.querySelectorAll('[data-account-compact-label]').forEach(el => { el.textContent = uiText.text(identity ? "workbench.account-menu.account" : "workbench.account-menu.sign"); });
    links.forEach(a => { a.title = identity ? uiText.text("workbench.account-menu.manage-identity", { name }) : uiText.text("workbench.account-menu.sign-sign-up-molis-ai"); a.setAttribute('aria-label', a.title); });
    const menuName = requiredElement(menu,'[data-menu-name]'); menuName.textContent = name; menuName.translate = !identity;
    requiredElement(menu,'[data-menu-email]').textContent = identity?.emails?.join(' · ') || uiText.text("workbench.account-menu.sign-manage-molis-account");
>>>>>>> origin/main
    requiredElement(menu,'[data-personal-action=login]').hidden = !!identity;
    requiredElement(menu,'[data-personal-action=switch]').hidden = !identity;
    requiredElement(menu,'[data-personal-action=logout]').hidden = !identity;
    // Explicit hidden override because menu buttons use display:flex.
    menu.querySelectorAll<HTMLButtonElement>('[data-personal-action]').forEach(b => { b.style.display = b.hidden ? 'none' : ''; b.disabled = busy || !configured; });
  };
  links.forEach(link => {
    link.setAttribute('aria-haspopup', 'dialog'); link.setAttribute('aria-controls', menu.id); link.setAttribute('aria-expanded', 'false');
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
  document.addEventListener('pointerdown', e => { const target = e.target; if (target instanceof Node && !menu.contains(target) && !links.some(a => a.contains(target))) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { e.preventDefault(); close(true); } });
  addEventListener('resize', () => close());
  return {menu,notice,paint,feedback,clearLoading: () => { if (showingLoading) feedback(''); },
    setBusy(value: boolean) { document.querySelectorAll<HTMLButtonElement>('[data-personal-action]').forEach(button => { button.disabled = value && button.dataset.personalAction !== 'cancel'; }); },
  };
}
