import type { UiPageFiles } from "@molis-ai/molis-work-contracts/platform/ui";
import type { FrameDown, FrameScope, FrameUp } from "./types.js";
import { childFilePicker } from "./file-picker-child.js";

export function childNativeFiles(port: MessagePort, scope: FrameScope): NonNullable<UiPageFiles["nativeFiles"]> {
  let sequence = 0;
  const pending = new Map<number, { resolve(): void; reject(error: Error): void }>();
  scope.own(() => { for (const entry of pending.values()) entry.reject(new Error("View closed")); pending.clear(); });
  port.addEventListener("message", (event: MessageEvent<FrameDown>) => {
    if (event.data.type !== "native-files-done") return;
    const entry = pending.get(event.data.id); pending.delete(event.data.id);
    if (event.data.error) entry?.reject(new Error(event.data.error)); else entry?.resolve();
  });
  const send = (operation: "copy" | "drag" | "open", paths: readonly string[], itemIds?: readonly string[]) => new Promise<void>((resolve, reject) => {
    if (!scope.alive) { reject(new Error("View closed")); return; }
    const id = ++sequence; pending.set(id, { resolve, reject });
    port.postMessage({ type: "native-files", id, operation, paths, itemIds } satisfies FrameUp);
  });
  return { copy: paths => send("copy", paths), drag: (paths, ids) => send("drag", paths, ids), open: path => send("open", [path]), pick: childFilePicker(port, scope) };
}

export const nativeFileInvoke = () => (globalThis as typeof globalThis & {
  __TAURI__?: { core?: { invoke<T = void>(name: string, input: Record<string, unknown>): Promise<T> } };
}).__TAURI__?.core?.invoke;

/**
 * IPC stays in the trusted shell. The child can name only relative files owned by its active installation, and the window
 * never holds a file path: the shell asks the Host for the files itself, with the route and page id given here (PG-113).
 */
export async function handoffPageFiles(port: MessagePort, scope: FrameScope, pageId: string, route: (path: string) => string,
  message: Extract<FrameUp, { type: "native-files" }>): Promise<void> {
  try {
    const invoke = nativeFileInvoke();
    if (!invoke || !navigator.userActivation.isActive || !["copy", "drag", "open"].includes(message.operation)) throw new Error("请重新点击或拖动文件");
    if (message.operation === "open" && (!Array.isArray(message.paths) || message.paths.length !== 1)) throw new Error("请选择一份文件");
    if (message.itemIds !== undefined && (!Array.isArray(message.itemIds) || message.itemIds.length > 100
      || message.itemIds.some(id => typeof id !== "string" || id.length > 200))) throw new Error("文件标识无效");
    scope.assertCurrent();
    const input = { endpoint: route("/api/host/plugin-page-files"), pageId, paths: message.paths };
    if (message.operation === "open") await invoke("files_open", input);
    else await invoke(message.operation === "copy" ? "files_copy" : "files_drag_out", { ...input, itemIds: message.itemIds });
    if (scope.alive) port.postMessage({ type: "native-files-done", id: message.id } satisfies FrameDown);
  } catch (error) {
    if (scope.alive) port.postMessage({ type: "native-files-done", id: message.id, error: error instanceof Error ? error.message : String(error) } satisfies FrameDown);
  }
}
