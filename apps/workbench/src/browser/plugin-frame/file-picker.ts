import { nativeFileInvoke } from "./native-files.js";
import type { FrameDown, FrameScope, FrameUp, Translate } from "./types.js";

/** Results and absolute paths stay in the trusted document. Only a real click here releases the selected bytes. */
export function pageFilePicker(port: MessagePort, scope: FrameScope, frame: HTMLIFrameElement, pageId: string, route: (path: string) => string, translate: Translate) {
  let close = () => {};
  scope.own(() => close());
  scope.whenVisible(() => () => close());
  const check = async () => {
    await molisWorkRequest(route("/api/host/plugin-page-check"), { body: {}, headers: { "x-molis-plugin-page": pageId }, scope });
    scope.assertCurrent();
    if (!scope.visible) throw new Error("View hidden");
  };
  return async (message: Extract<FrameUp, { type: "native-file-pick" }>): Promise<void> => {
    close();
    const lifetime = new AbortController();
    let popup: HTMLDivElement | undefined;
    const finish = (result: Pick<Extract<FrameDown, { type: "native-file-picked" }>, "file" | "error"> = {}) => {
      if (lifetime.signal.aborted) return;
      lifetime.abort(); popup?.remove();
      if (scope.alive) port.postMessage({ type: "native-file-picked", id: message.id, ...result } satisfies FrameDown);
    };
    close = () => finish();
    try {
      const invoke = nativeFileInvoke();
      if (!invoke || !navigator.userActivation.isActive || typeof message.query !== "string" || message.query.length > 200) throw new Error("请重新点击或拖动文件");
      if (message.query.trim().length < 2) { finish(); return; }
      await check();
      const found = await invoke<Array<{ name: string; path: string }>>("shelf_find_files", { query: message.query.trim() });
      await check();
      if (lifetime.signal.aborted) return;
      if (!found.length) { finish(); return; }
      popup = document.createElement("div"); popup.dataset.nativeFilePicker = ""; popup.setAttribute("role", "dialog");
      popup.setAttribute("aria-label", translate("添加本机文件"));
      const box = frame.getBoundingClientRect();
      popup.style.cssText = `position:fixed;z-index:10000;left:${Math.max(8, box.left + 12)}px;top:${Math.max(8, box.top + 44)}px;max-width:calc(100vw - 32px);width:320px;max-height:${Math.min(280, Math.max(120, box.height - 80))}px;overflow:auto;padding:10px;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:12px;box-shadow:0 8px 32px #0003`;
      const label = document.createElement("strong"); label.textContent = translate("添加本机文件"); popup.append(label);
      const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = translate("关闭"); cancel.dataset.nativeFileCancel = "";
      cancel.style.cssText = "float:right"; cancel.addEventListener("click", () => finish()); popup.append(cancel);
      for (const file of found.slice(0, 12)) {
        const button = document.createElement("button"); button.type = "button"; button.textContent = file.name; button.dataset.nativeFileChoice = "";
        button.style.cssText = "display:block;width:100%;margin-top:6px;padding:8px;text-align:left;overflow-wrap:anywhere";
        button.addEventListener("click", event => {
          if (!event.isTrusted || lifetime.signal.aborted) return;
          for (const control of popup?.querySelectorAll<HTMLButtonElement>("[data-native-file-choice]") ?? []) control.disabled = true;
          void (async () => {
            await check();
            lifetime.signal.throwIfAborted();
            const selected = await invoke<{ name: string; bytes_base64: string }>("platform_read_selected_file", { path: file.path });
            await check(); lifetime.signal.throwIfAborted(); finish({ file: selected });
          })().catch(error => finish({ error: error instanceof Error ? error.message : String(error) }));
        });
        popup.append(button);
      }
      document.addEventListener("keydown", event => { if (event.key === "Escape") finish(); }, { signal: lifetime.signal });
      document.body.append(popup);
    } catch (error) { finish({ error: error instanceof Error ? error.message : String(error) }); }
  };
}
