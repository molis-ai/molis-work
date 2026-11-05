// Keep only the board.css rules the prototype can match. A rule stays when every class its selector names
// appears as a word in the prototype's own files (index.html, app.js, data.js, board.js). Tokens, element
// rules, keyframes and @property stay. 在仓库根目录跑：
//   node docs/design/service-connections/tools/prune.mjs <临时目录>/board.css docs/design/service-connections docs/design/service-connections/board.css
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(join(process.cwd(), "package.json"));
// postcss is only a transitive dependency: take the copy pnpm already installed.
const store = join(process.cwd(), "node_modules/.pnpm");
const pkg = readdirSync(store).filter((d) => /^postcss@8\./.test(d)).sort().pop();
const postcss = require(join(store, pkg, "node_modules/postcss"));
const [full, dir, out] = process.argv.slice(2);
const words = new Set();
for (const f of ["index.html", "app.js", "data.js", "board.js"]) {
  for (const w of readFileSync(join(dir, f), "utf8").match(/[A-Za-z_][\w-]*/g) ?? []) words.add(w);
}
const src = readFileSync(full, "utf8");
const header = src.match(/^\/\*[\s\S]*?\*\/\n/)?.[0] ?? "";
const root = postcss.parse(src);
// A word ending in "-" is a prefix written with a template (`mw-btn--${variant}`): every class starting with it may be used.
const prefixes = [...words].filter((w) => w.endsWith("-") && w.length > 4);
const known = (c) => words.has(c) || prefixes.some((p) => c.startsWith(p));
// Can this selector match the prototype's markup? :is()/:where() need one usable alternative; :not() never blocks a match.
function splitTop(text) { const out = []; let depth = 0, cur = ""; for (const ch of text) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; }
function used(sel) {
  let rest = "", i = 0;
  while (i < sel.length) {
    const m = sel.slice(i).match(/^:(is|where|not|has|matches)\(/);
    if (m) {
      let depth = 1, j = i + m[0].length; while (j < sel.length && depth) { if (sel[j] === "(") depth++; else if (sel[j] === ")") depth--; j++; }
      const inner = sel.slice(i + m[0].length, j - 1);
      if ((m[1] === "is" || m[1] === "where" || m[1] === "matches") && !splitTop(inner).some(used)) return false;
      if (m[1] === "has" && !splitTop(inner).some(used)) return false;
      i = j; continue;
    }
    rest += sel[i++];
  }
  return [...rest.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].every((x) => known(x[1]));
}
root.walkRules((rule) => {
  if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
  const keep = rule.selectors.filter(used);
  if (!keep.length) rule.remove();
  else rule.selectors = keep;
});
let changed = true;
while (changed) { changed = false; root.walkAtRules((a) => { if (a.nodes && a.nodes.length === 0) { a.remove(); changed = true; } }); }
root.walkComments((c) => c.remove());
const css = header + root.toString().replace(/\n\s*\n+/g, "\n");
writeFileSync(out, css);
console.log("kept bytes", css.length);
