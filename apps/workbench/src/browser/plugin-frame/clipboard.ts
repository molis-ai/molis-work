import type { FrameDown, FrameScope, FrameUp } from "./types.js";

export function childCopy(port: MessagePort, scope: FrameScope): (text: string) => Promise<void> {
  let sequence = 0;
  const pending = new Map<number, { resolve(): void; reject(error: Error): void }>();
  scope.own(() => { for (const entry of pending.values()) entry.reject(new Error("View closed")); pending.clear(); });
  port.addEventListener("message", (event: MessageEvent<FrameDown>) => {
    if (event.data.type !== "copied") return;
    const entry = pending.get(event.data.id); if (!entry) return;
    pending.delete(event.data.id);
    if (event.data.error) entry.reject(new Error(event.data.error)); else entry.resolve();
  });
  return text => new Promise<void>((resolve, reject) => {
    if (!scope.alive) { reject(new Error("View closed")); return; }
    const id = ++sequence; pending.set(id, { resolve, reject }); port.postMessage({ type: "copy", id, text } satisfies FrameUp);
  });
}

/** A page can copy text after an actual interaction; it never receives clipboard read access. */
export async function copyFromPage(port: MessagePort, message: Extract<FrameUp, { type: "copy" }>): Promise<void> {
  try {
    if (typeof message.text !== "string" || message.text.length > 2_000_000 || !navigator.userActivation.isActive) throw new Error("请点击复制按钮后重试");
    await navigator.clipboard.writeText(message.text);
    port.postMessage({ type: "copied", id: message.id } satisfies FrameDown);
  } catch (error) { port.postMessage({ type: "copied", id: message.id, error: error instanceof Error ? error.message : "复制失败" } satisfies FrameDown); }
}
