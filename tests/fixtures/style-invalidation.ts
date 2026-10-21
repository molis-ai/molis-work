/**
 * What one node put into a page costs in style (specs/visual-ui-experience VUX-36), and the `:has()` shapes that make it
 * expensive. A `:has()` anchor is matched against every node put anywhere below the page's `:has()` arguments, and two shapes
 * turn that into restyling far more than the new node: a rule whose part after the `:has()` ends in a bare tag (`… :has(x)
 * strong`: every such tag in the page is checked), and a `:has()` followed by a broad part (`… :has(x) > :not(.a)`, `> *`:
 * every anchor's whole subtree).
 */
type Evaluate = <T = unknown>(expression: string) => Promise<T>;

/** The median of 15 inserts of one span into `target` (a page expression), each timed to the new span's style. */
export function insertMedian(evaluate: Evaluate, target: string): Promise<number> {
  return evaluate<number>(`(() => { const host = ${target}, out = [];
    for (let k = 0; k < 15; k++) { document.body.offsetHeight; const start = performance.now(), span = document.createElement('span'); span.textContent = 'x';
      host.append(span); getComputedStyle(span).color; out.push(performance.now() - start); span.remove(); }
    return out.sort((a, b) => a - b)[7]; })()`);
}

/** Every selector in the page's stylesheets with one of the two shapes above. */
export function expensiveHasSelectors(evaluate: Evaluate): Promise<string[]> {
  return evaluate<string[]>(`(() => { const out = [];
    const close = (text, at) => { let depth = 0; for (let i = at; i < text.length; i++) { if (text[i] === '(') depth++; else if (text[i] === ')' && --depth === 0) return i; } return text.length; };
    const split = (text, by) => { const parts = []; let depth = 0, from = 0; for (let i = 0; i < text.length; i++) { const c = text[i]; if (c === '(') depth++; else if (c === ')') depth--; else if (!depth && by.test(c)) { parts.push(text.slice(from, i)); from = i + 1; } } parts.push(text.slice(from)); return parts.map((part) => part.trim()).filter(Boolean); };
    // Whether a compound names a class, id or attribute, itself or in every branch of an :is()/:where(); a bare tag, *, or
    // only :not() and other pseudo-classes is broad.
    const last = (selector) => split(selector.replace(/([>+~])/g, ' $1 '), /\\s/).filter((part) => !/^[>+~]$/.test(part)).at(-1) ?? '';
    const named = (compound) => { let core = '', i = 0, branches = false; while (i < compound.length) { const m = /^::?([a-z-]+)\\(/.exec(compound.slice(i)); if (m) { const end = close(compound, i + m[0].length - 1);
        if (m[1] === 'is' || m[1] === 'where') branches ||= split(compound.slice(i + m[0].length, end), /,/).every((branch) => named(last(branch))); i = end + 1; continue; }
      const p = /^::?[a-z-]+/.exec(compound.slice(i)); if (p) { i += p[0].length; continue; } core += compound[i++]; } return branches || /[.#\\[]/.test(core); };
    const walk = (list) => { for (const rule of list.cssRules) { if (rule.cssRules && !rule.selectorText) walk(rule); else if (rule.selectorText?.includes(':has(')) for (const item of split(rule.selectorText, /,/)) {
      const at = item.lastIndexOf(':has('); if (at < 0) continue; let end = close(item, at + 4) + 1; while (end < item.length && !/[\\s>+~]/.test(item[end])) end = item[end] === '(' ? close(item, end) + 1 : end + 1;
      const after = last(item.slice(end)); if (after && !named(after.replace(/::?[a-z-]+$/, ''))) out.push(item); } } };
    for (const sheet of document.styleSheets) { try { walk(sheet); } catch {} } return out; })()`);
}
