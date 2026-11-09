import type { UiFrameLanguage } from "@molis-ai/molis-work-contracts/platform/ui";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import type {} from "./account-transition.js";

/** Native trays only use the language's tag and display attributes; no locale-dependent formatting goes over IPC. */
export type NativeDocumentLanguage = Omit<UiFrameLanguage, "intl">;

declare global {
  var molisWorkPublishNativeLanguage: ((document: number) => void) | undefined;
}

/** The native main document may publish only this finite projection of its committed words. */
export function nativeLanguagePublisher(language: () => NativeDocumentLanguage) {
  const invoke = (globalThis as typeof globalThis & {
    __TAURI__?: { core?: { invoke(name: string, input: Record<string, unknown>): Promise<void> } };
  }).__TAURI__?.core?.invoke;
  let generation = -1, sequence = 0, pending = Promise.resolve();
  const alive = () => !globalThis.molisWorkAccountTransition?.preparing;
  const publish = () => {
    if (generation < 0 || !alive() || !invoke) return;
    const document = generation, turn = ++sequence;
    const projection = { language: language(), words: {
      loading: t.text("workbench.native-tray.loading"), loading_tip: t.text("workbench.native-tray.loading-tip"),
      disconnected: t.text("workbench.native-tray.disconnected"), disconnected_tip: t.text("workbench.native-tray.disconnected-tip"),
      syncing: t.text("workbench.native-tray.syncing"), syncing_tip: t.text("workbench.native-tray.syncing-tip"),
      open_goal: t.text("workbench.native-tray.open-goal"), quit: t.text("workbench.native-tray.quit"),
      quit_keep_service: t.text("workbench.native-tray.quit-keep-service"), restore_appearance: t.text("workbench.native-tray.restore-appearance"),
    } };
    pending = pending.then(() => {
      if (generation === document && turn === sequence && alive()) return invoke("capsule_set_locale", { document, sequence: turn, projection });
    }).catch(() => undefined);
  };
  if (invoke && window.top === window && location.origin === "http://127.0.0.1:4173" && location.pathname !== "/desktop/capsule") {
    globalThis.molisWorkPublishNativeLanguage = document => {
      if (!Number.isSafeInteger(document) || document <= generation) return;
      generation = document; sequence = 0; publish();
    };
    addEventListener("pagehide", () => { sequence += 1; });
  }
  return publish;
}
