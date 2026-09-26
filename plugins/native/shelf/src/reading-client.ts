/** Safe, dependency-free reading views for the Shelf's file copies. */
export const SHELF_READING_FACTORY_SCRIPT = String.raw`(escapeText, escapeAttr) => {
  const safeUrl = (value) => {
    try { const url = new URL(value); return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : ''; }
    catch { return ''; }
  };
  const inline = (value) => {
    const parts = String(value).split(/(\x60[^\x60]+\x60|\[[^\]]+\]\([^\s)]+\))/g);
    return parts.map(part => {
      if (part.startsWith('\x60') && part.endsWith('\x60')) return '<code>' + escapeText(part.slice(1,-1)) + '</code>';
      const link = part.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
      if (link) { const url = safeUrl(link[2]); return url ? '<a href="' + escapeAttr(url) + '" target="_blank" rel="noopener noreferrer">' + escapeText(link[1]) + '</a>' : escapeText(link[1]); }
      return escapeText(part).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>');
    }).join('');
  };
  const markdown = (text) => {
    const lines = String(text).replace(/\r\n/g,'\n').split('\n');
    const blocks = [];
    const cells = line => line.trim().replace(/^\||\|$/g,'').split('|').map(value=>value.trim());
    let i=0;
    while(i<lines.length) {
      const line=lines[i];
      if(!line.trim()){i++;continue;}
      if(/^\s*\x60{3}/.test(line)) {
        const language=line.replace(/^\s*\x60{3}/,'').trim();const code=[];i++;
        while(i<lines.length&&!/^\s*\x60{3}/.test(lines[i]))code.push(lines[i++]);
        i++;blocks.push('<pre class="shelf-code"><code' +(language?' data-language="'+escapeAttr(language)+'"':'')+'>'+escapeText(code.join('\n'))+'</code></pre>');continue;
      }
      const heading=line.match(/^(#{1,6})\s+(.+)$/);
      if(heading){const level=heading[1].length;blocks.push('<h'+level+'>'+inline(heading[2])+'</h'+level+'>');i++;continue;}
      if(i+1<lines.length&&line.includes('|')&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1])) {
        const head=cells(line);i+=2;const rows=[];
        while(i<lines.length&&lines[i].includes('|')&&lines[i].trim())rows.push(cells(lines[i++]));
        blocks.push('<div class="shelf-table-scroll"><table><thead><tr>'+head.map(cell=>'<th>'+inline(cell)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+head.map((_,n)=>'<td>'+inline(row[n]||'')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>');continue;
      }
      if(/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)){blocks.push('<hr>');i++;continue;}
      if(/^>\s?/.test(line)){const quote=[];while(i<lines.length&&/^>\s?/.test(lines[i]))quote.push(lines[i++].replace(/^>\s?/,''));blocks.push('<blockquote>'+markdown(quote.join('\n'))+'</blockquote>');continue;}
      const list=line.match(/^\s*(?:([-+*])|\d+[.)])\s+(.+)$/);
      if(list){const tag=list[1]?'ul':'ol';const rows=[];while(i<lines.length){const row=lines[i].match(/^\s*(?:([-+*])|\d+[.)])\s+(.+)$/);if(!row||Boolean(row[1])!==Boolean(list[1]))break;rows.push('<li>'+inline(row[2])+'</li>');i++;}blocks.push('<'+tag+'>'+rows.join('')+'</'+tag+'>');continue;}
      const paragraph=[line];i++;
      while(i<lines.length&&lines[i].trim()&&!/^(#{1,6}\s|>\s?|\s*[-+*]\s|\s*\d+[.)]\s|\s*\x60{3})/.test(lines[i])&&!(i+1<lines.length&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1])))paragraph.push(lines[i++]);
      blocks.push('<p>'+inline(paragraph.join('\n')).replace(/\n/g,'<br>')+'</p>');
    }
    return blocks.join('');
  };
  const render = (item, text) => {
    const ext=String(item.name||'').split('.').pop().toLowerCase();
    if(item.kind==='url'){const url=safeUrl(String(text).trim());return url?'<p><a class="shelf-source-link" href="'+escapeAttr(url)+'" target="_blank" rel="noopener noreferrer">'+escapeText(text)+'</a></p>':'<pre class="shelf-plain">'+escapeText(text)+'</pre>';}
    if(item.kind==='markdown'||item.kind==='website'||['md','markdown'].includes(ext))return markdown(text);
    if(ext==='json'){try{return '<pre class="shelf-code"><code>'+escapeText(JSON.stringify(JSON.parse(text),null,2))+'</code></pre>';}catch{}}
    return '<pre class="'+(item.kind==='text'?'shelf-plain':'shelf-code')+'">'+escapeText(text)+'</pre>';
  };
  return { render, markdown };
}`;
