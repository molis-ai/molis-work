import type { PagesBody } from "@molis-ai/molis-work-contracts/modules/pages";
import { EMPTY_PAGES_BODY } from "./document.js";

interface JsonNode {
  type?: unknown;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
  text?: unknown;
}

export interface ExtractedKnowledgePage {
  readonly title: string;
  readonly body: PagesBody;
}

export interface ExtractResult {
  readonly body: PagesBody;
  readonly cards: number;
  readonly knowledge: readonly ExtractedKnowledgePage[];
}

export function extractFromPagesBody(title: string, body: PagesBody): ExtractResult {
  const content = Array.isArray(body.content) ? (body.content as JsonNode[]) : [];
  const cards = taskCardsFrom(content);
  const knowledge = knowledgePagesFrom(title, content);
  const next = cards.length ? [...content, ...cards] : content;
  return {
    body: next.length ? { type: "doc", content: next } : { ...EMPTY_PAGES_BODY, content: [...(EMPTY_PAGES_BODY.content ?? [])] },
    cards: cards.length,
    knowledge,
  };
}

export function unpublishedKnowledgePages(
  existingTitles: readonly string[],
  knowledge: readonly ExtractedKnowledgePage[],
): ExtractedKnowledgePage[] {
  const seen = new Set(existingTitles);
  return knowledge.filter((page) => {
    if (seen.has(page.title)) return false;
    seen.add(page.title);
    return true;
  });
}

function taskCardsFrom(nodes: readonly JsonNode[]): JsonNode[] {
  const existing = new Set<string>();
  walk(nodes, (node) => {
    if (node.type === "task_card") existing.add(textOf(node).trim() || String(node.attrs?.title || ""));
  });
  const cards: JsonNode[] = [];
  walk(nodes, (node) => {
    if (node.type !== "task_item") return;
    const title = textOf(node).trim();
    if (!title || existing.has(title)) return;
    existing.add(title);
    cards.push({
      type: "task_card",
      attrs: {
        title: title.slice(0, 80),
        description: "",
        status: node.attrs?.checked === true ? "done" : "todo",
        due: "",
        note: "",
      },
    });
  });
  return cards;
}

function knowledgePagesFrom(sourceTitle: string, nodes: readonly JsonNode[]): ExtractedKnowledgePage[] {
  const pages: ExtractedKnowledgePage[] = [];
  let current: { heading: string; blocks: JsonNode[] } | null = null;
  const flush = () => {
    if (!current) return;
    const text = current.blocks.map((block) => textOf(block).trim()).join("\n").trim();
    if (text.length >= 8) {
      pages.push({
        title: `${clip(sourceTitle, 32)} · ${clip(current.heading, 32)}`.slice(0, 80),
        body: {
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 1, note: "" }, content: [{ type: "text", text: current.heading }] },
            ...current.blocks,
          ],
        },
      });
    }
    current = null;
  };
  for (const node of nodes) {
    if (node.type === "heading" && Number(node.attrs?.level) === 2) {
      flush();
      current = { heading: textOf(node).trim() || "小节", blocks: [] };
      continue;
    }
    if (current && node.type !== "heading") current.blocks.push(node);
    if (node.type === "heading" && Number(node.attrs?.level) === 1) flush();
  }
  flush();
  return pages;
}

function walk(nodes: readonly JsonNode[], visit: (node: JsonNode) => void): void {
  for (const node of nodes) {
    visit(node);
    if (Array.isArray(node.content)) walk(node.content, visit);
  }
}

function textOf(node: JsonNode): string {
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  return node.content.map((child) => textOf(child)).join("");
}

function clip(value: string, max: number): string {
  const text = value.trim() || "未命名文档";
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}
