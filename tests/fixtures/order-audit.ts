// Left out, each with why it is not one row of peers or one line of words.
export const ORDER_SKIP = [
  ".dock-pins > :first-child",          // 项目首页 stands apart from the pinned plugins: the wider gap is the divider between them
  ".bar-composer [type=submit]",        // the bar's send is its one large target, a step above the bar's other buttons
  ".mw-catalog__sizes",                 // the board's size specimen shows sm, md and lg side by side
  ".mw-icon-inventory",                 // the board's icon list: an icon beside its name and code, centred on both lines
  ".mw-catalog__specimens .mw-empty",   // the board's empty block on its own: centring and the header's create are the stage's
].join(", ");

/**
 * A page-side audit of visual order (DESIGN「Order」, VUX-46 to VUX-49): whether a state mark or an icon stands as tall as
 * the words beside it and sits on their line, whether the words use the type scale, and whether buttons that sit together
 * in a row are one height on one line with one gap. Geometry and computed styles only, read after the page has settled:
 *
 * - mark-height: a state ring or dot beside words more than 2px off the words' size plus 2px (the ring is `1em + 2px`), or
 *   an icon (≤ 24px) shorter than the words or more than 4px taller (16px beside 12–15px words, 20px beside 17–20px).
 * - mark-offset: a leading mark's centre more than 1.5px off the centre of the first line of the words after it (a
 *   trailing chevron centres on its row instead).
 * - off-scale: words in a computed font size outside the type scale (code, inputs and the editor's own canvas excepted).
 * - row-height / row-centre: buttons in one row (siblings in a flex or grid row) of different heights or centres.
 * - row-gap: buttons in one row whose gaps differ, or a gap that is not 4 or 8px (2px also between icon buttons, and in a
 *   toolbar, which packs its tools). A button taller than 56px is a card, laid out by its grid, and is not counted.
 *
 * - control-role: a button's words not in their role (DESIGN「Typography · Roles」), so an action reads as an action wherever
 *   it stands: an action 13px / 500; a view choice (a pressed toggle, a filter or menu trigger) 12 or 13px / 500; a tool in
 *   the context toolbar 12px / 500.
 *
 * - radius: a painted box (a fill, a border or a shadow) whose corner is off the corner scale (DESIGN「Corners」): 4 for a
 *   mark smaller than a control, 6 a tag, 8 a control, 10 a row, 11 a Dock tile, 12 a card, 14 a sheet, 15 the composer,
 *   16 a dialog, 18 the onboarding window, or a capsule or circle (the corner at least half the box's layout size); a box
 *   that holds a rounded part at an inset may be that part's corner plus the inset, so the two curves stay concentric.
 *
 * - empty: a stage or pane empty state (a `.mw-empty` wider than a directory column, outside one) that is not centred, whose
 *   title is not 15px / 600 (the section-title role), or whose buttons are not drawn as the secondary button drawn in the
 *   same place: the page's one graphite button is its header's create, so an empty state adds a second only when the
 *   page shows no other (a phone, where the header's create folds away).
 *
 * `sizes` is the histogram of font sizes on the page, for the type-scale decision. `skip` names the places the caller
 * has reasons to leave out (a specimen that shows sizes side by side, a reference list); nothing inside them is read.
 */
