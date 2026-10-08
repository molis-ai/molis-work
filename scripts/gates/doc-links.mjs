// Gate: no broken relative link in a live Markdown file (specs/repository-anti-corruption §4.12/§4.13).
//
// Live = every tracked .md outside archive/, node_modules/, .impeccable/ and dist/ (markdown.mjs: isLiveDoc). A link is
// broken when its target file or directory is not tracked, or when it points at a heading anchor the target does not have.
// External links (http:, mailto:, …) and anchors into non-Markdown files (a source line such as #L10) are not checked.
// This gate has no baseline: it starts at zero and stays there.
import path from "node:path";
import { decode, fileIndex, headingAnchors, isLiveDoc, markdownLinks, readMarkdown } from "./markdown.mjs";

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

export function brokenLinks(snapshot) {
  const index = fileIndex(snapshot.files);
  const anchorCache = new Map();
  const anchorsOf = (file) => {
    if (!anchorCache.has(file)) anchorCache.set(file, headingAnchors(snapshot.read(file) ?? ""));
    return anchorCache.get(file);
  };
  const problems = [];
  for (const file of snapshot.files.filter(isLiveDoc)) {
    const text = snapshot.read(file);
    if (text === null) continue;
    for (const { target, line } of markdownLinks(readMarkdown(text).prose)) {
      if (EXTERNAL.test(target)) continue;
      const [withoutQuery] = target.split("?");
      const hash = withoutQuery.indexOf("#");
      const rawPath = hash === -1 ? withoutQuery : withoutQuery.slice(0, hash);
      const anchor = hash === -1 ? "" : decode(withoutQuery.slice(hash + 1));
      const where = `${file}:${line}`;
      let resolved = file;
      if (rawPath) {
        const decoded = decode(rawPath);
        resolved = decoded.startsWith("/") ? path.posix.normalize(decoded.slice(1)) : path.posix.normalize(path.posix.join(path.posix.dirname(file), decoded));
        resolved = resolved.replace(/\/$/, "");
        if (resolved.startsWith("../") || resolved === "..") { problems.push(`${where}: link ${target} leaves the repository`); continue; }
        if (!index.has(resolved)) { problems.push(`${where}: link ${target} points at ${resolved}, which is not tracked`); continue; }
      }
      if (anchor && /\.md$/.test(resolved) && index.isFile(resolved) && !anchorsOf(resolved).has(anchor.toLowerCase()) && !anchorsOf(resolved).has(anchor)) {
        problems.push(`${where}: link ${target} points at a heading ${resolved} does not have`);
      }
    }
  }
  return problems;
}
