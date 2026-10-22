/** Only the mounted client's resources; the index owns no independent lifecycle. */
export interface ResultsIndexPorts {
  readonly root: HTMLElement;
  readonly translate: (key: string, values?: Record<string, string>) => string;
  readonly lifetime: {
    listen(target: EventTarget, name: string, callback: (event: Event) => void): void;
    observe(observer: MutationObserver, target: Node, options: MutationObserverInit): void;
    timeout(callback: () => void, delay: number): number;
    clearTimeout(timer: number): void;
  };
}

/** One chip per visible result section; rebuilding the index must not loop through its own observer. */
export function mountResultsIndex({ root, translate: L, lifetime }: ResultsIndexPorts): void {
  const nav = root.querySelector<HTMLElement>('[data-coding-results-index]');
  const tools = root.querySelector<HTMLElement>('[data-coding-tools]');
  const toggle = root.querySelector<HTMLElement>('[data-coding-results-open]');
  if (!nav || !tools || !toggle) return;
  const short = {
    [L('coding.results.cooperation')]: L('coding.short.cooperation'),
    [L('coding.checkpoints.title')]: L('coding.short.checkpoints'),
    [L('coding.results.recovery')]: L('coding.short.recovery'),
    [L('coding.results.facts')]: L('coding.short.facts'),
    [L('coding.outcomes.title')]: L('coding.short.outcomes'),
    [L('coding.change.title')]: L('coding.short.change'),
    [L('coding.commands.title')]: L('coding.short.commands'),
    [L('coding.results.background')]: L('coding.short.background'),
  };
  let indexed: HTMLElement[] = [], signature = '', timer = 0;
  const label = (section: HTMLElement): string => {
    const own = section.getAttribute('aria-label');
    if (own) return own;
    const by = section.getAttribute('aria-labelledby'), named = by ? document.getElementById(by) : null;
    return (named ?? section.querySelector(':scope > h3, :scope > header h3, :scope > details > summary'))?.textContent?.trim() ?? '';
  };
  const refresh = () => {
    const sections = root.dataset.codingResults === 'true' && tools.dataset.companionOpen !== 'true'
      ? Array.from(tools.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== nav
        && !node.classList.contains('coding-tool-tabs') && !node.hidden && !!label(node) && getComputedStyle(node).display !== 'none') : [];
    const next = sections.map(label).join('|');
    if (next === signature) return;
    signature = next; indexed = sections;
    nav.replaceChildren();
    sections.forEach((section, at) => {
      const chip = document.createElement('button'), text = label(section);
      chip.type = 'button'; chip.className = 'mw-btn mw-btn--ghost';
      chip.textContent = short[text] ?? text; chip.title = L('coding.results.jump', { section: text });
      chip.dataset.codingResultsJump = String(at); nav.append(chip);
    });
    nav.hidden = sections.length < 2;
  };
  const schedule = () => { lifetime.clearTimeout(timer); timer = lifetime.timeout(refresh, 80); };
  lifetime.listen(nav, 'click', event => {
    const chip = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-coding-results-jump]') : null;
    const section = chip && indexed[Number(chip.dataset.codingResultsJump)];
    if (!section) return;
    tools.scrollTo({ top: section.getBoundingClientRect().top - tools.getBoundingClientRect().top + tools.scrollTop - 8, behavior: 'smooth' });
    section.tabIndex = -1; section.focus({ preventScroll: true });
  });
  lifetime.observe(new MutationObserver(schedule), tools, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'data-companion-open'] });
  const visibility = () => { toggle.setAttribute('aria-expanded', String(root.dataset.codingResults === 'true')); schedule(); };
  lifetime.observe(new MutationObserver(visibility), root, { attributes: true, attributeFilter: ['data-coding-results'] });
  visibility();
}
