const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const esc = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);

/** An element the server drew; the page cannot work without it. */
export function required<T extends Element>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Issue page is missing ${selector}`);
  return node;
}

/** What a failed `catch` carried, as a message (a thrown non-Error becomes its text). */
export const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
export const isAbort = (error: unknown): boolean => error instanceof Error && error.name === "AbortError";
export const statusOf = (error: unknown): number | undefined => (error as { status?: number } | null)?.status;
export const codeOf = (error: unknown): string | undefined => (error as { code?: string } | null)?.code;
