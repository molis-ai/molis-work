/**
 * The top strip's first place, 「项目 › 项目主页」 (specs/screen-polish §4「底栏第十三版」第 1 条; mock helm.html, screen 34). A part
 * of DOCK_SCRIPT (navigation-presentation.ts), so it shares that script's `dock`, `projectId`, `host`, `railItem` and `setPicker`.
 *
 * The place always opens its list: the projects on the left, the chosen project's pages on the right. Looking changes nothing (a
 * project pressed on the left only shows its pages); choosing a page goes there. The current project's home opens as the home's
 * tab; another project's is that project's address. While the project home is the page that shows, the place is its tab (the
 * strip's script lights it, `paintCorner`).
 */
export const TOP_CORNER_PART = `
  const corner = dock.querySelector('[data-top-corner]');
  const cornerToggle = corner?.querySelector('[data-top-corner-toggle]');
  const cornerList = corner?.querySelector('[data-top-corner-list]');
  const showPages = (id) => {
    corner.querySelectorAll('[data-corner-project]').forEach((row) => row.setAttribute('aria-pressed', String(row.dataset.cornerProject === id)));
    corner.querySelectorAll('[data-corner-pages]').forEach((group) => { group.hidden = group.dataset.cornerPages !== id; });
  };
  const setCorner = (open) => {
    if (!cornerList || !cornerToggle || cornerList.hidden === !open) return;
    if (open) { setPicker(false); showPages(projectId); }
    cornerList.hidden = !open;
    cornerToggle.setAttribute('aria-expanded', String(open));
    if (open) cornerList.querySelector('[data-corner-pages]:not([hidden]) .top-corner-page')?.focus();
  };
  // Lit as the project home's tab while that page shows, and the home is the lit row of its list; under a cover (settings, the
  // market) nothing below is current.
  const paintCorner = (on, ear) => {
    if (!cornerToggle) return;
    const home = corner.querySelector('[data-corner-home]');
    for (const node of [cornerToggle, home]) if (node) { if (on) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current'); }
    cornerToggle.toggleAttribute('data-ear', Boolean(on && ear));
  };
  corner?.addEventListener('click', (event) => {
    const target = event.target?.nodeType === 1 ? event.target : null;
    if (!target) return;
    if (target.closest('[data-top-corner-toggle]')) { setCorner(cornerList?.hidden !== false); return; }
    const project = target.closest('[data-corner-project]');
    if (project) { showPages(project.dataset.cornerProject); return; }
    if (target.closest('[data-corner-home]')) { setCorner(false); host.open?.('home', railItem('home')); return; }
    // A link (another project's home, the projects page, Personal Space) goes there; the list closes behind it.
    if (target.closest('a[href]')) setCorner(false);
  });
  document.addEventListener('click', (event) => {
    const inside = (typeof event.composedPath === 'function' && event.composedPath().includes(corner))
      || (event.target?.nodeType === 1 && corner.contains(event.target));
    if (cornerList && !cornerList.hidden && !inside) setCorner(false);
  });
  document.addEventListener('molis-work:place-changed', () => setCorner(false));
  addEventListener('molis:surface-interaction', () => setCorner(false));
  addEventListener('blur', () => setCorner(false));
  document.addEventListener('keydown', (event) => {
    if (!cornerList || cornerList.hidden || event.defaultPrevented) return;
    if (event.key === 'Escape') { event.preventDefault(); setCorner(false); cornerToggle?.focus(); return; }
    if (!cornerList.contains(document.activeElement)) return;
    const inInput = document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA';
    const col = document.activeElement.closest('.top-corner-projects,.top-corner-right');
    if (!col) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const rows = [...col.querySelectorAll('button:not([hidden]):not([disabled]),a[href]:not([hidden]),input:not([hidden])')].filter((node) => !node.closest('[hidden]'));
      const at = rows.indexOf(document.activeElement);
      const next = rows[at + (event.key === 'ArrowDown' ? 1 : -1)];
      if (next) { event.preventDefault(); next.focus(); }
    } else if (!inInput && event.key === 'ArrowRight' && col.classList.contains('top-corner-projects')) {
      const id = document.activeElement.dataset.cornerProject;
      if (id) showPages(id);
      const first = cornerList.querySelector('[data-corner-pages]:not([hidden]) [data-mainline-search], [data-corner-pages]:not([hidden]) .top-corner-page');
      if (first) { event.preventDefault(); first.focus(); }
    } else if (!inInput && event.key === 'ArrowLeft' && col.classList.contains('top-corner-right')) {
      const active = cornerList.querySelector('[data-corner-project][aria-pressed="true"]') || cornerList.querySelector('[data-corner-project]');
      if (active) { event.preventDefault(); active.focus(); }
    }
  });
`;