export const orderAudit = (skip: string) => String.raw`(() => {
  const SKIP = ${JSON.stringify(skip || ":not(*)")};
  const SCALE = new Set([11, 12, 13, 15, 17, 20, 24, 30]);
  const scope = document.querySelector('[data-audit-scope]') || document.body;
  const findings = [], sizes = {};
  const shown = (el) => !el.closest(SKIP) && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getBoundingClientRect().width > 0;
  const label = (el) => {
    const text = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20);
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (text ? '「' + text + '」' : '');
  };
  const round = (n) => Math.round(n * 10) / 10;
  // Fields keep their own size (16px on phones, so iOS does not zoom); a select's trigger shows a field's value.
  const EXEMPT = 'code, pre, kbd, samp, textarea, input, select, .mw-select, [contenteditable], .cm-editor, .mw-code, .tui-root, svg, canvas, .mw-catalog__type';
  const firstText = (el) => {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    return walk.nextNode();
  };
  // Words: every element with text of its own.
  for (const el of scope.querySelectorAll('*')) {
    if (!shown(el) || el.closest(EXEMPT)) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const size = round(parseFloat(getComputedStyle(el).fontSize));
    sizes[size] = (sizes[size] || 0) + 1;
    if (!SCALE.has(Math.round(size)) && findings.filter((f) => f.kind === 'off-scale').length < 60) findings.push({ kind: 'off-scale', a: label(el), size });
  }
  // Marks beside words.
  const MARKS = '.mw-state-ring, [data-mw-state]:empty, .mw-status-dot, .mw-dot, svg';
  for (const mark of scope.querySelectorAll(MARKS)) {
    if (!shown(mark) || mark.closest('.mw-state-ring') !== mark && mark.closest('.mw-state-ring')) continue;
    const box = mark.getBoundingClientRect();
    if (box.height > 24 || box.width > 24 || box.height < 4) continue;
    const row = mark.parentElement;
    if (!row || mark.closest(EXEMPT.replace(', svg', ''))) continue;
    // The words the mark stands beside: the first text in its row that is not inside the mark.
    // A field's words are its own (typed or placeholder): a search icon belongs to the field, not to a key cap after it.
    let text = null, field = null, after = false;
    for (const node of row.childNodes) {
      if (node === mark || (node.nodeType === 1 && node.contains(mark))) { after = true; continue; }
      if (!after || (node.nodeType === 1 && (node.matches('.mw-sr-only') || !shown(node)))) continue;
      if (node.nodeType === 1 && node.matches('input, textarea, select')) { field = node; break; }
      text = node.nodeType === 3 ? (node.textContent.trim() ? node : null) : firstText(node);
      if (text) break;
    }
    if (field) {
      const size = parseFloat(getComputedStyle(field).fontSize);
      if (!mark.matches('.mw-state-ring, [data-mw-state], .mw-status-dot, .mw-dot') && (box.height < size - 1 || box.height > size + 4.5)) findings.push({ kind: 'mark-height', a: label(mark), b: label(field), mark: round(box.height), font: size });
      continue;
    }
    if (!text) continue;
    const range = document.createRange(); range.selectNodeContents(text);
    const line = [...range.getClientRects()].find((r) => r.width > 0);
    // Only a mark on the words' line counts: one stacked above them (a card's icon) is a layout of its own.
    // Words drawn hidden (clipped to a pixel for assistive tech) are not words beside the mark.
    const holder = text.parentElement.getBoundingClientRect();
    if (!line || holder.width <= 1 || holder.height <= 1 || box.bottom <= line.top || box.top >= line.bottom) continue;
    const size = parseFloat(getComputedStyle(text.parentElement).fontSize);
    const lh = parseFloat(getComputedStyle(text.parentElement).lineHeight) || size * 1.4;
    const centre = line.top + line.height / 2;
    const ring = mark.matches('.mw-state-ring, [data-mw-state], .mw-status-dot, .mw-dot');
    if (ring ? Math.abs(box.height - size - 2) > 2 : box.height < size - 1 || box.height > size + 4.5) findings.push({ kind: 'mark-height', a: label(mark), b: label(text.parentElement), mark: round(box.height), font: size });
    if (Math.abs((box.top + box.height / 2) - centre) > 1.5) findings.push({ kind: 'mark-offset', a: label(mark), b: label(text.parentElement), by: round((box.top + box.height / 2) - centre), lineHeight: lh });
  }
  // Controls in their role.
  for (const button of scope.querySelectorAll('.mw-btn, .tree-create')) {
    if (!shown(button) || button.matches('.mw-btn--icon-only') || button.closest('.mw-segmented, [data-segmented], [role=tablist], .mw-toggle-group')) continue;
    const words = firstText(button);
    if (!words || words.parentElement.matches('.mw-sr-only, kbd, .mw-btn__key') || words.parentElement.closest('.mw-btn__key, kbd')) continue;
    const style = getComputedStyle(words.parentElement), size = parseFloat(style.fontSize), weight = Number(style.fontWeight);
    const role = button.closest('.mw-ctx') ? [[12], 500]
      : button.matches('[aria-pressed], [aria-haspopup], [data-tree-filter-trigger]') ? [[12, 13], 500] : [[13], 500];
    if (words.parentElement.closest('.mw-ctx__glyph')) continue;
    if (!role[0].includes(size) || weight !== role[1]) findings.push({ kind: 'control-role', a: label(button), size: parseFloat(style.fontSize), weight: Number(style.fontWeight) });
  }
  // Buttons that sit together in a row.
  const rows = new Set();
  for (const button of scope.querySelectorAll('button, a.mw-btn, [role=button]')) {
    if (shown(button) && button.parentElement) rows.add(button.parentElement);
  }
  for (const row of rows) {
    const style = getComputedStyle(row);
    if (!/flex|grid/.test(style.display) || style.flexDirection === 'column') continue;
    // A tab and its close, a split button and a segmented control are one control made of parts.
    if (row.matches('.tab-item, [role=tablist], .mw-segmented, .mw-split, [data-segmented]')) continue;
    // Peers: buttons with words beside buttons with words, icon buttons beside icon buttons.
    const worded = (b) => Boolean((b.innerText || '').trim()) && !b.matches('.mw-btn--icon-only');
    // A button taller than a control row is a card in a grid of cards: the grid's gaps are the cards', not a row of peers.
    const all = [...row.children].filter((c) => c.matches('button, a.mw-btn, [role=button]') && shown(c) && c.getBoundingClientRect().height <= 56);
    const buttons = all.filter((b) => worded(b) === worded(all[0]));
    if (buttons.length < 2) continue;
    const boxes = buttons.map((b) => b.getBoundingClientRect()).sort((a, b) => a.left - b.left);
    const sameLine = boxes.filter((b) => Math.abs(b.top - boxes[0].top) < boxes[0].height);
    if (sameLine.length < 2) continue;
    const heights = sameLine.map((b) => round(b.height)), centres = sameLine.map((b) => round(b.top + b.height / 2));
    if (Math.max(...heights) - Math.min(...heights) > 1) findings.push({ kind: 'row-height', a: label(row), heights });
    else if (Math.max(...centres) - Math.min(...centres) > 1) findings.push({ kind: 'row-centre', a: label(row), centres });
    const gaps = sameLine.slice(1).map((b, i) => round(b.left - sameLine[i].right)).filter((g) => g > 0.5 && g < 48);
    const allowed = worded(buttons[0]) && !row.matches('[role=toolbar], [role=group]') ? [4, 8] : [2, 4, 8];
    if (gaps.length && (Math.max(...gaps) - Math.min(...gaps) > 1 || gaps.some((g) => allowed.every((a) => Math.abs(g - a) > 1)))) findings.push({ kind: 'row-gap', a: label(row), gaps });
  }
  // Corners: on the scale, a capsule, or concentric with a rounded part inside it.
  const CORNERS = [4, 6, 8, 10, 11, 12, 14, 15, 16, 18], cornered = new Set();
  const corner = (style) => ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map((k) => parseFloat(style['border' + k + 'Radius']) || 0).find((r) => r > 0) || 0;
  const painted = (style) => !/rgba\(0, 0, 0, 0\)|transparent/.test(style.backgroundColor) || style.backgroundImage !== 'none' || style.boxShadow !== 'none'
    || ['Top', 'Right', 'Bottom', 'Left'].some((k) => parseFloat(style['border' + k + 'Width']) > 0 && !/, 0\)$|transparent/.test(style['border' + k + 'Color']));
  for (const el of scope.querySelectorAll('*')) {
    if (!shown(el) || el.closest('svg, .cm-editor, .tui-root, canvas')) continue;
    const style = getComputedStyle(el), r = corner(style);
    if (!r || !painted(style) || r >= Math.min(el.offsetWidth || Infinity, el.offsetHeight || Infinity) / 2 - 0.5) continue;
    if (CORNERS.some((c) => Math.abs(r - c) < 0.5)) continue;
    const box = el.getBoundingClientRect(), before = getComputedStyle(el, '::before');
    const parts = [...el.children].map((child) => [corner(getComputedStyle(child)), child.getBoundingClientRect().top - box.top]);
    if (before.content !== 'none') parts.push([corner(before), parseFloat(before.top) || 0]);
    if (parts.some(([inner, inset]) => inner && Math.abs(r - inner - inset) < 0.75)) continue;
    const key = label(el).replace(/「.*$/, '') + r;
    if (cornered.has(key)) continue;
    cornered.add(key);
    findings.push({ kind: 'radius', a: label(el), radius: round(r), box: [el.offsetWidth, el.offsetHeight] });
  }
  // Empty states on a stage or pane: centred, a section title, secondary actions.
  for (const empty of scope.querySelectorAll('.mw-empty')) {
    if (!shown(empty) || empty.offsetWidth < 320 || empty.closest('.mw-dir, .tree-pane, [data-tree-pane], .desktop-directory-panel')) continue;
    const style = getComputedStyle(empty), title = empty.querySelector(':scope > :is(h1, h2, strong), :scope > * > :is(h1, h2, strong)');
    if (style.textAlign !== 'center') findings.push({ kind: 'empty', a: label(empty), align: style.textAlign });
    if (title && shown(title)) {
      const t = getComputedStyle(title);
      if (parseFloat(t.fontSize) !== 15 || t.fontWeight !== '600') findings.push({ kind: 'empty', a: label(title), title: t.fontSize + ' / ' + t.fontWeight });
    }
    const buttons = [...empty.querySelectorAll('button, a.mw-btn')].filter((b) => shown(b) && b.matches('.mw-btn'));
    if (!buttons.length) continue;
    const probe = document.createElement('button');
    probe.className = 'mw-btn mw-btn--secondary';
    probe.textContent = 'x';
    buttons[0].parentElement.append(probe);
    const want = getComputedStyle(probe), look = [want.backgroundColor, want.color, probe.offsetHeight].join(' ');
    probe.className = 'mw-btn mw-btn--primary';
    const graphite = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const others = [...document.querySelectorAll('.mw-btn')].some((b) => !empty.contains(b) && shown(b) && getComputedStyle(b).backgroundColor === graphite);
    buttons.forEach((button, index) => {
      const b = getComputedStyle(button), got = [b.backgroundColor, b.color, button.offsetHeight].join(' ');
      if (got === look || (!index && !others && b.backgroundColor === graphite)) return;
      findings.push({ kind: 'empty', a: label(button), button: got, secondary: look });
    });
  }
  return { findings, sizes };
})()`;
