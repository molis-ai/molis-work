import { MarkSpec, Node, NodeSpec, Schema } from "prosemirror-model";
import { EMPTY_PAGES_BODY } from "./document.js";
import { calloutIconFor, safePagesCalloutIcon, safePagesCalloutTone } from "./callout.js";
import { safePagesLanguage } from "./code-language.js";
import { bookmarkLabel, imageAlt, safePagesHref, safePagesImageSrc } from "./link.js";
import { safePagesTone } from "./tone.js";

const NOTE = { note: { default: "" } };

function noted(attrs: NodeSpec["attrs"] = {}): NodeSpec["attrs"] {
  return { ...NOTE, ...attrs };
}

function domAttrs(node: Node, extra: Record<string, string> = {}): Record<string, string> {
  if (node.attrs.note) extra["data-pages-note"] = String(node.attrs.note);
  return extra;
}

const nodes = {
  doc: { content: "block+" } satisfies NodeSpec,
  paragraph: {
    content: "inline*",
    group: "block",
    attrs: noted(),
    parseDOM: [{ tag: "p", getAttrs: (dom) => ({ note: (dom as HTMLElement).getAttribute("data-pages-note") || "" }) }],
    toDOM: (node) => ["p", domAttrs(node), 0],
  } satisfies NodeSpec,
  heading: {
    attrs: noted({ level: { default: 1 } }),
    content: "inline*",
    group: "block",
    defining: true,
    parseDOM: [
      { tag: "h1", attrs: { level: 1 } },
      { tag: "h2", attrs: { level: 2 } },
      { tag: "h3", attrs: { level: 3 } },
    ],
    toDOM: (node) => ["h" + node.attrs.level, domAttrs(node), 0],
  } satisfies NodeSpec,
  bullet_list: {
    content: "list_item+",
    group: "block",
    attrs: noted(),
    parseDOM: [{ tag: "ul" }],
    toDOM: (node) => ["ul", domAttrs(node), 0],
  } satisfies NodeSpec,
  ordered_list: {
    attrs: noted({ order: { default: 1 } }),
    content: "list_item+",
    group: "block",
    parseDOM: [{ tag: "ol", getAttrs: (dom) => ({ order: Number((dom as HTMLElement).getAttribute("start") ?? "1") || 1 }) }],
    toDOM: (node) => node.attrs.order === 1 ? ["ol", domAttrs(node), 0] : ["ol", domAttrs(node, { start: String(node.attrs.order) }), 0],
  } satisfies NodeSpec,
  list_item: {
    content: "paragraph block*",
    parseDOM: [{ tag: "li" }],
    toDOM: () => ["li", 0],
    defining: true,
  } satisfies NodeSpec,
  task_list: {
    content: "task_item+",
    group: "block",
    attrs: noted(),
    parseDOM: [{ tag: "ul[data-pages-tasks]" }],
    toDOM: (node) => ["ul", domAttrs(node, { "data-pages-tasks": "1", class: "pages-task-list" }), 0],
  } satisfies NodeSpec,
  task_item: {
    attrs: { checked: { default: false } },
    content: "paragraph block*",
    defining: true,
    parseDOM: [{
      tag: "li[data-pages-task]",
      getAttrs: (dom) => ({ checked: (dom as HTMLElement).getAttribute("data-checked") === "true" }),
    }],
    toDOM: (node) => ["li", {
      "data-pages-task": "1",
      "data-checked": node.attrs.checked ? "true" : "false",
      class: "pages-task-item" + (node.attrs.checked ? " is-checked" : ""),
    }, 0],
  } satisfies NodeSpec,
  callout: {
    attrs: noted({ tone: { default: "info" }, icon: { default: "" } }),
    content: "block+",
    group: "block",
    defining: true,
    parseDOM: [{
      tag: "aside[data-pages-callout]",
      getAttrs: (dom) => ({
        tone: (dom as HTMLElement).getAttribute("data-pages-callout") || "info",
        icon: safePagesCalloutIcon((dom as HTMLElement).getAttribute("data-pages-icon")),
        note: (dom as HTMLElement).getAttribute("data-pages-note") || "",
      }),
    }],
    toDOM: (node) => ["aside", domAttrs(node, {
      "data-pages-callout": safePagesCalloutTone(node.attrs.tone),
      "data-pages-icon": calloutIconFor(node.attrs.icon, node.attrs.tone),
      class: "pages-callout",
    }), 0],
  } satisfies NodeSpec,
  code_block: {
    content: "text*",
    marks: "",
    group: "block",
    code: true,
    defining: true,
    attrs: noted({ language: { default: "" } }),
    parseDOM: [{
      tag: "pre",
      preserveWhitespace: "full",
      getAttrs: (dom) => ({ language: safePagesLanguage((dom as HTMLElement).getAttribute("data-language")) }),
    }],
    toDOM: (node) => ["pre", domAttrs(node, { "data-language": safePagesLanguage(node.attrs.language), class: "pages-code" }), ["code", 0]],
  } satisfies NodeSpec,
  toggle: {
    attrs: noted({ open: { default: true } }),
    content: "paragraph block*",
    group: "block",
    defining: true,
    parseDOM: [{
      tag: "details[data-pages-toggle]",
      getAttrs: (dom) => ({ open: (dom as HTMLElement).hasAttribute("open") }),
    }],
    toDOM: (node) => ["details", domAttrs(node, {
      "data-pages-toggle": "1",
      class: "pages-toggle",
      ...(node.attrs.open ? { open: "open" } : {}),
    }), 0],
  } satisfies NodeSpec,
  blockquote: {
    content: "block+",
    group: "block",
    defining: true,
    attrs: noted(),
    parseDOM: [{ tag: "blockquote" }],
    toDOM: (node) => ["blockquote", domAttrs(node, { class: "pages-quote" }), 0],
  } satisfies NodeSpec,
  horizontal_rule: {
    group: "block",
    attrs: noted(),
    parseDOM: [{ tag: "hr" }],
    toDOM: (node) => ["hr", domAttrs(node, { class: "pages-hr" })],
  } satisfies NodeSpec,
  column: {
    content: "block+",
    isolating: true,
    parseDOM: [{ tag: "div[data-pages-column]" }],
    toDOM: () => ["div", { class: "pages-column", "data-pages-column": "1" }, 0],
  } satisfies NodeSpec,
  column_list: {
    group: "block",
    content: "column column+",
    parseDOM: [{ tag: "div[data-pages-columns]" }],
    toDOM: (node) => ["div", domAttrs(node, { class: "pages-columns", "data-pages-columns": "1" }), 0],
  } satisfies NodeSpec,
  image: {
    group: "block",
    atom: true,
    selectable: true,
    attrs: noted({ src: { default: "" }, alt: { default: "" } }),
    parseDOM: [{
      tag: "img[data-pages-image]",
      priority: 60,
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        const src = safePagesImageSrc(el.getAttribute("src"));
        return { src, alt: el.getAttribute("alt") || imageAlt(src) };
      },
    }],
    toDOM: (node) => {
      const src = safePagesImageSrc(node.attrs.src);
      const alt = String(node.attrs.alt || imageAlt(src) || "图片");
      if (!src) return ["div", domAttrs(node, { class: "pages-image is-broken" }), alt];
      return ["img", domAttrs(node, { class: "pages-image", src, alt, "data-pages-image": "1" })];
    },
  } satisfies NodeSpec,
  bookmark: {
    group: "block",
    atom: true,
    selectable: true,
    attrs: noted({ href: { default: "" }, title: { default: "" } }),
    parseDOM: [{
      tag: "a[data-pages-bookmark]",
      priority: 60,
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        const href = safePagesHref(el.getAttribute("href"));
        return { href, title: el.querySelector("strong")?.textContent || bookmarkLabel(href) };
      },
    }],
    toDOM: (node) => {
      const href = safePagesHref(node.attrs.href);
      const title = String(node.attrs.title || bookmarkLabel(href) || "链接");
      if (!href) return ["div", domAttrs(node, { class: "pages-bookmark" }), title];
      return ["a", domAttrs(node, {
        class: "pages-bookmark",
        href,
        "data-pages-bookmark": "1",
        rel: "noreferrer noopener",
        target: "_blank",
      }), ["strong", title], ["span", href]];
    },
  } satisfies NodeSpec,
  toc: {
    group: "block",
    atom: true,
    selectable: true,
    attrs: noted(),
    parseDOM: [{ tag: "nav[data-pages-toc]" }],
    toDOM: (node) => ["nav", domAttrs(node, { class: "pages-toc", "data-pages-toc": "1" })],
  } satisfies NodeSpec,
  table: {
    content: "table_row+",
    group: "block",
    isolating: true,
    attrs: noted(),
    parseDOM: [{ tag: "table" }],
    toDOM: (node) => ["table", domAttrs(node, { class: "pages-table" }), ["tbody", 0]],
  } satisfies NodeSpec,
  table_row: {
    content: "(table_cell | table_header)+",
    parseDOM: [{ tag: "tr" }],
    toDOM: () => ["tr", 0],
  } satisfies NodeSpec,
  table_cell: {
    content: "paragraph+",
    isolating: true,
    parseDOM: [{ tag: "td" }],
    toDOM: () => ["td", 0],
  } satisfies NodeSpec,
  table_header: {
    content: "paragraph+",
    isolating: true,
    parseDOM: [{ tag: "th" }],
    toDOM: () => ["th", 0],
  } satisfies NodeSpec,
  page_ref: {
    group: "block",
    atom: true,
    selectable: true,
    attrs: noted({ page_id: { default: "" }, title: { default: "" } }),
    parseDOM: [{
      tag: "article[data-pages-ref]",
      getAttrs: (dom) => ({
        page_id: (dom as HTMLElement).getAttribute("data-pages-ref") || "",
        title: (dom as HTMLElement).getAttribute("data-title") || "",
      }),
    }],
    toDOM: (node) => ["article", domAttrs(node, {
      class: "pages-card pages-card--ref",
      "data-pages-ref": String(node.attrs.page_id),
      "data-title": String(node.attrs.title),
    })],
  } satisfies NodeSpec,
  task_card: {
    group: "block",
    atom: true,
    selectable: true,
    attrs: noted({
      title: { default: "" },
      description: { default: "" },
      status: { default: "todo" },
      due: { default: "" },
    }),
    parseDOM: [{
      tag: "article[data-pages-task-card]",
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        return {
          title: el.getAttribute("data-title") || "",
          description: el.getAttribute("data-description") || "",
          status: el.getAttribute("data-status") || "todo",
          due: el.getAttribute("data-due") || "",
        };
      },
    }],
    toDOM: (node) => ["article", domAttrs(node, {
      class: "pages-card pages-card--task",
      "data-pages-task-card": "1",
      "data-title": String(node.attrs.title),
      "data-description": String(node.attrs.description),
      "data-status": String(node.attrs.status),
      "data-due": String(node.attrs.due),
    })],
  } satisfies NodeSpec,
  event_card: {
    group: "block",
    atom: true,
    selectable: true,
    attrs: noted({ title: { default: "" }, at: { default: "" } }),
    parseDOM: [{
      tag: "article[data-pages-event]",
      getAttrs: (dom) => ({
        title: (dom as HTMLElement).getAttribute("data-title") || "",
        at: (dom as HTMLElement).getAttribute("data-at") || "",
      }),
    }],
    toDOM: (node) => ["article", domAttrs(node, {
      class: "pages-card pages-card--event",
      "data-pages-event": "1",
      "data-title": String(node.attrs.title),
      "data-at": String(node.attrs.at),
    })],
  } satisfies NodeSpec,
  calendar: {
    group: "block",
    atom: true,
    selectable: true,
    attrs: noted(),
    parseDOM: [{ tag: "div[data-pages-calendar]" }],
    toDOM: (node) => ["div", domAttrs(node, { class: "pages-calendar", "data-pages-calendar": "1" })],
  } satisfies NodeSpec,
  text: { group: "inline" } satisfies NodeSpec,
  hard_break: {
    inline: true,
    group: "inline",
    selectable: false,
    parseDOM: [{ tag: "br" }],
    toDOM: () => ["br"],
  } satisfies NodeSpec,
  page_mention: {
    inline: true,
    group: "inline",
    atom: true,
    selectable: true,
    attrs: { page_id: { default: "" }, title: { default: "" } },
    parseDOM: [{
      tag: "span[data-pages-mention]",
      getAttrs: (dom) => ({
        page_id: (dom as HTMLElement).getAttribute("data-pages-mention") || "",
        title: (dom as HTMLElement).textContent || "",
      }),
    }],
    toDOM: (node) => ["span", {
      class: "pages-mention",
      "data-pages-mention": String(node.attrs.page_id),
    }, String(node.attrs.title || "")],
  } satisfies NodeSpec,
};

