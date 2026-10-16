/** Shared account entry/actions for project picker, workbench rail and account page. */
export const PERSONAL_ACCOUNT_CLIENT_SCRIPT = `
  (() => {
    const init = () => {
      const links = [...document.querySelectorAll('[data-account-link]')];
      if (!links.length) return;
      const desktop = new URLSearchParams(location.search).get('desktop') === '1' || document.body.dataset.nativeDesktop === 'true';
      const returnTo = location.pathname + location.search + location.hash;
      const query = new URLSearchParams({returnTo});
      if (desktop) query.set('desktop', '1');
      let loginWindow = null;
      let identity = null, space = 'local', configured = true, loaded = false, busy = false, checking = false, attempt = '', expires = 0, trigger = null, lastCheck = 0;
      const style = document.createElement('style');
      style.textContent = '.mw-account-popover{position:fixed;z-index:10000;width:264px;max-width:calc(100vw - 24px);box-sizing:border-box;padding:8px;border:1px solid var(--line,#dedee3);border-radius:12px;background:var(--panel,#fff);color:var(--ink,#202023);box-shadow:0 8px 28px #0002;font:14px/1.5 system-ui}.mw-account-popover[hidden]{display:none}.mw-account-popover button,.mw-account-popover a{display:flex;align-items:center;width:100%;box-sizing:border-box;min-height:40px;padding:8px 10px;border:0;border-radius:6px;background:transparent;color:inherit;text-decoration:none;font:inherit;cursor:pointer;text-align:left}.mw-account-popover button:hover,.mw-account-popover a:hover{background:var(--nav-hover,#f1f1f3)}.mw-account-popover button:focus-visible,.mw-account-popover a:focus-visible{outline:2px solid var(--accent,#5068b7);outline-offset:-2px}.mw-account-popover button:disabled{opacity:.5;cursor:wait}.mw-account-summary{padding:8px 10px 12px;margin-bottom:4px;border-bottom:1px solid var(--line,#dedee3)}.mw-account-summary strong,.mw-account-summary small{display:block;overflow-wrap:anywhere}.mw-account-summary small{color:var(--muted,#62626b);font-size:12px}.mw-account-feedback{margin:8px 10px;font-size:12px;overflow-wrap:anywhere}.mw-account-feedback:empty{display:none}.mw-account-feedback[role=alert]{color:#b42318}.project-directory-topbar [data-account-link]{max-width:240px;gap:8px}.project-directory-topbar [data-personal-name]{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.project-directory-topbar [data-personal-status]{color:var(--muted);font-size:12px;white-space:nowrap}';
      document.head.append(style);
      style.textContent += '.mw-account-toast{position:fixed;z-index:10001;left:50%;bottom:28px;transform:translateX(-50%);max-width:calc(100vw - 40px);box-sizing:border-box;padding:10px 18px;border:1px solid var(--line,#dedee3);border-radius:10px;background:var(--panel,#fff);color:var(--ink,#202023);box-shadow:0 4px 20px #0002;font:14px/1.5 system-ui;pointer-events:none}.mw-account-toast[hidden]{display:none}';
      const toast = document.createElement('div');
      toast.className = 'mw-account-toast'; toast.hidden = true;
      toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite');
      document.body.append(toast);
      let toastTimer, pendingToast = '';
      const showToast = () => {
        if (!pendingToast || document.hidden) return;
        clearTimeout(toastTimer); toast.textContent = pendingToast; pendingToast = ''; toast.hidden = false;
        toastTimer = setTimeout(() => { toast.hidden = true; toast.textContent = ''; }, 3000);
      };
      document.addEventListener('visibilitychange', showToast);
      addEventListener('focus', showToast);
      try { pendingToast = sessionStorage.getItem('molis-work-account-toast') || ''; sessionStorage.removeItem('molis-work-account-toast'); showToast(); } catch { /* Storage may be unavailable; a toast is presentation only. */ }
      style.textContent += '[data-account-compact-label]{display:none}body.immersive-workbench .plugin-rail .personal-account{height:50px;flex-direction:column;gap:2px}body.immersive-workbench .plugin-rail [data-account-compact-label]{display:block;font-size:10px;line-height:14px;color:var(--muted)}@media(max-width:480px){.project-directory-topbar [data-personal-status]{display:none}.project-directory-topbar [data-account-link]{flex-shrink:0;max-width:120px}.project-directory-topbar .brand{white-space:nowrap}}';
      const menu = document.createElement('div');
      menu.className = 'mw-account-popover'; menu.hidden = true; menu.id = 'mw-account-menu';
      menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', '账号');
      menu.innerHTML = '<div class="mw-account-summary"><strong data-menu-name></strong><small data-menu-email></small></div><button type="button" data-personal-action="login">登录 / 注册</button><button type="button" data-personal-action="switch">切换账号</button><button type="button" data-personal-action="logout">退出登录</button><p class="mw-account-feedback" role="status"></p><p class="mw-account-feedback" role="alert"></p>';
      document.body.append(menu);
      const L = globalThis.L || (text => text);
      const spaceChoices = document.createElement('div');
      for (const [action, label] of [['local', '本地空间'], ['space', '个人空间']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.personalAction = action; button.textContent = L(label);
        spaceChoices.append(button);
      }
      menu.querySelector('[data-personal-action=login]').before(spaceChoices);
      const feedback = (text, error = false) => {
        const surface = menu;
        surface.querySelector('[role="' + (error ? 'alert' : 'status') + '"]').textContent = text;
      };
      const close = (focus = false) => { menu.hidden = true; links.forEach(a => a.setAttribute('aria-expanded', 'false')); if (focus) trigger?.focus(); };
      const paint = () => {
        const name = identity?.displayName || identity?.emails?.[0] || '未登录';
        document.querySelectorAll('[data-personal-name]').forEach(el => { el.textContent = name; });
        document.querySelectorAll('[data-personal-status]').forEach(el => { el.textContent = space === 'account' ? '个人空间' : '本地空间'; });
        document.querySelectorAll('[data-account-compact-label]').forEach(el => { el.textContent = identity ? '账号' : '登录'; });
        links.forEach(a => { a.title = identity ? name + ' · 切换账号 / 退出登录' : '登录 / 注册 molis AI'; a.setAttribute('aria-label', a.title); });
        menu.querySelector('[data-menu-name]').textContent = identity ? name : '本地模式';
        menu.querySelector('[data-menu-email]').textContent = identity?.emails?.join(' · ') || '登录后可管理你的 molis 账号';
        menu.querySelector('[data-personal-action=login]').hidden = !!identity;
        menu.querySelector('[data-personal-action=switch]').hidden = !identity;
        menu.querySelector('[data-personal-action=logout]').hidden = !identity;
        spaceChoices.hidden = !identity;
        spaceChoices.querySelectorAll('button').forEach(button => {
          const current = (button.dataset.personalAction === 'space') === (space === 'account');
          button.setAttribute('aria-pressed', String(current));
          button.textContent = L(button.dataset.personalAction === 'space' ? '个人空间' : '本地空间') + (current ? ' ✓' : '');
        });
        // Explicit hidden override because menu buttons use display:flex.
        menu.querySelectorAll('[data-personal-action]').forEach(b => { b.style.display = b.hidden ? 'none' : ''; b.disabled = busy || !configured; });
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
          if (!loaded) feedback('正在读取账号状态…');
          [...menu.querySelectorAll('button:not([hidden])')].find(button => button.getClientRects().length)?.focus(); void update();
        });
      });
      document.addEventListener('pointerdown', e => { if (!menu.contains(e.target) && !links.some(a => a.contains(e.target))) close(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { e.preventDefault(); close(true); } });
      addEventListener('resize', () => close());
      const setBusy = value => { busy = value; document.querySelectorAll('[data-personal-action]').forEach(b => b.disabled = value); };
      document.addEventListener('click', async event => {
        const button = event.target.closest?.('[data-personal-action]');
        if (!button || busy) return;
        const action = button.dataset.personalAction;
        if (!['login', 'switch', 'logout', 'local', 'space'].includes(action)) return;
        setBusy(true); feedback(''); feedback('', true);
        try {
          if (action === 'local' || action === 'space') {
            const kind = action === 'space' ? 'personal' : 'local';
            await molisWorkRequest('/api/personal/space?kind=' + kind,{method:'POST',body:{},fallback:L('无法切换空间')});
            location.assign(desktop ? '/?desktop=1' : '/'); return;
          }
          if (action === 'login' || action === 'switch') {
            attempt = '';
            loginWindow?.close(); loginWindow = null;
            if (!globalThis.molisWorkOpenExternalUrl) {
              // Open synchronously during the click, before awaiting the transaction.
              loginWindow = window.open('about:blank', '_blank');
              if (!loginWindow) throw new Error('浏览器阻止了登录窗口，请允许本站打开新标签页后重试。');
              loginWindow.opener = null;
            }
          }
          const result = await molisWorkRequest('/api/personal/' + action + '?' + query,{method:'POST',body:{}});
          if (result.loginUrl) {
            if (globalThis.molisWorkOpenExternalUrl) {
              await globalThis.molisWorkOpenExternalUrl(result.loginUrl);
            } else loginWindow.location.replace(result.loginUrl);
            attempt = result.loginAttempt; expires = Date.now() + 600000;
            feedback('请在浏览器完成登录，此页面会自动更新。');
          } else if (result.signedOut) {
            attempt = ''; loginWindow?.close(); loginWindow = null; identity = null; paint();
            location.assign(desktop ? '/?desktop=1' : '/'); return;
          }
        } catch (error) { loginWindow?.close(); loginWindow = null; feedback(error.message || '请求失败，请重试。', true); }
        finally { setBusy(false); }
      });
      const update = async () => {
        if ((document.hidden && !attempt) || checking) return;
        if (attempt && Date.now() > expires) { attempt = ''; feedback('登录等待已结束，可重新登录。', true); }
        checking = true;
        lastCheck = Date.now();
        try {
          const statusQuery = new URLSearchParams();
          if (desktop) statusQuery.set('desktop','1');
          if (attempt) { statusQuery.set('pending','1'); statusQuery.set('attempt',attempt); }
          const state = await molisWorkRequest('/api/personal/status?' + statusQuery);
          if (desktop && state.browserSessionTicket) {
            const browserState = await molisWorkRequest('/api/personal/status?browser=1');
            if (browserState.identity?.userId !== state.identity?.userId || browserState.identity?.applicationId !== state.identity?.applicationId) {
              await molisWorkRequest('/api/personal/native-attach?ticket=' + encodeURIComponent(state.browserSessionTicket),{method:'POST',body:{},fallback:L('无法连接账号空间')});
            }
          }
          const pageToken = document.querySelector('meta[name="molis-work-control-token"]')?.content;
          const changed = (state.viewToken && pageToken && state.viewToken !== pageToken) || (loaded && space !== (state.space || 'local'));
          identity = state.identity; space = state.space || 'local'; configured = state.configured; loaded = true; paint();
          if (changed) {
            if (attempt && state.loginCompleted) { try { sessionStorage.setItem('molis-work-account-toast', '登录成功'); } catch { /* Storage may be unavailable; a toast is presentation only. */ } }
            loginWindow?.close(); location.assign(desktop ? '/?desktop=1' : '/'); return;
          }
          if (menu.querySelector('[role=status]').textContent === '正在读取账号状态…') feedback('');
          if (attempt && state.loginCompleted) {
            attempt = ''; loginWindow?.close(); loginWindow = null; feedback(''); feedback('', true);
            close(menu.contains(document.activeElement));
            pendingToast = '登录成功'; showToast(); return;
          }
          if (attempt && loginWindow?.closed) { attempt = ''; loginWindow = null; feedback('登录窗口已关闭，未完成登录；可以重新尝试。'); }
          if (state.offline) feedback('暂时无法连接账号服务，本地工作不受影响。');
        } catch (error) { if (!menu.hidden) feedback(error.message || '暂时无法读取账号状态。', true); }
        finally { checking = false; }
      };
      void update();
      const tick = () => { if (attempt || Date.now() - lastCheck > 60000) void update(); };
      let timer = setInterval(tick, 3000);
      addEventListener('focus', update);
      addEventListener('pagehide', () => clearInterval(timer));
      addEventListener('pageshow', event => { if (event.persisted) { clearInterval(timer); timer = setInterval(tick, 3000); void update(); } });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
  })();
`;
