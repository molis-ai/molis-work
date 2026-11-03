import type { FrameDown, FrameScope, FrameUp } from "./types.js";

export function childFilePicker(port: MessagePort, scope: FrameScope) {
  let sequence = 0;
  const pending = new Map<number, { resolve(files: File[]): void; reject(error: Error): void }>();
  scope.own(() => { for (const entry of pending.values()) entry.reject(new Error("View closed")); pending.clear(); });
  port.addEventListener("message", (event: MessageEvent<FrameDown>) => {
    if (event.data.type !== "native-file-picked") return;
    const { id, file, error } = event.data, entry = pending.get(id); pending.delete(id);
    if (error) entry?.reject(new Error(error));
    else entry?.resolve(file ? [new File([Uint8Array.from(atob(file.bytes_base64), char => char.charCodeAt(0))], file.name)] : []);
  });
  return (query: string) => new Promise<File[]>((resolve, reject) => {
    if (!scope.alive) { reject(new Error("View closed")); return; }
    const id = ++sequence; pending.set(id, { resolve, reject });
    port.postMessage({ type: "native-file-pick", id, query } satisfies FrameUp);
  });
}
