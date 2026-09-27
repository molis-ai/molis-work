/** Escape first; only our own small Markdown vocabulary can create markup. */
export function createMessageFormat(escape: (value: unknown) => string) {
  const inline = (text: string) => escape(text).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/\x60([^\x60\n]+)\x60/g, '<code>$1</code>');
  return (value: unknown) => String(value ?? '').split(/(\x60\x60\x60[\s\S]*?\x60\x60\x60)/g).map(part => {
    if (part.startsWith('\x60\x60\x60'))
      return '<pre><code>' + escape(part.slice(3, -3).replace(/^\w*\n/, '')) + '</code></pre>';
    return part.split('\n').map(line => line.startsWith('> ') ? '<blockquote>' + inline(line.slice(2)) + '</blockquote>' : inline(line)).join('<br>');
  }).join('');
}
