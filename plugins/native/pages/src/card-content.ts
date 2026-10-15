import type { DOMOutputSpec, Node } from "prosemirror-model";

export function taskStatusText(status: string): string {
  return status === "doing" ? "进行中" : status === "done" ? "完成" : "待办";
}

/** The visible facts of an atomic card also belong in portable text and static HTML. */
export function cardText(node: Node): string[] {
  if (node.type.name === "page_ref") return [String(node.attrs.title || "文档引用")];
  if (node.type.name === "task_card") return [String(node.attrs.title || "任务"),
    [taskStatusText(String(node.attrs.status)), String(node.attrs.due || "")].filter(Boolean).join(" · "),
    String(node.attrs.description || "")].filter(Boolean);
  if (node.type.name === "event_card") return [String(node.attrs.title || "日程"), String(node.attrs.at || "没有日期")];
  return [];
}

export function cardDom(node: Node, attrs: Record<string, string>): DOMOutputSpec {
  const [title, ...details] = cardText(node);
  return ["article", attrs, ["span", { class: "pages-card-mark", "aria-hidden": "true" }],
    ["span", { class: "pages-card-body" }, ["strong", title || ""], ...details.map(text => ["p", text] as DOMOutputSpec)]];
}

/** Index widgets are derived from this fixed document, rather than from the live editor's NodeViews. */
export function fillStaticIndexes(root: HTMLElement, doc: Node): void {
  const headings: string[] = [], dated: string[] = [];
  doc.descendants(node => {
    if (node.type.name === "heading") headings.push(node.textContent);
    const at = node.type.name === "task_card" ? node.attrs.due : node.type.name === "event_card" ? node.attrs.at : "";
    if (at) dated.push(`${String(at)} · ${String(node.attrs.title || "日程")}`);
  });
  const fill = (selector: string, rows: readonly string[]) => root.querySelectorAll(selector).forEach(element => {
    const list = root.ownerDocument.createElement("ul");
    rows.forEach(text => { const item = root.ownerDocument.createElement("li"); item.textContent = text; list.append(item); });
    element.replaceChildren(list);
  });
  fill("[data-pages-toc]", headings);
  fill("[data-pages-calendar]", dated);
}
