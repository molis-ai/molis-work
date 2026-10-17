/** Small DOM helpers the Forms page shares. */
export function make<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
}

export const textCell = (className: string, text: string) => { const node = make("span", className, text); node.title = text; return node; };

export const firstLine = (value: string | undefined, fallback = "") => {
  const line = String(value || "").trim().split("\n")[0]!.trim();
  return line || fallback;
};

export const whenOf = (value: string | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, sameYear ? { month: "short", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" });
};

/** Replays the arrival motion on a node that just appeared. */
export const arrive = (node: HTMLElement | null) => {
  if (!node) return node;
  node.classList.remove("is-arriving");
  void node.offsetWidth;
  node.classList.add("is-arriving");
  return node;
};

export const download = (name: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  URL.revokeObjectURL(url);
};
