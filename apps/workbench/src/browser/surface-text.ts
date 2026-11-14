import type { UiLocalePack, UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { SurfaceHomeText } from "@molis-ai/molis-work-design-system";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";

declare global {
  /** The protected home's word grants (surface-composition §14.6); the language entry keeps their packs with the realm's own. */
  var molisWorkSurfaceText: {
    install(route: string, text: readonly SurfaceHomeText[], signal: AbortSignal): Promise<void>;
    /** The home released these grants (left, replaced or refused): they are no longer read, here or by a later switch. */
    release(refs: readonly string[]): void;
  } | undefined;
}

interface Answer { readonly texts?: readonly { ref: string; owner: string; packs: readonly UiLocalePack[] }[] }

/** One language's words for these grants, each from its own source; one owner's sources that disagree on a key are refused, never mixed. */
export async function readSurfaceText(request: UiRequest, route: string, locale: string, text: readonly SurfaceHomeText[], signal: AbortSignal) {
  const parameters = new URLSearchParams({ locale });
  for (const item of text) parameters.append("surface_text", item.ref);
  const answer = await request<Answer>(route + "?" + parameters, { control: true, signal });
  const packs = new Map<string, UiLocalePack>();
  for (const item of text) {
    const found = answer.texts?.filter(row => row.ref === item.ref) ?? [];
    if (found.length !== 1 || found[0]!.owner !== item.owner || found[0]!.packs.some(pack => pack.owner !== item.owner)) throw new Error(t.text("workbench.language.window-failed"));
    for (const pack of found[0]!.packs) {
      const id = pack.owner + "/" + pack.locale, prior = packs.get(id);
      if (prior && Object.entries(pack.messages).some(([key, value]) => Object.hasOwn(prior.messages, key) && prior.messages[key] !== value)) {
        throw new Error(t.text("workbench.language.window-failed"));
      }
      packs.set(id, prior ? { ...prior, messages: { ...prior.messages, ...pack.messages } } : pack);
    }
  }
  return [...packs.values()];
}

/**
 * What the language entry holds of the home's words: the grants and the packs read for them in the displayed language. A switch reads the
 * next language for the same grants and applies with everything else; nothing is composed again. The request client is read at each
 * use, not here: the language asset runs before the page installs it.
 */
export function surfaceTextState(request: () => UiRequest, displayed: () => string, reselect: () => void) {
  let current: { route: string; text: readonly SurfaceHomeText[]; packs: readonly UiLocalePack[] } = { route: "", text: [], packs: [] };
  globalThis.molisWorkSurfaceText = { async install(route, text, signal) {
    const packs = text.length ? await readSurfaceText(request(), route, displayed(), text, signal) : [];
    signal.throwIfAborted();
    current = { route, text, packs }; reselect();
  }, release(refs) {
    if (!current.text.some(item => refs.includes(item.ref))) return;
    current = { route: "", text: [], packs: [] }; reselect();
  } };
  return {
    packs: () => current.packs,
    async prepare(locale: string, signal: AbortSignal) {
      const held = current;
      if (!held.text.length) return undefined;
      const packs = await readSurfaceText(request(), held.route, locale, held.text, signal);
      return { packs, apply() { if (current === held) current = { ...held, packs }; } };
    },
  };
}
