import { Node } from "prosemirror-model";
import { bookmarkLabel, safePagesBookmarkTitle, safePagesHref, safePagesImageSrc } from "./link.js";
import { safePagesLanguage } from "./code-language.js";

function inlineToMarkdown(node: Node): string {
  if (node.isText) {
    let text = node.text ?? "";
    const names = new Set(node.marks.map((mark) => mark.type.name));
    if (names.has("code")) return `\`${text.replaceAll("`", "\\`")}\``;
    if (names.has("strike")) text = `~~${text}~~`;
    if (names.has("strong") && names.has("em")) text = `***${text}***`;
    else if (names.has("strong")) text = `**${text}**`;
    else if (names.has("em")) text = `*${text}*`;
    if (names.has("underline")) text = `<u>${text}</u>`;
    const link = node.marks.find((mark) => mark.type.name === "link");
    if (link) text = `[${text}](${String(link.attrs.href ?? "")})`;
    return text;
  }
  if (node.type.name === "hard_break") return "\n";
  let out = "";
  node.forEach((child) => {
    out += inlineToMarkdown(child);
  });
  return out;
}

function indentLines(text: string, indent: number): string {
  const pad = "  ".repeat(indent);
  return text.split("\n").map((line) => (line ? pad + line : line)).join("\n");
}

function listToMarkdown(node: Node, indent: number): string {
  const lines: string[] = [];
  node.forEach((item, _offset, index) => {
    const marker = node.type.name === "ordered_list"
      ? `${Number(node.attrs.order || 1) + index}. `
      : node.type.name === "task_list"
        ? `- [${item.attrs.checked ? "x" : " "}] `
        : "- ";
    const first = item.firstChild ? inlineToMarkdown(item.firstChild) : "";
    lines.push(`${"  ".repeat(indent)}${marker}${first}`);
    for (let child = 1; child < item.childCount; child += 1) {
      const nested = blockToMarkdown(item.child(child), indent + 1);
      if (nested) lines.push(nested);
    }
  });
  return lines.join("\n");
}

function blockToMarkdown(node: Node, indent: number): string {
  const name = node.type.name;
  if (name === "heading") return indentLines(`${"#".repeat(Number(node.attrs.level) || 1)} ${inlineToMarkdown(node)}`, indent);
  if (name === "paragraph") return indentLines(inlineToMarkdown(node), indent);
  if (name === "bullet_list" || name === "ordered_list" || name === "task_list") return listToMarkdown(node, indent);
  if (name === "blockquote" || name === "callout") {
    const inner = nodesToMarkdown(childrenOf(node));
    return inner.split("\n").map((line) => `${"  ".repeat(indent)}> ${line}`).join("\n");
  }
  if (name === "code_block") {
    const lang = safePagesLanguage(node.attrs.language);
    return indentLines(`\`\`\`${lang}\n${node.textContent}\n\`\`\``, indent);
  }
  if (name === "horizontal_rule") return indentLines("---", indent);
  if (name === "image") {
    const src = safePagesImageSrc(node.attrs.src);
    const alt = String(node.attrs.alt || "图片");
    return indentLines(!src || src.startsWith("data:") ? `![${alt}]` : `![${alt}](${src})`, indent);
  }
  if (name === "bookmark") {
    const href = safePagesHref(node.attrs.href);
    const title = safePagesBookmarkTitle(node.attrs.title) || bookmarkLabel(href) || href || "链接";
    return indentLines(href ? `[${title}](${href})` : title, indent);
  }
  if (name === "table") return indentLines(tableToMarkdown(node), indent);
  if (name === "column_list" || name === "column" || name === "toggle") return nodesToMarkdown(childrenOf(node));
  return indentLines(node.textContent, indent);
}

function childrenOf(node: Node): Node[] {
  const children: Node[] = [];
  node.forEach((child) => children.push(child));
  return children;
}

function tableToMarkdown(node: Node): string {
  if (!node.childCount || !node.child(0).childCount) return "";
  const rows: string[] = [];
  node.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) => {
      const text = cell.firstChild ? inlineToMarkdown(cell.firstChild) : cell.textContent;
      cells.push(text.replaceAll("|", "\\|").replaceAll("\n", " "));
    });
    rows.push(`| ${cells.join(" | ")} |`);
  });
  const sep = `| ${Array.from({ length: node.child(0).childCount }, () => "---").join(" | ")} |`;
  return [rows[0], sep, ...rows.slice(1)].join("\n");
}

/** Plain text for the clipboard. Headings, lists, tasks, and code keep their markers. */
export function nodesToMarkdown(nodes: readonly Node[]): string {
  return nodes.map((node) => blockToMarkdown(node, 0)).filter((text) => text.trim()).join("\n\n");
}
