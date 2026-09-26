/** Presentation preference only; opening the rail never selects or starts a tool. */
export const NAVIGATION_PRESENTATION_SCRIPT = `(L) => {
  const button = document.querySelector('[data-navigation-labels-toggle]');
  if (!button) return;
  let expanded = false;
  try { expanded = localStorage.getItem('molis-work-navigation-labels') === 'true'; } catch {}
  const paint = () => {
    document.body.dataset.navigationLabels = String(expanded);
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-label', L(expanded ? '收起工具名称' : '展开工具名称'));
    button.title = button.getAttribute('aria-label');
  };
  button.addEventListener('click', () => {
    expanded = !expanded;
    try { localStorage.setItem('molis-work-navigation-labels', String(expanded)); } catch {}
    paint();
    dispatchEvent(new Event('resize'));
  });
  const dismiss = (event) => {
    for (const menu of document.querySelectorAll('.plugin-stage-more[open]')) {
      if (event.type === 'keydown' ? event.key === 'Escape' : !menu.contains(event.target)) {
        const restore = menu.contains(document.activeElement);
        menu.open = false;
        if (restore) menu.querySelector('summary').focus();
      }
    }
  };
  document.addEventListener('click', dismiss);
  document.addEventListener('keydown', dismiss);
  paint();
}`;
