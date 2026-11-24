import { parse as parseSelector, type Selector } from "css-what";
import { selectAll } from "css-select";
import { parseDocument, DomUtils } from "htmlparser2";
import { parse as parseCss } from "postcss";
import type { HomePageFile } from "@molis-ai/molis-work-contracts/services/home";
import type { UiTokenMap } from "@molis-ai/molis-work-contracts/platform/ui";

function luminance(role: string, palette: UiTokenMap): number | undefined {
  const visited = new Set<string>();
  let value = palette[role];
  while (value && typeof value === "object" && "role" in value && !visited.has(value.role)) {
    visited.add(value.role); value = palette[value.role];
  }
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/iu.test(value)) return undefined;
  const channels = [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

export function lowContrast(ink: string, paper: string, palettes: readonly UiTokenMap[] = []) {
  return ink === paper || palettes.some(palette => {
    const a = luminance(ink, palette), b = luminance(paper, palette);
    return a !== undefined && b !== undefined && (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < 4.5;
  });
}

// Keep the cascade's three specificity components independent, including :where() and the selector-list pseudos.
function specificity(tokens: Selector[]): [number, number, number] {
  const score: [number, number, number] = [0, 0, 0];
  for (const token of tokens) {
    if (token.type === "attribute") score[token.name === "id" && token.ignoreCase === "quirks" ? 0 : 1]++;
    if (token.type === "tag" || token.type === "pseudo-element") score[2]++;
    if (token.type !== "pseudo" || token.name === "where") continue;
    if (Array.isArray(token.data)) {
      const max = token.data.map(specificity).sort((a, b) => compare(b, a))[0];
      if (max) { score[0] += max[0]; score[1] += max[1]; score[2] += max[2]; }
    } else score[1]++;
  }
  return score;
}
const compare = (a: readonly number[], b: readonly number[]) => a.reduce((d, v, i) => d || v - b[i]!, 0);

interface Color { role: string; priority: readonly number[] }
type Pair = { ink?: Color; paper?: Color };
type Node = ReturnType<typeof parseDocument>["children"][number];
const tokenRole = /^var\(\s*--([\w-]+)\s*\)$/iu;

/** Resolve declared text and surface colors on the page's own elements, including inherited foreground and transparent ancestors. */
export function unreadablePage(files: readonly HomePageFile[], palettes: readonly UiTokenMap[] = []): string | undefined {
  const styles = files.filter(file => file.media_type === "text/css").map(file => {
    try { return parseCss(file.text); } catch { return undefined; }
  });
  if (!styles.some(Boolean)) return;
  for (const html of files.filter(file => file.media_type === "text/html")) {
    const doc = parseDocument(html.text);
    const elements = DomUtils.findAll(() => true, doc.children);
    for (const [theme, palette] of (palettes.length ? palettes : [undefined]).entries()) {
      const rules = new Map<Node, Pair>();
      for (const css of styles) css?.walkRules(rule => {
        for (let p = rule.parent; p && p.type !== "root"; p = p.parent) {
          if (p.type === "atrule" && p.name === "media" && /prefers-color-scheme/i.test(p.params)
            && !p.params.includes(theme === 1 ? "dark" : "light")) return;
        }
        for (const selector of rule.selectors) {
          let matches: typeof elements, weight: number[];
          try {
            const parsed = parseSelector(selector);
            weight = specificity(parsed[0] ?? []);
            matches = selectAll(parsed, doc.children);
          } catch { continue; }
          for (const decl of rule.nodes) {
            if (decl.type !== "decl") continue;
            const prop = decl.prop.toLowerCase();
            if (prop !== "color" && prop !== "background-color" && prop !== "background") continue;
            const role = tokenRole.exec(decl.value.trim())?.[1];
            if (!role) continue;
            const key = prop === "color" ? "ink" : "paper";
            const priority = [Number(Boolean(decl.important)), ...weight];
            for (const elem of matches) {
              const pair = rules.get(elem) ?? {};
              if (!pair[key] || compare(priority, pair[key]!.priority) >= 0) pair[key] = { role, priority };
              rules.set(elem, pair);
            }
          }
        }
      });
      const computed = new Map<Node, { ink: string; paper: string }>();
      for (const elem of elements) {
        const parent = elem.parent && elem.parent.type !== "root" ? computed.get(elem.parent) : undefined;
        const own = rules.get(elem);
        const ink = own?.ink?.role ?? parent?.ink ?? "ink", paper = own?.paper?.role ?? parent?.paper ?? "paper";
        computed.set(elem, { ink, paper });
        if (elem.name !== "script" && elem.name !== "style" && elem.children.some(child => child.type === "text" && child.data.trim())
          && lowContrast(ink, paper, palette ? [palette] : [])) return html.path;
      }
    }
  }
  return undefined;
}

