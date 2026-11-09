/** Small DOM helpers the Forms page shares. */
export const icon = (id: string) => `<svg aria-hidden=true><use href="#${id}"></use></svg>`;

export function make<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
}

export { textCell } from "@molis-ai/molis-work-plugin-sdk/browser";

export const firstLine = (value: string | undefined, fallback = "") => {
  const line = String(value || "").trim().split("\n")[0]!.trim();
  return line || fallback;
};

/** Replays the arrival motion on a node that just appeared. */
export const arrive = (node: HTMLElement | null) => {
  if (!node) return node;
  node.classList.remove("is-arriving");
  void node.offsetWidth;
  node.classList.add("is-arriving");
  return node;
};
