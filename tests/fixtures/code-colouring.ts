/** Read the browser's rendered text and token classes without assuming a renderer's node grouping. */
export const codeColouringProjection = `(root) => {
  const pieces = [], walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node; (node = walk.nextNode());) {
    const token = node.parentElement.closest('[class^="tok-"]');
    const kind = token ? token.className.slice(4) : null, value = node.data;
    if (pieces.length && pieces[pieces.length - 1][0] === kind) pieces[pieces.length - 1][1] += value;
    else pieces.push([kind, value]);
  }
  return pieces;
}`;

/** Compare rendered code with a whole-token flat reference under the same unmodified container styles. */
export const codeGeometry = `(() => {
      const reference = document.createElement('pre'); reference.style.cssText = pre.style.cssText;
      const flat = reference.appendChild(document.createElement('code'));
      for (const [kind, value] of tokensOf(text, 'ts')) { const node = kind ? document.createElement('span') : document.createTextNode(value);
        if (kind) { node.className = 'tok-' + kind; node.textContent = value; } flat.append(node); }
      pre.after(reference);
      const select = root => { const range = document.createRange(); range.selectNodeContents(root); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); return [selection.toString(), range.toString()]; };
      const selected = select(code), expected = select(flat);
      const point = (root, box, offset) => { const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let at = 0, node;
        while ((node = walk.nextNode())) { if (at + node.length > offset) break; at += node.length; }
        const range = document.createRange(); range.setStart(node, offset - at); range.setEnd(node, offset - at + 1);
        const rect = range.getBoundingClientRect(), parent = box.getBoundingClientRect();
        return [rect.top - parent.top + box.scrollTop, rect.left - parent.left + box.scrollLeft, rect.width]; };
      const tab = text.indexOf('\t');
      const result = { text: code.textContent, projection: colourParts(code), selection: selected[0] === expected[0], range: selected[1],
        size: [pre.scrollHeight, reference.scrollHeight, pre.scrollWidth, reference.scrollWidth],
        line: [point(code, pre, text.length - 2)[0], point(flat, reference, text.length - 2)[0]],
        tab: tab < 0 ? [] : [point(code, pre, tab), point(flat, reference, tab)] };
      reference.remove(); return result;
    })()`;
