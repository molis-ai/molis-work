import type { UiPageTerminal, UiTerminalMountOptions, UiTerminalView } from "@molis-ai/molis-work-contracts/platform/ui";
import type { FrameScope } from "./types.js";

declare global {
  var molisTerminalRenderer: ((element: HTMLElement, options: UiTerminalMountOptions,
    connection: Pick<UiPageTerminal, "send" | "listen">) => Promise<UiTerminalView>) | undefined;
}
let loading: Promise<void> | undefined;

export async function mountPageTerminal(element: unknown, options: UiTerminalMountOptions, connection: UiPageTerminal,
  scope: FrameScope, origin: string): Promise<UiTerminalView> {
  scope.assertCurrent();
  if (!(element instanceof HTMLElement) || !element.isConnected) throw new Error("Terminal needs a mounted element");
  if (!globalThis.molisTerminalRenderer) await (loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script"); script.src = new URL("/desktop/pty-client.js", origin).href;
    script.onload = () => resolve(); script.onerror = () => { loading = undefined; script.remove(); reject(new Error("Cannot load terminal")); };
    document.head.append(script);
  }));
  scope.assertCurrent();
  if (!globalThis.molisTerminalRenderer) throw new Error("Terminal renderer unavailable");
  const view = await globalThis.molisTerminalRenderer(element, options, connection);
  if (!scope.alive) { view.dispose(); scope.assertCurrent(); }
  const dispose = scope.own(view.dispose);
  return { focus: view.focus, fit: view.fit, dispose };
}