const marks = {
  strong: { parseDOM: [{ tag: "strong" }, { tag: "b" }], toDOM: () => ["strong", 0] } satisfies MarkSpec,
  em: { parseDOM: [{ tag: "em" }, { tag: "i" }], toDOM: () => ["em", 0] } satisfies MarkSpec,
  underline: { parseDOM: [{ tag: "u" }], toDOM: () => ["u", 0] } satisfies MarkSpec,
  strike: { parseDOM: [{ tag: "s" }, { tag: "del" }], toDOM: () => ["s", 0] } satisfies MarkSpec,
  code: { parseDOM: [{ tag: "code" }], toDOM: () => ["code", 0] } satisfies MarkSpec,
  font_color: {
    attrs: { tone: { default: "" } },
    parseDOM: [{
      tag: "span[data-pages-ink]",
      getAttrs: (dom) => ({ tone: safePagesTone((dom as HTMLElement).getAttribute("data-pages-ink")) }),
    }],
    toDOM: (mark) => {
      const tone = safePagesTone(mark.attrs.tone);
      return tone ? ["span", { class: "pages-ink", "data-pages-ink": tone }, 0] : ["span", {}, 0];
    },
  } satisfies MarkSpec,
  highlight: {
    attrs: { tone: { default: "" } },
    parseDOM: [{
      tag: "mark[data-pages-wash]",
      getAttrs: (dom) => ({ tone: safePagesTone((dom as HTMLElement).getAttribute("data-pages-wash")) }),
    }],
    toDOM: (mark) => {
      const tone = safePagesTone(mark.attrs.tone);
      return tone ? ["mark", { class: "pages-wash", "data-pages-wash": tone }, 0] : ["span", {}, 0];
    },
  } satisfies MarkSpec,
  link: {
    attrs: { href: { default: "" } },
    inclusive: false,
    parseDOM: [{
      tag: "a[href]",
      getAttrs: (dom) => ({ href: safePagesHref((dom as HTMLElement).getAttribute("href")) }),
    }],
    toDOM: (mark) => {
      const href = safePagesHref(mark.attrs.href);
      return href
        ? ["a", { class: "pages-link", href, rel: "noreferrer noopener", target: "_blank" }, 0]
        : ["span", { class: "pages-link" }, 0];
    },
  } satisfies MarkSpec,
  comment: {
    attrs: { id: { default: "" }, text: { default: "" } },
    inclusive: false,
    excludes: "",
    parseDOM: [{
      tag: "mark[data-pages-comment]",
      getAttrs: (dom) => ({
        id: (dom as HTMLElement).getAttribute("data-pages-comment") || "",
        text: (dom as HTMLElement).getAttribute("data-comment") || "",
      }),
    }],
    toDOM: (mark) => ["mark", {
      class: "pages-comment",
      "data-pages-comment": String(mark.attrs.id),
      "data-comment": String(mark.attrs.text),
      title: String(mark.attrs.text),
    }, 0],
  } satisfies MarkSpec,
};

export const pagesSchema = new Schema({ nodes, marks });

export function emptyDoc(): unknown {
  return pagesSchema.nodeFromJSON(EMPTY_PAGES_BODY).toJSON();
}

export function nodeFromUnknown(value: unknown) {
  try {
    return pagesSchema.nodeFromJSON(value ?? EMPTY_PAGES_BODY);
  } catch {
    return pagesSchema.nodeFromJSON(EMPTY_PAGES_BODY);
  }
}
