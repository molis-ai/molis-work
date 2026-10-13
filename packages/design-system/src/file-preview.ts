/**
 * A file's content as read-only HTML (specs/artifact-positioning A4): Markdown, CSV as a table, plain text, and raster
 * images. Everything else is named, not shown. It escapes every value and never emits a script, a frame or a link that
 * is not http(s); the 成果库 renders owner previews with it.
 */
export interface FilePreviewContent {
  readonly title: string;
  readonly media_type: string;
  readonly encoding: "utf8" | "base64";
  readonly data: string;
  readonly truncated: boolean;
}

export function renderFilePreviewHtml(file: FilePreviewContent, primitives: { escape(value: string): string; text(value: string): string }): string {
  const esc = primitives.escape;
  const type = file.media_type.split(";")[0]!.trim().toLowerCase();
  const truncated = file.truncated ? `<p class="file-preview-truncated">${primitives.text("只显示了开头一部分。")}</p>` : "";
  if (file.encoding === "base64") {
    if (/^image\/(?:png|jpeg|gif|webp|avif)$/u.test(type)) return `<img class="file-preview-image" alt="${esc(file.title)}" src="data:${type};base64,${file.data.replace(/[^A-Za-z0-9+/=]/gu, "")}">`;
    return `<p class="file-preview-note">${primitives.text("这种文件不能在这里预览，可以下载后打开。")}（${esc(type)}）</p>`;
  }
  if (/markdown/u.test(type)) return truncated + markdown(file.data, esc);
  if (type === "text/csv") return truncated + table(file.data, esc);
  return truncated + `<pre class="file-preview-text">${esc(file.data)}</pre>`;
}

function markdown(text: string, esc: (value: string) => string): string {
  const inline = (line: string) => esc(line)
    .replace(/`([^`]+)`/gu, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/gu, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/gu, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s"]+)\)/gu, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const out: string[] = [];
  let fence: string[] | null = null, list: "ul" | "ol" | null = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of String(text).split("\n")) {
    if (/^```/u.test(line)) { if (fence === null) { closeList(); fence = []; } else { out.push(`<pre>${esc(fence.join("\n"))}</pre>`); fence = null; } continue; }
    if (fence !== null) { fence.push(line); continue; }
    const heading = /^(#{1,3})\s+(.*)$/u.exec(line);
    if (heading) { closeList(); out.push(`<h${heading[1]!.length}>${inline(heading[2]!)}</h${heading[1]!.length}>`); continue; }
    const bullet = /^\s*[-*+]\s+(.*)$/u.exec(line), ordered = /^\s*\d+[.)]\s+(.*)$/u.exec(line);
    if (bullet || ordered) {
      const kind = bullet ? "ul" : "ol";
      if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; }
      out.push(`<li>${inline((bullet ?? ordered)![1]!)}</li>`);
      continue;
    }
    closeList();
    if (/^>\s?/u.test(line)) { out.push(`<blockquote>${inline(line.replace(/^>\s?/u, ""))}</blockquote>`); continue; }
    if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (fence !== null) out.push(`<pre>${esc((fence as string[]).join("\n"))}</pre>`);
  closeList();
  return `<div class="file-preview-markdown">${out.join("")}</div>`;
}

/** A CSV as a table, first 500 rows; quoted cells may hold commas and line breaks. */
function table(text: string, esc: (value: string) => string): string {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let index = 0; index < text.length && rows.length < 501; index++) {
    const c = text[index]!;
    if (quoted) { if (c === '"' && text[index + 1] === '"') { cell += '"'; index++; } else if (c === '"') quoted = false; else cell += c; continue; }
    if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[index + 1] === "\n") index++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header = [], ...rest] = rows;
  return `<div class="file-preview-table"><table><thead><tr>${header.map(value => `<th>${esc(value)}</th>`).join("")}</tr></thead><tbody>${
    rest.slice(0, 500).map(cells => `<tr>${cells.map(value => `<td>${esc(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

export const FILE_PREVIEW_STYLES = `
  .file-preview-markdown { line-height:1.75; overflow-wrap:anywhere; }
  .file-preview-markdown pre, .file-preview-text { white-space:pre-wrap; overflow-wrap:anywhere; padding:12px; background:var(--rail); border-radius:8px; font:13px/1.6 var(--mono, ui-monospace, monospace); }
  .file-preview-markdown blockquote { margin:8px 0; padding-left:12px; border-left:3px solid var(--line); color:var(--muted); }
  .file-preview-table { max-width:100%; overflow:auto; }
  .file-preview-table table { border-collapse:collapse; font-size:13px; }
  .file-preview-table th, .file-preview-table td { border:1px solid var(--line); padding:4px 8px; text-align:left; vertical-align:top; }
  .file-preview-image { max-width:100%; height:auto; border-radius:8px; }
  .file-preview-note, .file-preview-truncated { color:var(--muted); }
`;

/**
 * The same renderer for a script in the page (the side panel renders previews other surfaces hand it), built from these
 * very functions so there is one copy: defines `renderFilePreview(file, { escape, text })`.
 */
export const FILE_PREVIEW_CLIENT_SCRIPT = `const renderFilePreview = (() => { ${markdown.toString()}\n${table.toString()}\nreturn ${renderFilePreviewHtml.toString()}; })();`;
