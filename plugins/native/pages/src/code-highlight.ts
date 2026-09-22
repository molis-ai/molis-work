import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { createLowlight } from "lowlight";
import { safePagesLanguage } from "./code-language.js";

const lowlight = createLowlight();
lowlight.register({ bash, css, go, java, javascript, json, markdown, python, rust, sql, typescript, xml, yaml });

export interface CodeTokenRange {
  readonly from: number;
  readonly to: number;
  readonly className: string;
}

interface HastText { readonly type: "text"; readonly value: string }
interface HastElement { readonly type: "element"; readonly properties?: { className?: unknown }; readonly children: readonly HastNode[] }
type HastNode = HastText | HastElement | { readonly type: string };

function classNamesOf(node: HastElement): string {
  const raw = node.properties?.className;
  if (Array.isArray(raw)) return raw.map(String).join(" ");
  return raw ? String(raw) : "";
}

function collect(nodes: readonly HastNode[], offset: number, inherited: string, out: CodeTokenRange[]): number {
  let at = offset;
  for (const node of nodes) {
    if (node.type === "text") {
      const text = (node as HastText).value;
      if (inherited && text) out.push({ from: at, to: at + text.length, className: inherited });
      at += text.length;
    } else if (node.type === "element") {
      const element = node as HastElement;
      at = collect(element.children, at, [inherited, classNamesOf(element)].filter(Boolean).join(" "), out);
    }
  }
  return at;
}

/**
 * Token ranges as plain offsets into `code`. Offsets rather than DOM keep this
 * usable as ProseMirror decorations and testable without a browser.
 */
export function highlightRanges(code: string, language: unknown): CodeTokenRange[] {
  const grammar = safePagesLanguage(language);
  if (!grammar || !code) return [];
  const out: CodeTokenRange[] = [];
  const tree = lowlight.highlight(grammar, code) as unknown as { children: readonly HastNode[] };
  collect(tree.children, 0, "", out);
  return out;
}
