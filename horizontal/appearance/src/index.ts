import { ActionError, bindActionHandler, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { APPEARANCE_PROVIDER_ID, appearanceSelectionActions, type UiAppearanceSelection } from "@molis-ai/molis-work-contracts/platform/ui";
import { builtinAppearance } from "./builtins.js";
import { createLocaleMemory, type AppearanceLocaleOptions } from "./locale-memory.js";
import { createSelection } from "./selection.js";

export { UI_LOCALE_FILE, UI_LOCALE_RELATIVE_PATH, type AppearanceLocaleOptions } from "./locale-memory.js";
export { APPEARANCE_STATE_FILE, APPEARANCE_STATE_PATH } from "./state.js";

/** The checked installation supplies the same definitions to the resource endpoint and to each Home. */
export const installedAppearance = (selection: UiAppearanceSelection) => builtinAppearance().resolve(selection).appearance;
export const installedAppearanceChoices = () => builtinAppearance().builtins;

export interface AppearanceOptions<Locale extends string> {
  readonly locale: AppearanceLocaleOptions<Locale>;
  readonly listenerFailed: (error: unknown) => void;
}

export function createAppearanceOwner<Locale extends string>(home: string, options: AppearanceOptions<Locale>) {
  let open = true;
  const listeners = new Set<(revision: number) => void>();
  const assertOpen = () => {
    if (!open) throw new ActionError("actions.host_closed", "Home 外观服务已关闭。");
  };
  const selection = createSelection(home, assertOpen, revision => {
    for (const listener of listeners) {
      try { listener(revision); } catch (error) { options.listenerFailed(error); }
    }
  });
  const locale = createLocaleMemory(home, options.locale);

  return {
    locale: {
      read: () => locale.read(),
      lastUsed: () => locale.lastUsed(),
      remember: (value: unknown) => { if (open) locale.remember(value); },
    },
    current: selection.current,
    snapshot: selection.snapshot,
    preview: selection.preview,
    subscribe(listener: (revision: number) => void): () => void {
      assertOpen();
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    provider(): ActionProviderRegistration {
      const { get, apply, undo } = appearanceSelectionActions;
      return {
        provider: { provider_id: APPEARANCE_PROVIDER_ID, kind: "system", title: "外观" },
        definitions: [get, apply, undo],
        handlers: [
          bindActionHandler(get, (input, caller) => selection.get(caller.actor_id, input.request_id)),
          bindActionHandler(apply, (input, caller) => selection.apply(input, caller)),
          bindActionHandler(undo, (input, caller) => selection.undo(input, caller)),
        ],
      };
    },
    close(): void { open = false; listeners.clear(); },
  };
}

export type AppearanceOwner<Locale extends string> = ReturnType<typeof createAppearanceOwner<Locale>>;
