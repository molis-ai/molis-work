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
